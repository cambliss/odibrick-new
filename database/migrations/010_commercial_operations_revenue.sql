-- ============================================================================
-- ODIBRICK MIGRATION 010: PLATFORM REVENUE, COMMISSION & COMMERCIAL OPERATIONS
-- ============================================================================

-- 0. Expand period_code in financial_periods if needed
ALTER TABLE financial_periods MODIFY COLUMN period_code VARCHAR(32) NOT NULL;

-- 1. Insert commercial permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('commercial.read', 'commercial', 'read', 'View commercial obligations, rules and revenue reports'),
  ('commercial.manage', 'commercial', 'manage', 'Approve, waive, adjust and manage commercial obligations'),
  ('commercial.rules.manage', 'commercial', 'rules.manage', 'Create, update and configure commercial pricing rules')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Grant commercial permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('commercial.read', 'commercial.manage', 'commercial.rules.manage')
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN');

-- 2. Commercial Rules Table
CREATE TABLE IF NOT EXISTS commercial_rules (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  public_id      CHAR(26)        NOT NULL,
  code           VARCHAR(48)     NOT NULL, -- e.g. 'RULE-COMM-STD-2026'
  name           VARCHAR(120)    NOT NULL,
  category       ENUM('COMMISSION','SERVICE_FEE','LEGAL_FEE','MARKETING_PACKAGE') NOT NULL DEFAULT 'COMMISSION',
  applies_to     ENUM('STANDARD','PROTECTED','MANAGED','SALE','ALL') NOT NULL DEFAULT 'STANDARD',
  basis          ENUM('PERCENT_OF_MONTHLY_RENT','PERCENT_OF_ANNUAL_RENT','FLAT_FEE','PERCENT_OF_TRANSACTION') NOT NULL DEFAULT 'PERCENT_OF_MONTHLY_RENT',
  percent_value  DECIMAL(5,2)    NULL,
  flat_value     DECIMAL(12,2)   NULL,
  min_amount     DECIMAL(12,2)   NULL,
  max_amount     DECIMAL(12,2)   NULL,
  payer          ENUM('OWNER','TENANT','AGENT','BUILDER','SPLIT') NOT NULL DEFAULT 'OWNER',
  tax_rate       DECIMAL(5,2)    NOT NULL DEFAULT 18.00,
  priority       INT UNSIGNED    NOT NULL DEFAULT 10,
  city           VARCHAR(120)    NULL, -- NULL = all cities
  effective_from DATE            NOT NULL,
  effective_to   DATE            NULL,
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,
  is_system      TINYINT(1)      NOT NULL DEFAULT 0,
  created_by     BIGINT UNSIGNED NULL,
  updated_by     BIGINT UNSIGNED NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comr_public_id (public_id),
  UNIQUE KEY uq_comr_code (code),
  KEY ix_comr_category_active (category, is_active, priority),
  KEY ix_comr_effective (effective_from, effective_to),
  CONSTRAINT fk_comr_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_comr_updated_by FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Commercial Obligations Table
CREATE TABLE IF NOT EXISTS commercial_obligations (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id           CHAR(26)        NOT NULL,
  obligation_number   VARCHAR(32)     NOT NULL, -- e.g. 'ODB-COM-2026-000001'
  category            ENUM('COMMISSION','SERVICE_FEE','LEGAL_FEE','MARKETING_PACKAGE') NOT NULL,
  source_type         ENUM('TENANCY','AGREEMENT','MARKETING_ORDER','LEGAL_CASE','MANUAL') NOT NULL,
  source_id           BIGINT UNSIGNED NOT NULL,
  rule_id             INT UNSIGNED    NULL,
  property_id         BIGINT UNSIGNED NULL,
  tenancy_id          BIGINT UNSIGNED NULL,
  agreement_id        BIGINT UNSIGNED NULL,
  payer_user_id       BIGINT UNSIGNED NOT NULL,
  beneficiary_user_id BIGINT UNSIGNED NULL,
  base_amount         DECIMAL(12,2)   NOT NULL,
  fee_amount          DECIMAL(12,2)   NOT NULL,
  tax_rate            DECIMAL(5,2)    NOT NULL DEFAULT 18.00,
  tax_amount          DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total_amount        DECIMAL(12,2)   NOT NULL,
  currency            CHAR(3)         NOT NULL DEFAULT 'INR',
  status              ENUM('CALCULATED','PENDING_REVIEW','APPROVED','PAYMENT_DUE','PAID','PARTIALLY_PAID','WAIVED','CANCELLED','DISPUTED') NOT NULL DEFAULT 'CALCULATED',
  calculation_snapshot JSON           NOT NULL,
  payment_id          BIGINT UNSIGNED NULL,
  invoice_id          BIGINT UNSIGNED NULL,
  dispute_id          BIGINT UNSIGNED NULL,
  approved_by         BIGINT UNSIGNED NULL,
  approved_at         DATETIME        NULL,
  waived_by           BIGINT UNSIGNED NULL,
  waived_at           DATETIME        NULL,
  waiver_reason       VARCHAR(255)    NULL,
  cancelled_by        BIGINT UNSIGNED NULL,
  cancelled_at        DATETIME        NULL,
  cancellation_reason VARCHAR(255)    NULL,
  notes               TEXT            NULL,
  created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_co_public_id (public_id),
  UNIQUE KEY uq_co_number (obligation_number),
  UNIQUE KEY uq_co_source (source_type, source_id, category),
  KEY ix_co_status (status),
  KEY ix_co_category (category),
  KEY ix_co_payer (payer_user_id),
  KEY ix_co_tenancy (tenancy_id),
  KEY ix_co_property (property_id),
  KEY ix_co_payment (payment_id),
  KEY ix_co_invoice (invoice_id),
  CONSTRAINT fk_co_rule FOREIGN KEY (rule_id) REFERENCES commercial_rules (id) ON DELETE SET NULL,
  CONSTRAINT fk_co_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT fk_co_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE SET NULL,
  CONSTRAINT fk_co_payer FOREIGN KEY (payer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_co_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_co_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL,
  CONSTRAINT fk_co_approved_by FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_co_waived_by FOREIGN KEY (waived_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_co_cancelled_by FOREIGN KEY (cancelled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Commercial Adjustments Table
CREATE TABLE IF NOT EXISTS commercial_adjustments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id         CHAR(26)        NOT NULL,
  obligation_id     BIGINT UNSIGNED NOT NULL,
  adjustment_type   ENUM('WAIVER','DISCOUNT','CORRECTION','RECALCULATION') NOT NULL,
  amount_adjusted   DECIMAL(12,2)   NOT NULL,
  reason            VARCHAR(255)    NOT NULL,
  authorized_by     BIGINT UNSIGNED NOT NULL,
  metadata          JSON            NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cadj_public_id (public_id),
  KEY ix_cadj_obligation (obligation_id),
  CONSTRAINT fk_cadj_obligation FOREIGN KEY (obligation_id) REFERENCES commercial_obligations (id) ON DELETE CASCADE,
  CONSTRAINT fk_cadj_auth_by FOREIGN KEY (authorized_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Seed default commercial rules
INSERT IGNORE INTO commercial_rules (
  public_id, code, name, category, applies_to, basis, percent_value, flat_value, min_amount, max_amount, payer, tax_rate, priority, effective_from, is_active, is_system
) VALUES
  ('01j9comrstdcomm0000000000', 'RULE-COMM-STD-2026', 'Standard Rental Brokerage Commission', 'COMMISSION', 'STANDARD', 'PERCENT_OF_MONTHLY_RENT', 100.00, NULL, 5000.00, 100000.00, 'OWNER', 18.00, 10, '2026-01-01', 1, 1),
  ('01j9comrmngcomm0000000000', 'RULE-COMM-MNG-2026', 'Managed Property Full-Service Commission', 'COMMISSION', 'MANAGED', 'PERCENT_OF_MONTHLY_RENT', 150.00, NULL, 7500.00, 150000.00, 'OWNER', 18.00, 20, '2026-01-01', 1, 1),
  ('01j9comrprtcomm0000000000', 'RULE-COMM-PRT-2026', 'Protected Plan Rental Commission', 'COMMISSION', 'PROTECTED', 'PERCENT_OF_MONTHLY_RENT', 120.00, NULL, 6000.00, 120000.00, 'OWNER', 18.00, 15, '2026-01-01', 1, 1),
  ('01j9comrstdserv0000000000', 'RULE-SRV-STD-2026', 'Property Verification & Onboarding Service Fee', 'SERVICE_FEE', 'ALL', 'FLAT_FEE', NULL, 2500.00, NULL, NULL, 'OWNER', 18.00, 10, '2026-01-01', 1, 1),
  ('01j9comrstdlgl0000000000', 'RULE-LGL-STD-2026', 'Leave & License Legal Drafting & Review Fee', 'LEGAL_FEE', 'ALL', 'FLAT_FEE', NULL, 1500.00, NULL, NULL, 'TENANT', 18.00, 10, '2026-01-01', 1, 1),
  ('01j9comrstdmkt0000000000', 'RULE-MKT-STARTER-2026', 'Cambliss Starter Marketing Package', 'MARKETING_PACKAGE', 'ALL', 'FLAT_FEE', NULL, 15000.00, NULL, NULL, 'OWNER', 18.00, 10, '2026-01-01', 1, 1);
