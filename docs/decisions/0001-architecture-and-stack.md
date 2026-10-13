# 0001 · Architecture and stack

Status: accepted (2026-10-13, owner)

## Context

Draftroom is a desktop-first, bilingual (English and Spanish) collaborative document editor: an explorer, a shared editor with live presence, anchored comments, sharing by role and version history. It must run against a real server and PostgreSQL, and also as a static public demo with no backend. The code is read as much as it is used, so the structure has to be simple enough to follow and every choice has to be explainable.

Content is edited by several people at once, including while one of them is offline, so the shape of the system is decided by how content is stored and synchronised, and everything else is arranged around that.

## Decision

**One repository, npm workspaces, one lockfile at the root.**

| Workspace | Holds |
| --- | --- |
| `apps/web` | The React client. |
| `apps/server` | The Node server: REST, collaboration, domain logic, database. |
| `packages/contract` | `openapi.yaml`, the types generated from it, the collaboration message schemas and shared constants. |
| `packages/editor-schema` | The Tiptap extension list shared by client and server, and the conversion between ProseMirror JSON and Yjs the server needs to write content. |

**Client.** React 19.3.0 and Vite 8.3.4, React Router for routes, TanStack Query for server state, `react-intl` for translations. Tiptap 3.31.4 (every `@tiptap/*` package pinned to exactly that version) over Yjs 13.6.33 with `@tiptap/y-tiptap`, connected through a Hocuspocus provider. Shared components and tokens come from Forma UI (ADR 0002).

**Server.** Node.js 24 LTS and Fastify 5.12.7 for REST, and Hocuspocus 4.7.1 for the collaboration WebSocket, in one process on two ports. PostgreSQL holds metadata, permissions, comments, versions and the binary Yjs state of every document, accessed through Kysely 0.29.6 and `pg`, with forward-only TypeScript migrations.

**Contract first.** The REST API is `packages/contract/openapi.yaml` (OpenAPI 3.1). Types are generated with `openapi-typescript` 7.13.0 and committed; the server validates requests and responses against the same document; the client talks to the server through typed operations generated from it. The collaboration protocol is specified separately, with Zod 4.6.7 schemas.

**Content is binary Yjs.** The Yjs state in PostgreSQL is the source of truth for content and is never rebuilt from JSON. Title, folder, archive flag, comments, permissions and history live in relational tables and travel over REST (ADR 0005).

**One data-source boundary on the client.** All data access goes through a `DataSource` interface with two implementations, chosen at build time: HTTP and WebSocket against the real server, and an in-browser simulation used by the end-to-end suite and the public demo. One contract suite runs against both, and mock responses are validated against the OpenAPI schemas.

**Tooling.** TypeScript 6.0.3 pinned, with `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`; Vitest 5.0.4 for unit and integration tests; Playwright 1.64.0 for end-to-end tests; oxlint and Prettier.

**Deployment.** The real backend is packaged so it can be deployed later; the public demo is static, with the simulated API.

## Consequences

- Content is merged by CRDT rules instead of last-write-wins, so concurrent and offline edits converge. The cost is that content cannot be edited through REST, and versions, restore and templates have to go through Yjs conversion helpers on the server.
- Hocuspocus acknowledges an update when it is applied in memory, not when it is stored. The client therefore waits for a separate durability acknowledgement before showing "Synced", which the collaboration protocol defines.
- A contract change has a single owner: a task that needs one stops and asks. In exchange the server, the client and the mocks cannot drift without a test or CI failing.
- The two listeners share a process, so one collaboration instance serves a given document; scaling out would need Hocuspocus's Redis extension, which is deferred.
- TypeScript 6.0.3 is outside `openapi-typescript` 7.13.0's declared peer range (`^5.x`). The root `package.json` overrides that peer to the pinned version. Checked when the contract was written: `npm ci` installs cleanly without `--legacy-peer-deps`, the generator produces identical output on every run, and the generated file passes `tsc -b` under the strict settings above. TypeScript 7 stays out until the generator supports it.
- Node 26 becomes Active LTS on 2026-10-28; moving to it is its own task.

## Alternatives considered

- **Drizzle** instead of Kysely: its 1.0 was still a release candidate when this was decided.
- **Prisma:** a heavy runtime with a binary engine, and a weaker fit for streaming `bytea`.
- **Hono** instead of Fastify: a fine choice, but Fastify's `inject()` and schema hooks suit contract tests. Hono remains an option if Fastify blocks.
- **A single listener** for REST and WebSocket: simpler to run, but a separate Hocuspocus listener is its documented mode and keeps its `onRequest` and `onUpgrade` hooks working. Behind a reverse proxy both appear under one origin.
- **Tiptap's paid Comments and Snapshot extensions:** they need a private registry and a paid licence. Draftroom builds its own comments and versions on the MIT Yjs and Tiptap packages.
- **`y-prosemirror` with Tiptap 3:** the two do not mix; `@tiptap/y-tiptap` is the supported binding.
- **Storing content as JSON** and rebuilding the Yjs document on reconnect: loses the merge history that makes concurrent edits converge.
