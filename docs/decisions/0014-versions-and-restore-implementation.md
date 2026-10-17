# 0014 · Versions and restore on the server: one verified sequence under the store mutex, and what it can still lose

Status: proposed (2026-10-16, with the versions routes and the restore)

## Context

ADR 0007 decided what a version is and the order of a restore; protocol §11 turns it into steps. This one records how those steps were built, the parts of the protocol that had to be chosen while building them (the mechanism of the automatic versions, how the restored content is written, what a retry may leave behind), and, because restoring a document that people are editing is the most delicate thing the server does to a Yjs document, exactly what it can lose.

## Decision

### 1. Where the work lives

| Piece | Where | Why there |
| --- | --- | --- |
| The rules of automatic versions, and the event of the history of each kind | `src/domain/versions.ts` | Pure: the clock is a fact of the decision, so every boundary is a row of a table. |
| The routes | `src/http/routes/versions.ts` | Four operations of the contract, in the order of checks of `docs/api/README.md`. |
| The work on documents people may have open | `LiveDocuments` (`src/http/live-documents.ts`), implemented in `src/collab/liveDocuments.ts` | Only the collaboration server can reach a live document and its store mutex. The routes know the port, as they know `DocumentBroadcaster`, so they run with no WebSocket. |
| The restore | `src/collab/restore.ts`, over `RestoreVersions` (`restoreVersions.ts`) | The sequence is separate from what it keeps in the database, so a test can make that slow or make it fail without touching the sequence. |
| The sweep of automatic versions | `src/collab/autoVersions.ts` | It needs the live documents and the stores. |
| Writing the restored content into a live fragment | `replaceFragmentContent` in `@draftroom/editor-schema/convert` | The package owns the conversion between JSON and Yjs; the server did not declare `@tiptap/y-tiptap`, and a Yjs type cannot be moved between documents. |

### 2. A version is saved from the live state, under the mutex

`createVersion` runs `LiveDocuments.withState`. When somebody has the document open, the state is the one in memory (read the way a store reads it, so the content is always something the schema can read) and the task, which includes the insert, runs holding the document's store mutex. The insert is inside the mutex on purpose: a restore holds the same mutex, so a version is either entirely before a restore or entirely after it, and the order of `created_at` is the order of the states. When nobody has the document open, the state is the stored one.

### 3. The restore is protocol §11.4, with these choices

- **The version is read and turned into content before anything is opened.** A version that cannot be read ends the restore with no document loaded and nothing written.
- **One `pre-restore` row per restore, by a key.** Every restore has an id, and `document_versions` has a unique index on `(restore_id, kind)` for the two kinds a restore writes. The `pre-restore` version is an `insert … on conflict … do update`, so a pass that has to look again overwrites it, and a `409` deletes it. The `restore` version is an `insert … on conflict do nothing`, so committing the same restore twice (the answer of the first was lost) returns the version already there and records the event once.
- **Verify and apply are one synchronous run.** After the `await` that writes the `pre-restore` version, `Y.equalSnapshots(Y.snapshot(live), preSnapshot)` is checked and, if it holds, the content is written in `live.transact(…, 'restore')` with no `await` between the two. Three passes at most (`RESTORE_CAPTURE_ATTEMPTS`); then the owner gets `409 conflict`, which the contract declares for `restoreVersion`.
- **The content is written by diff** with `replaceFragmentContent`, which compares the content with the fragment and changes only what differs, inside the caller's transaction (so the update carries the origin `restore`, which a test pins) and touching only `default`: the map `__tiptap_position_migrations:root:default` is not written.
- **One database transaction** writes the `restore` version, the event and the document's state (`writeDocumentState`, the function the store hook uses, now taking a transaction). If it fails it is tried again, three times (`RESTORE_COMMIT_ATTEMPTS`). If every attempt fails the content is already restored in memory and in the editors, so the store retry of protocol §7.2 is started for it and the owner gets a `500`; what is missing is the `restore` version and its event, and nobody is told that the versions changed.
- **The direct connection is closed after the mutex is released**, in a `finally`, because `DirectConnection.disconnect()` waits for a store and a store takes the mutex.
- **`versions-changed` is sent by the route**, after the restore has returned: the mutex is released and the transaction is committed.

### 4. Automatic versions: a sweep over what is stored

Protocol §11.2 leaves the mechanism to this task. The sweep runs every minute (`autoVersionSweepMs`) and does this:

1. Find the documents last stored at least ten minutes ago whose store has not been looked at: `document_states.updated_at <= now − 10 min` and `versions_checked_at` is null or older than `updated_at`. Both columns are persisted, so a restart loses nothing and a document nobody has open is covered.
2. For each one, take its state with `withState` (live under the mutex when it is open, stored otherwise). Its idle clock is the later of its stored stamp and the last update the live document applied (`DocumentDurability.lastChangeAt`, set by the update listener with the server's clock), so a person who is still typing, and whose store has not run, is not versioned under them.
3. Ask the domain. *Edits since the newest version* means the state's snapshot differs from that version's (`Y.equalSnapshots`), and from the empty document when there is no version. If the decision is to wait, nothing is written and the document stays unexamined, so the next sweep decides again with whatever has happened (an edit restarts the idle clock; the version is deferred, not skipped). If there is nothing to version, the store is marked as looked at. If it is due, the version is written in a transaction with its event (no actor) and the store is marked, and `versions-changed` is sent.

`versions_checked_at` exists because a store that changes nothing (a document opened and closed) stamps `updated_at` too, and without the mark every such document would be read and compared again at every sweep for ever. A version is therefore made up to one sweep late, which a ten-minute idle rule absorbs.

### 5. What is in the history

A manual or automatic version records `version.created` (the actor is `null` for an automatic one) and a restore records `version.restored`; the `pre-restore` version is part of the restore and has no event of its own.

## What it can lose

Everything applied to the live document before the verified run (step 5) is in the `pre-restore` version, and the test of the plan pins that: the version is equal to the state captured by an observer just before the restore's transaction, whatever the editors typed during the restore.

The one loss is the one in ADR 0007 and protocol F14, and it is smaller than its wording suggests. With `gc: true`, an update is lost when it was already on its way when the restore was applied and it lands **inside a node the restore removed**: the items inside a deleted node are dropped when the node is collected, so text typed in a removed paragraph is gone from every later state and from every version. Its window is the network latency of that edit, and its extent is that paragraph's content.

It does not reach what the restore kept, and what the restore kept is most of what editors are doing. The diff leaves a node alone when the content has it, so an edit in flight to a paragraph that both the document and the version have survives (the test `keeps the nodes it did not have to change` pins both halves), and so does text typed into the same paragraph while the restore trims it (the concurrency test: the letters typed after the restore are all there, in order). A new top-level node that was in flight is kept as well, because a deleted top-level node stays in the structure as a tombstone and is still a valid neighbour; it was measured with Yjs 13.6.33, not assumed. Comment anchors on kept nodes survive for the same reason.

Two further limits, both visible to the owner and neither silent:

- Under continuous typing the verification can fail on every pass; the owner gets `409 conflict` and asks again, and nothing was changed or kept.
- If the database refuses the restore's transaction every time, the content is restored and stored by the store retry, the `pre-restore` version exists, the `restore` version does not, and the owner gets a `500`.

## Consequences

- A restore never blocks the other editors: the mutex it holds delays stores, not updates. It does hold the mutex across two database round trips, so a store that was waiting waits for them.
- `document_versions` stores a full update per version, as ADR 0007 accepted. Nothing deletes them, except the document.
- **The first sweep after the migration is deployed examines the whole corpus.** `versions_checked_at` is null in every document, so every document that was stored at least ten minutes ago is a candidate, one after the other, and each one that is due has its state and the state of its newest version read and decoded once. After that, a document is a candidate only when it has been stored again. Two things keep the steady cost small: the reads of the newest version filter by workspace, which is how the index of the table is ordered (without it every version of every workspace was read for every document), and the sweep decides by time alone first, so a document whose version is deferred by the thirty-minute interval costs one indexed read at each sweep and not a load of its state; it can be looked at about twenty times before it is due. A deployment with very many documents would still want the first sweep batched.
- **Whoever takes the store mutex for work that is not a store lets Hocuspocus look at unloading again.** Hocuspocus checks once, when the last connection closes, and not if the mutex is held. Saving a version, the sweep and the restore hold it, so `holdingStoreMutex` (`src/collab/storeMutex.ts`) is the one place that takes it for them and asks for the unload when it lets go (the restore asks again after closing its direct connection, which counts as a connection while the mutex is released).
- `createTestApp` and `buildApp` take a `LiveDocuments`, required for the reason `DocumentBroadcaster` is: an app that forgot it would save versions from stale state.

## Alternatives considered

- **Timers per document for the idle clock.** They need a persisted fact for documents nobody has open anyway, and they have to be rebuilt after a restart. A sweep over the persisted stamp covers both and is one function.
- **A `last_edit_at` column written by the store.** It would be exact for edits, but the store already stamps `updated_at` with the same meaning to within the store delay, and a second column would have to be kept in step with it.
- **Saving a version from the stored state only.** It misses what is typed and not yet stored (up to five seconds, or longer while a write fails), which is exactly what a person who presses "save version" wants.
- **Writing the restored content from `jsonToYUpdate` and `Y.applyUpdate`.** It merges instead of replacing (ADR 0007).
- **Declaring `@tiptap/y-tiptap` in the server.** It changes the lockfile and makes the server depend on the editor binding for one call; the editor-schema package already owns that conversion.
