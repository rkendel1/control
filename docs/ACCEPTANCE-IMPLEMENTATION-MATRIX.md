# Acceptance implementation matrix

This is the executable companion to `ACCEPTANCE-CONTRACT.MD`. “Implemented” means a code path exists; “verified” additionally requires automated or packaged evidence. External deployment, signing, and multi-machine claims remain open until exercised in their real environments.

| Contract areas | Status | Implementation / evidence |
|---|---|---|
| 0–5 product model and Work graph | Implemented | FeltDB schema v14: Work, Intelligence, Skill, Capability, Run, Participant, Claims, Conversations, Tasks, Decisions, Evidence, Outcomes. Ordinary task/chat flow defaults to Control Intelligence and requires no profile selection. |
| 6–9 durable state, authority, secrets | Verified locally | `control-db.ts` rejects non-durable storage; filesystem/Git stay native-authoritative; OS credentials and secret redaction covered by tests. |
| 10–11 deployment topologies | Partial | Solo and authenticated server topologies are implemented with snapshot migration. Durable topology vocabulary includes solo/managed/self-hosted/hybrid. Real managed/self-hosted/hybrid deployment evidence is external and still required. |
| 12–20 collaboration, governance, Skills | Implemented locally | Participants, organizations, memberships, inbox, decisions, messages, handoffs, durable Skills and explicit capability approval/risk policies are in FeltDB. Multi-human authorization against a deployed server still needs environment evidence. |
| 21 provider independence | Implemented locally | Control Intelligence is the default product identity. Automatic routing prefers a compatible local Ollama coding integration, then compatible installed CLIs. OpenAI, Anthropic, OpenRouter, and Gemini credentials use the OS keychain. EasyLLM is not embedded: its client abstraction does not itself provide task routing or coding tools, so Control uses a typed native router at the supervised execution boundary. |
| 22–25 Work, Project, Runtime, safety | Implemented | Durable lifecycle, supervised native runs, queue/starting/running/awaiting-input/terminal states, heartbeat identity, permissions, timeouts, recovery. |
| 26–28 terminal, filesystem, Git | Verified locally | Native PTY sessions, project-root file boundary, editor/drafts, Git status/diff/stage/commit. Worktree/conflict UX remains a focused follow-up gate. |
| 29–35 research through recovery | Implemented | Investigations, Claims, Evidence, Outcomes, Decisions, Inbox, Activity, run recovery and durable artifacts. |
| 36–37 cross-platform desktop | Verified by build/tests | Tauri desktop and platform-specific shell behavior; CI matrix exists for macOS, Windows, Linux. Actual remote CI run is pending push. |
| 38–40 desktop surfaces/daily driver | Implemented | Workbench integrates projects, files, editor, Git, Tasks/Work, conversations, inbox, decisions, activity, runs, evidence, outcomes, terminal, and Operational Context. |
| 41 packaging | Verified locally | macOS debug/release bundles and packaged self-test pass. Windows/Linux bundles and Apple signing require their external builders/identity. |
| 42–46 security, privacy, migration, audit | Verified locally | Native boundary validation, secret handling, FeltDB backup/restore, legacy removal, repository audit (`CONTROL_REPOSITORY_AUDIT.md`). |
| 47 performance | Open verification gate | Functional paths exist; realistic-volume measurement and thresholds still require a dedicated benchmark run. |
| 48 reliability | Verified locally | Lifecycle/recovery/integrity tests and packaged self-test. Long-duration soak remains external evidence. |
| 49–53 E2E/GA/ultimate tests | Partial evidence | Local automated and packaged suites cover core solo flows. Team, managed, multi-machine, platform packaging and signing cannot be asserted from this workstation alone. |
| 54 operational memory | Implemented | Project-open discovery persists Repository models, package/Cargo commands, provenance, verification fields, guidance fingerprints and drift status. Operational Context can launch commands as durable Runs. |
| 55 frozen North Star | Enforced by model | Work is canonical; agent profiles remain migration/advanced execution configuration only. |

## Current evidence commands

```sh
cd src-ui && npm run type-check
cd src-ui && npm test
cd src-tauri && cargo test
```

The localhost FeltDB HTTP test needs permission to bind `127.0.0.1`; restricted sandboxes will report `EPERM` rather than a product failure.
