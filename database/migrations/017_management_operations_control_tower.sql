-- ============================================================================
-- ODIBRICK MIGRATION 017: UNIFIED MANAGEMENT OPERATIONS CONTROL TOWER
-- WORK QUEUE, OPERATIONAL TASKS, ESCALATIONS & SLA MANAGEMENT
-- ============================================================================
SET NAMES utf8mb4;

-- 1. Insert Operations RBAC permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('operations.read', 'operations', 'read', 'View Management operations control tower, work queue, and tasks'),
  ('operations.manage', 'operations', 'manage', 'Create, update, prioritize, and manage operational tasks'),
  ('operations.assign', 'operations', 'assign', 'Assign and reassign operational tasks to staff and teams'),
  ('operations.resolve', 'operations', 'resolve', 'Resolve, close, or reopen operational tasks with governance notes'),
  ('operations.override', 'operations', 'override', 'Override task priority, SLA deadlines, and status transitions')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Grant operations permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('operations.read', 'operations.manage', 'operations.assign', 'operations.resolve', 'operations.override')
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN');

-- 2. Create operational_tasks table
CREATE TABLE IF NOT EXISTS operational_tasks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  task_type VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  source_domain VARCHAR(64) NOT NULL,
  source_entity_type VARCHAR(64) NOT NULL,
  source_entity_id VARCHAR(64) NOT NULL,
  priority ENUM('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL') NOT NULL DEFAULT 'NORMAL',
  status ENUM('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ESCALATED', 'RESOLVED', 'CLOSED', 'CANCELLED') NOT NULL DEFAULT 'OPEN',
  assigned_to BIGINT UNSIGNED NULL,
  assigned_team VARCHAR(64) NULL,
  created_by BIGINT UNSIGNED NULL,
  due_at DATETIME NULL,
  sla_due_at DATETIME NULL,
  sla_status ENUM('ON_TRACK', 'DUE_SOON', 'OVERDUE', 'BREACHED') NOT NULL DEFAULT 'ON_TRACK',
  completed_at DATETIME NULL,
  resolution_notes TEXT NULL,
  metadata JSON NULL,
  idempotency_key VARCHAR(191) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_op_task_pubid (public_id),
  UNIQUE KEY uq_op_task_idem (idempotency_key),
  KEY ix_op_task_status_priority (status, priority),
  KEY ix_op_task_source (source_domain, source_entity_type, source_entity_id),
  KEY ix_op_task_assigned_to (assigned_to, status),
  KEY ix_op_task_team (assigned_team, status),
  KEY ix_op_task_sla (sla_status, sla_due_at),
  KEY ix_op_task_created_at (created_at),
  CONSTRAINT fk_op_task_assigned FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_op_task_created FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Create operational_task_events table (Task Audit Timeline)
CREATE TABLE IF NOT EXISTS operational_task_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  event_type VARCHAR(64) NOT NULL,
  previous_state JSON NULL,
  new_state JSON NULL,
  notes TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_op_tevent_task_created (task_id, created_at),
  KEY ix_op_tevent_actor (actor_id),
  CONSTRAINT fk_op_tevent_task FOREIGN KEY (task_id) REFERENCES operational_tasks (id) ON DELETE CASCADE,
  CONSTRAINT fk_op_tevent_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Seed Canonical Initial Operational Tasks across key domains
INSERT IGNORE INTO operational_tasks (
  public_id, task_type, title, description, source_domain, source_entity_type, source_entity_id,
  priority, status, assigned_team, due_at, sla_due_at, sla_status, metadata, idempotency_key
) VALUES
(
  'TSK-2026-000101',
  'PAYMENT_ESCALATION',
  'Payment Overdue >= 7 Days Escalation (Rent #ODB-PAY-2026-000002)',
  'Tenant payment of INR 28,500 has exceeded the 7-day grace window. Operational outreach and ledger verification required.',
  'FINANCE',
  'payment',
  '2',
  'URGENT',
  'OPEN',
  'FINANCE',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR),
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 12 HOUR),
  'ON_TRACK',
  '{"amount": 28500, "currency": "INR", "daysOverdue": 8, "propertyCode": "PROP-BLR-001"}',
  'SEED:FINANCE:PAYMENT:2:ESCALATION'
),
(
  'TSK-2026-000102',
  'LEGAL_CASE_ESCALATION',
  'Legal Case Review: Eviction Notice Drafting for ODB-LGL-2026-000003',
  'Legal counsel assignment and draft eviction notice verification for tenancy in non-curable lease breach.',
  'LEGAL',
  'legal_case',
  '3',
  'CRITICAL',
  'IN_PROGRESS',
  'LEGAL',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 12 HOUR),
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 6 HOUR),
  'ON_TRACK',
  '{"caseNumber": "ODB-LGL-2026-000003", "jurisdiction": "Bengaluru", "caseType": "BREACH_OF_TERMS"}',
  'SEED:LEGAL:CASE:3:ESCALATION'
),
(
  'TSK-2026-000103',
  'COMPLIANCE_EXCEPTION',
  'Document Expiry Exception: Identity & Lease Verification Expiring',
  'Owner PAN card document verified in 2025 has reached scheduled validity threshold.',
  'COMPLIANCE',
  'document',
  '12',
  'NORMAL',
  'OPEN',
  'COMPLIANCE',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 48 HOUR),
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR),
  'ON_TRACK',
  '{"documentType": "PAN_CARD", "documentId": 12, "ownerId": 4}',
  'SEED:COMPLIANCE:DOC:12:EXPIRY'
),
(
  'TSK-2026-000104',
  'DISPUTE_REVIEW',
  'Deposit Deduction Dispute: Water Damage Claim in Indiranagar Flat',
  'Owner deducted INR 15,000 from security deposit; tenant submitted check-in photos disputing preexisting wear.',
  'DISPUTES',
  'dispute',
  '1',
  'HIGH',
  'OPEN',
  'OPERATIONS',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 36 HOUR),
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 18 HOUR),
  'ON_TRACK',
  '{"disputeId": 1, "disputedAmount": 15000, "category": "DEPOSIT_DEDUCTION"}',
  'SEED:DISPUTES:CASE:1:REVIEW'
),
(
  'TSK-2026-000105',
  'PROPERTY_MODERATION',
  'New Property Listing Moderation: Villa in Whitefield (ODB-PROP-004)',
  'High-value luxury villa listing submitted with title deed attachments requires verification.',
  'MARKETPLACE',
  'property',
  '4',
  'NORMAL',
  'OPEN',
  'MARKETPLACE',
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 24 HOUR),
  DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 12 HOUR),
  'ON_TRACK',
  '{"propertyId": 4, "city": "Bengaluru", "listingType": "RENT", "monthlyRent": 95000}',
  'SEED:MARKETPLACE:PROP:4:MODERATION'
);
