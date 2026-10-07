-- ============================================================================
-- ODIBRICK MIGRATION 015: DOCUMENT MANAGEMENT, KYC & COMPLIANCE OPERATIONS
-- ============================================================================
SET NAMES utf8mb4;

-- 1. Insert Document, KYC & Compliance RBAC permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('document.read', 'document', 'read', 'View authorized documents'),
  ('document.upload', 'document', 'upload', 'Upload documents into vault'),
  ('document.manage', 'document', 'manage', 'Manage, replace, or archive documents'),
  ('document.verify', 'document', 'verify', 'Verify or reject documents'),
  ('document.assign', 'document', 'assign', 'Assign verifiers to documents'),
  ('document.internal_note', 'document', 'internal_note', 'Record internal verification notes on documents'),
  ('kyc.read', 'kyc', 'read', 'View KYC submissions and verification status'),
  ('kyc.manage', 'kyc', 'manage', 'Manage KYC workflows, request documents, suspend or reopen'),
  ('kyc.verify', 'kyc', 'verify', 'Verify or reject user KYC records'),
  ('compliance.read', 'compliance', 'read', 'View platform compliance dashboard and audit metrics'),
  ('compliance.manage', 'compliance', 'manage', 'Manage platform compliance, resolve exceptions, and execute overrides')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Grant all document, KYC & compliance permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN (
    'document.read', 'document.upload', 'document.manage', 'document.verify', 'document.assign', 'document.internal_note',
    'kyc.read', 'kyc.manage', 'kyc.verify',
    'compliance.read', 'compliance.manage'
  )
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN');

-- Grant basic document permissions to operational roles
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('document.read', 'document.upload')
WHERE r.code IN ('OWNER', 'AGENT', 'TENANT', 'LEGAL', 'VENDOR');

-- Grant legal document & KYC read permissions to LEGAL role
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('document.read', 'document.upload', 'kyc.read')
WHERE r.code IN ('LEGAL');

-- 2. Enhance documents table
ALTER TABLE documents
  ADD COLUMN document_type VARCHAR(64) NOT NULL DEFAULT 'OTHER' AFTER category,
  ADD COLUMN context_type ENUM('USER','PROPERTY','APPLICATION','LEGAL_CASE','AGREEMENT','TENANCY','DISPUTE','MAINTENANCE','SUPPORT','KYC') NULL AFTER entity_id,
  ADD COLUMN context_id BIGINT UNSIGNED NULL AFTER context_type,
  ADD COLUMN uploaded_by BIGINT UNSIGNED NULL AFTER owner_user_id,
  ADD COLUMN verification_status ENUM('UPLOADED','UNDER_REVIEW','VERIFIED','REJECTED','EXPIRED','REPLACED','ARCHIVED') NOT NULL DEFAULT 'UPLOADED' AFTER visibility,
  ADD COLUMN verified_by BIGINT UNSIGNED NULL AFTER verification_status,
  ADD COLUMN verified_at DATETIME NULL AFTER verified_by,
  ADD COLUMN rejection_reason VARCHAR(500) NULL AFTER verified_at,
  ADD COLUMN internal_notes TEXT NULL AFTER rejection_reason,
  ADD COLUMN assigned_verifier_id BIGINT UNSIGNED NULL AFTER internal_notes,
  ADD COLUMN expiry_date DATE NULL AFTER assigned_verifier_id,
  ADD COLUMN expiry_notified_30d TINYINT(1) NOT NULL DEFAULT 0 AFTER expiry_date,
  ADD COLUMN expiry_notified_7d TINYINT(1) NOT NULL DEFAULT 0 AFTER expiry_notified_30d,
  ADD COLUMN expiry_notified_expired TINYINT(1) NOT NULL DEFAULT 0 AFTER expiry_notified_7d,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER expiry_notified_expired,
  ADD COLUMN updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
  ADD KEY ix_doc_ver_status (verification_status),
  ADD KEY ix_doc_context (context_type, context_id),
  ADD KEY ix_doc_type (document_type),
  ADD KEY ix_doc_expiry (expiry_date),
  ADD KEY ix_doc_assigned (assigned_verifier_id);

-- Backfill context_type, context_id, uploaded_by for existing rows
UPDATE documents
  SET uploaded_by = owner_user_id
  WHERE uploaded_by IS NULL;

UPDATE documents
  SET context_type = UPPER(entity_type),
      context_id = entity_id
  WHERE entity_type IS NOT NULL AND context_type IS NULL;

-- 3. Enhance kyc_records table
ALTER TABLE kyc_records
  MODIFY COLUMN status ENUM('NOT_STARTED','DOCUMENTS_PENDING','SUBMITTED','IN_REVIEW','UNDER_REVIEW','VERIFIED','REJECTED','EXPIRED','SUSPENDED') NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN internal_notes TEXT NULL AFTER rejection_reason,
  ADD COLUMN assigned_verifier_id BIGINT UNSIGNED NULL AFTER internal_notes,
  ADD COLUMN expiry_notified_30d TINYINT(1) NOT NULL DEFAULT 0 AFTER expires_at,
  ADD COLUMN expiry_notified_7d TINYINT(1) NOT NULL DEFAULT 0 AFTER expiry_notified_30d,
  ADD COLUMN expiry_notified_expired TINYINT(1) NOT NULL DEFAULT 0 AFTER expiry_notified_7d,
  ADD KEY ix_kyc_assigned (assigned_verifier_id),
  ADD KEY ix_kyc_expiry (expires_at);

-- 4. Create compliance_exceptions table for governing compliance discrepancies
CREATE TABLE IF NOT EXISTS compliance_exceptions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id VARCHAR(32) NOT NULL,
  category ENUM(
    'MISSING_REQUIRED_DOCUMENT',
    'DOCUMENT_REJECTED',
    'DOCUMENT_EXPIRED',
    'KYC_PENDING',
    'KYC_REJECTED',
    'KYC_EXPIRED',
    'PROPERTY_DOCUMENT_MISSING',
    'APPLICATION_DOCUMENT_MISSING',
    'LEGAL_DOCUMENT_MISSING',
    'OTHER'
  ) NOT NULL,
  context_type ENUM('USER','PROPERTY','APPLICATION','LEGAL_CASE','AGREEMENT','TENANCY','DISPUTE','MAINTENANCE','SUPPORT','KYC') NOT NULL,
  context_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  document_id BIGINT UNSIGNED NULL,
  title VARCHAR(190) NOT NULL,
  description TEXT NULL,
  severity ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('OPEN','IN_REVIEW','RESOLVED','OVERRIDDEN','DISMISSED') NOT NULL DEFAULT 'OPEN',
  assigned_to BIGINT UNSIGNED NULL,
  resolution_notes TEXT NULL,
  override_reason VARCHAR(500) NULL,
  resolved_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_comp_exc_pubid (public_id),
  KEY ix_comp_exc_status (status),
  KEY ix_comp_exc_context (context_type, context_id),
  KEY ix_comp_exc_user (user_id),
  KEY ix_comp_exc_assigned (assigned_to),
  CONSTRAINT fk_comp_exc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_comp_exc_doc FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE SET NULL,
  CONSTRAINT fk_comp_exc_assigned FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_comp_exc_resolved FOREIGN KEY (resolved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
