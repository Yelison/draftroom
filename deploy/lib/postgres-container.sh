# Shared by scripts/backup.sh and scripts/restore.sh, which source it. It is not run by itself.
#
# The PostgreSQL tools run inside the database's own container, for two reasons: they are always the version of the server
# (a host with PostgreSQL 16 tools cannot dump a 17 server), and they reach it over the container's local socket, where the
# image trusts the container's own user. No password is read, passed or written anywhere by the scripts.

die() {
  echo "error: $*" >&2
  exit 1
}

# Prints the id of the running container of the stack's database. `POSTGRES_CONTAINER` names it directly; otherwise it is
# the `postgres` service of the Compose project `COMPOSE_PROJECT_NAME` (default `draftroom-prod`, the production stack's:
# `draftroom` is the development one), found by label so that no Compose file has to be read, and with it no variable of it.
find_postgres_container() {
  if [[ -n "${POSTGRES_CONTAINER:-}" ]]; then
    docker inspect --format '{{.Id}}' "$POSTGRES_CONTAINER" 2>/dev/null || die "no container named '$POSTGRES_CONTAINER'"
    return
  fi
  local project="${COMPOSE_PROJECT_NAME:-draftroom-prod}" matches
  matches="$(docker ps --quiet --no-trunc \
    --filter "label=com.docker.compose.project=$project" \
    --filter 'label=com.docker.compose.service=postgres')"
  [[ -n "$matches" ]] || die "no running 'postgres' service in the Compose project '$project' (set COMPOSE_PROJECT_NAME or POSTGRES_CONTAINER)"
  [[ "$(wc -l <<<"$matches")" -eq 1 ]] || die "more than one 'postgres' container in the Compose project '$project'"
  echo "$matches"
}

# Database names go into SQL and into file names: only what PostgreSQL accepts without quoting.
require_database_name() {
  [[ "$1" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "'$1' is not a plain database name (lowercase letters, digits and underscores)"
}
