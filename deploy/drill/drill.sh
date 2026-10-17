#!/usr/bin/env bash
# The backup and restore drill: starts the production stack under a throwaway Compose project, runs deploy/drill/drill.ts
# against it and removes everything it started, whatever happens. CI runs it (`Backup and restore drill`); so can you:
#
#   deploy/drill/drill.sh
#
# Settings, each with a default that is free on a CI runner: COMPOSE_PROJECT_NAME, HTTPS_PORT and HTTP_PORT of the proxy,
# DRILL_RESTORED_API and DRILL_RESTORED_COLLAB for the server started on the restored database. The secrets of the stack are
# generated for the run, kept in a private temporary directory and deleted with it.
set -euo pipefail

repository="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-draftroom-drill}"
export HTTPS_PORT="${HTTPS_PORT:-8443}" HTTP_PORT="${HTTP_PORT:-8080}"
export DRILL_RESTORED_API="${DRILL_RESTORED_API:-18380}" DRILL_RESTORED_COLLAB="${DRILL_RESTORED_COLLAB:-18480}"
export DRILL_RESTORED_NAME="${COMPOSE_PROJECT_NAME}-restored" DRAFTROOM_VERSION=drill

umask 077
work="$(mktemp -d)"
compose=(docker compose --env-file "$work/drill.env" -f "$repository/deploy/docker-compose.prod.yml")
cleanup() {
  status=$?
  if [[ $status -ne 0 ]]; then
    echo "drill failed (exit $status); what the containers said:" >&2
    "${compose[@]}" logs --no-color --tail 80 >&2 || true
    docker logs --tail 40 "$DRILL_RESTORED_NAME" >&2 2>&1 || true
  fi
  docker rm --force "$DRILL_RESTORED_NAME" >/dev/null 2>&1 || true
  "${compose[@]}" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf -- "${work:?}"
  exit "$status"
}
trap cleanup EXIT

# `localhost` is a name Caddy issues a certificate for from its own authority, and one every Node resolves.
cat >"$work/drill.env" <<ENVIRONMENT
SITE_ADDRESS=localhost
PUBLIC_ORIGIN=https://localhost:${HTTPS_PORT}
SESSION_SECRET=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
DRAFTROOM_VERSION=${DRAFTROOM_VERSION}
ENVIRONMENT
set -a
# shellcheck source=/dev/null
source "$work/drill.env"
set +a

"${compose[@]}" up --detach --build --wait

# The proxy is healthy once its admin endpoint answers, which can be before it has issued its certificate and written the root
# certificate it issues from: wait for the file, up to a minute.
proxy="$("${compose[@]}" ps --quiet proxy)"
root_certificate=/data/caddy/pki/authorities/local/root.crt
for _ in $(seq 1 60); do
  docker exec "$proxy" test -s "$root_certificate" && break
  sleep 1
done
docker cp "$proxy:$root_certificate" "$work/caddy-root.crt" || { echo "the proxy never wrote $root_certificate" >&2; exit 1; }

export DRILL_ORIGIN="https://localhost:${HTTPS_PORT}" DRILL_HTTP_ORIGIN="http://localhost:${HTTP_PORT}"
export NODE_EXTRA_CA_CERTS="$work/caddy-root.crt"
node "$repository/deploy/drill/drill.ts"
