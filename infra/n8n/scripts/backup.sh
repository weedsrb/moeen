#!/bin/sh
set -eu

cd "$(dirname "$0")/.."
test -f .env || { echo "Missing infra/n8n/.env" >&2; exit 1; }
set -a
. ./.env
set +a

test -n "${BACKUP_AGE_RECIPIENT:-}" || { echo "BACKUP_AGE_RECIPIENT is required" >&2; exit 1; }
command -v age >/dev/null 2>&1 || { echo "Install age first" >&2; exit 1; }

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_dir="${BACKUP_DIR:-./backups}"
mkdir -p "$backup_dir" ../../n8n/workflows

docker compose exec -T n8n n8n export:workflow --backup --output=/exports
docker compose exec -T postgres pg_dump \
  --username "$N8N_DB_USER" --dbname "$N8N_DB_NAME" --clean --if-exists \
  | gzip \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$backup_dir/n8n-db-$timestamp.sql.gz.age"

tar -czf - -C ../.. n8n/workflows \
  | age -r "$BACKUP_AGE_RECIPIENT" -o "$backup_dir/n8n-workflows-$timestamp.tar.gz.age"

find "$backup_dir" -type f -name '*.age' -mtime "+${BACKUP_RETENTION_DAYS:-14}" -delete
echo "Encrypted n8n backup completed: $timestamp"
