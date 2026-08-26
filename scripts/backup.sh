#!/usr/bin/env bash
#
# Nightly backup of the database and the document vault.
# Add to cron:  0 2 * * * /var/www/odibrick/scripts/backup.sh
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/odibrick}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/odibrick}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# shellcheck disable=SC1090
set -a; source "${APP_DIR}/apps/api/.env"; set +a

mkdir -p "${BACKUP_DIR}"

echo "==> Dumping the database"
mysqldump \
  --host="${DB_HOST:-127.0.0.1}" \
  --user="${DB_USER}" \
  --password="${DB_PASSWORD}" \
  --single-transaction --quick --routines --triggers \
  "${DB_NAME}" | gzip > "${BACKUP_DIR}/db-${STAMP}.sql.gz"

echo "==> Archiving the document vault"
if [[ -d "${APP_DIR}/storage" ]]; then
  tar -czf "${BACKUP_DIR}/storage-${STAMP}.tar.gz" -C "${APP_DIR}" storage
fi

echo "==> Pruning backups older than ${RETAIN_DAYS} days"
find "${BACKUP_DIR}" -type f -name '*.gz' -mtime "+${RETAIN_DAYS}" -delete

echo "==> Backup complete: ${BACKUP_DIR}"
echo "    Copy these off the box — a backup on the same disk is not a backup."
