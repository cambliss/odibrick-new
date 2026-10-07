-- =====================================================================
-- ODIBRICK · 008 · Owner Payouts & Financial Reconciliation Engine
-- Controlled owner payable calculations, payout approvals, manual settlement,
-- and deterministic financial reconciliation.
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS owner_payouts (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id             CHAR(26)        NOT NULL,
  payout_number         VARCHAR(32)     NOT NULL,       -- ODB-PAYO-2026-000001
  owner_user_id         BIGINT UNSIGNED NOT NULL,
  payout_account_id     BIGINT UNSIGNED NULL,
  period_start          DATE            NOT NULL,
  period_end            DATE            NOT NULL,
  gross_amount          DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  deduction_amount      DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  net_amount            DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  paid_amount           DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  currency              CHAR(3)         NOT NULL DEFAULT 'INR',
  status                ENUM('CALCULATED','PENDING_REVIEW','APPROVED','PROCESSING','PAID',
                             'REJECTED','ON_HOLD','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING_REVIEW',
  reconciliation_status ENUM('UNRECONCILED','MATCHED','PARTIALLY_MATCHED','MISMATCHED')
                        NOT NULL DEFAULT 'UNRECONCILED',
  snapshot_data         JSON            NULL,
  external_reference    VARCHAR(120)    NULL,           -- UTR / Bank transfer reference
  payout_method         VARCHAR(48)     NULL,           -- NEFT / RTGS / IMPS / UPI / MANUAL
  processed_at          DATETIME        NULL,
  paid_at               DATETIME        NULL,
  reconciled_at         DATETIME        NULL,
  reconciled_by         BIGINT UNSIGNED NULL,
  approved_by           BIGINT UNSIGNED NULL,
  approved_at           DATETIME        NULL,
  rejected_by           BIGINT UNSIGNED NULL,
  rejected_at           DATETIME        NULL,
  rejection_reason      VARCHAR(255)    NULL,
  hold_reason           VARCHAR(255)    NULL,
  notes                 TEXT            NULL,
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payout_public_id (public_id),
  UNIQUE KEY uq_payout_number (payout_number),
  KEY ix_payout_owner (owner_user_id, status),
  KEY ix_payout_period (period_start, period_end),
  KEY ix_payout_reconciliation (reconciliation_status),
  CONSTRAINT fk_payout_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_payout_account FOREIGN KEY (payout_account_id) REFERENCES payment_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_payout_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_payout_reconciler FOREIGN KEY (reconciled_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS owner_payout_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payout_id      BIGINT UNSIGNED NOT NULL,
  payment_id     BIGINT UNSIGNED NULL,
  item_type      ENUM('RECEIVABLE','COMMISSION_DEDUCTION','SERVICE_FEE_DEDUCTION',
                      'MAINTENANCE_DEDUCTION','REFUND_DEDUCTION','OTHER_DEDUCTION') NOT NULL,
  direction      ENUM('CREDIT','DEBIT') NOT NULL,
  amount         DECIMAL(12,2)   NOT NULL,
  description    VARCHAR(255)    NOT NULL,
  reference_code VARCHAR(64)     NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_opi_payout (payout_id),
  KEY ix_opi_payment (payment_id),
  CONSTRAINT fk_opi_payout FOREIGN KEY (payout_id) REFERENCES owner_payouts (id) ON DELETE CASCADE,
  CONSTRAINT fk_opi_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS payout_reconciliations (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  payout_id          BIGINT UNSIGNED NOT NULL,
  expected_amount    DECIMAL(12,2)   NOT NULL,
  actual_amount      DECIMAL(12,2)   NOT NULL,
  difference         DECIMAL(12,2)   NOT NULL DEFAULT 0.00,
  status             ENUM('MATCHED','PARTIALLY_MATCHED','MISMATCHED') NOT NULL,
  external_reference VARCHAR(120)    NULL,
  settlement_date    DATE            NULL,
  reconciled_by      BIGINT UNSIGNED NOT NULL,
  reconciled_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notes              TEXT            NULL,
  PRIMARY KEY (id),
  KEY ix_pr_payout (payout_id),
  KEY ix_pr_reconciler (reconciled_by),
  CONSTRAINT fk_pr_payout FOREIGN KEY (payout_id) REFERENCES owner_payouts (id) ON DELETE CASCADE,
  CONSTRAINT fk_pr_reconciler FOREIGN KEY (reconciled_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
