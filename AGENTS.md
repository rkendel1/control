# Agents — Universal Coding Agent Runtime

Mission Control is a universal orchestration platform for any coding agent, any model, and any execution environment.

## Architecture Overview

```
┌──────────────────────────┐
│   Mission Control        │
│  (Orchestration Layer)   │
│                          │
│ • Tasks & Missions       │
│ • Agent Roles            │
│ • Inbox & Decisions      │
│ • Skills Library         │
│ • Activity Logging       │
└──────────────┬───────────┘
               │
        Agent Runtime
        (Execution)
               │
    ┌──────────┼──────────┐
    │          │          │
  Claude    Ollama   Command
  Code      Local      (Any
  (Cloud)   Model)   Executable)
```

## How It Works

When a task is delegated to an agent:

1. **Read Context** — Agent gets task, skills, and workspace context from Mission Control
2. **Resolve Runtime** — System determines which runtime to use (task → agent → workspace default)
3. **Execute** — Agent runtime runs the work
4. **Emit Events** — Execution events stream back (started, progress, completed, etc.)
5. **Update State** — Mission Control records results in task, inbox, activity log
6. **Report** — Agent posts completion to inbox or requests decision if blocked

## Agent Runtimes

### Claude Code (Cloud)

```json
{
  "id": "developer",
  "name": "Developer",
  "runtime": {
    "type": "claude-code"
  }
}
```

**Capabilities:**
- Streaming responses
- Tool calling
- Session resumption
- Structured output
- Cost tracking

**Best for:** Complex reasoning, research, code review, multi-step tasks

**Cost:** ~$0.003/1K input tokens

### Ollama (Local GPU/CPU)

```json
{
  "runtime": {
    "type": "ollama",
    "model": "qwen2.5-coder:32b",
    "baseUrl": "http://127.0.0.1:11434"
  }
}
```

**Capabilities:**
- Local inference (privacy)
- Tool calling (model-dependent)
- No API keys needed
- Instant startup

**Best for:** Coding tasks, CI/CD integration, privacy-sensitive work

**Cost:** $0.00 (just GPU time)

**Setup:**
```bash
# Install Ollama: https://ollama.ai
ollama pull qwen2.5-coder:32b
ollama serve
```

### Command Runtime (Any Executable)

```json
{
  "runtime": {
    "type": "command",
    "command": "opencode",
    "args": ["run", "--format", "json"]
  }
}
```

**Supports:**
- OpenCode
- Codex
- Aider
- Custom scripts

## Configuration

### Workspace Level

File: `mission-control/data/runtime-config.json`

```json
{
  "defaultRuntime": "claude-code",
  
  "runtimes": {
    "claude-code": {
      "type": "claude-code"
    },
    
    "ollama-fast": {
      "type": "ollama",
      "baseUrl": "http://127.0.0.1:11434",
      "model": "qwen2.5-coder:14b"
    },
    
    "opencode": {
      "type": "command",
      "command": "opencode",
      "args": ["run"]
    }
  }
}
```

### Agent Level

File: `mission-control/data/agents.json`

```json
{
  "agents": [
    {
      "id": "developer",
      "name": "Developer",
      "runtime": {
        "type": "ollama",
        "model": "qwen2.5-coder:32b"
      }
    },
    {
      "id": "researcher",
      "name": "Researcher",
      "runtime": {
        "type": "claude-code"
      }
    }
  ]
}
```

### Task Level

Tasks can override agent runtime:

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

### Resolution Order

When executing a task:

1. Task-level runtime config
2. Agent-level runtime config
3. Project-level runtime config
4. Workspace default runtime

## Fallback Chains

Gracefully fall back to alternatives if a runtime is unavailable:

```json
{
  "type": "ollama",
  "model": "qwen2.5-coder:32b",
  "fallback": {
    "type": "claude-code"
  }
}
```

Execution sequence:
- Try Ollama
- If unavailable → Try Claude Code
- If unavailable → Error

## Managing Runtimes

### List Available Runtimes

```bash
pnpm agent:list
```

Output:
```
Agent Runtimes

Runtime        Status     Config
────────────────────────────────────────
claude-code    ✓ ready    installed
ollama         ✓ ready    localhost:11434
opencode       ✗ missing  executable not found
```

### Check Status

```bash
pnpm agent:status
```

```
Claude Code
  ✓ Available
  Version: 1.2.3

Ollama
  ✓ Available
  URL: http://127.0.0.1:11434
  Models: 3 installed
    • qwen2.5-coder:32b
    • llama2:13b
    • codellama:7b

OpenCode
  ✗ Missing
  Install with: npm i -g @opencode/cli
```

### Discover Ollama Models

```bash
pnpm agent:models
```

```
Available Ollama Models

qwen2.5-coder:32b    32B     tools ✓   Recommended
qwen2.5-coder:14b    14B     tools ✓   Lightweight
llama2:13b           13B     tools ?
deepseek-coder       16B     tools ✓
codellama:7b          7B     tools ✓
```

### Switch Runtime

```bash
pnpm agent:use ollama
pnpm agent:use ollama:qwen2.5-coder:32b
pnpm agent:use claude
```

## Execution Context

When an agent executes, it receives:

```typescript
{
  runId: string;                    // Unique execution ID
  prompt: string;                   // Task instructions
  maxTurns: number;                 // Max reasoning steps
  timeoutMinutes: number;           // Execution time limit
  workingDirectory: string;         // Workspace path
  permissions: {
    filesystem: "workspace|none";   // File access scope
    shell: boolean;                 // Can run commands
    network: boolean;               // Can make requests
    fieldOps: boolean;              // Can execute Field Ops
    secrets: boolean;               // Access to vault
  };
}
```

## Execution Events

All runtimes emit normalized events:

```typescript
type AgentEvent =
  | { type: "started"; data: { pid: number } }
  | { type: "tool_call"; data: { toolName: string; ... } }
  | { type: "tool_result"; data: { success: boolean; ... } }
  | { type: "output"; data: { content: string } }
  | { type: "progress"; data: { ... } }
  | { type: "completed"; data: { exitCode: number } }
  | { type: "failed"; data: { error: string } }
  | { type: "stopped"; data: { ... } }
```

Mission Control consumes these events for:
- Live run status in UI
- Activity logging
- Cost tracking
- Token counting
- Failure detection
- Execution resumption

## Usage & Cost Tracking

Each execution reports normalized usage:

```typescript
{
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 2000,
  cacheWriteTokens: 0,
  durationMs: 5000,
  estimatedCostUsd: 0.003,  // Only for cloud runtimes
  providerMetadata: { ... }  // Runtime-specific data
}
```

### Ollama Shows:

```
Duration: 5.2s
Tokens: 1,234 input + 567 output
Cost: $0.00 (local)
Model: qwen2.5-coder:32b
```

### Claude Code Shows:

```
Duration: 3.8s
Tokens: 980 input + 234 output + 100 cache
Cost: $0.00156
Model: Claude
```

## Security Boundaries

Runtimes respect execution permissions:

- **filesystem: "workspace"** — Can only read/write in workspace
- **filesystem: "none"** — No file access
- **shell: true|false** — Can execute commands
- **network: true|false** — Can make HTTP requests
- **fieldOps: true|false** — Can execute Field Ops missions
- **secrets: true|false** — Can access vault credentials

Sensitive operations (wallet transfers, credential access, external API calls) require explicit permissions, separate from code execution.

## Continuous Missions

Some agents run continuously, polling tasks and executing them:

```typescript
Mission
  ├─ Developer (Ollama)
  ├─ Researcher (Claude Code)
  ├─ Tester (OpenCode)
  └─ Business Analyst (Claude Code)
```

The orchestrator can:
- Spawn 4 parallel agent sessions
- Route tasks by role and capability
- Track execution state independently
- Report progress to inbox
- Handle failures and retries
- Balance costs across runtimes

## MCP Integration (Coming Soon)

Mission Control will expose itself as an MCP server:

```typescript
// Any agent can use Mission Control as a remote service
const client = new MCPClient("mission-control-mcp");

await client.call("mc_get_task", { taskId: "task_123" });
await client.call("mc_update_task", { id, status: "in-progress" });
await client.call("mc_report_completion", { taskId, summary });
```

This enables:
- Cursor / Windsurf / Aider integration
- Codex agent compatibility
- Custom agent support
- Zero lock-in to specific agent technology

## Examples

### Multi-Agent Execution

Task: Build a feature with tests

```json
[
  {
    "taskId": "design-api",
    "assignedTo": "researcher",
    "runtime": "claude-code"
  },
  {
    "taskId": "implement-api",
    "assignedTo": "developer",
    "runtime": "ollama:qwen2.5-coder:32b"
  },
  {
    "taskId": "write-tests",
    "assignedTo": "tester",
    "runtime": "opencode"
  },
  {
    "taskId": "code-review",
    "assignedTo": "developer",
    "runtime": "claude-code"
  }
]
```

Execution:
1. Researcher designs API schema (Claude, thorough analysis)
2. Developer implements (Ollama, fast local turnaround)
3. Tester writes tests (OpenCode, specific tool support)
4. Developer reviews (Claude, nuanced feedback)

### Graceful Degradation

Researcher task with fallback:

```json
{
  "id": "market-research",
  "assignedTo": "researcher",
  "runtime": {
    "type": "claude-code",
    "fallback": {
      "type": "ollama",
      "model": "llama2:13b"
    }
  }
}
```

Execution:
- Try Claude (best for research depth)
- If unavailable → Use Ollama Llama2 (reasonable alternative)
- If both unavailable → Report blocked

### Privacy-First Workflow

All work local, no cloud:

```json
{
  "defaultRuntime": "ollama",
  "runtimes": {
    "ollama": {
      "type": "ollama",
      "model": "qwen2.5-coder:32b"
    }
  }
}
```

All tasks run on local GPU, zero data leaves the machine.

## Troubleshooting

### "Runtime not found" error

Check available runtimes:
```bash
pnpm agent:list
```

Ensure runtime-config.json specifies the runtime you want.

### Ollama connection refused

```bash
# Check if Ollama is running
ps aux | grep ollama

# Start Ollama
ollama serve

# Verify connectivity
curl http://127.0.0.1:11434/api/tags
```

### Model not found in Ollama

```bash
# List installed models
ollama list

# Pull a new model
ollama pull qwen2.5-coder:32b

# Check model capabilities
ollama show qwen2.5-coder:32b
```

### Claude Code not found

```bash
# Check installation
npm list -g @anthropic-ai/claude-code

# Install or upgrade
npm install -g @anthropic-ai/claude-code@latest

# Set path in daemon-config.json if non-standard location
```

## Further Reading

- [CLAUDE.md](./CLAUDE.md) — Claude Code specific documentation
- [Mission Control API](./mission-control/API.md) — Task and inbox APIs
- [Runtime Types](./mission-control/scripts/daemon/runtime-types.ts) — Interface definitions
- [Daemon Configuration](./mission-control/data/daemon-config.json) — Execution limits
