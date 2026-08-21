# Control Desktop UI — VS Code-Like Integrated Environment

The Control desktop application should provide a **unified workspace** where you manage projects, view tasks, monitor agents, see file changes, and run commands—all without switching windows or applications.

## Design Principle

**Don't make users context-switch.**

```
Traditional (Bad):
Control Window  VS Code  Terminal  ×3 Browsers
     ↓            ↓        ↓          ↓
Multiple contexts, constant switching

Control Desktop (Good):
┌─────────────────────────────────────────┐
│  FILE EXPLORER                          │
│  • FeltDB/                      ▦ TASKS │
│  • Synapse/                     • Task1 │
│  • Sherpa/                      • Task2 │
│                                 ▦ RUNS  │
│  EDITOR                         • Run-1 │
│  src/replication.rs             ◑ Run-2 │
│                                 ────────│
│                                 ▣ OUTPUT│
│                                 ───────┘│
│  
│  TERMINAL                               │
│  $ git status                           │
│  $ npm test                             │
│  
│  ──────────────────────────────────────│
│  GIT DIFF                               │
│  src/replication.rs                     │
│  - old code                             │
│  + new code                             │
└─────────────────────────────────────────┘

Single unified workspace, all context visible
```

## Layout

```
┌──────────────────────────────────────────────────────────────┐
│  CONTROL  [⌘+Shift+Space]              FeltDB · main · clean │
├────────────────────────┬──────────────────────────────────────┤
│                        │                                      │
│  ACTIVITY EXPLORER     │  EDITOR / CONTENT AREA              │
│  ─────────────────────┤                                      │
│ ◎ Projects            │  [file tabs]                         │
│   ▸ FeltDB            │                                      │
│   ▸ Synapse           │  Content (file view, task detail,   │
│   ▾ Sherpa            │   agent status, workspace view)     │
│     ◯ Task #142       │                                      │
│     ◯ Task #143       │                                      │
│                        │                                      │
│ ◎ Active Runs         │                                      │
│   ▾ Run: Task #142    │                                      │
│     ◑ Ollama/Qwen     │                                      │
│     ⏱ 12m 34s        │                                      │
│     ▲ 8,234 tokens    │                                      │
│                        │                                      │
│ ◎ Workspaces         │                                      │
│   ▾ FeltDB/task-142  │                                      │
│     📝 +184 -31      │                                      │
│     ✓ 143 tests      │                                      │
│                        │                                      │
│ ◎ Git Status         │                                      │
│   ▾ FeltDB           │                                      │
│     branch: main     │                                      │
│     clean            │                                      │
│   ▾ Synapse          │                                      │
│     branch: feature  │                                      │
│     3 modified       │                                      │
│                        │                                      │
├────────────────────────┼──────────────────────────────────────┤
│ TERMINAL / OUTPUT                                            │
│ $ cargo test                                                 │
│ test result: ok. 143 passed                                 │
│                                                              │
│ $ git diff main                                             │
│ +++ src/replication.rs                                      │
│ -   fn old_recovery() {                                     │
│ +   fn recovery() {                                         │
└──────────────────────────────────────────────────────────────┘
```

## Left Sidebar: Activity Explorer

### Section: Projects

```
▼ Projects

  ▸ FeltDB
    └ 5 open tasks · 2 running
    
  ▸ Synapse
    └ 3 open tasks · 1 running
    
  ▾ Sherpa
    └ 2 open tasks · 0 running
    ├ [Task #150] "Update pricing model"
    │   ◑ Ollama/Qwen · 34 sec
    │   └ ~/workspaces/sherpa/task-150
    │
    └ [Task #151] "Add subscription flow"
        ○ queued
        └ (not started)
```

Click task:
- Shows task details in editor area
- Lists acceptance criteria
- Shows related files
- Displays agent assignment

Click project:
- Shows project dashboard
- Lists all tasks
- Shows active agents
- Git status
- Repository stats

### Section: Active Runs

```
▼ Active Runs

  ▾ FeltDB / Task #142
    ◑ Qwen 30B (Ollama)
    ⏱ 12m 34s
    ▲ 8,234 tokens input
    ▼ 1,423 tokens output
    
    [↑ Continue] [⏹ Stop] [🔄 Restart] [📋 Copy Output]

  ▾ Synapse / Task #88
    ◑ Claude Code
    ⏱ 3m 12s
    ▲ 2,100 tokens
    
    [↑ Continue] [⏹ Stop] [🔄 Restart]

  ○ Sherpa / Task #150
    ⏳ queued
```

Click a run:
- Shows agent output in editor
- Shows workspace state
- Shows changes made so far
- Action buttons (stop, continue, restart, review)

### Section: Workspaces

```
▼ Workspaces

  ▾ FeltDB / task-142
    📍 ~/.control/worktrees/feltdb/task-142
    📊 +184 -31 lines
    ✓ 143 passing tests
    
    Files Changed:
    • src/replication.rs
    • src/recovery.rs
    • tests/recovery_test.rs
    
    [Review] [Merge] [Discard]

  ▾ Synapse / task-88
    📍 ~/.control/worktrees/synapse/task-88
    📊 +42 -8 lines
    ✗ 2 failing tests
    
    Files Changed:
    • api/subscriptions.rs
    
    [Review] [Continue] [Discard]

  Synapse / task-89
    📍 ~/Desktop/synapse (direct)
    (running)
```

Click workspace:
- Shows file browser
- Shows diff viewer
- Shows test output
- Action buttons (merge, continue, review, discard)

### Section: Git Status

```
▼ Git Status

  ▾ FeltDB
    🌳 main
    ✓ clean
    
    ▾ Worktrees (3)
      🌿 task-142 (+184 -31)
      🌿 task-143 (+12 -2)
      🌿 task-144 (1 modified)

  ▾ Synapse
    🌳 feature/subscriptions
    ⚠ 3 modified, 1 untracked
    
    📝 Local Changes
    • src/api.rs (modified)
    • src/db.rs (modified)
    • tests/ (new files)

  ▾ Sherpa
    🌳 main
    ✓ clean
```

Click project or branch:
- Shows git status in editor
- Shows log
- Shows staged/unstaged changes
- Actions: commit, push, pull, etc.

---

## Main Editor Area

Context-based content:

### Task View

```
FeltDB #142: Fix replication recovery

Description
─────────────────────────────────────────
The replication recovery process needs to handle orphaned entries
that weren't cleaned up after a node failure.

Acceptance Criteria
─────────────────────────────────────────
☐ Recovery process handles orphaned entries
☐ All recovery tests pass
☐ Performance regression < 5%

Files
─────────────────────────────────────────
src/replication.rs
src/recovery.rs
tests/recovery_test.rs

Assignment
─────────────────────────────────────────
Agent:    Developer
Runtime:  Ollama / Qwen 30B
Workspace: New worktree

Related Tasks
─────────────────────────────────────────
#141 - Add recovery orchestration
#150 - Performance benchmarks

Activity
─────────────────────────────────────────
2m ago - Agent started (Qwen 30B)
1m ago - Made 3 file modifications
...
```

### Workspace View

```
FeltDB / Task #142 Workspace

Workspace
─────────────────────────────────────────
Path:     ~/.control/worktrees/feltdb/task-142
Mode:     worktree
Status:   ✓ ready for review
Created:  2m ago

Changes
─────────────────────────────────────────
+184 lines
-31 lines
3 files modified

Files:
  ● src/replication.rs     (+150 -20)
  ● src/recovery.rs        (+34 -11)
  ● tests/recovery_test.rs (+0 -0)

Tests
─────────────────────────────────────────
✓ 143 passing
✗ 0 failing

Performance
─────────────────────────────────────────
Time: 45.2s (baseline: 42.1s)
Regression: +7.3% ⚠
```

Click a file:
- Shows diff viewer
- Inline comments
- Review notes

### Agent Output View

```
FeltDB #142: Qwen 30B Output

● Started: 12m 34s ago
● Status: Running
● Tokens: ▲ 8,234 input | ▼ 1,423 output

─────────────────────────────────────────

I'll analyze the replication recovery issue and implement a fix.

First, let me understand the current implementation:
[thinking...]

The problem is that orphaned entries aren't being cleaned up
when a node fails mid-recovery. I need to:

1. Add orphan detection to the recovery process
2. Implement safe cleanup logic
3. Add tests for edge cases

Let me start by examining the current code...

[Executing: git log src/recovery.rs]

Recent changes show the recovery process was refactored last week.
Let me check the current implementation...

[Reading: src/recovery.rs]
[Running: cargo test --lib recovery]

Tests passing: 140/143
Tests failing: 3
  - recovery_with_orphans (expected)
  - recovery_performance_regression (expected)
  - recovery_concurrent_access (new)

I'll now implement the orphan detection...

─────────────────────────────────────────

[↑ Continue] [⏹ Stop] [🔄 Restart] [📋 Copy All] [💾 Save to File]
```

### File Diff View

```
src/replication.rs

@@ -143,6 +143,28 @@ impl Replication {
     fn handle_failure(&mut self, node_id: NodeId) {
         self.failed_nodes.insert(node_id);
+
+        // Clean up orphaned entries
+        let orphans = self.find_orphaned_entries(node_id);
+        for entry in orphans {
+            self.remove_entry(entry);
+        }
     }

+    fn find_orphaned_entries(&self, failed_node: NodeId) -> Vec<EntryId> {
+        self.entries
+            .iter()
+            .filter(|e| e.is_orphaned_by(failed_node))
+            .map(|e| e.id)
+            .collect()
+    }
+
+    fn remove_entry(&mut self, entry_id: EntryId) {
+        self.entries.retain(|e| e.id != entry_id);
+        self.wal.log_removal(entry_id);
+    }
+
     fn recovery_process(&mut self) {
         while self.needs_recovery() {
             self.replicate_state();

[← prev] [next →] | [1 of 3 files]
```

---

## Bottom Terminal Area

```
$ cargo test --lib recovery
   Compiling control v0.1.0
    Finished `test` profile [unoptimized + debuginfo] in 4.20s
     running 143 tests

test recovery::tests::recovery_basic ... ok
test recovery::tests::recovery_with_orphans ... ok
test recovery::tests::recovery_performance ... ok

test result: ok. 143 passed; 0 failed

Time: 45.2s

$  ▯  (can type commands)
```

Features:
- Run arbitrary commands
- See output in real-time
- Scrollback history
- Command history (↑↓)
- Clear screen
- Export output
- Kill running command

---

## Tabs

Multiple open "documents":

```
[FeltDB #142 Workspace] [Agent Output] [src/replication.rs] [Changes] [Terminal ✓]
```

Each tab maintains its own state. Click to switch.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **⌘+P** | Quick file/task palette |
| **⌘+B** | Toggle sidebar |
| **⌘+J** | Toggle terminal |
| **⌘+E** | File explorer focus |
| **⌘+Shift+Space** | Quick task creation |
| **⌘+K** | Clear terminal |
| **⌘+L** | Focus terminal input |
| **⌘+Tab** | Switch between tabs |
| **⌘+//** | Comment/uncomment (if in editor) |
| **Ctrl+`** | Toggle terminal (standard VSCode) |

---

## Command Palette

**⌘+P** opens quick palette:

```
┌──────────────────────────────────────────────┐
│ What next?                                   │
│                                              │
│ Fix replication bug                         │
│                                              │
│ > Create Task · FeltDB · Qwen              │
│                                              │
│ Recent:                                      │
│ · Task #142 - Workspace Review              │
│ · Agent Status                               │
│ · Terminal Clear                             │
│ · Open Project Folder                       │
│                                              │
│ Commands:                                    │
│ > Create Task                               │
│ > Start Agent                               │
│ > Stop All                                   │
│ > Review Workspace                           │
│ > Export Output                              │
│ > Settings                                   │
└──────────────────────────────────────────────┘
```

---

## Information Display

### Header Bar

```
┌─────────────────────────────────────────────────────────────┐
│ FeltDB  ⏱ 12m 34s  ▲ 8,234  ▼ 1,423  ✓ 143 passed         │
└─────────────────────────────────────────────────────────────┘

Shows:
- Current project/task
- Elapsed time
- Input/output tokens
- Test status / agent status
```

### Status Bar (Bottom Right)

```
main · clean · Ollama ◑ running · Line 143:28 · UTF-8
```

Shows:
- Git branch
- Git status
- Agent status
- Cursor position
- File encoding

---

## Quick Actions

Click icons/buttons without losing context:

### Task Quick Actions
```
[Task #142]

[↑ Continue] [⏹ Stop] [🔄 Restart] [📋 Copy] [✔ Review] [✗ Reject]
```

### Workspace Quick Actions
```
[FeltDB/task-142]

[Review Diff] [Merge] [Continue] [Discard] [📊 Stats]
```

### Agent Quick Actions
```
[Qwen 30B - 12m 34s]

[↑ Ask Question] [⏹ Stop] [🔄 Restart] [📋 Output] [🎯 Redirect]
```

---

## Panels (Toggleable)

### File Explorer Panel (⌘+B to toggle)
```
FeltDB
  ├─ src/
  │  ├─ replication.rs
  │  ├─ recovery.rs
  │  └─ ...
  ├─ tests/
  ├─ Cargo.toml
  └─ README.md

Right-click:
  - Open with...
  - Reveal in Finder
  - Copy Path
  - Run Tests
```

### Git Panel (⌘+Shift+G)
```
CHANGES (3)

Staged (2)
  ✓ src/recovery.rs

Unstaged (1)
  ✓ src/replication.rs
  
Untracked (0)

COMMITS

Latest:
  Durable recovery orchestration
  by Agent · 2m ago
```

### Terminal Panel (⌘+J)
```
[built-in terminal, can split]

$ npm test
$ cargo build
$ git diff
```

### Output Panel
```
Agent output
Test results
Build logs
Search results
```

---

## Search

**⌘+F** — Find in files:

```
┌──────────────────────────────────────────────────┐
│ Find: orphaned             ▣ Case  ▣ Regex       │
│ Replace: [empty]           ▣ Whole │ Replace All│
│                                                  │
│ 47 results in 3 files                           │
│                                                  │
│ src/recovery.rs                    (23 results) │
│   Line 145: if is_orphaned_by(...) │  orphaned  │
│   Line 150: remove_orphaned_entries│  orphaned  │
│   ...                                            │
│                                                  │
│ src/replication.rs                 (18 results) │
│   Line 78: handle_orphaned_entries │  orphaned  │
│   ...                                            │
│                                                  │
│ tests/recovery_test.rs             (6 results)  │
│   Line 234: test_orphaned_entries  │  orphaned  │
│   ...                                            │
└──────────────────────────────────────────────────┘
```

---

## Themes & Customization

- **Light/Dark mode** toggle
- **Font size** adjustment
- **Sidebar width** drag to resize
- **Terminal height** drag to resize
- **Color theme** selection
- **Keyboard shortcuts** customization

---

## Performance Considerations

All UI updates are:
- Instant (no loading spinners)
- Async (never block terminal)
- Streamed (show output as it arrives)
- Cancelable (⏹ stop button always works)

Real-time updates without jank:
- Agent output streams in live
- File changes show immediately
- Tests report as they pass/fail
- No full-page refreshes

---

## Comparison to Alternatives

### VS Code
- Pro: Excellent editor, extensions
- Con: Not optimized for task/agent coordination
- Control: Tailored for agent-driven development

### Linear / GitHub Projects
- Pro: Cloud-based, team collaboration
- Con: Separate from code, no terminal/editor
- Control: Unified workspace, integrated execution

### Cursor / Windsurf
- Pro: AI-aware IDE
- Con: Single project at a time
- Control: Multi-project orchestration

### Control Desktop
- ✅ Multi-project dashboard
- ✅ Terminal integration
- ✅ Agent coordination
- ✅ File explorer + editor
- ✅ Real-time streaming
- ✅ Git integration
- ✅ No context switching

---

## Summary

Control Desktop UI is a **unified workspace** designed for agent-driven development:

**You never leave the app.**

- ✅ Create tasks (quick palette)
- ✅ Monitor agents (activity explorer)
- ✅ See changes (diff viewer)
- ✅ Run commands (terminal)
- ✅ Review results (file explorer + output)
- ✅ Merge/iterate (workspace actions)

This is how you build a genuine local development control plane — not as a separate tool, but as your primary workspace for all coding work.
