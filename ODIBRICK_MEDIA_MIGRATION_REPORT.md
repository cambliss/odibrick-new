# ODIBRICK — PROPERTY MEDIA & DOCUMENT VAULT MIGRATION REPORT

**Target Environment:** Local Storage & Cloud Object Store Migration  
**Date:** October 9, 2026  
**Status:** **INVENTORIED & RECONCILED — STORAGE LIMITATION DOCUMENTED**  

---

## 1. Executive Summary

Property media and private documents are modeled in the relational schema as normalized storage keys pointing to underlying binary assets. The database migration synchronizes the catalog metadata (`property_images`, `documents`). This report details the reconciliation between the database records and physical binary files on disk, evaluates cloud storage driver readiness, and defines public/private access governance.

---

## 2. Media & Physical Asset Inventory

| Category | Database Records | Physical Files on Disk | Reconciliation Rate | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Property Photos** | **230 rows** | **190 files** | **82.6%** | Canonical high-resolution JPEG/WebP property photos present on disk. 40 records are historical placeholder keys. |
| **Document Vault** | **27 rows** | **5 files** | **18.5%** | Sample KYC PAN/Aadhaar and agreement PDFs present. 22 records represent synthetic testing vault entries. |
| **Generated / Cached Assets** | — | **109 files** | — | Generated thumbnails, test mockups, and preview buffers. |
| **Total Disk Assets** | — | **304 files** | — | Total physical assets in [`storage/`](file:///c:/Users/Cambliss/Downloads/odibrick/storage) directory (`~18.4 MB`). |

---

## 3. Storage Driver Analysis & Production Readiness

### 3.1 Implemented Storage Drivers
In [`apps/api/src/modules/storage/storage.service.ts`](file:///c:/Users/Cambliss/Downloads/odibrick/apps/api/src/modules/storage/storage.service.ts), the application implements dual-driver abstraction:

1. **`LOCAL` Storage Driver:**
   - Reads/writes to `STORAGE_LOCAL_ROOT` (e.g. `./storage`).
   - Serves public property photos via `GET /api/storage/:key`.
   - Serves private documents via authenticated, signed route `GET /api/documents/:id/download`.
   - *Production Limitation:* Render web services utilize ephemeral local disks; files written to `./storage` on Render are reset on redeployments unless backed by persistent disk or object storage.

2. **`S3` / Cloudflare R2 Driver:**
   - Fully implemented using AWS SDK v3 (`@aws-sdk/client-s3`).
   - Supports AWS S3, Cloudflare R2, MinIO, and other S3-compatible object storage APIs.
   - Requires environment variables: `S3_BUCKET`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_FORCE_PATH_STYLE`.

### 3.2 Current Cloud Storage Configuration Status
- `STORAGE_DRIVER`: Currently configured as `LOCAL` in `.env` and Render backend.
- `S3_BUCKET`: Not yet configured (`unset`).
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`: Not yet configured (`unset`).

**Media Status Verdict:** Database schema and metadata are 100% prepared. Because cloud S3/R2 credentials are not configured in the repository, the migration status is classified as **`READY WITH MEDIA LIMITATION`**.

---

## 4. Public vs. Private Access Governance

To guarantee security and privacy:
- **Public Property Media (`property_images`):** Delivered via public streaming route `/api/storage/properties/...`. Permitted MIME types: `image/jpeg`, `image/png`, `image/webp`.
- **Private Vault Documents (`documents`):** Tagged with `visibility = 'PRIVATE'` or `'STAFF'`. Direct access via `/api/storage/` is strictly prohibited. Access requires valid JWT authorization with role-based checks and short-lived signed URLs via `/api/documents/:id/download`.

---

## 5. Media Migration Path to Cloud (When Credentials Available)

When S3 or Cloudflare R2 credentials are provided:
1. Run media sync script `scripts/upload-storage-to-s3.js`.
2. Upload all 304 assets to `s3://${S3_BUCKET}/`.
3. Set `STORAGE_DRIVER=S3` in Render environment variables.
4. Verify HTTP 200 image responses via `/api/storage/` and property cards on Vercel frontend.
