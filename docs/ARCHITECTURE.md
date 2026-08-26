# Architecture

## The shape of the system

```
                    ┌──────────────────────────────────┐
   Browser  ──TLS──▶│  Nginx  (the only public port)   │
                    │  /api/* → :4000   /* → :3000     │
                    └───────┬─────────────────┬────────┘
                            │                 │
                  ┌─────────▼──────┐   ┌──────▼─────────┐
                  │  NestJS API    │   │  Next.js web   │
                  │  127.0.0.1:4000│◀──│  127.0.0.1:3000│
                  └─────────┬──────┘   └────────────────┘
                            │                 (SSR fetches over loopback,
                  ┌─────────▼──────┐           forwarding the user's cookie)
                  │   MySQL 8      │
                  └────────────────┘
```

Both application processes bind to loopback. Nothing but Nginx listens on a public
interface. Because the API and the web app share an origin, the session cookie is
first-party and no CORS preflight happens in the browser.

## Why these choices

**No Docker.** The specification called for a plain Linux VPS. PM2 or systemd
supervise two Node processes; Nginx terminates TLS. This is fewer moving parts than a
container runtime on a single box, and it makes the deploy script legible.

**No ORM.** Data access goes through a thin `DatabaseService` wrapping
`mysql2/promise` with parameterised queries and a `transaction()` helper. The SQL
migrations are therefore the single authoritative description of the schema — there
is no second model definition in TypeScript that can drift from it. The cost is that
you write your own SQL; the benefit is that what you read in `database/migrations/`
is exactly what exists in the database.

**Raw SQL, always parameterised.** Every query in the codebase passes values as
bound parameters. Where a query interpolates anything, it interpolates a
placeholder list built from an array length (`ids.map(() => '?').join(',')`), never
user input.

## Layering inside the API

```
Controller   HTTP shape only. Route, guard decorators, DTO binding.
    ↓
DTO          class-validator. Whitelisted, forbidNonWhitelisted — an unknown
             field is a 400, not a silently ignored value.
    ↓
Service      All business rules and invariants. Owns transactions.
    ↓
DatabaseService  Parameterised SQL. No business logic.
```

Cross-cutting concerns live in `src/common/`:

| Path | Responsibility |
| --- | --- |
| `common/auth/` | `JwtAuthGuard`, `RolesGuard`, `@Public`, `@Roles`, `@RequirePermissions`, `@CurrentUser` |
| `common/audit/` | `AuditService.record()` — actor, action, object, IP, metadata |
| `common/database/` | Pool, query helpers, transactions |
| `common/http/` | Exception filter that attaches a `traceId` and never leaks internals |
| `common/util/` | ULIDs, reference formatting, AES-256-GCM field encryption, pagination |

Guards run in a fixed order, declared in `app.module.ts`:

```
JwtAuthGuard  →  RolesGuard  →  ThrottlerGuard
```

Authenticate first, then authorise, then rate-limit. Reversing the first two would
leak whether a protected resource exists.

## Module map

| Module | Owns |
| --- | --- |
| `auth` | Registration, login, refresh-token rotation, password change |
| `users` | Profiles, saved properties, the dashboard next-action summary |
| `kyc` | Identity submission, review queue, decisions |
| `storage` | Private document vault, magic-number validation, signed links |
| `properties` | Search, detail, the ten-step listing lifecycle, moderation |
| `rental` | Enquiries, viewings, applications, tenancy creation |
| `legal` | Cases, clause library, drafting, approval, e-signature, consultations |
| `payments` | Ledger, checkout, webhooks, refunds, annual commissions |
| `inspections` | Condition reports, media with dual timestamps, move-out comparison |
| `operations` | Maintenance, disputes, support tickets |
| `insurance` | Partner catalogue, quotes, policy requests |
| `marketing` | Cambliss packages, orders, campaign delivery board |
| `notifications` | In-app delivery; other channels via provider abstraction |
| `admin` | KPIs, user and role management, settings, audit, fraud signals |

Modules depend on each other explicitly through Nest's DI. The notable edges:
`legal → payments` (executing an agreement raises the move-in dues),
`insurance → payments` (a policy request raises a premium payment),
`marketing → payments` (a package order raises an invoice). Everything else talks to
`DatabaseService` and `NotificationsService` only.

## Provider abstractions

Anything that will eventually be a third-party integration sits behind an interface
with a deliberately honest default:

| Concern | Interface | Default | Behaviour without a provider |
| --- | --- | --- | --- |
| Payment | `PaymentProvider` | `ManualPaymentProvider` | Issues transfer instructions; an operator confirms against the bank statement |
| Video | provider field on `legal_meetings` | `PENDING_PROVIDER` | Meeting is scheduled and both parties notified; no fabricated join link |
| KYC | provider field on `kyc_records` | `manual` | Human review queue |
| Insurance | partner desk | `manual` | Request recorded, premium `null` until the partner quotes |
| Email / SMS | notification channel | none | Recorded as `SKIPPED`, never as delivered |

Swapping in a real provider is a configuration change plus one adapter class. The
gateway adapter (`providers/gateway.provider.ts`) already implements real HMAC
signature verification; only the outbound HTTP calls are left for whoever holds the
merchant account.

## The tenancy state machine

`tenancies.stage` is the spine of the product. Transitions are made only by the
service that owns the step, never by the client.

```
LEGAL_REVIEW ──▶ CONSULTATION ──▶ AGREEMENT_DRAFT ──▶ AWAITING_SIGNATURES
                                                             │
                                                    all parties signed
                                                             ▼
CLOSED ◀── MOVE_OUT ◀── RENEWAL_DUE ◀── ACTIVE ◀── CHECK_IN_PENDING ◀── AWAITING_PAYMENT
                                          ▲                                    │
                                          └────── Day 1 report submitted ──────┘
```

Who moves what:

- `rental.decide(ACCEPT)` creates the tenancy at `LEGAL_REVIEW`, opens a legal case
  and pauses the listing — in one transaction.
- `legal.scheduleMeeting` → `CONSULTATION`. `legal.draft` → `AGREEMENT_DRAFT`.
  `legal.approve` → `AWAITING_SIGNATURES`.
- `legal.sign`, on the last signature, sets `AWAITING_PAYMENT` and calls
  `payments.raiseMoveInDues()`.
- `payments.markPaid`, once deposit and advance rent are both settled, sets
  `CHECK_IN_PENDING`.
- `inspections.submit` of the check-in report sets `ACTIVE`.

## Frontend architecture

App Router with Server Components as the default. A component becomes a Client
Component (`'use client'`) only when it needs state or an event handler — the
wizards, the filter panel, the decision buttons.

Data fetching goes through `lib/api.ts`, which has two entry points:

- `serverApi()` — used in Server Components. Calls the API over loopback and forwards
  the incoming `cookie` header, so SSR sees exactly what the user is allowed to see.
- `api()` — used in Client Components. Calls a relative `/api/...` path with
  `credentials: 'include'`.

`serverApiOrNull()` swallows 401/403 and returns `null`, which is what the header and
the property page want when a visitor is signed out.

No token ever reaches JavaScript. Access and refresh tokens are `httpOnly` cookies
(`odb_at`, `odb_rt`). There is no `localStorage` in the codebase.

### The design language

The visual system is grounded in a specific subject: Indian stamp paper and the
registrar's office. Deep ledger green (`#1F5D4C`) as the primary, a single ochre
(`#B8862B`) reserved *exclusively* for verification seals, cool paper white for
surfaces. Fraunces for display, IBM Plex Sans for body, IBM Plex Mono for anything
that is data — references, timestamps, statuses.

The signature element is **the record spine**: a vertical timestamped timeline that
appears on the homepage hero, every property page, every tenancy, and as the step
rail inside both wizards. It is the product's central claim made visible — that the
whole tenancy is written down, in order, and both parties see the same thing.

Ochre is load-bearing. If it appears on screen, something has actually been verified.
