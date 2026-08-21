# FeltDB Browser Subscription Scalability Finding

Status: confirmed implementation shortcoming; transaction-starvation mechanism requires an isolated upstream benchmark  
Observed in: `@feltdb/core` 0.4.7 and 0.4.14  
Runtime: Tauri WebView using FeltDB's IndexedDB browser adapter

## Summary

FeltDB's browser runtime currently starts an independent durable change-log polling loop for every subscribed collection. An agent workspace observes many collections at once: Work, Tasks, Conversations, Messages, Runs, Run Events, Inbox, Decisions, Evidence, Outcomes, Activity, repositories, and documentation.

In Control, this coincided with unresolved IndexedDB writes while creating tasks and conversations. Both stopped at the same first graph mutation: inserting a Work record into `control_work`. Reads and cached state continued to render, but the read/write transaction did not complete.

This is a shortcoming of FeltDB's current browser reactivity implementation. It is not evidence against its data model, Work graph, or HTTP adapter. It does mean the default IndexedDB subscription architecture is not suitable for a collection-rich agent application without multiplexing.

## User-visible impact

- Task creation remained on `Adding…`.
- Chat remained on `Starting conversation…`.
- Existing records continued to render.
- Retrying could leave additional pending operations.
- UI timeouts exposed the failure but did not repair the database connection.

This matters especially for agents because one action commonly writes several related records: Work, Task or Conversation, Message, Run, Activity, Inbox, Evidence, and Outcome. Those writes must remain reliable while many live views observe the graph.

## Confirmed implementation behavior

In FeltDB 0.4.14:

1. Each `Collection.subscribe()` calls the runtime's `subscribe_changes()` for that collection.
2. IndexedDB `subscribe_changes()` creates an independent polling loop.
3. Every loop opens a cursor on the shared `changes` object store every 500 ms.
4. Every new loop starts with its own cursor position at zero and walks the durable log independently.
5. Mutations require a read/write transaction spanning the `rows` and `changes` stores.

Observing N collections therefore creates N change-log readers over the same IndexedDB database. The collection layer does not multiplex them.

## Diagnosis boundaries

Confirmed:

- The browser adapter creates one polling cursor per subscribed collection.
- Control subscribes to many collections concurrently.
- Task and conversation creation both timed out on `control_work.insert()`.
- The implementation remained in FeltDB 0.4.14 after upgrading from 0.4.7.
- Control's authenticated FeltDB HTTP round-trip test continued to pass.

Strong diagnosis requiring an isolated browser stress test:

- The duplicate durable cursor loops starve or indefinitely delay IndexedDB read/write transactions.

An upstream benchmark should measure write latency as collection subscriptions increase. This would distinguish transaction starvation from a WebKit-specific scheduling defect or another adapter interaction.

## Control mitigation

Control configures subscriptions immediately after constructing `StateFirstDB` and before creating collections. In its single-WebView local mode, it disables the IndexedDB durable-log polling path because FeltDB's in-process reactive graph already publishes every local mutation after commit. For remote mode it installs a subscription multiplexer that:

- opens one underlying remote FeltDB change stream;
- maintains a set of collection listeners;
- fans notifications out to those listeners;
- stops the stream when the final listener unsubscribes;
- avoids redundant IndexedDB history replay that can hold a read transaction open while a writer is waiting.

FeltDB remains the only durable application-state store. The mitigation does not introduce parallel persistence or bypass the Work graph.

This trades away cross-WebView IndexedDB notifications. Control currently owns one WebView, so no supported local workflow depends on that path. A future multi-window desktop implementation should use a BroadcastChannel-only notification path or an upstream checkpointed feed rather than restoring full-log polling.

Implementation: `src-ui/lib/control-db.ts`, `multiplexFeltChanges()`.

## Recommended upstream change

FeltDB should own one change-feed coordinator per database runtime, not one polling loop per collection subscription:

1. Start one IndexedDB cursor loop per `IndexedDbJsDb` instance.
2. Keep listeners keyed by collection.
3. Fan out each durable change only to relevant listeners.
4. Maintain one monotonic runtime cursor.
5. Stop polling when no listeners remain.
6. Coalesce duplicate BroadcastChannel and local reactive-graph notifications.
7. Checkpoint the change store without making new subscribers replay irrelevant history.

The public `Collection.subscribe()` API need not change.

## Proposed upstream reproduction

Create 20–30 browser collections, subscribe to each, seed a sizable change history, and repeatedly insert a Work record while measuring commit latency.

Test:

- zero, one, five, ten, twenty, and thirty subscriptions;
- empty and large change logs;
- Chromium, WebKit/Tauri, and Firefox;
- one and two contexts sharing a namespace;
- BroadcastChannel enabled and unavailable;
- continuous reads during writes;
- unsubscribe cleanup and close/reopen.

Acceptance target: mutation latency remains bounded and does not scale linearly with observed collections.

## Product conclusion

FeltDB remains promising for agent work: durable identities, reactive collections, and topology-neutral local/server operation align with Control's graph. This finding exposes a browser-runtime scaling gap that an agent-heavy application is well positioned to reveal.

The proof standard is not merely that FeltDB stores agent records. It must commit a connected agent work graph while many agents and UI surfaces observe it concurrently. Control should retain the multiplexer and write-latency recovery instrumentation until an upstream release contains and verifies an equivalent runtime-level fix.
