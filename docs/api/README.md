# REST API

The API is described by [`packages/contract/openapi.yaml`](../../packages/contract/openapi.yaml) (OpenAPI 3.1). That file is the single source: the server validates requests and responses against it, the client's types are generated from it, and the mocks used by the end-to-end suite and the public demo are validated against it. This page explains the rules the file cannot say in a field, and records the choices it makes where the plan was silent.

- Every path starts with `/api`; the API lives on the same origin as the app.
- Bodies are `application/json`, except the version download (`application/octet-stream`).
- Ids are UUIDs and instants are RFC 3339 UTC strings.
- A list answers `{ "items": [...] }`; the four paginated lists add `nextCursor`.
- Document **content is not served here.** It is a Yjs document that travels over the collaboration connection; REST carries metadata, permissions, comments, versions and history.
- `npm run api:types` regenerates `packages/contract/src/schema.ts`; `npm run api:lint` lints the contract and validates its examples. CI fails if the committed types are stale.

## Authentication and CSRF

| Piece | Where | Purpose |
| --- | --- | --- |
| `dr_session` | cookie, `HttpOnly` | The server-side session, set by sign-in and sign-up. |
| `dr_csrf` | cookie, readable by the client | The CSRF token, set with the session. |
| `X-CSRF-Token` | request header | Echo of `dr_csrf`. Required on every method that changes state (`POST`, `PUT`, `PATCH`, `DELETE`). |

Each operation states its requirement in `security`. Reads need `session`; methods that change state need `session` **and** `csrf` in a single requirement (AND), so the token cannot be skipped. Four operations need neither: `signUp`, `signIn`, `getLiveness` and `getReadiness`. `signOut` needs both.

A missing or wrong token is `403 csrf`; a missing or expired session is `401 unauthenticated`. Wrong email and wrong password are indistinguishable (`401 unauthenticated`). The development identity header used by local development and the mocked end-to-end suite is not part of the contract. Sessions and CSRF are specified in ADR 0004, written with the authentication task.

## Roles and permissions

Workspace roles: `owner`, `member`. Document roles: `viewer`, `commenter`, `editor`, `owner`.

**Precedence (effective document role).** A workspace owner is `owner` of every document in the workspace. Otherwise the effective role is the highest of the person's explicit grant on the document and the document's `generalAccess`, which applies to every workspace member. A non-member has no role. The creator of a document gets an explicit `owner` grant, and new documents start with `generalAccess: none`. An archived document is readable only by its owners, to restore or delete it; every other operation on it is `404`. Anything the matrix does not grant is refused (default deny).

**Not found versus forbidden.** A document, thread, comment, version or workspace the caller cannot read answers `404 not-found`, identical to one that does not exist, so ids cannot be probed. A resource the caller can read, with an operation their role forbids, answers `403 forbidden`.

Every operation lists its rows under `x-draftroom-roles`, and a contract test pins them to this matrix.

| Matrix row | Roles | Operations |
| --- | --- | --- |
| Read metadata and content, open over WebSocket (read-only) | viewer, commenter, editor, owner | `getDocument`, `listDocumentActivity` (and the collaboration connection) |
| Write content over WebSocket | editor, owner | none: the collaboration connection only |
| List and read comments | viewer, commenter, editor, owner | `listThreads` |
| Create thread, reply, resolve, reopen | commenter, editor, owner | `createThread`, `replyToThread`, `resolveThread`, `reopenThread` |
| Edit or delete own comment | commenter, editor, owner, and the author | `updateComment`, `deleteComment` |
| Delete another person's comment | owner | `deleteComment` |
| Rename, move to folder | editor, owner | `updateDocument` |
| Create a version (manual) | editor, owner | `createVersion` |
| List and preview versions | viewer, commenter, editor, owner | `listVersions`, `getVersionContent` |
| Restore a version | owner | `restoreVersion` |
| Read and change access, general access | owner | `listAccess`, `setAccess`, `removeAccess`, `setGeneralAccess` |
| Archive, restore from archive, delete permanently | owner | `archiveDocument`, `restoreDocument`, `deleteDocument` |
| Pin (personal) | viewer, commenter, editor, owner | `pinDocument`, `unpinDocument` |

Workspace rows use workspace roles:

| Matrix row | Roles | Operations |
| --- | --- | --- |
| Read the workspace, its members, folders and lists (the lists only show what the caller can read) | member, owner | `getWorkspace`, `listMembers`, `listFolders`, `listDocuments`, `listPinnedDocuments`, `listSharedDocuments`, `listWorkspaceActivity` |
| Create documents and folders | member, owner | `createDocument`, `createFolder` |
| Rename folders | member, owner | `updateFolder` |
| Delete folders | owner | `deleteFolder` |
| Add, change role or remove members | owner | `addMember`, `updateMember`, `removeMember` |
| Rename the workspace | owner | `updateWorkspace` |

Some operations need only a session: `getMe`, `updateMe`, `signOut`, `listWorkspaces` (the caller's own) and `listTemplates`. **Last owner.** A workspace always keeps at least one owner, and a document always keeps at least one **explicit owner grant**. Workspace owners are implicit owners of every document, but they do not count: the rule is about the explicit grants. Removing or demoting the last owner of a workspace (`updateMember`, `removeMember`) is `409 last-owner`; so is removing or lowering the last explicit owner grant of a document (`setAccess`, `removeAccess`). `removeMember` does not block when the person removed holds the only explicit owner grant of some documents: those grants are transferred to the workspace owner who makes the request (when an owner removes themselves, to the longest-standing remaining owner) and one `access.granted` event is recorded per document.

**Preferences.** `getMe` answers the person with the preferences saved on the account, and `updateMe` (`PATCH /api/me`) changes `name`, `locale` and `editorTextSize`; it takes no person in the path or the body, so nobody can change another account. `locale` (`en` or `es`) is `null` until the person chooses a language, and then the browser's language applies; once set it takes precedence over the browser. `editorTextSize` is `small`, `medium` (the default) or `large`. `updateMe` has no `revision`, unlike folders and documents: its fields are independent and belong to one person, so the last write wins, as it does for `updateWorkspace`, which does not carry one either.

**Sharing data stays with owners.** The matrix gives "read and change access, general access" to owners, so the same data does not leave through other operations. `Document.generalAccess` is `null` for anyone who is not an effective owner of the document, and the events that reveal how a document is shared (`access.granted`, `access.changed`, `access.revoked`, `general-access.changed`, with their `targetUser`) are served only to its effective owners, by `listDocumentActivity` and by `listWorkspaceActivity`. The caller's own `role` is always shown.

**Order of the checks.** Every operation checks, in this order: (1) the session, `401`; (2) the CSRF token on methods that change state, `403 csrf`; (3) the shape of the request, `400` or `413`, the same whether or not the resource exists; (4) the resource and the caller's right to read it, `404`; (5) the caller's role, `403 forbidden`; (6) the references the request makes to other resources (`folderId`, `templateId`, and the `{userId}` of `setAccess`), `400 invalid-value` or `404`; (7) the state of the resource, `409 revision-conflict`, `conflict` or `last-owner`. The order is what keeps the `404` rule: a person who cannot read a document never reaches a `409` that would carry its current state, or a `403` that would confirm it exists. References come after the role because telling a folder of another workspace from a folder of this one needs the database: checked earlier, a person outside the workspace could tell the two answers apart (`400` against `404`) and learn that a folder exists, and the `404` of `setAccess` would show a reader who is not an owner who the members are. Checking the shape of the request (3) never needs another row, so it is safe to do first.

## Errors

Every 4xx and 5xx is `application/problem+json` (RFC 9457) with `type`, `title`, `status`, a stable `code` and, for invalid input, `errors[]`. **The server never sends translated text.** `title` is a short English summary for logs; clients show a message chosen from `code` in the person's language.

| Code | Status | When |
| --- | --- | --- |
| `validation-failed` | 400 | The request breaks a rule of the contract: a missing field, a value below its minimum, a bad format, an unknown field, a malformed cursor or one reused with other filters, a `locale` without a `templateId` (`{ pointer: /templateId, code: required }`), a `folderId` that is unknown or belongs to another workspace, a `templateId` that is unknown (`invalid-value`, the same answer for an unknown and a foreign folder). |
| `unauthenticated` | 401 | No valid session, or wrong credentials. |
| `csrf` | 403 | `X-CSRF-Token` is missing or does not match. |
| `forbidden` | 403 | The caller can read the resource but their role does not allow the operation. |
| `not-found` | 404 | The resource does not exist, or the caller cannot read it. |
| `revision-conflict` | 409 | A stale `revision`; the body carries `current`. |
| `last-owner` | 409 | The change would leave a workspace or a document without an owner. |
| `conflict` | 409 | The request conflicts with the current state: the email is already registered or already a member, deleting a document that is not archived, deleting a folder that still holds documents, and restoring a version while people keep editing the document so that it cannot be replaced after three attempts (nothing is restored and no `pre-restore` version is kept: ask again). |
| `too-large` | 413 | A text in the request body is longer than its limit, or the body is bigger than the server accepts. |
| `rate-limited` | 429 | Too many attempts; `Retry-After` says when to retry. |
| `internal-error` | 500 | An unhandled failure. |
| `unavailable` | 503 | `getReadiness` only: the database is unreachable or the migrations are not current. |

Each entry of `errors[]` is `{ "pointer": "/title", "code": "required" }`: a JSON Pointer into the body (`/query/<name>` or `/path/<name>` for parameters) and one of `required`, `too-short`, `too-long`, `invalid-format`, `invalid-value`, `unknown-field`.

**Unknown parameters.** A query parameter that the operation does not declare is refused like an unknown body field: `400 validation-failed` with `{ "pointer": "/query/<name>", "code": "unknown-field" }`. A typo in a filter (`?folder=` for `?folderId=`) therefore fails loudly instead of returning the unfiltered list.

The two statuses are split by what went wrong and where. A text **in the request body** that goes over its maximum is `413 too-large` with the pointer and `too-long`, and so is a body bigger than the server accepts. An empty value, any other broken rule, and every query or path parameter out of range (`limit`, `cursor`, `query`) is `400 validation-failed`.

## Pagination

`listDocuments`, `listVersions`, `listWorkspaceActivity` and `listDocumentActivity` are paginated by cursor.

- `limit`: 1 to 100, default 25.
- `cursor`: the opaque token the previous page returned as `nextCursor`. Clients never build or read one. A cursor is bound to the filters of the request that produced it: an invalid cursor, or one used with other filters, is `400 validation-failed` with the pointer `/query/cursor`.
- The response carries `items` and `nextCursor`, which is `null` on the last page.
- The cursor encodes the sort key and the id, so the order is stable when several rows share a timestamp.

The other lists are bounded by the size of a workspace and return everything. **Every list has an order with an `id` tie-breaker**, so two rows that tie never swap places between requests:

| List | Order |
| --- | --- |
| `listDocuments`, `listPinnedDocuments`, `listSharedDocuments` | `updatedAt` descending, then `id` descending |
| `listVersions`, `listWorkspaceActivity`, `listDocumentActivity` | `createdAt` descending, then `id` descending |
| `listWorkspaces`, `listFolders` | `name` ascending, then `id` ascending |
| `listMembers`, `listAccess` | `createdAt` ascending, then `userId` ascending |
| `listThreads` (and the comments of each thread) | `createdAt` ascending, then `id` ascending |
| `listTemplates` | `id` ascending |

Paginating by `updatedAt` while documents are edited can skip or repeat a document edited in between; the cursor keeps the order stable, not the data.

## Concurrency

Documents and folders carry an integer `revision`, starting at 1 and growing by one with every change to their metadata (title, folder, archive, restore). Content edits do not change it. `PATCH` takes the `revision` the client last read; if it is stale the server answers `409 revision-conflict` with the **current** resource in `current`, so the client can reconcile and retry without another request.

Archive, restore, pin, resolve and reopen are idempotent and take no revision. Removing a grant that does not exist (`removeAccess`) is not idempotent: it is `404`.

**Access list.** `listAccess` returns every explicit grant on the document, the creator's `owner` grant included, and the explicit grant of a workspace owner if one exists; owners who are owners only through the workspace are not listed, because their access is implicit.

**Archived documents.** An archived document is readable only by its owners: `getDocument` and the document lists with `archived=true`, plus `restoreDocument` and `deleteDocument`, and `archiveDocument`, which is idempotent and answers the document unchanged. Every other operation on it, its threads, versions and activity included, is `404` for everyone, owners too, until it is restored.

## Limits

| Field | Limit, in Unicode code points | Over the limit |
| --- | --- | --- |
| Document title | 1–200 code points | `413 too-large` |
| Comment body | 1–5 000 code points | `413 too-large` |
| Comment quote | 1–500 code points | `413 too-large` |
| Folder name | 1–80 code points | `413 too-large` |
| Workspace name | 1–80 code points | `413 too-large` |
| Version label | 1–100 code points | `413 too-large` |
| Person name | 1–80 code points | `413 too-large` |
| Email | at most 254 code points | `413 too-large` |
| Password | 12–128 code points | `413 too-large` over 128, `400 validation-failed` under 12 |
| Search `query` | 1–200 code points | `400 validation-failed` |
| Page size | default 25, at most 100 | `400 validation-failed` |

Limits count **Unicode code points**, the way JSON Schema (and the server's validator) does, not UTF-16 units: an emoji counts as one. A client that enforces a limit counts with `[...value].length`, never `value.length`, and does not use the HTML `maxlength` attribute, which counts UTF-16 units and would cut a 150-emoji title at 100. The figures live in the schemas (`DocumentTitle`, `CommentBody`, `Quote`, `FolderName`, `WorkspaceName`, `VersionLabel`, `PersonName`, `Email`, `Password`). The ones a form needs, for the documents, comments, folders and versions, are also exported as `contractLimits` by `@draftroom/contract`, and a test keeps the two equal. A test also checks that every operation whose body bounds a text declares the `413`.

## Cache and invalidation (client)

Query keys live in one module, `apps/web/src/data/queryKeys.ts`. Each mutation lists the keys it invalidates; document-level changes made by other people arrive as collaboration stateless events and invalidate the matching keys; workspace lists refetch on window focus.

| Mutation | Invalidates |
| --- | --- |
| `updateDocument` | the document, the document lists, pinned, shared, workspace activity, that document's activity |
| `archiveDocument`, `restoreDocument`, `deleteDocument` | the document, the document lists, pinned, shared, workspace activity |
| `pinDocument`, `unpinDocument` | the document, pinned, the document lists, shared |
| `createDocument` | the document lists, workspace activity |
| `createFolder`, `updateFolder`, `deleteFolder` | the folders, the document lists |
| `setAccess`, `removeAccess`, `setGeneralAccess` | the access list, the document, shared, workspace activity, that document's activity |
| `createThread`, `replyToThread`, `resolveThread`, `reopenThread`, `updateComment`, `deleteComment` | the document's threads, workspace activity, that document's activity |
| `createVersion`, `restoreVersion` | the document's versions, workspace activity, that document's activity (a restore also changes the live content, which arrives over the collaboration connection) |
| `addMember`, `updateMember`, `removeMember` | the members, and every list that depends on access |
| `updateMe` | the members, the document lists, pinned, shared, workspace activity (they show the person's name); the person's own query takes the answer |
| `updateWorkspace` | the workspace and the workspace list |

| Stateless event (protocol, section 5.3) | Invalidates |
| --- | --- |
| `metadata-changed` | the document and the document lists |
| `access-changed` | the access list, the document (the caller's role), shared |
| `comments-changed` | the document's threads |
| `versions-changed` | the document's versions |
| `document-archived` | the document and the document lists |

## Where the contract chooses

The plan did not fix these; the contract does, and a change to any of them goes through the contract owner.

- **Paths** are written in full, `/api/...`, with `servers: [{ url: / }]`.
- **Pending members have a `userId`.** A member added by email gets one at once. Without it, `updateMember`, `removeMember` and `setAccess` could not address a pending member through `{userId}`. `name` is `null` until sign-up. Signing up with that email **claims** the pending row (same `userId`, same grants) and is never a `409`.
- **Folders** are flat. Any workspace member can create and rename a folder; only workspace owners delete one, because they read every document and so can always empty it first (the `409` on a non-empty folder would otherwise leak the existence of documents a member cannot read).
- **A template has a language.** `createDocument` takes `locale` (`en` or `es`, `en` when omitted), valid only together with `templateId`, because the server keeps no state from the template list the person looked at.
- **Unknown references are `400`.** A `folderId` that does not exist, or belongs to another workspace, is `400 validation-failed` with `invalid-value` at `/folderId`, identically, so ids of other workspaces cannot be probed. A `templateId` that does not exist is the same `400` at `/templateId`; templates are global, so there is no other workspace to belong to. `locale` without `templateId` is `400` with `{ pointer: /templateId, code: required }`. `setAccess` for someone outside the workspace is `404`. All of these are checked after the role (see the order of the checks).
- **Idempotency:** archive, restore, pin, unpin, resolve and reopen succeed when the resource is already in that state.
- **`403` is declared where it can happen:** on methods that change state (the CSRF check) and on operations that refuse some role. A read open to every role of its scope never answers `403`: whoever cannot read gets `404`.
- **Comments:** deleting a comment keeps the rest of its thread; a thread left without comments goes with it. Only the author edits a comment.
- **`listSharedDocuments`** returns the documents the caller can read without owning them; `access` (`edit`, `comment`, `view`) keeps those where their role is `editor`, `commenter` or `viewer`.
- **`Document`** carries `role` (the caller's effective role), `generalAccess` (`null` unless the caller is an effective owner), `pinned`, `createdBy` and `excerpt`, so lists, the shared table and the home screen need no second request.
- **Versions** are listed newest first by `createdAt`; `createdBy` is `null` for versions the server made on its own.
- **Activity** events are the document-scoped actions only; `actor` is `null` when the server acted.
- **Text limits** beyond the plan's: workspace name 1–80, version label 1–100, person name 1–80, password 12–128 (the authentication task may tighten it).
- **Sign-up** with an email that already has a signed-up account is `409 conflict`; sign-in never says which accounts exist.
- **Left to the authentication task (T7.1):** whether `409` on sign-up is acceptable given that it reveals which emails have accounts, how passwords are normalised (NFKC or not at all), whether emails are verified (without it, whoever signs up first with a pending email inherits its grants), and the CSRF exemption of sign-in (login CSRF).
- **The version download** is typed as `string` by the generator; read the response body as bytes.
