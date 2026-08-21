# Control Desktop Application — Tauri-Based Control Plane

**Control is no longer a web application. It's a native desktop application.**

This architecture document describes the shift from a web-based localhost:3000 model to a native Tauri application that operates as a genuine desktop control plane.

## Architecture Transformation

### Before: Web-Based
```
Browser
  ↓
localhost:3000
  ↓
Next.js Server
  ↓
Control Core (same process)
  ↓
Agents/Processes
```

Problems:
- Requires npm run dev
- Port 3000 hardcoded
- UI and core tightly coupled
- Browser overhead
- Localhost in the UI looks temporary
- Control feels like a web app, not infrastructure

### After: Tauri-Native
```
CONTROL.app (Tauri)
  ↓
┌─────────────────────────────────────────┐
│  Native Desktop UI (React + Tauri IPC) │
│                                         │
│  System Tray · Hotkey · Notifications  │
└────────────────┬────────────────────────┘
                 │
            Tauri IPC
             (No TCP)
                 │
┌────────────────▼────────────────────────┐
│       CONTROL CORE (Rust)                │
│                                         │
│  Projects · Tasks · Workspaces          │
│  Runtimes · Git · Memory                │
│  Process Management · Security          │
└────────────────┬────────────────────────┘
                 │
    ┌────────────┼────────────┐
    │            │            │
  Ollama      Claude        OpenCode
  (local)     (CLI)          (CLI)
```

Benefits:
- Single native executable
- No port to manage
- True IPC instead of HTTP
- Feels like native application
- System tray integration
- Global hotkeys
- Runs independently of browser

## Core Principles

### 1. **Tauri Owns the Lifecycle**

```rust
Control.app starts
  ↓
Initialize Rust core
  ↓
Load projects
  ↓
Discover runtimes
  ↓
Start orchestration
  ↓
Show native window
```

When you close the app:
```
User closes window
  ↓
Window hides (app stays running)
  ↓
(Optional) Stop accepting new work
  ↓
Keep agents running
```

The key: **Desktop UI lifecycle ≠ daemon lifecycle**

### 2. **No Listening Ports by Default**

Control uses:
- **Tauri IPC** for UI → Core communication (no network)
- **Unix socket** for external tools (optional)
- **OS-assigned ephemeral port** for HTTP API (optional, disabled by default)

The desktop path has zero listening ports.

### 3. **Core Runs in Rust**

Not JavaScript. Not Python.

```rust
// Rust core
pub struct ControlCore {
    projects: Arc<RwLock<ProjectRegistry>>,
    tasks: Arc<RwLock<TaskEngine>>,
    workspaces: Arc<RwLock<WorkspaceManager>>,
    runtimes: Arc<RwLock<RuntimeManager>>,
}
```

This gives you:
- Native performance
- Strong type safety
- Direct OS process management
- No runtime overhead
- Credential security (OS keychain integration)

### 4. **UI Communicates via Tauri IPC**

Not HTTP. Not fetch().

```typescript
// Before (HTTP)
const tasks = await fetch('http://localhost:3000/api/tasks').then(r => r.json());

// After (Tauri IPC)
const tasks = await invoke('cmd_tasks_list', { projectId: 'feltdb' });
```

Benefits:
- No TCP overhead
- Direct event passing
- Type-safe (Rust + TypeScript)
- Implicit authentication (same process)
- Can pass file handles and complex objects

## Architecture Layers

### Layer 1: Tauri Shell

Handles:
- Application lifecycle
- Window management
- System tray
- Global hotkeys
- Native file dialogs
- Notifications
- OS integration

### Layer 2: IPC Bridge

Tauri commands:
```
cmd_projects_list()
cmd_projects_add(path, name)
cmd_tasks_create(title, projectId)
cmd_task_start(taskId)
cmd_runtimes_list()
cmd_workspaces_list()
```

Each command is a Rust function that:
1. Receives request from UI
2. Calls Control Core
3. Returns response to UI
4. Never blocks the UI

### Layer 3: Control Core

```
project::ProjectRegistry
├── load/save projects
├── discover repositories
└── manage project metadata

task::TaskEngine
├── create/list tasks
├── assign to agents
└── track completion

workspace::WorkspaceManager
├── create worktrees
├── manage git state
└── cleanup after run

runtime::RuntimeManager
├── discover agents
├── spawn processes
└── track execution

git::GitManager
├── repo operations
├── branch management
└── diff/status

memory::MemoryStore
├── project context
├── conventions
└── engineering memory
```

All in Rust, all type-safe, all concurrent.

### Layer 4: Process Management

Spawning agents in Rust (not shell scripts):
```rust
let mut child = Command::new("claude")
    .arg("-p")
    .arg(prompt)
    .current_dir(workspace_path)
    .env("ALLOWED_PATHS", "/path1:/path2")
    .spawn()?;

let status = child.wait()?;
```

Benefits:
- Strong lifecycle control
- Clean environment
- Proper signal handling
- Cross-platform reliability
- Credential isolation

### Layer 5: External APIs (Optional)

If needed for integrations:

```rust
// Unix socket (macOS/Linux)
~/.control/control.sock

// HTTP (optional, ephemeral port, localhost only)
127.0.0.1:49173  // OS-assigned
```

But the desktop app never needs these.

## IPC Command Examples

### Project Management

```typescript
// List all projects
const projects = await invoke('cmd_projects_list');

// Add a project
const project = await invoke('cmd_projects_add', {
  path: '/Users/randy/Desktop/feltdb',
  name: 'FeltDB'
});

// Get project details
const details = await invoke('cmd_projects_get', {
  id: 'feltdb'
});
```

### Task Operations

```typescript
// List tasks
const tasks = await invoke('cmd_tasks_list', {
  projectId: 'feltdb'
});

// Create task
const task = await invoke('cmd_task_create', {
  title: 'Fix replication recovery',
  projectId: 'feltdb',
  description: '...'
});

// Start execution
const run = await invoke('cmd_task_start', {
  taskId: task.id
});
```

### Runtime Status

```typescript
// List available runtimes
const runtimes = await invoke('cmd_runtimes_list');

// Result:
// [
//   { name: 'Claude Code', available: true, version: '1.2.3' },
//   { name: 'Ollama', available: true, version: '...' },
//   { name: 'OpenCode', available: false, version: null }
// ]
```

## System Tray

Control lives in the menu bar (macOS) / system tray (Windows/Linux).

```
● Control

5 active agents
17 pending tasks

FeltDB        2 running
Synapse       1 running
Sherpa        1 running
Control       1 running

──────────────

Open Control (⌘+Shift+Space)
Pause New Work
View Active Runs
Quit Control
```

Click the icon:
- **Left-click**: Show/focus Control window
- **Right-click**: System tray menu
- **⌘+Shift+Space**: Quick task palette

## Global Hotkey

Press **⌘+Shift+Space** (macOS) / **Ctrl+Shift+Space** (Windows/Linux):

```
┌─────────────────────────────────────────┐
│ What needs to happen?                   │
│                                         │
│ Fix the migration planner in FeltDB    │
│                                         │
│ Detected Project: FeltDB                │
│ Suggested Runtime: Ollama / Qwen 30B   │
│ Workspace Mode: New worktree            │
│                                         │
│              [Create Task]              │
└─────────────────────────────────────────┘
```

This is the killer UX:
1. Working anywhere (Xcode, Terminal, VS Code)
2. Press hotkey
3. Type task description
4. Control infers project and runtime
5. Create task
6. Back to work

Meanwhile, Control spawns an agent in an isolated worktree.

## Native File Dialogs

Adding a project:

```
Control.app
  ↓
User clicks "Add Project"
  ↓
Native folder picker
  ↓
~/Desktop/feltdb selected
  ↓
Control detects:
  ✓ Git repository
  ✓ package.json (Node)
  ✓ Cargo.toml (Rust)
  ✓ README.md
  ↓
Creates project automatically
```

No manual configuration. No typing paths.

## Credential Security

OS-native credential storage:

**macOS:**
```rust
// Stored in Keychain
credential_store.set_secret("github-token", token);
let token = credential_store.get_secret("github-token");
```

**Windows:**
```rust
// Stored in Credential Manager
credential_store.set_secret("github-token", token);
let token = credential_store.get_secret("github-token");
```

**Linux:**
```rust
// Stored in Secret Service / pass
credential_store.set_secret("github-token", token);
let token = credential_store.get_secret("github-token");
```

Sensitive data never touches:
- localStorage
- .env files
- source code
- app config

## Background Daemon Mode

For future extensibility:

```bash
# UI mode (current)
open /Applications/Control.app

# Daemon mode (future)
control daemon start
control daemon status
control daemon stop
```

The daemon can run independently:
```
Control Daemon
      │
  ┌───┼───────────────┐
  │   │               │
Control Desktop  Control CLI  MCP Server
Control UI       (future)     (future)
```

This means eventually:
- Multiple UI instances on one daemon
- Headless execution
- Remote access (with security)

## Comparison: Web vs Native

| Aspect | Web (Before) | Native (After) |
|--------|---|---|
| **Startup** | `npm run dev` | Click app icon |
| **Port** | 3000 hardcoded | OS-assigned (optional) |
| **IPC** | HTTP fetch | Tauri commands |
| **System Integration** | Limited | Full (tray, hotkeys, dialogs) |
| **Appearance** | Browser window | Native window |
| **Performance** | JavaScript overhead | Rust performance |
| **Lifecycle** | Browser-managed | App-managed |
| **Credentials** | localStorage | OS keychain |
| **Real-time** | Polling/WebSocket | Native events |
| **Distribution** | Manual npm install | App store / DMG / MSI |

## File Structure

```
control/
├── src-tauri/                 # Rust/Tauri application
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs            # Tauri app + system tray
│   │   ├── commands.rs        # IPC command handlers
│   │   ├── lib.rs             # Control Core
│   │   ├── project/           # Project management
│   │   ├── task/              # Task engine
│   │   ├── workspace/         # Workspace manager
│   │   ├── runtime/           # Agent runtime
│   │   ├── git/               # Git integration
│   │   └── memory/            # Engineering memory
│   └── tauri.conf.json        # Tauri configuration
│
├── src-ui/                    # React TypeScript UI
│   ├── components/
│   ├── pages/
│   ├── hooks/
│   │   └── useIPC.ts          # Tauri command hooks
│   └── App.tsx
│
├── TAURI-DESKTOP.md           # This file
└── ARCHITECTURE.md            # Core architecture

```

## Building and Running

### Development

```bash
# Terminal 1: Tauri dev with hot-reload
cd src-tauri
cargo tauri dev

# This starts:
# - Rust compiler watching for changes
# - Tauri dev server for React
# - Native Tauri window with live reload
```

### Production

```bash
# Build native app
cargo tauri build

# Outputs:
# macOS:   target/release/bundle/dmg/Control.dmg
# Windows: target/release/bundle/msi/Control_*.msi
# Linux:   target/release/bundle/deb/control_*.deb
```

## Security Model

### Process Isolation

Each agent run:
```rust
let mut child = Command::new("claude")
    .current_dir(workspace)
    .env_clear()  // Clear environment
    .env("PATH", safe_path)
    .env("HOME", workspace)
    .spawn()?;
```

Agent receives:
- Isolated workspace path
- Safe PATH
- Workspace as HOME
- No API keys or credentials (must be passed explicitly)
- No access to other projects

### Capability-Based Security

Every execution context defines:
```rust
pub struct ExecutionCapabilities {
    pub filesystem: Option<Vec<String>>,  // Allowed paths
    pub shell: bool,
    pub network: bool,
    pub fieldOps: bool,
    pub secrets: bool,
}
```

These are enforced by the Rust core, not by the agent.

### Credential Isolation

Secrets are:
- Stored in OS keychain
- Never passed via environment
- Only injected when needed
- Cleared after execution
- Never logged or cached

## Migration Path

### Phase 1: Current (Web-based)
- Localhost:3000
- Next.js server
- HTTP API
- Browser-based UI

### Phase 2: Tauri Shell (This PR)
- Native Tauri app
- Rust core (partial)
- Tauri IPC for UI
- System tray and hotkey
- No port by default

### Phase 3: Full Rust Core
- Complete migration of control logic to Rust
- Optional HTTP API (disabled by default)
- Daemon mode
- Process management in Rust

### Phase 4: Ecosystem
- Multiple UI clients (desktop, CLI, MCP)
- One persistent daemon
- Remote execution (secure)
- Agent marketplace integration

## Future Enhancements

1. **Auto-launch at login**
   - macOS: LaunchAgent
   - Windows: Task Scheduler
   - Linux: systemd user service

2. **Background notifications**
   - Agent started/completed
   - Test failures
   - Merge conflicts
   - Decisions needed

3. **Agent marketplace**
   - Browse available agents
   - One-click install
   - Version management

4. **Time-travel debugging**
   - Replay past runs
   - Change conditions
   - Re-run with modifications

5. **Collaborative mode**
   - Share workspace view
   - Pair programming with agents
   - Audit trail

## Summary

Control is no longer:
- A web server on localhost:3000
- Dependent on npm run dev
- Tied to a browser window
- A temporary-looking utility

Control is now:
- **A native desktop application**
- **A genuine control plane for your entire development desktop**
- **Infrastructure that lives in your system tray**
- **A native experience across macOS, Windows, and Linux**

This transforms Control from "web app for task management" into what it was always meant to be: **the operating system for your coding work**.
