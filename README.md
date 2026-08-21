# Control

Control is a native developer desktop for projects, files, editing, terminals,
Git, agent execution, task triage, conversations, approvals, feedback, and
persistent run history.

FeltDB is the single durable source of truth for the Control Work graph. Source
files remain authoritative on disk, Git owns version history, credentials live
in the OS keychain, and live processes are supervised by the native runtime.

## Start development

Requirements: Node.js 22+, npm, Rust, and the Tauri CLI.

```bash
./start.sh
```

Windows:

```bat
start.bat
```

## Verify

```bash
cd src-ui && npm test && npm run build
cd ../src-tauri && cargo test
```

Build the desktop package:

```bash
cd src-tauri && cargo tauri build
```

## Architecture

- `src-ui/` — React workbench and canonical FeltDB domain graph.
- `src-tauri/` — filesystem, Git, PTY, watcher, secure credential, and supervised
  agent-runtime boundaries.
- `docs/UNIFIED-DESKTOP-ARCHITECTURE.md` — authoritative architecture.
- `docs/DAILY-DRIVER-AUDIT.md` — user-visible completion ledger.
- `CONTROL_REPOSITORY_AUDIT.md` and `control-repository-audit.json` — repository
  integrity evidence.

Supported runtimes are Claude Code, Codex, OpenCode, and Ollama. Coding-capable Ollama models run through Ollama's headless Claude Code integration, giving supervised workspace-scoped Read/Edit/Write/Bash tools. Automatic routing prefers this local coding path when it is available, then falls back to compatible installed cloud CLIs.

Provider API keys for OpenAI, Anthropic, OpenRouter, and Gemini can be configured under **Intelligence → Provider credentials**. Keys remain in the operating-system credential store and are never written to FeltDB or backups. An installed Codex or Claude Code CLI receives its corresponding key at process launch.
Runtime availability is discovered locally; tasks fail closed when their policy
cannot be enforced.
