/**
 * Provider-independent verification contract.
 *
 * A provider adapter translates its own vocabulary into CheckOutcome using
 * THAT provider's documentation. Unknown or unrecognised provider statuses must
 * map to INCONCLUSIVE - never PASS. Adapters must not put personal data
 * (names, document numbers, OCR text, MRZ) into `checks` or `failureCode`.
 */
export type CheckOutcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'NOT_PERFORMED' | 'ERROR';

export type CheckName =
  | 'MANUAL_REVIEW'
  | 'DOCUMENT_QUALITY'
  | 'DOCUMENT_AUTHENTICITY'
  | 'MRZ_CONSISTENCY'
  | 'DATA_MATCH'
  | 'LIVENESS'
  | 'FACE_MATCH'
  | 'SOURCE_VERIFICATION';

export type OverallOutcome = 'PASS' | 'FAIL' | 'INCONCLUSIVE' | 'ERROR';

export interface ProviderCapabilities {
  /** ISO codes of passport issuers the provider covers, or 'ANY'. Must be verified from provider documentation. */
  passportCountries: string[] | 'ANY' | 'NONE';
  ocr: boolean;
  mrz: boolean;
  authenticity: boolean;
  liveness: boolean;
  faceMatch: boolean;
  sourceVerification: string[];
}

export interface VerificationRequest {
  attemptId: number;
  idempotencyKey: string;
  kycRecordId: number;
  /** Opaque references; providers never receive storage keys or public URLs from this layer. */
  documentIds: number[];
  /** Only the minimum a provider needs; adapters must not log this object. */
  subject: { legalName: string; dateOfBirth: string; issuingCountry: string };
}

export interface ProviderResult {
  providerRef: string | null;
  outcome: OverallOutcome;
  checks: Partial<Record<CheckName, CheckOutcome>>;
  /** Machine code only. */
  failureCode?: string;
  riskScore?: number;
}

export interface KycVerificationProvider {
  readonly key: string;
  /**
   * True only for a real, approved provider whose PASS results may be relied on.
   * The decision engine in Phase 3A ignores this flag: automatic approval does not exist yet.
   */
  readonly authoritative: boolean;
  capabilities(): ProviderCapabilities;
  start(request: VerificationRequest): Promise<ProviderResult>;
}

export class ProviderTimeoutError extends Error {
  constructor(message = 'Provider request timed out.') {
    super(message);
  }
}

/** Transient failures are retried; anything else is recorded as an ERROR and sent to manual review. */
export class ProviderTransientError extends Error {}

export const KYC_PROVIDER = Symbol('KYC_VERIFICATION_PROVIDER');

