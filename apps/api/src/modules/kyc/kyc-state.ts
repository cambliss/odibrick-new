/**
 * KYC lifecycle rules (pure, no I/O).
 *
 * IN_REVIEW is a legacy value that still exists on historical rows; it is read
 * as "awaiting review" but never written by new code.
 */
export const KYC_STATUSES = [
  'NOT_STARTED',
  'SUBMITTED',
  'PROCESSING',
  'UNDER_REVIEW',
  'IN_REVIEW',
  'DOCUMENTS_PENDING',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'SUSPENDED',
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

export type DecisionSource = 'AUTOMATED' | 'MANUAL' | 'OVERRIDE';

/**
 * Who is causing the transition:
 *  USER     – the KYC subject (submission / resubmission only)
 *  SYSTEM   – the verification orchestrator / scheduled jobs
 *  REVIEWER – a KYC team member using the normal decision endpoints
 *  OVERRIDE – an ADMIN/SUPER_ADMIN holding kyc.override
 */
export type TransitionActor = 'USER' | 'SYSTEM' | 'REVIEWER' | 'OVERRIDE';

export const REVIEWER_DECISION_SOURCE: Record<TransitionActor, DecisionSource | null> = {
  USER: null,
  SYSTEM: 'AUTOMATED',
  REVIEWER: 'MANUAL',
  OVERRIDE: 'OVERRIDE',
};

/** Statuses from which the subject may (re)submit through the normal route. */
export const RESUBMITTABLE_STATUSES: readonly KycStatus[] = [
  'NOT_STARTED',
  'REJECTED',
  'DOCUMENTS_PENDING',
  'EXPIRED',
];

/** Statuses that mean "a decision is still pending". */
export const IN_PROGRESS_STATUSES: readonly KycStatus[] = [
  'SUBMITTED',
  'PROCESSING',
  'UNDER_REVIEW',
  'IN_REVIEW',
];

/** Final decisions: only an explicit override may change these (besides expiry/suspension). */
export const FINAL_STATUSES: readonly KycStatus[] = ['VERIFIED', 'REJECTED'];

const TRANSITIONS: Record<TransitionActor, Partial<Record<KycStatus, readonly KycStatus[]>>> = {
  USER: {
    NOT_STARTED: ['SUBMITTED'],
    REJECTED: ['SUBMITTED'],
    DOCUMENTS_PENDING: ['SUBMITTED'],
    EXPIRED: ['SUBMITTED'],
  },
  SYSTEM: {
    SUBMITTED: ['PROCESSING'],
    // PROCESSING can only end in review, or in a deterministic rejection.
    PROCESSING: ['UNDER_REVIEW', 'REJECTED'],
    // Scheduled expiry of an approved record.
    VERIFIED: ['EXPIRED'],
  },
  REVIEWER: {
    // Normal review decisions. VERIFIED/REJECTED cannot be reversed here.
    SUBMITTED: ['REJECTED', 'DOCUMENTS_PENDING', 'SUSPENDED'],
    IN_REVIEW: ['REJECTED', 'DOCUMENTS_PENDING', 'SUSPENDED', 'VERIFIED'],
    UNDER_REVIEW: ['VERIFIED', 'REJECTED', 'DOCUMENTS_PENDING', 'SUSPENDED', 'PROCESSING'],
    DOCUMENTS_PENDING: ['REJECTED', 'SUSPENDED'],
    VERIFIED: ['SUSPENDED'],
    SUSPENDED: ['UNDER_REVIEW'],
  },
  OVERRIDE: {
    SUBMITTED: ['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'],
    PROCESSING: ['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'],
    UNDER_REVIEW: ['VERIFIED', 'REJECTED', 'SUSPENDED'],
    IN_REVIEW: ['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'],
    DOCUMENTS_PENDING: ['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'],
    VERIFIED: ['REJECTED', 'UNDER_REVIEW', 'SUSPENDED'],
    REJECTED: ['VERIFIED', 'UNDER_REVIEW', 'SUSPENDED'],
    EXPIRED: ['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'],
    SUSPENDED: ['VERIFIED', 'REJECTED', 'UNDER_REVIEW'],
  },
};

export function isKycStatus(value: unknown): value is KycStatus {
  return typeof value === 'string' && (KYC_STATUSES as readonly string[]).includes(value);
}

export function isTransitionAllowed(from: KycStatus, to: KycStatus, actor: TransitionActor): boolean {
  if (from === to) return false;
  return TRANSITIONS[actor][from]?.includes(to) ?? false;
}

export function allowedTransitions(from: KycStatus, actor: TransitionActor): readonly KycStatus[] {
  return TRANSITIONS[actor][from] ?? [];
}

export function canResubmit(status: KycStatus): boolean {
  return RESUBMITTABLE_STATUSES.includes(status);
}

export function isInProgress(status: KycStatus): boolean {
  return IN_PROGRESS_STATUSES.includes(status);
}

/** Read-side normalisation of legacy values. */
export function normaliseStatus(raw: string | null | undefined): KycStatus {
  if (!raw) return 'NOT_STARTED';
  if (raw === 'IN_REVIEW') return 'UNDER_REVIEW';
  return isKycStatus(raw) ? raw : 'NOT_STARTED';
}

export class KycTransitionError extends Error {
  constructor(
    readonly from: KycStatus,
    readonly to: KycStatus,
    readonly actor: TransitionActor,
  ) {
    super(`KYC transition ${from} -> ${to} is not allowed for ${actor}.`);
  }
}

export function assertTransition(from: KycStatus, to: KycStatus, actor: TransitionActor): void {
  if (!isTransitionAllowed(from, to, actor)) throw new KycTransitionError(from, to, actor);
}

