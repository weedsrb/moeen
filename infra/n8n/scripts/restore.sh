#!/bin/sh
set -eu

test "$#" -eq 1 || { echo "Usage: $0 <n8n-db-*.sql.gz.age>" >&2; exit 1; }
cd "$(dirname "$0")/.."
test -f .env || { echo "Missing infra/n8n/.env" >&2; exit 1; }
set -a
. ./.env
set +a

backup_file="$1"
test -f "$backup_file" || { echo "Backup not found: $backup_file" >&2; exit 1; }
command -v age >/dev/null 2>&1 || { echo "Install age first" >&2; exit 1; }

echo "This replaces the n8n database. Type RESTORE to continue:"
read -r confirmation
test "$confirmation" = "RESTORE" || { echo "Cancelled"; exit 1; }

age --decrypt "$backup_file" \
  | gunzip \
  | docker compose exec -T postgres psql --username "$N8N_DB_USER" --dbname "$N8N_DB_NAME"

echo "Database restored. Restart n8n and validate workflows while they remain disabled."
