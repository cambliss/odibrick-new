# Security and compliance

What this codebase does, and — just as usefully — what it does not.

---

## Authentication

**Password storage.** argon2id with a server-side pepper from `PASSWORD_PEPPER`. The
pepper lives in the environment, not the database, so a database dump alone does not
give an attacker offline-crackable hashes with the full input.

**Login responses are uniform.** Unknown email and wrong password produce the same
error and take a comparable amount of time. Account enumeration through the login
form is not available.

**Lockout.** Repeated failures increment a counter on `users` and lock the account
temporarily. Nginx additionally caps `/api/auth/*` at 5 requests per minute per IP.

**Tokens.** Access and refresh tokens are `httpOnly`, `Secure`, `SameSite=Lax`
cookies named `odb_at` and `odb_rt`. There is no `localStorage` or `sessionStorage`
in the frontend codebase — a token is never reachable from JavaScript, so XSS cannot
exfiltrate a session.

**Refresh rotation with family revocation.** Every refresh issues a new token and
retires the old one, tracked by `family_id`. Presenting an already-rotated token is
treated as theft: the entire family is revoked and the user is logged out everywhere.
This is the standard detection for a stolen refresh cookie, and the behaviour is
covered by a unit test.

**Session invalidation.** Changing a password, or an admin suspending an account,
revokes outstanding refresh tokens.

## Authorisation

Twelve roles, twenty-eight permissions, granted through `role_permissions`. Guards run
authenticate → authorise → rate-limit, in that order.

Ownership is checked at the row level in services, never inferred from the request.
A user with `property.update.own` still cannot touch a property whose
`listed_by_user_id` is not theirs — `PropertiesService.update()` compares them and
throws. The same pattern applies to tenancies, agreements, payments, inspections and
disputes.

Separation of duties is real, not cosmetic:

- `agreement.draft` and `agreement.approve` are distinct permissions.
- `kyc.read` and `kyc.review` are distinct.
- Only `SUPER_ADMIN` can grant `SUPER_ADMIN`.
- No one can change their own account status.

Staff roles cannot be self-assigned at registration. `AuthService.register()` rejects
any role outside `TENANT`, `OWNER`, `AGENT`, `BUILDER` with a `403`, and there is a
test for it.

## Data protection

**Field-level encryption.** `kyc_records.id_reference` is AES-256-GCM ciphertext.
The plaintext Aadhaar or PAN number is never returned by any endpoint. `id_last4` is
stored separately and is the only fragment ever shown, to anyone, including staff.

**The document vault is private by default.** Files are stored under an unguessable
`storage_key` that is never a URL. Downloads require a short-lived HMAC-signed link,
and every access writes a row to `document_access_logs` with who, what and when.

**Uploads are validated by content, not extension.** `StorageService` reads the magic
bytes and rejects a file whose real type is not on the allow-list. A `.jpg` that is
actually a PHP script does not get stored.

**Address privacy.** A property's exact address is returned only to the lister,
assigned staff and an accepted counterparty. Everyone else — including search
results, the public detail page and search-engine crawlers — sees locality and city.
This is covered by a unit test.

**Public profiles carry no contact details.** Enquiries route through the platform, so
there is a record of who asked for what and when, and so scraping the site does not
yield a phone list.

**Soft deletes** preserve the legal and financial record. Foreign keys on anything
financial are `RESTRICT`: you cannot delete a user out from under an executed
agreement.

## Input handling

- Every SQL query is parameterised. Where a list is interpolated, it is a placeholder
  list generated from an array length, never user input.
- DTOs use `whitelist` and `forbidNonWhitelisted`, so mass-assignment is not possible
  — an unexpected field is a `400`.
- React escapes output by default. The single `dangerouslySetInnerHTML` in the
  codebase renders JSON-LD built server-side from typed values.
- The API's exception filter returns a `traceId` and a safe message. Stack traces and
  driver errors never reach a client.

## Transport and headers

Nginx sets HSTS with preload, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, a
`Permissions-Policy` limiting camera, microphone, geolocation and payment to self,
and a Content-Security-Policy with `frame-ancestors 'none'`. Helmet applies a second
layer at the API. TLS is 1.2 and 1.3 only, with OCSP stapling.

Same-origin architecture means no CORS preflight in the browser, and
`SameSite=Lax` cookies give solid CSRF resistance for the flows here.

## Auditability

`audit_logs` records actor, role, action, object type and id, IP, user agent, result
and a metadata JSON blob for every consequential operation: verification decisions,
agreement drafts and approvals, signatures, payment recording and refunds, role
grants, settings changes, dispute updates.

Two things make it worth having: the application user has no delete grant on the
table, and financial and legal rows are never hard-deleted, so the log and the data
it describes stay in agreement.

---

## Honesty guarantees

Several behaviours here exist specifically to prevent the system from claiming things
that are not true. They are worth stating as security properties, because a false
"verified" or "paid" is a fraud vector.

| Claim | Enforcement |
| --- | --- |
| "Verified" | Requires a `property_verifications` row with `status = 'VERIFIED'`. No boolean shortcut exists on the properties table. |
| "Paid" | Only `markPaid()` sets it, called from a signature-verified webhook or from an audited operator action carrying a bank reference. The default provider *cannot* self-report success. |
| "Signed" / "Executed" | Requires an approval of the exact current version. Redrafting nulls the approval. |
| "Insured" | A policy reaches `ACTIVE` only when a partner or admin supplies the insurer's policy number. Odibrick issues nothing. |
| "Notified" | Email and SMS are recorded as `SKIPPED` when no provider is configured, never as delivered. |
| "Promoted" | `is_featured` is set only while a paid campaign is `LIVE`, and cleared when it pauses or completes. |
| Liability for damage | The move-out comparison returns a diff with an explicit note that it is a record, not a determination. No automated adjudication anywhere. |

## Regulatory posture

**Payments.** The default configuration is non-custodial: Odibrick never holds
customer funds. Money moves directly between the parties, and the platform records
that it did. Switching `PAYMENT_PROVIDER` to `gateway` means settling through a
licensed aggregator — which requires a merchant account and brings PCI-DSS scope with
it. Do not implement card handling yourself.

**KYC.** Verification is a documented human review. If you integrate an Aadhaar-based
provider, note that Aadhaar handling in India is tightly regulated; talk to counsel
before storing anything more than you already are.

**Insurance.** Distribution of insurance products in India requires appropriate IRDAI
registration. The schema records the partner's registration number and surfaces it in
the catalogue for exactly this reason.

**Agreements.** Stamp duty and registration requirements are state-specific.
`agreements.stamp_duty_status` tracks the state but the platform does not compute or
pay duty. An executed agreement in this system is a signed document, not a registered
one, and the UI says so.

**Data protection.** India's DPDP Act 2023 imposes obligations around consent,
purpose limitation, retention and breach notification. The building blocks are here —
audited access, encrypted identifiers, soft deletes, a document vault — but the
policies, notices and a data-retention schedule are not, and they are not something a
codebase can supply.

---

## Known gaps

Read this section before going live. None of it is hidden in a subdirectory.

**Never executed.** Not compiled, not run, not tested against a live database. No
load testing, no penetration testing, no dependency audit. Run `npm audit`,
`npm test` and a full manual pass of the tenancy flow first.

**No MFA.** `users.mfa_enabled` exists in the schema; the TOTP enrolment and
challenge flow is not built. Staff accounts with `agreement.approve`,
`payment.manage` or `user.manage` should have it before they touch production.

**No password reset flow.** The support page is the current answer. A token-based
reset with expiry and single use needs building.

**No email or SMS delivery.** Notifications are in-app only. The abstraction is in
place; the adapters are not.

**No virus scanning on uploads.** Magic-number validation catches type confusion but
not malware. Add ClamAV or an equivalent before accepting documents at volume.

**Rate limiting is in-memory.** Fine for one process; it does not hold across a PM2
cluster. Move the throttler to Redis before scaling horizontally.

**No CAPTCHA on registration.** Consider one if you see automated signups.

**Test coverage is narrow.** Unit tests cover the security-critical paths —
address privacy, ownership, unapproved-draft signing, stale-version approval, staff
self-registration, refresh replay. There are no integration or end-to-end tests.

**No CSP nonce.** The policy currently allows `'unsafe-inline'` for scripts, which
Next.js needs without one. Tighten this with a nonce-based policy when you have the
time.

**Secrets are files on disk.** `.env` at mode 600 is reasonable for one VPS. A
managed secret store is better once there is more than one.

## Reporting a vulnerability

Send details to the address published by Cambliss Pvt. Ltd. rather than opening a
public issue. Include the trace ID from the error response if you have one — it maps
to the server log entry.
