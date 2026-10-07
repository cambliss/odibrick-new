# ODIBRICK — ROLE CAPABILITY MATRIX

**Document Version**: 1.0.0 (Authoritative Reference)  
**Date**: 2026-10-05  
**System**: Odibrick Real Estate & Tenancy Ecosystem  
**Target Roles**: `ADMIN`, `LEGAL_TEAM`, `KYC_TEAM`, `OWNER`, `TENANT`, `AGENT`, `BUILDER`  

---

## 1. Role Capability Comparison Matrix

| Functional Capability | ADMIN (`superadmin@demo.odibrick.test`) | LEGAL TEAM (`legal_team@demo.odibrick.test`) | KYC TEAM (`kyc_team@demo.odibrick.test`) | OWNER (`owner1@demo.odibrick.test`) | TENANT (`tenant1@demo.odibrick.test`) | AGENT (`agent1@demo.odibrick.test`) | BUILDER (`builder1@demo.odibrick.test`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Authentication & Profile Management** | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **User & Role Administration** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Listing Creation & Editing** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | OWN DATA ONLY | NOT AVAILABLE | OWN/REPRESENTED | OWN/PROJECT |
| **Listing Moderation & Verification** | FULL / OVERRIDE | READ ONLY | APPROVAL ONLY | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Search, Filter & Save Properties** | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **Schedule / Manage Property Visits** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | OWN PROPERTIES | OWN VISITS | ASSIGNED VISITS | PROJECT VISITS |
| **Rental Application Submission** | FULL | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | OWN DATA ONLY | NOT AVAILABLE | NOT AVAILABLE |
| **Application Review & Decision** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | OWN PROPERTIES | NOT AVAILABLE | ASSIGNED PROPS | PROJECT PROPS |
| **KYC Document Upload** | FULL | FULL | FULL | OWN DATA ONLY | OWN DATA ONLY | OWN DATA ONLY | OWN DATA ONLY |
| **KYC Review & Verification** | FULL / OVERRIDE | READ ONLY | APPROVAL ONLY | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Legal Case Creation & Assignment** | FULL / OVERRIDE | ASSIGNED CASES | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Agreement Drafting & Customization** | FULL / OVERRIDE | FULL | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Agreement Legal Approval** | FULL / OVERRIDE | APPROVAL ONLY | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Digital Agreement Signing** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | SIGN PARTY | SIGN PARTY | SIGN PARTY | SIGN PARTY |
| **Tenancy Lifecycle Management** | FULL / OVERRIDE | READ ONLY | NOT AVAILABLE | OWN LEASES | OWN LEASE | ASSIGNED LEASES| PROJECT LEASES |
| **Make Payments (Rent / Deposit / Fee)**| FULL | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | FULL (OWN DUES) | NOT AVAILABLE | NOT AVAILABLE |
| **Offline Payment Recording & Ledger** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Refunds & Financial Adjustments** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Double-Entry Financial Ledger Access**| FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Owner Payouts & Invoices** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | OWN PAYOUTS | OWN INVOICES | OWN COMMISSIONS| PROJECT PAYOUTS|
| **Commercial Rules & Commission Setup**| FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Raise Maintenance Ticket** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | OWN PROPERTIES | OWN TENANCY | ASSIGNED PROPS | PROJECT PROPS |
| **Assign / Manage Maintenance** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | OWN APPROVAL | NOT AVAILABLE | ASSIGNED PROPS | PROJECT PROPS |
| **Maintenance Financial Approval** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | OWN FINANCIALS | NOT AVAILABLE | NOT AVAILABLE | PROJECT BUDGET |
| **Move-In / Condition Report Create** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | FULL (OWN LEASE)| ASSIGNED LEASES| NOT AVAILABLE |
| **Move-In Condition Report Acknowledge**| FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | FULL (OWN LEASE)| FULL (OWN LEASE)| NOT AVAILABLE | NOT AVAILABLE |
| **Deposit Settlement & Deductions** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | PROPOSE DEDUCT | REVIEW PROPOSAL| NOT AVAILABLE | PROPOSE DEDUCT |
| **Raise Formal Dispute** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | OWN TENANCY | OWN TENANCY | NOT AVAILABLE | OWN TENANCY |
| **Dispute Investigation & Resolution** | FULL / OVERRIDE | LEGAL EVIDENCE | NOT AVAILABLE | PARTY INVOLVED | PARTY INVOLVED | NOT AVAILABLE | PARTY INVOLVED |
| **Internal & Direct Messaging** | FULL / OVERRIDE | CASE MESSAGES | NOT AVAILABLE | ACTIVE CONTACTS| ACTIVE CONTACTS| ASSIGNED LEADS | PROJECT CLIENTS|
| **Compliance & Fraud Signal Triage** | FULL / OVERRIDE | COMPLIANCE READ| NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Marketing Campaigns & Promotions** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | PURCHASE PROMO | NOT AVAILABLE | PURCHASE PROMO | PURCHASE PROMO |
| **Operations Control Tower** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Risk & Security Audits** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **Integrations & Webhook Adapters** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **System Settings & Configuration** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |

---

## 2. Module Access Matrix (31 Core System Modules)

| Module Name | ADMIN | LEGAL | KYC | OWNER | TENANT | AGENT | BUILDER |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **AUTH** | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **DASHBOARD** | ADMIN DASH | LEGAL QUEUE | KYC QUEUE | PROVIDER DASH| TENANT DASH | AGENT DASH | BUILDER DASH |
| **PROPERTIES** | FULL / MODERATE | READ ONLY | READ / MOD | OWN INVENTORY | BROWSE / SEARCH| ASSIGNED LISTS| PROJECT UNITS |
| **MARKETPLACE** | FULL | READ ONLY | READ ONLY | LIST / PROMOTE| SEARCH / SHORT | LIST / PROMOTE| LIST / PROMOTE |
| **PERSONALIZATION** | FULL | NOT AVAILABLE | NOT AVAILABLE | DASHBOARD KPIS| SAVED / ALERTS | DASHBOARD KPIS| DASHBOARD KPIS |
| **APPLICATIONS** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | DECIDE (OWN) | SUBMIT / TRACK | DECIDE (AGENT)| DECIDE (PROJ) |
| **VISITS** | FULL / ASSIGN | NOT AVAILABLE | NOT AVAILABLE | CONFIRM / HOST| BOOK / ATTEND | HOST / MANAGE | HOST / MANAGE |
| **LEGAL** | FULL / OVERRIDE | FULL WORKFLOW | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **AGREEMENTS** | FULL / OVERRIDE | DRAFT / APPROVE| NOT AVAILABLE | SIGN PARTY | SIGN PARTY | SIGN PARTY | SIGN PARTY |
| **TENANCIES** | FULL / OVERRIDE | READ / REVIEW | NOT AVAILABLE | OWN LEASES | OWN LEASE | ASSIGNED LEASES| PROJECT LEASES |
| **PAYMENTS** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | VIEW RENT IN | PAY RENT / DUES| VIEW COMMISSIONS| VIEW CASHFLOW |
| **FINANCE** | FULL LEDGER | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **MAINTENANCE** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | APPROVE QUOTES| RAISE / TRACK | COORDINATE | APPROVE QUOTES |
| **INSPECTIONS** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | ACKNOWLEDGE | CREATE / ACK | ASSIST | ACKNOWLEDGE |
| **DISPUTES** | FULL / RESOLVE | LEGAL EVIDENCE | NOT AVAILABLE | FILE / RESPOND | FILE / RESPOND | NOT AVAILABLE | FILE / RESPOND |
| **DOCUMENTS** | FULL / OVERRIDE | VERIFY / READ | VERIFY / READ | UPLOAD / VIEW | UPLOAD / VIEW | UPLOAD / VIEW | UPLOAD / VIEW |
| **KYC** | FULL / OVERRIDE | READ ONLY | FULL VERIFY | SUBMIT OWN | SUBMIT OWN | SUBMIT OWN | SUBMIT OWN |
| **COMPLIANCE** | FULL / OVERRIDE | READ ONLY | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **COMMUNICATIONS** | FULL / MONITOR | CASE THREADS | NOT AVAILABLE | TENANT / AGENT| OWNER / PM | CLIENT / OWNER| CLIENT / AGENT |
| **NOTIFICATIONS** | FULL | FULL | FULL | FULL | FULL | FULL | FULL |
| **PAYOUTS** | FULL / EXECUTE | NOT AVAILABLE | NOT AVAILABLE | RECEIVE | NOT AVAILABLE | RECEIVE COMM | RECEIVE |
| **INVOICES** | FULL / GENERATE | NOT AVAILABLE | NOT AVAILABLE | DOWNLOAD GST | DOWNLOAD RENT | DOWNLOAD GST | DOWNLOAD GST |
| **COMMERCIAL** | FULL / OVERRIDE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **AUTOMATION** | FULL / TRIGGER | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **OPERATIONS** | FULL TOWER | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **ANALYTICS** | FULL BI SUITE | NOT AVAILABLE | NOT AVAILABLE | PROPERTY STATS| NOT AVAILABLE | SALES STATS | PORTFOLIO STATS|
| **RISK** | FULL AUDIT | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **INTEGRATIONS** | FULL ENGINE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |
| **SUPPORT** | FULL DESK | CASE ASSIST | NOT AVAILABLE | RAISE TICKET | RAISE TICKET | RAISE TICKET | RAISE TICKET |
| **INSURANCE** | FULL CLAIMS | NOT AVAILABLE | NOT AVAILABLE | VIEW POLICY | VIEW POLICY | NOT AVAILABLE | VIEW POLICY |
| **ADMINISTRATION**| FULL / RBAC | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE |

---

## 3. Capability Counts by Role

| Role Code | Total Assigned Permissions | Full Capabilities | Limited / Scoped | Read-Only | Management / Override | Not Available |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **ADMIN** (`Super admin` / `Admin`) | **83 / 83 (100%)** | 36 | 0 | 0 | 36 | 0 |
| **LEGAL_TEAM** | **7** | 3 | 4 | 3 | 0 | 26 |
| **KYC_TEAM** | **4** | 2 | 2 | 2 | 0 | 27 |
| **OWNER** | **10** | 4 | 14 | 2 | 0 | 16 |
| **TENANT** | **8** | 3 | 12 | 2 | 0 | 18 |
| **AGENT** | **10** | 4 | 12 | 2 | 0 | 18 |
| **BUILDER** | **6** | 3 | 11 | 2 | 0 | 19 |

---

## 4. Top 10 Security & RBAC Enforcement Rules

1. **Strict 401 on Unauthenticated Requests**: Any request lacking a valid JWT in the `Authorization: Bearer <token>` header or authenticated HTTP-only cookie fails immediately with `401 Unauthorized`.
2. **Strict 403 on Cross-Role Privilege Escalation**: Non-admin roles (e.g., Tenant, Owner, Agent) attempting to invoke administrative endpoints (e.g., `POST /api/admin/users`, `POST /api/agreements/:id/approve`) are blocked by `@RequirePermissions` with `403 Forbidden` and zero DB mutation.
3. **Legal-Exclusive Agreement Approval**: Only users possessing `agreement.approve` (Legal Team and Admin) can move an agreement from `DRAFT` to `APPROVED_BY_LEGAL`. Agents and Tenants attempting approval receive `403 Forbidden`.
4. **KYC Verification Segregation**: Verification decisions (`kyc.review` / `kyc.verify`) are strictly restricted to the KYC Verification Desk and Admins. Owners and Tenants can only upload and read their own KYC submissions.
5. **Double-Entry Financial Ledger Isolation**: Only platform Admins with `payment.manage` can inspect platform-wide ledger journal entries, record offline adjustments, or initiate payout batches.
6. **Multi-Tenant / Ownership Scoping (IDOR Prevention)**: Owners, Tenants, Agents, and Builders can only view and mutate entities belonging to their user ID or authorized property/tenancy scope. Querying foreign IDs returns empty results or `404/403`.
7. **Condition Report Mutex Protocol**: The tenant is the sole party authorized to initiate and fill the Move-in Condition Report (`inspection.create`), while the owner is restricted to the formal acknowledgement or disagreement step (`inspection.acknowledge`).
8. **Digital Signature State Machine Immutability**: Agreement signing (`POST /api/agreements/:id/sign`) requires an explicit OTP / PIN token and is only executable when the agreement is in `APPROVED_BY_LEGAL` or `PENDING_SIGNATURES`. Once all parties sign, the agreement becomes immutable (`EXECUTED`).
9. **Dispute Evidence Privacy**: Internal operational notes and legal case discussions are filtered out of the API response returned to regular Tenant and Owner participants.
10. **Automated Audit Logging**: Every administrative action, status override, role modification, financial recording, and agreement execution logs an immutable record in the `audit_logs` table.

---

## 5. Top 10 Management Control Points

1. **User & Identity Governance**: Admin can force-activate, suspend, change roles, or reset verification status for any platform user.
2. **Property Listing Moderation**: Admin can force-publish, reject, feature, unpublish, or suspend any property listing across the marketplace.
3. **Application Override**: Admin can override rental application rejections, reassign pending reviews, or bypass owner SLA bottlenecks.
4. **Legal Case Allocation**: Admin can reassign legal drafting workflows across legal team officers and inject custom governance clauses.
5. **Agreement Execution Authority**: Admin possesses root signing and override capabilities to execute or cancel stalled digital agreements.
6. **Tenancy Force-Closure & Termination**: Admin can force-close, terminate, or hold tenancies in legal dispute scenarios.
7. **Offline Financial Reconciliations**: Admin can record external bank transfers, cash payments, or RTGS transactions to credit tenant rent ledgers.
8. **Owner Payout Execution**: Admin controls payout batches, commission deductions, and TDS withholdings before releasing funds to owners.
9. **Dispute Binding Arbitration**: Admin has final authority to close disputes, mandate deposit refunds, and execute ledger adjustments.
10. **Global System & Integration Toggles**: Admin manages third-party integration adapters (payment gateways, e-Sign, KYC OCR, SMS/WhatsApp) and automation rules.

---

## 6. Top 10 End-User Workflows

1. **Marketplace Discovery & Saved Property Alert**: Public/Tenant searches properties $\rightarrow$ applies filters $\rightarrow$ saves listings $\rightarrow$ subscribes to search alerts.
2. **Physical / Guided Property Visit Booking**: Tenant requests visit slot $\rightarrow$ Owner/Agent confirms $\rightarrow$ Visit completed $\rightarrow$ Feedback submitted.
3. **Digital Rental Application**: Tenant submits rental application $\rightarrow$ Owner/Agent reviews profile $\rightarrow$ Owner accepts application $\rightarrow$ System triggers KYC and Legal workflow.
4. **Identity & KYC Document Verification**: Tenant/Owner uploads Aadhaar/PAN $\rightarrow$ KYC Desk verifies authenticity $\rightarrow$ User verification badge issued.
5. **Bespoke Agreement Drafting & Legal Approval**: Legal Team drafts standard/custom rental contract $\rightarrow$ Legal Officer approves draft $\rightarrow$ Agreement published for digital signing.
6. **Bilateral Digital Signing**: Tenant signs agreement via OTP $\rightarrow$ Owner countersigns agreement $\rightarrow$ Stamping verified $\rightarrow$ Agreement executed $\rightarrow$ Active Tenancy spawned.
7. **Move-in Digital Condition Inspection**: Tenant enters property $\rightarrow$ documents room conditions with photo evidence $\rightarrow$ submits report $\rightarrow$ Owner acknowledges report.
8. **Recurring Rent Payment & Automated Invoicing**: System sends rent reminder $\rightarrow$ Tenant pays via Gateway/UPI $\rightarrow$ Double-entry ledger records credit/debit $\rightarrow$ Automated GST invoice generated $\rightarrow$ Owner payout queued.
9. **Maintenance Request & Vendor Coordination**: Tenant logs plumbing issue with images $\rightarrow$ Owner approves estimated budget $\rightarrow$ Vendor assigned $\rightarrow$ Work completed $\rightarrow$ Tenant verifies resolution.
10. **Move-out & Deposit Settlement**: Tenancy end scheduled $\rightarrow$ Exit inspection performed $\rightarrow$ Owner proposes deductions $\rightarrow$ Tenant agrees/disputes $\rightarrow$ Net deposit refunded $\rightarrow$ Tenancy closed.
