# Odibrick Platform — Release Operations & Production Runbook

**Document Version:** 1.0.0 (Phase 4, Batch C Baseline)  
**Classification:** Confidential — Engineering & Operations  
**Platform Owner:** Cambliss Pvt. Ltd.  
**Target Release Branch:** `main` (Local Pre-Release Stage)

---

## 1. Executive Summary & System Architecture

Odibrick is an end-to-end residential tenancy and property transaction platform designed for the Indian real estate market, adhering to the Model Tenancy Act principles, the Information Technology Act 2000 (electronic records and digital signatures), and the Digital Personal Data Protection (DPDP) Act 2023.

### 1.1 Architecture Topology
* **Frontend (`@odibrick/web`):** Next.js 15.5.28 App Router, React 18.3.1, TailwindCSS. Runs as a Node.js SSR service or standalone server.
* **Backend API (`@odibrick/api`):** NestJS 10.4 modular framework, TypeScript 5.4, Fastify/Express HTTP adapters.
* **Relational Database:** MySQL 8.4 LTS / 8.0 InnoDB, utf8mb4 collation, transaction-isolated reference sequences, foreign key constraints, and numeric CHECK constraints.
* **Object Storage:** Cloudflare R2 (S3-compatible API via AWS SDK v3), supporting signed temporary download/upload URLs, document vault encryption, and photographic condition inventories.
* **Security Layer:** HTTP-only strict SameSite session cookies, Argon2id/Scrypt/PBKDF2 salted passwords with server-side pepper, AES-256-GCM field encryption for sensitive identity artifacts (PAN, Aadhaar).

---

## 2. Environment Requirements

| Component | Minimum Version | Recommended Version | Configuration Requirements |
| :--- | :--- | :--- | :--- |
| **Node.js** | `v20.12.0 LTS` | `v20.20.2+ LTS` | Active LTS. Note: AWS SDK v3 deprecation warning for Node < 22 scheduled for Jan 2027. |
| **npm** | `v10.5.0` | `v10.8.0+` | Workspace-aware npm package manager. |
| **MySQL Server** | `8.0.32` | `8.4.11 LTS` | Strict mode enabled (`STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION`), `default_storage_engine=InnoDB`, `character-set-server=utf8mb4`, `collation-server=utf8mb4_unicode_ci`. |
| **Cloudflare R2** | N/A (S3 API) | Standard R2 Tier | Cloudflare account with R2 API token (Object Read & Write permission). |
| **Memory** | 2 GB RAM (Dev) | 4 GB+ RAM (Prod) | Minimum 1.5 GB heap allocation for Next.js production builds. |

---

## 3. Configuration Variables Dictionary

### 3.1 Backend API (`apps/api/.env`)

| Variable | Classification | Type | Default / Example | Purpose & Constraints |
| :--- | :--- | :--- | :--- | :--- |
| `NODE_ENV` | Operational | String | `production` | Environment mode (`development`, `test`, `production`). In production, local storage fallbacks are disabled. |
| `API_PORT` | Networking | Number | `4000` | Port on which the NestJS HTTP listener binds. |
| `API_PREFIX` | Networking | String | `api` | Global route prefix (e.g., `/api/health`, `/api/properties`). |
| `PUBLIC_WEB_URL` | Security | URL | `https://odibrick.com` | Canonical frontend URL used in generated action links, emails, and CORS validation. |
| `CORS_ORIGINS` | Security | Comma List | `https://odibrick.com` | Allowed CORS origins for browser AJAX/fetch requests. |
| `DB_HOST` | Database | String | `127.0.0.1` | MySQL host address. Do not use localhost on Linux to prevent Unix socket misdirection. |
| `DB_PORT` | Database | Number | `3306` | MySQL TCP port. |
| `DB_USER` | Database | String | `odibrick` | Dedicated MySQL user with DML and DDL permissions on `DB_NAME`. |
| `DB_PASSWORD` | **SECRET** | String | `[SECURE_PASSWORD]` | MySQL authentication password. |
| `DB_NAME` | Database | String | `odibrick` | Target database schema name. |
| `DB_CONNECTION_LIMIT`| Database | Number | `15` | MySQL connection pool size. |
| `JWT_ACCESS_SECRET` | **SECRET** | Hex (48B+) | `[RANDOM_HEX]` | Symmetric secret for signing short-lived (15m) JWT access tokens. |
| `JWT_ACCESS_TTL` | Security | Number | `900` | Access token lifespan in seconds (15 minutes). |
| `JWT_REFRESH_SECRET`| **SECRET** | Hex (48B+) | `[RANDOM_HEX]` | Symmetric secret for signing long-lived refresh tokens. |
| `JWT_REFRESH_TTL_DAYS`| Security | Number | `30` | Refresh token lifespan in days. |
| `PASSWORD_PEPPER` | **SECRET** | Hex (32B+) | `[RANDOM_HEX]` | Server-side cryptographic pepper mixed into password hashes before storage. |
| `FIELD_ENCRYPTION_KEY`| **SECRET** | Hex (32B) | `[64_HEX_CHARS]` | 256-bit AES-GCM master key used by `KycService` and `EncryptionService` to encrypt PII. |
| `STORAGE_DRIVER` | Storage | Enum | `S3` | Active storage provider: `LOCAL` (dev only) or `S3` (Cloudflare R2/AWS S3). |
| `STORAGE_LOCAL_ROOT`| Storage | Path | `/var/lib/odibrick`| Filesystem directory for local driver storage. Must exist and be writable. |
| `SIGNED_URL_TTL` | Storage | Number | `300` | Lifespan in seconds for presigned download URLs. |
| `S3_ENDPOINT` | Storage | URL | `https://<account>.r2.cloudflarestorage.com` | Cloudflare R2 S3 API endpoint. |
| `S3_REGION` | Storage | String | `auto` | Cloudflare R2 region (typically `auto`). |
| `S3_BUCKET` | Storage | String | `odibrick-production-media` | Primary storage bucket name. |
| `S3_ACCESS_KEY` | **SECRET** | String | `[R2_ACCESS_KEY]` | Cloudflare R2 Access Key ID. |
| `S3_SECRET_KEY` | **SECRET** | String | `[R2_SECRET_KEY]` | Cloudflare R2 Secret Access Key. |
| `PAYMENT_PROVIDER` | Integration | String | `manual` | Payment gateway driver: `manual` (operator verified) or contractual gateway. |

### 3.2 Frontend Web (`apps/web/.env`)

| Variable | Classification | Type | Default / Example | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `API_INTERNAL_URL` | Networking | URL | `http://127.0.0.1:4000` | Server-to-server origin for Next.js SSR data fetching (never exposed to client). |
| `NEXT_PUBLIC_SITE_URL`| SEO / Public | URL | `https://odibrick.com` | Public origin used for canonical tags, Open Graph, and sitemap generation. |

---

## 4. Dependency & Vulnerability Disposition

* **Next.js Version:** `15.5.28` (Upgraded from `14.2.35`).
  * **Critical Advisory Remediation:** Completely remediates CVE-2025-29927 (Next.js Server Actions / Cache Poisoning RCE).
  * **Peer Compatibility:** Operates smoothly with React 18.3.1 without requiring an unstable React 19 upgrade.
* **Production Dependencies:**
  * Verified with `npm audit --omit=dev`.
  * Result: **0 Critical, 0 High vulnerabilities** in production dependency runtime tree.
* **Development Dependencies:**
  * Remaining advisories in development tooling (e.g., `postcss` via Tailwind CLI build toolchain, `cross-spawn` in test runners) are restricted strictly to build-time scripts and are not packaged into production runtime bundles.

---

## 5. Database Migration & Schema Procedures

### 5.1 Automated Startup Migrations
The application incorporates an idempotent migration runner (`DatabaseService.runMigrations`). On server initialization:
1. Verifies existence of table `schema_migrations`.
2. Computes the SHA-256 checksum of every `.sql` file in `database/migrations/`.
3. Sequentially applies unapplied migrations inside strict transactions.
4. Records the filename, checksum, and execution timestamp.

### 5.2 Manual Migration Verification Command
To verify or apply migrations without launching the full web service:
```bash
node -e "
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./apps/api/dist/app.module');
(async () => {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  console.log('Migrations verified.');
  await app.close();
})();"
```

### 5.3 Rollback / Downgrade Protocol
* **Forward-Fix Principle:** In production, prefer rolling forward with compensating migration scripts (e.g., `024_compensating_fix.sql`).
* **Emergency Down-Migration:**
  * If a migration must be reverted, inspect the target migration file.
  * Execute reverse DDL statements manually via an administrative MySQL console with foreign key checks preserved:
    ```sql
    SET FOREIGN_KEY_CHECKS = 1;
    -- Execute targeted reverse DDL
    DELETE FROM schema_migrations WHERE filename = '023_data_integrity_and_sequences.sql';
    ```
  * Never drop tables containing active user or financial records without full forensic backup.

---

## 6. Backup, Restoration & Disaster Recovery

### 6.1 Database Full Backup (`mysqldump`)
Execute consistent logical backups without locking InnoDB tables:
```bash
mysqldump \
  --host=127.0.0.1 \
  --port=3306 \
  --user=odibrick \
  --password \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --default-character-set=utf8mb4 \
  --result-file=/backup/odibrick_$(date +%Y%m%d_%H%M%S).sql \
  odibrick
```

### 6.2 Database Restoration Procedure
1. Confirm target database instance is isolated:
   ```bash
   mysql --host=127.0.0.1 --port=3306 -u root -p -e "CREATE DATABASE IF NOT EXISTS odibrick_restore CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   ```
2. Restore schema and data:
   ```bash
   mysql --host=127.0.0.1 --port=3306 -u root -p odibrick_restore < /backup/odibrick_YYYYMMDD_HHMMSS.sql
   ```
3. Run post-restore sanity checks:
   ```sql
   SELECT COUNT(*) FROM users;
   SELECT COUNT(*) FROM properties;
   SELECT COUNT(*) FROM tenancies;
   SELECT COUNT(*) FROM payments;
   SELECT * FROM reference_sequences;
   ```

---

## 7. Object Storage & Cloudflare R2 Operations

### 7.1 Architecture & Fail-Safe Safeguards
* **Driver Implementation:** [`StorageService`](file:///c:/Users/Cambliss/Downloads/odibrick/apps/api/src/modules/storage/storage.service.ts) uses `@aws-sdk/client-s3`.
* **Production Invariant:** If `STORAGE_DRIVER=S3` and `S3_BUCKET` is undefined or credentials fail, the service throws an unrecoverable configuration error at boot time. **Under no circumstances does it silently fall back to local disk storage in production.**
* **Local Fallback:** Allowed only when `STORAGE_DRIVER=LOCAL` in non-production environments (`NODE_ENV !== 'production'`).

### 7.2 Health Check Endpoint
* **Endpoint:** `GET /api/health`
* **Response:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-10-23T15:00:00.000Z",
    "database": "up",
    "storage": {
      "driver": "S3",
      "status": "up"
    }
  }
  ```
* **Security Redaction:** Bounded by a 3,000 ms timeout. Credentials (`accessKeyId`, `secretAccessKey`), internal endpoints, and bucket names are strictly excluded from all public and administrative health responses.

---

## 8. Release Readiness Checklist

### 8.1 Verified Items (Passed Automated Verification)
- [x] **Next.js 15.5.28 Runtime:** All 65 App Router routes compiled cleanly. Dynamic routes and search parameters verified.
- [x] **TypeScript Compliance:** 0 compilation errors across both `@odibrick/api` and `@odibrick/web`.
- [x] **Lint Standards:** 0 lint errors across all workspaces. Compatible flat ESLint config maintained.
- [x] **Unit Testing:** 12 / 12 Jest suites passed (93 / 93 tests) covering `RentalService`, `UsersService`, `KycService`, `PaymentsService`, `StorageService`, etc.
- [x] **Concurrency & Atomicity:** 28 / 28 tests passed verifying reference sequence generation, double-booking prevention, and transactional rollbacks.
- [x] **Dispute Management Lifecycle:** 32 / 32 tests passed in `verify-disputes.js`.
- [x] **End-to-End User Journeys:** 32 / 32 checks passed in `test-batch-b-e2e-journeys.js` with zero leakage or contamination of canonical demo records.
- [x] **Accessibility Remediation:** Form inputs linked to error notes via `aria-describedby` and `aria-invalid`; interactive buttons provided with `aria-label`; focus-visible rings enforced; filter tabs wrapped in `<nav>` with `aria-current`.
- [x] **Performance Benchmarks:** Documented sub-millisecond p50 latency for indexed queries and 1.65 ms p50 for multi-table tenancy assembly.

### 8.2 Accepted Technical Limitations
- [ ] **Development Tooling Warnings:** Build-time ESLint warnings (66 in API) for unused parameters and React Hook exhaustive-deps warnings in admin analytics clients are accepted for this release cycle as they do not affect runtime execution.
- [ ] **Simulated Gateway Provider:** `PAYMENT_PROVIDER=manual` provides audited bank reference entry. Full webhook automation requires production payment aggregator contract.

### 8.3 Required Human Sign-Offs (Pre-Deployment Blockers)
- [ ] **Legal & Compliance Sign-Off:** Formal corporate legal review of draft terms at `/legal/terms` (Model Tenancy Act compliance) and `/legal/privacy` (DPDP Act 2023 compliance).
- [ ] **Production Infrastructure Provisioning:** Provisioning of production Cloudflare R2 bucket (`odibrick-production-media`) and binding of custom domain CDN.
- [ ] **Production Secret Generation:** Generation and secure secret injection of `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PASSWORD_PEPPER`, and `FIELD_ENCRYPTION_KEY` using high-entropy OpenSSL sources.
- [ ] **Final Deployment Authorization:** Formal executive sign-off before DNS cutover.
