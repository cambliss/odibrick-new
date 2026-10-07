-- Migration 007: Invoice enhancements for Phase 5 Tax/GST Invoice Engine
-- Adds payment_id linkage, immutable snapshot data, cancellation fields and hash to invoices table

ALTER TABLE invoices
  ADD COLUMN payment_id BIGINT UNSIGNED NULL AFTER tenancy_id,
  ADD COLUMN snapshot_data JSON NULL AFTER place_of_supply,
  ADD COLUMN notes TEXT NULL,
  ADD COLUMN cancelled_at DATETIME NULL,
  ADD COLUMN cancellation_reason VARCHAR(255) NULL,
  ADD COLUMN pdf_hash VARCHAR(64) NULL,
  ADD KEY ix_inv_payment (payment_id);
