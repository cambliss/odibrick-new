-- =====================================================================
-- ODIBRICK · 004 · Payments, commissions, invoices, Cambliss marketing
-- No wallet / no unlicensed escrow: settlement is recorded, not custodied.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS payment_accounts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       BIGINT UNSIGNED NOT NULL,
  account_type  ENUM('BANK','UPI') NOT NULL DEFAULT 'BANK',
  holder_name   VARCHAR(160)    NOT NULL,
  account_last4 VARCHAR(4)      NULL,
  ifsc          VARCHAR(16)     NULL,
  upi_handle    VARCHAR(120)    NULL,
  provider_ref  VARCHAR(120)    NULL,             -- tokenised at the payment provider
  is_primary    TINYINT(1)      NOT NULL DEFAULT 0,
  verified_at   DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pacc_user (user_id),
  CONSTRAINT fk_pacc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- payments = an amount that is owed / requested
CREATE TABLE IF NOT EXISTS payments (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id         CHAR(26)        NOT NULL,
  reference_code    VARCHAR(32)     NOT NULL,     -- ODB-PAY-2026-000123
  payer_user_id     BIGINT UNSIGNED NOT NULL,
  payee_user_id     BIGINT UNSIGNED NULL,         -- NULL when Odibrick is the payee
  tenancy_id        BIGINT UNSIGNED NULL,
  property_id       BIGINT UNSIGNED NULL,
  purpose           ENUM('SECURITY_DEPOSIT','ADVANCE_RENT','MONTHLY_RENT','MAINTENANCE',
                         'SERVICE_FEE','LEGAL_FEE','COMMISSION','MARKETING_PACKAGE',
                         'INSURANCE_PREMIUM','REFUND','PENALTY','OTHER') NOT NULL,
  amount            DECIMAL(12,2)   NOT NULL,
  tax_amount        DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total_amount      DECIMAL(12,2)   NOT NULL,
  currency          CHAR(3)         NOT NULL DEFAULT 'INR',
  status            ENUM('DUE','INITIATED','PROCESSING','PAID','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED')
                    NOT NULL DEFAULT 'DUE',
  settlement_status ENUM('NOT_APPLICABLE','PENDING','IN_TRANSIT','SETTLED','ON_HOLD','FAILED')
                    NOT NULL DEFAULT 'PENDING',
  settlement_mode   ENUM('DIRECT_TO_PAYEE','PLATFORM_COLLECT_AND_PAYOUT','OFFLINE_RECORDED')
                    NOT NULL DEFAULT 'DIRECT_TO_PAYEE',
  due_date          DATE            NULL,
  paid_at           DATETIME        NULL,
  settled_at        DATETIME        NULL,
  invoice_id        BIGINT UNSIGNED NULL,
  notes             VARCHAR(500)    NULL,
  is_demo           TINYINT(1)      NOT NULL DEFAULT 0,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pay_public_id (public_id),
  UNIQUE KEY uq_pay_reference (reference_code),
  KEY ix_pay_payer (payer_user_id, status),
  KEY ix_pay_payee (payee_user_id, status),
  KEY ix_pay_tenancy (tenancy_id),
  KEY ix_pay_due (status, due_date),
  CONSTRAINT fk_pay_payer FOREIGN KEY (payer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_payee FOREIGN KEY (payee_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_pay_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE SET NULL,
  CONSTRAINT fk_pay_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- payment_transactions = every attempt/movement against a payment (immutable ledger)
CREATE TABLE IF NOT EXISTS payment_transactions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payment_id       BIGINT UNSIGNED NOT NULL,
  txn_reference    VARCHAR(64)     NOT NULL,
  direction        ENUM('COLLECTION','PAYOUT','REFUND','FEE','ADJUSTMENT') NOT NULL,
  provider         VARCHAR(48)     NOT NULL,      -- razorpay / cashfree / manual
  provider_txn_id  VARCHAR(190)    NULL,
  provider_order_id VARCHAR(190)   NULL,
  method           VARCHAR(48)     NULL,          -- UPI / NETBANKING / CARD / NEFT
  amount           DECIMAL(12,2)   NOT NULL,
  currency         CHAR(3)         NOT NULL DEFAULT 'INR',
  status           ENUM('CREATED','PENDING','SUCCESS','FAILED','REVERSED') NOT NULL DEFAULT 'CREATED',
  failure_code     VARCHAR(64)     NULL,
  failure_reason   VARCHAR(255)    NULL,
  raw_payload      JSON            NULL,
  idempotency_key  VARCHAR(96)     NULL,
  occurred_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_txn_reference (txn_reference),
  UNIQUE KEY uq_txn_idempotency (idempotency_key),
  KEY ix_txn_payment (payment_id),
  KEY ix_txn_provider (provider, provider_txn_id),
  CONSTRAINT fk_txn_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invoices (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_number  VARCHAR(32)     NOT NULL,       -- ODB/2026-27/000123
  user_id         BIGINT UNSIGNED NOT NULL,
  tenancy_id      BIGINT UNSIGNED NULL,
  billing_name    VARCHAR(190)    NOT NULL,
  billing_address VARCHAR(400)    NULL,
  gstin           VARCHAR(20)     NULL,
  place_of_supply VARCHAR(64)     NULL,
  subtotal        DECIMAL(12,2)   NOT NULL,
  cgst            DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  sgst            DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  igst            DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total           DECIMAL(12,2)   NOT NULL,
  status          ENUM('DRAFT','ISSUED','PAID','VOID') NOT NULL DEFAULT 'DRAFT',
  issued_on       DATE            NULL,
  document_id     BIGINT UNSIGNED NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inv_number (invoice_number),
  KEY ix_inv_user (user_id),
  CONSTRAINT fk_inv_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_inv_doc FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS invoice_lines (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  invoice_id  BIGINT UNSIGNED NOT NULL,
  description VARCHAR(255)    NOT NULL,
  hsn_sac     VARCHAR(12)     NULL,
  quantity    DECIMAL(8,2)    NOT NULL DEFAULT 1.00,
  unit_price  DECIMAL(12,2)   NOT NULL,
  tax_rate    DECIMAL(5,2)    NOT NULL DEFAULT 18.00,
  line_total  DECIMAL(12,2)   NOT NULL,
  PRIMARY KEY (id),
  KEY ix_il_invoice (invoice_id),
  CONSTRAINT fk_il_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- configurable annual commission / service-fee rules (Admin controlled)
CREATE TABLE IF NOT EXISTS commission_rules (
  id             INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  code           VARCHAR(48)     NOT NULL,
  name           VARCHAR(120)    NOT NULL,
  applies_to     ENUM('STANDARD','PROTECTED','MANAGED','SALE') NOT NULL DEFAULT 'STANDARD',
  basis          ENUM('PERCENT_OF_ANNUAL_RENT','PERCENT_OF_MONTHLY_RENT','FLAT_ANNUAL','PERCENT_OF_SALE')
                 NOT NULL DEFAULT 'PERCENT_OF_MONTHLY_RENT',
  percent_value  DECIMAL(5,2)    NULL,
  flat_value     DECIMAL(12,2)   NULL,
  min_amount     DECIMAL(12,2)   NULL,
  max_amount     DECIMAL(12,2)   NULL,
  payer          ENUM('OWNER','TENANT','SPLIT') NOT NULL DEFAULT 'OWNER',
  tax_rate       DECIMAL(5,2)    NOT NULL DEFAULT 18.00,
  city           VARCHAR(120)    NULL,            -- NULL = all cities
  effective_from DATE            NOT NULL,
  effective_to   DATE            NULL,
  is_active      TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cr_code (code),
  KEY ix_cr_applies (applies_to, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS commissions (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenancy_id      BIGINT UNSIGNED NOT NULL,
  rule_id         INT UNSIGNED    NULL,
  cycle_year      SMALLINT UNSIGNED NOT NULL,     -- annual model
  period_start    DATE            NOT NULL,
  period_end      DATE            NOT NULL,
  base_amount     DECIMAL(12,2)   NOT NULL,
  commission_amount DECIMAL(12,2) NOT NULL,
  tax_amount      DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total_amount    DECIMAL(12,2)   NOT NULL,
  payer           ENUM('OWNER','TENANT','SPLIT') NOT NULL DEFAULT 'OWNER',
  status          ENUM('SCHEDULED','INVOICED','PAID','WAIVED','OVERDUE','WRITTEN_OFF') NOT NULL DEFAULT 'SCHEDULED',
  grace_until     DATE            NULL,
  payment_id      BIGINT UNSIGNED NULL,
  invoice_id      BIGINT UNSIGNED NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comm_tenancy_cycle (tenancy_id, cycle_year),
  KEY ix_comm_status (status, period_end),
  CONSTRAINT fk_comm_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE CASCADE,
  CONSTRAINT fk_comm_rule FOREIGN KEY (rule_id) REFERENCES commission_rules (id) ON DELETE SET NULL,
  CONSTRAINT fk_comm_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_comm_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- Cambliss marketing marketplace
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_packages (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  code            VARCHAR(48)     NOT NULL,       -- STARTER / GROWTH / PREMIUM / BUILDER_ENTERPRISE
  name            VARCHAR(120)    NOT NULL,
  tagline         VARCHAR(190)    NULL,
  audience        ENUM('AGENT','BUILDER','OWNER','ANY') NOT NULL DEFAULT 'ANY',
  duration_days   SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  price           DECIMAL(12,2)   NOT NULL,
  tax_rate        DECIMAL(5,2)    NOT NULL DEFAULT 18.00,
  ad_budget_included DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  features        JSON            NOT NULL,       -- ["Creative design","Lead gen",...]
  channels        JSON            NULL,           -- ["META","GOOGLE","SEO","EMAIL"]
  featured_slots  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_custom_quote TINYINT(1)      NOT NULL DEFAULT 0,
  sort_order      SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mp_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS marketing_orders (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id     CHAR(26)        NOT NULL,
  order_number  VARCHAR(32)     NOT NULL,
  package_id    INT UNSIGNED    NOT NULL,
  buyer_user_id BIGINT UNSIGNED NOT NULL,
  agent_id      BIGINT UNSIGNED NULL,
  builder_id    BIGINT UNSIGNED NULL,
  amount        DECIMAL(12,2)   NOT NULL,
  tax_amount    DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  total_amount  DECIMAL(12,2)   NOT NULL,
  status        ENUM('REQUESTED','AWAITING_PAYMENT','PAID','APPROVED','IN_PRODUCTION',
                     'SCHEDULED','LIVE','COMPLETED','CANCELLED','REFUNDED') NOT NULL DEFAULT 'REQUESTED',
  payment_id    BIGINT UNSIGNED NULL,
  invoice_id    BIGINT UNSIGNED NULL,
  brief         TEXT            NULL,
  starts_on     DATE            NULL,
  ends_on       DATE            NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mo_public_id (public_id),
  UNIQUE KEY uq_mo_number (order_number),
  KEY ix_mo_buyer (buyer_user_id, status),
  CONSTRAINT fk_mo_package FOREIGN KEY (package_id) REFERENCES marketing_packages (id) ON DELETE RESTRICT,
  CONSTRAINT fk_mo_buyer FOREIGN KEY (buyer_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_mo_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS campaigns (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id      CHAR(26)        NOT NULL,
  order_id       BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(190)    NOT NULL,
  objective      ENUM('LEADS','VISIBILITY','SITE_VISITS','BOOKINGS') NOT NULL DEFAULT 'LEADS',
  status         ENUM('REQUESTED','APPROVED','IN_PRODUCTION','SCHEDULED','LIVE','PAUSED','COMPLETED')
                 NOT NULL DEFAULT 'REQUESTED',
  owner_manager_id BIGINT UNSIGNED NULL,          -- Cambliss account manager
  budget         DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  spend          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  impressions    INT UNSIGNED    NOT NULL DEFAULT 0,
  clicks         INT UNSIGNED    NOT NULL DEFAULT 0,
  leads          INT UNSIGNED    NOT NULL DEFAULT 0,
  starts_on      DATE            NULL,
  ends_on        DATE            NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_camp_public_id (public_id),
  KEY ix_camp_status (status),
  CONSTRAINT fk_camp_order FOREIGN KEY (order_id) REFERENCES marketing_orders (id) ON DELETE CASCADE,
  CONSTRAINT fk_camp_manager FOREIGN KEY (owner_manager_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS campaign_properties (
  campaign_id  BIGINT UNSIGNED NOT NULL,
  property_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (campaign_id, property_id),
  CONSTRAINT fk_cp_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS campaign_leads (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id  BIGINT UNSIGNED NOT NULL,
  property_id  BIGINT UNSIGNED NULL,
  enquiry_id   BIGINT UNSIGNED NULL,
  name         VARCHAR(160)    NOT NULL,
  phone        VARCHAR(20)     NULL,
  email        VARCHAR(190)    NULL,
  channel      VARCHAR(48)     NULL,
  score        TINYINT UNSIGNED NULL,             -- assistive lead scoring
  status       ENUM('NEW','CONTACTED','QUALIFIED','VISIT','CONVERTED','LOST') NOT NULL DEFAULT 'NEW',
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_lead_campaign (campaign_id, status),
  CONSTRAINT fk_lead_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_lead_enquiry FOREIGN KEY (enquiry_id) REFERENCES enquiries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
