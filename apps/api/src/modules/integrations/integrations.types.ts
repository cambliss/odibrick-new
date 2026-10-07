export type IntegrationCapability =
  | 'EMAIL'
  | 'SMS'
  | 'WHATSAPP'
  | 'PAYMENT_GATEWAY'
  | 'STORAGE'
  | 'KYC'
  | 'ESIGN'
  | 'MAPS'
  | 'CALENDAR';

export type IntegrationHealthStatus =
  | 'HEALTHY'
  | 'DEGRADED'
  | 'FAILING'
  | 'DISABLED'
  | 'NOT_CONFIGURED';

export type IntegrationEnvironment = 'PRODUCTION' | 'SANDBOX' | 'TEST' | 'MOCK';

export type WebhookSignatureStatus = 'VERIFIED' | 'INVALID' | 'SKIPPED';

export type WebhookProcessingStatus =
  | 'RECEIVED'
  | 'PROCESSING'
  | 'PROCESSED'
  | 'FAILED'
  | 'SKIPPED';

export interface ExternalIntegrationRecord {
  id: number;
  public_id: string;
  capability: IntegrationCapability;
  provider_key: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  is_configured: boolean;
  health_status: IntegrationHealthStatus;
  environment: IntegrationEnvironment;
  base_url: string | null;
  config_metadata: any;
  last_health_check_at: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  failure_count: number;
  error_summary: string | null;
  created_at: string;
  updated_at: string;
  latency_ms?: number;
}

export interface IntegrationEventRecord {
  id: number;
  public_id: string;
  integration_id: number;
  event_type: string;
  direction: 'INBOUND' | 'OUTBOUND';
  status: 'SUCCESS' | 'FAILED' | 'PENDING';
  duration_ms: number;
  request_summary: string | null;
  response_summary: string | null;
  error_message: string | null;
  created_at: string;
}

export interface WebhookEventRecord {
  id: number;
  public_id: string;
  provider: string;
  event_type: string;
  external_event_id: string;
  signature_status: WebhookSignatureStatus;
  processing_status: WebhookProcessingStatus;
  payload_hash: string;
  payload: any;
  retry_count: number;
  error_message: string | null;
  received_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface HealthCheckResult {
  status: IntegrationHealthStatus;
  latencyMs: number;
  message: string;
  timestamp: string;
}

export interface ConfigValidationResult {
  valid: boolean;
  isConfigured: boolean;
  errors?: string[];
  maskedConfig?: Record<string, any>;
}

// ------------------------------------------------------------------ CAPABILITY INTERFACES
export interface EmailSendInput {
  to: string;
  subject: string;
  body: string;
  templateId?: string;
  variables?: Record<string, string | number>;
  idempotencyKey?: string;
}

export interface EmailSendResult {
  messageId: string;
  status: 'SENT' | 'QUEUED' | 'FAILED' | 'SKIPPED';
  provider: string;
}

export interface SmsSendInput {
  phone: string;
  message: string;
  templateId?: string;
  idempotencyKey?: string;
}

export interface SmsSendResult {
  messageId: string;
  status: 'DELIVERED' | 'SENT' | 'FAILED' | 'SKIPPED';
  provider: string;
}

export interface WhatsAppSendInput {
  phone: string;
  templateName: string;
  languageCode?: string;
  components?: any[];
  idempotencyKey?: string;
}

export interface WhatsAppSendResult {
  messageId: string;
  status: 'SENT' | 'DELIVERED' | 'FAILED' | 'SKIPPED';
  provider: string;
}

export interface PaymentGatewayOrderInput {
  referenceCode: string;
  amount: number;
  currency: string;
  purpose: string;
  customer: {
    name: string;
    email: string;
    phone?: string;
  };
  notes?: Record<string, string>;
}

export interface PaymentGatewayOrderResult {
  orderId: string;
  referenceCode: string;
  amount: number;
  currency: string;
  checkoutUrl?: string;
  rawPayload: Record<string, any>;
}

export interface PaymentWebhookVerificationResult {
  verified: boolean;
  eventType: string;
  externalEventId: string;
  paymentReference?: string;
  amount?: number;
  status?: 'SUCCESS' | 'FAILED' | 'PENDING';
  rawPayload: Record<string, any>;
}

export interface StorageUploadUrlInput {
  fileName: string;
  contentType: string;
  category: string;
  expiresInSeconds?: number;
}

export interface StorageUploadUrlResult {
  uploadUrl: string;
  downloadUrl: string;
  storageKey: string;
  expiresAt: string;
}

export interface KycVerificationInput {
  userId: number;
  documentType: string;
  documentNumber: string;
  fileUrl?: string;
  fullName: string;
}

export interface KycVerificationResult {
  verificationId: string;
  status: 'VERIFIED' | 'REJECTED' | 'UNDER_REVIEW' | 'FAILED';
  matchScore?: number;
  extractedDetails?: Record<string, any>;
  reason?: string;
}

export interface ESignRequestInput {
  documentId: string;
  documentTitle: string;
  documentUrl: string;
  signers: Array<{
    name: string;
    email: string;
    phone?: string;
    role: string;
  }>;
  expiresInDays?: number;
}

export interface ESignRequestResult {
  signatureRequestId: string;
  documentId: string;
  status: 'INITIATED' | 'PENDING_SIGNATURES' | 'EXECUTED' | 'EXPIRED';
  signingUrls?: Record<string, string>;
}

export interface GeocodeResult {
  formattedAddress: string;
  latitude: number;
  longitude: number;
  locality?: string;
  city?: string;
  postalCode?: string;
  confidenceScore: number;
}

export interface CalendarEventInput {
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location?: string;
  attendees: Array<{ email: string; name?: string }>;
}

export interface CalendarEventResult {
  eventId: string;
  meetingLink?: string;
  htmlLink?: string;
  status: 'CONFIRMED' | 'TENTATIVE' | 'CANCELLED';
}

export interface IProviderAdapter {
  readonly key: string;
  readonly capability: IntegrationCapability;
  readonly name: string;
  testConnection(): Promise<HealthCheckResult>;
  validateConfig(): ConfigValidationResult;
  verifyWebhook(headers: Record<string, string>, rawBody: string, payload: any): Promise<{ verified: boolean; error?: string }>;
}
