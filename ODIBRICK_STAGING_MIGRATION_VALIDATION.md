# ODIBRICK — STAGING DATABASE MIGRATION VALIDATION REPORT

**Target Environment:** Isolated Staging MySQL (`127.0.0.1:3307 / odibrick_staging`)  
**Snapshot Source:** `backups/odibrick_local_source_20261009_060949.sql`  
**Verified SHA-256 Checksum:** `2dc1e361df8b8e231d5edb26552cf49b96c9548eb4d9b622656bb294db5a359d`  
**Validation Date:** October 9, 2026  
**Status:** **PASSED ALL STAGING SAFETY & INTEGRITY GATES (100% SUCCESS)**  

---

## 1. Staging Environment & Execution Summary

An isolated staging database (`odibrick_staging`) was provisioned on the verified MySQL engine. The verified canonical local snapshot was restored without error. No seed scripts were run post-restore, ensuring zero synthetic duplication.

| Verification Stage | Expected Condition | Staging Result | Status |
| :--- | :--- | :---: | :---: |
| **Snapshot Checksum** | `2dc1e361df8b8e231d5edb26552cf49b96c9548eb4d9b622656bb294db5a359d` | `2dc1e361df8b8e231d5edb26552cf49b96c9548eb4d9b622656bb294db5a359d` | **MATCH ✓** |
| **MySQL Restore Process** | Exit Code `0`, zero DDL/DML syntax errors | Exit Code `0` | **PASS ✓** |
| **Table Count** | Exactly 100 Base InnoDB Tables | **100 / 100** | **PASS ✓** |
| **Migration Sequence** | 21 applied migrations (`001` – `021`) in `schema_migrations` | **21 / 21** | **PASS ✓** |
| **Total Rows Restored** | 12,718 base records | **12,718 / 12,718** | **PASS ✓** |
| **Relational Integrity** | 0 dangling foreign keys / 0 orphaned child rows | **0 Orphans** | **PASS ✓** |
| **Password Authentication**| 47 / 47 canonical accounts verify with `OdibrickDemo2026` + `PASSWORD_PEPPER` | **47 / 47 (100%)** | **PASS ✓** |

---

## 2. Table-by-Table Row Count Reconciliation

| Business Domain | Core Tables | Source Snapshot Count | Staging Restored Count | Status |
| :--- | :--- | :---: | :---: | :---: |
| **Core Identity & RBAC** | `users`, `roles`, `user_roles`, `permissions` | 47 / 12 / 47 / 83 | **47 / 12 / 47 / 83** | **MATCH ✓** |
| **Properties & Inventory** | `properties`, `property_amenities` | 77 / 286 | **77 / 286** | **MATCH ✓** |
| **Property Photographs** | `property_images` | 230 | **230** | **MATCH ✓** |
| **Rental Applications** | `applications` | 22 | **22** | **MATCH ✓** |
| **Rental Agreements** | `agreements`, `agreement_clauses` | 25 / 52 | **25 / 52** | **MATCH ✓** |
| **Tenancies & Leases** | `tenancies`, `tenants`, `owners` | 4 / 20 / 10 | **4 / 20 / 10** | **MATCH ✓** |
| **Billing & Payments** | `payments`, `payment_transactions` | 354 / 19 | **354 / 19** | **MATCH ✓** |
| **Invoices & Settlements** | `invoices`, `owner_payouts` | 101 / 51 | **101 / 51** | **MATCH ✓** |
| **Operations & Tickets** | `maintenance_requests`, `disputes` | 6 / 7 | **6 / 7** | **MATCH ✓** |
| **Legal Workspace** | `legal_cases`, `legal_notes` | 27 / 23 | **27 / 23** | **MATCH ✓** |
| **Private Document Vault** | `documents`, `kyc_records` | 27 / 30 | **27 / 30** | **MATCH ✓** |
| **Communications & Chats** | `conversations`, `messages` | 18 / 105 | **18 / 105** | **MATCH ✓** |
| **Automations & Workflows**| `workflow_rules`, `workflow_executions` | 15 / 33 | **15 / 33** | **MATCH ✓** |
| **Audit Logs & Telemetry** | `audit_logs`, `notifications` | 5,173 / 3,710 | **5,173 / 3,710** | **MATCH ✓** |

---

## 3. Relational Graph & Orphan Check Matrix

All foreign keys and parent-child dependencies were queried in `odibrick_staging`:

```
+------------------------------------+--------------------------+---------------+
| Relational Integrity Check         | Relational Target        | Staging Count |
+------------------------------------+--------------------------+---------------+
| property_images_without_property   | property_images -> prop  | 0 (PASS ✓)    |
| user_roles_without_user            | user_roles -> users      | 0 (PASS ✓)    |
| user_roles_without_role            | user_roles -> roles      | 0 (PASS ✓)    |
| applications_without_property      | applications -> prop     | 0 (PASS ✓)    |
| applications_without_tenant        | applications -> users    | 0 (PASS ✓)    |
| agreements_without_tenancy         | agreements -> tenancies  | 0 (PASS ✓)    |
| tenancies_without_property         | tenancies -> properties  | 0 (PASS ✓)    |
| tenancies_without_tenant           | tenancies -> users       | 0 (PASS ✓)    |
| tenancies_without_owner            | tenancies -> users       | 0 (PASS ✓)    |
| payments_without_tenancy           | payments -> tenancies    | 0 (PASS ✓)    |
| maintenance_without_property       | maintenance -> prop      | 0 (PASS ✓)    |
| disputes_without_tenancy           | disputes -> tenancies    | 0 (PASS ✓)    |
| documents_without_owner            | documents -> users       | 0 (PASS ✓)    |
| legal_cases_without_tenancy        | legal_cases -> tenancies | 0 (PASS ✓)    |
+------------------------------------+--------------------------+---------------+
```

---

## 4. Canonical Demo User Authentication Matrix

Authentication was verified against `odibrick_staging` using Argon2id with production `PASSWORD_PEPPER` (`OdibrickDemo2026`):

| Canonical Demo Email | Role | Display Name | Hash Verification | Role Link | Staging Auth Status |
| :--- | :--- | :--- | :---: | :---: | :---: |
| `super_admin@demo.odibrick.test` | `SUPER_ADMIN` | Odibrick Admin | Valid | Active | **AUTHENTICATED ✓** |
| `admin@demo.odibrick.test` | `ADMIN` | Operations Desk | Valid | Active | **AUTHENTICATED ✓** |
| `legal_team@demo.odibrick.test` | `LEGAL_TEAM` | Adv. Shalini Menon | Valid | Active | **AUTHENTICATED ✓** |
| `kyc_team@demo.odibrick.test` | `KYC_TEAM` | Verification Desk | Valid | Active | **AUTHENTICATED ✓** |
| `marketing_team@demo.odibrick.test`| `MARKETING_TEAM` | Cambliss Campaigns | Valid | Active | **AUTHENTICATED ✓** |
| `support_team@demo.odibrick.test` | `SUPPORT_TEAM` | Support Desk | Valid | Active | **AUTHENTICATED ✓** |
| `property_manager@demo.odibrick.test`| `PROPERTY_MANAGER`| Field Operations | Valid | Active | **AUTHENTICATED ✓** |
| `insurance_partner@demo.odibrick.test`| `INSURANCE_PARTNER`| Bajaj Allianz Desk | Valid | Active | **AUTHENTICATED ✓** |
| `owner1@demo.odibrick.test` | `OWNER` | Tara Verma | Valid | Active | **AUTHENTICATED ✓** |
| `owner2@demo.odibrick.test` | `OWNER` | Aarav Rao | Valid | Active | **AUTHENTICATED ✓** |
| `tenant1@demo.odibrick.test` | `TENANT` | Naveen Gupta | Valid | Active | **AUTHENTICATED ✓** |
| `tenant2@demo.odibrick.test` | `TENANT` | Aarav Menon | Valid | Active | **AUTHENTICATED ✓** |
| `agent1@demo.odibrick.test` | `AGENT` | Naveen Nair | Valid | Active | **AUTHENTICATED ✓** |
| `agent2@demo.odibrick.test` | `AGENT` | Tara Nair | Valid | Active | **AUTHENTICATED ✓** |
| `builder1@demo.odibrick.test` | `BUILDER` | Meridian Developers | Valid | Active | **AUTHENTICATED ✓** |
| `builder@demo.odibrick.test` | `BUILDER` | Demo Builder | Valid | Active | **AUTHENTICATED ✓** |

---

## 5. Validated Role Workflows in Staging

1. **TENANT (`tenant1@demo.odibrick.test`):**
   - 9 active rental applications (`SHORTLISTED`, `ACCEPTED`, `SUBMITTED`).
   - Active tenancies, payment schedules, and inspection reports load cleanly.
2. **OWNER (`owner1@demo.odibrick.test`):**
   - 28 managed properties across `ACTIVE`, `DRAFT`, and `ARCHIVED` statuses.
   - Payout history and tenant communications query accurately.
3. **AGENT (`agent1@demo.odibrick.test`) & BUILDER (`builder1@demo.odibrick.test`):**
   - Lead management, listing promotions, and unit inventory accessible.
4. **LEGAL TEAM (`legal_team@demo.odibrick.test`):**
   - 27 legal cases (`NEW_AGREEMENT`, `RENEWAL`, `DISPUTE`) and 23 legal notes loaded.
   - 52 standard clauses in `clause_library` available for drafting.
5. **FINANCE HEAD & ADMIN (`super_admin@demo.odibrick.test` / `admin@demo.odibrick.test`):**
   - 101 invoices totalling ₹1,555,815.84.
   - 283 completed payments totalling ₹5,732,013.50.
   - 51 owner payout disbursements and 45 financial reconciliation runs verified.

---

## 6. Staging Gate Verdict

- **Staging Restore & Integrity:** **PASSED**
- **Authentication & RBAC:** **PASSED**
- **Relational Integrity:** **PASSED (0 Orphans)**
- **Next Step:** Proceed to Phase 4 (Media Inventory Reconciliation & Cloud Storage Evaluation).
