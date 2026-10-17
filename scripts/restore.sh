#!/usr/bin/env bash
# Restores a backup written by scripts/backup.sh into a database that you name.
#
#   scripts/restore.sh [--yes] BACKUP_FILE TARGET_DATABASE
#
# A database that does not exist is created. One that already holds data is dropped and created again, but only when you type
# its name at the prompt or pass --yes, and only once nothing is connected to it: stop the server first. Restoring into a new
# database and pointing a server at it is the safe way to try a backup; restoring over the live one recovers from a loss.
# Environment: POSTGRES_USER (default `draftroom`), COMPOSE_PROJECT_NAME or POSTGRES_CONTAINER to say which server.
set -euo pipefail
# shellcheck source=../deploy/lib/postgres-container.sh
source "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib/postgres-container.sh"

confirmed=false
if [[ "${1:-}" == --yes ]]; then
  confirmed=true
  shift
fi
[[ $# -eq 2 ]] || die 'usage: scripts/restore.sh [--yes] BACKUP_FILE TARGET_DATABASE'
backup_file="$1"
target="$2"
user="${POSTGRES_USER:-draftroom}"
require_database_name "$target"
[[ -f "$backup_file" ]] || die "'$backup_file' is not a file"
container="$(find_postgres_container)"

# `-i` only where a file is fed in: elsewhere the container would read, and wait for, this script's own input.
in_postgres() { docker exec "$container" "$@"; }
feed_postgres() { docker exec -i "$container" "$@"; }
sql() { in_postgres psql --username "$user" --dbname postgres --set ON_ERROR_STOP=1 --tuples-only --no-align --command "$1"; }

# Before anything is touched: the file has to be an archive this PostgreSQL can read.
feed_postgres pg_restore --list <"$backup_file" >/dev/null 2>&1 || die "'$backup_file' is not a readable backup archive"

exists="$(sql "select count(*) from pg_database where datname = '$target'")"
if [[ "$exists" == 0 ]]; then
  sql "create database \"$target\"" >/dev/null
  echo "created the database '$target'" >&2
else
  tables="$(in_postgres psql --username "$user" --dbname "$target" --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --command "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')")"
  if [[ "$tables" != 0 && "$confirmed" != true ]]; then
    [[ -t 0 ]] || die "'$target' holds $tables tables: pass --yes to overwrite them"
    read -r -p "'$target' holds $tables tables, and the restore replaces them. Type its name to go on: " answer
    [[ "$answer" == "$target" ]] || die 'not confirmed; nothing was changed'
  fi
  if [[ "$tables" != 0 ]]; then
    # Without `with (force)`: PostgreSQL refuses while a server is connected, which is the reminder to stop it.
    sql "drop database \"$target\"" >/dev/null || die "'$target' is in use: stop whatever is connected to it first"
    sql "create database \"$target\"" >/dev/null
    echo "dropped and created '$target' again" >&2
  fi
fi

# One transaction: a restore that fails halfway leaves the database empty, never half full.
feed_postgres pg_restore --username "$user" --dbname "$target" \
  --no-owner --no-privileges --exit-on-error --single-transaction <"$backup_file"
echo "restored $backup_file into '$target'" >&2
