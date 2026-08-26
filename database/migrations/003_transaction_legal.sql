-- =====================================================================
-- ODIBRICK · 003 · Enquiries, applications, tenancies, legal & agreements
-- =====================================================================
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS enquiries (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id      CHAR(26)        NOT NULL,
  property_id    BIGINT UNSIGNED NOT NULL,
  tenant_user_id BIGINT UNSIGNED NOT NULL,
  message        VARCHAR(1000)   NULL,
  contact_pref   ENUM('CHAT','CALL','EMAIL','WHATSAPP') NOT NULL DEFAULT 'CHAT',
  status         ENUM('NEW','CONTACTED','VISIT_SCHEDULED','CONVERTED','CLOSED','SPAM')
                 NOT NULL DEFAULT 'NEW',
  source         VARCHAR(48)     NULL,
  campaign_id    BIGINT UNSIGNED NULL,
  responded_at   DATETIME        NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_enq_public_id (public_id),
  KEY ix_enq_property_status (property_id, status),
  KEY ix_enq_tenant (tenant_user_id),
  CONSTRAINT fk_enq_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_enq_tenant FOREIGN KEY (tenant_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS viewings (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id    BIGINT UNSIGNED NOT NULL,
  enquiry_id     BIGINT UNSIGNED NULL,
  tenant_user_id BIGINT UNSIGNED NOT NULL,
  host_user_id   BIGINT UNSIGNED NULL,
  mode           ENUM('IN_PERSON','VIDEO') NOT NULL DEFAULT 'IN_PERSON',
  scheduled_for  DATETIME        NOT NULL,
  status         ENUM('REQUESTED','CONFIRMED','RESCHEDULED','COMPLETED','NO_SHOW','CANCELLED')
                 NOT NULL DEFAULT 'REQUESTED',
  feedback       VARCHAR(1000)   NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_view_prop_time (property_id, scheduled_for),
  KEY ix_view_tenant (tenant_user_id),
  CONSTRAINT fk_vw_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_vw_enquiry FOREIGN KEY (enquiry_id) REFERENCES enquiries (id) ON DELETE SET NULL,
  CONSTRAINT fk_vw_tenant FOREIGN KEY (tenant_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS applications (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id         CHAR(26)        NOT NULL,
  property_id       BIGINT UNSIGNED NOT NULL,
  tenant_user_id    BIGINT UNSIGNED NOT NULL,
  enquiry_id        BIGINT UNSIGNED NULL,
  occupants         TINYINT UNSIGNED NULL,
  household_type    ENUM('FAMILY','BACHELOR','COUPLE','COMPANY_LEASE','STUDENT') NULL,
  move_in_date      DATE            NULL,
  tenure_months     SMALLINT UNSIGNED NULL,
  offered_rent      DECIMAL(12,2)   NULL,
  offered_deposit   DECIMAL(12,2)   NULL,
  message           VARCHAR(1000)   NULL,
  status            ENUM('SUBMITTED','UNDER_REVIEW','SHORTLISTED','ACCEPTED','REJECTED','WITHDRAWN','EXPIRED')
                    NOT NULL DEFAULT 'SUBMITTED',
  decided_by        BIGINT UNSIGNED NULL,
  decided_at        DATETIME        NULL,
  decision_note     VARCHAR(500)    NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_app_public_id (public_id),
  UNIQUE KEY uq_app_property_tenant (property_id, tenant_user_id),
  KEY ix_app_status (status),
  CONSTRAINT fk_app_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_app_tenant FOREIGN KEY (tenant_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_app_enquiry FOREIGN KEY (enquiry_id) REFERENCES enquiries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- a tenancy is the transaction container: agreement + payments + inspections + renewal
CREATE TABLE IF NOT EXISTS tenancies (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id          CHAR(26)        NOT NULL,
  property_id        BIGINT UNSIGNED NOT NULL,
  application_id     BIGINT UNSIGNED NULL,
  owner_user_id      BIGINT UNSIGNED NOT NULL,
  tenant_user_id     BIGINT UNSIGNED NOT NULL,
  managed_by_agent_id BIGINT UNSIGNED NULL,
  stage              ENUM('LEGAL_REVIEW','CONSULTATION','AGREEMENT_DRAFT','AWAITING_SIGNATURES',
                          'AWAITING_PAYMENT','CHECK_IN_PENDING','ACTIVE','RENEWAL_DUE',
                          'MOVE_OUT','CLOSED','CANCELLED') NOT NULL DEFAULT 'LEGAL_REVIEW',
  service_plan       ENUM('STANDARD','PROTECTED','MANAGED') NOT NULL DEFAULT 'STANDARD',
  rent_amount        DECIMAL(12,2)   NOT NULL,
  deposit_amount     DECIMAL(12,2)   NOT NULL,
  maintenance_amount DECIMAL(10,2)   NULL,
  rent_due_day       TINYINT UNSIGNED NOT NULL DEFAULT 5,
  start_date         DATE            NULL,
  end_date           DATE            NULL,
  lock_in_months     TINYINT UNSIGNED NULL,
  notice_period_days SMALLINT UNSIGNED NULL,
  renewal_due_on     DATE            NULL,
  closed_at          DATETIME        NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenancy_public_id (public_id),
  KEY ix_tenancy_property (property_id),
  KEY ix_tenancy_tenant (tenant_user_id),
  KEY ix_tenancy_owner (owner_user_id),
  KEY ix_tenancy_stage (stage),
  CONSTRAINT fk_ten_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_ten_app FOREIGN KEY (application_id) REFERENCES applications (id) ON DELETE SET NULL,
  CONSTRAINT fk_ten_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_ten_tenant FOREIGN KEY (tenant_user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- legal workspace
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS legal_cases (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id       CHAR(26)        NOT NULL,
  case_number     VARCHAR(32)     NOT NULL,       -- ODB-LGL-2026-000123
  tenancy_id      BIGINT UNSIGNED NOT NULL,
  case_type       ENUM('NEW_AGREEMENT','RENEWAL','TERMINATION','DISPUTE','ADVISORY') NOT NULL DEFAULT 'NEW_AGREEMENT',
  priority        ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  status          ENUM('QUEUED','DOCUMENT_REVIEW','DRAFTING','CONSULTATION_SCHEDULED',
                       'AWAITING_PARTY_INPUT','APPROVED','EXECUTED','CLOSED','REJECTED')
                  NOT NULL DEFAULT 'QUEUED',
  assigned_to     BIGINT UNSIGNED NULL,           -- legal team user
  jurisdiction    VARCHAR(120)    NULL,           -- state whose tenancy law applies
  opened_at       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at       DATETIME        NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_case_public_id (public_id),
  UNIQUE KEY uq_case_number (case_number),
  KEY ix_case_status (status),
  KEY ix_case_assignee (assigned_to),
  CONSTRAINT fk_case_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE CASCADE,
  CONSTRAINT fk_case_assignee FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS legal_notes (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  legal_case_id BIGINT UNSIGNED NOT NULL,
  author_id     BIGINT UNSIGNED NOT NULL,
  visibility    ENUM('INTERNAL','PARTIES') NOT NULL DEFAULT 'INTERNAL',
  body          TEXT            NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_note_case (legal_case_id),
  CONSTRAINT fk_note_case FOREIGN KEY (legal_case_id) REFERENCES legal_cases (id) ON DELETE CASCADE,
  CONSTRAINT fk_note_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS clause_library (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  code          VARCHAR(64)     NOT NULL,
  title         VARCHAR(190)    NOT NULL,
  category      ENUM('RENT','DEPOSIT','LOCK_IN','NOTICE','MAINTENANCE','UTILITIES','REPAIRS',
                     'RESTRICTIONS','TERMINATION','REFUND','DISPUTE','OTHER') NOT NULL,
  body_template TEXT            NOT NULL,         -- supports {{placeholders}}
  jurisdiction  VARCHAR(120)    NULL,
  is_mandatory  TINYINT(1)      NOT NULL DEFAULT 0,
  version       INT UNSIGNED    NOT NULL DEFAULT 1,
  approved_by   BIGINT UNSIGNED NULL,             -- must be a LEGAL_TEAM user
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_clause_code_version (code, version),
  CONSTRAINT fk_clause_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agreements (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id         CHAR(26)        NOT NULL,
  agreement_number  VARCHAR(32)     NOT NULL,
  tenancy_id        BIGINT UNSIGNED NOT NULL,
  legal_case_id     BIGINT UNSIGNED NULL,
  agreement_type    ENUM('LEAVE_AND_LICENSE','RENTAL','LEASE','RENEWAL','ADDENDUM') NOT NULL DEFAULT 'LEAVE_AND_LICENSE',
  status            ENUM('DRAFT','LEGAL_REVIEW','SENT_FOR_APPROVAL','APPROVED_BY_LEGAL',
                         'AWAITING_SIGNATURES','PARTIALLY_SIGNED','EXECUTED','CANCELLED','SUPERSEDED')
                    NOT NULL DEFAULT 'DRAFT',
  current_version   INT UNSIGNED    NOT NULL DEFAULT 1,
  effective_from    DATE            NULL,
  effective_to      DATE            NULL,
  stamp_duty_status ENUM('NOT_APPLICABLE','PENDING','PAID','REGISTERED') NOT NULL DEFAULT 'PENDING',
  stamp_reference   VARCHAR(120)    NULL,
  registration_ref  VARCHAR(120)    NULL,
  approved_by       BIGINT UNSIGNED NULL,         -- authorised legal professional
  approved_at       DATETIME        NULL,
  executed_at       DATETIME        NULL,
  final_document_id BIGINT UNSIGNED NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agr_public_id (public_id),
  UNIQUE KEY uq_agr_number (agreement_number),
  KEY ix_agr_tenancy (tenancy_id),
  KEY ix_agr_status (status),
  CONSTRAINT fk_agr_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE CASCADE,
  CONSTRAINT fk_agr_case FOREIGN KEY (legal_case_id) REFERENCES legal_cases (id) ON DELETE SET NULL,
  CONSTRAINT fk_agr_approver FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_agr_doc FOREIGN KEY (final_document_id) REFERENCES documents (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agreement_versions (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agreement_id  BIGINT UNSIGNED NOT NULL,
  version       INT UNSIGNED    NOT NULL,
  body_html     MEDIUMTEXT      NOT NULL,
  variables     JSON            NULL,
  change_summary VARCHAR(500)   NULL,
  drafted_by    BIGINT UNSIGNED NOT NULL,
  drafted_with_ai TINYINT(1)    NOT NULL DEFAULT 0,   -- assistive only, never binding
  reviewed_by   BIGINT UNSIGNED NULL,
  reviewed_at   DATETIME        NULL,
  document_id   BIGINT UNSIGNED NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_av_agreement_version (agreement_id, version),
  CONSTRAINT fk_av_agreement FOREIGN KEY (agreement_id) REFERENCES agreements (id) ON DELETE CASCADE,
  CONSTRAINT fk_av_drafter FOREIGN KEY (drafted_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agreement_clauses (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agreement_id  BIGINT UNSIGNED NOT NULL,
  clause_id     INT UNSIGNED    NULL,
  sort_order    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  title         VARCHAR(190)    NOT NULL,
  body          TEXT            NOT NULL,
  is_custom     TINYINT(1)      NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_ac_agreement (agreement_id, sort_order),
  CONSTRAINT fk_ac_agreement FOREIGN KEY (agreement_id) REFERENCES agreements (id) ON DELETE CASCADE,
  CONSTRAINT fk_ac_clause FOREIGN KEY (clause_id) REFERENCES clause_library (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agreement_signatories (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  agreement_id  BIGINT UNSIGNED NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  party_role    ENUM('OWNER','TENANT','WITNESS','AGENT','LEGAL') NOT NULL,
  sign_order    TINYINT UNSIGNED NOT NULL DEFAULT 1,
  status        ENUM('PENDING','VIEWED','SIGNED','DECLINED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  provider      VARCHAR(48)     NULL,             -- e-sign provider (abstracted)
  provider_ref  VARCHAR(120)    NULL,
  consent_text  VARCHAR(500)    NULL,
  signed_at     DATETIME        NULL,
  signed_ip     VARCHAR(45)     NULL,
  otp_reference VARCHAR(64)     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sig_agreement_user (agreement_id, user_id, party_role),
  CONSTRAINT fk_sig_agreement FOREIGN KEY (agreement_id) REFERENCES agreements (id) ON DELETE CASCADE,
  CONSTRAINT fk_sig_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS legal_meetings (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id      CHAR(26)        NOT NULL,
  legal_case_id  BIGINT UNSIGNED NULL,
  tenancy_id     BIGINT UNSIGNED NULL,
  purpose        ENUM('LEGAL_CONSULTATION','OWNER_TENANT_DISCUSSION','SUPPORT','PROPERTY_WALKTHROUGH')
                 NOT NULL DEFAULT 'LEGAL_CONSULTATION',
  provider       VARCHAR(48)     NOT NULL DEFAULT 'PENDING_PROVIDER',
  provider_meeting_id VARCHAR(190) NULL,
  join_token     CHAR(64)        NULL,            -- resolved to a short-lived link
  scheduled_for  DATETIME        NOT NULL,
  duration_min   SMALLINT UNSIGNED NOT NULL DEFAULT 30,
  status         ENUM('SCHEDULED','LIVE','COMPLETED','CANCELLED','NO_SHOW') NOT NULL DEFAULT 'SCHEDULED',
  host_user_id   BIGINT UNSIGNED NOT NULL,
  agenda         VARCHAR(1000)   NULL,
  outcome_notes  TEXT            NULL,
  recording_document_id BIGINT UNSIGNED NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_meeting_public_id (public_id),
  KEY ix_meeting_case (legal_case_id),
  KEY ix_meeting_time (scheduled_for),
  CONSTRAINT fk_meet_case FOREIGN KEY (legal_case_id) REFERENCES legal_cases (id) ON DELETE CASCADE,
  CONSTRAINT fk_meet_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE CASCADE,
  CONSTRAINT fk_meet_host FOREIGN KEY (host_user_id) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS meeting_participants (
  meeting_id  BIGINT UNSIGNED NOT NULL,
  user_id     BIGINT UNSIGNED NOT NULL,
  party_role  ENUM('OWNER','TENANT','LEGAL','AGENT','SUPPORT','OBSERVER') NOT NULL,
  attendance  ENUM('INVITED','JOINED','ABSENT') NOT NULL DEFAULT 'INVITED',
  joined_at   DATETIME        NULL,
  left_at     DATETIME        NULL,
  PRIMARY KEY (meeting_id, user_id),
  CONSTRAINT fk_mp_meeting FOREIGN KEY (meeting_id) REFERENCES legal_meetings (id) ON DELETE CASCADE,
  CONSTRAINT fk_mp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
