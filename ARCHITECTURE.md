# Universal Agent Runtime Architecture

## Overview

This document describes the architecture of Mission Control's agent runtime system — a provider-neutral abstraction layer that allows Mission Control to orchestrate any coding agent on any model through any execution environment.

## Problem Statement

Previously, Mission Control was tightly coupled to Claude Code:

```
Task → Daemon → claude -p → Agent → Workspace
```

This made it impossible to:
- Use local models (Ollama, Llama2, DeepSeek)
- Integrate other agents (OpenCode, Codex, Cursor, Aider)
- Support multiple models for different task types
- Control execution costs through runtime selection
- Achieve data privacy (all work goes to cloud)

## Solution: Agent Runtime Abstraction

```
Task → Daemon → AgentRuntime → Various Agents/Models → Workspace
                    ↓
         ┌──────────┼──────────┐
         ↓          ↓          ↓
    Claude Code  Ollama  Command Runtime
         ↓          ↓          ↓
       Cloud    Local GPU   Any Executable
```

The key insight: **Mission Control owns orchestration. Runtimes own execution. Models are interchangeable.**

## Core Concepts

### 1. AgentRuntime Interface

All runtimes implement a simple interface:

```typescript
interface AgentRuntime {
  id: string;
  name: string;
  capabilities: RuntimeCapabilities;
  
  discover(): Promise<RuntimeDiscovery>;
  execute(request: AgentExecutionRequest): Promise<AgentExecution>;
  stop(runId: string): Promise<void>;
  resume?(request: AgentResumeRequest): Promise<AgentExecution>;
}
```

Every runtime:
- **Declares capabilities** (what it can do)
- **Emits normalized events** (started, tool_call, completed, etc.)
- **Returns normalized usage** (tokens, duration, cost)
- **Respects execution permissions** (filesystem, shell, network scope)

### 2. Runtime Implementations

#### Claude Code Runtime
- Wraps existing `claude -p` functionality
- Fully backward compatible
- Preserves all existing behavior (streaming, caching, resumption)
- Supports tool calling, structured output
- Cost: ~$0.003/1K input tokens

#### Ollama Runtime
- Connects to local Ollama instance
- Supports any model installed locally
- Zero API cost, privacy-first
- Tool calling depends on model
- No resumption yet (future enhancement)

#### Command Runtime
- Executes any local binary
- Placeholder args for prompt/workspace
- Supports OpenCode, Codex, Aider, custom scripts
- Minimal dependency on specific agent

### 3. Event Streaming

All runtimes emit normalized events:

```typescript
type AgentEvent =
  | { type: "started"; data: { pid: number } }
  | { type: "thinking"; data: { content: string } }
  | { type: "tool_call"; data: { toolName, toolUse } }
  | { type: "tool_result"; data: { success, result } }
  | { type: "output"; data: { content: string } }
  | { type: "progress"; data: { ... } }
  | { type: "completed"; data: { exitCode, output } }
  | { type: "failed"; data: { error } }
  | { type: "stopped"; data: { ... } }
```

**Benefits:**
- Mission Control can monitor any runtime uniformly
- UI can stream live progress
- Activity logging is runtime-agnostic
- Token/cost tracking works across providers

### 4. Configuration Resolution

Runtime configuration follows a clear precedence:

```
Task Config
  ↓ (if not set)
Agent Config
  ↓ (if not set)
Project Config
  ↓ (if not set)
Workspace Default
  ↓ (if not set)
"claude-code" (built-in default)
```

Example chain:
```
Task: { runtime: { type: "ollama", model: "32b" } }
Agent: { runtime: { type: "claude-code" } }
Project: (not set)
Workspace: { defaultRuntime: "claude-code" }

Result: Use 32B Ollama (task takes precedence)
```

### 5. Fallback Chains

Enable graceful degradation:

```json
{
  "type": "ollama",
  "model": "qwen2.5-coder:32b",
  "fallback": {
    "type": "ollama",
    "model": "qwen2.5-coder:14b",
    "fallback": {
      "type": "claude-code"
    }
  }
}
```

Execution sequence:
1. Try 32B Ollama
2. If unavailable → Try 14B Ollama
3. If unavailable → Try Claude Code
4. If all fail → Error with full chain info

### 6. Execution Permissions

Every execution receives a permissions object:

```typescript
{
  filesystem: "workspace" | "none";
  shell: boolean;
  network: boolean;
  fieldOps: boolean;
  secrets: boolean;
}
```

Runtimes enforce these boundaries:
- `filesystem: "workspace"` → Only read/write in `workingDirectory`
- `shell: false` → No command execution
- `network: false` → No HTTP/fetch calls
- `fieldOps: false` → No Field Ops mission execution
- `secrets: false` → No vault credential access

This is essential because:
- Local Ollama models shouldn't execute Field Ops
- Research tasks don't need shell access
- Privacy-sensitive work shouldn't touch secrets

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│              Mission Control                            │
│  (Orchestration, State, Inbox, Skills, Missions)       │
└──────────────────┬──────────────────────────────────────┘
                   │
         ┌─────────┴──────────┐
         │                    │
    ┌────▼──────┐      ┌──────▼────┐
    │  Daemon   │      │   API     │
    │(Polling)  │      │ (REST)    │
    └────┬──────┘      └────┬──────┘
         │                  │
         └────────┬─────────┘
                  │
           ┌──────▼──────┐
           │  Runtime    │
           │ Resolution  │
           │  & Registry │
           └──────┬──────┘
                  │
    ┌─────────────┼─────────────┐
    ▼             ▼             ▼
┌────────────┐ ┌────────────┐ ┌─────────────┐
│  Claude    │ │  Ollama    │ │  Command    │
│   Code     │ │  Runtime   │ │  Runtime    │
│ Adapter    │ │            │ │             │
└────┬───────┘ └────┬───────┘ └─────┬───────┘
     │              │               │
     ▼              ▼               ▼
┌──────────┐  ┌──────────┐  ┌─────────────┐
│ Claude   │  │ Ollama   │  │ OpenCode    │
│(Cloud)   │  │(Local)   │  │ / Codex     │
│          │  │          │  │ / Custom    │
└──────────┘  └──────────┘  └─────────────┘
     │              │               │
     └──────────────┼───────────────┘
                    │
             ┌──────▼────────┐
             │   Workspace   │
             │  (git, files) │
             └───────────────┘
```

## Data Flow

### Task Execution

1. **Daemon polls tasks**
   ```
   tasks.json → find "not-started" tasks
   ```

2. **Daemon resolves runtime**
   ```
   task.runtime || agent.runtime || project.runtime || workspace.default
   ```

3. **Daemon creates execution request**
   ```typescript
   {
     runId: "run_xyz",
     prompt: buildPrompt(task, skills, context),
     workingDirectory: workspace,
     permissions: {
       filesystem: "workspace",
       shell: true,
       network: false,
       fieldOps: false,
       secrets: false
     }
   }
   ```

4. **Daemon calls runtime.execute()**
   ```
   Runtime spawns process and streams events
   ```

5. **Events flow back to Mission Control**
   ```
   started → progress → completed/failed
   ```

6. **Daemon records results**
   ```
   Update task.kanban = "done"
   Log activity event
   Post message to inbox
   ```

## Configuration Files

### Workspace Level: `data/runtime-config.json`

```json
{
  "defaultRuntime": "claude-code",
  
  "runtimes": {
    "claude-code": {
      "type": "claude-code"
    },
    
    "ollama-main": {
      "type": "ollama",
      "baseUrl": "http://127.0.0.1:11434",
      "model": "qwen2.5-coder:32b"
    },
    
    "opencode": {
      "type": "command",
      "command": "opencode",
      "args": ["run", "--format", "json"]
    }
  },
  
  "fallbackChain": ["ollama-main", "claude-code"]
}
```

### Agent Level: `data/agents.json`

```json
{
  "agents": [
    {
      "id": "developer",
      "name": "Developer",
      
      "runtime": {
        "type": "ollama",
        "model": "qwen2.5-coder:32b"
      },
      
      "instructions": "...",
      "capabilities": ["code", "testing"]
    }
  ]
}
```

### Task Level: Inside task object

```json
{
  "id": "task_123",
  "title": "Critical bug fix",
  "assignedTo": "developer",
  
  "runtime": {
    "type": "claude-code"
  }
}
```

## Implementation Details

### Runtime Discovery

Each runtime can report its availability:

```typescript
runtime.discover() → RuntimeDiscovery
{
  name: "Claude Code",
  status: "available" | "unavailable" | "error",
  version?: "1.2.3",
  error?: "description"
}
```

Claude Code discovers by:
1. Checking configured `claudeBinaryPath`
2. Searching common npm global paths
3. Checking PATH via `which claude`
4. Running `claude --version` to verify

Ollama discovers by:
1. Attempting connection to baseUrl
2. Calling `/api/tags` to list models
3. Returning model details

Command runtime discovers by:
1. Checking PATH for executable
2. Running `command --version`

### Event Normalization

Each runtime's native output is parsed into standard events:

**Claude Code** parses:
```
Claude output → JSON parse → usage + output → AgentEvent[]
```

**Ollama** parses:
```
Ollama API response → extract tokens + response → AgentEvent[]
```

**Command** parses:
```
stdout/stderr → lines → AgentEvent[]
```

### Usage Normalization

Each runtime reports usage differently:

**Claude Code:**
```
total_cost_usd: 0.00123
usage: {
  input_tokens: 1000,
  output_tokens: 234,
  cache_read_input_tokens: 100,
  cache_creation_input_tokens: 0
}
```

**Ollama:**
```
prompt_eval_count: 1000
eval_count: 234
prompt_eval_duration: 500000000 (ns)
eval_duration: 300000000 (ns)
```

**Normalized:**
```typescript
{
  inputTokens: 1000,
  outputTokens: 234,
  cacheReadTokens: 100,
  cacheWriteTokens: 0,
  durationMs: 800,
  estimatedCostUsd: 0.00123,
  providerMetadata: { ... }
}
```

## Security Model

### Execution Boundaries

Each runtime execution respects permissions:

```typescript
if (permissions.filesystem !== "workspace") {
  // Can't touch files
}

if (!permissions.shell) {
  // Can't execute commands
}

if (!permissions.network) {
  // Can't make HTTP calls
}

if (!permissions.fieldOps) {
  // Can't execute Field Ops missions
}

if (!permissions.secrets) {
  // Can't access vault
}
```

### Process Isolation

**Claude Code:**
- Runs in separate process (`claude -p`)
- Safe environment (minimal inherited vars)
- Terminated on timeout with `SIGTERM` then `SIGKILL`
- Output sanitized to remove credentials

**Ollama:**
- Runs as local API server
- Models execute within Ollama sandbox
- No process spawning needed
- Token-based access control planned

**Command:**
- Spawned in child process
- Runs with safe environment
- Stdout/stderr captured and sanitized
- Timeout enforcement identical to Claude

## Testing Strategy

### Unit Tests

- Runtime registration and discovery
- Configuration resolution and precedence
- Event normalization
- Usage aggregation
- Permission enforcement

### Integration Tests

- End-to-end task execution
- Claude Code with actual `claude -p`
- Ollama with real server (mocked)
- Command runtime with echo/sleep

### Performance Tests

- Startup latency
- Event throughput
- Memory usage under load

## Future Enhancements

### Phase 2: MCP Integration

Expose Mission Control as MCP server:

```typescript
// Any agent can call Mission Control
await mcp.call("mc_get_task", { taskId });
await mcp.call("mc_update_task", { taskId, status });
await mcp.call("mc_report", { taskId, summary });
```

Benefits:
- Cursor / Windsurf compatibility
- Loose coupling
- Any agent supported
- Unified API

### Phase 3: Ollama Resumption

Implement session continuation for Ollama:

```typescript
// Currently just one execution
// Future: save state and resume

session = await ollama.resume({
  runId,
  message: "That didn't work, try a different approach"
});
```

### Phase 4: Streaming Events

Real-time event delivery:

```
Client ← WebSocket ← Event Stream ← Runtime
                     (stdout parsing)
```

- Live token count
- Real-time tool calls
- Progress visualization
- No polling needed

### Phase 5: Distributed Runtimes

Support remote runtimes:

```json
{
  "type": "remote",
  "endpoint": "https://runner.example.com",
  "token": "bearer-token"
}
```

Enables:
- GPU cluster scaling
- Multi-region execution
- Vendor integration

## Comparison to Previous Architecture

### Before

```
Daemon: "run claude -p"
        Hard-coded binary path
        No abstraction
        Single model path
        Claude-only features leak in

Cost: All tasks → Cloud API
Privacy: All data leaves machine
Flexibility: Only Claude
Portability: Hard to move to other agents
```

### After

```
Daemon: "resolve runtime → execute"
        Pluggable implementations
        Clean interface
        Multi-model support
        Isolated concerns

Cost: Mix local + cloud per task
Privacy: Mission Critical work stays local
Flexibility: Any agent supported
Portability: Easy to add new runtimes
```

## References

- [AGENTS.md](./AGENTS.md) — User-facing agent documentation
- [Runtime Types](./mission-control/scripts/daemon/runtime-types.ts) — TypeScript interface definitions
- [Runtime Registry](./mission-control/scripts/daemon/runtime-registry.ts) — Registration and resolution
- [Test Suite](./mission-control/__tests__/daemon/runtime-abstraction.test.ts) — Validation tests
- [CLI Commands](./mission-control/scripts/agent-management.ts) — User management interface
