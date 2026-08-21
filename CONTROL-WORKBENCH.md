# Control Workbench — Integrated IDE Surface for Agentic Development

**Control is not a dashboard. It's where you spend your development day.**

This architecture transforms Control from a task/agent monitor into a fully integrated development environment that makes agent-driven development seamless by putting file exploration, code editing, terminal access, and agent activity into one unified workspace.

## The Fundamental UX Principle

```
                  SAME WORKSPACE
                        │
          ┌─────────────┼─────────────┐
          │             │             │
        Editor        Terminal       Agent
          │             │             │
          └─────────────┼─────────────┘
                        │
                    Git state
                        │
                    Worktree
```

**You edit a file.** Agent sees it.  
**Agent changes a file.** You see it.  
**You run a test.** Agent sees the result.  
**Agent runs a test.** You see the output.  
**You inspect a diff.** Agent knows which changes you're reviewing.  

This eliminates the context-switching loop:
```
ChatGPT → Terminal → VS Code → GitHub → Terminal → coding agent
```

Instead, everything happens in Control:
```
Task → Agent → Files → Diff → Terminal → Tests → Review → Commit
```

## Architecture

### Level 1: Project Scope

```
CONTROL
  │
  ├─ Projects [Selector]
  │   ├─ FeltDB (2 agents, 5 changes)
  │   ├─ Synapse (1 agent, clean)
  │   ├─ Sherpa (0 agents, 3 changes)
  │   └─ Control (1 agent, clean)
  │
  └─ Active Project: FeltDB
      ├─ Repository: ~/Desktop/feltdb
      ├─ Branch: recovery-fix
      ├─ Worktrees: 3 active
      └─ Workspace: ~/.control/worktrees/feltdb/task-142
```

Switching projects:
```
[FeltDB ▾] → [Synapse ▾]
```

Instantly changes:
- Explorer tree
- Open files (per-project state)
- Terminal pwd
- Agent targets
- Git branch/status
- Task list for that project

### Level 2: The Workbench Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ CONTROL                                                         │
├────────────┬──────────────────────────────┬────────────────────┤
│            │                              │                    │
│ PROJECT    │                              │    AGENT           │
│ [FeltDB ▾] │      EDITOR AREA             │    ────────────    │
│            │                              │                    │
│ ─────────  │  ┌────────────────────────┐  │    Developer       │
│            │  │ src/recovery.rs    ×   │  │    ● Running       │
│ EXPLORER   │  ├────────────────────────┤  │                    │
│            │  │                        │  │    Task #142       │
│ ▾ src      │  │ pub struct Recovery    │  │    Fix recovery    │
│   ▾ repl.  │  │   state: State,       │  │                    │
│     repl.rs│  │ }                      │  │ ────────────────── │
│     recov. │  │                        │  │                    │
│   ▾ storage│  │                        │  │ ACTIVITY           │
│   ▾ tx     │  │                        │  │                    │
│            │  └────────────────────────┘  │ 10:42 Reading...   │
│ ▾ tests    │                              │ 10:43 Editing...   │
│ Cargo.toml │                              │ 10:44 Running...   │
│ README.md  │                              │ 10:44 ✓ Passed     │
│            │                              │                    │
│ ────────── │                              │ ────────────────── │
│            │                              │                    │
│ GIT STATUS │                              │ FILES CHANGED      │
│            │                              │                    │
│ M recovery │                              │ ✓ replication.rs   │
│ M repl.rs  │                              │ ✓ recovery.rs      │
│ A test.rs  │                              │ ✓ test.rs          │
│            │                              │                    │
│ TASKS      │                              │                    │
│            │                              │                    │
│ #142       │                              │                    │
│ Fix recov. │                              │                    │
│ #143       │                              │                    │
│ Add txn    │                              │                    │
│            │                              │                    │
├────────────┴──────────────────────────────┴────────────────────┤
│ TERMINAL                                                       │
│ $ cargo test replication --nocapture                           │
│ running 143 tests                                              │
│ ✓ 143 passed, 0 failed                                         │
│ $ █                                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Level 3: Control Architecture (Full Stack)

```
                         CONTROL
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       Projects           Tasks             Agents
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                       Workspaces
                            │
               ┌────────────┼────────────┐
               │            │            │
            Explorer      Editor       Git
               │            │            │
               └────────────┼────────────┘
                            │
                         Terminal
                            │
                       Agent Runtime
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
    Claude Code          Ollama             OpenCode
```

**Relationship to previous PRs:**

1. **Runtime Abstraction** (PR 1) — The Agent Runtime layer (Claude Code / Ollama / OpenCode)
2. **Multi-Repo Control Plane** (PR 2) — Projects, Tasks, Workspaces
3. **Tauri Desktop Application** (PR 3) — Tauri shell, IPC, system tray
4. **Control Workbench** (PR 4) — Unified workspace surface (Explorer, Editor, Terminal, Git, Agent Activity)

## Component Specification

### 1. Project Selector

**Top-level control:**
```
CONTROL
PROJECT [FeltDB ▾]
```

**Dropdown shows:**
```
● FeltDB
  2 agents · 5 changes · 3 worktrees

○ Synapse
  1 agent · clean

○ Sherpa
  0 agents · 3 changes

○ Control
  1 agent · clean
```

**Behavior:**
- Instantly switches entire workspace
- Restores per-project state (open files, terminal cwd, scroll positions)
- Shows agent count and git status in dropdown preview
- Persists selection across sessions

### 2. File Explorer

**Git-Aware Filesystem Browser**

Display:
```
▾ src
  ▾ replication
    M replication.rs        (modified)
    M recovery.rs           (modified)
    ▾ protocol
      protocol.rs
  ▾ storage
    A storage.rs            (added)
    storage_test.rs
  ▾ transaction
    transaction.rs

▾ tests
  ▾ integration
    A recovery_test.rs      (added)
    
Cargo.toml
README.md
.gitignore
```

**Git Status Indicators:**
- `M` = Modified
- `A` = Added
- `D` = Deleted
- `R` = Renamed
- `C` = Copied
- `?` = Untracked

**Visual Indicators:**
- File icons by language/type
- Soft color highlight for modified/added/deleted
- Dot on tab when file has unsaved agent changes

**Context Menu (Right-Click):**
- Open
- Open to the side
- Open in integrated terminal
- Reveal in Finder/Explorer
- Copy path
- Copy relative path
- Rename
- Delete
- New file (in folder)
- New folder

**Keyboard Shortcuts:**
- `⌘O` — Open file (search + open)
- `⌘P` — Quick file open (fuzzy)
- `⌘N` — New file
- `⌘Shift+N` — New folder
- `⌘Delete` — Delete file
- `F2` — Rename
- `⌘F` — Find in files

**File Watching:**
- Monitor `.control/worktrees/feltdb/task-142/*` for changes
- When agent modifies a file:
  1. File explorer updates immediately
  2. If file is open in editor, editor updates
  3. If diff viewer is open, diff updates
  4. Git status panel updates

### 3. Editor (Monaco Integration)

**Why Monaco?**

Monaco is VS Code's editor component — battle-tested, performant, feature-complete:
- Syntax highlighting for 100+ languages
- Multi-cursor editing
- Find and replace
- Diff editor
- Minimap
- Word wrap
- Line numbers
- Bracket matching
- Auto-indent
- Keyboard shortcuts
- Theme support
- Accessibility features

**Architecture Decision:**

```
Monaco Editor
      ↓
Control Workspace API
      ↓
Workspace Filesystem
```

The editor never assumes `/Users/randy/Desktop/feltdb`. It operates against the active workspace provided by Control's workspace manager.

**Implementation Pattern:**

```typescript
// Editor receives workspace context, not absolute path
const editor = new MonacoWorkspaceEditor({
  workspace: workspaceManager.current(),  // ~/.control/worktrees/feltdb/task-142
  file: "src/recovery.rs"                 // relative to workspace
});

// When agent modifies file:
workspaceManager.onFileChange("src/recovery.rs", () => {
  editor.reload();  // Monaco refreshes from workspace
});
```

**Tabs:**
```
┌─────────────────────────────────────────────┐
│ recovery.rs × │ replication.rs × │ tests/  │
├─────────────────────────────────────────────┤
│                                             │
│  pub struct RecoveryOrchestrator {          │
│                                             │
│    fn coordinate() {                        │
│      ...                                    │
│    }                                        │
│  }                                          │
└─────────────────────────────────────────────┘
```

**Tab Behavior:**
- Click to switch
- `×` to close
- Unsaved indicator (dot): `recovery.rs ●`
- Dirty state tracked per project (survives project switching)
- Right-click for: Close, Close Others, Close All, Split Right, Preview

**Diff Editor:**
```
┌────────────────────────────────────────────┐
│ BEFORE                 │ AFTER              │
│                        │                    │
│ fn recover() {         │ fn recover() {     │
│   let state =          │   let state =      │
│     State::Init;       │     State::Init;   │
│ }                      │   persist(state);  │
│                        │ }                  │
└────────────────────────────────────────────┘
```

Triggered by:
- Git diff view
- Agent change review
- Side-by-side comparison of two files

**Keyboard Shortcuts:**
- `⌘S` — Save
- `⌘Z` — Undo
- `⌘Shift+Z` — Redo
- `⌘F` — Find
- `⌘H` — Replace
- `⌘D` — Add selection to next find match
- `⌘L` — Select line
- `⌘/` — Toggle comment
- `⌘[` / `⌘]` — Indent/dedent
- `⌘+` / `⌘-` — Zoom in/out
- `⌘G` — Go to line
- `⌘Shift+O` — Go to symbol
- `F12` — Go to definition (if language server available)

### 4. Tabs

Tab state is per-project and persists:
```
Project: FeltDB
  Open Tabs:
    - src/recovery.rs (line 142)
    - src/replication.rs (line 84)
    - Cargo.toml (top)

Project: Synapse
  Open Tabs:
    - backend/main.py (line 22)
    - requirements.txt
```

Switching projects restores tabs.

**Tab Decorators:**
- `●` = Unsaved/modified
- `M` = Git modified (after save)
- `A` = Git added
- `D` = Git deleted

### 5. Git Changes Panel

**SOURCE CONTROL**

```
CHANGES

M  src/replication.rs
M  src/recovery.rs
A  tests/recovery_test.rs

────────────────────────

STAGED

────────────────────────

COMMITS

a91d2f4
Durable recovery orchestration

b71a91c
Add recovery state machine
```

**Interactions:**

Click changed file → Open diff editor showing what changed

Right-click file:
- Stage
- Unstage
- Discard changes
- Open
- Open to the side

Click commit:
- Show commit detail (files, message, diff)
- Show related task (if any)

**Workflow:**
1. Agent makes changes
2. Git panel shows what changed
3. Click file to inspect diff
4. `[Accept Changes]` button stages for commit
5. Write message and commit

### 6. Agent Diff/Review Mode

When agent completes a run:

```
RUN #142

FILES CHANGED
3 files | +184 | -31

[Review Changes]
```

Click [Review Changes]:

```
AGENT CHANGES

● src/replication.rs
  +18 | -5
  
○ src/recovery.rs
  +127 | -14
  
○ tests/recovery_test.rs
  +39 | -12

────────────────────────────

[Diff View]

BEFORE         │ AFTER
               │
               │ RecoveryState::
               │   Ready
```

**Actions:**
- `[Accept All]` → Stage all changes
- `[Accept File]` → Stage this file only
- `[Reject File]` → Discard this file's changes
- `[Continue Agent]` → Agent resumes from this state
- `[Stop Agent]` → Abort run

Initially, Accept/Reject operates at file level. Git remains source of truth.

### 7. Integrated Terminal

**Multiple Terminal Sessions:**

```
TERMINAL

[ zsh ] [ test ] [ agent ] [ + ]

$ cargo test --workspace
running 143 tests
....................................................

test result: ok.
143 passed
0 failed

$
```

**Features:**
- Multiple terminals (shell, test runner, agent output)
- Tab creation with `+`
- Terminal rename
- Clear/reset terminal
- Copy output
- Find in terminal output
- Export session to file

**Terminal Sessions:**

1. **Shell** — User's interactive shell
   - Default: `zsh` or `bash`
   - Cwd: Current workspace root
   - PATH: Full environment
   - Colors/TTY: Enabled

2. **Test** — Reserved for test output
   - Dedicated terminal to avoid mixing with shell
   - Clear before each test run
   - Parse test output (counts, failures, timings)

3. **Agent** — Separate from shell and test
   - Shows agent process output only
   - Cannot be interactive (agent → stdout only)
   - Timestamped log lines
   - Parse for errors/warnings

**Critical: Workspace Awareness**

When you open project FeltDB:
```
Terminal cwd = ~/Desktop/feltdb
```

When you open a worktree for Task #142:
```
Terminal cwd = ~/.control/worktrees/feltdb/task-142
```

Change projects:
```
[FeltDB ▾] → [Synapse ▾]
Terminal cwd = ~/projects/synapse
```

This is a subtle but extremely important UX feature. Users never need to `cd`.

**User Terminal:**
```
$ cargo test --workspace
$ npm run dev
$ git status
$ git diff
$ git log
```

User explicitly runs commands.

**Agent Terminal:**
When agent runs:
```bash
cargo test replication
```

Output appears in dedicated Agent terminal. Agent terminal output is read-only (user cannot type commands).

**Keyboard Shortcuts:**
- `^` (Control) + `` ` `` — Show/hide terminal
- `⌘Shift+T` — New terminal
- `⌘K` — Clear terminal
- `⌘Shift+P` — Command palette (in terminal)

### 8. Agent Activity Panel

**Right Sidebar:**

```
AGENT

Developer
Ollama · Qwen3-Coder 30B

● Working

TASK

Fix replication recovery

────────────────────────

ACTIVITY

10:42 Reading replication.rs
10:43 Reading recovery.rs
10:43 Edited recovery.rs
      +18 lines, -5 lines
10:44 Running cargo test
10:44 ✓ 143 tests passed

────────────────────────

FILES

✓ replication.rs (+18, -5)
✓ recovery.rs (+127, -14)
✓ recovery_test.rs (+39, -12)

────────────────────────

[Stop]  [Pause]  [Continue]
```

**Activity Feed:**
- Real-time log of agent actions
- Timestamps (local or elapsed)
- File icons for modified files
- Change counts (+X, -Y)
- Test results with pass/fail
- Error indicators

**Files Section:**
- Only files modified by this agent run
- Shows change counts
- Click to open file in editor
- Click to open diff

**Status:**
- `● Working` → Agent still running
- `✓ Complete` → Agent finished successfully
- `⚠ Paused` → Agent waiting for input/decision
- `✗ Failed` → Agent failed, shows error summary

**Agent Context:**
- Model name and source (Ollama · Qwen / Claude Code / OpenCode)
- Runtime status (Running, Idle, Error)
- Current token usage (display running totals for Claude)
- Task being worked on

**Controls:**
- `[Stop]` — Terminate agent immediately
- `[Pause]` — Pause agent (save state)
- `[Continue]` — Resume paused agent

**Click Interactions:**
- Click activity line → Jump to file and line in editor
- Click file → Open in editor
- Click `[Open Change]` → Open diff viewer

### 9. File/Line References

**Agent says:**
```
The failure is in src/replication/recovery.rs:184.
```

Control renders:
```
src/replication/recovery.rs
                          ↓
                         184
```

Click → Editor jumps to file, line 184.

**Likewise:**
```
Agent: "Changed recovery.rs lines 184–217."

[Open Change]
```

Click → Editor opens diff for lines 184–217 in recovery.rs.

**Terminal integration:**
Compiler output like:
```
error[E0308]: mismatched types
  --> src/recovery.rs:184:17
```

Terminal makes `src/recovery.rs:184:17` clickable.
Click → Editor opens recovery.rs at line 184, column 17.

**This is IDE-standard behavior users expect.**

### 10. Problems Panel

**Integrated error/warning display:**

```
PROBLEMS

Errors      2
Warnings    4

src/recovery.rs
  184:17
  mismatched types: expected `bool`, found `State`

  217:5
  unreachable code

tests/recovery_test.rs
  91:5
  unused variable `x`
  
  112:10
  expected `;`, found `}`
```

**Sources:**
- Rust compiler (rustc, cargo check)
- TypeScript compiler (tsc)
- ESLint / Prettier
- Test failures
- Agent-reported problems

**Click problem:**
```
184:17
mismatched types
↓
Editor jumps to recovery.rs:184:17
```

**Right-click:**
- Copy error message
- Copy error code (if available)
- Search documentation
- Suppress warning (if supported)

**Filtering:**
```
[Errors] [Warnings] [Infos]
```

Toggle visibility per severity.

### 11. Command Palette

Press `⌘K`:

```
> Open project
> Open file in project
> Search workspace
> Run tests
> New terminal
> Start agent
> Stop agent
> Create task
> Review changes
> Commit changes
> Create worktree
> Switch project
> Find in files
> Go to symbol
> Go to definition
```

Search and filter like VS Code:
```
> test
  ├─ Run tests
  ├─ Run tests (workspace)
  ├─ Run test file
  └─ Test explorer
```

**Agent commands:**
```
> start
  ├─ Start agent
  ├─ Start agent (with prompt)
  ├─ Start agent (Ollama)
  └─ Start agent (Claude Code)
```

**Git commands:**
```
> commit
  ├─ Commit staged changes
  ├─ Commit and push
  ├─ Amend previous commit
  └─ Create new branch
```

**Project commands:**
```
> new proj
  ├─ New project
  ├─ Add existing project
  └─ Scan folder for projects
```

Command palette is critical for speed. Users never navigate menus.

### 12. Global Search (⌘Shift+F)

```
SEARCH

Search: RecoveryOrchestrator

18 results

src/recovery.rs:42
  pub struct RecoveryOrchestrator {

src/transaction.rs:184
  RecoveryOrchestrator::new()

tests/recovery_test.rs:22
  let orchestrator = RecoveryOrchestrator::default();

...
```

Click result → Editor jumps to file and line.

**Later enhancement: Search all projects**

```
Search: MigrationPlanner

FeltDB
  14 results
  ├─ src/migration.rs:42
  └─ ...

Control
  2 results
  ├─ mission-control/backend/migration.ts:184
  └─ ...

Easy-LLM
  6 results
  ...
```

Extremely powerful for understanding codebase interconnections across projects.

### 13. Multiple Projects, Multiple Workspaces

**Workspaces Panel:**

```
CONTROL

PROJECTS

● FeltDB (active)
  2 agents · 5 changes · 3 worktrees
  
  Worktrees:
  ├─ Task #142 recovery-fix
  ├─ Task #143 txn-isolation
  └─ main

○ Synapse
  1 agent · clean · 1 worktree
  
  Worktrees:
  ├─ Task #156 auth-module

○ Sherpa
  0 agents · 3 changes

○ Control
  1 agent · clean
```

**Switching Projects:**
Click FeltDB → Synapse:
- Explorer tree changes
- Open files swap (persists per-project)
- Terminal cwd changes
- Agent context changes
- Task list changes
- Git status changes
- All synchronized instantly

**Working with Multiple Projects Simultaneously:**

Two agents working in parallel:
```
FeltDB: Developer (Ollama) running on Task #142
Synapse: Architect (Claude) running on Task #156
```

No context-switching. Switch between projects, monitor both agents.

### 14. What NOT to Build

**Don't reproduce VS Code's:**
- Extension marketplace
- Debugging ecosystem (breakpoints, watch, call stack, etc.)
- Full language server ecosystem
- Notebook system
- Full IDE settings architecture
- Terminal multiplexing (tmux/screen equivalent)
- Collaborative editing

**Out of scope for Control Workbench:**
- Custom themes/extensions
- Snippet library
- Multi-workspace (multiple root folders)
- Advanced debugging
- Full LSP integration
- Macro recording

**Control's focus:**
- Agent-driven software development
- Multi-repository orchestration
- File → Agent → Changes → Diff → Terminal → Tests → Review → Commit
- Unified workspace eliminating context-switching

## Workflow: From Task to Commit

### Scenario: Fix Replication Recovery

**1. Start**
```
CONTROL
PROJECT: FeltDB
TASK: #142 Fix replication recovery

Agent: Developer (Ollama · Qwen 30B)
Status: ● Ready to start
```

**2. Agent reads files**
```
[Start Agent]

ACTIVITY
10:42 Reading src/replication.rs
10:43 Reading src/recovery.rs
10:43 Reading tests/integration/recovery_test.rs
```

EXPLORER updates to show which files were read:
```
M src/replication.rs (agent reading)
M src/recovery.rs (agent reading)
```

**3. Agent makes changes**
```
ACTIVITY
10:44 Editing src/recovery.rs
      +18 lines, -5 lines
10:44 Editing tests/recovery_test.rs
      +39 lines

FILES CHANGED
src/recovery.rs (+18, -5)
tests/recovery_test.rs (+39)
```

EDITOR updates automatically:
```
Tab: src/recovery.rs ●
```

Dot indicates unsaved/changed state.

**4. Agent runs tests**
```
ACTIVITY
10:45 Running cargo test replication

AGENT TERMINAL
$ cargo test replication
running 5 tests
...
test result: ok. 5 passed

10:45 ✓ Tests passed
```

PROBLEMS panel clears (no compiler errors).

**5. Review changes**
```
ACTIVITY

[Review Changes]

Agent shows: "Implemented recovery state transition protocol"
            "All tests passing"
            "Ready for review"
```

Click `[Review Changes]`:

```
AGENT CHANGES

● src/replication.rs
  +18 | -5
  
● src/recovery.rs
  +127 | -14
  
● tests/recovery_test.rs
  +39 | -12

[Diff View]
```

View diffs for each file.

**6. Accept and commit**
```
[Accept All Changes]
```

Git changes panel updates:
```
CHANGES

M src/recovery.rs
M src/replication.rs
A tests/recovery_test.rs
```

Write commit message:
```
Implement recovery state transition protocol

- Add RecoveryState enum with Ready, Recovering, Complete states
- Implement state machine in Recovery orchestrator
- Add integration tests for recovery flow
- Fixes #142
```

Click `[Commit]` or press `⌘Enter`:
```
✓ Committed: "Implement recovery state transition protocol"

Task #142 → Complete
```

**7. Done**

Entire workflow in Control:
- Explorer
- Editor (reading files)
- Git changes (monitoring)
- Agent activity (real-time)
- Terminal (test output)
- No switching to VS Code, Terminal, GitHub, etc.

## Key Architectural Decisions

### 1. Monaco as Editor Component

**Why not build our own?**
- Massive undertaking (syntax highlighter, tokenizer, diff algorithm, line wrapping, accessibility)
- Monaco is production-tested (VS Code's actual editor)
- Hundreds of language supports out of the box
- Extensible without full plugin system

**Why not use Ace/CodeMirror?**
- Monaco more performant at large files
- Better diff editor support
- Better accessibility
- Better keyboard shortcut support

**Integration Pattern:**

```typescript
// Editor is workspace-aware, not path-aware
interface MonacoWorkspaceEditor {
  workspace: WorkspaceContext;
  openFile(relativePath: string): Promise<void>;
  getActiveFile(): string | null;
  onFileChange(path: string, handler: () => void): Unsubscribe;
}

// When workspace changes, editor context changes
workspaceManager.onSwitch((workspace) => {
  editor.setWorkspace(workspace);
  editor.closeAll();  // Pending: restore per-project tabs
});
```

### 2. File Watching and Real-Time Updates

File change detection:
```
Agent modifies src/recovery.rs
  ↓
Workspace file watcher triggered
  ↓
Control filesystem API notified
  ↓
Editor reload triggered
  ↓
Git status updated
  ↓
Explorer updated
```

**Do not poll.** Use native file watching (fs.watch / libuv).

### 3. Workspace-Aware Terminal

Critical UX:
```
Switch project: FeltDB → Synapse
Terminal cwd automatically changes
~/Desktop/feltdb → ~/projects/synapse

Open worktree: Task #142
Terminal cwd changes to:
~/.control/worktrees/feltdb/task-142
```

No `cd` command needed. Terminal follows workspace.

### 4. Separate User Terminal vs Agent Terminal

**User Terminal:**
```
$ git status
On branch recovery-fix
$ cargo test
```

User explicitly invokes commands.

**Agent Terminal:**
```
Running test suite...
[agent-runner] Executing: cargo test replication
test result: ok. 143 passed
```

Read-only. User can see what agent ran but cannot type commands to agent.

This audit trail is important for understanding agent behavior.

### 5. Agent Memory Integration

When agent reads a file, Control logs:
```
AGENT ACTIVITY

10:42 Reading src/replication.rs
```

This activity feed becomes part of agent context for next run:
```
Previous Run #142:
- Read recovery.rs (implementation)
- Read replication.rs (protocol)
- Modified recovery.rs (+18, -5)
- All tests passed

Current Run #143:
Agent context includes: "You previously implemented recovery protocol
in run #142. Those changes are now in main. Current task..."
```

Enables multi-turn agent improvement without explicit prompting.

### 6. Problems Panel as Unified Error Display

Single source of truth for all errors:
```
PROBLEMS

Errors: 5
├─ Rust compiler errors (2)
├─ TypeScript errors (1)
├─ Test failures (2)
└─ Agent warnings (0)
```

User never needs to parse terminal output. All actionable errors surface here.

### 7. Agent ↔ Developer Shared Workspace

This is the fundamental architecture:

```
                 SHARED WORKSPACE
                        │
         ┌──────────────┼──────────────┐
         │              │              │
      Editor         Terminal         Agent
         │              │              │
         └──────────────┼──────────────┘
                        │
                  Git Worktree
```

- Agent modifies file → Developer sees it in editor
- Developer runs test → Agent sees result in next turn
- Terminal output is visible to both
- Diff is shared truth

This is not possible with separate applications (ChatGPT ↔ VS Code ↔ Terminal).

## State Persistence

When user closes and reopens Control:

```
RESTORED STATE

Projects
├─ FeltDB
│  └─ Task #142 (in-progress)
│     Agent: Paused at step 5
│     Open files: recovery.rs, replication.rs
│     Terminal state: Saved

├─ Synapse
│  └─ Task #156 (in-progress)
│     Agent: Paused
│     Open files: auth.py

Workspaces
├─ ~/.control/worktrees/feltdb/task-142
└─ ~/.control/worktrees/synapse/task-156

Active agents: 2 (paused)
```

Persistence includes:
- Which projects were open
- Which tasks were active
- Which files were open (per-project)
- Terminal history and cwd (per-project)
- Agent state (paused vs. stopped)
- Scroll positions in files
- Search history
- Command palette history

All restored on reopen.

## Tauri Integration

Control Workbench runs inside Tauri:

```
┌─────────────────────────────────────────┐
│ CONTROL (Tauri Native App)              │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  Control Workbench                │  │
│  │  (Integrated IDE)                 │  │
│  │                                   │  │
│  │  - Monaco editor                  │  │
│  │  - File explorer                  │  │
│  │  - Terminal (pty)                 │  │
│  │  - Git integration                │  │
│  │  - Agent activity                 │  │
│  └───────────────────────────────────┘  │
│           ↓                              │
│      Tauri IPC                           │
│           ↓                              │
│  ┌───────────────────────────────────┐  │
│  │  Control Core (Rust)              │  │
│  │                                   │  │
│  │  - Projects                       │  │
│  │  - Tasks                          │  │
│  │  - Workspaces                     │  │
│  │  - Git                            │  │
│  │  - Runtimes                       │  │
│  └───────────────────────────────────┘  │
│           ↓                              │
│  Agent Runtimes                         │
│  (Claude Code, Ollama, OpenCode)       │
└─────────────────────────────────────────┘
```

**Tauri Responsibilities:**
- Window management
- File dialog (native folder picker)
- Terminal PTY (pty.rs crate)
- Native notifications
- System tray

**React/TypeScript (UI):**
- Monaco editor
- File explorer tree
- Git status display
- Terminal emulator
- Command palette

**Rust Core (via IPC):**
- Workspace management
- Git operations
- Agent orchestration
- File watching
- State persistence

## Why This is Not a Dashboard

**Dashboard:** You open it to check status.
```
Status Dashboard
├─ 2 agents running
├─ 5 pending tasks
└─ 3 worktrees active
```

**Workbench:** You spend your day in it.
```
Control Workbench
├─ File explorer (where you browse code)
├─ Editor (where you read/write)
├─ Terminal (where you test)
├─ Agent activity (where you monitor)
└─ Git panel (where you review)
```

The difference:
- Dashboard is informational
- Workbench is operational

In a dashboard, you're a manager reading status reports.

In a workbench, you're a developer writing code alongside agents.

This is why switching between Control and VS Code is no longer necessary. The workbench IS your development environment.

## Multi-Agent Orchestration in Workbench

**Scenario: Parallel work on multiple projects**

```
CONTROL

WORKSPACES

● FeltDB / Task #142
  Agent: Developer (Ollama)
  Status: Running
  Files: 3 changed
  
● Synapse / Task #156
  Agent: Architect (Claude Code)
  Status: Working
  Files: 5 changed

● Control / Task #157
  Status: Idle
```

Click any workspace → Switch to it.

Each workspace has:
- Its own editor tabs
- Its own terminal
- Its own agent activity
- Its own git status

Switch instantly. All state preserved.

## Implementation Priority

### Phase 1: Editor + Explorer + Terminal (MVP)
- Monaco editor integration
- File explorer with git status
- Integrated terminal
- Project selector
- Tab management

### Phase 2: Git + Agent Integration
- Git changes panel
- Git diff viewer
- Agent activity panel
- Agent diff/review mode
- File watching + real-time updates

### Phase 3: Search + Command Palette + Advanced
- Global search
- Command palette
- Problems panel
- Multi-project search
- Terminal tab support

### Phase 4: Polish + UX
- Keyboard shortcuts reference
- Settings/preferences
- Theme support
- Performance optimization
- Accessibility audit

## Acceptance Criteria

✓ Tauri desktop application contains the entire development workspace.
✓ No port 3000 dependency.
✓ Project/repository selector.
✓ File explorer with git status indicators.
✓ Monaco editor (syntax highlighting, tabs, multi-cursor).
✓ Multi-tab editing (per-project state preserved).
✓ File watching (agent changes appear in real-time).
✓ Git status/change indicators (M, A, D, R).
✓ Inline Git diff viewer (side-by-side).
✓ Agent-run diff viewer (Accept/Reject per file).
✓ Integrated terminal (workspace-aware cwd).
✓ Multiple terminal sessions (shell, test, agent).
✓ Agent activity/output panel (real-time log).
✓ Clickable file/line references (editor jump).
✓ Problems panel (compiler errors, test failures, lint).
✓ Workspace search (find in files with context).
✓ Command palette (⌘K for rapid navigation).
✓ Native folder/repository picker (Tauri dialog).
✓ Worktree-aware execution (cwd per workspace).
✓ Agent and developer operate against same workspace.
✓ Switching projects doesn't require new window/app.
✓ Multiple agents work simultaneously on different projects.
✓ Agent processes remain independent of UI lifecycle.
✓ Closing/reopening Control restores all state.

## Summary

Control Workbench transforms Control from a task/agent dashboard into a full integrated development environment where:

1. **Repository is the center,** not tasks or dashboards.
2. **Agent and developer share the same workspace,** eliminating handoffs.
3. **Everything needed to ship** (editing, testing, reviewing, committing) is in one app.
4. **No context-switching** between VS Code, Terminal, GitHub, browser.
5. **Multi-repository orchestration** — Switch projects, monitor multiple agents, all in one place.
6. **Native UX** — Keyboard shortcuts, command palette, file watching, terminal awareness.

The result is not "a dashboard that also has an editor." It's a genuine IDE optimized for agent-driven development across multi-repository workspaces.

You never leave Control. You spend your development day inside it.

That's the distinction that matters.
