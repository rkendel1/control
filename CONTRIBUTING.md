# Contributing to Control

Install Node.js 22+, npm, Rust, platform Tauri prerequisites, and the Tauri CLI.

```bash
git clone <repository-url>
cd control
cd src-ui && npm ci && npm test && npm run build
cd ../src-tauri && cargo test
```

Keep changes within the canonical architecture documented in `AGENTS.md`.
Features that create a second durable store, bypass FeltDB Work identity, emit
fake agent activity, or weaken runtime permissions are not accepted.

Before submitting a change, run UI tests/build and native formatting/tests. For
packaging or end-to-end workflow changes, rebuild the desktop bundle and run the
packaged self-test.
