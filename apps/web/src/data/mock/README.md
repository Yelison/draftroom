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
- No content: documents are metadata, and Yjs content travels over the collaboration connection (T2.1, T2.2).
- No connection that closes when access is revoked or a member is removed.
- No email verification: whoever signs up with an invited email claims it.
- Made-up values: the `sizeBytes` of a version, and the label a restored version copies from the one it restores.

## Operations it leaves out

| Operation | Why |
| --- | --- |
| `getLiveness`, `getReadiness` | Probes for the orchestrator; the data source does not carry them. |
| `getVersionContent` | The bytes are a Yjs update, which needs Yjs and a document with content (T1.2, T2.2). It fails loudly. |

An operation without a handler never answers with a made-up value: it rejects with `UnhandledOperationError` and logs
the reason on the console, which fails the end-to-end test that reached it.
