-- ----------------------------------------------------------------------------
-- 024_agreement_stamping_verification.sql
-- Phase 4: Stamping Verification Workflow
-- Adds traceable verification metadata to agreements table
-- ----------------------------------------------------------------------------

ALTER TABLE agreements
  ADD COLUMN stamp_document_id BIGINT UNSIGNED NULL AFTER stamp_reference,
  ADD COLUMN stamp_verified_by BIGINT UNSIGNED NULL AFTER stamp_document_id,
  ADD COLUMN stamp_verified_at DATETIME NULL AFTER stamp_verified_by,
  ADD COLUMN stamp_amount DECIMAL(10,2) NULL AFTER stamp_verified_at,
  ADD COLUMN stamp_state VARCHAR(64) NULL AFTER stamp_amount,
  ADD COLUMN stamp_rejection_reason VARCHAR(500) NULL AFTER stamp_state,
  ADD CONSTRAINT fk_agr_stamp_doc FOREIGN KEY (stamp_document_id) REFERENCES documents (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_agr_stamp_verifier FOREIGN KEY (stamp_verified_by) REFERENCES users (id) ON DELETE SET NULL;
