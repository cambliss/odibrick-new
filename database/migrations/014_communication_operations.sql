-- ============================================================================
-- ODIBRICK MIGRATION 014: COMMUNICATION, MESSAGING & CONVERSATION MANAGEMENT
-- ============================================================================
SET NAMES utf8mb4;

-- 1. Insert communication & conversation RBAC permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('conversation.read', 'conversation', 'read', 'View authorized business conversations and message history'),
  ('conversation.send', 'conversation', 'send', 'Send messages within authorized business conversations'),
  ('conversation.manage', 'conversation', 'manage', 'Management conversation supervision, assignment, escalation, resolve, reopen, and close'),
  ('conversation.internal_note', 'conversation', 'internal_note', 'Post and view internal management-only operational notes'),
  ('conversation.assign', 'conversation', 'assign', 'Assign and reassign internal handlers to conversations'),
  ('conversation.escalate', 'conversation', 'escalate', 'Escalate conversations to management for priority handling')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Grant conversation permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('conversation.read', 'conversation.send', 'conversation.manage', 'conversation.internal_note', 'conversation.assign', 'conversation.escalate')
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN');

-- Grant basic read/send to operational roles
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('conversation.read', 'conversation.send')
WHERE r.code IN ('OWNER', 'AGENT', 'TENANT');

-- 2. Alter conversations table
ALTER TABLE conversations
  MODIFY COLUMN context_type ENUM('PROPERTY','ENQUIRY','VISIT','APPLICATION','LEGAL_CASE','TENANCY','MAINTENANCE','DISPUTE','SUPPORT') NOT NULL,
  ADD COLUMN public_id VARCHAR(32) NULL AFTER id,
  ADD COLUMN title VARCHAR(190) NULL AFTER context_id,
  ADD COLUMN status ENUM('OPEN','ACTIVE','WAITING_FOR_CUSTOMER','WAITING_FOR_PROVIDER','ESCALATED','RESOLVED','CLOSED') NOT NULL DEFAULT 'OPEN' AFTER title,
  ADD COLUMN created_by BIGINT UNSIGNED NULL AFTER status,
  ADD COLUMN assigned_to BIGINT UNSIGNED NULL AFTER created_by,
  ADD COLUMN last_message_at DATETIME NULL AFTER assigned_to,
  ADD COLUMN sla_breached TINYINT(1) NOT NULL DEFAULT 0 AFTER last_message_at,
  ADD COLUMN sla_escalated_at DATETIME NULL AFTER sla_breached,
  ADD COLUMN closed_at DATETIME NULL AFTER sla_escalated_at,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD UNIQUE KEY uq_conv_public_id (public_id),
  ADD KEY ix_conv_status (status),
  ADD KEY ix_conv_assigned (assigned_to),
  ADD KEY ix_conv_last_msg (last_message_at);

-- Populate public_id for any existing conversations
UPDATE conversations SET public_id = CONCAT('ODB-CNV-2026-', LPAD(id, 6, '0')) WHERE public_id IS NULL;

-- 3. Alter conversation_participants table
ALTER TABLE conversation_participants
  ADD COLUMN role ENUM('CUSTOMER','OWNER','PROVIDER','AGENT','LEGAL','MANAGEMENT','VENDOR','OBSERVER') NULL DEFAULT 'CUSTOMER' AFTER user_id,
  ADD COLUMN joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER last_read_at,
  ADD COLUMN is_muted TINYINT(1) NOT NULL DEFAULT 0 AFTER joined_at;

-- 4. Alter messages table
ALTER TABLE messages
  ADD COLUMN message_type ENUM('TEXT','SYSTEM','NOTE','STATUS_UPDATE') NOT NULL DEFAULT 'TEXT' AFTER sender_id,
  ADD COLUMN is_internal TINYINT(1) NOT NULL DEFAULT 0 AFTER message_type,
  ADD COLUMN edited_at DATETIME NULL AFTER document_id,
  ADD COLUMN deleted_at DATETIME NULL AFTER edited_at,
  ADD KEY ix_msg_internal (conversation_id, is_internal, created_at);
