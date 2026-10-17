# Deploying Draftroom

Draftroom runs as one Node.js process (the REST API and the collaboration WebSocket, on two ports) in front of PostgreSQL 17,
behind a reverse proxy that terminates HTTPS and serves the built web app. This guide covers a host with Docker and a host
with only Node 24 and PostgreSQL 17, the proxy and its WebSocket requirements, every variable, backups, and what does not scale or
is not done yet. The reasoning behind the layout is in [ADR 0016](../decisions/0016-production-packaging.md).

Nothing here deploys anything: it prepares a host that you control.

## With Docker (the tested path)

You need Docker with the Compose plugin, a host name whose DNS record points at the machine, and ports 80 and 443 free.

```sh
cp deploy/env.example deploy/.env
# Edit deploy/.env: SITE_ADDRESS, PUBLIC_ORIGIN, and the two secrets (the file says how to generate them).
docker compose --env-file deploy/.env -f deploy/docker-compose.prod.yml -p draftroom up -d --build --wait
```

`--wait` returns when PostgreSQL, the server and the proxy report healthy. The server migrates the database before it listens,
and its healthcheck is `GET /api/health/ready`, which answers `200` only when the database is reachable and has exactly the
migrations this version knows. Caddy obtains the certificate for `SITE_ADDRESS` by itself on first start and keeps it in the
`caddy-data` volume.

To try the stack on one machine, use a name Caddy does not treat as public, for example `SITE_ADDRESS=draftroom.localhost`. Caddy
then issues a certificate from its own authority; the browser will not trust it until you install the root certificate it keeps
at `/data/caddy/pki/authorities/local/root.crt` in the proxy container (`docker compose cp` brings it out), or you accept the
warning for that name. With `HTTPS_PORT` set to something other than 443, `PUBLIC_ORIGIN` carries the port.

Updating is `git pull` and the same `up -d --build --wait`. Migrations only go forward (ADR 0009), so take a
[backup](#backups-and-restore) first: going back to an older version means restoring one.

Stopping is `docker compose -p draftroom down`; add `--volumes` only to delete the database and the certificates.

## Without Docker

You need Node.js 24, PostgreSQL 17, and a reverse proxy.

```sh
npm ci
npm run build --workspace @draftroom/web            # the web app: apps/web/dist
npm ci --omit=dev --workspace @draftroom/server --include-workspace-root=false   # on the host that runs the server
```

Run the two commands the container runs, from `apps/server`, with the [variables](#variables) in the environment:

```sh
node src/db/run-migrations.ts && exec node src/main.ts
```

Node runs the TypeScript sources itself (ADR 0009): there is no server build. Give the process a service manager that restarts it
and sends `SIGTERM` to stop it; on that signal it stores the documents it holds before it exits, so allow it a few seconds.
`apps/server` needs the workspace layout around it (`packages/contract` and `packages/editor-schema` beside it), as in the image.

## The reverse proxy

Any proxy works if it does these four things. [`deploy/Caddyfile`](../../deploy/Caddyfile) is the reference, and the only one that is
tested.

1. **Terminate TLS.** The server speaks plain HTTP and plain WebSocket; the browser must reach it over HTTPS and WSS. In production
   the server marks both cookies `Secure` ([ADR 0004](../decisions/0004-authentication.md)), and a browser never sends a `Secure`
   cookie over plain HTTP, so nobody could stay signed in; a page served over HTTPS also cannot open an unencrypted WebSocket.
   The proxy needs to add nothing about cookies: it passes `Set-Cookie` and `Cookie` as they are. It should send
   `Strict-Transport-Security: max-age=31536000`, so that a browser which has seen the site over HTTPS never goes back to HTTP
   (the reference Caddyfile does; leave out `includeSubDomains` and `preload` unless you own every name under the domain).
2. **Send `/api/*` to `API_PORT`** (8380) and keep the path as it is.
3. **Send `/collab` to `COLLAB_PORT`** (8480), keep the path, and forward the WebSocket handshake: the `Connection: Upgrade` and
   `Upgrade: websocket` headers have to reach the server, and an idle connection must not be closed by the proxy sooner than
   the server decides (the client reconnects, but every drop shows as a loss of the connection). Caddy does both by itself; for nginx
   this means `proxy_http_version 1.1`, the two headers set explicitly and a long `proxy_read_timeout`.
4. **Serve `apps/web/dist`** for everything else, answering `index.html` for any path that is not a file (the app is a single page
   and routes in the browser). Hashed files under `/assets/` can be cached for a year; `index.html` must not be.

The server checks the `Origin` of every WebSocket upgrade against `ALLOWED_ORIGINS`, so `PUBLIC_ORIGIN` has to be exactly what the
browser shows in its address bar, port included.

## The first account and sessions

There is no setup step and no default account. Open the address and sign up: a person who signs up without an invitation gets a
workspace of their own, of which they are the owner, in the same transaction, so on a new installation the first person to sign up
has somewhere to create documents. Everybody else is invited by email from the workspace's settings and claims the invitation
when they sign up.

Sessions are server-side: a session ends after 30 days, or after 7 without use, and signing out closes the person's open
documents at once (ADR 0004). Passwords are hashed with Argon2id, which holds about 19 MiB of memory for the 70 ms it takes, so a
burst of sign-ins needs memory in proportion; the container needs no more than a few hundred MiB for a team.

## Variables

The server reads these and nothing else from its environment; it refuses to start, naming every problem, when one is wrong.

| Variable          | Required                    | Meaning                                                                                                   |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`        | yes, set to `production`    | Anything else may enable the development identity. Only an explicit `development` or `test` does.         |
| `DATABASE_URL`    | yes                         | `postgres://user:password@host:5432/database`. The password must be URL-safe.                             |
| `SESSION_SECRET`  | in production               | At least 32 characters, different per environment. It keys the CSRF tokens. Changing it or restarting without it makes every CSRF cookie fail until the person signs in again; the sessions themselves live in the database and survive. |
| `ALLOWED_ORIGINS` | in production               | Comma-separated origins (scheme, host, port; no path) the browser may use. The Compose file sets it from `PUBLIC_ORIGIN`. |
| `API_PORT`        | no, 8380                    | The REST listener. Must differ from `COLLAB_PORT`.                                                        |
| `COLLAB_PORT`     | no, 8480                    | The collaboration WebSocket listener.                                                                     |

The Compose file takes its own settings from `deploy/.env`, explained line by line in [`deploy/env.example`](../../deploy/env.example):
`SITE_ADDRESS`, `PUBLIC_ORIGIN`, `SESSION_SECRET`, `POSTGRES_PASSWORD` and, optionally, `POSTGRES_USER`, `POSTGRES_DB`, `HTTP_PORT`,
`HTTPS_PORT` and `DRAFTROOM_VERSION`. Secrets live only there, or in the environment of your service manager: never in an image, a
command line or the repository.

## Backups and restore

`scripts/backup.sh` writes a PostgreSQL custom-format archive of the database to `deploy/backups/` (or the directory you pass),
readable by its owner only, and prints its path. `scripts/restore.sh` restores one into a database you name.

```sh
scripts/backup.sh                                  # -> deploy/backups/draftroom-draftroom-20261017T031500Z.dump
scripts/restore.sh deploy/backups/<file>.dump draftroom_restored
```

Both find the database through the Compose project (`COMPOSE_PROJECT_NAME`, default `draftroom`; `POSTGRES_CONTAINER` names a
container directly) and run `pg_dump` and `pg_restore` inside it, so they need Docker and no password. `POSTGRES_USER` and
`POSTGRES_DB` default to the Compose defaults.

- **Try a backup by restoring it into a new database**, and pointing a server at that database (`POSTGRES_DB` of a second stack, or a
  `DATABASE_URL`). A backup that has never been restored is a hope. The optional CI workflow `Backup and restore drill` does exactly
  this on every change to the packaging.
- **Restoring over the live database** is how you recover from a loss: stop the server first (`docker compose stop server proxy`);
  the script refuses to drop a database that something is connected to, asks you to type its name unless you pass `--yes`, and
  restores in one transaction. Start the stack again afterwards.
- **Keep backups off the machine** that holds the database, and as private as the database itself: they contain everybody's documents.
  Retention and where they go are yours to decide; the scripts only make the archive.
- **Without Docker,** the same thing by hand: `pg_dump --format=custom --file draftroom.dump "$DATABASE_URL"`, and
  `pg_restore --no-owner --single-transaction --dbname <new database> draftroom.dump`. The tools must be PostgreSQL 17, and the
  password belongs in `PGPASSFILE`, never in the command line. These two commands are not exercised by the tests.

## Scaling

**Run one server process.** A document is served by the one process that holds it: the live Yjs document, the lock that orders its
stores, the record of what has been durably stored, and the connections that revocations and comment notifications reach all live in
that process's memory. A second process serving the same document would hold a second copy, each would store its own state over the
other's, and a person removed from a document would still be connected through the other process. That is why the plan fixes one
collaboration instance per document (ADR 0001).

Running several processes would need the Hocuspocus Redis extension (or an equivalent that routes every document to one process),
and the broadcast of revocations across processes. That is deferred; this stack does not run replicas, and Compose is not given a
`scale`. The database and the proxy are not the limit: a single process serves a team's documents.

## What is not done yet

- **Email addresses are not verified at sign-up.** Whoever signs up first with an address that has a pending invitation inherits
  what was shared with it, and the sign-up answer tells which addresses have an account. This is a known risk the owner accepted
  (ADR 0004, README); it needs email delivery in both languages before the product is public.
- **Security headers, a content security policy, CORS, `trustProxy` and the production build guard against the development
  identity** are T7.2. Until then the only header the deployment sends is `Strict-Transport-Security` (from the proxy), and the server sees the proxy's address, not the visitor's:
  **every visitor shares the network address of the proxy**, so the per-address limits on sign-in and sign-up (30 failed sign-ins
  per 15 minutes, 10 sign-ups per hour) are counted for everybody together and one person's attempts can use them up. The
  per-account limit (10 failed sign-ins per 15 minutes) is not affected.
- **The limits on attempts live in the memory of the process.** They reset on restart and forget the oldest keys under pressure
  (5000 keys), which is right for the one process this stack runs. A shared store is needed only if there is ever more than one
  process (see Scaling), and is not built.
- **No host, registry or account is created.** Images are built on the machine that runs them; publishing them to a registry and
  choosing where to run them is for the owner to decide.
