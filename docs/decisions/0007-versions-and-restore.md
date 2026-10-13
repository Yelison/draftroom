# 0007 · Versions are full Yjs updates; restore is one verified transaction under the store mutex

- **Status:** accepted (2026-10-13, owner)
- **Plan reference:** §5.5, Review Focus 5; [collaboration protocol](../collab/protocol.md) §11

## Context

A document has a history: automatic and manual versions the owner can preview and restore. The server stores the live document with Hocuspocus, which creates its documents with `gc: true`. Three facts shape the design:

- `Y.createDocFromSnapshot` requires `gc: false`, so Yjs snapshots cannot be turned back into documents here.
- A Yjs type cannot be moved between documents, so a restore cannot graft a stored document into the live one. It has to write the stored content into the live fragment.
- With `gc: true`, an update applied to nodes that another transaction already deleted is integrated as deleted and its content is discarded (run against `yjs@13.6.33`). It is in no later state and in no earlier version.

The plan says a restore is one transaction, creates a `pre-restore` version, and that edits that raced with it "are never discarded silently, because the pre-restore version keeps the previous state". The last clause is true only for edits applied before the pre-restore version was captured.

## Decision

1. **A version is a full update** (`Y.encodeStateAsUpdate`, V1) with `createdBy`, `kind` (`auto`, `manual`, `pre-restore`, `restore`) and a label. Preview applies it to a fresh `Y.Doc` in a read-only editor and never touches the live document.
2. **Automatic versions:** after 10 minutes without an update and with edits since the newest version, at most one `auto` version per 30 minutes; when the interval has not passed, the version is deferred to the end of it rather than dropped. Taken from the live document, or from the stored state when nobody has it open.
3. **Restore (owner only), in this order, holding the document's store mutex from the second step to the commit:**
   1. read the version and convert it to JSON in a throwaway document;
   2. take the mutex, capture the current state and its snapshot, and write the `pre-restore` version from that capture (one row per restore: later passes overwrite it, and a `409` deletes it);
   3. in one synchronous run, verify the live snapshot still equals the capture (otherwise recapture, at most 3 times, then `409 conflict`), replace the live fragment's content with origin `restore`, and capture the result;
   4. in one database transaction, write the `restore` version, the activity event and the document state with the same capture-and-write function the store hook uses.
4. **The content is replaced by diffing** against the live fragment, so nodes the restore keeps keep their identity and so do the edits and comment anchors on them.
5. **The direct connection is closed after the mutex is released.** `DirectConnection.disconnect()` awaits a store, which takes the mutex; the restore changes the document with `live.transact`, never `DirectConnection.transact`.
6. **The mutex is mandatory.** A store that captured the old state before the restore can otherwise finish its write after the restore's and bring the old content back.

## Consequences

- The `pre-restore` version is exactly the state that was replaced: nothing can slip between capture and change, because the check and the change are one synchronous run.
- **Known limit, accepted:** an edit that was already in flight when the restore applied and that targets nodes the restore removed is not recoverable. The window is the network latency of that edit. The plan's sentence "never discarded silently" holds for everything applied before the change, not for this case. Clients are told that a restore happened (`versions-changed`), and the diff keeps every node the restore did not need to remove.
- Under continuous typing the verify step can fail repeatedly; after 3 attempts the owner gets `409 conflict` and retries. Restoring never blocks the other editors.
- Comment threads anchored in removed text become orphaned (they stay listed with their quote). Undo in other clients is unaffected: the restore has a different origin from the undo manager's.
- Version storage grows with the number of versions (each is a full update). Retention is unlimited in the MVP; a per-document cap is a deferred decision.
- Restoring does not require `gc: false`, so the live document's memory use stays as it is.

## Alternatives considered

- **Yjs snapshots (`Y.snapshot`) as versions.** Smaller, but they need `gc: false` to be turned back into content, which keeps every deleted character for the life of every document.
- **`gc: false` for the whole server.** Would make concurrent edits to removed nodes recoverable, and would let versions be snapshots. Rejected: unbounded memory and storage growth in exchange for covering a latency-sized window.
- **Freezing writes during the restore** (set every connection read-only, wait, restore, force a reconnect). Rejected: messages already in flight still arrive and merge after the restore, so it does not remove the window, and it makes every editor stop typing.
- **Capture and change without the verify step.** Rejected: an edit that arrives during the database insert of the `pre-restore` version would be replaced and be in no version.
- **Persist the `pre-restore` version after the change.** Rejected: if that write failed, the live document would already be changed with no recoverable copy of what it replaced.
- **Delete the content and re-insert it.** Rejected: every node would get a new identity, orphaning every comment and discarding every concurrent edit.
- **Restore by writing the version's update into the live document** (`Y.applyUpdate`). It merges instead of replacing: content deleted since the version stays deleted and content added since stays, so the result is not the version.
