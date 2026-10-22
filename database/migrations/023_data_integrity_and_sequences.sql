-- ----------------------------------------------------------------------------
-- 023_data_integrity_and_sequences.sql
-- Phase 3: Data Integrity, Concurrency & Transactions
-- ----------------------------------------------------------------------------

-- 1. Atomic reference sequences table to eliminate race-prone SELECT MAX(id)/COUNT(*)
CREATE TABLE IF NOT EXISTS reference_sequences (
  sequence_name VARCHAR(64) NOT NULL PRIMARY KEY,
  current_value BIGINT UNSIGNED NOT NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Initialize sequences with current maximum record IDs so future sequences never collide
INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'PAY', COALESCE(MAX(id), 0) FROM payments
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'INV', COALESCE(MAX(id), 0) FROM invoices
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'PAYO', COALESCE(MAX(id), 0) FROM owner_payouts
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'LGL', COALESCE(MAX(id), 0) FROM legal_cases
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'DSP', COALESCE(MAX(id), 0) FROM disputes
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'MNT', COALESCE(MAX(id), 0) FROM maintenance_requests
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'SUP', COALESCE(MAX(id), 0) FROM support_tickets
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'MKT', COALESCE(MAX(id), 0) FROM marketing_orders
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'AGR', COALESCE(MAX(id), 0) FROM agreements
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

INSERT INTO reference_sequences (sequence_name, current_value)
SELECT 'CR', COALESCE(MAX(id), 0) FROM inspections
ON DUPLICATE KEY UPDATE current_value = GREATEST(current_value, VALUES(current_value));

-- 2. Foreign Key constraints for core relationships (D-26)
ALTER TABLE invoices
  ADD CONSTRAINT fk_inv_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_inv_payment FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL;

ALTER TABLE payments
  ADD CONSTRAINT fk_payments_inv FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;

ALTER TABLE tenancies
  ADD CONSTRAINT fk_ten_managed_agent FOREIGN KEY (managed_by_agent_id) REFERENCES agents(id) ON DELETE SET NULL;

-- 3. Financial uniqueness guarantees (preventing duplicate invoices and double-payouts)
ALTER TABLE invoices
  ADD CONSTRAINT uq_inv_payment UNIQUE (payment_id);

ALTER TABLE owner_payout_items
  ADD CONSTRAINT uq_opi_payment UNIQUE (payment_id);

-- 4. Monetary CHECK constraints ensuring non-negative financial values (D-26)
ALTER TABLE payments
  ADD CONSTRAINT chk_payments_amount CHECK (amount >= 0),
  ADD CONSTRAINT chk_payments_tax CHECK (tax_amount >= 0),
  ADD CONSTRAINT chk_payments_total CHECK (total_amount >= 0);

ALTER TABLE owner_payouts
  ADD CONSTRAINT chk_payouts_net CHECK (net_amount >= 0);

ALTER TABLE invoices
  ADD CONSTRAINT chk_invoices_total CHECK (total >= 0),
  ADD CONSTRAINT chk_invoices_subtotal CHECK (subtotal >= 0);

ALTER TABLE properties
  ADD CONSTRAINT chk_prop_rent CHECK (rent_amount IS NULL OR rent_amount >= 0),
  ADD CONSTRAINT chk_prop_deposit CHECK (security_deposit IS NULL OR security_deposit >= 0);

ALTER TABLE tenancies
  ADD CONSTRAINT chk_ten_rent CHECK (rent_amount >= 0),
  ADD CONSTRAINT chk_ten_deposit CHECK (deposit_amount >= 0);
