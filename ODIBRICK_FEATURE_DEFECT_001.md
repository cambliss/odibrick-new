# ODIBRICK RUNTIME DEFECT REPORT — #001

**Defect ID**: `ODIBRICK-DEFECT-001`  
**Severity**: `P1 — Major Feature Broken`  
**Status**: `CLOSED / VERIFIED FIXED`  
**Module**: `PROVIDER / PERSONALIZATION`  
**Feature**: Provider Action Centre Overview  
**Role**: `OWNER` / `AGENT` / `BUILDER`  
**Page**: `/dashboard/provider`  
**API Endpoint**: `GET /api/provider/action-centre`  
**Discovery Date**: 2026-10-05  
**Resolution Date**: 2026-10-05  
**Resolved In**: `apps/api/src/modules/personalization/personalization.service.ts`  

---

## 1. Defect Summary
When an `OWNER`, `AGENT`, or `BUILDER` loaded their Action Centre dashboard (`/dashboard/provider`) or requested `GET /api/provider/action-centre`, the API threw an unhandled SQL column mismatch: `ER_BAD_FIELD_ERROR: Unknown column 'u.name' in 'field list'` (HTTP 500).

---

## 2. Root Cause
In `apps/api/src/modules/personalization/personalization.service.ts`, the SQL queries for pending enquiries, upcoming visits, and pending applications selected `u.name` instead of the canonical database schema column `u.full_name`.

---

## 3. Fix Applied
In `apps/api/src/modules/personalization/personalization.service.ts`:
- Line 886: `u.name AS user_name` $\rightarrow$ `u.full_name AS user_name`
- Line 1011: `u.name AS user_name` $\rightarrow$ `u.full_name AS user_name`
- Line 1034: `u.name AS visitor_name` $\rightarrow$ `u.full_name AS visitor_name`
- Line 1046: `u.name AS applicant_name` $\rightarrow$ `u.full_name AS applicant_name`

Rebuilt API workspace via `npm run build --workspace=@odibrick/api` and restarted server.

---

## 4. Verification & Regression Evidence
Executed live automated regression across all provider roles:
- `OWNER` (`owner1@demo.odibrick.test`): `HTTP 200 OK` — Returned 52 owned properties, 4 enquiries, 1 visit, 2 applications.
- `AGENT` (`agent1@demo.odibrick.test`): `HTTP 200 OK` — Returned 1 managed property, 0 pending items.
- `BUILDER` (`builder1@demo.odibrick.test`): `HTTP 200 OK` — Returned 2 managed project units, 0 pending items.
- Web UI `/dashboard/provider`: Renders clean dashboard cards without React error boundaries.

**Defect Status**: **RESOLVED & VERIFIED**.
