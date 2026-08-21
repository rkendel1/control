# Control — Local Development Control Plane

**Control is not a task runner for one repository. It's your desktop-wide development operating system.**

Control sits above all your local development projects and provides:
- **Multi-Repository Project Management** — Inventory of all your projects
- **Unified Task Queue** — Work can target any project
- **Runtime Agnostic Execution** — Claude Code, Ollama, OpenCode, or any agent
- **Isolated Workspaces** — Git worktrees, direct checkouts, or temporary clones
- **Engineering Memory** — Context, conventions, and history per project
- **Cross-Repository Workflows** — Tasks that span multiple codebases
- **Desktop-Wide Dashboard** — Single control surface for all your work

## Architecture

```
┌─────────────────────────────────────────────────┐
│          CONTROL                               │
│          (Your Local Control Plane)            │
│                                                │
│  • Global Task Queue                          │
│  • Project Registry                           │
│  • Agent Orchestration                        │
│  • Memory & Context                           │
│  • Workspace Management                       │
└────────────────────┬────────────────────────────┘
                     │
          Project Resolver
                     │
    ┌────────────────┼────────────────┐
    ▼                ▼                ▼
┌─────────┐   ┌─────────────┐   ┌─────────┐
│ FeltDB  │   │ Synapse     │   │ Sherpa  │
└────┬────┘   └──────┬──────┘   └────┬────┘
     │               │               │
  Repository     Repository      Repository
     │               │               │
     ▼               ▼               ▼
  Workspace      Workspace       Workspace
     │               │               │
  ┌──┴──┐         ┌──┴──┐        ┌──┴──┐
  │     │         │     │        │     │
Qwen  Claude   Qwen  Claude   Qwen  OpenCode
  │     │         │     │        │     │
  └─────┼─────────┼─────┼────────┼─────┘
        │         │     │        │
        └─────────┴─────┴────────┘
              │
        Normalized Events
              │
        Activity Log
```

## Concepts

### 1. Project

A **Project** is a logical grouping of work. It maps to one or more git repositories.

Examples:
- **FeltDB** → single repo (`~/Desktop/feltdb`)
- **Synapse** → two repos (`~/Desktop/synapse`, `~/Desktop/synapse-api`)
- **App Store Sherpa** → multi-module project

Projects are stored in `mission-control/data/projects.json`:

```json
{
  "id": "feltdb",
  "name": "FeltDB",
  "repository": {
    "path": "/Users/randy/Desktop/feltdb",
    "type": "git",
    "primary": true
  },
  "runtime": {
    "type": "ollama",
    "model": "qwen2.5-coder:32b"
  },
  "workspace": {
    "mode": "worktree"
  },
  "instructions": "You are working on FeltDB, a distributed database...",
  "context": {
    "architecture": "Event sourcing with append-only log...",
    "conventions": "All tests in /tests directory...",
    "known_problems": ["Replication recovery needs work"]
  }
}
```

### 2. Task

**Tasks** are work items that target **projects**, not workspaces.

Before:
```json
{
  "title": "Fix replication bug"
}
```

Now:
```json
{
  "title": "Fix replication recovery",
  "projectId": "feltdb",
  "description": "Recovery process should handle orphaned entries"
}
```

Task resolution:
```
task.projectId
  ↓
project
  ↓
repository.path
  ↓
workspace (worktree, direct, or clone)
  ↓
agent runtime
```

### 3. Workspace

**Workspace** = where an agent executes.

Three modes:

#### Direct
Agent operates directly on your checkout:
```
~/Desktop/feltdb
  ↑
  └─ Agent modifies directly
```

Use for:
- Exploratory work
- Tasks targeting your current checkout
- When you want immediate results

#### Worktree
Isolated checkout created by git:
```
~/.control/worktrees/feltdb/task-123
  ↑
  └─ Git worktree (isolated, can coexist with main)
```

Use for:
- Autonomous agent runs (default)
- Parallel work on same project
- Experimental changes

#### Clone
Independent copy of repository:
```
~/.control/workspaces/feltdb/run-abc123
  ↑
  └─ Independent git clone
```

Use for:
- Complete isolation
- Third-party CI integration
- Testing without touching any checkout

### 4. Project Context

Every project stores persistent context:

```json
{
  "architecture": "Event sourcing + Raft consensus...",
  "conventions": "Tests in /tests, CI checks in .github/...",
  "recent_changes": "Added recovery orchestration, fixed replication...",
  "known_problems": [
    "Replication recovery needs better recovery",
    "Leader election occasionally stalls"
  ]
}
```

When an agent runs on FeltDB, it receives:
```
PROJECT: FeltDB
Repository: ~/Desktop/feltdb
Branch: feature/recovery

ARCHITECTURE:
Event sourcing with append-only log. Consensus via Raft...

CONVENTIONS:
- Tests in /tests
- All migrations in /migrations with timestamp
- CI checks via .github/workflows

RECENT WORK:
- Added recovery orchestration (2 commits)
- Fixed replication pipeline (1 commit)

KNOWN ISSUES:
- Recovery process fails on orphaned entries
- Leader election can stall

TASK:
Fix replication recovery

Your task is to fix the recovery process so it properly handles orphaned entries...
```

This is engineering memory, not just a task.

## Workflow

### 1. Register Projects

Discover your repositories:
```bash
control projects scan ~/Desktop
```

```
📦 FeltDB
  ~/Desktop/feltdb

📦 Synapse
  ~/Desktop/synapse

📦 App Store Sherpa
  ~/Desktop/app_store

Use 'control projects add <path>' to add any of these.
```

Add them to your registry:
```bash
control projects add ~/Desktop/feltdb
control projects add ~/Desktop/synapse
control projects add ~/Desktop/app_store
```

View your projects:
```bash
control projects list
```

```
LOCAL PROJECTS

Name                      ID                Path
────────────────────────────────────────────────────────────────
FeltDB                    feltdb            ~/Desktop/feltdb
Synapse                   synapse           ~/Desktop/synapse
App Store Sherpa          sherpa            ~/Desktop/app_store
```

### 2. Create Tasks

Tasks target projects:

```json
{
  "title": "Fix migration planner evidence handling",
  "projectId": "feltdb",
  "description": "The migration planner needs to validate evidence before execution",
  "importance": "important",
  "urgency": "urgent"
}
```

Or create them through the UI:
```
NEW TASK

Fix replication recovery

Detected Project: FeltDB ✓
Suggested Runtime: Ollama / Qwen 30B
Workspace Mode: New worktree
[Create]
```

### 3. Agent Executes

Control resolves:
1. **Task** → "Fix replication recovery"
2. **Project** → FeltDB
3. **Repository** → ~/Desktop/feltdb
4. **Workspace** → Create new worktree at ~/.control/worktrees/feltdb/task-123
5. **Runtime** → Qwen 30B (FeltDB's default)

Execution context:
```
PROJECT: FeltDB (with architecture, conventions, context)
WORKSPACE: ~/.control/worktrees/feltdb/task-123
RUNTIME: Ollama / Qwen 30B
PERMISSIONS:
  filesystem: ~/.control/worktrees/feltdb/task-123/**
  shell: true
  network: false
  fieldOps: false
  secrets: false

TASK: Fix replication recovery
```

Agent works in isolation. Meanwhile:
```
PARALLEL:
Task #2: Synapse API → OpenCode → ~/.control/worktrees/synapse/task-124
Task #3: Sherpa UI  → Claude Code → ~/Desktop/app_store (direct)
```

### 4. Results Review

After execution:

```
FeltDB / Task #142

Status: READY FOR REVIEW

Changes:
+184 lines -31 lines
3 files modified

Tests:
✓ 143 passing
✓ No regressions

Worktree:
~/.control/worktrees/feltdb/task-142

[Review Diff] [Merge to Main] [Continue] [Discard]
```

Review the worktree diff:
```bash
cd ~/.control/worktrees/feltdb/task-142
git log main..HEAD
git diff main
```

Merge when ready:
```bash
git checkout main
git pull
git merge task-142
```

Or have Control merge it:
```
[Merge] → Merges to main in primary repo
         → Cleans up worktree
         → Marks task complete
```

## CLI Reference

### Project Management

```bash
# List projects
control projects list

# Add a project
control projects add ~/Desktop/feltdb --name "FeltDB"

# Scan directory for projects
control projects scan ~/Desktop

# Show project details
control projects show feltdb

# Set project runtime
control projects set-runtime feltdb ollama --model qwen2.5-coder:32b

# List active worktrees
control projects worktrees feltdb
```

### Agent Management

```bash
# List available runtimes
control agent:list

# Show runtime status
control agent:status

# List Ollama models
control agent:models

# Switch default runtime
control agent:use ollama:qwen2.5-coder:32b
```

### Task Management

```bash
# (Handled through UI, but future CLI could provide:)
control task create "Fix replication" --project feltdb
control task list --project feltdb
control task status <taskId>
control task assign <taskId> developer
```

## Dashboard

The Control UI shows:

```
┌─────────────────────────────────────────────────────┐
│ CONTROL                                             │
├─────────────────────────────────────────────────────┤
│ TODAY                                               │
│ • 17 tasks • 6 running • 5 waiting • 4 blocked     │
├─────────────────────────────────────────────────────┤
│ PROJECTS                                            │
│ FeltDB              5 running · 8 queued            │
│ Synapse             2 running · 4 queued            │
│ App Store Sherpa    1 running · 6 queued            │
│ Easy-LLM            0 running · 3 queued            │
│ Control             1 running · 5 queued            │
├─────────────────────────────────────────────────────┤
│ AGENTS                                              │
│ Qwen 30B            ● working (4 tasks)            │
│ Claude Code         ● working (2 tasks)            │
│ OpenCode            ● working (1 task)             │
│ Codex               ○ idle                         │
├─────────────────────────────────────────────────────┤
│ ATTENTION                                           │
│ ⚠ FeltDB #142 needs review                         │
│ ⚠ Synapse #88 agent blocked: need decision         │
│ ✓ Sherpa #51 completed + merged                    │
└─────────────────────────────────────────────────────┘
```

Click on a project to see:
- Open tasks
- Running agents
- Worktrees
- Recent changes
- Context

Click on a task to see:
- Agent status
- Workspace location
- Changes so far
- Options to review/continue/stop

## Cross-Repository Tasks

Some work spans multiple codebases:

```json
{
  "title": "Update FeltDB starter API usage",
  "projects": ["feltdb", "feltdb-starter"],
  "description": "FeltDB API changed, update the starter to match"
}
```

Control can route this as:

**Sequential:** FeltDB agent → prepare API changes → FeltDB starter agent → update
```
Agent A: FeltDB (task-123)
  └─ Makes API changes
  └─ Marks "ready for integration"
     └─ Agent B: FeltDB Starter (task-124)
        └─ Updates to new API
```

**Parallel:** Both agents work simultaneously, integrate later
```
Agent A: FeltDB (task-123)
Agent B: FeltDB Starter (task-124)
  ├─ Independent work
  └─ Control verifies compatibility
```

**Integrated:** One agent handles both
```
Agent A: Both repos (task-125)
  └─ Coordinates across both
  └─ May need elevated permissions
```

## Security Model

### Per-Project Authorization

By default, agents are scoped:
```
Project: FeltDB
Allowed Paths:
  ~/.control/worktrees/feltdb/**
  ~/Desktop/feltdb/**

Capabilities:
  filesystem: true (workspace only)
  shell: true
  network: false
  fieldOps: false
  secrets: false
```

Cross-repo task needs explicit elevation:
```
Task #142 (FeltDB + Synapse)

⚠ REQUIRES ELEVATION

This task needs access to TWO projects:
  • FeltDB (~/.control/worktrees/feltdb/task-142)
  • Synapse (~/.control/worktrees/synapse/task-142)

Elevated Permissions:
  filesystem: true (both worktrees)
  shell: true

[Approve] [Deny] [Run with monitoring]
```

### Workspace Isolation

Agents cannot:
- Access other projects' repositories
- Access home directory or ~/.ssh
- Call arbitrary network services
- Access vault/secrets without elevation
- Execute Field Ops without explicit permission

Each workspace is a security boundary.

## Examples

### Example 1: Parallel Development

You have 3 features to implement:

```
Task #140: FeltDB / Add compression
Task #141: Synapse / Add subscriptions
Task #142: Sherpa / Refactor pricing model
```

Control creates:
```
~/.control/worktrees/feltdb/task-140
  ↑
  Qwen 30B (FeltDB default)

~/.control/worktrees/synapse/task-141
  ↑
  Claude Code (Synapse default)

~/.control/worktrees/sherpa/task-142
  ↑
  OpenCode (Sherpa default)
```

All three run simultaneously, isolated from each other and your checkouts.

### Example 2: Cross-Repo Integration

```
Task #150: "Update Sherpa to use FeltDB 2.0 API"
  projects: ["feltdb", "sherpa"]
```

Control orchestrates:
```
Step 1: FeltDB agent prepares API docs
  └─ Workspace: ~/.control/worktrees/feltdb/task-150
  └─ Output: API migration guide

Step 2: Sherpa agent updates to new API
  └─ Workspace: ~/.control/worktrees/sherpa/task-150
  └─ Input: FeltDB API docs
  └─ Updates: All API calls to new format

Step 3: Integration test
  └─ Both workspaces
  └─ Verify compatibility
```

### Example 3: Direct Checkout

You want the agent to modify your actual checkout:

```
Task #160: "Quick fix to main"
  workspace: "direct"
```

Control executes:
```
Agent works directly on:
  ~/Desktop/feltdb (your checkout)
```

Useful for:
- Quick bug fixes
- Exploratory work
- When you're already testing

## Migration from Single-Repo Model

If you're using Control on one repository today:

1. **Backward compatible** — nothing breaks
2. **Rename repository reference** — becomes "project"
3. **Add other projects** — start with `control projects add`
4. **New tasks are project-aware** — old tasks still work

Your existing tasks continue to work because:
- If task has no `projectId`, uses the default project
- If default project not set, assumes the workspace's repository
- All existing behavior preserved

## Future Enhancements

### MCP Server (Project-Aware)

Any agent can query:
```typescript
// What projects do I have?
await mcp.call("mc_list_projects")

// What tasks target FeltDB?
await mcp.call("mc_list_tasks", { projectId: "feltdb" })

// What's the current project context?
await mcp.call("mc_get_project_context", { projectId: "feltdb" })

// Create a task
await mcp.call("mc_create_task", {
  title: "...",
  projectId: "feltdb"
})
```

Then agents like Cursor, Windsurf, Aider can:
- See all your projects
- Query context
- Create/update tasks
- Report progress

### AI Project Detection

When you create a task without specifying the project:
```
Task: "Fix the database migration test failure"

ANALYSIS:
  • Mentions "database" → FeltDB? Synapse?
  • Mentions "migration" → FeltDB, Easy-LLM?
  
Candidates:
  FeltDB (confidence: 87%)
  Easy-LLM (confidence: 42%)
  
[Run on FeltDB] [Run on Easy-LLM] [Choose Project]
```

### Dashboard Enhancements

- Real-time agent monitoring per project
- Worktree diff viewer built into UI
- Cross-project dependency tracking
- Automatic merge conflict detection
- Project health metrics

## Comparison to Existing Models

### GitHub Projects / Linear
- Cloud-based, not local
- No runtime abstraction
- Single workspace at a time
- Limited multi-repo support

### Control
- **Local** — all data on your machine
- **Runtime agnostic** — any agent, any model
- **Multi-workspace** — parallel isolated execution
- **Multi-project** — first-class support
- **Context-aware** — persistent project memory

### Cursor / Windsurf
- IDE-centric
- Single project at a time
- Limited desktop-wide awareness
- No persistent task queue

### Control
- **Desktop-wide** — all projects visible
- **Parallel execution** — multiple agents simultaneously
- **Persistent state** — tasks, context, history
- **Cross-project workflows** — coordinate across repos

## Next Steps

1. **Register your projects**
   ```bash
   control projects scan ~/Desktop
   control projects add ~/Desktop/feltdb
   control projects add ~/Desktop/synapse
   ```

2. **Set runtime defaults**
   ```bash
   control projects set-runtime feltdb ollama --model qwen2.5-coder:32b
   control projects set-runtime synapse claude-code
   ```

3. **Create a task**
   Open Control UI and create your first project-targeted task

4. **Let agent run**
   Control creates worktree → executes → gives you results

5. **Review and merge**
   Diff the worktree → merge to main when ready

---

**Control is your local development operating system. Make it your own.**
