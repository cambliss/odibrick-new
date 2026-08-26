# Deployment

Target: a single Ubuntu 22.04 or 24.04 VPS. No Docker. Nginx terminates TLS in front
of two Node processes supervised by PM2 or systemd.

**Minimum sensible box:** 2 vCPU, 4 GB RAM, 40 GB SSD. The Next.js build is the
memory-hungry step; below 4 GB you will want swap.

---

## 1. Prepare the server

```bash
sudo bash scripts/setup-server.sh
```

That installs Node 20, MySQL, Nginx, Certbot and build tools; creates the `odibrick`
system account; creates `/var/www/odibrick`, `/var/log/odibrick` and the storage
directory; enables UFW for SSH and HTTP/HTTPS; and runs `mysql_secure_installation`.

## 2. Create the database

Give the application a least-privilege user. It does not need `GRANT`, `FILE`,
`PROCESS` or `SUPER`.

```sql
CREATE DATABASE odibrick CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'odibrick'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON odibrick.* TO 'odibrick'@'localhost';
FLUSH PRIVILEGES;
```

`CREATE`/`ALTER`/`DROP` are needed by the migration runner. If you prefer to run
migrations as a separate admin user and drop those grants for the runtime user, the
application itself only needs DML.

## 3. Get the code onto the box

```bash
sudo -u odibrick git clone <your-repo> /var/www/odibrick
cd /var/www/odibrick
```

## 4. Configure

```bash
sudo -u odibrick cp apps/api/.env.example apps/api/.env
sudo -u odibrick cp apps/web/.env.example apps/web/.env
sudo chmod 600 apps/api/.env apps/web/.env
```

Generate every secret freshly. Do not reuse anything from an example file:

```bash
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY   ← losing this loses your KYC ciphertexts
openssl rand -hex 32   # PASSWORD_PEPPER  ← changing this invalidates every password
openssl rand -hex 32   # STORAGE_SIGNING_KEY
```

Key settings in `apps/api/.env`:

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `production` |
| `PORT` | `4000` |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | |
| `ACCESS_TOKEN_TTL` | seconds, default `900` |
| `REFRESH_TOKEN_TTL_DAYS` | default `30` |
| `PASSWORD_PEPPER` | applied on top of argon2id |
| `ENCRYPTION_KEY` | AES-256-GCM key for KYC fields |
| `STORAGE_DRIVER` | `LOCAL` or `S3` |
| `STORAGE_PATH` | `/var/www/odibrick/storage` |
| `STORAGE_SIGNING_KEY` | HMAC key for download links |
| `PAYMENT_PROVIDER` | `manual` until a merchant account exists |
| `PAYMENT_WEBHOOK_SECRET` | required before switching to `gateway` |
| `CORS_ORIGINS` | `https://odibrick.com` |

And `apps/web/.env`:

```
API_INTERNAL_URL=http://127.0.0.1:4000
NEXT_PUBLIC_SITE_URL=https://odibrick.com
```

`NEXT_PUBLIC_*` variables are compiled into the browser bundle. Never put a secret
behind that prefix.

## 5. Build and release

```bash
sudo -u odibrick bash scripts/deploy.sh
```

The script installs dependencies, applies migrations, builds both apps, reloads the
processes and then polls `/api/health` until it answers. It aborts if migrations fail,
so a broken schema never reaches a running process.

## 6. Supervise

**PM2** (simpler):

```bash
sudo npm install -g pm2
sudo -u odibrick pm2 start deploy/ecosystem.config.js --env production
sudo -u odibrick pm2 save
sudo pm2 startup systemd -u odibrick --hp /home/odibrick
```

**systemd** (fewer moving parts, tighter sandboxing):

```bash
sudo cp deploy/odibrick-api.service deploy/odibrick-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now odibrick-api odibrick-web
```

The units set `ProtectSystem=strict` with `ReadWritePaths` limited to the storage and
log directories. If you move the storage path, update the unit.

## 7. Nginx and TLS

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/odibrick
sudo ln -s /etc/nginx/sites-available/odibrick /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d odibrick.com -d www.odibrick.com
```

Certbot installs its own renewal timer. Verify it with
`sudo certbot renew --dry-run`.

The supplied config includes HSTS with preload, a Content-Security-Policy,
`frame-ancestors 'none'`, a 25 MB body limit for inspection photos and KYC scans, and
two rate-limit zones — a strict one on `/api/auth/*` and a looser backstop on the
rest of the API.

## 8. Log rotation and backups

```bash
sudo cp deploy/logrotate.conf /etc/logrotate.d/odibrick
sudo crontab -e
# 0 2 * * * /var/www/odibrick/scripts/backup.sh
```

`backup.sh` takes a `--single-transaction` mysqldump and tars the document vault, then
prunes anything older than 14 days.

**Copy the backups off the box.** A backup sitting on the same disk as the database
is not a backup. Ship them to object storage or another host, and test a restore
before you need one.

---

## Verifying the release

Nothing in this repository has been executed. Work through this list on your first
deploy and treat any failure as expected rather than surprising.

```bash
# Schema
npm run db:status                      # every migration applied

# API
curl -s localhost:4000/api/health      # {"status":"ok","database":"up",...}
curl -s localhost:4000/api/properties  # paginated envelope

# Tests
npm test                               # API unit tests

# Through Nginx
curl -sI https://odibrick.com          # 200, HSTS present
curl -s  https://odibrick.com/api/health
```

Then exercise the whole path by hand, because that is the only way to know it works:
register → verify KYC → list a property → approve it → apply as a tenant → accept →
draft, approve and sign the agreement → record the payment → file the Day-1 condition
report. That sequence touches every module and every state transition.

---

## Rolling back

```bash
cd /var/www/odibrick
sudo -u odibrick git checkout <previous-tag>
sudo -u odibrick bash scripts/deploy.sh
```

Note that **migrations do not roll back**. The runner is forward-only by design —
automatic down-migrations are the most reliable way to lose production data. If a
migration was destructive, restore from the nightly dump. Write migrations additively
(new column, backfill, switch reads, drop later) so this rarely matters.

---

## Scaling, when it is time

The single box holds up well past the point most platforms reach. In order of what to
do first:

1. Raise `instances` in the PM2 config for the API. It is stateless and clusters
   cleanly.
2. Move the document vault to S3 (`STORAGE_DRIVER=S3`). Local disk is the first thing
   to become awkward.
3. Move MySQL to a managed instance with automated backups and a read replica; point
   the heavy admin analytics queries at the replica.
4. Put a CDN in front of `/_next/static/`.
5. Add Redis for sessions and rate-limit state before running more than one box.

## Operational notes

- **Two people, minimum, on the platform side.** The RBAC model separates
  `agreement.draft` from `agreement.approve` for a reason. Do not grant both to one
  account in production.
- **Watch `/api/health`** from an external monitor, not just from the box.
- **The audit log is evidence.** Give `audit.read` sparingly and never grant delete
  rights on `audit_logs` to the application user.
- **Before enabling the payment gateway**, confirm the webhook secret is set and test
  a signature failure — the adapter should reject it, and you want to have seen that
  happen.
