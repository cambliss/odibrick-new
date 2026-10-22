# ODIBRICK — CLOUDFLARE R2 PRODUCTION MEDIA MIGRATION RUNBOOK

**Target Service:** Render Web Service `@odibrick/api`  
**Web Frontend:** Vercel (`https://odibrick-new-web.vercel.app`)  
**Production API:** `https://odibrick-new-backend.onrender.com`  
**Database:** Aiven MySQL (`odibrick_v2`)  
**Target Storage Driver:** Cloudflare R2 via `@aws-sdk/client-s3`  
**Status:** READY FOR OPERATOR REVIEW & AUTHORIZATION (LOCAL IMPLEMENTATION & TESTS PASSED)

---

## 1. Prerequisites & Account Setup

### 1.1 Cloudflare R2 Bucket Provisioning
1. Log in to the Cloudflare Dashboard -> **R2 Object Storage**.
2. Click **Create bucket**.
3. Bucket Name: `odibrick-production-media` (if unavailable in the account, note the exact alternate name, e.g. `odibrick-prod-media`).
4. Location Hint: Choose default or **Western North America / Asia-Pacific** (`auto`).
5. Storage Class: **Standard**.
6. **Public Bucket Access:** Keep **OFF / Disabled**. All assets are securely served through the NestJS backend proxy endpoint `GET /api/storage/:key`, preserving access controls and security headers (`X-Content-Type-Options: nosniff`, `Cache-Control`).

### 1.2 Least-Privilege API Token
1. In Cloudflare Dashboard -> **R2** -> **Manage R2 API Tokens**.
2. Click **Create API token**.
3. Permissions: Select **Object Read & Write** (scoped specifically to bucket `odibrick-production-media`).
4. TTL: Set according to organization security policy.
5. Save the generated credentials securely:
   - **Access Key ID**
   - **Secret Access Key**
   - **Endpoint URL**: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`

---

## 2. Media Inventory Audit Summary

Before initiating any upload, the physical media inventory across local roots was audited against database records using `scripts/audit-media-inventory.js`:

| Metric | Verified Value | Notes |
| :--- | :--- | :--- |
| **Total Physical Files on Disk** | 531 files | Scanned across `apps/api/storage` and root `storage/` |
| **Unique Relative Storage Keys** | 356 keys | 4.49 MB total payload size |
| **Duplicate Keys Across Roots** | 175 files | Files present in both directories |
| **Content Hash Conflicts** | **0 conflicts** | All 175 duplicates have identical SHA-256 hashes |
| **DB-Referenced Keys** | 213 keys | Across `property_images`, `documents`, `inspection_media` |
| **Matched on Disk** | 198 keys (93.0%) | Physical files exist on workstation |
| **Missing on Disk** | 15 keys (7.0%) | Seed/demo placeholders; receive fixed SVG fallback |
| **Property 56 Photos** | **4 / 4 Present** | All 4 photos for the reported property exist on disk |
| **Private Documents** | 6 files | Classified under `vault/`; kept non-public |

---

## 3. Pre-Migration Isolated R2 Integration Test (Safe Gate)

Before authorizing or executing the full 356-file production migration, perform an isolated end-to-end integration test using a dedicated test bucket (e.g. `odibrick-test-media`) or an isolated prefix (`isolated-test/`).

### 3.1 Safety Safeguards Enforced
- **Production Bucket Protection:** The test runner (`scripts/isolated-r2-test.mjs`) strictly halts with an error if pointed at the production bucket without an isolated subfolder prefix.
- **Minimal Representative Payload:** Only tests 2 sample files (~19 KB total: 1 small public JPEG photo and 1 private KYC PDF). It **never** touches or uploads the full media inventory.
- **Safe Scoped Cleanup:** The cleanup routine (`--cleanup`) strictly deletes only objects matching the isolated test prefix (`isolated-test/`), preventing deletion of real assets.

### 3.2 Offline Mock Simulation (No Cloud Credentials Required)
Run the automated safeguard and mock test suite locally:

```bash
node scripts/test-isolated-r2-safeguards.mjs
```

### 3.3 Live Isolated Test Execution (Operator Authorized)
When test bucket credentials are provided, run the live isolated test:

```bash
# In PowerShell / Windows Terminal
$env:S3_TEST_BUCKET="odibrick-test-media"
$env:S3_TEST_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
$env:S3_TEST_REGION="auto"
$env:S3_TEST_ACCESS_KEY="<CLOUDFLARE_R2_ACCESS_KEY_ID>"
$env:S3_TEST_SECRET_KEY="<CLOUDFLARE_R2_SECRET_ACCESS_KEY>"

# 1. Run live isolated test (retains test objects for verification)
node scripts/isolated-r2-test.mjs --execute --prefix=isolated-test/

# 2. Re-run without --overwrite to verify idempotency (skips re-upload)
node scripts/isolated-r2-test.mjs --execute --prefix=isolated-test/

# 3. Clean up test objects strictly within the isolated prefix
node scripts/isolated-r2-test.mjs --execute --prefix=isolated-test/ --cleanup
```

### 3.4 Verification Criteria for Isolated Test
1. **Upload:** Representative image (~3 KB) is uploaded with `PutObjectCommand`.
2. **Byte Verification:** Object is downloaded via `GetObjectCommand` and independently hashed. SHA-256 must match local file exactly.
3. **SVG Fallback:** Requesting nonexistent property key returns valid, well-formed XML SVG (`Living Room &amp; Lounge`).
4. **Private Document Isolation:** Private test document under `vault/` is confirmed inaccessible via public route (HTTP 403 policy enforced).
5. **Idempotency:** Re-running without overwrite skips existing object without mutation.
6. **Cleanup:** Test objects are removed cleanly without affecting any other bucket objects.

---

## 4. Pre-Cutover Full Dry Run & Manifest Audit

Run the full migration script in dry-run mode to verify zero regressions across all 356 files:

```bash
# Execute dry run (read-only, no cloud modifications)
node scripts/migrate-local-media-to-r2.mjs --dry-run
```

**Verification:** Confirm that `migration-media-manifest.json` is generated and confirms:
- 356 unique keys
- 0 hash conflicts
- Correct MIME type mapping

---

## 5. Phase 1: Uploading Media to Cloudflare R2

*Operator authorization is required before running this step.*

Set the temporary environment variables in your terminal session (never commit credentials):

```bash
# In PowerShell / Windows Terminal
$env:S3_BUCKET="odibrick-production-media"
$env:S3_ENDPOINT="https://<ACCOUNT_ID>.r2.cloudflarestorage.com"
$env:S3_REGION="auto"
$env:S3_ACCESS_KEY="<CLOUDFLARE_R2_ACCESS_KEY_ID>"
$env:S3_SECRET_KEY="<CLOUDFLARE_R2_SECRET_ACCESS_KEY>"

# Execute live upload to R2
node scripts/migrate-local-media-to-r2.mjs --execute
```

### Post-Upload Verification
Run the verification mode to download and independently verify actual byte SHA-256 checksums against local files:

```bash
node scripts/migrate-local-media-to-r2.mjs --verify
```

Ensure output reports `Verified On Target: 356` and `Failures / Errors: 0`. The verification step downloads each object's payload and computes its independent SHA-256 hash; it rejects matches based solely on byte size or user metadata.

---

## 6. Phase 2: Deploying Application Code Changes

Deploy the tested application code changes to Render:
- `apps/api/src/modules/storage/storage.service.ts`: XML escaping in `generateFallbackSvg()`, S3Driver fallback for property photos, normalized driver casing.
- `apps/api/src/config/configuration.ts`: Support for `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION` alongside `AWS_*`.
- Automated test suite: `apps/api/src/modules/storage/storage.service.spec.ts`.

Commit and push to the deployment branch triggering Render build, or wait for manual deployment. Verify Render build succeeds.

---

## 7. Phase 3: Controlled Render Configuration Switch

1. Open **Render Dashboard** -> Web Service `@odibrick/api`.
2. Navigate to **Environment**.
3. Add / Update the following environment variables:

| Variable | Value | Purpose |
| :--- | :--- | :--- |
| `STORAGE_DRIVER` | `S3` | Enables durable S3/R2 object storage driver |
| `S3_BUCKET` | `odibrick-production-media` | Target Cloudflare R2 bucket name |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` | Cloudflare R2 S3-compatible API endpoint |
| `S3_REGION` | `auto` | Cloudflare R2 region |
| `S3_ACCESS_KEY` | `<CLOUDFLARE_R2_ACCESS_KEY_ID>` | API Token Access Key |
| `S3_SECRET_KEY` | `<CLOUDFLARE_R2_SECRET_ACCESS_KEY>` | API Token Secret Key |

4. Click **Save Changes**.
5. Render will execute a zero-downtime rolling deployment. Monitor the deploy logs for:
   ```
   [StorageService] Storage initialized with S3Driver (Bucket: odibrick-production-media, Region: auto, Endpoint: https://...)
   ```

---

## 8. Post-Cutover Verification Checklist

Perform the following smoke tests against production:

### 1. Public Property Gallery (Property 56)
- URL: `https://odibrick-new-web.vercel.app/india/mumbai/bandra-west/3bhk-apartment-rmmmydss`
- **Check:** Verify all 4 property photos load in full resolution (`naturalWidth > 0`, `naturalHeight > 0`).
- **Check:** Zero broken-image icons or XML parsing errors.

### 2. Property Editor Photo Management
- URL: `https://odibrick-new-web.vercel.app/dashboard/properties/56/edit?section=photos`
- **Check:** 4 thumbnail cards render property images correctly.

### 3. Missing Image Fallback
- Request: `GET https://odibrick-new-backend.onrender.com/api/storage/properties/nonexistent-key.jpg`
- **Check:** Returns HTTP 200 with `Content-Type: image/svg+xml`.
- **Check:** Decodes properly in browser showing `Living Room & Lounge` with `&amp;` well-formed XML.

### 4. Private Vault Isolation & Security
- Request: `GET https://odibrick-new-backend.onrender.com/api/storage/vault/USR-CUST-001/kyc/test.pdf`
- **Check:** Strictly returns **HTTP 403 Forbidden** (`Direct access to protected vault files is prohibited`).
- Authenticated Download: `GET /api/documents/:id/download` with valid JWT returns HTTP 200 decrypted document with `Cache-Control: private, no-store`.

### 5. Durability Across Restart Test
- Upload a new test photo to a draft property via the property editor. Note the key.
- Go to Render Dashboard -> `@odibrick/api` -> **Manual Deploy** -> **Restart Service**.
- After restart completes, request the newly uploaded photo.
- **Check:** Photo returns HTTP 200 immediately, proving it persisted to R2 and survived ephemeral container recreation.

---

## 9. Realistic Rollback & Recovery Plan

### Critical Architectural Distinctions

1. **Render's Ephemeral Filesystem Does NOT Provide Durable Storage:**
   - Render Web Services deploy stateless Docker containers. The container filesystem is completely wiped and recreated on every redeploy, manual restart, or automatic instance replacement.
   - All media directories (`/storage/`, `/uploads/`, `apps/api/storage/`) are explicitly excluded in `.gitignore` (lines 12–14) and are **never baked into the git repository or Docker deployment bundle**.
   - Therefore, a deployed Render container starts with an **empty** media directory.
2. **Switching to `LOCAL` Does NOT Restore Missing Media:**
   - **Crucial Warning:** Switching `STORAGE_DRIVER=LOCAL` in Render does NOT bring back missing property photos. It merely instructs the API to read from Render's empty container disk.
   - Every property image requested in `LOCAL` mode on Render will either fail or return an SVG fallback.
   - **Do NOT recommend or execute switching to `LOCAL` on Render as a complete rollback unless a verified persistent storage arrangement (such as a mounted Render Persistent Disk) exists and has been pre-populated with all media.**
3. **Application Rollback vs Storage-Driver Rollback are Separate Operations:**
   - **Code Rollback:** The application code changes (XML entity escaping in `generateFallbackSvg`, config aliasing for `S3_*`, and S3Driver missing-key handling) are completely backwards-compatible. They work identically in both `LOCAL` and `S3` modes. Reverting code is NOT required to switch storage modes.
   - **Storage Switch:** Changing `STORAGE_DRIVER` is an independent environment variable configuration change.
4. **R2 Must Remain Intact Throughout Any Rollback:**
   - **NEVER delete the Cloudflare R2 bucket or delete objects in R2 during a rollback.**
   - Cloudflare R2 contains the only durable copies of media in cloud production. Deleting or modifying R2 objects will cause irreversible data loss.
5. **Preserving Post-Cutover Uploads:**
   - Any new property photos, KYC documents, or legal agreements uploaded after cutover are written directly to Cloudflare R2.
   - If an emergency issue arises with the API's S3 driver, access to these post-cutover objects in R2 must be preserved.
   - If a rollback to a local storage arrangement is ever attempted on a persistent volume, all newly created objects in R2 must first be synced down to that volume before cutting traffic away from R2.

### Safe Rollback & Mitigation Procedures

#### Scenario A: Transient S3/R2 API Connectivity or Credential Failure
1. If the API fails to connect to R2 (e.g. invalid token, network partition):
   - Check Render logs for specific S3 error codes (`SignatureDoesNotMatch`, `InvalidAccessKeyId`, `NoSuchBucket`).
   - Correct the environment variables in Render Dashboard (`S3_BUCKET`, `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) and trigger a redeploy.
   - **Do not switch to LOCAL** for transient credential issues, as LOCAL will immediately serve SVG fallbacks to all users.

#### Scenario B: Emergency Rollback (If R2 is Entirely Unusable)
1. If R2 is completely unavailable and an immediate stopgap is needed:
   - Temporarily set `STORAGE_DRIVER=LOCAL` in Render's environment settings.
   - Render will restart and begin serving contextual fallback SVGs for property images (`Modular Kitchen`, `Master Bedroom`, `Balcony View`, `Living Room & Lounge`).
   - The platform will remain partially operational for browsing without broken-image decoding crashes, but real photos will be absent until R2 connectivity is restored.
   - As soon as the root cause is resolved, re-enable `STORAGE_DRIVER=S3`. Zero files in R2 will have been deleted or corrupted.

---

## 10. GO / NO-GO Decision Gate

| Gate Criteria | Status | Sign-off |
| :--- | :---: | :---: |
| Unit tests for SVG escaping pass (19/19) | **PASS** | Automated |
| Monorepo test suite passes (31/31) | **PASS** | Automated |
| TypeScript build passes with zero errors | **PASS** | Automated |
| Local media inventory scanned (356 keys) | **PASS** | Automated |
| Zero content hash conflicts between storage roots | **PASS** | Automated |
| All Property 56 photos verified on disk | **PASS** | Automated |
| Dry-run migration manifest verified | **PASS** | Automated |
| Migration tool safety tests pass (13/13) | **PASS** | Automated |
| Isolated R2 safeguard tests pass (16/16) | **PASS** | Automated |
| Isolated R2 integration test executed against test bucket | **PENDING** | Operator Action |
| Cloudflare R2 production bucket provisioned | **PENDING** | Operator Action |
| S3 API credentials provided by operator | **PENDING** | Operator Action |
| Live production upload authorized by operator | **PENDING** | Operator Action |

**Final Recommendation:** Execute the isolated integration test against a dedicated test bucket (`odibrick-test-media`) before authorizing full production migration.
