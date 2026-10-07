-- ============================================================================
-- ODIBRICK MIGRATION 019: PLATFORM SECURITY, TRUST, FRAUD & RISK MANAGEMENT ENGINE
-- Phase 17 Implementation
-- ============================================================================
SET NAMES utf8mb4;

-- 1. Register Risk & Security RBAC permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('risk.read', 'risk', 'read', 'View platform risk cases, trust signals, and security telemetry'),
  ('risk.manage', 'risk', 'manage', 'Create, triage, update, and manage fraud and risk cases'),
  ('risk.investigate', 'risk', 'investigate', 'Investigate suspicious entities, request evidence, and review signals'),
  ('risk.resolve', 'risk', 'resolve', 'Resolve, close, or mark risk cases as false positives'),
  ('security.read', 'security', 'read', 'View security events, authentication audit logs, and access attempts'),
  ('security.manage', 'security', 'manage', 'Manage security policies, IP throttles, and access overrides')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Grant risk and security permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('risk.read', 'risk.manage', 'risk.investigate', 'risk.resolve', 'security.read', 'security.manage')
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN');

-- 2. Create security_events table
CREATE TABLE IF NOT EXISTS security_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  severity ENUM('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'INFO',
  actor_id BIGINT UNSIGNED NULL,
  actor_role VARCHAR(32) NULL,
  actor_ip VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  entity_type VARCHAR(64) NULL,
  entity_id VARCHAR(64) NULL,
  summary VARCHAR(255) NOT NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sec_event_pubid (public_id),
  KEY ix_sec_event_type (event_type),
  KEY ix_sec_actor (actor_id),
  KEY ix_sec_entity (entity_type, entity_id),
  KEY ix_sec_sev_created (severity, created_at),
  KEY ix_sec_created_at (created_at),
  CONSTRAINT fk_sec_event_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Create risk_signals table
CREATE TABLE IF NOT EXISTS risk_signals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  signal_type VARCHAR(64) NOT NULL,
  severity ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  source_domain VARCHAR(64) NOT NULL,
  source_entity_type VARCHAR(64) NOT NULL,
  source_entity_id VARCHAR(64) NOT NULL,
  subject_user_id BIGINT UNSIGNED NULL,
  detected_value VARCHAR(128) NOT NULL,
  threshold_value VARCHAR(128) NOT NULL,
  explanation TEXT NOT NULL,
  status ENUM('ACTIVE', 'INVESTIGATING', 'SUPPRESSED', 'RESOLVED', 'FALSE_POSITIVE') NOT NULL DEFAULT 'ACTIVE',
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_risk_sig_pubid (public_id),
  KEY ix_risk_sig_type (signal_type),
  KEY ix_risk_sig_user (subject_user_id),
  KEY ix_risk_sig_entity (source_domain, source_entity_type, source_entity_id),
  KEY ix_risk_sig_sev_status (severity, status),
  KEY ix_risk_sig_created_at (created_at),
  CONSTRAINT fk_risk_sig_user FOREIGN KEY (subject_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Create risk_cases table
CREATE TABLE IF NOT EXISTS risk_cases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  case_number VARCHAR(32) NOT NULL,
  case_type VARCHAR(64) NOT NULL,
  subject_user_id BIGINT UNSIGNED NULL,
  subject_property_id BIGINT UNSIGNED NULL,
  subject_payment_id BIGINT UNSIGNED NULL,
  risk_level ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('OPEN', 'UNDER_REVIEW', 'EVIDENCE_REQUESTED', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE', 'ESCALATED') NOT NULL DEFAULT 'OPEN',
  assigned_to BIGINT UNSIGNED NULL,
  summary VARCHAR(255) NOT NULL,
  evidence JSON NULL,
  resolution_notes TEXT NULL,
  resolved_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  idempotency_key VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_risk_case_pubid (public_id),
  UNIQUE KEY uq_risk_case_num (case_number),
  UNIQUE KEY uq_risk_case_idem (idempotency_key),
  KEY ix_risk_case_status_level (status, risk_level),
  KEY ix_risk_case_user (subject_user_id),
  KEY ix_risk_case_property (subject_property_id),
  KEY ix_risk_case_payment (subject_payment_id),
  KEY ix_risk_case_assigned (assigned_to, status),
  KEY ix_risk_case_created_at (created_at),
  CONSTRAINT fk_risk_case_user FOREIGN KEY (subject_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_risk_case_prop FOREIGN KEY (subject_property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT fk_risk_case_pay FOREIGN KEY (subject_payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_risk_case_assigned FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_risk_case_resolved_by FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Create risk_case_events table (Audit Timeline for Risk Cases)
CREATE TABLE IF NOT EXISTS risk_case_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  case_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(64) NOT NULL,
  previous_state JSON NULL,
  new_state JSON NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_risk_cevent_case_created (case_id, created_at),
  KEY ix_risk_cevent_actor (actor_id),
  CONSTRAINT fk_risk_cevent_case FOREIGN KEY (case_id) REFERENCES risk_cases (id) ON DELETE CASCADE,
  CONSTRAINT fk_risk_cevent_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Seed Canonical Security Events
INSERT IGNORE INTO security_events (
  public_id, event_type, severity, actor_id, actor_role, actor_ip, summary, metadata, created_at
) VALUES
(
  'SEV-2026-000001',
  'LOGIN_FAILURE_SPIKE',
  'MEDIUM',
  NULL,
  'GUEST',
  '192.168.1.105',
  'Multiple consecutive failed login attempts detected for user account target.',
  '{"attemptCount": 6, "targetEmail": "rahul.tenant@odibrick.com", "timeWindow": "5m"}',
  DATE_SUB(NOW(), INTERVAL 2 HOUR)
),
(
  'SEV-2026-000002',
  'PAYMENT_VELOCITY_HIGH',
  'HIGH',
  3,
  'TENANT',
  '49.207.140.22',
  'Rapid successive card payment retry attempts detected within 3 minutes.',
  '{"paymentId": 2, "retryCount": 4, "gatewayStatus": "FAILED"}',
  DATE_SUB(NOW(), INTERVAL 4 HOUR)
),
(
  'SEV-2026-000003',
  'ROLE_PERMISSION_CHANGE',
  'INFO',
  1,
  'SUPER_ADMIN',
  '127.0.0.1',
  'Administrative RBAC permission grant to operational staff.',
  '{"grantedPermissions": ["operations.manage", "risk.read"], "targetRoleId": 2}',
  DATE_SUB(NOW(), INTERVAL 1 DAY)
);

-- 7. Seed Canonical Risk Signals
INSERT IGNORE INTO risk_signals (
  public_id, signal_type, severity, source_domain, source_entity_type, source_entity_id,
  subject_user_id, detected_value, threshold_value, explanation, status, metadata
) VALUES
(
  'SIG-2026-000001',
  'PAYMENT_FAILURE_REPEATED',
  'HIGH',
  'FINANCE',
  'payment',
  '2',
  3,
  '4 failed attempts in 10 mins',
  '3 failed attempts',
  'Tenant triggered 4 consecutive card transaction declines in a 10-minute window.',
  'ACTIVE',
  '{"paymentId": 2, "amount": 28500, "lastErrorCode": "CARD_DECLINED_INSUFFICIENT_FUNDS"}'
),
(
  'SIG-2026-000002',
  'LISTING_DUPLICATE_SUSPECTED',
  'MEDIUM',
  'MARKETPLACE',
  'property',
  '4',
  2,
  '98% title/address similarity',
  '85% similarity threshold',
  'Property listing in Whitefield matches existing active listing PROP-BLR-001 in address and dimensions.',
  'ACTIVE',
  '{"duplicatePropertyId": 1, "matchedFields": ["address", "carpet_area_sqft", "monthly_rent"]}'
),
(
  'SIG-2026-000003',
  'DISPUTE_REOPEN_VELOCITY',
  'LOW',
  'DISPUTES',
  'dispute',
  '1',
  3,
  '2 reopen requests in 48h',
  '1 reopen request limit',
  'Dispute reopened after initial resolution without new supporting evidence documentation.',
  'ACTIVE',
  '{"disputeId": 1, "caseNumber": "ODB-DSP-2026-000001"}'
);

-- 8. Seed Canonical Initial Risk Cases
INSERT IGNORE INTO risk_cases (
  public_id, case_number, case_type, subject_user_id, subject_property_id, subject_payment_id,
  risk_level, status, assigned_to, summary, evidence, idempotency_key
) VALUES
(
  'RSK-2026-000001',
  'ODB-RSK-2026-000001',
  'PAYMENT_VELOCITY',
  3,
  1,
  2,
  'HIGH',
  'OPEN',
  NULL,
  'Repeated payment failure velocity and multiple card rejections on rent installment.',
  '{"signals": ["PAYMENT_FAILURE_REPEATED"], "failureCount": 4, "totalAmount": 28500, "ip": "49.207.140.22"}',
  'SEED:RISK:PAYMENT:2:VELOCITY'
),
(
  'RSK-2026-000002',
  'ODB-RSK-2026-000002',
  'DUPLICATE_LISTING',
  2,
  4,
  NULL,
  'MEDIUM',
  'UNDER_REVIEW',
  1,
  'Suspected duplicate listing submission for Indiranagar/Whitefield residential property.',
  '{"signals": ["LISTING_DUPLICATE_SUSPECTED"], "duplicatePropertyId": 1, "similarity": 0.98}',
  'SEED:RISK:PROPERTY:4:DUPLICATE'
);
