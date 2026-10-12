# ODIBRICK — PRODUCTION DATABASE MIGRATION ROLLBACK PLAN & DISASTER RECOVERY SPECIFICATION

**Document Version:** 2.0 (Post-Staging Validation Updated)  
**Effective Date:** October 9, 2026  
**Status:** ACTIVE & MANDATORY  
**Target Systems:** Aiven Cloud MySQL, Render Backend (`@odibrick/api`), Vercel Frontend (`@odibrick/web`)

---

## 1. Objective & Scope

This document establishes the authoritative, step-by-step recovery procedures in the event of any data corruption, schema discrepancy, partial import, authentication lockout, media delivery disruption, or application startup failure during the migration of the canonical demo dataset from Local MySQL (`127.0.0.1:3307`) to Aiven MySQL (Production).

---

## 2. Backup Inventory & Recovery Artifacts

### 2.1 Verified Source Snapshot (Local Canonical Dataset)
- **Artifact Name:** `odibrick_local_source_20261009_060949.sql`
- **Location:** `backups/odibrick_local_source_20261009_060949.sql`
- **File Size:** `3,065,896 bytes` (`2.92 MB`)
- **SHA-256 Checksum:** `2dc1e361df8b8e231d5edb26552cf49b96c9548eb4d9b622656bb294db5a359d`
- **Verification Status:** **PASSED & VALIDATED** in isolated staging database (`odibrick_staging`):
  - 100/100 base InnoDB tables
  - 12,718 / 12,718 records matched exactly
  - 47 / 47 canonical users authenticated with Argon2id + `PASSWORD_PEPPER`
  - 0 orphan foreign key records across all tables

### 2.2 Target Pre-Migration Snapshot (Aiven Production Baseline)
- **Aiven Native Protection:** Aiven Cloud Continuous PITR (Point-In-Time-Recovery) + Fork Service capability active.
- **Pre-Migration Rollback Point:** Recorded baseline timestamp prior to any production modification.

---

## 3. Rollback Decision Triggers & Exit Criteria

Immediate rollback to the pre-migration state is **MANDATORY** if any of the following conditions occur:

| Failure Mode | Trigger Condition | Max TTR (Time to Restore) |
| :--- | :--- | :---: |
| **Partial / Failed Import** | MySQL import process exits non-zero, loses connection, or tables count < 100 | < 2 minutes |
| **Schema Inconsistency** | `schema_migrations` checksum mismatch or missing constraints | < 2 minutes |
| **Authentication Lockout** | Canonical admin/tenant demo logins return HTTP 401/500 on Render | < 2 minutes |
| **Foreign Key / Orphan Errors**| Broken relational links detected across properties, tenancies, or payments | < 2 minutes |
| **Application Crash** | Backend on Render fails startup health check (`GET /api/health` -> degraded/down) | < 2 minutes |
| **Critical Smoke Test Failure**| Admin Marketplace, Customer Dashboard, or Legal Workspace throw HTTP 500 | < 3 minutes |

---

## 4. Step-by-Step Rollback Procedures

### Scenario A: Rollback via Pre-Migration Logical Dump
If the migration fails during Phase 6 import or early smoke tests:

1. **Pause Application Traffic:**
   - Put backend in maintenance mode or set Render concurrency to 0 to prevent incoming writes.
2. **Execute Full Restoration of Pre-Migration Backup:**
   ```powershell
   & "C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe" `
     --host="<AIVEN_HOST>" `
     --port="<AIVEN_PORT>" `
     --user="<AIVEN_USER>" `
     --password="<AIVEN_PASSWORD>" `
     --ssl-ca="certs/ca.pem" `
     --ssl-mode=REQUIRED `
     odibrick < "backups/odibrick_aiven_pre_migration_<timestamp>.sql"
   ```
3. **Verify Restored Database State:**
   - Confirm 100 base tables exist.
   - Run verification query:
     ```sql
     SELECT COUNT(*) FROM users;
     SELECT COUNT(*) FROM properties;
     SELECT * FROM schema_migrations ORDER BY filename;
     ```
4. **Restart Backend Service:**
   - Trigger manual restart on Render dashboard or via deployment hook.
   - Verify health check: `GET https://odibrick-new-backend.onrender.com/api/health` -> `{"status":"ok","database":"up"}`.
5. **Execute Smoke Tests:**
   - Log in as `super_admin@demo.odibrick.test` and `tenant1@demo.odibrick.test`.
   - Verify property catalog and customer dashboards load cleanly.

---

### Scenario B: Rollback via Aiven Console Point-In-Time-Recovery (PITR)
If logical dump restore is blocked or network disconnection occurs:

1. Log in to the **Aiven Cloud Console** (`https://console.aiven.io`).
2. Select the MySQL service (`odibrick-mysql` / target service).
3. Navigate to **Backups & Point-in-Time Recovery**.
4. Select the timestamp immediately prior to migration initiation.
5. Select **Restore to a New Service** (or restore in place if supported by plan).
6. Update Render environment variable `DB_HOST` to the restored instance endpoint.
7. Trigger Render redeploy and verify health.

---

### Scenario C: Media Delivery Failure Rollback
If database records are restored but media routes fail:

1. Inspect Render logs for storage driver errors (`StorageService`).
2. Verify `STORAGE_DRIVER` environment variable (`LOCAL` vs `S3`).
3. If S3 driver was enabled and credentials failed:
   - Revert Render `STORAGE_DRIVER` to `LOCAL`.
   - Keep normalized property records intact.
   - Serve verified fallback photographs or restart media sync.

---

## 5. Post-Rollback Incident Reporting

Upon execution of any rollback:
1. Capture all stdout/stderr logs from the failed import or smoke test.
2. Do **not** delete the source backup `odibrick_local_source_20261009_060949.sql`.
3. Document the root cause in `ODIBRICK_MIGRATION_INCIDENT_REPORT.md`.
4. Re-verify the restored Aiven baseline before authorizing any re-attempt.

---

## 6. Safety Affirmation

- **Destructive Commands Prohibited:** No drop, truncate, or overwrite command may be issued without explicit human confirmation.
- **Credential Hygiene:** No passwords or auth tokens are written into backup headers or rollback scripts.
- **Seeding Prohibited Post-Rollback:** Do not run `node database/seed/seed.js` against production after rollback.
