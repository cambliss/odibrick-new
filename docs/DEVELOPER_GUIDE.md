# Developer guide

From an empty machine to a running production server, and everything you are likely
to want to change along the way. No Docker anywhere.

This guide assumes you are comfortable on a Linux command line but have never seen
this codebase before.

**Contents**

1. [Local development setup](#1-local-development-setup)
2. [The first build — clearing compiler errors](#2-the-first-build--clearing-compiler-errors)
3. [Finding your way around](#3-finding-your-way-around)
4. [Modification recipes](#4-modification-recipes)
5. [Testing your changes](#5-testing-your-changes)
6. [Preparing a production build](#6-preparing-a-production-build)
7. [Provisioning the VPS](#7-provisioning-the-vps)
8. [Deploying](#8-deploying)
9. [Nginx and TLS](#9-nginx-and-tls)
10. [Verifying the deployment](#10-verifying-the-deployment)
11. [The ongoing release workflow](#11-the-ongoing-release-workflow)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Local development setup

### 1.1 What you need

| Tool | Version | Check |
| --- | --- | --- |
| Node.js | 20.10+ | `node -v` |
| npm | 10+ | `npm -v` |
| MySQL | 8.0+ | `mysql --version` |
| Git | any | `git --version` |

On macOS:

```bash
brew install node@20 mysql
brew services start mysql
```

On Ubuntu/Debian:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs mysql-server
sudo systemctl start mysql
```

On Windows, use WSL2 with Ubuntu. Do not try to run this natively on Windows — the
deploy scripts and file paths assume a POSIX shell.

### 1.2 Get the code and install

```bash
git clone <your-repo> odibrick
cd odibrick
npm install --workspaces --include-workspace-root
```

This is a npm workspaces monorepo. The install pulls dependencies for `apps/api`,
`apps/web` and `packages/types` in one pass and hoists shared packages to the root
`node_modules`.

If the install fails on `argon2`, you are missing a build toolchain:

```bash
# Ubuntu
sudo apt-get install -y build-essential python3
# macOS
xcode-select --install
```

### 1.3 Create the local database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE odibrick CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'odibrick'@'localhost' IDENTIFIED BY 'devpassword';
GRANT ALL PRIVILEGES ON odibrick.* TO 'odibrick'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

`ALL PRIVILEGES` is fine locally. On the server you will use a narrower grant — see
§7.3.

### 1.4 Configure

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

Edit `apps/api/.env`. For local work you can use throwaway secrets, but generate them
rather than typing `secret123` — you will forget to change them later:

```bash
# Run this four times and paste the results in
openssl rand -hex 32
```

A working local `apps/api/.env`:

```ini
NODE_ENV=development
PORT=4000
API_PREFIX=api

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=odibrick
DB_PASSWORD=devpassword
DB_NAME=odibrick

JWT_ACCESS_SECRET=<32-byte hex>
JWT_REFRESH_SECRET=<32-byte hex>
ACCESS_TOKEN_TTL=900
REFRESH_TOKEN_TTL_DAYS=30
PASSWORD_PEPPER=<32-byte hex>
ENCRYPTION_KEY=<32-byte hex>

STORAGE_DRIVER=LOCAL
STORAGE_PATH=./storage
STORAGE_SIGNING_KEY=<32-byte hex>

PAYMENT_PROVIDER=manual
KYC_PROVIDER=manual
INSURANCE_PROVIDER=manual

CORS_ORIGINS=http://localhost:3000
COOKIE_SECURE=false
```

`COOKIE_SECURE=false` matters locally. With it `true`, the browser refuses to store
the session cookie over plain HTTP and you will spend twenty minutes wondering why
login silently fails.

And `apps/web/.env`:

```ini
API_INTERNAL_URL=http://127.0.0.1:4000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 1.5 Schema and demo data

```bash
npm run db:migrate     # applies the six migrations
npm run db:status      # confirm all six say "applied"
npm run db:seed        # load the demo dataset
```

The seeder prints the login table when it finishes. Every account uses
`OdibrickDemo2026`.

### 1.6 Run it

Two terminals is clearer than the combined `npm run dev`:

```bash
# Terminal 1
npm run dev --workspace=@odibrick/api    # http://localhost:4000/api

# Terminal 2
npm run dev --workspace=@odibrick/web    # http://localhost:3000
```

Check the API is alive before opening the browser:

```bash
curl -s localhost:4000/api/health
# {"status":"ok","database":"up","latencyMs":3,...}
```

If `database` says `down`, your `.env` credentials are wrong or MySQL is not running.

---

## 2. The first build — clearing compiler errors

**Read this section before you do anything else.** This codebase was written without
a compiler in the loop. Nothing has ever been built. Your first `npm run build` will
produce errors, and that is expected rather than a sign something is badly wrong.

### 2.1 Get the full error list

```bash
# API — type-check without emitting
npx tsc --noEmit -p apps/api/tsconfig.json

# Web
npx tsc --noEmit -p apps/web/tsconfig.json
```

Work through them in this order, because fixing the first category usually removes
half of the others.

### 2.2 The categories you will hit, and how to fix them

**Missing or wrong imports.** By far the most common. A service uses `randomToken`
but the import line lists only `sha256`. The fix is mechanical — add the name to the
existing import. Your editor's "add missing import" action handles most of these in
bulk.

**`Object is possibly 'undefined'`.** `strict` is on and the raw SQL helpers return
`T | null`. Where you see this on a `db.one()` result:

```ts
// Before
const row = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM users');
const next = row.c + 1;                    // error

// After
const row = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM users');
const next = (row?.c ?? 0) + 1;
```

Most of the codebase already uses `?.` and `??` for this. The misses are the ones the
compiler will point at.

**`mysql2` result typing.** `conn.execute()` returns a tuple whose first element is a
union type. Where the code destructures `const [res] = await conn.execute(...)` and
then reads `res.insertId`, TypeScript needs a hint:

```ts
import type { ResultSetHeader } from 'mysql2';

const [res] = await conn.execute<ResultSetHeader>('INSERT INTO ...', params);
const id = res.insertId;
```

**`Express.Multer.File` not found.** Add the types package and reference it:

```bash
npm install -D @types/multer --workspace=@odibrick/api
```

**Implicit `any` in `.map()` callbacks over `db.query()` results.** Give the query a
type parameter rather than annotating each callback:

```ts
const rows = await this.db.query<{ id: number; title: string }>('SELECT ...');
```

**Web: `searchParams` typing.** Next.js passes `string | string[] | undefined`. Where
a page treats it as `string`, narrow it:

```ts
const city = typeof searchParams.city === 'string' ? searchParams.city : undefined;
```

**Web: unused imports.** `next lint` flags these. Delete them; do not silence the
rule.

### 2.3 When you can stop

```bash
npm run build
```

Both workspaces compiling clean is the bar. Then run the tests:

```bash
npm test
```

The unit tests are the only executable specification of the security rules —
address privacy, ownership checks, unapproved-draft signing, stale-version approval,
staff self-registration, refresh-token replay. If one of those fails, do not
"fix" it by changing the test. The test is describing a property the system is
supposed to have.

### 2.4 Then exercise it by hand

Compiling is not working. Walk the full path once in the browser before you trust
anything:

1. Register a tenant → submit KYC → sign in as `kyc_team@demo.odibrick.test` → approve it
2. Sign in as an owner → add a property through the ten-step wizard → submit it
3. As `kyc_team` → approve the listing and record verifications
4. As the tenant → find the listing in search → apply
5. As the owner → accept the application (this creates the tenancy and the legal case)
6. As `legal_team@demo.odibrick.test` → draft the agreement → approve it
7. As owner and tenant → sign
8. As `super_admin` → record the deposit payment with a bank reference
9. As the tenant → file the Day-1 condition report
10. As the owner → acknowledge it

That sequence touches every module and every state transition in the system. If it
completes, the platform works.

---

## 3. Finding your way around

### 3.1 Where things live

```
apps/api/src/
├── main.ts                  bootstrap: helmet, cookies, CORS, validation pipe
├── app.module.ts            module registration and global guard order
├── config/configuration.ts  every env var, read once
├── common/
│   ├── auth/                guards and decorators
│   ├── audit/               AuditService.record()
│   ├── database/            the mysql2 pool and query helpers
│   ├── http/                the exception filter
│   └── util/                ULIDs, crypto, pagination
└── modules/<name>/
    ├── <name>.controller.ts HTTP surface only
    ├── <name>.dto.ts        validation
    ├── <name>.service.ts    all business rules
    └── <name>.module.ts     wiring

apps/web/
├── app/                     routes (App Router)
├── components/              shared UI
└── lib/api.ts               the only place that talks to the API
```

### 3.2 The one rule worth internalising

**Business rules live in services, never in controllers and never in the frontend.**

A controller should be a route decorator, a guard decorator, a DTO and a single call
into a service. If you find yourself writing an `if` in a controller, it belongs in
the service.

The frontend may hide a button, but hiding is not enforcing. Every check the UI
implies must also exist server-side. This is why the listing wizard checks
completeness in the browser *and* `PropertiesService.submitForVerification()` checks
it again.

### 3.3 Tracing a request

Take `POST /api/applications/:id/decision`. Follow it:

1. `rental.controller.ts` — the route, `@CurrentUser()`, the DTO
2. `rental.dto.ts` — `DecideApplicationDto` validates `decision` is one of three values
3. `rental.service.ts` → `decide()` — loads the application, checks the caller lists
   the property, and on `ACCEPT` opens a transaction that creates the tenancy, opens
   the legal case and pauses the listing
4. `AuditService.record()` — writes who did what
5. `NotificationsService.send()` — tells the tenant

Read a service top to bottom before changing it. The comments explain *why* a rule
exists, which is the part you cannot recover from the code alone.

---

## 4. Modification recipes

### 4.1 Add a field to an existing table

Say you want `properties.has_balcony_garden`.

**Never edit an applied migration.** The runner checksums each file and will warn you
that the schema and the record no longer agree. Write a new one.

```bash
cat > database/migrations/007_property_garden.sql <<'SQL'
ALTER TABLE properties
  ADD COLUMN has_balcony_garden TINYINT(1) NOT NULL DEFAULT 0 AFTER pets_allowed;
SQL

npm run db:migrate
npm run db:status     # 007 should now say applied
```

Then thread it through:

| Layer | File | Change |
| --- | --- | --- |
| DTO | `properties.dto.ts` | `@IsOptional() @IsBoolean() hasBalconyGarden?: boolean;` |
| Service | `properties.service.ts` | Add to the insert/update column map |
| Response | `properties.service.ts` | Add to the detail `SELECT` |
| Web type | `app/india/[...slug]/page.tsx` | Add to the `PropertyDetail` type |
| Web UI | same file | Render it in the details `<dl>` |
| Wizard | `listing-wizard.tsx` | Add a checkbox on the amenities step |

Migrations are forward-only by design. Write them additively — add a column, backfill,
switch reads, drop the old column in a much later migration — so you never need a
down-migration in production.

### 4.2 Add a new endpoint

Adding `GET /api/properties/:id/similar`.

**Service first.** In `properties.service.ts`:

```ts
/** Same locality, same bedroom count, within 25% on rent. */
async similar(propertyId: number, limit = 6) {
  const property = await this.db.one<any>(
    'SELECT city, locality, bedrooms, rent_amount FROM properties WHERE id = ?',
    [propertyId],
  );
  if (!property) throw new NotFoundException('Property not found.');

  return this.db.query(
    `SELECT id, public_id, slug, title, locality, city, rent_amount, bedrooms
       FROM properties
      WHERE status = 'ACTIVE' AND deleted_at IS NULL
        AND id <> ? AND city = ? AND locality = ? AND bedrooms = ?
        AND rent_amount BETWEEN ? AND ?
      ORDER BY quality_score DESC
      LIMIT ?`,
    [
      propertyId, property.city, property.locality, property.bedrooms,
      property.rent_amount * 0.75, property.rent_amount * 1.25, limit,
    ],
  );
}
```

**Then the controller.** Route order matters in Nest — a literal segment must be
declared before a parameter that would also match it. `@Get('sitemap')` sits above
`@Get(':identifier')` for exactly this reason.

```ts
@Public()
@Get(':id/similar')
similar(@Param('id', ParseIntPipe) id: number) {
  return this.properties.similar(id);
}
```

**Then consume it.** In a Server Component:

```ts
const similar = await serverApiOrNull<Listing[]>(`/properties/${property.id}/similar`);
```

**Then document it** in `docs/API.md`. An endpoint nobody knows about is an endpoint
that gets reimplemented badly six months later.

### 4.3 Add a permission

Suppose support staff should see analytics.

```bash
cat > database/migrations/008_support_analytics.sql <<'SQL'
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('analytics.read')
WHERE r.code = 'SUPPORT_TEAM';
SQL

npm run db:migrate
```

For a genuinely new permission, insert into `permissions` first, then grant it, then
add the `@RequirePermissions('your.permission')` decorator that consumes it. **A
permission nothing checks is worse than no permission**, because it reads like a
control while enforcing nothing.

Update the matrix in `docs/RBAC.md` in the same commit.

### 4.4 Add a page

Server Component by default:

```tsx
// apps/web/app/dashboard/reports/page.tsx
import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui';

export const metadata: Metadata = { title: 'Reports', robots: { index: false } };
export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const data = await serverApi<{ rows: unknown[] }>('/admin/reports');
  return (
    <Card>
      <CardHeader title="Reports" />
      <div className="p-5">{/* ... */}</div>
    </Card>
  );
}
```

Add `'use client'` only when you need `useState` or an event handler. Keep the client
boundary as small as you can — a form is a client component; the page that contains
it usually is not.

Then add it to `SECTIONS` in `app/dashboard/dashboard-nav.tsx`, with a `requires`
permission or a `roles` list so it only appears for people who can use it.

### 4.5 Change the commission model

The rules are data, not code. Edit them through the admin UI, or with a migration:

```sql
INSERT INTO commission_rules
  (code, name, applies_to, basis, percent_value, payer, tax_rate, effective_from, is_active)
VALUES
  ('STD_ANNUAL_V2', 'Standard annual 2027', 'STANDARD',
   'PERCENT_OF_MONTHLY_RENT', 60.00, 'OWNER', 18.00, '2027-01-01', 1);

UPDATE commission_rules SET effective_to = '2026-12-31' WHERE code = 'STD_ANNUAL';
```

`PaymentsService.scheduleAnnualCommission()` picks the rule whose date range covers
today and whose city matches (city-specific rules win over the null-city default).
Existing tenancies keep the commission row generated when they started — changing a
rule does not retroactively reprice anyone, which is the correct behaviour.

### 4.6 Wire up a real payment gateway

1. Get a merchant account with a licensed aggregator.
2. Implement `createOrder()` and `refund()` in
   `apps/api/src/modules/payments/providers/gateway.provider.ts`. The signature
   verification in `verifyCallback()` is already real — do not weaken it.
3. Set in `.env`:
   ```ini
   PAYMENT_PROVIDER=gateway
   PAYMENT_WEBHOOK_SECRET=<from the provider dashboard>
   ```
4. Point the provider's webhook at `https://yourdomain.com/api/payments/callback`.
5. **Test a signature failure first.** Send a webhook with a bad signature and confirm
   it is rejected and logged. You want to have watched that work before real money
   moves through it.

The provider is selected by a factory in `payments.module.ts`. Nothing else in the
codebase knows which one is active.

### 4.7 Change the visual design

Tokens live in `apps/web/tailwind.config.ts`. Change them there, not in individual
components.

One constraint is worth preserving: **ochre (`#B8862B`) is used only for verification
seals.** If it appears anywhere else, it stops meaning "this was actually checked" and
becomes decoration. The whole trust model leans on that distinction.

Shared components are in `components/ui/index.tsx`. Add a variant there rather than
writing one-off class strings in pages.

### 4.8 Add a notification type

```sql
INSERT INTO notification_templates (code, channel, subject, body_template)
VALUES ('RENEWAL_REMINDER', 'IN_APP', 'Your tenancy renews soon',
        'The tenancy at {{property}} renews on {{date}}.');
```

Then call it:

```ts
await this.notify.send(userId, 'RENEWAL_REMINDER', {
  title: 'Your tenancy renews soon',
  body: `The tenancy at ${property.title} renews on ${date}.`,
  actionUrl: `/dashboard/tenancy/${tenancy.id}`,
  severity: 'ACTION',
});
```

In-app notifications are delivered for real. Email and SMS are recorded as `SKIPPED`
until you write those adapters — the system will not claim it sent something it
did not.

---

## 5. Testing your changes

```bash
npm test                                    # all API tests
npm test -- properties.service.spec         # one file
npm test -- --coverage                      # coverage report
```

Tests live beside the code as `*.spec.ts`. The pattern mocks `DatabaseService` so
nothing touches MySQL:

```ts
const db = {
  one: jest.fn(),
  query: jest.fn().mockResolvedValue([]),
  insert: jest.fn().mockResolvedValue(1),
  update: jest.fn().mockResolvedValue(1),
  execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 }),
  transaction: jest.fn(async (fn: any) => fn({ execute: jest.fn() })),
};
```

**Write a test for anything that enforces a rule.** Not for getters, not for mapping
functions — for the places where the answer to "can this person do this?" is decided.
Those are the tests that will still be earning their keep in two years.

Before every commit:

```bash
npm run lint
npm run build
npm test
```

---

## 6. Preparing a production build

### 6.1 Build locally first

Never let the server be the first machine that tries to compile your code. A failed
build on the VPS means downtime while you debug it.

```bash
npm run build
```

This produces `apps/api/dist/` and `apps/web/.next/`. Both are gitignored — the
server builds its own copies from source.

### 6.2 Pre-flight checklist

- [ ] `npm run build` succeeds on both workspaces
- [ ] `npm test` passes
- [ ] `npm run lint` is clean
- [ ] `npm audit` reviewed — fix anything high or critical
- [ ] New migrations tested against a *copy* of production data, not just an empty database
- [ ] No secrets committed — `git log -p` your `.env` files if you are unsure
- [ ] `docs/` updated for any API or schema change
- [ ] Tagged: `git tag -a v1.0.1 -m "..." && git push --tags`

The tag matters. It is what you check out when you need to roll back at 2am.

---

## 7. Provisioning the VPS

Target: Ubuntu 22.04 or 24.04. Minimum 2 vCPU / 4 GB RAM / 40 GB SSD. Below 4 GB the
Next.js build will be killed by the OOM reaper — add swap if you are on a small box.

### 7.1 First contact

```bash
ssh root@<server-ip>

adduser deploy
usermod -aG sudo deploy

# Copy your key over, then log back in as deploy
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy/
```

Harden SSH — `/etc/ssh/sshd_config`:

```
PermitRootLogin no
PasswordAuthentication no
```

```bash
sudo systemctl restart sshd
```

Open a second terminal and confirm you can still get in **before** closing the first
one. Locking yourself out of a fresh VPS is a rite of passage worth skipping.

### 7.2 Run the setup script

```bash
sudo bash scripts/setup-server.sh
```

It installs Node 20, MySQL, Nginx, Certbot and build tools; creates the `odibrick`
system account; creates `/var/www/odibrick`, `/var/log/odibrick` and the storage
directory; enables UFW for SSH and HTTP/HTTPS; and runs
`mysql_secure_installation`.

If you prefer to do it by hand, the script is short and readable — every step is a
plain `apt-get` or `mkdir`.

### 7.3 Database

```bash
sudo mysql
```

```sql
CREATE DATABASE odibrick CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'odibrick'@'localhost' IDENTIFIED BY '<strong-password>';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, DROP, REFERENCES
  ON odibrick.* TO 'odibrick'@'localhost';
FLUSH PRIVILEGES;
```

Note what is *absent*: no `GRANT`, no `FILE`, no `PROCESS`, no `SUPER`. The
application never needs them, so a compromised application account cannot use them.

Confirm MySQL is not listening publicly:

```bash
sudo ss -tlnp | grep 3306      # should show 127.0.0.1:3306, never 0.0.0.0:3306
```

If it shows `0.0.0.0`, set `bind-address = 127.0.0.1` in
`/etc/mysql/mysql.conf.d/mysqld.cnf` and restart.

Add a little tuning for a 4 GB box — `/etc/mysql/mysql.conf.d/odibrick.cnf`:

```ini
[mysqld]
innodb_buffer_pool_size = 1G
max_connections = 100
```

### 7.4 Code onto the box

```bash
sudo -u odibrick git clone <your-repo> /var/www/odibrick
cd /var/www/odibrick
sudo -u odibrick git checkout v1.0.0
```

If the repository is private, generate a deploy key for the `odibrick` user and add
it to your Git host as read-only.

### 7.5 Production environment files

```bash
sudo -u odibrick cp apps/api/.env.example apps/api/.env
sudo -u odibrick cp apps/web/.env.example apps/web/.env
sudo chmod 600 apps/api/.env apps/web/.env
```

Generate every secret fresh. Do not carry anything over from local:

```bash
for i in 1 2 3 4 5; do openssl rand -hex 32; done
```

`apps/api/.env`:

```ini
NODE_ENV=production
PORT=4000
API_PREFIX=api

DB_HOST=127.0.0.1
DB_USER=odibrick
DB_PASSWORD=<strong-password>
DB_NAME=odibrick

JWT_ACCESS_SECRET=<hex 1>
JWT_REFRESH_SECRET=<hex 2>
PASSWORD_PEPPER=<hex 3>
ENCRYPTION_KEY=<hex 4>
STORAGE_SIGNING_KEY=<hex 5>

STORAGE_DRIVER=LOCAL
STORAGE_PATH=/var/www/odibrick/storage

PAYMENT_PROVIDER=manual
CORS_ORIGINS=https://yourdomain.com
COOKIE_SECURE=true
```

`apps/web/.env`:

```ini
API_INTERNAL_URL=http://127.0.0.1:4000
NEXT_PUBLIC_SITE_URL=https://yourdomain.com
```

Two things that will bite you if you get them wrong:

- **`ENCRYPTION_KEY` is unrecoverable.** Lose it and every stored KYC identifier
  becomes permanently unreadable. Back it up somewhere that is not this server.
- **`PASSWORD_PEPPER` cannot be rotated casually.** Changing it invalidates every
  existing password, and every user will have to reset.
- **Never prefix a secret with `NEXT_PUBLIC_`.** That prefix compiles the value into
  the browser bundle.

---

## 8. Deploying

```bash
sudo -u odibrick bash scripts/deploy.sh
```

The script installs dependencies, applies migrations, builds both apps, reloads the
processes and polls `/api/health` until it answers. It aborts if migrations fail, so
a broken schema never reaches a running process.

If you would rather drive it manually:

```bash
cd /var/www/odibrick
sudo -u odibrick npm ci --workspaces --include-workspace-root
sudo -u odibrick node database/migrate.js
sudo -u odibrick npm run build --workspace=@odibrick/api
sudo -u odibrick npm run build --workspace=@odibrick/web
```

Watch the Next.js build for OOM kills. If it dies silently, add swap:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 8.1 Supervise the processes

**PM2** — simpler, better logs:

```bash
sudo npm install -g pm2
sudo -u odibrick pm2 start deploy/ecosystem.config.js --env production
sudo -u odibrick pm2 save
sudo pm2 startup systemd -u odibrick --hp /home/odibrick
```

Day to day:

```bash
sudo -u odibrick pm2 status
sudo -u odibrick pm2 logs odibrick-api --lines 100
sudo -u odibrick pm2 reload odibrick-api      # zero-downtime
sudo -u odibrick pm2 monit
```

**systemd** — fewer moving parts, tighter sandboxing:

```bash
sudo cp deploy/odibrick-api.service deploy/odibrick-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now odibrick-api odibrick-web
sudo systemctl status odibrick-api
sudo journalctl -u odibrick-api -f
```

The units set `ProtectSystem=strict` with `ReadWritePaths` limited to the storage and
log directories. If you move `STORAGE_PATH`, update the unit or the API will fail to
write uploads.

Pick one supervisor. Running both means two copies fighting over port 4000.

### 8.2 Confirm before moving on

```bash
curl -s localhost:4000/api/health
curl -s localhost:3000 | head -20
```

Both must answer before Nginx is worth configuring.

---

## 9. Nginx and TLS

### 9.1 DNS first

Point an `A` record for `yourdomain.com` and `www.yourdomain.com` at the server IP.
Wait for it to resolve — Certbot validates over HTTP and will fail otherwise:

```bash
dig +short yourdomain.com
```

### 9.2 Install the site

Edit `deploy/nginx.conf` and replace `odibrick.com` with your domain throughout, then:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/odibrick
sudo ln -s /etc/nginx/sites-available/odibrick /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo mkdir -p /var/www/certbot
sudo nginx -t
```

`nginx -t` will complain that the certificate files are missing — expected, since
Certbot has not run yet. Comment out the two `ssl_certificate` lines and the `443`
blocks temporarily, reload, then get the certificate:

```bash
sudo systemctl reload nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

Certbot writes the certificate paths back in. Restore the full config, test and
reload:

```bash
sudo nginx -t && sudo systemctl reload nginx
sudo certbot renew --dry-run
```

Certbot installs its own renewal timer. The dry run confirms it will work in 60 days
when you are not thinking about it.

### 9.3 What the config gives you

- HTTP → HTTPS redirect, and `www` → apex
- TLS 1.2/1.3 only, with OCSP stapling
- HSTS with preload, `X-Frame-Options: DENY`, `nosniff`, a `Permissions-Policy`, and a
  CSP with `frame-ancestors 'none'`
- `/api/auth/*` limited to 5 requests/minute per IP; the rest of the API to 30/second
- 25 MB body limit for inspection photos and KYC scans
- Immutable caching on `/_next/static/`
- `/api/health` kept out of the access log

### 9.4 Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

Ports 3000, 4000 and 3306 must **not** appear. They are loopback-only by design.

---

## 10. Verifying the deployment

```bash
# Certificate and headers
curl -sI https://yourdomain.com | grep -i strict-transport
curl -s  https://yourdomain.com/api/health

# The API is reachable through Nginx
curl -s https://yourdomain.com/api/properties | head -c 200

# Nothing is exposed that should not be
curl -s --max-time 3 http://<server-ip>:4000/api/health   # must fail
curl -s --max-time 3 http://<server-ip>:3000              # must fail
```

Then check your TLS grade at `ssllabs.com/ssltest` — the supplied config should score
an A.

Finally, walk the full tenancy flow in the browser (§2.4) against production, using
the demo seed on a staging domain first if you can. Then:

```bash
npm run db:seed:purge      # remove demo data before real users arrive
```

### Post-launch tasks

- [ ] Log rotation: `sudo cp deploy/logrotate.conf /etc/logrotate.d/odibrick`
- [ ] Nightly backup in cron: `0 2 * * * /var/www/odibrick/scripts/backup.sh`
- [ ] **Copy backups off the box.** One on the same disk is not a backup.
- [ ] External uptime monitor on `https://yourdomain.com/api/health`
- [ ] Test a restore into a scratch database before you need one
- [ ] Change every seeded staff password
- [ ] Grant `agreement.draft` and `agreement.approve` to *different* people

---

## 11. The ongoing release workflow

```bash
# Local
git checkout -b feature/thing
# ... work ...
npm run lint && npm run build && npm test
git commit -am "Add thing"
git push -u origin feature/thing
# ... review, merge to main ...
git tag -a v1.0.1 -m "Add thing" && git push --tags
```

```bash
# Server
ssh deploy@yourdomain.com
cd /var/www/odibrick
sudo -u odibrick git fetch --tags
sudo -u odibrick git checkout v1.0.1
sudo -u odibrick bash scripts/deploy.sh
```

Take a database snapshot before any release that carries a migration:

```bash
sudo -u odibrick bash scripts/backup.sh
```

### Rolling back

```bash
sudo -u odibrick git checkout v1.0.0
sudo -u odibrick bash scripts/deploy.sh
```

**Migrations do not roll back.** The runner is forward-only, because automatic
down-migrations are among the most reliable ways to lose production data. If a
migration was destructive, restore from the dump. Write migrations additively and this
almost never comes up.

---

## 12. Troubleshooting

**API will not start.**

```bash
sudo -u odibrick pm2 logs odibrick-api --lines 50
# or: sudo journalctl -u odibrick-api -n 50
```

Usually a missing env var (the config module names it), a MySQL connection failure, or
port 4000 already held by an old process — `sudo lsof -i :4000`.

**502 from Nginx.** The upstream is down. Check the process first, then that it is
listening on the port Nginx expects:

```bash
sudo -u odibrick pm2 status
sudo ss -tlnp | grep -E '3000|4000'
sudo tail -50 /var/log/nginx/odibrick.error.log
```

**Login appears to succeed but the session does not stick.** Almost always
`COOKIE_SECURE=true` while browsing over plain HTTP, or a mismatch between
`CORS_ORIGINS` and the domain you are actually on. Check the `Set-Cookie` header in
your browser's network tab.

**Migrations fail mid-run.** MySQL DDL is not transactional, so a failure can leave
you partway. Read the error, fix the SQL, and check the actual table state with
`SHOW CREATE TABLE`. On production, restore from the pre-release snapshot rather than
improvising.

**Uploads fail.** Three usual causes: the storage directory is not writable by the
`odibrick` user; the file exceeds Nginx's `client_max_body_size`; or the systemd unit's
`ReadWritePaths` does not include your `STORAGE_PATH`.

```bash
sudo -u odibrick touch /var/www/odibrick/storage/.probe && echo writable
```

**Next.js build is killed.** Out of memory. Add swap (§8) or build on a bigger box and
rsync `.next/` across.

**Slow property search.** Confirm the index is being used:

```sql
EXPLAIN SELECT ... FROM properties WHERE city = 'Hyderabad' AND status = 'ACTIVE';
```

If `type` shows `ALL`, the composite index is not being hit — usually because a
`WHERE` clause wraps a column in a function, which makes the index unusable.

**High memory over time.** Check `pm2 monit`. `max_memory_restart` in the ecosystem
file is a safety net, not a fix — if it is firing regularly, profile it.

---

## Getting help

Every error response carries a `traceId`. Grep the logs for it:

```bash
sudo grep -r "<traceId>" /var/log/odibrick/
```

That maps a user's complaint directly to the server-side log entry, which is faster
than any amount of guessing.
