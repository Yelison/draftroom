#!/usr/bin/env bash
# Restores a backup written by scripts/backup.sh into a database that you name.
#
#   scripts/restore.sh [--yes] BACKUP_FILE TARGET_DATABASE
#
# The archive is restored into a scratch database first, and only a restore that went all the way replaces the target: a
# truncated or damaged archive can therefore never cost you the database you meant to recover. A target that does not exist is
# created. One that already holds data is replaced only when you type its name at the prompt or pass --yes, and only once nothing
# is connected to it: stop the server first. Restoring into a new database and pointing a server at it is the safe way to try a
# backup; restoring over the live one recovers from a loss. `postgres`, `template0` and `template1` are never targets.
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
case "$target" in
  postgres | template0 | template1) die "'$target' is a database of PostgreSQL itself, not a place to restore into" ;;
esac
[[ -f "$backup_file" ]] || die "'$backup_file' is not a file"
container="$(find_postgres_container)"

# `-i` only where a file is fed in: elsewhere the container would read, and wait for, this script's own input.
in_postgres() { docker exec "$container" "$@"; }
feed_postgres() { docker exec -i "$container" "$@"; }
sql() { in_postgres psql --username "$user" --dbname postgres --set ON_ERROR_STOP=1 --tuples-only --no-align --command "$1"; }
database_exists() { [[ "$(sql "select count(*) from pg_database where datname = '$1'")" != 0 ]]; }

# Before anything is touched: the whole archive has to read. `pg_restore --list` only reads the table of contents at the start of
# the file, which a transfer cut short still has; writing every table's data to nowhere is what meets the cut.
feed_postgres pg_restore --file=/dev/null <"$backup_file" >/dev/null 2>&1 || die "'$backup_file' is not a complete, readable backup archive"

tables=0
if database_exists "$target"; then
  tables="$(in_postgres psql --username "$user" --dbname "$target" --set ON_ERROR_STOP=1 --tuples-only --no-align \
    --command "select count(*) from pg_tables where schemaname not in ('pg_catalog', 'information_schema')")"
  if [[ "$tables" != 0 && "$confirmed" != true ]]; then
    [[ -t 0 ]] || die "'$target' holds $tables tables: pass --yes to overwrite them"
    read -r -p "'$target' holds $tables tables, and the restore replaces them. Type its name to go on: " answer
    [[ "$answer" == "$target" ]] || die 'not confirmed; nothing was changed'
  fi
fi

# Names that cannot clash with a person's database, and are valid whatever the target is called.
suffix="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
scratch="restore_scratch_$suffix"
previous="restore_previous_$suffix"
drop_if_exists() { sql "drop database if exists \"$1\"" >/dev/null 2>&1 || true; }
trap 'drop_if_exists "$scratch"' EXIT

sql "create database \"$scratch\"" >/dev/null
# One transaction into a database nobody else knows: a restore that fails leaves the scratch database to be dropped and the
# target as it was.
feed_postgres pg_restore --username "$user" --dbname "$scratch" \
  --no-owner --no-privileges --exit-on-error --single-transaction <"$backup_file" || die "restoring '$backup_file' failed; '$target' was not touched"

if [[ "$tables" == 0 ]] && ! database_exists "$target"; then
  sql "alter database \"$scratch\" rename to \"$target\"" >/dev/null || die "could not move the restored database into place; '$target' was not touched"
  echo "created the database '$target'" >&2
else
  # Renaming needs a database nobody is connected to; PostgreSQL refuses while a server is, which is the reminder to stop it.
  sql "alter database \"$target\" rename to \"$previous\"" >/dev/null || die "'$target' is in use: stop whatever is connected to it first; it was not touched"
  if ! sql "alter database \"$scratch\" rename to \"$target\"" >/dev/null; then
    sql "alter database \"$previous\" rename to \"$target\"" >/dev/null || die "could not put '$target' back: it is now called '$previous'"
    die "could not move the restored database into place; '$target' was put back as it was"
  fi
  # The restore is in place: what it replaced goes last.
  drop_if_exists "$previous"
  echo "replaced '$target'" >&2
fi
echo "restored $backup_file into '$target'" >&2
