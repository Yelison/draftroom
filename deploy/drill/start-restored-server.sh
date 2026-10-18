#!/usr/bin/env bash
# Starts a second server of the stack on the restored database, published on the loopback only. The drill signs in and opens
# the document through it. The credentials reach the container from the environment, by name: nothing secret is an argument.
set -euo pipefail

: "${COMPOSE_PROJECT_NAME:?}" "${DRILL_RESTORED_API:?}" "${DRILL_RESTORED_COLLAB:?}" "${DRILL_RESTORED_NAME:?}"
: "${POSTGRES_PASSWORD:?}" "${SESSION_SECRET:?}" "${DRAFTROOM_VERSION:?}"

DATABASE_URL="postgres://${POSTGRES_USER:-draftroom}:${POSTGRES_PASSWORD}@postgres:5432/draftroom_restored"
ALLOWED_ORIGINS="http://127.0.0.1:${DRILL_RESTORED_API}"
export DATABASE_URL ALLOWED_ORIGINS NODE_ENV=production

docker run --detach --name "$DRILL_RESTORED_NAME" \
  --network "${COMPOSE_PROJECT_NAME}_default" \
  --publish "127.0.0.1:${DRILL_RESTORED_API}:8380" --publish "127.0.0.1:${DRILL_RESTORED_COLLAB}:8480" \
  --env DATABASE_URL --env SESSION_SECRET --env ALLOWED_ORIGINS --env NODE_ENV \
  "draftroom-server:${DRAFTROOM_VERSION}" >/dev/null
