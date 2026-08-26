# Database

MySQL 8, InnoDB, `utf8mb4` / `utf8mb4_unicode_ci` throughout. 70 tables across six
ordered migrations, plus two views.

The migrations are the authoritative schema. There is no ORM model to keep in sync.

## Migrations

| File | Contents |
| --- | --- |
| `001_core_identity.sql` | Roles, permissions, users, sessions, KYC, documents, audit, notifications, settings |
| `002_property.sql` | Owners, tenants, agents, builders, projects, properties, media, amenities, verifications, timeline |
| `003_transaction_legal.sql` | Enquiries, viewings, applications, tenancies, legal cases, clauses, agreements, meetings |
| `004_finance_marketing.sql` | Payment accounts, payments, transactions, invoices, commissions, packages, campaigns |
| `005_operations.sql` | Inspections, maintenance, insurance, disputes, support, messaging, views |
| `006_reference_data.sql` | Seed reference data: roles, permissions, amenities, clauses, commission rules, packages, settings, templates |

Run them with `npm run db:migrate`. The runner records each file's SHA-256 in
`schema_migrations` and warns loudly if an already-applied file has been edited —
add a new migration instead.

## Entity relationships

### Identity and access

```
roles ──< role_permissions >── permissions
  │
  └──< user_roles >── users ──┬── user_profiles       (1:1)
                              ├──< refresh_tokens     (rotation family)
                              ├──< kyc_records
                              ├──< documents ──< document_access_logs
                              ├──< notifications
                              └──< audit_logs
```

`users` carries a ULID `public_id` — that is what appears in URLs and API responses.
The auto-increment `id` never leaves the server. `is_demo` marks seeded accounts so
the purge is surgical.

`refresh_tokens` stores a hash, never the token, plus a `family_id`. Presenting a
token that has already been rotated revokes the entire family — the standard
detection for a stolen refresh token.

### Property

```
users ──┬──< owners
        ├──< tenants
        ├──< agents ──────────┐
        └──< builders ──< builder_projects
                               │
                        properties ──┬──< property_units
                                     ├──< property_images
                                     ├──< property_videos
                                     ├──< property_amenities >── amenities
                                     ├──< property_verifications
                                     ├──< property_timeline
                                     ├──< property_views
                                     └──< saved_properties
```

`properties` is the widest table in the schema and carries a `FULLTEXT` index on
title/description plus composite indexes on the real search paths
(`city, locality, listing_type, status`; `rent_amount`; `bedrooms`). `slug` is unique
and holds the SEO path — `india/hyderabad/gachibowli/2bhk-apartment-01hxyz`.

**`property_verifications` is the whole trust model.** A badge on the site is a row
in this table with `status = 'VERIFIED'`. There is no boolean `is_verified` column on
`properties` that could be set optimistically, and no default that renders a seal.

### Transaction and legal

```
properties ──< enquiries
           ──< viewings
           ──< applications ──▶ tenancies ──┬──< legal_cases ──┬──< legal_notes
                                            │                  └──< agreements
                                            │                        ├──< agreement_versions
                                            │                        ├──< agreement_clauses
                                            │                        └──< agreement_signatories
                                            ├──< legal_meetings ──< meeting_participants
                                            ├──< payments
                                            ├──< commissions
                                            ├──< inspections
                                            ├──< maintenance_requests
                                            └──< disputes
```

`agreements.current_version` points into `agreement_versions`. `approved_by` and
`approved_at` are nulled on every redraft, so an approval can never be inherited by
text nobody reviewed. `agreement_versions.drafted_with_ai` records whether a
generation aid was used — a fact for the audit trail, not a licence to skip review.

`clause_library` holds reviewed, versioned, jurisdiction-tagged clause templates with
`{{variable}}` placeholders. Drafting fills them from the tenancy's real numbers.

### Finance

```
payments ──< payment_transactions        (immutable ledger, idempotency_key unique)
         ──< invoices ──< invoice_lines
commission_rules ──< commissions ──▶ payments
marketing_packages ──< marketing_orders ──< campaigns ──┬──< campaign_properties
                                                        └──< campaign_leads
```

`payments` is the *intent* — what is owed, by whom, when. `payment_transactions` is
the *ledger* — append-only attempts, each with a provider reference and an
`idempotency_key` that is unique, so a replayed webhook cannot double-credit.

A payment reaches `PAID` only via `markPaid()`, which is called from a verified
provider callback or from an operator action that supplied a bank reference and is
audited.

`commissions` implements the annual model: one row per tenancy year with
`cycle_year`, `period_start`, `period_end` and a unique key preventing duplicates.

### Operations

```
inspections ──┬──< inspection_items ──< inspection_media
              └── compared_with_id ──▶ inspections   (move-out → check-in)
maintenance_requests ──< maintenance_updates
insurance_partners ──< insurance_products ──< insurance_quotes ──< insurance_policies
disputes ──< dispute_evidence
support_tickets ──< ticket_messages
conversations ──< conversation_participants
              ──< messages
```

`inspection_media` carries **two** timestamps: `captured_at` (what the device
claimed) and `received_at` (server clock, `DEFAULT CURRENT_TIMESTAMP`). Only the
second is trustworthy, and the UI shows both. That distinction is the difference
between a record and a claim.

`insurance_products.offering_type` is the load-bearing column of the protection
module: `INSURANCE_POLICY` versus `ODIBRICK_SERVICE`. Nothing in the codebase blurs
them.

## Views

| View | Purpose |
| --- | --- |
| `v_property_cards` | Denormalised search-result row: cover image, verified check count, amenity list |
| `v_admin_kpis` | Single-row platform counters for the control centre |

## Conventions

- **Primary keys** — `BIGINT UNSIGNED AUTO_INCREMENT`, internal only.
- **Public identifiers** — ULID in a `public_id` column on every user-facing entity.
- **Human references** — `ODB-XXX-YYYY-NNNNNN` (`ODB-PAY-2026-000412`,
  `ODB-AGR-2026-000001`). Quotable on a phone call.
- **Money** — `DECIMAL(14,2)`, never a float. Currency stored alongside.
- **Timestamps** — `DATETIME`, UTC. `created_at` / `updated_at` on every table.
- **Soft deletes** — `deleted_at` where history matters; every query filters it.
- **Enums** — MySQL `ENUM` for closed, stable sets; changing one is a migration, which
  is the right amount of friction.
- **Foreign keys** — declared with deliberate `ON DELETE` semantics. `RESTRICT` on
  anything financial or legal: you cannot delete a user out from under an executed
  agreement.

## Encryption at rest, at the field level

`kyc_records.id_reference` holds an AES-256-GCM ciphertext produced by
`common/util/crypto.ts` using `ENCRYPTION_KEY` from the environment. The plaintext ID
number is never returned by any endpoint. `id_last4` is stored separately and is the
only fragment ever displayed.

Losing `ENCRYPTION_KEY` means losing those values permanently. Back it up somewhere
that is not the server.

## Indexing notes

Composite indexes were chosen from the actual query shapes in
`properties.service.ts`, not sprinkled across every column:

- `idx_search (city, locality, listing_type, status, deleted_at)` — the main filter
- `idx_rent (listing_type, rent_amount)` — the price band
- `FULLTEXT ft_property (title, description, locality)` — keyword search
- `idx_geo (latitude, longitude)` — bounding-box queries
- `uniq_slug (slug)` — the SEO path

Before adding more, run `EXPLAIN` against the query you actually care about. An index
that is never used still costs you on every write.

## Seed data

`database/seed/seed.js` builds a realistic but obviously synthetic dataset: 7 staff,
10 owners, 20 tenants, 5 agents, 3 builders with projects, 30 properties across
Hyderabad, Bengaluru and Pune, 40 enquiries, 12 applications, three marketing
campaigns, maintenance and support tickets — and one tenancy carried the entire way
through legal case, approved agreement, both signatures, settled payments, an
invoiced commission and an acknowledged eight-item Day-1 condition report.

Every row it writes carries `is_demo = 1` or a `@demo.odibrick.test` address, so
`--purge` removes all of it and nothing else. The seeder refuses to run against a
database holding real accounts unless you pass `--force`.
