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

Workspace operations: any member lists members and creates documents and folders; owners add, change or remove members and rename the workspace. A workspace always keeps at least one owner, and a document always keeps at least one explicit owner grant (`409 last-owner`; see below).

### Decisions made when the REST contract was written

The plan left these open. The contract owner decided them, and each is binding on the server and the mocks.

**Pending members have a `userId` from the start.** Adding a member by email creates the identity at once: a user row without credentials, which already belongs to the workspace as a `pending` member and can already receive document grants. Signing up with that email **claims** the row: same `userId`, same grants, status `active`. It is not an "email already registered" conflict; only an email with a signed-up account is. Reason: every member and access operation addresses a person by `{userId}`, and a pending member has to be addressable.
Alternatives discarded: a separate invitation id (a second way to address a member in every path, and grants would need re-pointing at sign-up); keying pending members by email (emails change case and are personal data in URLs); refusing to share with someone until they sign up (breaks the "add by email" flow).

**Folders.** Folders are flat. Any workspace member creates and renames a folder; only workspace owners delete one. Reason: owners read every document, so they can always empty a folder first; if any member could delete, a member would meet a `409 conflict` for documents they cannot read, which also reveals that those documents exist.
Alternatives discarded: any member deletes (the leak above, and more permissive than the matrix, which is default deny); owners do everything (renaming a typo would need an owner); the creator or an owner (needs a `created_by` on folders for little gain).

**Last owner.** A workspace keeps at least one owner. A document keeps at least one **explicit owner grant**. Workspace owners are implicit owners of every document but do not count towards it: the guarantee has to survive the workspace owners changing.
Alternatives discarded: counting workspace owners (the rule could then never be broken, so `setAccess` and `removeAccess` could never answer `409`, and a document could end up with only implicit owners that nobody chose); no rule for documents (an ownerless document is left for workspace owners to rescue).

**Removing a member transfers their sole ownerships.** When the person removed holds the only explicit owner grant of some documents, `removeMember` transfers those grants to the workspace owner who makes the request, records one `access.granted` activity event per document, and goes ahead. When an owner removes themselves, the grants go to the longest-standing remaining owner. `409 last-owner` stays for the last owner of the workspace only.
Alternatives discarded: `409 last-owner` until the documents are handed over by hand (a person who has left cannot be asked to do it, and an owner would have to hunt each document down before removing anyone); deleting or archiving the documents (silently destroys other people's work).

**Sharing data is owner-only wherever it appears.** The matrix gives "read and change access, general access" to owners. `Document.generalAccess` is therefore `null` for anyone who is not an effective owner, and the events that reveal how a document is shared (`access.*`, `general-access.changed`) are served only to its effective owners, in both activity lists. The caller's own role is shown to everyone.
Alternatives discarded: a documented exception that lets every reader see the general access (simpler, and contradicts the matrix); removing the field and the events (the "Shared with me" table and the activity timeline would lose information that is not sensitive: who did what).

### Left to the authentication task

Decided with ADR 0004, not here: whether `409` on sign-up is acceptable given that it reveals which emails have an account; how passwords are normalised (NFKC, or not at all); email verification (without it, whoever signs up first with a pending email inherits the grants given to it); the CSRF exemption of sign-in (login CSRF).

### Rules that hold everywhere

- **Default deny.** An operation the matrix does not grant is refused.
- **Enforced on the server,** for REST and for WebSocket, and tested on both. The interface hides what a role cannot do as a courtesy.
- **Not found, not forbidden, when the caller cannot read.** A resource the caller cannot read answers `404`, identical to a missing one, so ids cannot be probed across workspaces. `403` is only for a readable resource and a forbidden operation. The checks run in a fixed order (session, CSRF, request shape, resource and read access, role, state), which is what keeps the rule; `docs/api/README.md` states it.
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
