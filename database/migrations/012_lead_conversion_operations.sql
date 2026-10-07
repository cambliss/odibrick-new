-- =====================================================================
-- ODIBRICK · 012 · Customer Experience, Lead Management & Conversion Operations
-- =====================================================================
SET NAMES utf8mb4;

-- 1. Register Lead Management RBAC Permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('lead.read', 'lead', 'read', 'View incoming leads and customer enquiries within permitted scope'),
  ('lead.manage', 'lead', 'manage', 'Acknowledge, contact, qualify, follow up, and convert leads'),
  ('lead.assign', 'lead', 'assign', 'Odibrick Management lead assignment and governance')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Assign lead permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN')
  AND p.code IN ('lead.read', 'lead.manage', 'lead.assign');

-- 2. Enhance enquiries table for full lead lifecycle & attribution operations
ALTER TABLE enquiries
  MODIFY COLUMN status ENUM('NEW','ASSIGNED','ACKNOWLEDGED','CONTACTED','VISIT_SCHEDULED','QUALIFIED','CONVERTED','LOST','SPAM','CLOSED') NOT NULL DEFAULT 'NEW',
  ADD COLUMN assigned_user_id BIGINT UNSIGNED NULL AFTER campaign_id,
  ADD COLUMN assigned_at DATETIME NULL AFTER assigned_user_id,
  ADD COLUMN assigned_by BIGINT UNSIGNED NULL AFTER assigned_at,
  ADD COLUMN acknowledged_at DATETIME NULL AFTER responded_at,
  ADD COLUMN contacted_at DATETIME NULL AFTER acknowledged_at,
  ADD COLUMN qualified_at DATETIME NULL AFTER contacted_at,
  ADD COLUMN converted_at DATETIME NULL AFTER qualified_at,
  ADD COLUMN lost_at DATETIME NULL AFTER converted_at,
  ADD COLUMN lost_reason VARCHAR(500) NULL AFTER lost_at,
  ADD COLUMN next_follow_up_at DATETIME NULL AFTER lost_reason,
  ADD COLUMN last_contacted_at DATETIME NULL AFTER next_follow_up_at,
  ADD COLUMN follow_up_notes TEXT NULL AFTER last_contacted_at,
  ADD COLUMN is_spam TINYINT(1) NOT NULL DEFAULT 0 AFTER follow_up_notes,
  ADD COLUMN is_duplicate TINYINT(1) NOT NULL DEFAULT 0 AFTER is_spam,
  ADD COLUMN duplicate_of_enquiry_id BIGINT UNSIGNED NULL AFTER is_duplicate,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD KEY ix_enq_assigned (assigned_user_id, status),
  ADD KEY ix_enq_followup (next_follow_up_at);

-- 3. Create lead_follow_ups table for activity timeline & CRM note trail
CREATE TABLE IF NOT EXISTS lead_follow_ups (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  enquiry_id      BIGINT UNSIGNED NOT NULL,
  author_id       BIGINT UNSIGNED NOT NULL,
  note            TEXT            NOT NULL,
  contact_channel ENUM('CALL', 'EMAIL', 'CHAT', 'WHATSAPP', 'MEETING', 'OTHER') NOT NULL DEFAULT 'CALL',
  scheduled_at    DATETIME        NULL,
  completed_at    DATETIME        NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_lfu_enquiry (enquiry_id, created_at),
  KEY ix_lfu_author (author_id),
  CONSTRAINT fk_lfu_enquiry FOREIGN KEY (enquiry_id) REFERENCES enquiries (id) ON DELETE CASCADE,
  CONSTRAINT fk_lfu_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
