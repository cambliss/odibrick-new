# ODIBRICK — CLOUDFLARE R2 MIGRATION PRE-FLIGHT REVIEW

**Date:** 2026-10-15  
**Scope:** Pre-flight review of migration utility (`scripts/migrate-local-media-to-r2.mjs`), inventory audit (`scripts/audit-media-inventory.js`), runbook (`ODIBRICK_R2_MEDIA_MIGRATION_RUNBOOK.md`), storage drivers (`apps/api/src/modules/storage/storage.service.ts`), and security boundaries.  
**Mode:** Strict Read-Only Review & Post-Fix Validation.

---

## 1. Review Checklist & Findings

| # | Checklist Item | Initial Status | Post-Fix Status | Verification Evidence |
| :---: | :--- | :---: | :---: | :--- |
| **1** | **Dry-run mode performs no mutations** | PASS | **PASS** | `isDryRun` is default. `PutObjectCommand` guarded by `if (isExecute && !isDryRun && !isVerifyOnly ...)`. Local inspection is strictly read-only. |
| **2** | **Fail-fast on missing configuration** | NEEDS ATTENTION | **PASS** | Added explicit fail-fast validation in `scripts/migrate-local-media-to-r2.mjs`. If `--execute` or `--verify` is supplied without required credentials, it prints a fatal error listing missing keys and halts with `process.exit(1)`. |
| **3** | **Derivation of relative object keys** | PASS | **PASS** | `normalizeKey(path.relative(baseDir, fullPath))` converts backslashes to forward slashes and strips leading slashes, matching database relative keys. |
| **4** | **Duplicate keys with differing hashes stop migration** | PASS | **PASS** | Step 1 checks duplicate keys across roots; if `existing.sha256 !== sha256`, logs fatal error and calls `process.exit(1)` before any network connection. Zero hash conflicts exist. |
| **5** | **Identical duplicate keys uploaded only once** | PASS | **PASS** | `discoveredFiles` Map keys on unique storage key. 175 duplicates across roots are deduplicated; loop iterates over unique keys. |
| **6** | **Existing destination objects not overwritten without authorization** | PASS | **PASS** | Size matches marked `SKIPPED_IDENTICAL`. Size mismatches require explicit `--overwrite` flag. |
| **7** | **`--verify` verifies actual object content integrity** | NEEDS ATTENTION | **PASS** | Updated `--verify` to issue `GetObjectCommand`, stream the actual object payload, and independently compute SHA-256 hash. Rejects matches based solely on byte size or user metadata. |
| **8** | **Accurate manifest statuses and categories** | PASS | **PASS** | Accurately distinguishes `VERIFIED_CHECKSUM_MATCH`, `VERIFICATION_CHECKSUM_MISMATCH`, `SKIPPED_IDENTICAL`, `SKIPPED_SIZE_ONLY`, `CONFLICT_SIZE_MISMATCH`, `UPLOADED`, `FAILED`, and `DRY_RUN_ELIGIBLE`. |
| **9** | **Interrupted runs handled safely** | PASS | **PASS** | `HeadObjectCommand` detects previously uploaded objects, safely resuming uncompleted files without re-uploading identical objects. |
| **10** | **Treatment of `vault/`, `kyc/`, and private media** | PASS | **PASS** | `isPrivateDocument()` classifies all 6 vault PDFs as `isPrivate: true`. Public endpoint returns 403 Forbidden. Authenticated download requires HMAC/JWT RBAC. Missing files throw 404 and never receive SVG fallback. |
| **11** | **Prefix and overwrite risks** | PASS | **PASS** | Keys are stored at object root matching database paths. Dedicated bucket `odibrick-production-media` prevents cross-application collisions. |
| **12** | **Two storage roots and Windows vs Linux paths** | PASS | **PASS** | Paths normalized to `/`. Zero case mismatches discovered in audit. All 53 unique files in `apps/api/storage` (including all 4 Property 56 photos) are preserved. |
| **13** | **Rollback preservation of post-cutover uploads** | NEEDS ATTENTION | **PASS** | Section 8 of Runbook updated: explicitly warns that Render filesystem is ephemeral and that switching to `LOCAL` does not restore files. R2 must remain intact throughout any rollback. |
| **14** | **Discrepancies between code and documentation** | NEEDS ATTENTION | **PASS** | Contradictory flag handling (`--dry-run --execute`) resolved with explicit rejection; `--verify` checksum verification aligned with code; fail-fast validation enforced. |
| **15** | **Minimum changes implemented** | PASS | **PASS** | All 4 corrective actions applied and validated with automated tests. |

---

## 2. Four Corrective Actions Implemented

1. **Independent SHA-256 Byte Verification (`--verify`):**
   - In `scripts/migrate-local-media-to-r2.mjs`, `--verify` mode executes `GetObjectCommand`, streams the actual remote byte payload, calculates its SHA-256 checksum, and compares it directly against the local source file's SHA-256.
   - If bytes differ (even if size matches), it reports `VERIFICATION_CHECKSUM_MISMATCH` and fails.
   - It distinguishes `VERIFIED_CHECKSUM_MATCH`, `SKIPPED_IDENTICAL`, and `SKIPPED_SIZE_ONLY`.
   - It does not treat S3 ETags (MD5 / multipart composites) as SHA-256 hashes.
2. **Fail-Fast on Missing Execution Configuration:**
   - In `scripts/migrate-local-media-to-r2.mjs`, when `--execute` or `--verify` is supplied without required bucket, endpoint, access key, or secret key, it prints a formatted `[FATAL CONFIGURATION ERROR]` and immediately exits with status code 1.
3. **Safe Flag Precedence Enforcement:**
   - In `scripts/migrate-local-media-to-r2.mjs`, supplying both `--dry-run` and `--execute` is explicitly rejected with `[FATAL ERROR] Contradictory flags provided` and exit code 1.
   - Defensively, `isExecute` is calculated as `hasExecute && !hasDryRun`.
   - Mutation commands (`PutObjectCommand`) are strictly guarded by `if (isExecute && !isDryRun && !isVerifyOnly ...)`.
4. **Realistic Rollback & Recovery Documentation:**
   - In `ODIBRICK_R2_MEDIA_MIGRATION_RUNBOOK.md`, Section 8 was expanded to detail that Render containers are ephemeral and stateless, `.gitignore` excludes media folders from git, and switching to `LOCAL` will not restore missing images.
   - Established that Cloudflare R2 is the sole durable store and must remain intact throughout any recovery operation.

---

## 3. Automated Test Verification Results

- **Migration Tool Safety Suite (`node scripts/test-migration-tool.mjs`):**
  - Contradictory flag rejection: **PASS** (exits code 1, prints fatal error)
  - Missing config in `--execute`: **PASS** (exits code 1, prints fatal error)
  - Missing config in `--verify`: **PASS** (exits code 1, prints fatal error)
  - Normal dry-run execution: **PASS** (exits code 0, 0 uploads executed)
  - Content checksum verification: **PASS** (rejects identical-size byte mismatch; confirms `VERIFIED_CHECKSUM_MATCH` on true hash match)
  - Result: **13/13 tests passed (100%)**
- **Storage Driver & Fallback SVG Tests (`npm test -- storage.service.spec.ts`):**
  - Result: **19/19 tests passed (100%)**
- **Driver Verification Suite (`node scripts/verify-storage-drivers.js`):**
  - Result: **21/21 tests passed (100%)**
- **Full API Test Suite (`npm run test`):**
  - Result: **4 suites, 31 tests passed (100%)**
- **API Build (`npm run build --workspace=@odibrick/api`):**
  - Result: **Zero errors (Exit code 0)**

---

## 4. Final Verdict

# `READY FOR ISOLATED R2 TEST`

All pre-flight safety findings have been resolved. The migration tool strictly fails fast on missing configuration, rejects contradictory flags, performs deep SHA-256 byte verification, and the runbook accurately describes the operational realities of Render's ephemeral filesystem and R2 durability.
