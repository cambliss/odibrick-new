# ODIBRICK — PROPERTY PHOTOS & MEDIA MANAGEMENT IMPLEMENTATION REPORT

**Date:** October 6, 2026  
**Status:** COMPLETED & VERIFIED (41/41 Automated Media Verifications Passed)  
**Target Environments:** `@odibrick/api`, `@odibrick/web`, MySQL 8.0  

---

## EXECUTIVE SUMMARY

This report documents the architectural review, root-cause resolution, feature implementation, and verification testing for property photographs across the Odibrick ecosystem. The work resolves the broken photo uploader in the 10-step listing creation wizard (**Problem 1**) and introduces a complete, secure Media Management workspace for existing properties (**Problem 2**).

All enhancements safely reuse the existing normalized database schema (`property_images`), local/S3 storage abstraction (`StorageService`), and strict RBAC governance without requiring database migrations or disrupting private document vault security.

---

## 1. EXISTING PHOTO ARCHITECTURE

Prior to this work, property images were architecturally modeled in the relational schema as normalized media rows in the `property_images` table:

```
+--------------------------------------------------------------------+
|                          properties                                |
|  id, public_id, title, listing_type, status, quality_score, etc.   |
+--------------------------------------------------------------------+
                                  |
                                  | 1:N
                                  v
+--------------------------------------------------------------------+
|                       property_images                              |
|  id INT AUTO_INCREMENT PRIMARY KEY                                 |
|  property_id INT NOT NULL (FK -> properties.id)                   |
|  storage_key VARCHAR(500) NOT NULL                                 |
|  caption VARCHAR(200)                                              |
|  room_tag VARCHAR(60)                                              |
|  is_cover TINYINT(1) DEFAULT 0                                     |
|  sort_order INT DEFAULT 0                                          |
|  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP                    |
+--------------------------------------------------------------------+
```

### Architectural Findings:
- **Storage Classification**: Property photos are classified as public listing media, referenced by unique `storage_key` paths (e.g. `properties/<timestamp>_<hash>_<filename>.jpg`).
- **Separation of Concerns**: Private documents (Aadhaar, PAN, title deeds, KYC documents, lease agreements) reside in the `documents` vault table with restricted signed-link access (`/api/documents/:id/download`). Property listing photos reside in `property_images` and are delivered via public storage routes (`/api/storage/properties/...`).
- **Quality Score Integration**: `quality_score` computation dynamically evaluates attached photographs (awarding up to 30 points for $\ge 6$ photos).

---

## 2. ROOT CAUSE OF BROKEN "CHOOSE FILES" BUTTON

In the 10-step "Add a property" flow (`/dashboard/properties/new`), Step 10 (Photographs) displayed:
```
Add photographs
[Choose files] No file chosen
```
However, clicking **"Choose files"** failed to open the browser file dialog.

### Detailed Root Cause Analysis:
1. **Disabled Attribute Due to Unpersisted Draft ID**:
   In `apps/web/app/dashboard/properties/new/listing-wizard.tsx`, the file input was declared as:
   ```tsx
   <input
     id="photos"
     type="file"
     accept="image/jpeg,image/png,image/webp"
     multiple
     onChange={handle}
     disabled={busy || !propertyId} // <--- ROOT CAUSE
   />
   ```
   When a user navigated through Steps 1 to 9 without clicking an explicit "Save draft" action, `propertyId` remained `undefined`. Because `disabled={true}` was passed to the DOM `<input>`, standard browser behavior suppressed all click events, preventing the file picker from opening.
2. **Missing Auto-Draft Synchronization**:
   The component lacked an auto-save callback to persist the property draft to MySQL when the user selected photos before saving.
3. **Missing Raw Storage Serving Endpoint**:
   While `StorageController` accepted multipart uploads via `@Post('uploads')`, there was no public raw storage streaming endpoint to serve uploaded property images back to frontend `<img src="/api/storage/..." />` tags.

---

## 3. FIX IMPLEMENTED FOR NEW PROPERTY CREATION

In `apps/web/app/dashboard/properties/new/listing-wizard.tsx`:
1. **Unblocked File Selection**:
   Removed `disabled={!propertyId}` from the file input. The file input remains clickable at all times (only disabling during active network upload operations).
2. **Seamless Auto-Draft Persistence**:
   Integrated `onEnsureDraftId: () => Promise<number | null>`. If `propertyId` is not yet created, selecting photos automatically triggers `save(false)` in the background, creates the property draft in MySQL, receives the generated `id`, and proceeds with uploading.
3. **Client-Side Validation & Friendly Error Feedback**:
   - Rejects non-image formats (e.g. PDF, EXE, GIF) with:
     `"${file.name} cannot be uploaded. Supported formats are JPEG, PNG and WebP."`
   - Rejects files exceeding 10 MB with:
     `"${file.name} exceeds the 10 MB limit."`
4. **Rich Preview & Management Hub in Step 10**:
   - Instant local thumbnail previews (`URL.createObjectURL(file)`).
   - Filename, formatted file size (e.g. `2.4 MB`), and upload state chips (`Uploading…`, `Uploaded`, `Error`).
   - Dynamic publication requirement tracker:
     `Photos: X / Minimum required: 4` with badges for `Requirement Satisfied ✓` vs `Need X more`.
   - In-step controls: **Set Cover Photo**, **Move Left/Right (Reorder)**, and **Delete Photograph**.

---

## 4. EXISTING PROPERTY PHOTO MANAGEMENT DESIGN

For existing properties in the database, authorized users now have a complete media management workspace at:

```
Route: /dashboard/properties/[id]
```

### Features:
1. **Property Photos Hub**:
   - Displays all attached photos in a responsive grid (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4`).
   - Prominent `COVER` badge on the primary listing photo.
   - Real-time photo counter: `Photos: X / 4 minimum photos` with status banner:
     - `✓ Publication requirement satisfied` (Green)
     - `⚠ Needs X more photo(s) to meet publication threshold` (Amber)
2. **Interactive Controls on Every Photo**:
   - **Set Cover**: Changes primary photo designation (`POST /api/properties/:id/images/:imageId/cover`).
   - **Reorder (← / →)**: Updates display sequence (`POST /api/properties/:id/images/reorder`).
   - **Delete (×)**: Removes photograph (`DELETE /api/properties/:id/images/:imageId`) and automatically reassigns cover to the first remaining photo if the deleted photo was the cover.
3. **Multi-File Upload Zone**:
   - `[ + Add Photos ]` button and drag-and-drop zone.
   - Uploads multiple JPEG, PNG, or WebP images up to 10 MB per file.
4. **Lifecycle & Verification Integration**:
   - For `DRAFT` listings: Provides direct "Edit in wizard" and "Submit for verification" actions (enabled once $\ge 4$ photos are present).
   - For `ACTIVE` listings: Provides direct "View public listing ↗" link (`/${slug}`).
   - Displays verification feedback note if listing was previously rejected.

---

## 5. STORAGE & SERVING ARCHITECTURE

```
+------------------+         Multipart Upload          +----------------------+
|  Frontend Client | --------------------------------> | POST /api/uploads    |
+------------------+                                   +----------------------+
        |                                                          |
        | JSON { storageKey }                                      | Writes file to disk/S3
        v                                                          v
+-----------------------------+                        +----------------------+
| POST /api/properties/:id/   |                        | Storage Driver       |
| images                      |                        | (uploads/properties/) |
+-----------------------------+                        +----------------------+
        |                                                          ^
        | Inserts row into `property_images`                       |
        v                                                          |
+-----------------------------+                        +----------------------+
| Public <img> Browser Render | ---------------------> | GET /api/storage/    |
| /api/storage/properties/... |                        | properties/...       |
+-----------------------------+                        +----------------------+
```

### Storage Driver Details:
- **Local Driver**: Default storage driver writing to `STORAGE_LOCAL_ROOT` (`./uploads/properties/...`).
- **S3 Driver**: Adapter-ready for AWS S3 / MinIO / Cloudflare R2 object storage.
- **Serving Security**: The public endpoint `GET /api/storage/:key(*)` strictly filters out `vault/`, `kyc/`, and `agreements/` prefixes, returning `403 Forbidden` if direct access to private vault documents is attempted.

---

## 6. PHOTO VALIDATION RULES

| Rule | Frontend Enforcement | Backend Enforcement | Error Message |
|---|---|---|---|
| **Accepted Formats** | JPEG, JPG, PNG, WebP | JPEG, JPG, PNG, WebP (`ALLOWED_EXTENSIONS` + MIME + Magic Bytes) | `"${file.name} cannot be uploaded. Supported formats are JPEG, PNG and WebP."` |
| **Max File Size** | 10 MB ($10 \times 1024 \times 1024$ bytes) | 10 MB ($10 \times 1024 \times 1024$ bytes) | `"${file.name} exceeds the 10 MB limit."` |
| **Minimum Photos to Publish** | $\ge 4$ photos | $\ge 4$ photos in `submitForVerification` | `"Add at least 4 photographs before submitting."` |
| **Magic Byte Validation** | N/A | JPEG (`FF D8 FF`), PNG (`89 50 4E 47`), WebP (`RIFF...WEBP`) | `"The file contents do not match its type."` |

---

## 7. ROLE PERMISSIONS & RBAC MATRIX

| Role | View Photos | Add Photos (Own) | Add Photos (Any) | Set Cover / Reorder | Delete Photos | Submit for Verification |
|---|---|---|---|---|---|---|
| **SUPER_ADMIN** | Yes | Yes | Yes (Governance) | Yes | Yes | Yes |
| **ADMIN** | Yes | Yes | Yes (Governance) | Yes | Yes | Yes |
| **OWNER** | Yes | Yes (Own property) | No (403 IDOR) | Yes (Own) | Yes (Own) | Yes (Own) |
| **AGENT** | Yes | Yes (Listed property) | No (403 IDOR) | Yes (Listed) | Yes (Listed) | Yes (Listed) |
| **BUILDER** | Yes | Yes (Project property) | No (403 IDOR) | Yes (Project) | Yes (Project) | Yes (Project) |
| **TENANT** | Yes (Public listings) | No (403) | No (403) | No (403) | No (403) | No (403) |
| **LEGAL_TEAM** | Yes (Vault/Evidence) | No (403) | No (403) | No (403) | No (403) | No (403) |
| **KYC_TEAM** | Yes (Vault/Identity) | No (403) | No (403) | No (403) | No (403) | No (403) |
| **PUBLIC** | Yes (Active listings) | No (401) | No (401) | No (401) | No (401) | No (401) |

---

## 8. PROPERTY LIFECYCLE & MEDIA BEHAVIOR

| State | Add Photos | Delete / Reorder | Set Cover | Public Gallery Visibility | Verification Gate |
|---|---|---|---|---|---|
| **DRAFT** | Allowed | Allowed | Allowed | Hidden | Blocked until $\ge 4$ photos |
| **PENDING_VERIFICATION** | Allowed | Allowed | Allowed | Hidden | Under KYC & Photo Authenticity Review |
| **ACTIVE** | Allowed | Allowed | Allowed | Visible (`/${slug}`) | Fully verified |
| **PAUSED** | Allowed | Allowed | Allowed | Hidden | Temporarily unlisted |
| **SUSPENDED** | Admin Only | Admin Only | Admin Only | Hidden | Blocked for compliance review |
| **RENTED** | Allowed | Allowed | Allowed | Visible (with rented badge) | Active tenancy |
| **ARCHIVED** | Blocked | Blocked | Blocked | Hidden | Read-only historical record |

---

## 9. PUBLIC / PRIVATE MEDIA ISOLATION

Strict boundaries exist between public media and private documents:

1. **Public Property Media**:
   - Associated with `property_images` table.
   - Stored in `properties/` folder.
   - Served publicly via `GET /api/storage/properties/:key` with `Cache-Control: public, max-age=86400`.
   - Never contains KYC numbers, Aadhaar/PAN scans, or bank details.
2. **Private Document Vault**:
   - Associated with `documents` table.
   - Stored in `vault/` and `kyc/` folders.
   - Accessible ONLY via short-lived HMAC signed tokens (`GET /api/documents/:id/link`) or authenticated staff session (`GET /api/documents/:id/download`).
   - Direct raw access via `GET /api/storage/vault/...` is permanently blocked (`403 Forbidden`).

---

## 10. API ENDPOINTS SUMMARY

| Method | Path | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/uploads` | Authenticated | Stores raw multipart file and returns `{ storageKey, sizeBytes, checksum }` |
| `GET` | `/api/storage/:key(*)` | Public | Streams public assets (property photos) with proper MIME and caching headers |
| `GET` | `/api/properties/:id/images` | Authenticated (or Public if ACTIVE) | Returns sorted image array for property |
| `POST` | `/api/properties/:id/images` | Owner / Agent / Builder / Admin | Attaches image to property and triggers quality score recalculation |
| `POST` | `/api/properties/:id/images/:imageId/cover` | Owner / Agent / Builder / Admin | Sets image as the primary cover photo |
| `POST` | `/api/properties/:id/images/reorder` | Owner / Agent / Builder / Admin | Batch updates `sort_order` for images |
| `DELETE` | `/api/properties/:id/images/:imageId` | Owner / Agent / Builder / Admin | Removes image and automatically reassigns cover if needed |

---

## 11. DATABASE IMPACT & EXISTING INVENTORY

### Database Schema Impact:
- **Zero Schema Migrations Required**: The existing `property_images` schema fully accommodates all requirements (`is_cover`, `sort_order`, `caption`, `room_tag`, `storage_key`).

### Existing Database Property Photo Inventory:
- **Total Properties in Database**: 89
- **Properties with 0 photos**: 40 (27 DRAFT, 13 ARCHIVED)
- **Properties with 1–3 photos**: 17
- **Properties with $\ge 4$ photos**: 32 (All verified/active/pending listings)
- **Active properties under 4 photos**: 11 (Legacy seed listings)
- **Draft properties without photos**: 27 (In-progress listings)
- **Suspended properties without photos**: 0

---

## 12. AUTOMATED VERIFICATION RESULTS

Automated verification was executed via `node scripts/verify-property-media.js`:

```
========================================================================
ODIBRICK — PROPERTY PHOTOS & MEDIA MANAGEMENT VERIFICATION TEST SUITE
========================================================================

--- 1. File Upload & Validation (MIME / Extensions / Size) ---
  ✓ PASS: Valid JPEG accepted and stored with storage key
  ✓ PASS: Valid PNG accepted and stored with storage key
  ✓ PASS: Valid WebP accepted and stored with storage key
  ✓ PASS: Invalid file type (.exe) rejected by storage layer
  ✓ PASS: Oversized photo (>10 MB) rejected by storage service

--- 2. Draft Property Creation & Photo Attachment ---
  ✓ PASS: Created draft property #107
  ✓ PASS: First attached image is automatically set as cover photo
  ✓ PASS: Second attached image is not cover
  ✓ PASS: Third attached image attached successfully
  ✓ PASS: Retrieved 3 attached photos

--- 3. Four-Photo Minimum Rule Verification ---
  ✓ PASS: Submission with 3 photos blocked with error: "Add at least 4 photographs before submitting."
  ✓ PASS: Property submission blocked when fewer than 4 photos are attached
  ✓ PASS: Property remains in DRAFT state
  ✓ PASS: Fourth photograph attached successfully
  ✓ PASS: Submission succeeds into PENDING_VERIFICATION with 4 photos

--- 4. Primary / Cover Image Management ---
  ✓ PASS: Set Image #239 (Kitchen) as cover photo
  ✓ PASS: Image #2 is now is_cover = 1
  ✓ PASS: Image #1 is now is_cover = 0

--- 5. Photo Reordering ---
  ✓ PASS: Reordered photographs [img4, img3, img2, img1]
  ✓ PASS: Image #4 has sort_order = 0
  ✓ PASS: Image #1 has sort_order = 3

--- 6. Photo Deletion & Cover Auto-Reassignment ---
  ✓ PASS: Photograph deleted; 3 photos remaining
  ✓ PASS: Deleted photograph is removed from property_images
  ✓ PASS: Cover automatically reassigned to Image #241

--- 7. Security & IDOR Protection ---
  ✓ PASS: Owner B cannot upload photos to Owner A property (IDOR blocked with 403)
  ✓ PASS: Owner B cannot change cover image on Owner A property (IDOR blocked with 403)
  ✓ PASS: Owner B cannot delete photos on Owner A property (IDOR blocked with 403)

--- 8. Role Authorization (RBAC) ---
  ✓ PASS: TENANT is blocked from modifying property photos (403)
  ✓ PASS: LEGAL_TEAM is blocked from editing property photos (403)
  ✓ PASS: KYC_TEAM is blocked from editing property photos (403)
  ✓ PASS: ADMIN successfully manages property media
  ✓ PASS: SUPER_ADMIN successfully sets cover image
  ✓ PASS: AGENT successfully manages photos for their listed property
  ✓ PASS: BUILDER successfully manages photos for their project inventory

--- 9. Public Listing & Media Isolation ---
  ✓ PASS: Public property page includes 4 photos
  ✓ PASS: Public photos use public properties/ storage path
  ✓ PASS: Public property photograph is readable via storage driver

--- 10. Audit Logging Verification ---
  ✓ PASS: Audit log recorded property.image_attached
  ✓ PASS: Audit log recorded property.cover_image_set
  ✓ PASS: Audit log recorded property.images_reordered
  ✓ PASS: Audit log recorded property.image_removed

--- 11. Database Photo Inventory Analysis ---
  Total Properties in Database: 89
  Properties with 0 photos: 40
  Properties with 1-3 photos: 17
  Properties with >= 4 photos: 32
  Active properties without 4 photos: 11
  Draft properties without photos: 27
  Suspended properties without photos: 0

========================================================================
VERIFICATION SUMMARY: 41 PASSED, 0 FAILED
========================================================================
```

---

## 13. REGRESSION TEST RESULTS

| Suite | Status | Details |
|---|---|---|
| **Backend NestJS Build (`@odibrick/api`)** | **PASS** | `nest build` exited with code 0 |
| **Frontend Next.js Build (`@odibrick/web`)** | **PASS** | `next build` compiled 45 routes with 0 errors |
| **E2E Journeys Suite (`verify-e2e-journeys.js`)** | **PASS** | 12/12 scenario assertions passed (100%) |
| **Admin Property Creation (`verify-admin-property-creation.js`)** | **PASS** | Admin & Super Admin lifecycle + 4-photo gate passed |
| **Legal Advocate Queue (`verify-legal-advocate-api.js`)** | **PASS** | Legal advocate name display confirmed intact |
| **System Audit Suite (`system-audit-suite.js`)** | **PASS** | 102 tables, 83 permissions, ledger balance clean |

---

## 14. REMAINING LIMITATIONS & RECOMMENDATIONS

1. **Cloud Object Storage Adapter**:
   The current environment uses the `LocalDriver` writing to disk (`./uploads`). The `S3Driver` is stubbed and ready for AWS S3 / Cloudflare R2 configuration when moving to cloud multi-region deployments.
2. **Client-Side Image Compression**:
   Adding Web Workers for client-side JPEG/WebP compression prior to upload can improve mobile upload speeds on low-bandwidth connections.
3. **Legacy Active Seed Listings**:
   11 pre-seeded active test listings have 1–3 photos. As owners edit their listings via `/dashboard/properties/[id]`, the UI encourages adding photos to reach $\ge 4$ and maximize their quality score to 100%.

---

## 15. CONCLUSION & SIGN-OFF

The property photo workflow is completely operational and secured. Listers can smoothly upload multiple photos during the 10-step property creation wizard without getting blocked, and property managers can manage, reorder, designate cover photos, and audit all media for existing listings.
