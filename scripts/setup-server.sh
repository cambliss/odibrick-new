#!/usr/bin/env bash
#
# One-time server preparation for a fresh Ubuntu 22.04/24.04 VPS.
# Run as a sudo-capable user:  sudo bash scripts/setup-server.sh
#
set -euo pipefail

APP_USER="odibrick"
APP_DIR="/var/www/odibrick"
LOG_DIR="/var/log/odibrick"
STORAGE_DIR="${APP_DIR}/storage"

echo "==> Updating packages"
apt-get update -y
apt-get upgrade -y

echo "==> Installing Node.js 20, MySQL, Nginx"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
apt-get install -y mysql-server nginx certbot python3-certbot-nginx build-essential ufw git

echo "==> Creating the ${APP_USER} service account"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --system --create-home --shell /usr/sbin/nologin "${APP_USER}"
fi

echo "==> Creating directories"
mkdir -p "${APP_DIR}" "${LOG_DIR}" "${STORAGE_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" "${LOG_DIR}"
chmod 750 "${STORAGE_DIR}"

echo "==> Firewall"
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo "==> Hardening MySQL"
mysql_secure_installation || true

cat <<'NOTE'

Next steps, in order:

  1. Create the database and a least-privilege user:

       CREATE DATABASE odibrick CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
       CREATE USER 'odibrick'@'localhost' IDENTIFIED BY '<strong-password>';
       GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
         ON odibrick.* TO 'odibrick'@'localhost';
       FLUSH PRIVILEGES;

  2. Copy the repository to /var/www/odibrick and fill in the two .env files
     (see apps/api/.env.example and apps/web/.env.example).

  3. Run scripts/deploy.sh to install, migrate and build.

  4. Install the Nginx site and get a certificate:

       cp deploy/nginx.conf /etc/nginx/sites-available/odibrick
       ln -s /etc/nginx/sites-available/odibrick /etc/nginx/sites-enabled/
       nginx -t && systemctl reload nginx
       certbot --nginx -d odibrick.com -d www.odibrick.com

NOTE
