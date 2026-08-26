# Odibrick

An end-to-end property rental and transaction platform. Not a listing directory — the
platform stays involved from discovery through verification, legal review, video
consultation, agreement, payment, check-in documentation, occupancy, protection,
renewal and move-out.

Built for **Cambliss Pvt. Ltd.**

```
Next.js 14 (App Router)  ·  NestJS 10  ·  MySQL 8  ·  Nginx  ·  PM2 or systemd
No Docker. No ORM. No fake success states.
```

---

## What is in this repository

```
odibrick/
├── apps/
│   ├── api/            NestJS REST API (TypeScript, modular/DDD)
│   └── web/            Next.js App Router frontend (TypeScript, Tailwind)
├── database/
│   ├── migrations/     Six ordered SQL migrations — the authoritative schema
│   ├── migrate.js      Checksum-tracking migration runner
│   └── seed/seed.js    Clearly-marked demo dataset
├── deploy/             Nginx site, PM2 ecosystem, systemd units, logrotate
├── scripts/            Server setup, deploy, backup
├── tools/              Generator for the role PDFs
└── docs/               Architecture, database, API, deployment, security, RBAC
    └── user-guides/    End-user PDFs, one per role
```

Start with [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) — it walks from an empty
machine through modifying the code to a live VPS. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
explains why things are shaped the way they are.

---

## Read this before you run anything

**The code in this repository has never been compiled or executed.** It was written
end to end without an environment to install dependencies in. The architecture is
coherent and the SQL is careful, but on your first `npm run build` you should expect
to fix a handful of TypeScript import and type errors — the ordinary residue of
writing a codebase this size without a compiler in the loop. Budget an afternoon for
it. Nothing here has been load-tested, penetration-tested or reviewed by counsel.

Treat it as a well-formed starting point, not a finished product you can point at
paying customers tomorrow.

---

## Quick start (local)

Prerequisites: Node.js 20+, MySQL 8+.

```bash
# 1. Dependencies
npm install --workspaces --include-workspace-root

# 2. Database
mysql -u root -p -e "CREATE DATABASE odibrick CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

# 3. Configuration
cp apps/api/.env.example apps/api/.env     # then fill in DB creds and secrets
cp apps/web/.env.example apps/web/.env

# 4. Schema and demo data
npm run db:migrate
npm run db:seed

# 5. Run
npm run dev          # API on :4000, web on :3000
```

Open http://localhost:3000. Every seeded account uses the password
`OdibrickDemo2026`:

| Role | Email |
| --- | --- |
| Super admin | `super_admin@demo.odibrick.test` |
| Legal team | `legal_team@demo.odibrick.test` |
| Verification | `kyc_team@demo.odibrick.test` |
| Owner | `owner1@demo.odibrick.test` |
| Tenant | `tenant1@demo.odibrick.test` |
| Agent | `agent1@demo.odibrick.test` |
| Builder | `builder1@demo.odibrick.test` |

Remove the demo data at any time with `npm run db:seed:purge`. The seeder refuses to
run against a database that already holds real accounts unless you pass `--force`.

---

## The commercial model, as implemented

- **Listings are free and unlimited** for owners, agents and builders. There is no
  per-listing fee, no inventory cap and no paywall on publishing. This is enforced
  in code, not just in copy — nothing in the property module checks a subscription.
- **Revenue comes from an annual commission** raised when a tenancy actually starts,
  and from **Cambliss marketing packages** bought separately. See
  `database/migrations/006_reference_data.sql` for the seeded commission rules
  (50% of one month's rent on the standard plan, 85% on Protected, 6% of annual rent
  on Managed) and package pricing (₹7,999 / ₹24,999 / ₹59,999 / custom).
- **Featured placement exists only while a paid campaign is LIVE.** When a campaign
  is paused or completed the flag is cleared.

---

## Design principles the code actually enforces

These are not aspirations in a style guide. Each is a check somewhere in the source.

**A badge means someone checked.** A verification seal renders only when a
`property_verifications` row exists with status `VERIFIED`. There is no "assumed
verified" state and no default-true anywhere in the component.

**No fake success.** The default payment provider is non-custodial and *cannot*
report a successful payment — it issues transfer instructions and waits for an
operator with `payment.manage` to confirm the credit against a bank reference. The
gateway adapter's signature verification is real; its order-creation call throws
`ServiceUnavailableException` rather than pretending. Email and SMS notifications
are recorded as `SKIPPED`, not as delivered.

**Nothing is signed that a human has not approved.** An agreement cannot leave
`LEGAL_REVIEW` without a holder of `agreement.approve` approving *that exact
version*, and any redraft nulls the prior approval. Signing a draft with
`approved_by IS NULL` is refused.

**AI never decides.** Draft generation records `drafted_with_ai` as a fact for the
audit trail; it never substitutes for review. Dispute status changes require
`dispute.manage` and a human actor. The move-out comparison returns a diff with an
explicit note that it is a record, not a determination of liability.

**Insurance is not conflated with platform services.** `insurance_products` carries
an `offering_type` of either `INSURANCE_POLICY` (issued by a licensed insurer, shown
with the insurer's name and IRDAI registration) or `ODIBRICK_SERVICE` (a platform
service that pays no claims). The API attaches the correct disclosure to every row.

**The exact address is private.** It is returned only to the lister, the assigned
staff and an accepted counterparty. Search results and public detail pages get
locality and city.

**Every consequential action is audited** with actor, IP, object and timestamp.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | API and web in watch mode |
| `npm run build` | Compile both apps for production |
| `npm test` | API unit tests |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:status` | Show applied vs pending migrations |
| `npm run db:seed` | Load the demo dataset |
| `npm run db:seed:purge` | Remove all demo data |

---

## Licence and attribution

Proprietary. © Cambliss Pvt. Ltd.

Odibrick coordinates verification, documentation and payment records. It is not an
insurer, a bank, a payment aggregator or a substitute for your own legal advice.
Agreements are prepared and approved by qualified legal professionals; insurance
products, where offered, are issued by licensed insurers.
