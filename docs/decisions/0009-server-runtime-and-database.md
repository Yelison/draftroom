# 0009 · How the server runs TypeScript, and how it reaches the database

Status: proposed (2026-10-13, with the server skeleton)

## Context

The server is a Node.js process written in TypeScript. The workspace's base configuration (`tsconfig.base.json`) only emits declarations and imports with explicit `.ts` extensions, because every package is read by Vite or Vitest straight from source. The server is the first package that has to run outside them, in development, in CI and later in the Docker image (T8.1). It also needs a way to talk to PostgreSQL and to change the schema over time, with two constraints from the data model (ADR 0005): a reference can never cross workspaces, and content is stored as bytes.

## Decision

### Node runs the sources

The server runs with Node 24's native type stripping: `node src/main.ts`. There is no build step, no `dist/` to keep in step with the sources and no loader. Its `tsconfig.json` is only a type check: `module` and `moduleResolution` are `NodeNext`, so `tsc` models the module system Node really applies, and `erasableSyntaxOnly` makes `tsc` refuse the syntax that type stripping cannot erase (enums, namespaces with code, constructor parameter properties). `npm run dev` adds `node --watch`. Vitest reads the same files, so the tests run what production runs.

The consequences of running sources are accepted:

- Node has to be 24 or newer, which `engines` and `.nvmrc` already require.
- Node does not strip types from files under `node_modules`. The image for T8.1 keeps the workspace layout (the packages are linked, not copied into `node_modules`) and includes `packages/contract/openapi.yaml`, which the server reads at start-up.
- Imports carry their `.ts` extension, as in every other package, and type-only imports use `import type` (`verbatimModuleSyntax`).

### Kysely, with `pg`

The database is reached with Kysely over `pg`. Kysely is a typed query builder, not an ORM: queries stay SQL-shaped, the row types are written once in `src/db/tables.ts`, and `bytea` columns arrive as `Buffer`, which is what the collaboration server stores and loads. There is no code generation step and no engine binary.

### One migration tool: Kysely's `Migrator`

Schema changes are TypeScript files in `src/db/migrations/`, run by Kysely's `Migrator`:

- **Forward only.** A migration has an `up` and no `down`: a rollback in production is a new migration written for the data that exists then. A test checks that none defines `down`.
- **A static list.** `migrations/index.ts` lists them, and a provider returns that list, instead of scanning the folder. It behaves the same from sources, from a bundle and from a container, and it cannot load a file that nobody reviewed. A test fails if a file of the folder is missing from the list.
- **Named in order.** `0001_initial`, `0002_...`: Kysely sorts by name. A merged migration is never edited.
- **One owner at a time.** One task at a time adds migrations (plan §8.2), so two branches cannot pick the same number.
- **Run on purpose.** `npm run migrate` migrates; starting the server never does. Readiness reports `503` while the database holds migrations the server does not know about, or lacks some it does, so a half-deployed version is not sent traffic.

### Schema conventions

Every table that belongs to a workspace carries `workspace_id`, and every reference between two such tables is a composite foreign key through `(workspace_id, id)`, declared by a `unique (workspace_id, id)` on the referenced table. A row therefore cannot point at a folder, a document or a member of another workspace, whatever the application does. Roles, general access and lengths are `check` constraints, and lengths use `char_length` so they count code points as the contract does. A test reads the catalogue and fails if a table of a workspace gets a reference that does not go through `workspace_id`.

## Consequences

- Starting the server is the same command in development, CI and production. The sources are the artifact.
- A contributor who writes an enum gets a type error instead of a runtime crash.
- Kysely's types do not know the database: the migration is the source of the schema and `tables.ts` is kept beside it by hand. The integration tests insert and read every table through the typed builder, so a column that drifts from its type fails there.
- Migrations cannot be undone by a tool. Recovery is a backup (T8.1) or a new migration.

## Alternatives considered

- **`tsc` with `rewriteRelativeImportExtensions`, running `dist/`:** a standard approach that works everywhere, at the cost of a build that has to run before `dev`, `start` and the tests, a second tree that can go stale, and a base configuration that would emit JavaScript for one package only. Reconsider if the server needs syntax Node cannot strip.
- **`tsx` or `ts-node` as a loader:** no build, but a dependency in the runtime path that production would also carry.
- **A bundler (`esbuild`, `tsup`) for the image:** a good fit for a small image and it would lift the `node_modules` limit, but it adds a tool and a configuration for something Node now does itself. It can still be added to T8.1 without touching the sources.
- **Drizzle:** its schema-first approach is attractive, but 1.0 is still a release candidate (plan §3.3).
- **Prisma:** a heavy runtime with a binary engine, and a weaker fit for streaming `bytea`.
- **SQL migration files with a separate runner** (`node-pg-migrate`, `dbmate`): plain SQL is readable, but it adds a second tool and loses the typed schema builder; Kysely's `Migrator` already ships with the query builder.
- **`FileMigrationProvider`** (scanning the folder): less to register, but it needs dynamic `import()` of absolute paths, which Vitest and bundlers treat differently, and it loads whatever is in the folder.
