# Claude Code repository context

Follow `AGENTS.md`. The current product is Control, a Tauri developer desktop;
FeltDB is its canonical durable data layer.

Read these documents before architectural work:

1. `docs/UNIFIED-DESKTOP-ARCHITECTURE.md`
2. `docs/ACCEPTANCE-CONTRACT.MD`
3. `docs/DAILY-DRIVER-AUDIT.md`
4. `CONTROL_REPOSITORY_AUDIT.md`

There is no supported JSON task store or separate daemon. Agent execution is
supervised through the native commands registered in `src-tauri/src/main.rs`.
