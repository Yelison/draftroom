#!/usr/bin/env bash
# Writes a backup of the production database: a PostgreSQL custom-format archive, restorable with scripts/restore.sh.
#
#   scripts/backup.sh [OUTPUT_DIR]
#
# OUTPUT_DIR defaults to $BACKUP_DIR, then to deploy/backups (which git ignores). The path of the archive is the only thing
# printed on standard output. Environment: POSTGRES_USER and POSTGRES_DB (default `draftroom`), COMPOSE_PROJECT_NAME or
# POSTGRES_CONTAINER to say which database. A backup holds everybody's documents: keep it as private as the database.
set -euo pipefail
# shellcheck source=../deploy/lib/postgres-container.sh
source "$(dirname "${BASH_SOURCE[0]}")/../deploy/lib/postgres-container.sh"

user="${POSTGRES_USER:-draftroom}"
database="${POSTGRES_DB:-draftroom}"
require_database_name "$database"
output_dir="${1:-${BACKUP_DIR:-$(dirname "${BASH_SOURCE[0]}")/../deploy/backups}}"
container="$(find_postgres_container)"

# Readable by its owner only, from the first byte.
umask 077
mkdir -p -- "$output_dir"
archive="$output_dir/draftroom-$database-$(date -u +%Y%m%dT%H%M%SZ).dump"
[[ ! -e "$archive" ]] || die "$archive already exists; a backup is never overwritten"

# Written beside its final name and moved when it is complete and has been read back: a dump that failed halfway never
# looks like a backup.
partial="$archive.partial"
trap 'rm -f -- "$partial"' EXIT
docker exec "$container" pg_dump --format=custom --username "$user" --dbname "$database" >"$partial"
docker exec -i "$container" pg_restore --list <"$partial" >/dev/null || die 'the archive that was written cannot be read back'
mv -- "$partial" "$archive"

echo "backed up '$database' to $archive ($(wc -c <"$archive") bytes)" >&2
echo "$archive"
