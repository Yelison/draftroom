# 0010 · Server authorisation: the roles, the development identity and the order of the checks

Status: proposed (2026-10-15, with the documents and folders API)

## Context

ADR 0005 fixes who may do what, and the REST contract fixes the order in which an operation is refused. The first multi-user operations are the first place those rules run, and everything that follows (comments, access, versions, the collaboration connection) reuses them. A mistake here shows one workspace's documents to another, or lets someone write who may not. Real sign-in only arrives with T7.1, so the server needs an identity to authorise and a boundary that sign-in can replace without touching a route.

## Decision

### The rules are a pure function

`src/domain/permissions.ts` holds the rules and has no input or output of its own:

- `effectiveRole({ workspaceRole, grant, generalAccess })` gives the role a person has on a document, or `null`. A workspace owner owns everything; otherwise it is the higher of the grant and the general access; a person outside the workspace has nothing, whatever a stale grant says.
- `can(role, operation)` and `canInWorkspace(role, operation)` answer from one table each. The operations are the row ids of the contract's `x-draftroom-roles` (`read`, `rename-move`, `archive-delete`, `pin`, `workspace-read`, `delete-folder`…), so the table reads against `openapi.yaml`, and the tasks that add comments, access and versions add rows to it. A role of `null`, or an operation the table does not list, is refused: default deny.
- `verdictFor(subject, operation, { onArchived })` is steps 4 and 5 of the order below in one place: `not-found` for someone who may not read the document, and for everyone on an archived document except an owner doing something that applies to an archived document (reading, restoring, deleting and archiving again); `forbidden` only for a reader whose role does not allow the operation.

The tests take their expectations from the contract, not from this table: the access matrix reads the roles of each operation from `x-draftroom-roles`, so it cannot agree with the server by copying it.

### Every request resolves the role from the database

Nothing is cached and nothing comes from the client. A handler calls one of `authoriseDocument`, `authoriseWorkspace` or `authoriseFolder` first and goes on only with what comes back. They load the resource together with the caller's own facts (workspace role, explicit grant, pin) in one query, apply the verdict, and throw a `ProblemError` for `404` or `403`. A route cannot decide for itself. A document that does not exist and one the caller cannot read go through the same code and answer the same bytes; the isolation test compares them.

Lists are different: they cannot load a document and then refuse it, because a page would come back short and a cursor would point at rows the caller never saw. Their SQL filters rows by the same facts (the caller owns the workspace, holds a grant, or the document is open to the workspace; only an owner reads the archive), and the role in each item is still computed by `effectiveRole`. The matrix test checks that a list holds a document exactly when `getDocument` answers 200, for every way of getting a role.

### The order of the checks, and where each one runs

| Step | Check | Where |
| --- | --- | --- |
| 1, 2 | Session (401), CSRF token (403 `csrf`) | An `onRequest` hook of the app, gated by the operation's `security` in the contract |
| 3 | Shape of the request (400, 413) | The `preHandler` hook of the app, from the contract's schemas; a cursor that does not fit its filters is checked first thing in the handler, because it says nothing about any resource |
| 4, 5 | The resource and the right to read it (404), then the role (403) | `authorise*` |
| 6 | References to other resources (`folderId`, `templateId`) | The handler, after the role |
| 7 | The state of the resource (409) | The handler |

The session check must be an `onRequest` hook: the body is parsed, and can fail, before `preValidation`, so a later hook would answer 400 or 413 to someone who is not signed in. The shape check never needs another row, so it is safe ahead of the 404. References come after the role for the reason `docs/api/README.md` gives: telling a folder of another workspace from one that does not exist needs the database, and only someone allowed to act may learn the difference.

A `409 revision-conflict` is built from the same presenter as any other answer, so its `current` shows the sharing settings only to owners.

### The identity: a provider behind a boundary

Routes see a `Principal` (`{ userId }`) and nothing else. An `AuthProvider` produces it from the request's headers and says whether the session (401) and the CSRF token (403) pass; T7.1 replaces the provider and no route changes. `buildApp` requires one: an app without it would have to choose between serving everyone and no one.

The development provider reads `X-Dev-User`, the email of a person who has signed up, compared without regard to case. A member added by email who has not signed up has no name and nobody is them, so the header never names them. It is chosen only when `NODE_ENV` is **set, explicitly**, to `development` or `test`. The configuration says so in `Config.devIdentity`, computed where the environment is read: a missing or empty variable still means `development` for the rest of the configuration (the loopback host, the generated session secret), but never grants the identity, because forgetting the variable is the likeliest mistake in a deployment (`npm start` sets nothing). In every other case, `production` and a missing variable included, `authProviderFor` gives a provider that refuses everyone, so a mistake in the environment fails closed. The provider never reads `process.env` itself. A test builds the configuration from an environment, as the entry point does, sends the same request as the same real owner, and shows that `development` and `test` are accepted and `production`, a missing `NODE_ENV` and an empty one are not.

The development provider does no CSRF check. The header is a custom one, which another origin cannot send without a preflight the server never grants, so it carries none of the risk the check exists for. T7.1 brings the cookie, and with it the real check.

### Decisions where the contract is silent or says two things

- **Archiving is idempotent for those who may archive.** `docs/api/README.md` says archive and restore succeed when the resource is already in that state (and the contract owner confirmed it for `archiveDocument` in review), and also that an archived document answers 404 to everything except reading, restoring and deleting. For the owners the first applies: archiving an archived document returns it as it is, with no new revision and no event, as restoring a live one does. For everyone else, who may not even read an archived document, it is still `404`, like pinning or renaming it. A first version of this server answered 404 to the owners too; that made a double click an error.
- **A change that changes nothing is not a change.** A `PATCH` whose values are the document's own returns it as it is: no revision, no event. The revision is still checked first.
- **A folder that goes away between the check and the write is an unknown folder.** The folder is checked before the document is written, outside the write, so a folder deleted in between makes the database refuse the row (`documents_folder_fkey`). Creating and moving a document turn that refusal into the `400 invalid-value` at `/folderId` that an unknown folder gets, and nothing is written. Any other foreign key that refuses a row stays a bug of the server.
- **`listSharedDocuments` is the readable documents on which the caller's effective role is not owner**, so a workspace owner's list is empty, and the caller's own documents are never in it. Pinned and shared lists leave archived documents out.
- **A cursor is bound to the workspace and the filters, not to the page size**, so a client may change `limit` between pages. It carries the timestamp as PostgreSQL writes it, microseconds included: a `Date` has milliseconds, and a cursor built from one skips the rows that share its millisecond.
- **The history keeps its events when a person leaves, and loses them with the document.** `activity_events` points at `users`, not at memberships, and at the document through `(workspace_id, id)` with `on delete cascade`, so deleting a document for good leaves nothing of it behind.
- **A new document starts with the empty Yjs update (`[0, 0]`).** It is what an empty `Y.Doc` encodes to and what `@draftroom/editor-schema` reads as the one empty paragraph. The server does not yet depend on that package (declaring it changes the lockfile, which another task owns), so the constant lives in `src/domain/documents.ts` with its reason. When templates arrive the content is written with `jsonToYUpdate`, and that task declares the dependency.

## Consequences

- The permission rules are tested exhaustively as tables with no database, and the API is tested against them through the contract.
- A new route gets its checks by calling `authorise*` and throwing `ProblemError`; it is hard to write one that answers 403 where it should answer 404.
- Every read costs one query with a few joins. It is the price of never trusting a cached role, and the queries use the composite keys of the schema.
- The development identity is real code in the server. It is only reachable through `authProviderFor`, and the production test pins that.

## Alternatives considered

- **PostgreSQL row-level security:** it would enforce the 404 rule in the database, but the verdict also depends on the operation, on archiving and on the order of the checks, which the policies would have to repeat, and the roles would live in two places.
- **Computing the role in SQL:** one fewer query for lists, but a second implementation of the precedence rules that could drift from `effectiveRole`. Only the filter that decides which rows come back is in SQL.
- **Authentication as a `preHandler`:** it runs after the body is read, which breaks the order.
- **Throwing from handlers with `reply.send` instead of `ProblemError`:** a handler would have to return after each refusal, and a refusal inside a transaction would not roll it back.
- **The development header carrying a user id:** easier for tests, harder to type by hand, and the email is what the seeded people are known by.
- **`X-Dev-User` accepted unless `NODE_ENV` is `production`:** it fails open on a typo in the environment, and on a variable that is not set at all. An explicit allow-list of two values fails closed.
