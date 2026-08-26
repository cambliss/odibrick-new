/**
 * Shared vocabulary between the API and the web app.
 *
 * These mirror the ENUM definitions in database/migrations. When you change one
 * there, change it here — nothing enforces the correspondence automatically.
 */

export type RoleCode =
  | 'SUPER_ADMIN' | 'ADMIN' | 'LEGAL_TEAM' | 'KYC_TEAM' | 'MARKETING_TEAM'
  | 'PROPERTY_MANAGER' | 'SUPPORT_TEAM' | 'INSURANCE_PARTNER'
  | 'OWNER' | 'TENANT' | 'AGENT' | 'BUILDER';

export type PropertyStatus =
  | 'DRAFT' | 'PENDING_VERIFICATION' | 'ACTIVE' | 'PAUSED' | 'RENTED' | 'SOLD'
  | 'REJECTED' | 'ARCHIVED';

export type TenancyStage =
  | 'LEGAL_REVIEW' | 'CONSULTATION' | 'AGREEMENT_DRAFT' | 'AWAITING_SIGNATURES'
  | 'AWAITING_PAYMENT' | 'CHECK_IN_PENDING' | 'ACTIVE' | 'RENEWAL_DUE'
  | 'MOVE_OUT' | 'CLOSED' | 'CANCELLED';

export type AgreementStatus =
  | 'DRAFT' | 'LEGAL_REVIEW' | 'AWAITING_SIGNATURES' | 'PARTIALLY_SIGNED'
  | 'EXECUTED' | 'CANCELLED' | 'EXPIRED';

export type PaymentStatus =
  | 'DUE' | 'INITIATED' | 'PROCESSING' | 'PAID' | 'FAILED'
  | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED';

export type KycStatus =
  | 'NOT_STARTED' | 'SUBMITTED' | 'IN_REVIEW' | 'VERIFIED' | 'REJECTED' | 'EXPIRED';

export type InspectionKind = 'CHECK_IN' | 'PERIODIC' | 'MAINTENANCE' | 'MOVE_OUT';

export type ConditionRating = 'NEW' | 'GOOD' | 'FAIR' | 'DAMAGED' | 'MISSING';

/**
 * The distinction the protection module depends on: a contract issued by a
 * licensed insurer, versus something Odibrick itself does. Never collapse these.
 */
export type OfferingType = 'INSURANCE_POLICY' | 'ODIBRICK_SERVICE';

export interface Paginated<T> {
  data: T[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

export interface ApiErrorShape {
  statusCode: number;
  code?: string;
  message: string;
  traceId?: string;
  path?: string;
}
