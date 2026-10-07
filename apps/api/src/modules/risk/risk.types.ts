export type RiskSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type SecurityEventSeverity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type RiskCaseType =
  | 'PAYMENT_FRAUD'
  | 'PAYMENT_VELOCITY'
  | 'ACCOUNT_TAKEOVER'
  | 'DUPLICATE_LISTING'
  | 'APPLICATION_SPAM'
  | 'DISPUTE_ABUSE'
  | 'DOCUMENT_FORGERY'
  | 'POLICY_VIOLATION'
  | 'UNUSUAL_VELOCITY'
  | 'SUSPICIOUS_PAYOUT'
  | 'GENERAL_RISK';

export type RiskCaseStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'EVIDENCE_REQUESTED'
  | 'ACTION_REQUIRED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'FALSE_POSITIVE'
  | 'ESCALATED';

export type RiskSignalStatus =
  | 'ACTIVE'
  | 'INVESTIGATING'
  | 'SUPPRESSED'
  | 'RESOLVED'
  | 'FALSE_POSITIVE';

export interface SecurityEventRecord {
  id: number;
  public_id: string;
  event_type: string;
  severity: SecurityEventSeverity;
  actor_id: number | null;
  actor_role: string | null;
  actor_ip: string | null;
  user_agent: string | null;
  entity_type: string | null;
  entity_id: string | null;
  summary: string;
  metadata: any;
  created_at: string;
  actor_name?: string;
  actor_email?: string;
}

export interface RiskSignalRecord {
  id: number;
  public_id: string;
  signal_type: string;
  severity: RiskSeverity;
  source_domain: string;
  source_entity_type: string;
  source_entity_id: string;
  subject_user_id: number | null;
  detected_value: string;
  threshold_value: string;
  explanation: string;
  status: RiskSignalStatus;
  metadata: any;
  created_at: string;
  updated_at: string;
  subject_name?: string;
  subject_email?: string;
}

export interface RiskCaseRecord {
  id: number;
  public_id: string;
  case_number: string;
  case_type: RiskCaseType;
  subject_user_id: number | null;
  subject_property_id: number | null;
  subject_payment_id: number | null;
  risk_level: RiskSeverity;
  status: RiskCaseStatus;
  assigned_to: number | null;
  summary: string;
  evidence: any;
  resolution_notes: string | null;
  resolved_by: number | null;
  resolved_at: string | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  subject_name?: string;
  subject_email?: string;
  assigned_name?: string;
  resolved_by_name?: string;
  property_title?: string;
  property_code?: string;
  payment_reference?: string;
  payment_amount?: number;
}

export interface RiskCaseEventRecord {
  id: number;
  case_id: number;
  actor_id: number | null;
  event_type: string;
  previous_state: any;
  new_state: any;
  notes: string | null;
  created_at: string;
  actor_name?: string;
  actor_role?: string;
}

export interface RiskOverviewKpis {
  openCases: number;
  criticalRisks: number;
  highRisks: number;
  mediumRisks: number;
  lowRisks: number;
  unresolvedSecurityEvents: number;
  suspiciousPaymentsCount: number;
  suspiciousAccountsCount: number;
  suspiciousListingsCount: number;
  failedAuthSpikes: number;
  activeSignalsCount: number;
  avgResolutionHours: number;
}

export interface SuspiciousPaymentItem {
  paymentId: number;
  referenceCode: string;
  payerId: number;
  payerName: string;
  payerEmail: string;
  amount: number;
  purpose: string;
  status: string;
  failureCount: number;
  riskReason: string;
  lastAttemptAt: string;
}

export interface SuspiciousAccountItem {
  userId: number;
  userName: string;
  userEmail: string;
  role: string;
  status: string;
  failedAttempts: number;
  isLocked: boolean;
  lockedUntil: string | null;
  riskReason: string;
  lastLoginAt: string | null;
}

export interface SuspiciousListingItem {
  propertyId: number;
  propertyCode: string;
  title: string;
  city: string;
  locality: string;
  ownerId: number;
  ownerName: string;
  monthlyRent: number;
  similarityScore?: number;
  riskReason: string;
  createdAt: string;
}
