Yes. That should be an explicit GA gate, not a cleanup task we do after GA.

For Control especially, this matters because we’re migrating from mission-control and potentially have overlapping Rust services, UI components, commands, persistence implementations, tests, fixtures, legacy APIs, generated artifacts, and dead code. A product can pass functional tests while still carrying a confusing second architecture underneath.

I’d add a Repository Integrity & Architecture Audit as a mandatory pre-GA phase.

GA Gate: Complete Repository Audit

Objective

Every file in the repository must have an understood and defensible purpose.

At GA, we must be able to answer for every tracked file:

1. Why does this file exist?
2. What does it do?
3. What product capability does it contribute to?
4. What depends on it?
5. Is it production code, test code, tooling, documentation, configuration, generated output, migration material, or obsolete?
6. Is it actually referenced?
7. Is it reachable in the packaged application?
8. Is it part of the canonical architecture?
9. Can it be removed?
10. If it cannot be removed, why?

⸻

Repository Audit Contract

The audit must cover 100% of repository files, not merely source files.

That includes:

src/
src-ui/
src-tauri/
crates/
packages/
tests/
fixtures/
scripts/
tools/
docs/
configuration
build files
CI/CD
assets
generated files
examples
templates
migration artifacts
legacy code

And all hidden/configuration files:

.gitignore
.github/*
*.toml
*.json
*.yaml
*.yml
*.config.*
Dockerfiles
workspace manifests
lockfiles
build scripts

⸻

1. Build a Complete Inventory

Generate a machine-readable inventory of every tracked file.

At minimum:

path
file_type
size
language
package/crate
owner/domain
production_or_nonproduction
generated
tracked
referenced
entry_point

The inventory itself becomes an audit artifact.

⸻

2. Classify Every File

Every file must receive exactly one primary classification:

CORE
INTEGRATION
TEST
TOOLING
BUILD
DOCUMENTATION
CONFIGURATION
GENERATED
MIGRATION
EXAMPLE
FIXTURE
LEGACY
DEAD
UNKNOWN

UNKNOWN is not acceptable at completion.

⸻

3. Establish Dependency Evidence

For every source file, determine:

Who imports it?
Who calls it?
Who constructs it?
Who references it?
What tests exercise it?
What binary/package includes it?

Do not infer usage from filename or directory placement.

Usage must be established through repository evidence.

⸻

4. Establish Runtime Reachability

A file being imported somewhere is not sufficient.

We need to distinguish:

source-reachable
build-reachable
runtime-reachable
packaged

For example:

legacy_api.rs
    ↓
imported by test helper
    ↓
NOT production runtime

is materially different from:

control_core.rs
    ↓
desktop binary
    ↓
packaged application

⸻

5. Find Dead Code

Explicitly search for:

* unreferenced source files;
* unused modules;
* unused functions;
* unused structs;
* unused commands;
* unused IPC handlers;
* unused UI components;
* unused hooks;
* unused types;
* unused dependencies;
* unused crates;
* unused npm packages;
* unused scripts;
* obsolete configuration;
* obsolete feature flags;
* abandoned experiments;
* duplicate implementations.

Every candidate gets a disposition:

REMOVE
KEEP
MERGE
REPLACE
DOCUMENT
INVESTIGATE

⸻

6. Find Duplicate Architecture

This is one of the most important parts.

Search for multiple implementations of the same responsibility.

Examples:

TaskService
TaskRepository
TaskStore
TaskContext
TaskManager
Task API
Task IPC
Task Hook

Determine whether each represents:

* intentional layering;
* migration duplication;
* accidental duplication;
* obsolete architecture.

The goal is not merely fewer files.

The goal is:

One obvious implementation of every core responsibility.

⸻

7. Find Second Sources of Truth

Explicitly audit for competing state systems.

Search for:

in-memory stores
JSON persistence
SQLite
Postgres
localStorage
IndexedDB
FeltDB
React state
Rust state
Next.js API state
filesystem state
cached domain state

For every state category, document its authority.

Example:

State	Authority
Work	FeltDB
Task	FeltDB
Conversation	FeltDB
Run events	FeltDB
Source	filesystem
Git history	Git
Secrets	OS keychain
Process state	OS/Rust supervisor
UI ephemeral state	React
UI durable state	FeltDB

Anything outside this model requires explicit justification.

⸻

8. Legacy Audit

The mission-control migration deserves its own forensic pass.

Every migrated or historical file must be classified:

REQUIRED MIGRATION REFERENCE
PORTED
PARTIALLY PORTED
SUPERSEDED
OBSOLETE
DELETE

The audit must prove that legacy code is not accidentally serving production behavior.

Specifically verify:

* old Next.js APIs;
* old persistence;
* old Rust commands;
* old domain services;
* old UI;
* compatibility shims;
* environment variables;
* ports;
* scripts;
* CI references.

The question is:

Could the legacy architecture be deleted without changing the shipped product?

The answer should be yes at GA.

⸻

9. UI Audit

Every UI component gets audited.

For each:

Component
Purpose
Route/surface
Data source
Production usage
State ownership
Tests
Placeholder/demo?
Duplicate?

We specifically eliminate:

demo data
fake activity
placeholder Runs
mock agents
fake conversations
hardcoded projects
sample tasks
temporary loading implementations
unused screens
dead navigation

If a surface exists in the GA application, it must be connected to real domain state.

⸻

10. IPC Audit

Every Tauri command and event gets audited.

For each:

Command/Event
Caller
Purpose
Domain service
Persistence interaction
Security boundary
Tests
Production reachable?

Delete:

* unused commands;
* duplicate commands;
* development-only commands accidentally registered;
* legacy commands;
* commands that bypass ControlCore.

The desired shape is:

React
 ↓
typed IPC
 ↓
ControlCore
 ↓
FeltDB / native services

Not:

React
 ├── random Rust command
 ├── local state
 ├── API call
 ├── legacy command
 └── FeltDB

⸻

11. Dependency Audit

Audit both:

Rust

* crates;
* features;
* build dependencies;
* optional dependencies;
* transitive concerns.

Node

* dependencies;
* dev dependencies;
* workspace packages;
* unused packages;
* duplicate packages;
* obsolete frameworks.

For every dependency:

Why do we need this?
Where is it used?
Could the platform provide it?
Could an existing dependency provide it?

Remove unnecessary dependencies.

⸻

12. Build & Tooling Audit

Every script must be classified.

Examples:

dev
build
test
lint
typecheck
package
release
migration
benchmark
debug
legacy

Determine whether it is still required.

A developer should not need tribal knowledge such as:

“Run this obscure script from three months ago before building Control.”

⸻

13. Test Audit

Tests need the same rigor.

For every test suite:

What behavior does this protect?
Is the behavior still part of GA?
Does it exercise production architecture?
Does it use mocks where a real integration test is required?
Is it duplicated?
Is it flaky?

Delete tests that protect removed architecture.

Add tests where current architecture lacks coverage.

Particular attention:

UI → IPC → ControlCore → FeltDB
agent → Run → events → UI
human → Inbox → agent
agent → agent
restart → recovery
export → restore
packaged application

⸻

14. Generated Artifact Audit

Identify files that should not be committed.

Examples:

build/
dist/
target/
generated/
coverage/
cache/
logs/
temporary databases
developer machine state

Each must have an explicit policy:

COMMIT
GENERATE
IGNORE
PUBLISH

⸻

15. Documentation Audit

Every architectural document must be checked against the implementation.

Remove obsolete documents.

Update surviving documents to reflect:

* Control;
* FeltDB;
* Work;
* human/agent collaboration;
* local/managed/self-hosted deployment;
* cross-platform architecture.

There must be one obvious architectural description.

⸻

16. Security Audit

Search the repository for:

* credentials;
* tokens;
* API keys;
* secrets;
* embedded endpoints;
* development bypasses;
* unsafe defaults;
* debug flags;
* test credentials;
* accidentally committed local configuration.

Also audit permissions around:

* filesystem;
* process execution;
* terminal;
* agent runtime;
* network;
* IPC.

⸻

17. Cross-Platform Audit

Every native implementation gets classified:

macOS
Windows
Linux
shared

Identify:

* platform assumptions;
* shell assumptions;
* path assumptions;
* process APIs;
* environment assumptions;
* filesystem assumptions;
* terminal assumptions.

No platform-specific code should accidentally become the universal implementation.

⸻

18. Packaging Audit

Starting from a clean machine:

Install Control
→ launch
→ create/open project
→ create Work
→ execute agent
→ use terminal
→ modify files
→ run tests
→ communicate
→ restart

The packaged application must not rely on repository files that weren’t intentionally included.

This catches a huge class of “works in development” problems.

⸻

19. File Disposition

Every file ends with exactly one disposition:

KEEP

Required by GA.

REFACTOR

Required but structurally wrong.

MERGE

Duplicate responsibility.

MOVE

Correct behavior, wrong architectural location.

REPLACE

Temporary implementation.

DOCUMENT

Useful artifact but needs explicit purpose.

MIGRATION-ONLY

Required temporarily to complete migration.

DELETE

No legitimate purpose.

There must be zero unexplained files.

⸻

20. Audit Report

The final audit should produce:

CONTROL_REPOSITORY_AUDIT.md

with:

Executive Summary
Repository Inventory
Architecture Map
Domain Ownership Map
Dependency Graph
Runtime Reachability
Persistence / Source-of-Truth Map
Legacy Architecture Map
Dead Code Candidates
Duplicate Implementations
Unused Dependencies
UI Audit
IPC Audit
Test Audit
Build / Tooling Audit
Security Audit
Cross-Platform Audit
Packaging Audit
File Disposition
Remaining Risks
GA Exceptions

And a machine-readable artifact such as:

control-repository-audit.json

⸻

21. Zero-Unknown Rule

At the end:

Tracked files:        N
Audited files:        N
Unclassified:         0
Unknown purpose:      0
Unresolved duplicates:0
Unresolved legacy:    0
Unresolved dead code: 0

There may be accepted exceptions, but they must be explicit.

⸻

22. The Most Important Deliverable

The audit should produce a simple table that we can keep updating:

File	Purpose	Owner	Used By	Runtime Reachable	Canonical?	Disposition
...	…	…	…	Yes	Yes	Keep
...	…	…	…	No	No	Delete

This becomes our repository bill of materials.

⸻

23. GA Gate

I would add this to the top-level GA checklist:

Repository Integrity Gate — BLOCKING

GA cannot be declared until:

* 100% of tracked files have been inventoried.
* 100% have an explicit classification.
* 100% have a documented purpose.
* production reachability has been established.
* dead code has been removed or explicitly justified.
* duplicate implementations have been removed or explicitly justified.
* second sources of truth have been eliminated.
* legacy architecture has been removed from production paths.
* unused dependencies have been removed.
* unused IPC commands have been removed.
* unused UI surfaces have been removed.
* demo/placeholder state has been eliminated.
* tests have been reconciled with the new architecture.
* build tooling has been reconciled.
* generated artifacts have an explicit policy.
* security-sensitive files have been audited.
* all three platforms have been audited.
* packaged-app reachability has been verified.
* the final repository audit has been generated.
* zero files have unknown purpose.

And one final rule:

Do not optimize the repository audit for a small file count. Optimize it for architectural clarity.

A 1,000-file repository where every file has a clear reason to exist is healthier than a 400-file repository full of magical abstractions.

For Control, the desired end state is that a new engineer can clone the repository, read the architecture map, inspect any file, and understand why it exists and where it belongs without reverse-engineering years of accumulated development history.

That is absolutely a GA-level acceptance criterion.