# Roles and permissions

Twelve roles, twenty-eight permissions. Grants live in `role_permissions` and are
seeded by `database/migrations/006_reference_data.sql`. Everything below is taken
from that file, not from intent.

A user can hold several roles; their effective permission set is the union.
`GET /api/auth/me` returns the resolved set, and the frontend navigation hides what a
user cannot reach — but the guards on the server are what actually enforce it.

---

## Roles

| Code | Name | Staff | Purpose |
| --- | --- | :---: | --- |
| `SUPER_ADMIN` | Super admin | ✓ | Full platform control |
| `ADMIN` | Admin | ✓ | Operational management |
| `LEGAL_TEAM` | Legal team | ✓ | Agreements, clauses, consultations |
| `KYC_TEAM` | Verification team | ✓ | User and property verification |
| `MARKETING_TEAM` | Cambliss marketing | ✓ | Packages and campaigns |
| `PROPERTY_MANAGER` | Property manager | ✓ | Inspections and maintenance |
| `SUPPORT_TEAM` | Support | ✓ | Tickets and escalations |
| `INSURANCE_PARTNER` | Insurance partner | ✓ | Quotes, policies, claims handoff |
| `OWNER` | Property owner | | Lists and manages own properties |
| `TENANT` | Tenant | | Searches, applies, rents |
| `AGENT` | Agent | | Property inventory and leads |
| `BUILDER` | Builder | | Projects, units and inventory |

Only the four non-staff roles can be chosen at registration. `AuthService.register()`
returns `403` for anything else, and a unit test holds that line.

## Permissions

| Code | Group | Grants |
| --- | --- | --- |
| `user.read` | user | View user records |
| `user.manage` | user | Change status, grant and revoke roles |
| `kyc.read` | kyc | See the verification queue |
| `kyc.review` | kyc | Approve or reject an identity |
| `property.create` | property | Create a listing |
| `property.update.own` | property | Edit a listing you listed |
| `property.moderate` | property | Approve, reject, record verifications |
| `property.read.private` | property | See exact addresses and private fields |
| `application.decide` | application | Accept, shortlist or decline an application |
| `legal.case.manage` | legal | Case queue, assignment, notes, meetings |
| `agreement.draft` | agreement | Draft and redraft an agreement |
| `agreement.approve` | agreement | Approve a version for signature |
| `agreement.sign` | agreement | Sign as a party |
| `payment.read` | payment | View a payment and its ledger |
| `payment.manage` | payment | Record offline payments, issue refunds |
| `commission.manage` | commission | Rules and invoicing |
| `marketing.package.manage` | marketing | Create and edit packages |
| `campaign.manage` | campaign | Run the delivery board |
| `inspection.create` | inspection | Start a condition report |
| `inspection.acknowledge` | inspection | Acknowledge or dispute one |
| `maintenance.manage` | maintenance | Manage requests across properties |
| `insurance.manage` | insurance | Confirm a policy issued by the insurer |
| `dispute.manage` | dispute | Progress a dispute, record a resolution |
| `support.manage` | support | Work the ticket queue, write internal notes |
| `document.read.any` | document | Read documents beyond your own |
| `settings.manage` | settings | Platform settings |
| `audit.read` | audit | Audit log and fraud signals |
| `analytics.read` | analytics | KPIs and reporting |

---

## The grant matrix

`SUPER_ADMIN` receives every permission via a `CROSS JOIN`. The rest:

| Permission | ADMIN | LEGAL | KYC | MKTG | PROP MGR | SUPPORT | INSURER | OWNER/AGENT/BUILDER | TENANT |
| --- | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: | :-: |
| `user.read` | ✓ | | | | | ✓ | | | |
| `user.manage` | ✓ | | | | | | | | |
| `kyc.read` | ✓ | ✓ | ✓ | | | | | | |
| `kyc.review` | ✓ | | ✓ | | | | | | |
| `property.create` | | | | | | | | ✓ | |
| `property.update.own` | | | | | | | | ✓ | |
| `property.moderate` | ✓ | | ✓ | | | | | | |
| `property.read.private` | ✓ | ✓ | ✓ | | ✓ | | | | |
| `application.decide` | | | | | | | | ✓ | |
| `legal.case.manage` | | ✓ | | | | | | | |
| `agreement.draft` | | ✓ | | | | | | | |
| `agreement.approve` | | ✓ | | | | | | | |
| `agreement.sign` | | | | | | | | ✓ | ✓ |
| `payment.read` | ✓ | | | | | ✓ | | ✓ | ✓ |
| `payment.manage` | ✓ | | | | | | | | |
| `commission.manage` | ✓ | | | | | | | | |
| `marketing.package.manage` | ✓ | | | ✓ | | | | | |
| `campaign.manage` | ✓ | | | ✓ | | | | | |
| `inspection.create` | | | | | ✓ | | | | ✓ |
| `inspection.acknowledge` | | | | | ✓ | | | ✓ | ✓ |
| `maintenance.manage` | ✓ | | | | ✓ | | | | |
| `insurance.manage` | ✓ | | | | | | ✓ | | |
| `dispute.manage` | ✓ | ✓ | | | | | | | |
| `support.manage` | ✓ | | | | | ✓ | | | |
| `document.read.any` | | ✓ | | | | | | | |
| `settings.manage` | ✓ | | | | | | | | |
| `audit.read` | ✓ | | | | | | | | |
| `analytics.read` | ✓ | | | ✓ | | | | | |

---

## What the matrix is doing

A few separations are deliberate and should survive future edits.

**`ADMIN` cannot draft or approve agreements.** Legal work belongs to
`LEGAL_TEAM`. An operations admin can see the money and the users but cannot put
words into a contract.

**`LEGAL_TEAM` holds both `agreement.draft` and `agreement.approve`, but a single
person should not.** The permissions are separate so you can split them across two
accounts, and the service refuses to approve a version other than the current one —
which means a drafter cannot slip an edit past an approval. In production, give
drafting and approval to different people.

**`KYC_TEAM` also holds `property.moderate`.** Verifying an owner's identity and
verifying their ownership documents are the same desk in practice, and separating them
would just mean two queues looking at the same PDF.

**`MARKETING_TEAM` has no access to users, payments or properties.** They can run
campaigns and read analytics. Selling visibility does not require seeing the ledger.

**`INSURANCE_PARTNER` has exactly one permission.** A partner can confirm a policy
they issued and nothing else. They cannot see users, tenancies or payments.

**`TENANT` holds `inspection.create`; owners do not.** The Day-1 report is the
tenant's protection, so the tenant is the default author. Owners and agents hold
`inspection.acknowledge` to respond to it. `PROPERTY_MANAGER` can create one for
periodic or maintenance inspections.

**`document.read.any` sits only with `LEGAL_TEAM`.** Reading someone else's documents
is a real intrusion, and every such read is written to `document_access_logs`.

**Ownership is checked separately from permission.** `property.update.own` grants the
*ability* to edit a listing; the service still compares `listed_by_user_id` against
the caller and throws `403` if they differ. Holding a permission never implies
holding a particular row.

---

## Changing grants

Grants are data. To add one, write a new migration:

```sql
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('analytics.read')
WHERE r.code = 'SUPPORT_TEAM';
```

Do not edit `006_reference_data.sql` after it has been applied — the migration runner
checksums it and will warn you. Adding a new permission means adding the row *and*
the `@RequirePermissions()` decorator that consumes it; a permission nothing checks is
worse than no permission, because it looks like a control.

Runtime role changes go through `POST /api/admin/users/:id/roles`, which requires
`user.manage`, refuses to let anyone but a super admin grant `SUPER_ADMIN`, and writes
an audit entry either way.
