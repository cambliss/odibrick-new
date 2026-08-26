# API reference

Base path `/api`. JSON in, JSON out. Authentication is a `httpOnly` cookie set at
login; there is no bearer-token flow for browser clients.

## Conventions

**Authentication.** `POST /api/auth/login` sets `odb_at` (access, short-lived) and
`odb_rt` (refresh, rotating). Every route is protected by default —
`JwtAuthGuard` is global, and a route opts out only with `@Public()`.

**Authorisation.** `@Roles(...)` checks role codes; `@RequirePermissions(...)` checks
granted permissions. Permissions are the finer instrument and are preferred for
anything consequential. See [`RBAC.md`](RBAC.md).

**Validation.** DTOs run through `class-validator` with `whitelist` and
`forbidNonWhitelisted`. An unrecognised field is a `400`, not a silent drop.

**Pagination.** List endpoints accept `page` and `perPage` and return:

```json
{
  "data": [],
  "meta": { "page": 1, "perPage": 24, "total": 0, "totalPages": 1 }
}
```

**Errors.** Uniform shape, with a `traceId` you can grep the server logs for. Internal
detail is never included.

```json
{
  "statusCode": 403,
  "code": "FORBIDDEN",
  "message": "This agreement belongs to other parties.",
  "traceId": "01HXYZ...",
  "path": "/api/agreements/12"
}
```

**Rate limiting.** 120 requests per minute per IP globally, with Nginx applying a
tighter bucket to `/api/auth/*`.

---

## Auth — `/api/auth`

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/register` | public | Self-registration is limited to `TENANT`, `OWNER`, `AGENT`, `BUILDER`. Requesting a staff role returns `403`. |
| POST | `/login` | public | One error message for unknown email and wrong password alike. |
| POST | `/refresh` | public | Rotates the token. Replaying a spent token revokes the whole family. |
| POST | `/logout` | public | Revokes the current token and clears cookies. |
| GET | `/me` | any | Identity, roles and resolved permissions. |
| POST | `/password` | any | Requires the current password. Revokes other sessions. |

## Users

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/me/profile` | any |
| PATCH | `/api/me/profile` | any |
| GET | `/api/me/summary` | any — the dashboard next-action task list |
| GET | `/api/me/saved` | any |
| POST | `/api/me/saved/:propertyId` | any — toggles |
| GET | `/api/profiles/:publicId` | public — no contact details, ever |

## KYC — `/api/kyc`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/me` | any |
| POST | `/` | any — ID number encrypted on write |
| GET | `/queue` | `kyc.read` |
| POST | `/:id/decision` | `kyc.review` |

## Storage

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/uploads` | any | Returns `{ storageKey, sizeBytes, checksum }`. Magic-number validated. |
| POST | `/api/documents` | any | Registers a vault document and returns `{ id, publicId, storageKey }`. |
| GET | `/api/documents` | any | Own documents; `document.read.any` widens it. |
| GET | `/api/documents/:id/link` | any | Short-lived HMAC-signed URL. |
| GET | `/api/documents/:id/download` | signed | Signature-authenticated; every open is logged. |

`storage_key` is an internal path. It is never a public URL and is not guessable
from the response.

## Properties — `/api/properties`

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/` | public | Search. Filters: `city`, `locality`, `listingType`, `propertyType`, `minRent`, `maxRent`, `minBedrooms`, `furnishing`, `amenities[]`, `verifiedOnly`, `protectedOnly`, `availableNow`, `petsAllowed`, `parking`, `listedBy`, `bbox`, `q`, `sort`. |
| GET | `/facets` | public | Counts for the filter panel. |
| GET | `/sitemap` | public | Slugs of `ACTIVE` listings only. |
| GET | `/mine` | `OWNER`/`AGENT`/`BUILDER` | Own inventory with lead counters. |
| GET | `/mine/:id` | owner | Full record for editing. |
| GET | `/moderation-queue` | `property.moderate` | |
| GET | `/:identifier` | public | Slug or `public_id`. **Exact address is omitted** unless the caller is the lister, assigned staff or an accepted counterparty. |
| POST | `/` | `property.create` | Creates a `DRAFT`. |
| PATCH | `/:id` | owner | |
| POST | `/:id/submit` | owner | Re-checks completeness server-side. |
| POST | `/:id/duplicate` | owner | For similar units. |
| DELETE | `/:id` | owner | Soft archive. |
| POST | `/:id/moderate` | `property.moderate` | `APPROVE` or `REJECT`; rejection requires a reason. |
| POST | `/:id/verifications` | `property.moderate` | Writes the row a badge depends on. |
| POST | `/:id/images` | owner | |
| DELETE | `/:id/images/:imageId` | owner | |

## Rental

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| POST | `/api/enquiries` | any | |
| GET | `/api/enquiries/received` | lister | |
| PATCH | `/api/enquiries/:id` | lister | |
| POST | `/api/viewings` | any | |
| PATCH | `/api/viewings/:id` | party | |
| POST | `/api/applications` | `TENANT` | Requires verified KYC. |
| GET | `/api/applications/mine` | tenant | |
| GET | `/api/applications/received` | lister | |
| POST | `/api/applications/:id/decision` | lister | `ACCEPT` \| `REJECT` \| `SHORTLIST`. |
| GET | `/api/tenancies` | party | |
| GET | `/api/tenancies/:id` | party | Includes `nextAction`. |

`ACCEPT` is transactional: it creates the tenancy, opens a legal case and pauses the
listing, or does none of those things.

## Legal

| Method | Path | Access |
| --- | --- | --- |
| GET | `/api/legal/cases` | `legal.case.manage` |
| GET | `/api/legal/cases/:id` | staff or party |
| POST | `/api/legal/cases/:id/assign` | `legal.case.manage` |
| POST | `/api/legal/cases/:id/notes` | `legal.case.manage` |
| GET | `/api/legal/clauses` | `agreement.draft` |
| POST | `/api/legal/cases/:id/draft` | `agreement.draft` |
| GET | `/api/agreements/:id` | party or `legal.case.manage` |
| POST | `/api/agreements/:id/approve` | `agreement.approve` |
| POST | `/api/agreements/:id/sign` | signatory |
| POST | `/api/legal/meetings` | `legal.case.manage` |
| GET | `/api/legal/meetings/mine` | any |
| POST | `/api/legal/meetings/:id/complete` | `legal.case.manage` |

Two rules are enforced in the service, not the UI:

- `approve` requires the `version` in the body to equal `current_version`. If the
  draft changed while the reviewer had it open, the approval is refused.
- `sign` refuses when `approved_by IS NULL`. Redrafting nulls the approval, so a
  post-approval edit cannot be signed.

`GET /agreements/:id` returns a `legalStatus` string that states plainly whether the
document is in force.

## Payments

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| GET | `/api/payments` | party | `role=PAYER\|PAYEE\|ALL`, `status`. |
| GET | `/api/payments/:id` | party or `payment.read` | Payment plus its transaction ledger. |
| POST | `/api/payments/:id/checkout` | payer | Returns provider payload or transfer instructions. |
| POST | `/api/payments/callback` | public | Provider webhook. Authenticity comes from the HMAC signature, verified inside the adapter. Duplicate `provider_txn_id` is a no-op. |
| POST | `/api/payments/:id/record` | `payment.manage` | Operator confirmation of an off-platform credit. **Requires a bank reference.** Audited. |
| POST | `/api/payments/:id/refund` | `payment.manage` | |
| GET | `/api/commissions` | `commission.manage` | |
| POST | `/api/commissions/:id/invoice` | `commission.manage` | |

## Inspections — `/api/inspections`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/checklist` | public |
| GET | `/?tenancyId=` | party |
| POST | `/` | party — opens or resumes a draft |
| GET | `/:id` | party; includes the move-out comparison |
| PUT | `/:id/items` | author, draft only |
| POST | `/:id/media` | author, draft only |
| POST | `/:id/submit` | author |
| POST | `/:id/acknowledge` | counterparty |

Submission requires at least five items and five photographs. A submitted report is
immutable — that is the point of it. `acknowledge` takes `ACKNOWLEDGE` or `DISPUTE`;
the latter sets `DISPUTED` rather than silently overwriting the record.

## Operations

| Method | Path | Access |
| --- | --- | --- |
| POST/GET | `/api/maintenance` | party |
| GET/PATCH | `/api/maintenance/:id` | party or `maintenance.manage` |
| POST/GET | `/api/disputes` | party |
| GET | `/api/disputes/:id` | party or `dispute.manage` |
| POST | `/api/disputes/:id/evidence` | party |
| PATCH | `/api/disputes/:id` | `dispute.manage` only |
| POST/GET | `/api/support/tickets` | any |
| GET | `/api/support/tickets/:id` | owner or `support.manage` |
| POST | `/api/support/tickets/:id/messages` | owner or `support.manage` |

Internal ticket notes are filtered out of the response for non-staff.

## Insurance — `/api/insurance`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/products` | public — each row carries its own disclosure text |
| POST | `/quotes` | any |
| POST | `/quotes/:id/accept` | any — raises a premium payment, cover **not** in force |
| GET | `/policies` | any |
| POST | `/policies/:id/confirm` | `insurance.manage` — requires the insurer's policy number |

A policy becomes `ACTIVE` only through `confirm`, which only a partner or admin can
call. Nothing in the platform issues cover.

## Marketing — `/api/marketing`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/packages` | public |
| POST/PATCH | `/packages[/:id]` | `marketing.package.manage` |
| POST | `/orders` | `OWNER`/`AGENT`/`BUILDER` |
| GET | `/orders/mine` | buyer |
| GET | `/campaigns` | `campaign.manage` |
| GET | `/campaigns/:id` | buyer or `campaign.manage` |
| PATCH | `/campaigns/:id` | `campaign.manage` |

A campaign cannot be set `LIVE` unless its order is `PAID`. Going live sets
`is_featured` on the linked properties; pausing or completing clears it.

## Notifications — `/api/notifications`

| Method | Path |
| --- | --- |
| GET | `/` |
| GET | `/unread-count` |
| PATCH | `/read` |

## Admin — `/api/admin`

| Method | Path | Access |
| --- | --- | --- |
| GET | `/kpis` | `analytics.read` |
| GET | `/users` | `user.read` |
| PATCH | `/users/:id/status` | `user.manage` — cannot change your own |
| POST | `/users/:id/roles` | `user.manage` — only a super admin grants `SUPER_ADMIN` |
| GET/PATCH | `/settings[/:key]` | `settings.manage` |
| GET/POST | `/commission-rules` | `commission.manage` |
| GET | `/audit` | `audit.read` |
| GET | `/fraud-signals` | `audit.read` |

Fraud signals are three explainable heuristics — duplicate addresses, unusually rapid
listing creation, prices far below the locality mean. They are surfaced for a human
to look at. Nothing is auto-enforced.

## Health

`GET /api/health` — public. Returns status, database reachability and latency. Nginx
keeps it out of the access log.
