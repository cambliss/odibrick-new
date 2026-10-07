# ODIBRICK RUNTIME DEFECT REPORT — DEFECT #001

## 1. Error Summary
- **Endpoint**: `GET /api/customer/overview`
- **Frontend Page**: `http://localhost:3000/dashboard` (rendered error fallback: *"Something went wrong — We could not load this page"*)
- **Exception**:
  ```text
  [Nest] Unknown column 'p.cover_image_url' in 'field list'
  Stack trace:
    DatabaseService.query
    → PersonalizationService.getSavedProperties (apps/api/src/modules/personalization/personalization.service.ts:156)
    → PersonalizationService.getCustomerOverview (apps/api/src/modules/personalization/personalization.service.ts:936)
    → GET /api/customer/overview
  ```

---

## 2. Root Cause Analysis
During Phase 19 development, `PersonalizationService` queries (`getSavedProperties`, `getRecentlyViewed`, and `getRecommendations`) directly referenced `p.cover_image_url` on the `properties` table. 

However, in Odibrick's canonical schema, the `properties` table does not contain a `cover_image_url` column. Instead, property media and cover images are normalized into a dedicated `property_images` table with columns `storage_key`, `is_cover`, `sort_order`, and `property_id`. When `GET /api/customer/overview` queried the database at runtime, MySQL threw an `ER_BAD_FIELD_ERROR` (1054).

---

## 3. Canonical Schema Field & Table
- **Canonical Table**: `property_images`
- **Canonical Columns**: `storage_key`, `is_cover`, `sort_order`, `property_id`
- **Canonical Subquery Pattern**:
  ```sql
  (SELECT pimg.storage_key 
     FROM property_images pimg 
    WHERE pimg.property_id = p.id 
    ORDER BY pimg.is_cover DESC, pimg.sort_order ASC 
    LIMIT 1) AS cover_key
  ```
- **Application Field Mapping**:
  ```typescript
  coverKey: r.cover_key,
  coverImageUrl: r.cover_key ? `/api/storage/${r.cover_key}` : null
  ```
  This preserves the exact response contract expected by frontend UI components.

---

## 4. Why the Previous Audit Did Not Catch It
The Phase 19 verification test suite (`scripts/verify-personalization.js`) tested table presence, preference insertions/updates, interaction tracking, and deterministic matching using direct parameterized unit fixtures and raw helper scripts without calling the composite aggregator method `PersonalizationService.getCustomerOverview()` or running the complete `SELECT` query with `p.cover_image_url`. The query was first invoked during live browser smoke testing of the `/dashboard` route.

---

## 5. Files Changed
- [personalization.service.ts](file:///c:/Users/Cambliss/Downloads/odibrick/apps/api/src/modules/personalization/personalization.service.ts):
  - Updated `getSavedProperties` (lines 156–196) to query `cover_key` from `property_images` and populate `coverImageUrl`.
  - Updated `getRecentlyViewed` (lines 504–547) to query `cover_key` from `property_images` and populate `coverImageUrl`.
  - Updated `getRecommendations` (lines 709–755) to query `cover_key` from `property_images` and populate `coverImageUrl`.

---

## 6. Database / Migration Changes
- **Database Schema Changes**: **NO** (No migrations added, no redundant columns created). The database schema already matches canonical architecture.

---

## 7. Tests Executed & Verification
1. **Repository Search**: Verified zero occurrences of stale `p.cover_image_url` or `cover_image_url` remain across the entire codebase.
2. **API Build**: `npm run build --workspace=@odibrick/api` → Succeeded with 0 errors.
3. **Web Build**: `npm run build --workspace=@odibrick/web` → Succeeded with 0 errors.
4. **Live Database Query Execution**: Executed raw SQL queries across live database for customer overview components (`saved_properties`, `property_interactions`, `properties`). All queries executed with 0 errors.
5. **Phase 19 Verification Suite**: `node scripts/verify-personalization.js` → **26/26 assertions passed (100%)**.
6. **Full System Audit Suite**: `node scripts/system-audit-suite.js` → **All modules, tables, RBAC, ledgers, and queries passed**.
7. **End-to-End Business Journeys**: `node scripts/verify-e2e-journeys.js` → **12/12 assertions passed (100%)**.

---

## 8. Before / After Result
- **Before**: 
  - `GET /api/customer/overview` → `500 Internal Server Error` (`Unknown column 'p.cover_image_url' in 'field list'`).
  - `http://localhost:3000/dashboard` → Error fallback *"Something went wrong — We could not load this page"*.
- **After**:
  - `GET /api/customer/overview` → `200 OK` with JSON payload containing saved properties, recently viewed, recommendations, saved searches, and counters.
  - `http://localhost:3000/dashboard` → Loads cleanly, displaying saved property cards, thumbnails, recommendation feeds, and stats.

---

## 9. Remaining Related Risks
- **None**: All property image lookups now strictly adhere to the normalized `property_images` table pattern used throughout Odibrick core services.
