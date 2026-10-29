-- ----------------------------------------------------------------------------
-- 025_registration_consent_and_otp_verification.sql
-- Phase 1: Registration Terms Consent & Contact OTP Verification (Email + SMS)
-- ----------------------------------------------------------------------------

-- 1. Record server-side terms acceptance metadata on users.
--    Historical and seeded accounts remain NULL because no interactive consent
--    artifact was captured for them at registration time.
ALTER TABLE users
  ADD COLUMN terms_accepted_at DATETIME NULL AFTER phone_verified_at,
  ADD COLUMN terms_version VARCHAR(32) NULL AFTER terms_accepted_at,
  ADD COLUMN terms_accepted_ip VARCHAR(45) NULL AFTER terms_version;

-- 2. Backfill phone_verified_at ONLY for canonical pre-seeded synthetic demo
--    accounts (@demo.odibrick.test with is_demo = 1) that seed.js created as
--    ACTIVE with email_verified_at already set. Never marks non-demo accounts
--    as verified and never fabricates terms_accepted_at consent records.
UPDATE users
   SET phone_verified_at = email_verified_at
 WHERE is_demo = 1
   AND email LIKE '%@demo.odibrick.test'
   AND status = 'ACTIVE'
   AND email_verified_at IS NOT NULL
   AND phone IS NOT NULL
   AND phone_verified_at IS NULL;

-- 3. Contact OTP verification challenges (supports independent EMAIL and SMS OTPs)
CREATE TABLE IF NOT EXISTS otp_verifications (
  id                  BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  user_id             BIGINT UNSIGNED   NOT NULL,
  channel             ENUM('EMAIL','SMS') NOT NULL,
  purpose             ENUM('REGISTRATION','CONTACT_VERIFICATION') NOT NULL DEFAULT 'REGISTRATION',
  destination         VARCHAR(190)      NOT NULL,
  code_hash           CHAR(64)          NOT NULL,
  encrypted_test_code VARBINARY(255)    NULL,
  attempts            TINYINT UNSIGNED  NOT NULL DEFAULT 0,
  max_attempts        TINYINT UNSIGNED  NOT NULL DEFAULT 5,
  expires_at          DATETIME          NOT NULL,
  consumed_at         DATETIME          NULL,
  invalidated_at      DATETIME          NULL,
  requested_ip        VARCHAR(45)       NULL,
  verified_ip         VARCHAR(45)       NULL,
  created_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME          NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_otp_user_channel_active (user_id, channel, consumed_at, invalidated_at, expires_at),
  KEY ix_otp_created_at (user_id, channel, created_at),
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
