import { KycStatus } from './kyc-state';

/**
 * Retention architecture (Phase 3A: configuration and design only).
 *
 * NOTHING IS DELETED in this phase and no retention period is assumed:
 * `documentDays` / `numberDataDays` default to null, which means "no automated
 * deletion". A future purge job (not implemented) must follow this contract:
 *
 *  1. Eligibility: a record is a candidate only when a configured period has
 *     elapsed since its final decision (VERIFIED expiry, REJECTED, or consent
 *     withdrawal), and no retention exception applies.
 *  2. Retention exceptions: SUSPENDED records, open risk cases / disputes /
 *     legal holds and regulator requests suspend deletion (`exceptionFor`).
 *  3. Document deletion: delete the stored file, then mark the documents row
 *     (deleted_at / is_active = 0). The documents row, document_access_logs and
 *     audit_logs are preserved as the access history.
 *  4. Sensitive number data: clear number_enc (and number_hmac only if the
 *     policy says duplicate detection must also lapse), keep number_last4.
 *  5. Consent withdrawal: recorded as an immutable WITHDRAW row in kyc_consents.
 *     What a withdrawal does to an already-VERIFIED status is a legal/product
 *     decision, so the purge job treats it as an eligibility trigger only.
 *  6. Every purge action writes an audit record (ids and counts, no PII) and the
 *     job runs in dry-run mode first.
 */
export interface KycRetentionPolicy {
  documentDays: number | null;
  numberDataDays: number | null;
}

export type RetentionExceptionReason = 'SUSPENDED' | 'LEGAL_HOLD' | 'OPEN_RISK_CASE' | 'REGULATOR_REQUEST';

export function readRetentionPolicy(raw: { documentDays?: number | null; numberDataDays?: number | null } | undefined): KycRetentionPolicy {
  const clean = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);
  return { documentDays: clean(raw?.documentDays), numberDataDays: clean(raw?.numberDataDays) };
}

export function isPurgeEnabled(policy: KycRetentionPolicy): boolean {
  return policy.documentDays !== null || policy.numberDataDays !== null;
}

/** Statuses that always block deletion. */
export function exceptionFor(status: KycStatus): RetentionExceptionReason | null {
  return status === 'SUSPENDED' ? 'SUSPENDED' : null;
}

