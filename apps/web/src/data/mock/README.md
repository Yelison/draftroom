# The mock data source

`MockDataSource` answers every operation of the REST contract from memory, so the interface can be built, tested and
shown without a server. It serves the mocked end-to-end suite and, later, the public demo. One `createMockServer()` is
one world: it starts from `fixtures/` (fictitious people and documents, with content in English and Spanish), each
`connect()` is one signed-in browser on it, and creating another server starts again.

## What it is checked against

- Every response the mock gives in the tests is validated against the schemas of `packages/contract/openapi.yaml`
  (ajv, JSON Schema 2020-12, strict mode): successes against the operation's `2xx`, refusals against the response it
  declares for that status. A status the operation does not declare is a failure.
- `src/data/contract.suite.ts` runs the same behaviour tests that will run on the real server (T2.4).
- `operations.test.ts` calls every operation and fails when one is neither implemented nor excluded below, with a reason.

## Rules of the contract it applies

`404` for what the caller cannot read and `403` for what their role forbids, in the order of the checks of
`docs/api/README.md`; cursor pagination with its order and `id` tie-breaker, and a cursor bound to its filters;
`revision` and `409 revision-conflict` with the current resource; `413` over the text limits, counted in code points;
`generalAccess` only for effective owners; sharing events only for owners; archived documents only for owners; idempotent
archive, restore, pin, resolve and reopen; the last owner of a workspace or document; and the hand-over of the
documents of a removed member.

## What it does not do

The permission rules are a **simulation** to give screens believable answers by role. They are not proof of anything:
authorization is the server's and is tested there (plan, section 9.2).

- No cookies, sessions or CSRF: a connection keeps its own sign-in, and there is no rate limiting.
- No `400` for fields the types already forbid: a missing or unknown field, or a value outside an enum (`access`,
  `status`, `locale`, `generalAccess`). Only what a form can produce is checked: text lengths, references, cursors.
- No content over REST: documents are metadata, and their Yjs content is the collaboration server's (below).
- No connection that closes when access is revoked or a member is removed: the collaboration server below decides access when a document is opened, and nothing ends a connection afterwards.
- No email verification: whoever signs up with an invited email claims it.
- Made-up values: the `sizeBytes` of a version, and the label a restored version copies from the one it restores.
- Version content: the stored versions of the fixtures hold text of their own. A version saved later (and the `pre-restore` one) holds the live text of the document as the simulated collaboration server has it, and a restore writes the version's text into that live document by diff, in one transaction, so an open editor shows it. The live text is the simulation's: nothing of it is durable or shared between tabs.

## Collaboration

`collaboration` is where the editor connects, as the real data source has it, and the session it opens is the same one, over the
same `HocuspocusProvider`. Only the network is made up: `collab/SimulatedCollabServer.ts` speaks the Hocuspocus wire protocol through the provider's
`WebSocketPolyfill` hook, inside the page, so the session code that runs against it is the code that runs against the real
server. It follows `docs/collab/protocol.md`: authentication before anything is applied, `readonly` for a role that may only
read (and for an archived document), a reader's updates answered "not applied", awareness rewritten to the name the server
knows, a `stored` event a debounce after each change with a snapshot of exactly what was stored, the 2 MiB limit
(`1009`) and the buffer before authentication (`4205`).

It is a simulation, and what it proves is the screen and the states, never the server: durability, permissions and
convergence between browsers are proved against the real stack (T2.4), and its own tests read it with the real provider.
Documents start empty, and two tabs do not share one (each page has its own world).

## Operations it leaves out

| Operation                     | Why                                                               |
| ----------------------------- | ----------------------------------------------------------------- |
| `getLiveness`, `getReadiness` | Probes for the orchestrator; the data source does not carry them. |

An operation without a handler never answers with a made-up value: it rejects with `UnhandledOperationError` and logs
the reason on the console, which fails the end-to-end test that reached it.

**People for a layout test.** The page has one browser and so nobody else. `createMockServer().addPeople(documentId, names)`
puts people in a document, each with a session of their own (they become members of its workspace; it loads the collaboration session only when it is called, so the demo's first render does not), and the mock the app
starts with offers the same as `window.draftroomMock.addPeople(...)`, which is how an end-to-end test sees the editor with
others in it. Both are in the mock, so in no build for the real API.
