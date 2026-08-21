# Control coding-agent instructions

Control is a native Tauri desktop. Do not recreate or depend on the retired
Mission Control web application, JSON stores, daemon, or API routes.

## Canonical architecture

- FeltDB owns Work, Tasks, Runs, Run events, Conversations, Messages, Inbox,
  Decisions, Evidence, Outcomes, Activity, agents, projects, and durable UI state.
- The workspace filesystem owns source content.
- Git owns repository history and status.
- The OS keychain owns credentials.
- Rust and the operating system own live processes and PTYs.
- React state is ephemeral presentation state only.

Production flow:

```text
src-ui/main.tsx → bootstrap.tsx → Workbench / CoordinationPanel
→ typed Tauri IPC → src-tauri/src/commands.rs
→ native services and FeltDB
```

## Required checks

For UI/domain changes:

```bash
cd src-ui && npm test && npm run build
```

For native changes:

```bash
cd src-tauri && cargo fmt --check && cargo test
```

Changes affecting packaged workflows must also rebuild the Tauri app and run the
isolated packaged self-test described in `docs/DAILY-DRIVER-AUDIT.md`.

Preserve user worktree changes. Use `rg` for discovery and `apply_patch` for
edits. Never introduce demo state, fake runs, alternate persistence, or a command
that bypasses the canonical Work graph.
