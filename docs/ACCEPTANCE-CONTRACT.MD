Control — GA Product & Acceptance Contract

0. North Star

Control is the native, cross-platform, durable workspace where people and AI work together to accomplish engineering Work.

Control brings together:

* Projects
* repositories
* Work
* tasks
* humans
* Intelligence
* Skills
* capabilities
* conversations
* inboxes
* decisions
* terminals
* files
* Git
* research
* evidence
* execution
* tests
* reviews
* releases
* outcomes

into one durable system.

Control is built on FeltDB.

FeltDB is the durable application-state substrate.

The filesystem and Git remain authoritative for source.

The operating system remains authoritative for secrets.

AI providers, models, and execution runtimes are replaceable implementation capabilities.

The user should be able to install Control, open a project, begin meaningful work, close the application, return later, and continue without reconstructing context.

The same product must support:

* solo developers;
* teams;
* development organizations;
* enterprise organizations;
* human-only workflows;
* human + Intelligence workflows;
* parallel Intelligence workflows;
* local-first workflows;
* managed workflows;
* self-hosted workflows;
* hybrid workflows;
* macOS;
* Windows;
* Linux.

Ultimate acceptance test

Can a person or organization use Control as the primary place where engineering Work is captured, understood, coordinated, executed, communicated, verified, and remembered?

⸻

1. Product Definition

Control is not:

* an IDE replacement;
* an AI chatbot;
* an issue tracker;
* Slack for developers;
* a terminal emulator;
* an agent manager;
* a cloud control plane.

Control integrates those capabilities around a common durable model of Work.

The fundamental product primitive is:

Work is durable engineering intent shared by people, Intelligence, projects, conversations, executions, decisions, evidence, and outcomes.

A Work item can have multiple conversations:

Work
├── Main discussion
├── Architecture discussion
├── Implementation discussion
├── Code review
└── Release discussion

They all refer to the same Work.

The fundamental relationship is:

Work
  ↓
Conversation
  ↓
Action / Decision / Run
  ↓
Evidence
  ↓
Outcome

Work is what is being accomplished. Conversation is how participants coordinate around it.

⸻

2. Core Product Loop

The minimum complete loop is:

Capture
   ↓
Triage
   ↓
Understand
   ↓
Plan
   ↓
Assign
   ↓
Execute
   ↓
Observe
   ↓
Communicate
   ↓
Decide
   ↓
Verify
   ↓
Review
   ↓
Complete
   ↓
Remember

Any participant may initiate or advance the loop.

The system must preserve resulting context.

The loop must work whether execution is:

Human
Human + Intelligence
Parallel Intelligence Runs
Human + Human

⸻

3. Fundamental Product Model

Control has six fundamental concepts:

Work
Intelligence
Skill
Capability
Run
Participant

3.1 Work

Work is the durable objective being accomplished.

Examples:

* fix authentication;
* migrate Postgres to FeltDB;
* prepare an App Store release;
* investigate replication behavior;
* build a feature;
* research an architecture;
* resolve a production problem.

Work owns the durable context surrounding the objective.

⸻

3.2 Intelligence

Intelligence is Control’s reasoning capability.

The user interacts primarily with Control Intelligence, not individual AI vendors.

Underneath, Control may use:

* OpenAI;
* Anthropic;
* Gemini;
* local models;
* Easy-LLM;
* external runtimes;
* future providers.

The model and provider are implementation details.

A user should be able to say:

“Investigate this.”

without first choosing a model or “agent.”

⸻

3.3 Skill

A Skill describes reusable expertise, methodology, instructions, or domain knowledge.

Examples:

Rust development
React development
Architecture review
Migration planning
Security review
Apple release
Research
Database optimization

A Skill may be represented by a SKILL.md-style artifact or structured equivalent.

A Skill is not an Agent.

A Skill does not own Work.

A Skill does not own identity.

A Skill can be applied to many Runs.

⸻

3.4 Capability

A Capability describes what Intelligence is authorized to do.

Examples:

Read files
Write files
Search repository
Run terminal commands
Run tests
Use Git
Inspect logs
Perform research
Build artifacts
Deploy

Capabilities are subject to permissions and organizational policy.

⸻

3.5 Run

A Run is a concrete execution instance.

Work
  ↓
Run
  ↓
Intelligence + Skills + Capabilities + Context

A Run owns execution state.

Multiple Runs can operate against the same Work.

Runs are not Agents.

⸻

3.6 Participant

A Participant is a person or system actor participating in Work.

Humans are first-class participants.

Control Intelligence may participate in Work.

The architecture must not require AI to be modeled as a persistent employee-like Agent.

⸻

4. No Agent-Centric Product Model

The following is not a GA requirement:

Architect Agent
Research Agent
Coding Agent
Testing Agent
Review Agent
Release Agent

These can instead be expressed as:

Work
+
Control Intelligence
+
Skill
+
Capability
+
Policy
+
Run

For example:

Work:
    "Migrate this repository to FeltDB"
Skills:
    Rust
    Database Migration
    Architecture
Capabilities:
    Repository read/write
    Terminal
    Tests
Policy:
    No production deployment
Run:
    Migration implementation

This is the canonical model.

GA requirement

A user must be able to accomplish substantial Work without ever needing to:

* create an Agent;
* configure an Agent;
* select an Agent;
* manage an Agent;
* understand which Agent is running.

⸻

5. The Fundamental Work Graph

Control is a durable graph, not a collection of disconnected screens.

                         Workspace
                            │
                         Project
                            │
                           Work
          ┌─────────────────┼──────────────────┐
          │                 │                  │
        Tasks         Conversations       Research
          │                 │                  │
        Runs             Messages          Evidence
          │                 │                  │
       Changes         Decisions            Claims
          │                 │                  │
        Tests            Actions           Outcomes

Across all of this:

People
   │
Intelligence
   │
Skills
   │
Capabilities

Every important object must have durable identity and durable relationships.

Navigating between surfaces must navigate the same underlying graph.

No surface may fork the data model.

⸻

6. One Durable Source of Application State

All meaningful Control state must resolve to canonical durable records.

Minimum state includes:

* Workspaces;
* Projects;
* repositories;
* Work;
* tasks;
* dependencies;
* users/participants;
* Skills;
* Intelligence configuration;
* capabilities and policies;
* conversations;
* messages;
* inbox items;
* decisions;
* investigations;
* claims;
* evidence;
* Runs;
* Run events;
* terminal sessions;
* changes;
* tests;
* outcomes;
* activity;
* recovery records;
* persistent UI state where required.

No production UI may contain an independent mock or in-memory domain implementation.

No feature may silently maintain a second source of truth.

No demo state may appear in the production product.

⸻

7. FeltDB Contract

FeltDB is the canonical durable application-state substrate.

Control must use FeltDB rather than inventing a parallel application persistence system.

FeltDB-backed state must survive:

* application restart;
* machine restart;
* export;
* restore;
* synchronization;
* deployment migration;
* Work handoff;
* organizational changes.

Control must not assume FeltDB is always:

* local;
* remote;
* hosted;
* self-hosted;
* browser-only;
* server-backed.

The application must operate through a FeltDB abstraction capable of representing supported deployment topologies.

⸻

8. Source Authority

Source code remains in project directories.

Git remains the source-history authority.

Control may record:

* file relationships;
* changes;
* diffs;
* branches;
* worktrees;
* commits;
* provenance.

Control must not require source code to be duplicated into FeltDB simply to provide context.

A failed Control operation must never destroy or replace authoritative source.

⸻

9. Secrets

Secrets must remain outside general application state.

Use platform secure credential facilities.

Secrets must never be persisted into:

* normal FeltDB collections;
* activity;
* Run events;
* terminal output;
* crash reports;
* normal logs;
* Intelligence messages.

⸻

10. Deployment Topologies

Control must support four deployment profiles.

10.1 Solo / Local

Control
 │
 ├── React
 ├── Tauri
 ├── ControlCore
 └── Local FeltDB

Requirements:

* no account required for basic local use;
* no server required;
* core functionality works offline;
* durable local state;
* local source;
* local credentials;
* backup/export;
* restore.

⸻

10.2 Team / Managed

Developer A ─┐
Developer B ─┼── Control ──► Managed FeltDB
Developer C ─┘

Supports:

* shared Projects;
* shared Work;
* assignments;
* conversations;
* decisions;
* activity;
* shared Intelligence;
* organization policies;
* authorization;
* synchronization.

⸻

10.3 Self-Hosted

Organizations may operate their own FeltDB infrastructure.

Control must support organization-managed FeltDB without requiring Control’s hosted infrastructure.

The organization owns its:

* deployment;
* storage;
* network boundary;
* access policy;
* data residency.

⸻

10.4 Hybrid

                    Control
                   /       \
                  /         \
        Local FeltDB      Org FeltDB
             │                │
        private state     shared state

Examples of local state:

* local terminal;
* machine configuration;
* local filesystem state;
* credentials;
* private execution state.

Examples of shared state:

* Work;
* tasks;
* decisions;
* conversations;
* evidence;
* Runs;
* organizational activity.

⸻

11. Deployment Acceptance Gates

* Solo local mode works without an account.
* Solo local mode works without a server.
* Core local workflow works offline.
* Managed mode works.
* Self-hosted mode works.
* Hybrid topology works.
* Domain model is consistent across topologies.
* Export works.
* Restore works.
* Durable identities survive migration.
* Users can determine where their data lives.
* Control does not make user data dependent on Control’s hosted service.

⸻

12. Human Collaboration

Humans are first-class organizational participants.

Participants must be able to:

* communicate;
* ask questions;
* provide answers;
* assign Work;
* hand off Work;
* request reviews;
* request evidence;
* make decisions;
* provide feedback;
* escalate;
* approve;
* reject.

Communication associated with Work is durable.

⸻

13. Intelligence Collaboration

Control Intelligence must be capable of participating in Work.

It can:

* inspect;
* reason;
* research;
* plan;
* modify;
* execute;
* test;
* report;
* ask;
* receive feedback;
* make proposed decisions;
* request approval.

It does not need a persistent “Agent” identity for every specialization.

Parallel Intelligence

Multiple Runs may operate simultaneously:

Work
 ├── Run A — Research
 ├── Run B — Implementation
 └── Run C — Verification

They coordinate through canonical Work state.

This is preferred over inventing a mandatory agent-to-agent messaging topology.

⸻

14. Human ↔ Intelligence Communication

Control Intelligence must be able to ask for:

* clarification;
* decisions;
* permissions;
* feedback;
* additional evidence;
* human review.

Example:

Control:
I found two viable approaches.
A: ...
B: ...
I recommend A because ...
How would you like me to proceed?

The answer becomes durable Work context.

The Run does not lose its identity.

⸻

15. Human ↔ Human Communication

Authorized developers and organizational participants must be able to communicate around shared Work.

Developer A
     ↓
    Work
     ↓
Conversation
     ↓
Developer B

The conversation remains attached to Work.

A developer joining later should be able to understand:

* what is being done;
* what happened;
* what remains;
* what decisions were made;
* what Control did;
* what other participants changed.

⸻

16. Intelligence Handoff

Direct Agent-to-Agent communication is not a required domain primitive.

Instead:

Run A
  ↓
Work context / evidence / result
  ↓
Run B

If a Run needs another specialization, Control may initiate another Run with appropriate:

* Skills;
* Capabilities;
* context;
* permissions;
* runtime.

The receiving Run must not require manual reconstruction of relevant Work context.

If direct autonomous delegation becomes useful later, it can be added without changing the core Work model.

⸻

17. “Who Answers?”

Users must be able to control who handles questions.

Possible targets:

Current Control Intelligence
Another Intelligence configuration
Human teammate
Multiple participants
Automatic routing

The user must not be forced to manage model/provider details to make this choice.

Switching who answers must not fork Work.

⸻

18. Shared Work Context

Participants and Runs operating on the same Work share canonical durable context.

There must not be separate divergent versions of:

What are we doing?

Why are we doing it?

What has happened?

What has changed?

What decisions were made?

What remains unresolved?

Private context may exist.

Canonical Work context cannot.

⸻

19. Permissions and Governance

Authorization must consider:

Organization
    ↓
Participant
    ↓
Role
    ↓
Project
    ↓
Work
    ↓
Capability

Intelligence does not automatically receive human permissions.

Capabilities must be explicit.

For example:

READ:
    Project A
WRITE:
    feature branch
EXECUTE:
    tests
CANNOT:
    production secrets
    Project B
    production deployment

Intelligence cannot grant itself capabilities through conversation.

⸻

20. Skills Contract

Skills must be portable and reusable.

A Skill may define:

* purpose;
* instructions;
* expected methodology;
* domain knowledge;
* constraints;
* optional capabilities.

Skills must not secretly contain application state.

Skills must not become disguised Agents.

Skills should be reusable across multiple Work items and Runs.

⸻

21. Intelligence Provider Independence

Control must not be coupled to a particular AI vendor.

The architecture should permit:

Control
   ↓
Intelligence Runtime
   ↓
automatic routing
   ↓
appropriate model/provider

Easy-LLM is the preferred abstraction for provider/model routing where appropriate.

Changing providers must not change:

* Work identity;
* conversations;
* decisions;
* Skills;
* history;
* Run records.

The Work survives the model.

⸻

22. Work

Work is the universal unit of engineering intent.

Work may represent:

* feature development;
* bug fixing;
* research;
* architecture;
* migration;
* review;
* release;
* production investigation;
* documentation;
* operational work.

Work may contain:

* tasks;
* participants;
* Intelligence Runs;
* conversations;
* investigations;
* decisions;
* changes;
* tests;
* evidence;
* feedback;
* outcomes.

⸻

23. Project

A Project represents a coherent engineering environment.

It may contain:

* one repository;
* multiple repositories;
* monorepos;
* related repositories;
* external services.

Project selection scopes the UI.

It never duplicates underlying state.

⸻

24. Runtime Model

Every actual execution is a supervised Run.

A Run includes:

* Run ID;
* Work ID;
* Task ID;
* Intelligence configuration;
* runtime;
* workspace;
* process identity;
* PID where applicable;
* start time;
* heartbeat;
* lifecycle;
* events;
* output;
* stop handle;
* result;
* recovery state.

Lifecycle:

queued
  ↓
starting
  ↓
running
  ├── awaiting_input
  │       ↓
  │     running
  ├── failed
  ├── stopped
  └── completed

Every dispatch must produce either:

* a visible Run;
* or a visible actionable error.

⸻

25. Runtime Safety

Intelligence execution must support:

* workspace isolation;
* capability restrictions;
* process supervision;
* resource limits;
* termination;
* cancellation;
* recovery;
* environment detection;
* filesystem observation;
* execution provenance.

No Intelligence Run may silently acquire capabilities because the operating system permits them.

⸻

26. Terminal

Terminal sessions are first-class.

Each session retains:

* session ID;
* Project;
* Work where applicable;
* workspace;
* cwd;
* process identity;
* lifecycle;
* output;
* exit status.

Requirements:

* correct cwd;
* persistent process lifecycle;
* navigation does not kill sessions;
* interruption works;
* output is captured appropriately;
* exit state is recorded;
* behavior is normalized across platforms.

⸻

27. Filesystem

Control must provide first-class filesystem awareness.

Requirements:

* deep files open;
* editing works;
* external changes are detected;
* file watching works;
* diffs are accurate;
* Git state is visible;
* changes can be associated with Work;
* recovery is safe;
* large repositories remain usable.

⸻

28. Git

Control understands Git without replacing it.

Required:

* repository discovery;
* status;
* branches;
* worktrees;
* diffs;
* changed files;
* commits;
* history;
* conflict visibility.

Control must never silently destroy uncommitted work.

⸻

29. Research and Investigation

Investigation is first-class Work.

Question
 ↓
Hypothesis
 ↓
Claim
 ↓
Evidence
 ↓
Contradiction
 ↓
Gap
 ↓
Conclusion
 ↓
Decision
 ↓
Implementation

Research must not exist only as chat history.

Conclusions must remain discoverable and reusable.

⸻

30. Evidence

Evidence establishes what actually happened.

Evidence may include:

* test results;
* build results;
* command output;
* source inspection;
* benchmarks;
* runtime events;
* research sources;
* reviews;
* deployment results.

Evidence should retain provenance:

* source;
* timestamp;
* participant;
* Work;
* Run;
* result.

Intelligence assertions alone are not sufficient evidence of completion.

⸻

31. Outcome

Meaningful Work must produce an explicit outcome.

Possible outcomes:

passed
failed
partially_verified
blocked
reopened
cancelled
unknown

Completion should expose:

Intent
Changes
Execution
Tests
Evidence
Remaining uncertainty
Outcome

⸻

32. Decisions

Decisions are durable records.

A Decision may contain:

* question;
* alternatives;
* selected option;
* rationale;
* participants;
* evidence;
* affected Work;
* timestamp.

Decisions must be discoverable later.

Control should not repeatedly ask questions whose answers already exist as durable decisions.

⸻

33. Inbox

The Inbox is the user’s attention boundary.

It contains things requiring human participation:

* Intelligence questions;
* teammate questions;
* approvals;
* decisions;
* reviews;
* failed Runs;
* blocked Work;
* escalations;
* handoffs;
* important notifications.

The Inbox is not merely a notification feed.

It is the queue of things that require human attention.

Control should minimize unnecessary interruption.

⸻

34. Activity

Activity reflects real system events.

Examples:

* Work created;
* task assigned;
* Run started;
* question asked;
* question answered;
* file changed;
* test executed;
* decision recorded;
* Run stopped;
* Run recovered;
* Work completed;
* Work reopened.

No synthetic production activity.

⸻

35. Recovery

Control assumes failures.

Failures include:

* Control crash;
* Intelligence crash;
* subprocess crash;
* terminal crash;
* machine restart;
* network interruption;
* remote runtime failure;
* partial synchronization;
* incomplete persistence.

On restart:

Persisted Run
     ↓
Reconciliation
     ↓
completed
failed
stopped
interrupted
recoverable

No Run may remain permanently ambiguous.

No uncontrolled zombie process may remain.

⸻

36. Cross-Platform Contract

Control is a first-class application on:

* macOS;
* Windows;
* Linux.

Each platform must provide functional equivalents for:

* filesystem;
* file watching;
* process execution;
* process interruption;
* terminal;
* Git;
* secure credentials;
* lifecycle;
* notifications where applicable;
* packaging;
* upgrades;
* crash recovery.

Platform-specific implementation differences are acceptable.

Platform-specific product semantics are not.

⸻

37. Desktop Architecture

                    CONTROL DESKTOP
                           │
                       React UI
                           │
                 Typed Tauri IPC
                     + Events
                           │
                           ▼
                  Rust ControlCore
                           │
       ┌───────────────────┼────────────────────┐
       │                   │                    │
 Workspace Service     Work Service       Collaboration
       │                   │                    │
 Project/Repo          Task/Run             Conversation
 Service               Service              Inbox
       │                   │                  Decision
 File/Git/            Intelligence          Identity
 Terminal             Runtime               Policy
       │                   │                    │
       └───────────────────┼────────────────────┘
                           │
                           ▼
                     FeltDB Adapter
                           │
             ┌─────────────┼─────────────┐
             │             │             │
           Local         Managed      Self-hosted
           FeltDB        FeltDB          FeltDB

The Tauri process owns native lifecycle and process supervision.

The React UI never becomes authoritative for durable state.

⸻

38. Desktop Surfaces

Primary navigation:

Workbench
Work
Tasks
Conversations
Inbox
Decisions
Activity
Projects
Settings

Advanced views may expose:

* Intelligence;
* Skills;
* capabilities;
* runtimes;
* provider configuration.

These are configuration surfaces, not the primary mental model.

These views must not make users feel like they are operating an AI control panel.

⸻

39. Workbench

The Workbench is the primary daily-driver surface.

It must show the current engineering context:

Project
Work
Tasks
Active Runs
Conversations
Questions
Changed Files
Tests
Evidence
Decisions
Outcome

Selecting Work or Run binds the context.

The developer should not have to manually reconstruct:

task
→ chat
→ terminal
→ AI
→ diff
→ tests
→ decision

⸻

40. Daily-Driver Contract

A developer must be able to perform the normal engineering loop inside Control:

Capture idea
→ create Work
→ triage
→ investigate
→ converse
→ plan
→ execute
→ inspect
→ edit
→ test
→ review
→ decide
→ provide feedback
→ complete

For collaborative Work:

Person
   ↕
Person
   ↕
Control Intelligence
   ↕
Control Intelligence Run

must be possible without losing Work context.

If ordinary engineering activity routinely requires leaving Control to reconstruct context, the relevant Control capability is incomplete.

⸻

41. Packaging

The packaged application is the product.

The packaged build must work without:

* repository source;
* Next.js;
* Vite development server;
* localhost API;
* fixed port;
* development environment;
* manually started FeltDB;
* development credentials.

Clean installation must work on all three operating systems.

⸻

42. Security

Minimum requirements:

* OS secure credential storage;
* no secrets in FeltDB general state;
* no secrets in logs;
* scoped capabilities;
* scoped filesystem access;
* supervised process execution;
* organizational authorization;
* authentication where required;
* self-hosted data boundaries;
* provider policies;
* no development credentials in packages.

⸻

43. Privacy and Data Residency

Control must clearly communicate:

* where application state lives;
* where source lives;
* where credentials live;
* where Runs execute;
* where AI requests go;
* which state is local;
* which state is shared.

Organizations must be able to establish boundaries around:

* source;
* AI providers;
* Intelligence execution;
* organizational state;
* data residency.

⸻

44. No Lock-In

Control must not make engineering state hostage to Control’s hosted service.

Requirements:

* local Work remains locally usable;
* data can be backed up;
* data can be exported;
* data can be restored;
* managed Workspaces can migrate;
* self-hosting remains viable;
* domain state is not exclusively encoded in a proprietary cloud API.

⸻

45. Legacy Migration Boundary

The historical Mission Control web application is not part of the repository or
production architecture.

Requirements:

* domain behavior explicitly mapped;
* behavior ported into the canonical desktop and FeltDB graph;
* old Next.js API removed;
* legacy Rust commands and state removed;
* disabled commands not registered;
* legacy persistence not authoritative;
* legacy UI not required.

⸻

46. Repository-Wide Architecture Audit

This is a mandatory GA gate.

Every tracked repository file must be audited.

For every file we must know:

Why does it exist?
What does it do?
What does it contribute?
Who uses it?
Is it runtime reachable?
Is it canonical?
Is it duplicated elsewhere?
Can it be removed?

The audit covers:

* Rust;
* React;
* packages;
* tests;
* fixtures;
* scripts;
* configuration;
* documentation;
* CI;
* generated artifacts;
* migration code;
* compatibility code;
* legacy code.

Every file receives a disposition:

KEEP
REFACTOR
MERGE
MOVE
REPLACE
DOCUMENT
MIGRATION-ONLY
DELETE

GA requires:

0 unknown-purpose files
0 unexplained duplicate architectures
0 unexplained sources of truth
0 unexplained production legacy paths

The audit must produce a repository inventory and architecture report.

⸻

47. Performance

Control must remain responsive while real work is occurring.

The UI must not freeze because:

* Intelligence is running;
* terminals are active;
* repositories are indexing;
* events are streaming;
* diffs are large;
* tests are running;
* FeltDB is processing operations;
* multiple participants are communicating.

Long operations must be asynchronous.

Realistic repositories and event volumes must be used for performance validation.

⸻

48. Reliability

Control prioritizes integrity over convenience.

It must:

* avoid silent state loss;
* avoid silent event drops;
* preserve required ordering;
* detect incomplete execution;
* expose failures;
* recover from restart;
* prevent duplicate execution where required;
* preserve durable identity;
* preserve relationships.

⸻

49. End-to-End Acceptance Scenarios

A. Solo Developer

Install
→ open repository
→ create Work
→ ask Control to investigate
→ Intelligence investigates
→ asks question
→ answer
→ Intelligence implements
→ inspect diff
→ run tests
→ review
→ complete
→ quit
→ restart
→ continue

All context survives.

⸻

B. Human-to-Human

Developer A
→ creates Work
→ asks Developer B for review
→ B receives Inbox item
→ B responds
→ decision recorded
→ A continues

⸻

C. Human-to-Intelligence

Human
→ creates Work
→ asks Control to execute
→ Run begins
→ Intelligence asks question
→ Human answers
→ Run resumes
→ result produced

⸻

D. Parallel Intelligence

Work
 ├── Research Run
 ├── Implementation Run
 └── Verification Run

All Runs operate against shared durable Work context.

⸻

E. Intelligence Handoff

Run A
→ reaches boundary
→ Work context recorded
→ Run B starts
→ B receives relevant context
→ B continues
→ outcome recorded

No manual context reconstruction.

⸻

F. Research → Implementation

Investigation
→ evidence
→ conclusion
→ decision
→ implementation Work
→ execution
→ tests
→ evidence
→ review
→ outcome

⸻

G. Crash Recovery

Run active
→ Control crashes
→ restart
→ Run reconciled
→ explicit interrupted/recoverable state
→ user continues safely

No zombie.

No lost Work.

No permanently ambiguous Run.

⸻

H. Machine Migration

Machine A
→ backup/export
→ Machine B
→ restore
→ reconnect repository
→ Work/conversations/decisions/evidence preserved

⸻

I. Organization

Developer A
→ opens Project
→ sees Work
Developer B
→ receives assigned Work
Control Intelligence
→ executes
Intelligence
→ asks Developer B
Developer B
→ responds
Intelligence
→ continues
Developer A
→ reviews
Decision
→ recorded
Outcome
→ recorded

⸻

J. Self-Hosted

Organization deploys FeltDB
→ Control connects
→ organization creates Project
→ people collaborate
→ Control Intelligence executes
→ organizational state remains within configured boundary

⸻

K. Cross-Platform

The same logical Work must remain usable across:

macOS
Windows
Linux

without changing the domain model or losing context.

⸻

50. Automated GA Gates

Architecture

* ControlCore is the native service boundary.
* FeltDB is canonical application state.
* Work is the universal correlation primitive.
* Human identity is durable.
* Intelligence configuration is durable where required.
* Skills are durable and reusable.
* Capabilities are explicit.
* Conversations are durable.
* Evidence is first-class.
* Outcomes are first-class.
* Relationships are durable.
* Source remains filesystem/Git authoritative.
* Secrets remain outside general state.
* No Agent entity is required for ordinary Work.
* No Buzz abstraction exists.

Product

* Solo mode.
* Managed mode.
* Self-hosted mode.
* Hybrid architecture.
* Human-to-human collaboration.
* Human-to-Intelligence collaboration.
* Intelligence-to-human questions.
* Parallel Intelligence Runs.
* Intelligence handoff through Work context.
* Human escalation.
* Provider neutrality.
* Runtime neutrality.
* Skill portability.
* Capability governance.

Desktop

* macOS.
* Windows.
* Linux.
* Packaged installation.
* Filesystem.
* Git.
* Terminal.
* Credentials.
* Process supervision.
* Updates.
* Crash recovery.

Durability

* Restart.
* Crash recovery.
* Export.
* Restore.
* Migration.
* Synchronization.
* Durable identity.
* Durable relationships.
* No silent state loss.

Collaboration

* Organization identity.
* Participant model.
* Permissions.
* Capabilities.
* Human Inbox.
* Shared conversations.
* Handoffs.
* Escalation.
* Decisions.
* Provenance.

Verification

* Real diffs.
* Real tests.
* Real execution.
* Real evidence.
* Explicit outcomes.
* No completion based solely on Intelligence assertion.

UX

* No demo state.
* No duplicate state.
* No placeholder execution.
* No orphan conversations.
* No lost context.
* Workbench supports normal daily workflow.
* Collaboration is understandable.
* Data location is understandable.
* Users do not need to understand AI infrastructure to use Control.

Repository

* Complete repository audit.
* Every file has a known purpose.
* Dead code removed or explicitly accepted.
* Duplicate implementations removed or explicitly accepted.
* Legacy production paths eliminated.
* Dependencies audited.
* IPC audited.
* UI audited.
* Tests audited.
* Security audited.
* Packaging audited.

⸻

51. Maturity Model

Every capability is measured:

NOT STARTED
    ↓
IMPLEMENTED
    ↓
INTEGRATED
    ↓
AUTOMATED
    ↓
PACKAGED
    ↓
CROSS-PLATFORM VERIFIED
    ↓
PRODUCTION VERIFIED
    ↓
DAILY-DRIVER PROVEN

Implemented

Code exists.

Integrated

Uses ControlCore and canonical FeltDB state.

Automated

Automated tests cover behavior.

Packaged

Works in the real desktop application.

Cross-Platform Verified

Works on macOS, Windows, and Linux.

Production Verified

Persistence, failure, security, recovery, and realistic workload tests pass.

Daily-Driver Proven

Real engineering Work can be performed without routine fallback to another application.

⸻

52. Final Daily-Driver Test

A developer starts with:

“I need to figure something out.”

Control should support:

Capture
   ↓
Understand context
   ↓
Create Work
   ↓
Research
   ↓
Discuss
   ↓
Plan
   ↓
Execute
   ↓
Observe
   ↓
Ask / answer questions
   ↓
Change code
   ↓
Run tests
   ↓
Review
   ↓
Decide
   ↓
Verify
   ↓
Complete

Tomorrow:

Open Control
      ↓
Context is still there
      ↓
Work continues

For a team:

Person
   ↕
Person
   ↕
Control Intelligence
   ↕
Control Intelligence Run
   ↕
Person

For an organization:

Many people
     +
Many Work items
     +
Many Intelligence Runs
     +
Many Projects
     +
Many runtimes
          ↓
One durable Work graph

⸻

53. The Ultimate Product Test

Control is not GA because every feature exists.

Control is GA when these statements are simultaneously true:

1. A solo developer can trust it.

Their engineering context survives application, machine, network, and workflow interruptions.

2. A team can coordinate through it.

People can communicate, assign, review, decide, and execute without splitting context across disconnected systems.

3. Intelligence can actually work.

Control can reason, research, modify, execute, test, report, ask, and continue within explicit boundaries.

4. Humans remain in control.

Intelligence can act autonomously within explicit boundaries, while humans can inspect, redirect, approve, stop, and override.

5. Work remains the source of context.

The user does not have to remember which chat, AI system, terminal, issue, branch, or application contains the truth.

6. FeltDB remains the durable substrate.

The product works because application state is durable, relational, portable, and recoverable.

7. Deployment is a choice.

The same Control product can operate:

Local
Managed
Self-hosted
Hybrid

without changing its fundamental domain model.

8. The platform is real.

Control works as a packaged native application on:

macOS
Windows
Linux

9. Evidence beats assertion.

The system can distinguish:

“Control says it worked.”

from:

“The system has evidence that it worked.”

10. The developer stops thinking about the machinery.



54. Operational Memory & Repository Guidance

Control must eliminate routine reliance on developer memory for repository operations.

The system must understand the operational contract of the project it is working on.

At minimum, Control should be able to answer:

* Is the README current?
* What changed since the README was last verified?
* How do I build this project?
* How do I run it?
* How do I test it?
* How do I lint/typecheck it?
* How do I deploy it?
* What is the deployment target?
* What command deploys this specific component?
* What prerequisites are required?
* Which environment/configuration is required?
* What changed that might invalidate existing instructions?
* What commands have previously succeeded?
* What commands have failed?
* What is the canonical command for this operation?

56.1 Repository Operational Model

A Project should maintain a durable Repository Operational Model.

Project
  │
  └── Repository
       ├── Structure
       ├── Components
       ├── Commands
       ├── Environments
       ├── Deployment Targets
       ├── Dependencies
       ├── Documentation
       ├── Conventions
       └── Operational History

Commands should be modeled as structured capabilities rather than merely text snippets.

For example:

deploy
  target: control-desktop
  environment: production
  command: ...
  prerequisites: ...
  source: ...
  last_verified: ...
  verified_by: ...
  result: passed

This allows Control to distinguish:

“I found this command in an old README.”

from:

“This is the repository’s verified deployment command.”

54.2 Documentation Drift

Control must detect likely documentation drift.

Examples:

README says:
pnpm deploy:web
Repository currently contains:
pnpm deploy:desktop
pnpm deploy:control
⚠ Documentation may be stale.

Changes that may trigger documentation review include:

* package scripts changing;
* deployment configuration changing;
* application architecture changing;
* renamed commands;
* removed commands;
* added components;
* changed environment variables;
* changed ports;
* changed build requirements;
* changed repository structure.

The system does not need to automatically rewrite documentation.

It must be able to say:

README needs review because the deployment interface changed.

54.3 “How Do I…?” Must Be First-Class

A developer should be able to ask:

“How do I deploy just Control?”

and receive something grounded in the actual repository:

Deploy Control Desktop
Target:
  control-desktop
Command:
  ...
Prerequisites:
  ...
Last verified:
  2 hours ago
Last successful execution:
  ...
Source:
  package.json / deploy config / documentation

Likewise:

“How do I run the tests?”

“How do I deploy only the backend?”

“How do I build the Windows package?”

“How do I publish the macOS release?”

“What changed since the last release?”

54.4 Commands Must Be Executable

When appropriate, Control should offer:

Run

rather than forcing the developer to copy/paste a command.

The execution becomes a normal Control Run:

Operational Intent
       ↓
Verified Command
       ↓
Run
       ↓
Output
       ↓
Evidence
       ↓
Outcome

So “deploy this” isn’t a chat answer.

It’s an executable, observable Work operation.

54.5 Documentation as Evidence

Documentation itself should have provenance.

For example:

README deployment instructions
        │
        ├── verified against package scripts
        ├── verified against deployment configuration
        ├── last successful execution
        └── last modified

That lets Control eventually surface something much more useful than:

README updated: August 18

Instead:

Deployment documentation verified

The documented Control deployment command successfully executed against the current repository on August 21.

That’s a fundamentally different level of confidence.

⸻

And I would make this part of the Workbench

The Workbench shouldn’t just show active tasks.

It should have an Operational Context section:

Project: Control

You might need	Status
Build	✅ Verified
Tests	✅ Verified
Deploy Control	✅ Verified
Deploy Studio	⚠ Changed recently
README	⚠ Review recommended
Environment	✅ Configured
Git	3 uncommitted changes

And a command palette:

⌘K / Ctrl+K

with things like:

Deploy Control
Build current project
Run tests
Open repository README
Check documentation drift
Explain project structure
Show changed operational commands
Show deployment targets
Verify README

This is where I think the product gets considerably more interesting.

You’re not building another place to write code.

You’re building the place that maintains the operational understanding of the software being built.

And that connects directly to the rest of the contract:

Repository
    ↓
Understand
    ↓
Work
    ↓
Conversation
    ↓
Agent/Human
    ↓
Execution
    ↓
Evidence
    ↓
Documentation
    ↓
Verified operational knowledge

The annoying thought of “wait, what’s the command again?” should eventually disappear because Control knows.

And importantly, it shouldn’t know because someone stuffed commands into a skill.md. It should know because it has observed, verified, and persisted the repository’s actual operational behavior.


55. North Star

                         CONTROL
                            │
                 Human + Intelligence
                       Workspace
                            │
                       ControlCore
                            │
                          FeltDB
                            │
             ┌──────────────┼──────────────┐
             │              │              │
           Local          Managed       Self-hosted
             │              │              │
             └──────────────┼──────────────┘
                            │
                         Hybrid
                            │
                            ▼
                    Durable Work Graph
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
        People         Intelligence        Systems
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                       Conversations
                            │
                         Decisions
                            │
                           Runs
                            │
                         Evidence
                            │
                          Outcome

Control is the product.

Work is the primitive.

People are participants.

Control Intelligence is the AI capability.

Skills describe expertise.

Capabilities define authority.

Runs describe execution.

Conversations coordinate Work.

Evidence establishes reality.

FeltDB is durable application state.

Git and the filesystem are source authority.

Deployment topology is a choice.

The developer remains in control.

And the GA question is no longer:

“Can we demo our AI agents?”

It is:

“Can we trust Control with the work that matters tomorrow morning?”

That is the contract I would now freeze against.
