-- =====================================================================
-- ODIBRICK · 013 · Customer & Provider Engagement, Property Visit Scheduling & Conversion Operations
-- =====================================================================
SET NAMES utf8mb4;

-- 1. Register Visit Management RBAC Permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('visit.read', 'visit', 'read', 'View property visits and scheduling calendar within permitted scope'),
  ('visit.manage', 'visit', 'manage', 'Request, propose, confirm, reschedule, cancel, complete, and record visit outcomes'),
  ('visit.assign', 'visit', 'assign', 'Odibrick Management visit assignment, reassignment, conflict override and governance')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Assign visit permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN')
  AND p.code IN ('visit.read', 'visit.manage', 'visit.assign');

-- 2. Create property_visits table
CREATE TABLE IF NOT EXISTS property_visits (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id            CHAR(26)        NOT NULL,
  enquiry_id           BIGINT UNSIGNED NULL,
  property_id          BIGINT UNSIGNED NOT NULL,
  customer_user_id     BIGINT UNSIGNED NOT NULL,
  host_user_id         BIGINT UNSIGNED NOT NULL,
  scheduled_start      DATETIME        NOT NULL,
  scheduled_end        DATETIME        NOT NULL,
  timezone             VARCHAR(64)     NOT NULL DEFAULT 'Asia/Kolkata',
  status               ENUM('REQUESTED','PROPOSED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW_CUSTOMER','NO_SHOW_PROVIDER','REJECTED','EXPIRED') NOT NULL DEFAULT 'REQUESTED',
  visit_type           ENUM('IN_PERSON','VIDEO_TOUR') NOT NULL DEFAULT 'IN_PERSON',
  customer_notes       VARCHAR(1000)   NULL,
  provider_notes       VARCHAR(1000)   NULL,
  cancellation_reason  VARCHAR(500)    NULL,
  reschedule_reason    VARCHAR(500)    NULL,
  rescheduled_from_id  BIGINT UNSIGNED NULL,
  confirmed_at         DATETIME        NULL,
  completed_at         DATETIME        NULL,
  cancelled_at         DATETIME        NULL,
  no_show_at           DATETIME        NULL,
  outcome              ENUM('INTERESTED','VERY_INTERESTED','NEEDS_MORE_INFORMATION','NOT_INTERESTED','APPLICATION_EXPECTED','NO_DECISION','PROPERTY_NOT_SUITABLE','OTHER') NULL,
  outcome_notes        TEXT            NULL,
  reminder_24h_sent    TINYINT(1)      NOT NULL DEFAULT 0,
  reminder_2h_sent     TINYINT(1)      NOT NULL DEFAULT 0,
  sla_escalated        TINYINT(1)      NOT NULL DEFAULT 0,
  created_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_visit_public_id (public_id),
  KEY ix_visit_property_time (property_id, scheduled_start, scheduled_end),
  KEY ix_visit_customer (customer_user_id, status),
  KEY ix_visit_host (host_user_id, status),
  KEY ix_visit_enquiry (enquiry_id),
  KEY ix_visit_schedule (scheduled_start, status),
  CONSTRAINT fk_visit_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_visit_enquiry FOREIGN KEY (enquiry_id) REFERENCES enquiries (id) ON DELETE SET NULL,
  CONSTRAINT fk_visit_customer FOREIGN KEY (customer_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_visit_host FOREIGN KEY (host_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
