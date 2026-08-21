# Unified Desktop Architecture

## Product contract

Control is one native daily-driver application. A project, task, agent run, message,
decision, terminal, and file change must refer to the same durable records. No UI
surface may ship with demo state or a second in-memory implementation.

The minimum complete loop is:

```text
Capture -> triage -> assign -> execute -> observe -> converse/decide -> review -> complete
                         |          |              |             |
                      workspace   events         inbox         diff/tests
```

## Canonical architecture

```text
React desktop UI
      |
      | typed Tauri commands + events
      v
Rust ControlCore (native services) <-> FeltDB (canonical durable state)
  |-- project/workspace service
  |-- task/triage service
  |-- agent/runtime supervisor
  |-- conversation/inbox/decision service
  |-- file/git/terminal service
  `-- process/event bridge            |-- tasks/runs/activity
                                      |-- projects/agents
                                      `-- conversations/decisions
```

The Tauri process owns native lifecycle, process supervision, topology bootstrap,
and OS credentials. One selected FeltDB runtime owns canonical application state:
the durable browser runtime in IndexedDB for local mode, or authenticated FeltDB
HTTP for managed/self-hosted mode. The desktop application does not depend on a
Next.js server or a fixed port in local mode.

## Migration boundary

Migration from the historical Mission Control web/JSON architecture is complete.
The legacy application, daemon, JSON stores, UI graph, compatibility IPC, and
native JSON state were removed after a file-level reachability audit. The desktop
`src-ui` and `src-tauri` trees are the only shipping implementation; every
registered native command has a production caller.

## Durable data

Application data is stored in the durable `control-desktop` FeltDB namespace,
never ad-hoc JSON in the launch working directory. Control exports and restores a
topology-neutral logical snapshot with stable record identity; legacy embedded
operation-log backups remain importable in local mode. Required collections are:

- projects and per-project UI state;
- agents and runtime configuration;
- durable human/agent/system participants and the current local principal;
- fail-closed agent execution policies for filesystem, shell, and network access;
- Work, tasks, dependencies, comments, and feedback;
- runs and append-only execution events;
- conversations/messages and inbox threads;
- durable participant Inbox actions for assignment, handoff, questions, review,
  escalation, approval, evidence requests, and feedback;
- decisions/approvals;
- evidence, explicit outcomes, activity journal, and recovery metadata.
- investigations with hypotheses, sources, contradictions, gaps, and conclusions.

Source files remain in their project directories. Secrets use the OS keychain and
must never be written into the general data store or execution logs.

## Runtime lifecycle

Each run is a supervised child process with a PID, selected runtime, workspace,
start time, heartbeat, captured event/output stream, stop handle, and terminal
result. State transitions are enforced:

```text
queued -> starting -> running -> awaiting_input -> completed
                          |             |             |
                          +-> failed    +-> running   +-> feedback/reopen
                          `-> stopped
```

Creating a task does not silently imply execution. Quick Capture may opt into
auto-triage/auto-dispatch, while the full form makes assignment and dispatch clear.
Every dispatch either produces a visible run immediately or a visible error.

## Desktop surfaces

The primary shell contains persistent navigation for Workbench, Tasks, Agents,
Conversations, Inbox, Decisions, Activity, and Settings. Project selection scopes
the workbench and can filter the other surfaces; it never forks their data.

The right workbench panel is a live run/conversation panel, not placeholder data.
Selecting a task or run binds its messages, events, changed files, test results,
questions, and feedback into one inspectable timeline.

## Release gates

A daily-driver build is not ready until automated packaged-app tests prove:

1. projects and UI state survive restart;
2. deep files can be opened, edited, watched, diffed, and recovered;
3. terminals preserve cwd and processes can be interrupted;
4. tasks can be sorted, assigned, blocked, dispatched, stopped, and resumed;
5. real runtime events reach the UI and terminal results are recorded;
6. agents can ask questions and receive decisions without losing run context;
7. completion produces reviewable changes, tests, reports, and feedback;
8. crashes recover runs as interrupted rather than leaving zombies;
9. no core surface contains hard-coded demo state;
10. the signed/package build works without the repository or a dev server.
