# 0006 · "Synced" means stored: a durable acknowledgement built on a snapshot

- **Status:** accepted (2026-10-13, owner)
- **Plan reference:** §1.5, §5.2; [collaboration protocol](../collab/protocol.md) §7 and §6

## Context

Hocuspocus 4.7.1 answers a client update with `SyncStatus(true)` as soon as the update is applied to the in-memory document. Nothing reports that the database write happened, so the provider's `hasUnsyncedChanges` returning to `false` proves only that the server received the change. A server crash in the debounce window (1 to 5 seconds) loses acknowledged edits, and a UI that said "Synced" at that point would be lying. The product rule is that "Synced" means the server stored the change durably.

The plan's answer was a stateless `stored` event carrying the state vector of what was written, and a client rule "Synced when the provider has no unsynced changes and the last `stored` vector covers my own clock". Checking that rule against the published code found three problems:

- **A state vector cannot prove a deletion.** Deleting text adds no struct, so it changes no clock. A client whose last change was a deletion is "covered" by any `stored` event, stored or not (run against `yjs@13.6.33`).
- **A failed write is silent and is not retried.** `afterStoreDocument` runs only after a successful `onStoreDocument`; on failure Hocuspocus logs, keeps the document in memory and waits for the next change.
- **A reopen with nothing new never produces a `stored` event.** A client that opens a document from its local copy, with nothing the server lacks, makes the server apply and store nothing.

Separately, ending a connection is not what the plan assumed (see Decision 4).

## Decision

1. **The server acknowledges storage with a snapshot.** In `onStoreDocument`, in one synchronous run, it captures the state (`Y.encodeStateAsUpdate`) and its snapshot (`Y.encodeSnapshot(Y.snapshot(doc))`, the state vector plus the delete set), writes the state, and in `afterStoreDocument` broadcasts `stored` with **that** snapshot to writable connections only. It never recomputes the snapshot after the write, because an update applied during the write is acknowledged but not stored.
2. **The client decides with containment, not clocks.** It keeps `pending`, the merge of everything it changed (all of a local copy at open). On `stored` it checks `Y.snapshotContainsUpdate(snapshot, pending)`. It shows Synced only when the scope is read-write, the handshake completed, `unsyncedChanges` is 0 **and** `pending` is empty. A timer of 15 seconds without a covering event ends in `error`, never in Synced.
3. **The server retries a failed write by itself** (back-off up to 30 seconds), keeps the document loaded while a write is unconfirmed (`beforeUnloadDocument` throws), waits for pending retries at shutdown, assigns the snapshot slot only after the write has committed, and sends the last stored snapshot to each writable connection when it connects.
4. **A connection ends by closing its WebSocket, one per document.** `Connection.close` and `closeConnections` only send an in-band message with the reason text; the provider reports code 1000 and does not reconnect, so the numeric codes of the plan (4401, 4403, 4409, 4413, 4429) would never reach the client. The server closes the socket itself, after setting `connection.readOnly = true` so writes stop at once. An authentication refusal cannot close the socket (the hook has no handle to it), so it answers `PermissionDenied` with `unauthenticated` or `not-found`, and the client disconnects. An oversize message is closed by `ws` with 1009, not 4413, and is handled the same way; the client offers "discard my local changes and reload" for both, never a retry. After a close by the server, the client reconnects with its own back-off, because the provider's does not grow once a connection was established.

## Consequences

- The `stored` payload differs from the plan (`snapshot` instead of `stateVector`). T2.1 and T2.2 build to the protocol document.
- A `stored` event grows with the delete set of the document: a few bytes for a new document, about 77 KB in a synthetic document of 650 KB with 20 000 scattered deletions. It goes only to writable connections, at most once per second of editing.
- The client does one containment check per `stored` event while `pending` is not empty. A reopened document with a large local copy pays that once.
- T2.4 can assert the rule end to end: with the server stopped, Synced never appears.
- Viewers and commenters need no acknowledgement and never see `unsynced`.
- The retry loop and the unload guard are server code Hocuspocus does not provide: without the guard, a failed write is lost as soon as the last client leaves. Tests for both belong to T2.1.
- `error` (`store-timeout`) is transient, not a sink: a `stored` that covers the pending changes returns the client to Synced, and a revocation or a denial still acts from it.

## Alternatives considered

- **The state vector only (the plan).** Rejected: unsound for deletions.
- **A state vector plus a per-client counter of applied updates.** Rejected: `SyncStatus` carries no data, so the client could not relate its acknowledgement to the server's counter, and the provider's batching (`flushDelay`) and re-handshake make a count unreliable.
- **A hash of the stored state.** Rejected: the client's document is usually ahead of the stored one, so it has nothing to compare against.
- **A request and response (the client asks "is X stored?").** Rejected for the MVP: it breaks the rule that clients send no stateless messages and adds a round trip per check.
- **Ending connections with `Connection.close`.** Rejected: the code is lost and the provider does not reconnect or stop (F6 in the protocol).
- **Trusting the in-memory acknowledgement.** Rejected: it is the behaviour this decision exists to prevent.
