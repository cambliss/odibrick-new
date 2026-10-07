-- ============================================================================
-- ODIBRICK MIGRATION 016: CENTRAL EVENT & WORKFLOW AUTOMATION ENGINE
-- ============================================================================
SET NAMES utf8mb4;

-- 1. Insert Automation RBAC permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('automation.read', 'automation', 'read', 'View automation activity, event stream, and execution logs'),
  ('automation.manage', 'automation', 'manage', 'Manage workflow rules, trigger retries, and acknowledge failures'),
  ('automation.trigger', 'automation', 'trigger', 'Trigger scheduled workflow and SLA engine runs'),
  ('automation.override', 'automation', 'override', 'Execute administrative workflow overrides and rule toggles')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Grant automation permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('automation.read', 'automation.manage', 'automation.trigger', 'automation.override')
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN');

-- 2. Create workflow_events table (Durable Event Store)
CREATE TABLE IF NOT EXISTS workflow_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  entity_type VARCHAR(48) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  actor_id BIGINT UNSIGNED NULL,
  actor_role VARCHAR(48) NULL,
  correlation_id VARCHAR(64) NULL,
  idempotency_key VARCHAR(128) NULL,
  payload JSON NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wf_event_pubid (public_id),
  KEY ix_wf_event_type (event_type),
  KEY ix_wf_event_entity (entity_type, entity_id),
  KEY ix_wf_event_actor (actor_id),
  KEY ix_wf_event_corr (correlation_id),
  KEY ix_wf_event_idem (idempotency_key),
  KEY ix_wf_event_occurred (occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Create workflow_rules table (Predefined & Governed Rules)
CREATE TABLE IF NOT EXISTS workflow_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rule_code VARCHAR(64) NOT NULL,
  name VARCHAR(190) NOT NULL,
  description TEXT NULL,
  event_type VARCHAR(64) NOT NULL,
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  priority INT NOT NULL DEFAULT 100,
  conditions JSON NOT NULL,
  actions JSON NOT NULL,
  created_by BIGINT UNSIGNED NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wf_rule_code (rule_code),
  KEY ix_wf_rule_event (event_type, is_enabled, priority),
  CONSTRAINT fk_wf_rule_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_wf_rule_updater FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Create workflow_executions table (Action Execution Ledger & Retries)
CREATE TABLE IF NOT EXISTS workflow_executions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  rule_id BIGINT UNSIGNED NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED') NOT NULL DEFAULT 'PENDING',
  action_type VARCHAR(64) NOT NULL,
  action_payload JSON NULL,
  result_payload JSON NULL,
  retry_count INT NOT NULL DEFAULT 0,
  max_retries INT NOT NULL DEFAULT 3,
  last_error TEXT NULL,
  acknowledged TINYINT(1) NOT NULL DEFAULT 0,
  acknowledged_by BIGINT UNSIGNED NULL,
  acknowledged_at DATETIME NULL,
  processed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wf_exec_pubid (public_id),
  UNIQUE KEY uq_wf_exec_idem (idempotency_key),
  KEY ix_wf_exec_status (status),
  KEY ix_wf_exec_event (event_id),
  KEY ix_wf_exec_rule (rule_id),
  KEY ix_wf_exec_processed (processed_at),
  CONSTRAINT fk_wf_exec_event FOREIGN KEY (event_id) REFERENCES workflow_events (id) ON DELETE CASCADE,
  CONSTRAINT fk_wf_exec_rule FOREIGN KEY (rule_id) REFERENCES workflow_rules (id) ON DELETE CASCADE,
  CONSTRAINT fk_wf_exec_ack_user FOREIGN KEY (acknowledged_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Create user_notification_preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  category VARCHAR(48) NOT NULL,
  channel ENUM('IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH') NOT NULL DEFAULT 'IN_APP',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_user_pref_cat_chan (user_id, category, channel),
  KEY ix_user_pref_user (user_id),
  CONSTRAINT fk_user_pref_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 6. Seed Standard Governed Workflow Rules
INSERT IGNORE INTO workflow_rules (rule_code, name, description, event_type, is_enabled, priority, conditions, actions) VALUES
(
  'RULE-PAY-DUE-01',
  'Payment Due Alert',
  'Dispatches payment due notice to the designated payer.',
  'PAYMENT_DUE',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "PAYER", "eventCode": "PAYMENT_DUE", "title": "Payment is Due", "severity": "ACTION"}]'
),
(
  'RULE-PAY-OVERDUE-01',
  'Payment Overdue Alert',
  'Notifies the payer that their payment obligation is past due.',
  'PAYMENT_OVERDUE',
  1,
  20,
  '{"minDaysOverdue": 1}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "PAYER", "eventCode": "PAYMENT_OVERDUE", "title": "Payment Overdue Notice", "severity": "WARNING"}]'
),
(
  'RULE-PAY-ESCALATE-01',
  'Payment Overdue Management Escalation',
  'Escalates payments overdue for 7+ days to the Management governance queue.',
  'PAYMENT_OVERDUE',
  1,
  30,
  '{"minDaysOverdue": 7}',
  '[{"type": "ESCALATE_TO_MANAGEMENT", "severity": "CRITICAL", "notes": "Payment overdue >= 7 days. Management intervention requested."}]'
),
(
  'RULE-DOC-EXPIRING-01',
  'Document Expiring Notice',
  'Alerts the document owner when a verified document is nearing expiration.',
  'DOCUMENT_EXPIRING',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "OWNER", "eventCode": "DOCUMENT_EXPIRING_SOON", "title": "Document Expiring Soon", "severity": "WARNING"}]'
),
(
  'RULE-DOC-EXPIRED-01',
  'Document Expired Handling',
  'Alerts the document owner and flags a compliance exception for expired documents.',
  'DOCUMENT_EXPIRED',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "OWNER", "eventCode": "DOCUMENT_EXPIRED", "title": "Document Expired", "severity": "CRITICAL"}, {"type": "CREATE_COMPLIANCE_EXCEPTION", "category": "DOCUMENT_EXPIRED", "severity": "HIGH"}]'
),
(
  'RULE-KYC-SUBMITTED-01',
  'KYC Submission Confirmation',
  'Confirms receipt of applicant KYC submission and initiates review workflow.',
  'KYC_SUBMITTED',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "ACTOR", "eventCode": "KYC_SUBMITTED", "title": "KYC Submitted for Review", "severity": "INFO"}]'
),
(
  'RULE-KYC-VERIFIED-01',
  'KYC Approval Notification',
  'Notifies the user when their identity profile is verified and approved.',
  'KYC_VERIFIED',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "ACTOR", "eventCode": "KYC_APPROVED", "title": "Identity Verified", "severity": "INFO"}]'
),
(
  'RULE-KYC-REJECTED-01',
  'KYC Rejection Notice',
  'Alerts user when KYC is rejected with required correction instructions.',
  'KYC_REJECTED',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "ACTOR", "eventCode": "KYC_REJECTED", "title": "KYC Needs Correction", "severity": "ACTION"}]'
),
(
  'RULE-LEAD-ASSIGNED-01',
  'Lead Assigned Notification',
  'Alerts the assigned agent/owner of a newly assigned lead enquiry.',
  'LEAD_ASSIGNED',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "ASSIGNEE", "eventCode": "LEAD_ASSIGNED", "title": "New Lead Assigned", "severity": "ACTION"}]'
),
(
  'RULE-LEAD-STALE-01',
  'Stale Lead SLA Escalation',
  'Escalates leads unacknowledged for > 24 hours to the Management queue.',
  'LEAD_STALE',
  1,
  20,
  '{"hoursUnacknowledged": 24}',
  '[{"type": "ESCALATE_TO_MANAGEMENT", "severity": "HIGH", "notes": "Lead unacknowledged > 24 hours. SLA breached."}]'
),
(
  'RULE-VISIT-REMINDER-01',
  'Visit Walkthrough Reminder',
  'Dispatches appointment reminders to both visitor and host.',
  'VISIT_REMINDER_DUE',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "PARTIES", "eventCode": "VISIT_REMINDER", "title": "Upcoming Property Visit", "severity": "INFO"}]'
),
(
  'RULE-VISIT-COMPLETED-01',
  'Visit Completed Follow-Up',
  'Sends post-visit follow up and conversion prompts.',
  'VISIT_COMPLETED',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "CUSTOMER", "eventCode": "VISIT_COMPLETED", "title": "Visit Completed", "severity": "INFO"}]'
),
(
  'RULE-DISPUTE-ESCALATED-01',
  'Dispute Legal Escalation',
  'Escalates active disputes to the Legal & Management intervention team.',
  'DISPUTE_ESCALATED',
  1,
  10,
  '{}',
  '[{"type": "ESCALATE_TO_MANAGEMENT", "severity": "CRITICAL", "notes": "Dispute escalated to legal review."}]'
),
(
  'RULE-CONV-ESCALATED-01',
  'Conversation SLA Escalation',
  'Flags conversations requiring priority management resolution.',
  'CONVERSATION_ESCALATED',
  1,
  10,
  '{}',
  '[{"type": "ESCALATE_TO_MANAGEMENT", "severity": "HIGH", "notes": "Conversation SLA breached. Priority handling required."}]'
),
(
  'RULE-TENANCY-RENEWAL-01',
  'Tenancy Renewal Due Alert',
  'Dispatches advance lease renewal notices to owner and tenant.',
  'TENANCY_RENEWAL_DUE',
  1,
  10,
  '{}',
  '[{"type": "SEND_NOTIFICATION", "recipient": "PARTIES", "eventCode": "TENANCY_RENEWAL_DUE", "title": "Tenancy Renewal Approaching", "severity": "ACTION"}]'
);
