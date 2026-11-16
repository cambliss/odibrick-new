-- ----------------------------------------------------------------------------
-- 026_kyc_passport_first.sql
-- Phase 3A: Passport-first KYC data model (additive only)
--
-- WHAT THIS DOES
--   * Adds PROCESSING to kyc_records.status and four additive control columns.
--   * Creates kyc_verification_attempts, kyc_identity_documents, kyc_consents.
--   * Adds permissions document.read.kyc and kyc.override and grants them.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   * No UPDATE/DELETE/INSERT on kyc_records or documents. Existing rows,
--     existing VERIFIED statuses and legacy id_reference values are untouched.
--   * No backfilled consent, passport or verification data. Historical users have
--     no kyc_consents / kyc_identity_documents rows, and that is intentional.
--   * No Aadhaar support: kyc_identity_documents.doc_type is constrained to
--     exclude AADHAAR. Enabling it needs a separate legal/privacy review AND a
--     migration that drops chk_kyc_idoc_type.
--   * No unique constraint on number_hmac (duplicates are flagged for manual
--     review, never blocked).
--   * No grant of document.read.any or compliance.read to KYC_TEAM.
--
-- REQUIREMENTS
--   MySQL 8.0.16+ (CHECK constraints are enforced from 8.0.16; on older 8.0.x they
--   parse but are ignored, and the application layer still enforces the rules).
--   Generated columns (5.7+/8.0). InnoDB. Applied once by database/migrate.js
--   (recorded in schema_migrations with a checksum).
--
-- ROLLBACK CONSIDERATIONS (documented only - never run automatically)
--   Rollback is manual and must be reviewed because the new tables hold identity
--   evidence once KYC submissions exist:
--     1. Application must be rolled back first (new code reads these objects).
--     2. ALTER TABLE kyc_records DROP FOREIGN KEY fk_kyc_current_attempt,
--          DROP FOREIGN KEY fk_kyc_mandatory_doc,
--          DROP COLUMN decision_source, DROP COLUMN decision_version,
--          DROP COLUMN current_attempt_id, DROP COLUMN mandatory_document_id;
--     3. DROP TABLE kyc_identity_documents, kyc_consents, kyc_verification_attempts;
--        (only after exporting/retention review - data loss).
--     4. Remove PROCESSING from the status enum ONLY if no row uses it:
--        confirm SELECT COUNT(*) FROM kyc_records WHERE status = 'PROCESSING' = 0.
--     5. DELETE FROM role_permissions / permissions for document.read.kyc and
--        kyc.override.
-- ----------------------------------------------------------------------------
SET NAMES utf8mb4;

-- 1. Verification attempts -----------------------------------------------------
--    Created before kyc_records gets current_attempt_id so the circular
--    reference (kyc_records <-> attempts) is resolved by adding that FK last.
CREATE TABLE IF NOT EXISTS kyc_verification_attempts (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kyc_record_id    BIGINT UNSIGNED NOT NULL,
  attempt_no       INT UNSIGNED    NOT NULL,
  trigger_type     ENUM('SUBMIT','RESUBMIT','RETRY','MANUAL') NOT NULL DEFAULT 'SUBMIT',
  provider         VARCHAR(48)     NOT NULL,              -- adapter key, e.g. 'manual'
  provider_ref     VARCHAR(120)    NULL,                  -- provider's own reference id
  idempotency_key  VARCHAR(80)     NOT NULL,
  status           ENUM('QUEUED','RUNNING','COMPLETED','FAILED','TIMED_OUT','SUPERSEDED')
                                   NOT NULL DEFAULT 'QUEUED',
  outcome          ENUM('PASS','FAIL','INCONCLUSIVE','ERROR') NULL,
  checks           JSON            NULL,                  -- normalised per-check outcomes, NO PII
  risk_score       DECIMAL(5,2)    NULL,
  failure_code     VARCHAR(64)     NULL,                  -- machine code, never free-text PII
  retry_count      INT UNSIGNED    NOT NULL DEFAULT 0,
  next_retry_at    DATETIME        NULL,
  started_at       DATETIME        NULL,
  completed_at     DATETIME        NULL,
  created_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kyc_attempt_no (kyc_record_id, attempt_no),
  UNIQUE KEY uq_kyc_attempt_idem (provider, idempotency_key),
  KEY ix_kyc_attempt_status_retry (status, next_retry_at),
  KEY ix_kyc_attempt_provider_ref (provider, provider_ref),
  CONSTRAINT fk_kyc_attempt_record FOREIGN KEY (kyc_record_id) REFERENCES kyc_records (id) ON DELETE CASCADE,
  CONSTRAINT fk_kyc_attempt_creator FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. kyc_records additions (reuses id_type, id_last4, status, legal_name,
--    submitted_at, reviewer_id, reviewed_at, rejection_reason, expires_at,
--    internal_notes, assigned_verifier_id; id_reference is left untouched).
--    The enum list below is the 015 list with PROCESSING appended LAST so MySQL can
--    apply it without rewriting the table.
ALTER TABLE kyc_records
  MODIFY COLUMN status ENUM('NOT_STARTED','DOCUMENTS_PENDING','SUBMITTED','IN_REVIEW','UNDER_REVIEW',
                            'VERIFIED','REJECTED','EXPIRED','SUSPENDED','PROCESSING')
                       NOT NULL DEFAULT 'NOT_STARTED',
  ADD COLUMN decision_source ENUM('AUTOMATED','MANUAL','OVERRIDE') NULL AFTER reviewed_at,
  ADD COLUMN decision_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER decision_source,
  ADD COLUMN current_attempt_id BIGINT UNSIGNED NULL AFTER decision_version,
  ADD COLUMN mandatory_document_id BIGINT UNSIGNED NULL AFTER current_attempt_id,
  ADD KEY ix_kyc_current_attempt (current_attempt_id),
  ADD KEY ix_kyc_mandatory_doc (mandatory_document_id),
  ADD CONSTRAINT fk_kyc_current_attempt FOREIGN KEY (current_attempt_id)
      REFERENCES kyc_verification_attempts (id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_kyc_mandatory_doc FOREIGN KEY (mandatory_document_id)
      REFERENCES documents (id) ON DELETE SET NULL;

-- 3. Identity documents (one row per submitted ID, mandatory passport + optional)
CREATE TABLE IF NOT EXISTS kyc_identity_documents (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kyc_record_id         BIGINT UNSIGNED NOT NULL,
  document_id           BIGINT UNSIGNED NOT NULL,         -- documents.id (private KYC upload)
  doc_type              VARCHAR(32)     NOT NULL,         -- see chk_kyc_idoc_type (no AADHAAR)
  is_mandatory          TINYINT(1)      NOT NULL DEFAULT 0,
  issuing_country       VARCHAR(3)      NULL,             -- ICAO/ISO-style code as printed (MRZ may use non-ISO codes)
  nationality           VARCHAR(3)      NULL,
  holder_name           VARCHAR(190)    NULL,
  date_of_birth         DATE            NULL,
  issue_date            DATE            NULL,
  expiry_date           DATE            NULL,
  number_last4          VARCHAR(4)      NULL,             -- masked display value
  number_hmac           CHAR(64)        NULL,             -- HMAC-SHA256 (KYC_HMAC_KEY); NOT unique by design
  number_hmac_key_ver   SMALLINT UNSIGNED NULL,
  number_enc            VARBINARY(255)  NULL,             -- AES-256-GCM (KYC_ENCRYPTION_KEY); NULL by default
  number_enc_key_ver    SMALLINT UNSIGNED NULL,
  mrz_present           TINYINT(1)      NULL,
  mrz_format            ENUM('TD1','TD2','TD3') NULL,
  mrz_checks            JSON            NULL,             -- per-check booleans only; raw MRZ is never stored
  name_match            ENUM('MATCH','PARTIAL','MISMATCH','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  dob_match             ENUM('MATCH','MISMATCH','UNKNOWN') NOT NULL DEFAULT 'UNKNOWN',
  validation_flags      JSON            NULL,             -- codes only, e.g. ["DUPLICATE_NUMBER"]
  extraction_source     ENUM('USER','LOCAL_MRZ','PROVIDER','REVIEWER') NULL,
  extraction_confidence DECIMAL(5,2)    NULL,
  status                ENUM('PENDING','EXTRACTED','VERIFIED','REJECTED','SUPERSEDED') NOT NULL DEFAULT 'PENDING',
  slot_key              VARCHAR(48) GENERATED ALWAYS AS (
                          CASE WHEN status = 'SUPERSEDED' THEN NULL
                               WHEN doc_type = 'OTHER' THEN NULL
                               ELSE doc_type END
                        ) STORED,   -- must not reference document_id (FK base column of a stored generated column cannot CASCADE)
  created_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_kyc_idoc_slot (kyc_record_id, slot_key),   -- one live doc per non-OTHER type per record (NULLs allowed)
  UNIQUE KEY uq_kyc_idoc_document (kyc_record_id, document_id),
  KEY ix_kyc_idoc_document (document_id),
  KEY ix_kyc_idoc_hmac (number_hmac),                       -- duplicate detection (non-unique)
  KEY ix_kyc_idoc_type_status (doc_type, status),
  KEY ix_kyc_idoc_expiry (expiry_date),
  CONSTRAINT fk_kyc_idoc_record FOREIGN KEY (kyc_record_id) REFERENCES kyc_records (id) ON DELETE CASCADE,
  CONSTRAINT fk_kyc_idoc_document FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
  CONSTRAINT chk_kyc_idoc_type CHECK (doc_type IN ('PASSPORT','PAN','VOTER_ID','DRIVING_LICENCE','OTHER')),
  CONSTRAINT chk_kyc_idoc_mandatory CHECK (is_mandatory = 0 OR doc_type = 'PASSPORT')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. KYC consents (append-only event log; separate from users.terms_* in 025).
--    A withdrawal is a NEW row (event_type WITHDRAW) pointing at the grant it
--    withdraws; grant rows are never updated. Append-only is enforced by the
--    application (no UPDATE/DELETE code paths) - no triggers, so the migration
--    needs no extra database privileges.
CREATE TABLE IF NOT EXISTS kyc_consents (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  kyc_record_id    BIGINT UNSIGNED NULL,
  purpose          ENUM('KYC_PROCESSING','BIOMETRIC_PROCESSING','DATA_RETENTION') NOT NULL,
  event_type       ENUM('GRANT','WITHDRAW') NOT NULL DEFAULT 'GRANT',
  grant_id         BIGINT UNSIGNED NULL,                    -- for WITHDRAW: the grant being withdrawn
  consent_version  VARCHAR(32)     NOT NULL,                -- placeholder until legal approves wording
  text_sha256      CHAR(64)        NOT NULL,                -- hash of the exact wording shown
  occurred_at      DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ip               VARCHAR(45)     NULL,
  user_agent       VARCHAR(255)    NULL,
  PRIMARY KEY (id),
  KEY ix_kyc_consent_user (user_id, purpose, occurred_at),
  KEY ix_kyc_consent_record (kyc_record_id),
  KEY ix_kyc_consent_grant (grant_id),
  CONSTRAINT fk_kyc_consent_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_kyc_consent_record FOREIGN KEY (kyc_record_id) REFERENCES kyc_records (id) ON DELETE SET NULL,
  CONSTRAINT fk_kyc_consent_grant FOREIGN KEY (grant_id) REFERENCES kyc_consents (id) ON DELETE SET NULL
  -- "WITHDRAW rows must carry grant_id" is enforced in the application: MySQL does not
  -- allow a CHECK on a column used by an FK with a SET NULL/CASCADE action.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 5. Permissions ---------------------------------------------------------------
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('document.read.kyc', 'document', 'read.kyc', 'Read KYC identity documents (KYC category only)'),
  ('kyc.override', 'kyc', 'override', 'Override an automated or final KYC decision (mandatory reason)');

-- document.read.kyc: approved KYC review roles + admins only.
-- (No document.read.any / compliance.read is granted to KYC_TEAM.)
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'document.read.kyc'
WHERE r.code IN ('KYC_TEAM', 'ADMIN', 'SUPER_ADMIN');

-- kyc.override: ADMIN and SUPER_ADMIN only.
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code = 'kyc.override'
WHERE r.code IN ('ADMIN', 'SUPER_ADMIN');
