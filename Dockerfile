# Production images for Draftroom. One build, two images:
#
#   docker build --target server -t draftroom-server .   the API and the collaboration server (one Node process)
#   docker build --target proxy  -t draftroom-proxy  .   Caddy: HTTPS, the built web app, and the route to the server
#
# docs/decisions/0016-production-packaging.md explains the split. Both base images are pinned by version and by the digest
# of their multi-architecture index, so every build starts from the same bytes; a bump is a reviewed change to this file.
ARG NODE_IMAGE=node:24.21.0-alpine3.23@sha256:9ec4a2e289874ed0d722e1772ec2de45d2801541db8612f3638b26f128c69ac2
ARG CADDY_IMAGE=caddy:2.11.7-alpine@sha256:d8542f48d34a9cf4e4c11a478865229840e87e4c96ea3f439101f31a5d35f75f

# The manifests alone, so the layers that install dependencies are rebuilt only when a dependency changes.
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/contract/package.json packages/contract/
COPY packages/editor-schema/package.json packages/editor-schema/

# What the server needs to run, and nothing a test, a linter or a browser needs: no development dependencies.
FROM manifests AS server-dependencies
RUN npm ci --omit=dev --ignore-scripts --workspace @draftroom/server --include-workspace-root=false \
  && npm cache clean --force

# The web app, built with its development dependencies. The production mode talks to the real API; the mock data source
# is compiled out, and a test of the web package keeps it out.
FROM manifests AS web-build
RUN npm ci --ignore-scripts && npm cache clean --force
COPY tsconfig.base.json ./
COPY apps/web apps/web
COPY packages packages
RUN npm run build --workspace @draftroom/web

# Node 24 runs the TypeScript sources itself (ADR 0009), so the image keeps the workspace layout: `node_modules/@draftroom/*`
# are links to `packages/*`, and Node strips types from files it reaches through a link but not from files inside
# `node_modules`.
FROM ${NODE_IMAGE} AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=server-dependencies /app/node_modules node_modules
COPY package.json ./
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY packages/contract packages/contract
COPY packages/editor-schema packages/editor-schema
# The unprivileged user the Node image ships with. Nothing writes to the image, so nothing is owned by it.
USER node
WORKDIR /app/apps/server
EXPOSE 8380 8480
# Readiness, not liveness: a server whose database is down or not migrated is not ready, and is not sent traffic.
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=6 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.API_PORT ?? 8380}/api/health/ready`).then((response) => process.exit(response.ok ? 0 : 1), () => process.exit(1))"]
# Migrate, then serve. Two instances that start together migrate one after the other (Kysely holds a PostgreSQL advisory
# lock for the whole run), and a failed migration ends the container before it listens. `exec` makes Node the process that
# receives the stop signal, so the collaboration server stores the documents it holds before it exits.
CMD ["sh", "-c", "node src/db/run-migrations.ts && exec node src/main.ts"]

FROM ${CADDY_IMAGE} AS proxy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=web-build /app/apps/web/dist /srv
