# 0016 · Production packaging: who serves the web app, how the database is migrated and how it is backed up

Status: proposed (2026-10-17, with the production packaging)

## Context

T8.1 makes the product ready to run on a host that is not a developer's laptop, without deploying it anywhere. Four decisions
shape that work and none of them is obvious from the code:

- The built web app is static files, and something has to serve them next to `/api` and `/collab`.
- ADR 0009 says the server never migrates when it starts, but a container that is replaced by a new version has nobody to run
  `npm run migrate` first, and two copies may start together.
- Nothing in the repository says how a backup is taken or proved to restore.
- The environment of a deployment holds secrets, and every file that describes the deployment is public.

## Decision

### 1. Caddy serves the web app; the server image holds the server only

There are two images, built from one `Dockerfile`: `server` (the API and the collaboration server, one Node process) and
`proxy` (Caddy with the built web app in `/srv`). Caddy terminates HTTPS, serves the files with a single-page-app fallback,
sends `/api/*` to the REST listener and `/collab` to the collaboration listener.

- **Why not the server.** Serving files from Fastify needs `@fastify/static`, a dependency nobody has approved, and the server
  image would then carry a web build. It would also give the Node process one more job (compression, caching headers, range
  requests) that Caddy does with no code of ours.
- **The proxy is needed anyway.** HTTPS and WSS have to be terminated somewhere, and the plan asks for a reverse proxy in front
  of the server; once it exists, it is the natural place for the static files and for the cache headers (hashed assets are
  immutable, the page is not).
- **Cost.** Two images instead of one, and a web build that lives in the proxy image: a deployment that wants another proxy
  copies `apps/web/dist` out of it (`docs/deploy/README.md` says how).

The web app talks to its own origin (`/api`, and `/collab` as `wss://` on the page's host), so the build needs no address and
the same image runs on any host name.

### 2. Migrations run when the container starts, under the lock Kysely already takes

The image's command is `node src/db/run-migrations.ts && exec node src/main.ts`: migrate, then serve. A failed migration ends
the container before it listens, so a half-migrated version never serves traffic, and readiness (ADR 0009) still refuses a
database whose migrations are not the ones the server knows.

The server process itself still never migrates. This changes one bullet of ADR 0009 ("run on purpose") only for the image: the
deployment's own start command is the deliberate act, `npm run migrate` stays what it was, and `npm start` stays a server that
serves.

**The lock is Kysely's, and it is enough.** `Migrator.migrateToLatest()` holds a PostgreSQL advisory lock (`pg_advisory_lock` of
a fixed key, on one connection, for the whole run) and creates its own bookkeeping tables tolerating a concurrent creator. It
was checked before deciding: three runs started together on an empty database, fifteen times, always ended with every
migration applied exactly once and no error. A lock of our own on top would be the same thing twice. What is ours is the test
(`apps/server/test/migrations.concurrent.test.ts`): two processes are released at the same instant on an empty database, both
must exit successfully, every migration must be recorded once and exactly one of them must have applied them. It fails when the
lock is removed, so an upgrade of Kysely that changed this would be noticed.

Two instances that start together therefore migrate one after the other, and the second finds nothing to do. Instances that
are replaced one after the other during an update rely on the migrations being compatible with the running version, which is a
rule for whoever writes a migration, not something the packaging can check.

### 3. Backups run inside the database's container and need no password

`scripts/backup.sh` and `scripts/restore.sh` execute `pg_dump` and `pg_restore` in the PostgreSQL container with `docker exec`.
The tools are then always the server's version (a host with PostgreSQL 16 tools cannot dump a 17 server, which is what a CI
runner has), and they connect over the container's local socket as the container's own user, so no credential is read, passed or
written. A password cannot appear in `ps` if there is none.

- A backup is a custom-format archive written beside its final name, read back with `pg_restore --list` and only then moved,
  readable by its owner only, and never overwrites another.
- A restore names its target database (a plain identifier, checked), verifies that the file is an archive before it touches
  anything, creates a missing database, and drops and recreates one that holds data only when asked to by `--yes` or by typing the
  name, and only if nobody is connected to it.
- A host that does not run the stack in Docker takes the same two commands by hand (`docs/deploy/README.md`); the scripts exist for
  the Compose stack, and that is what the tests and the CI drill exercise.

The CI drill (`Backup and restore drill`, optional) is what keeps this honest: it starts the production stack, creates an account and a
document with content, takes a backup, restores it into a new database and opens the document from a server pointed at it.

### 4. Nothing secret is ever in the repository, and a test says so

`deploy/env.example` holds markers (`CHANGE_ME…`) and an explanation of each variable; the real file is `deploy/.env`, which git
ignores. A test walks `deploy/`, the `Dockerfile`, `.dockerignore` and the two scripts and fails on anything shaped like a
secret: private keys, provider tokens, a password in a URL, a value given to a variable named like a secret, a long random-looking
string. The images are built from a context that excludes every `.env*` file, the tests and the development seed, and run as the
unprivileged `node` user with a read-only file system, no capabilities and no way to gain privileges.

## Consequences

- A host with Docker runs the product with one file of settings and one command; a host with Node 24 and PostgreSQL 17 runs it with
  the two commands of the image's `CMD`.
- Only Caddy publishes ports. The database and the server are not reachable from outside the Compose network.
- The proxy sends one header, `Strict-Transport-Security: max-age=31536000`, as ADR 0004 assigns to this task: without HSTS a
  browser can be sent back to plain HTTP, where the `Secure` session cookie is never sent. It has no `includeSubDomains` and no
  `preload`: this site cannot speak for the other names under its domain, and a preload list cannot be left.
- The other security headers, a content security policy, CORS and `trustProxy` are not part of this change (T7.2; headers there are
  the server's), and neither is a shared store for the sign-in rate limit; both are listed in `docs/deploy/README.md` as what the
  deployment does not yet have.
- Scaling out is not possible and not attempted: one process serves a document (ADR 0001). The guide says why.

## Alternatives considered

- **The server serves the web app** (`@fastify/static`): one image, but a new dependency, and the proxy is needed for TLS anyway.
- **A third container or a volume that holds the web build** and is shared with the proxy: it separates the release of the web
  app from the proxy, which nobody needs yet, and adds a volume to reason about.
- **A one-shot `migrate` service in Compose** that the server waits for: clearer in a diagram, but it does not exist outside
  Compose and two replicas still need the lock. The command in the image works everywhere the image does.
- **An advisory lock of our own around the migrations:** redundant with Kysely's, and the reason to prefer the test.
- **Backups with the host's `pg_dump`:** needs the same major version as the server on every host, and a password file to keep safe.
- **A managed backup service:** the right answer for a real deployment and a decision for the owner; the plan creates no account.
