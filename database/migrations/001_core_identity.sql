-- =====================================================================
-- ODIBRICK · 001 · Core identity, RBAC, KYC, audit
-- MySQL 8.0+ / InnoDB / utf8mb4
-- =====================================================================
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------
-- roles / permissions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS roles (
  id            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  code          VARCHAR(48)    NOT NULL,           -- SUPER_ADMIN, TENANT, ...
  name          VARCHAR(96)    NOT NULL,
  description   VARCHAR(255)   NULL,
  is_staff      TINYINT(1)     NOT NULL DEFAULT 0, -- internal Odibrick/Cambliss role
  created_at    DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id            INT UNSIGNED   NOT NULL AUTO_INCREMENT,
  code          VARCHAR(96)    NOT NULL,           -- property.approve, kyc.review ...
  resource      VARCHAR(48)    NOT NULL,
  action        VARCHAR(48)    NOT NULL,
  description   VARCHAR(255)   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_code (code),
  KEY ix_permissions_resource (resource)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id       INT UNSIGNED   NOT NULL,
  permission_id INT UNSIGNED   NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id         CHAR(26)        NOT NULL,             -- ULID, used in URLs
  email             VARCHAR(190)    NOT NULL,
  phone             VARCHAR(20)     NULL,
  password_hash     VARCHAR(255)    NOT NULL,
  full_name         VARCHAR(160)    NOT NULL,
  status            ENUM('PENDING','ACTIVE','SUSPENDED','DISABLED') NOT NULL DEFAULT 'ACTIVE',
  email_verified_at DATETIME        NULL,
  phone_verified_at DATETIME        NULL,
  mfa_enabled       TINYINT(1)      NOT NULL DEFAULT 0,
  mfa_secret        VARBINARY(255)  NULL,                 -- encrypted at rest
  last_login_at     DATETIME        NULL,
  last_login_ip     VARCHAR(45)     NULL,
  failed_attempts   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  locked_until      DATETIME        NULL,
  is_demo           TINYINT(1)      NOT NULL DEFAULT 0,   -- seed/demo marker
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at        DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_public_id (public_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  KEY ix_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id     BIGINT UNSIGNED NOT NULL,
  role_id     INT UNSIGNED    NOT NULL,
  granted_by  BIGINT UNSIGNED NULL,
  granted_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id),
  CONSTRAINT fk_ur_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles (id) ON DELETE CASCADE,
  CONSTRAINT fk_ur_granter FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id        BIGINT UNSIGNED NOT NULL,
  avatar_path    VARCHAR(255)    NULL,
  date_of_birth  DATE            NULL,
  gender         ENUM('MALE','FEMALE','OTHER','UNDISCLOSED') NULL,
  occupation     VARCHAR(120)    NULL,
  employer       VARCHAR(160)    NULL,
  address_line1  VARCHAR(190)    NULL,
  address_line2  VARCHAR(190)    NULL,
  locality       VARCHAR(120)    NULL,
  city           VARCHAR(120)    NULL,
  state          VARCHAR(120)    NULL,
  pincode        VARCHAR(10)     NULL,
  country        CHAR(2)         NOT NULL DEFAULT 'IN',
  about          TEXT            NULL,
  preferences    JSON            NULL,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_profile_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  KEY ix_profile_city (city)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- refresh token rotation (hash only, never the raw token)
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  token_hash   CHAR(64)        NOT NULL,
  family_id    CHAR(36)        NOT NULL,
  user_agent   VARCHAR(255)    NULL,
  ip           VARCHAR(45)     NULL,
  expires_at   DATETIME        NOT NULL,
  revoked_at   DATETIME        NULL,
  replaced_by  BIGINT UNSIGNED NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rt_hash (token_hash),
  KEY ix_rt_user (user_id),
  KEY ix_rt_family (family_id),
  CONSTRAINT fk_rt_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- KYC
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kyc_records (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  subject_type     ENUM('INDIVIDUAL','BUSINESS') NOT NULL DEFAULT 'INDIVIDUAL',
  legal_name       VARCHAR(190)    NOT NULL,
  id_type          ENUM('AADHAAR','PAN','PASSPORT','DL','VOTER_ID','GSTIN','CIN','OTHER') NOT NULL,
  id_last4         VARCHAR(8)      NULL,           -- only last 4 stored in clear
  id_reference     VARBINARY(255)  NULL,           -- encrypted full reference
  provider         VARCHAR(48)     NULL,           -- verification provider used
  provider_ref     VARCHAR(120)    NULL,
  status           ENUM('DRAFT','SUBMITTED','IN_REVIEW','VERIFIED','REJECTED','EXPIRED') NOT NULL DEFAULT 'DRAFT',
  risk_flags       JSON            NULL,
  reviewer_id      BIGINT UNSIGNED NULL,
  reviewed_at      DATETIME        NULL,
  rejection_reason VARCHAR(500)    NULL,
  expires_at       DATE            NULL,
  submitted_at     DATETIME        NULL,
  created_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_kyc_user (user_id),
  KEY ix_kyc_status (status),
  CONSTRAINT fk_kyc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_kyc_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- documents (single private vault used by every module)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id      CHAR(26)        NOT NULL,
  owner_user_id  BIGINT UNSIGNED NOT NULL,
  category       ENUM('KYC','OWNERSHIP','PROPERTY','AGREEMENT','RECEIPT','INSPECTION',
                      'INSURANCE','LEGAL','MAINTENANCE','DISPUTE','MARKETING','OTHER') NOT NULL,
  entity_type    VARCHAR(48)     NULL,             -- property / agreement / kyc ...
  entity_id      BIGINT UNSIGNED NULL,
  title          VARCHAR(190)    NOT NULL,
  storage_driver ENUM('LOCAL','S3')  NOT NULL DEFAULT 'LOCAL',
  storage_key    VARCHAR(400)    NOT NULL,         -- private key, never a public URL
  mime_type      VARCHAR(120)    NOT NULL,
  size_bytes     BIGINT UNSIGNED NOT NULL,
  checksum_sha256 CHAR(64)       NULL,
  version        INT UNSIGNED    NOT NULL DEFAULT 1,
  parent_id      BIGINT UNSIGNED NULL,             -- previous version
  scan_status    ENUM('PENDING','CLEAN','INFECTED','SKIPPED') NOT NULL DEFAULT 'PENDING',
  visibility     ENUM('PRIVATE','PARTIES','STAFF','PUBLIC') NOT NULL DEFAULT 'PRIVATE',
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at     DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_documents_public_id (public_id),
  KEY ix_documents_owner (owner_user_id),
  KEY ix_documents_entity (entity_type, entity_id),
  KEY ix_documents_category (category),
  CONSTRAINT fk_doc_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_doc_parent FOREIGN KEY (parent_id) REFERENCES documents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS document_access_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  document_id  BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NULL,
  action       ENUM('VIEW','DOWNLOAD','UPLOAD','DELETE','SHARE') NOT NULL,
  ip           VARCHAR(45)     NULL,
  user_agent   VARCHAR(255)    NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_dal_doc (document_id),
  KEY ix_dal_user (user_id),
  CONSTRAINT fk_dal_doc FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE,
  CONSTRAINT fk_dal_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- audit log (append only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_id     BIGINT UNSIGNED NULL,
  actor_role   VARCHAR(48)     NULL,
  action       VARCHAR(96)     NOT NULL,           -- property.approved
  object_type  VARCHAR(48)     NULL,
  object_id    BIGINT UNSIGNED NULL,
  result       ENUM('SUCCESS','FAILURE','DENIED') NOT NULL DEFAULT 'SUCCESS',
  ip           VARCHAR(45)     NULL,
  user_agent   VARCHAR(255)    NULL,
  metadata     JSON            NULL,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_actor (actor_id),
  KEY ix_audit_object (object_type, object_id),
  KEY ix_audit_action_time (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- notifications + platform settings
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      BIGINT UNSIGNED NOT NULL,
  event_code   VARCHAR(64)     NOT NULL,
  channel      ENUM('IN_APP','EMAIL','SMS','WHATSAPP','PUSH') NOT NULL DEFAULT 'IN_APP',
  title        VARCHAR(190)    NOT NULL,
  body         TEXT            NULL,
  action_url   VARCHAR(255)    NULL,
  severity     ENUM('INFO','ACTION','WARNING','CRITICAL') NOT NULL DEFAULT 'INFO',
  read_at      DATETIME        NULL,
  delivery_status ENUM('QUEUED','SENT','FAILED','SKIPPED') NOT NULL DEFAULT 'QUEUED',
  provider_ref VARCHAR(120)    NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_notif_user_read (user_id, read_at),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS notification_templates (
  id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  event_code   VARCHAR(64)     NOT NULL,
  channel      ENUM('IN_APP','EMAIL','SMS','WHATSAPP','PUSH') NOT NULL,
  subject      VARCHAR(190)    NULL,
  body         TEXT            NOT NULL,
  is_active    TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_nt_event_channel (event_code, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key  VARCHAR(96)     NOT NULL,
  value_json   JSON            NOT NULL,
  group_name   VARCHAR(48)     NOT NULL DEFAULT 'general',
  description  VARCHAR(255)    NULL,
  updated_by   BIGINT UNSIGNED NULL,
  updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (setting_key),
  KEY ix_settings_group (group_name),
  CONSTRAINT fk_settings_user FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
