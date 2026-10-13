# 0005 · Data model and permissions

Status: accepted (2026-10-13, owner)

## Context

Several people edit, comment on and share documents, and some of them must not see some documents at all. The data lives in two very different forms (a binary CRDT for content, relational rows for everything else), and a permission has to hold on every path to it: REST, the collaboration WebSocket, search and history. A read-only screen is not a barrier, so the server decides.

## Decision

### Source of truth per datum

| Datum | Source of truth | Notes |
| --- | --- | --- |
| Document content | binary Yjs state in `document_states.state` (`bytea`) | Never rebuilt from JSON. Only the collaboration server writes it. |
| Title, folder, archived flag, pins | PostgreSQL `documents` | Edited through REST. The editor shows the title as a separate field outside the Yjs document. |
| Comments and replies | PostgreSQL `threads`, `comments` | Anchors are encoded Yjs relative positions. |
| Permissions | PostgreSQL `memberships`, `document_access`, `documents.general_access` | Evaluated on every REST request and on every WebSocket authentication. |
| Presence and carets | Yjs awareness | Ephemeral: never persisted, never used for authorisation. |
| Versions | PostgreSQL `document_versions.state` (`bytea`, a full Yjs update) | Independent checkpoints, not Yjs snapshots. |
| Workspace history | PostgreSQL `activity_events` | Append-only, separate from versions. |

Every table has `created_at`. Composite keys `(workspace_id, id)` mean a reference across workspaces cannot be built.

### Roles

Workspace roles: `owner`, `member`. Document roles: `viewer`, `commenter`, `editor`, `owner`.

**Effective document role.**

1. A workspace owner is `owner` of every document in the workspace.
2. Otherwise it is the highest of the person's explicit grant on the document and the document's `general_access`, which applies to every workspace member.
3. A non-member has no role.

The creator of a document receives an explicit `owner` grant. New documents start with `general_access = none`, so sharing is always explicit. Archived documents are readable only by their owners, to restore or delete them; every other operation on them answers `404`.

### The matrix

| Operation | Viewer | Commenter | Editor | Owner |
| --- | --- | --- | --- | --- |
| Read metadata and content, open over WebSocket (read-only) | ✓ | ✓ | ✓ | ✓ |
| Write content over WebSocket | | | ✓ | ✓ |
| List and read comments | ✓ | ✓ | ✓ | ✓ |
| Create thread, reply, resolve, reopen | | ✓ | ✓ | ✓ |
| Edit or delete own comment | | ✓ | ✓ | ✓ |
| Delete another person's comment | | | | ✓ |
| Rename, move to folder | | | ✓ | ✓ |
| Create a version (manual) | | | ✓ | ✓ |
| List and preview versions | ✓ | ✓ | ✓ | ✓ |
| Restore a version | | | | ✓ |
| Read and change access, general access | | | | ✓ |
| Archive, restore from archive, delete permanently | | | | ✓ |
| Pin (personal) | ✓ | ✓ | ✓ | ✓ |

Workspace operations: any member lists members and creates documents and folders; owners add, change or remove members and rename the workspace. A workspace and a document always keep at least one owner (`409 last-owner`).

### Rules that hold everywhere

- **Default deny.** An operation the matrix does not grant is refused.
- **Enforced on the server,** for REST and for WebSocket, and tested on both. The interface hides what a role cannot do as a courtesy.
- **Not found, not forbidden, when the caller cannot read.** A resource the caller cannot read answers `404`, identical to a missing one, so ids cannot be probed across workspaces. `403` is only for a readable resource and a forbidden operation.
- **Read-only means the connection is read-only.** Viewers and commenters open the document over WebSocket in read-only mode; a raw update from them is neither applied, stored nor broadcast. Commenters comment through REST, with anchors that live outside the Yjs document.
- **Pure domain logic.** The permission resolver is a pure function of its inputs, with no database or network access, so it can be tested exhaustively as a table.

## Consequences

- Content and metadata are stored differently on purpose; creating a document writes its row, an empty state and an activity event in one transaction.
- Because content, comments and history are scoped by the same resolver, search and activity must filter by read access at query time, not afterwards.
- Revoking or lowering access has to reach open WebSocket connections as well as future requests, which needs live connection management in the collaboration server.
- Composite keys and `created_at` everywhere cost a little verbosity in every migration.
- Default sharing is private. People who want a document visible to the whole workspace have to say so; there is no accidental exposure.

## Alternatives considered

- **Workspace members see every document by default:** less friction, and one forgotten setting exposes everything. Private by default was chosen.
- **Owners and editors may both archive and restore versions:** fewer blocked users, but restore replaces the live content and archive hides a document from everyone, so both stay with owners.
- **Permissions only in the interface, or only at connection time:** simpler, and it leaves one path open. Every request and every authentication is checked.
- **Storing content as JSON in a column:** easy to query and loses concurrent edits; it would also make "never rebuild the document from JSON" impossible to keep.
- **Authorising from presence or awareness data:** it is client-supplied and ephemeral.
