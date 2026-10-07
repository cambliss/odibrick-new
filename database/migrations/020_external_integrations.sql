-- ============================================================================
-- ODIBRICK MIGRATION 020: EXTERNAL INTEGRATIONS, PROVIDER ADAPTERS & WEBHOOK ENGINE
-- Phase 18 Implementation
-- ============================================================================
SET NAMES utf8mb4;

-- 1. Register Integrations & Webhooks RBAC permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('integration.read', 'integration', 'read', 'View external integrations, provider adapters, and connectivity health'),
  ('integration.manage', 'integration', 'manage', 'Configure, enable, disable, and manage external provider adapters'),
  ('integration.test', 'integration', 'test', 'Execute connection tests and diagnostics on external integrations'),
  ('webhook.read', 'webhook', 'read', 'View inbound provider webhooks, callback history, and payload logs'),
  ('webhook.manage', 'webhook', 'manage', 'Retry failed webhooks and manage webhook replay controls')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Grant permissions to SUPER_ADMIN (1) and ADMIN (2)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('integration.read', 'integration.manage', 'integration.test', 'webhook.read', 'webhook.manage')
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN');

-- 2. Create external_integrations table
CREATE TABLE IF NOT EXISTS external_integrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  capability ENUM('EMAIL', 'SMS', 'WHATSAPP', 'PAYMENT_GATEWAY', 'STORAGE', 'KYC', 'ESIGN', 'MAPS', 'CALENDAR') NOT NULL,
  provider_key VARCHAR(64) NOT NULL,
  name VARCHAR(128) NOT NULL,
  description VARCHAR(255) NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 0,
  is_configured TINYINT(1) NOT NULL DEFAULT 0,
  health_status ENUM('HEALTHY', 'DEGRADED', 'FAILING', 'DISABLED', 'NOT_CONFIGURED') NOT NULL DEFAULT 'NOT_CONFIGURED',
  environment ENUM('PRODUCTION', 'SANDBOX', 'TEST', 'MOCK') NOT NULL DEFAULT 'MOCK',
  base_url VARCHAR(255) NULL,
  config_metadata JSON NULL,
  last_health_check_at DATETIME NULL,
  last_success_at DATETIME NULL,
  last_failure_at DATETIME NULL,
  failure_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_summary VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ext_integ_pubid (public_id),
  UNIQUE KEY uq_ext_integ_key (provider_key),
  KEY ix_ext_integ_cap_health (capability, health_status),
  KEY ix_ext_integ_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Create integration_events table (Diagnostic telemetry for outbound provider calls)
CREATE TABLE IF NOT EXISTS integration_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  integration_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  direction ENUM('INBOUND', 'OUTBOUND') NOT NULL DEFAULT 'OUTBOUND',
  status ENUM('SUCCESS', 'FAILED', 'PENDING') NOT NULL DEFAULT 'SUCCESS',
  duration_ms INT UNSIGNED NOT NULL DEFAULT 0,
  request_summary VARCHAR(255) NULL,
  response_summary VARCHAR(255) NULL,
  error_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_integ_evt_pubid (public_id),
  KEY ix_integ_evt_integration (integration_id, created_at),
  KEY ix_integ_evt_status (status),
  CONSTRAINT fk_integ_evt_integration FOREIGN KEY (integration_id) REFERENCES external_integrations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Create webhook_events table (Inbound provider webhooks with deduplication & signature safety)
CREATE TABLE IF NOT EXISTS webhook_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  provider VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  external_event_id VARCHAR(128) NOT NULL,
  signature_status ENUM('VERIFIED', 'INVALID', 'SKIPPED') NOT NULL DEFAULT 'VERIFIED',
  processing_status ENUM('RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'RECEIVED',
  payload_hash VARCHAR(64) NOT NULL,
  payload JSON NOT NULL,
  retry_count INT UNSIGNED NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wh_evt_pubid (public_id),
  UNIQUE KEY uq_wh_evt_dedup (provider, external_event_id),
  KEY ix_wh_evt_provider_status (provider, processing_status),
  KEY ix_wh_evt_received_at (received_at),
  KEY ix_wh_evt_type (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Seed Canonical External Integrations across 9 Core Capabilities
INSERT IGNORE INTO external_integrations (
  public_id, capability, provider_key, name, description, is_enabled, is_configured,
  health_status, environment, base_url, config_metadata
) VALUES
(
  'INT-2026-000001',
  'EMAIL',
  'resend',
  'Resend / SendGrid Email Adapter',
  'Transactional email delivery provider for customer notifications, receipts, and system alerts.',
  1, 1, 'HEALTHY', 'MOCK', 'https://api.resend.com',
  '{"sender": "notifications@odibrick.com", "region": "ap-south-1", "rateLimitPerSec": 20}'
),
(
  'INT-2026-000002',
  'SMS',
  'twilio',
  'Twilio / MSG91 SMS Adapter',
  'Transactional SMS gateway for OTP authentications, urgent visit reminders, and payment escalations.',
  1, 1, 'HEALTHY', 'MOCK', 'https://api.twilio.com/2010-04-01',
  '{"senderId": "ODIBRIC", "countryCode": "+91", "dltRegistered": true}'
),
(
  'INT-2026-000003',
  'WHATSAPP',
  'meta_whatsapp',
  'Meta WhatsApp Cloud API',
  'Template-governed WhatsApp messaging for visit confirmations, lease updates, and rent notices.',
  1, 1, 'HEALTHY', 'MOCK', 'https://graph.facebook.com/v19.0',
  '{"wabaId": "109823904829102", "businessNumber": "+918049102000", "approvedTemplates": ["visit_reminder_v1", "rent_receipt_v2", "lease_ready_v1"]}'
),
(
  'INT-2026-000004',
  'PAYMENT_GATEWAY',
  'razorpay',
  'Razorpay / Stripe Gateway Adapter',
  'Payment aggregator for rent collection, security deposits, and marketing packages with HMAC verification.',
  1, 1, 'HEALTHY', 'MOCK', 'https://api.razorpay.com/v1',
  '{"merchantId": "acc_ODIBRICK_001", "currency": "INR", "supportedMethods": ["UPI", "CARD", "NETBANKING"]}'
),
(
  'INT-2026-000005',
  'STORAGE',
  's3_storage',
  'AWS S3 / Local Object Storage',
  'Secure document and media storage with short-lived pre-signed URLs and server-side encryption.',
  1, 1, 'HEALTHY', 'MOCK', 'https://odibrick-vault.s3.ap-south-1.amazonaws.com',
  '{"bucket": "odibrick-documents-production", "region": "ap-south-1", "encryption": "AES256", "urlExpirySeconds": 3600}'
),
(
  'INT-2026-000006',
  'KYC',
  'hyperverge_kyc',
  'HyperVerge / DigiLocker KYC Adapter',
  'Identity document verification, Aadhaar/PAN validation, and face-match fraud detection.',
  1, 1, 'HEALTHY', 'MOCK', 'https://ind.idv.hyperverge.co/v1',
  '{"supportedDocs": ["AADHAAR", "PAN_CARD", "PASSPORT"], "autoExtractFields": true}'
),
(
  'INT-2026-000007',
  'ESIGN',
  'leegality_esign',
  'Leegality / DocuSign E-Signature Adapter',
  'Legally binding digital signatures for rental agreements, lease deeds, and property authorizations.',
  1, 1, 'HEALTHY', 'MOCK', 'https://app.leegality.com/api/v2',
  '{"stampDutyIntegrated": true, "signatureModes": ["AADHAAR_ESIGN", "DIGITAL_SIGNATURE"]}'
),
(
  'INT-2026-000008',
  'MAPS',
  'google_maps',
  'Google Maps Geocoding & Places',
  'Address geocoding, locality normalization, coordinates mapping, and nearby landmark enrichment.',
  1, 1, 'HEALTHY', 'MOCK', 'https://maps.googleapis.com/maps/api',
  '{"region": "in", "languages": ["en", "hi", "kn"]}'
),
(
  'INT-2026-000009',
  'CALENDAR',
  'google_calendar',
  'Google Calendar / Outlook Sync',
  'Calendar event synchronization for property walkthroughs, owner consultations, and inspections.',
  1, 1, 'HEALTHY', 'MOCK', 'https://www.googleapis.com/calendar/v3',
  '{"timeZone": "Asia/Kolkata", "sendUpdates": "all"}'
);

-- 6. Seed Canonical Inbound Webhook Events
INSERT IGNORE INTO webhook_events (
  public_id, provider, event_type, external_event_id, signature_status,
  processing_status, payload_hash, payload, received_at, processed_at
) VALUES
(
  'WHK-2026-000001',
  'razorpay',
  'payment.captured',
  'evt_rzp_mock_001928471',
  'VERIFIED',
  'PROCESSED',
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  '{"entity": "event", "account_id": "acc_ODIBRICK_001", "event": "payment.captured", "payload": {"payment": {"entity": {"id": "pay_mock_991823", "amount": 2850000, "currency": "INR", "status": "captured", "order_id": "order_mock_001", "method": "upi"}}}}',
  DATE_SUB(NOW(), INTERVAL 3 HOUR),
  DATE_SUB(NOW(), INTERVAL 3 HOUR)
),
(
  'WHK-2026-000002',
  'leegality_esign',
  'document.signed',
  'evt_lgl_mock_00881920',
  'VERIFIED',
  'PROCESSED',
  'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e',
  '{"documentId": "DOC-AGR-2026-001", "status": "SIGNED", "signers": [{"name": "Rahul Sharma", "status": "COMPLETED", "signedAt": "2026-10-02T10:30:00Z"}]}',
  DATE_SUB(NOW(), INTERVAL 5 HOUR),
  DATE_SUB(NOW(), INTERVAL 5 HOUR)
);
