#!/usr/bin/env bash
#
# Build and release Odibrick on the VPS.
#   sudo -u odibrick bash scripts/deploy.sh
#
# Idempotent: safe to run on every release. It refuses to continue if the
# migrations fail, so a broken schema never reaches a running process.
#
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/odibrick}"
cd "${APP_DIR}"

echo "==> Checking environment files"
for env_file in apps/api/.env apps/web/.env; do
  if [[ ! -f "${env_file}" ]]; then
    echo "Missing ${env_file}. Copy the matching .env.example and fill it in." >&2
    exit 1
  fi
done

echo "==> Installing dependencies"
npm ci --workspaces --include-workspace-root || npm install --workspaces --include-workspace-root

echo "==> Applying database migrations"
node database/migrate.js

echo "==> Building the API"
npm run build --workspace=@odibrick/api

echo "==> Building the web app"
npm run build --workspace=@odibrick/web

echo "==> Reloading processes"
if command -v pm2 >/dev/null 2>&1; then
  pm2 reload deploy/ecosystem.config.js --env production || \
    pm2 start deploy/ecosystem.config.js --env production
  pm2 save
else
  systemctl restart odibrick-api odibrick-web
fi

echo "==> Waiting for the API to answer"
for attempt in {1..15}; do
  if curl -fsS http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    echo "    API is up."
    break
  fi
  if [[ ${attempt} -eq 15 ]]; then
    echo "    API did not become healthy. Check /var/log/odibrick/api.error.log" >&2
    exit 1
  fi
  sleep 2
done

echo "==> Done."
