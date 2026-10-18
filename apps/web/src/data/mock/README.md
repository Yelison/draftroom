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
- Version content: the stored versions of the fixtures hold text of their own. A version saved later (and the `pre-restore` one) holds the live text of the document as the simulated collaboration server has it, and a restore writes the version's text into that live document by diff, in one transaction, so an open editor shows it. The live text is the simulation's: nothing of it is durable, and it is shared between tabs only in the demo (below).

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
Documents start empty, and two tabs do not share one (each page has its own world), unless the world is the demo's.

## The demo

The build for the static demo (`vite build --mode production` with the mock, which `build:demo` makes) turns on three things
that the mock of the tests and of the mocked end-to-end suite do not have, so their documents stay empty and nobody else is in
them. All three live in `collab/` and `fixtures/` and are asked for by `createMockServer({ demo })`; `createMockDataSource` does
it when `import.meta.env.MODE` is `production`.

- **A world in one language.** The fixtures of the tests have a document in English next to its twin in Spanish, and folders
  in both, which suits tests that look for either. The demo does not: `createMockServer({ demo })` starts the world from
  `fixtures/demoSeed.ts` (`demoFixtures(locale)`), which has one set of documents, with the title, the excerpt, the folders,
  the comments and the version labels written in the language the demo started in (the stored choice, then the browser's, as
  the app picks it; it does not change if the person switches language afterwards). Names of people and workspaces are the
  same. The stored versions come with their text in that language too (`fixtures/demoVersionContent.ts`), so the history and a
  restore stay in it. The world of the tests, `e2e/` and the suites of the mock is not touched: `createWorld()` without an
  argument is the same as ever, and `production-bundle.spec.ts` searches the real build for the texts of both demo languages.
- **Content.** Each document opens with the text in `fixtures/demoContent.ts`, in that language, and does not repeat its title
  as a first heading: the title is shown above the text. The text is written into the document when it is first opened, not
  when the world starts, as the server would (`collab/seededContent.ts`). It is written by a fixed Yjs client for each language and document, so every tab
  and every build hold the same items, and the threads of the demo are anchored on the sentences they quote in that text, in
  the language of the demo (`collab/demoDocuments.ts`, `fixtures/demoThreads.ts`): the comments panel shows them on their
  text. One thread, which only the demo has, is on a sentence that was taken out after it was written, so the panel also shows
  an orphaned thread. The last stored version of a document is the beginning of its text.
- **Tabs.** `collab/tabLink.ts` carries the Yjs updates and the awareness of a document between the tabs of one browser over a
  `BroadcastChannel`. A tab that opens joins the oldest world there is. A tab that is **reloaded starts a world of its own**
  (the demo starts again on reload): the other tabs keep the one they had and the two share nothing from then on, because every
  message names its world and a tab ignores the rest. Only one tab writes the starting text of a document (two tabs that each wrote it would leave every paragraph twice): the one
  that started the world and, when it has gone, the oldest of those that are left, which every tab works out the same.
  Only the collaboration is shared: the lists, the comments and the rest of the contract are each tab's. Where there is no
  `BroadcastChannel` the demo is one tab and works the same. A tab that closes without `pagehide` (a crash) leaves its people
  in the other tabs until they reload.
- **A person who writes.** `collab/scriptedCollaborator.ts` plays a person of the fixtures (`fixtures/collaboratorScripts.ts`:
  Daniel in the launch plan, Sofía in the brand voice guide) with a connection of her own. She is in the document while someone
  else has it open and the tab is visible, moves her cursor, and types, rewrites and erases a line at the pace of a person, in
  the last paragraph of the document, adding and removing only her own letters, and never while someone else's cursor is in it
  (when someone writes in or after her line, she gives it up and erases what is hers). She stays present and writes nothing
  when the person prefers reduced motion, and leaves when the tab is hidden or the person goes: she takes her letters out
  first, so the paragraph is as she found it. With several tabs, one plays her and the others wait their turn in a
  `navigator.locks` queue, so that the one that stays takes over when that tab goes.

What it proves is the screen, as everything above does: the simulated collaboration is **not** evidence that real browsers
converge. That is the real stack's (`e2e-collab/`), and nothing in the interface says otherwise or says that it is simulated.

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
