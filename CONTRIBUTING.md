# Contributing

## Requirements

- Node.js 24 (`.nvmrc`) and npm 11.

## Commands

```sh
npm ci                # install exactly what the lockfile says
npm run lint          # oxlint
npm run format:check  # Prettier (use `npm run format` to fix)
npm run typecheck     # tsc -b
npm test              # Vitest
```

CI runs the same commands in the required `Static checks` job.

## Server

The server (`apps/server`) runs its TypeScript sources with Node 24 directly, with no build step (ADR 0009). It needs a PostgreSQL 17, and Docker Compose provides one.

```sh
cp .env.example .env                               # development values; .env is ignored by git
docker compose up -d --wait postgres               # PostgreSQL on 127.0.0.1:5460, with a healthcheck
npm run migrate -w @draftroom/server               # create or update the schema
npm run dev -w @draftroom/server                   # the API on :8380, restarting when a file changes
```

| Script (`-w @draftroom/server`) | Does |
| --- | --- |
| `dev` | Starts the server with `node --watch`, reading `../../.env` if there is one. |
| `start` | Starts the server from the environment alone, as in production. |
| `migrate` | Runs the migrations that have not run yet, and exits. The server never migrates on its own. |
| `test:unit` | The unit tests, with no database. This is what the root `npm test` runs for the server. |
| `test:integration` | The tests against a real PostgreSQL 17 that Testcontainers starts: **Docker has to be running.** |
| `test` | Both. |

`curl localhost:8380/api/health/live` answers whenever the process is up; `/api/health/ready` answers `200` only when the database is reachable and the migrations are current. Configuration is read from the environment and validated at start-up (see `.env.example`); the server refuses to start if something is missing or wrong.

Stop the database with `docker compose down` (add `-v` to delete its volume). In a second checkout, pick another project name and port so the two do not collide: `COMPOSE_PROJECT_NAME=draftroom-other POSTGRES_PORT=5461 docker compose up -d --wait postgres`.

Migrations are TypeScript files in `apps/server/src/db/migrations/`, numbered and registered in `index.ts`. They only move forward, and a merged one is never edited: a change is a new file. CI runs the server's tests in the required `Server integration (PostgreSQL)` job; it fails if an operation the server implements is never exercised by an integration test.

## Workflow

- One branch per change; open a pull request against `main`. Pull requests are squash-merged.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/).
- Every new test must fail without its change: describe the mutation in the pull request.
- Do not weaken CI or skip tests to get a green build.
- Keep design files, exports and secrets out of the repository.
- `apps/web/src/styles/draftroom-tokens.css` is generated: never edit it by hand (see ADR 0008).
