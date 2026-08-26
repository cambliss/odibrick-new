-- =====================================================================
-- ODIBRICK · 005 · Condition reports, maintenance, protection, disputes, support
-- =====================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Day-1 / periodic / move-out condition reports
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inspections (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id          CHAR(26)        NOT NULL,
  report_number      VARCHAR(32)     NOT NULL,    -- ODB-CR-2026-000123
  property_id        BIGINT UNSIGNED NOT NULL,
  tenancy_id         BIGINT UNSIGNED NULL,
  kind               ENUM('CHECK_IN','PERIODIC','MAINTENANCE','MOVE_OUT') NOT NULL DEFAULT 'CHECK_IN',
  conducted_by       BIGINT UNSIGNED NOT NULL,    -- usually the tenant on Day 1
  conducted_role     ENUM('TENANT','OWNER','PROPERTY_MANAGER','AGENT') NOT NULL DEFAULT 'TENANT',
  status             ENUM('DRAFT','SUBMITTED','OWNER_REVIEW','ACKNOWLEDGED','DISPUTED','SUPERSEDED')
                     NOT NULL DEFAULT 'DRAFT',
  started_at         DATETIME        NULL,
  submitted_at       DATETIME        NULL,
  tenant_ack_at      DATETIME        NULL,
  owner_ack_at       DATETIME        NULL,
  owner_comments     VARCHAR(1000)   NULL,
  overall_condition  ENUM('EXCELLENT','GOOD','FAIR','POOR') NULL,
  electricity_reading VARCHAR(32)    NULL,
  water_reading      VARCHAR(32)     NULL,
  gas_reading        VARCHAR(32)     NULL,
  gps_latitude       DECIMAL(10,7)   NULL,
  gps_longitude      DECIMAL(10,7)   NULL,
  device_hash        CHAR(64)        NULL,
  compared_with_id   BIGINT UNSIGNED NULL,        -- move-out report -> check-in report
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_insp_public_id (public_id),
  UNIQUE KEY uq_insp_number (report_number),
  KEY ix_insp_property_kind (property_id, kind),
  KEY ix_insp_tenancy (tenancy_id),
  CONSTRAINT fk_insp_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_insp_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE SET NULL,
  CONSTRAINT fk_insp_user FOREIGN KEY (conducted_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_insp_compare FOREIGN KEY (compared_with_id) REFERENCES inspections (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inspection_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_id  BIGINT UNSIGNED NOT NULL,
  room           ENUM('LIVING_ROOM','BEDROOM','KITCHEN','BATHROOM','BALCONY','ENTRANCE',
                      'UTILITY','PARKING','COMMON','OTHER') NOT NULL,
  room_label     VARCHAR(64)     NULL,            -- "Bedroom 2"
  element        ENUM('WALLS','FLOORING','CEILING','DOORS','WINDOWS','ELECTRICAL','PLUMBING',
                      'APPLIANCES','FURNITURE','FIXTURES','PAINT','METER','OTHER') NOT NULL,
  condition_rating ENUM('NEW','GOOD','FAIR','DAMAGED','MISSING') NOT NULL DEFAULT 'GOOD',
  damage_type    ENUM('NONE','SCRATCH','CRACK','STAIN','LEAKAGE','DENT','BROKEN','WEAR') NOT NULL DEFAULT 'NONE',
  notes          VARCHAR(1000)   NULL,
  quantity       SMALLINT UNSIGNED NULL,
  flagged        TINYINT(1)      NOT NULL DEFAULT 0,
  sort_order     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY ix_item_inspection (inspection_id, room, sort_order),
  CONSTRAINT fk_item_inspection FOREIGN KEY (inspection_id) REFERENCES inspections (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS inspection_media (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  inspection_id      BIGINT UNSIGNED NOT NULL,
  inspection_item_id BIGINT UNSIGNED NULL,
  media_type         ENUM('PHOTO','VIDEO','VOICE_NOTE') NOT NULL DEFAULT 'PHOTO',
  storage_key        VARCHAR(400)    NOT NULL,
  checksum_sha256    CHAR(64)        NULL,
  captured_at        DATETIME        NULL,        -- device timestamp
  received_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3), -- server timestamp
  gps_latitude       DECIMAL(10,7)   NULL,
  gps_longitude      DECIMAL(10,7)   NULL,
  caption            VARCHAR(255)    NULL,
  PRIMARY KEY (id),
  KEY ix_media_inspection (inspection_id),
  CONSTRAINT fk_media_inspection FOREIGN KEY (inspection_id) REFERENCES inspections (id) ON DELETE CASCADE,
  CONSTRAINT fk_media_item FOREIGN KEY (inspection_item_id) REFERENCES inspection_items (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- maintenance
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS maintenance_requests (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id      CHAR(26)        NOT NULL,
  ticket_number  VARCHAR(32)     NOT NULL,
  property_id    BIGINT UNSIGNED NOT NULL,
  tenancy_id     BIGINT UNSIGNED NULL,
  raised_by      BIGINT UNSIGNED NOT NULL,
  category       ENUM('PLUMBING','ELECTRICAL','APPLIANCE','LEAKAGE','AC','STRUCTURAL',
                      'PEST','CARPENTRY','PAINTING','OTHER') NOT NULL,
  priority       ENUM('LOW','NORMAL','HIGH','EMERGENCY') NOT NULL DEFAULT 'NORMAL',
  title          VARCHAR(190)    NOT NULL,
  description    TEXT            NULL,
  status         ENUM('OPEN','OWNER_REVIEW','APPROVED','REJECTED','SCHEDULED','IN_PROGRESS',
                      'COMPLETED','VERIFIED','CLOSED','CANCELLED') NOT NULL DEFAULT 'OPEN',
  cost_bearer    ENUM('OWNER','TENANT','SHARED','ODIBRICK','UNDECIDED') NOT NULL DEFAULT 'UNDECIDED',
  estimated_cost DECIMAL(10,2)   NULL,
  final_cost     DECIMAL(10,2)   NULL,
  vendor_name    VARCHAR(160)    NULL,
  vendor_phone   VARCHAR(20)     NULL,
  scheduled_for  DATETIME        NULL,
  completed_at   DATETIME        NULL,
  owner_decision_note VARCHAR(500) NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_mr_public_id (public_id),
  UNIQUE KEY uq_mr_ticket (ticket_number),
  KEY ix_mr_property_status (property_id, status),
  KEY ix_mr_tenancy (tenancy_id),
  CONSTRAINT fk_mr_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_mr_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE SET NULL,
  CONSTRAINT fk_mr_user FOREIGN KEY (raised_by) REFERENCES users (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS maintenance_updates (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id    BIGINT UNSIGNED NOT NULL,
  author_id     BIGINT UNSIGNED NOT NULL,
  status_from    VARCHAR(32)    NULL,
  status_to      VARCHAR(32)    NULL,
  message       VARCHAR(1000)   NULL,
  document_id   BIGINT UNSIGNED NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_mu_request (request_id),
  CONSTRAINT fk_mu_request FOREIGN KEY (request_id) REFERENCES maintenance_requests (id) ON DELETE CASCADE,
  CONSTRAINT fk_mu_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- protection: Odibrick service plans vs. insurer-issued policies
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS insurance_partners (
  id            INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  code          VARCHAR(48)     NOT NULL,
  legal_name    VARCHAR(190)    NOT NULL,
  irdai_registration VARCHAR(64) NULL,
  partner_type  ENUM('INSURER','BROKER','CORPORATE_AGENT','TPA') NOT NULL DEFAULT 'INSURER',
  adapter_key   VARCHAR(48)     NOT NULL DEFAULT 'manual', -- provider abstraction key
  contact_email VARCHAR(190)    NULL,
  is_active     TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ip_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS insurance_products (
  id              INT UNSIGNED    NOT NULL AUTO_INCREMENT,
  partner_id      INT UNSIGNED    NULL,           -- NULL = Odibrick service, not insurance
  code            VARCHAR(48)     NOT NULL,
  name            VARCHAR(160)    NOT NULL,
  offering_type   ENUM('INSURANCE_POLICY','ODIBRICK_SERVICE') NOT NULL DEFAULT 'INSURANCE_POLICY',
  category        ENUM('PROPERTY','CONTENTS','THEFT','LIABILITY','ACCIDENT','APPLIANCE','OTHER') NOT NULL,
  audience        ENUM('OWNER','TENANT','BOTH') NOT NULL DEFAULT 'BOTH',
  summary         VARCHAR(500)    NULL,
  coverage_json   JSON            NULL,
  exclusions_json JSON            NULL,
  sum_insured_min DECIMAL(12,2)   NULL,
  sum_insured_max DECIMAL(12,2)   NULL,
  base_premium    DECIMAL(10,2)   NULL,
  term_months     SMALLINT UNSIGNED NOT NULL DEFAULT 12,
  eligibility_json JSON           NULL,
  brochure_document_id BIGINT UNSIGNED NULL,
  is_active       TINYINT(1)      NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_inspr_code (code),
  CONSTRAINT fk_inspr_partner FOREIGN KEY (partner_id) REFERENCES insurance_partners (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS insurance_quotes (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  product_id   INT UNSIGNED    NOT NULL,
  user_id      BIGINT UNSIGNED NOT NULL,
  property_id  BIGINT UNSIGNED NULL,
  tenancy_id   BIGINT UNSIGNED NULL,
  sum_insured  DECIMAL(12,2)   NOT NULL,
  premium      DECIMAL(10,2)   NOT NULL,
  tax_amount   DECIMAL(10,2)   NOT NULL DEFAULT 0.00,
  provider_ref VARCHAR(120)    NULL,
  status       ENUM('DRAFT','QUOTED','EXPIRED','ACCEPTED','DECLINED') NOT NULL DEFAULT 'QUOTED',
  valid_until  DATE            NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_iq_user (user_id),
  CONSTRAINT fk_iq_product FOREIGN KEY (product_id) REFERENCES insurance_products (id) ON DELETE CASCADE,
  CONSTRAINT fk_iq_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS insurance_policies (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id       CHAR(26)        NOT NULL,
  product_id      INT UNSIGNED    NOT NULL,
  quote_id        BIGINT UNSIGNED NULL,
  holder_user_id  BIGINT UNSIGNED NOT NULL,
  property_id     BIGINT UNSIGNED NULL,
  tenancy_id      BIGINT UNSIGNED NULL,
  policy_number   VARCHAR(120)    NULL,           -- issued by the insurer, not by Odibrick
  status          ENUM('REQUESTED','PAYMENT_PENDING','SUBMITTED_TO_INSURER','ACTIVE',
                       'LAPSED','CANCELLED','REJECTED') NOT NULL DEFAULT 'REQUESTED',
  sum_insured     DECIMAL(12,2)   NOT NULL,
  premium         DECIMAL(10,2)   NOT NULL,
  starts_on       DATE            NULL,
  expires_on      DATE            NULL,
  payment_id      BIGINT UNSIGNED NULL,
  policy_document_id BIGINT UNSIGNED NULL,
  claims_contact  VARCHAR(255)    NULL,
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pol_public_id (public_id),
  KEY ix_pol_holder (holder_user_id, status),
  KEY ix_pol_expiry (expires_on),
  CONSTRAINT fk_pol_product FOREIGN KEY (product_id) REFERENCES insurance_products (id) ON DELETE RESTRICT,
  CONSTRAINT fk_pol_holder FOREIGN KEY (holder_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_pol_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL,
  CONSTRAINT fk_pol_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- disputes + support
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disputes (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id      CHAR(26)        NOT NULL,
  case_number    VARCHAR(32)     NOT NULL,
  tenancy_id     BIGINT UNSIGNED NOT NULL,
  raised_by      BIGINT UNSIGNED NOT NULL,
  against_user_id BIGINT UNSIGNED NULL,
  category       ENUM('DEPOSIT','PROPERTY_DAMAGE','MAINTENANCE','PAYMENT','AGREEMENT',
                      'NOTICE_PERIOD','ACCESS','OTHER') NOT NULL,
  amount_claimed DECIMAL(12,2)   NULL,
  summary        VARCHAR(500)    NOT NULL,
  detail         TEXT            NULL,
  status         ENUM('OPEN','EVIDENCE_SUBMITTED','UNDER_REVIEW','LEGAL_REVIEW',
                      'RESOLUTION_PROPOSED','RESOLVED','ESCALATED_EXTERNALLY','CLOSED','WITHDRAWN')
                 NOT NULL DEFAULT 'OPEN',
  assigned_to    BIGINT UNSIGNED NULL,
  legal_case_id  BIGINT UNSIGNED NULL,
  resolution     TEXT            NULL,
  resolved_at    DATETIME        NULL,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_disp_public_id (public_id),
  UNIQUE KEY uq_disp_number (case_number),
  KEY ix_disp_tenancy (tenancy_id, status),
  CONSTRAINT fk_disp_tenancy FOREIGN KEY (tenancy_id) REFERENCES tenancies (id) ON DELETE CASCADE,
  CONSTRAINT fk_disp_raiser FOREIGN KEY (raised_by) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_disp_legal FOREIGN KEY (legal_case_id) REFERENCES legal_cases (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS dispute_evidence (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  dispute_id   BIGINT UNSIGNED NOT NULL,
  submitted_by BIGINT UNSIGNED NOT NULL,
  evidence_type ENUM('DOCUMENT','INSPECTION_REPORT','PAYMENT_RECORD','PHOTO','VIDEO','MESSAGE','OTHER')
               NOT NULL DEFAULT 'DOCUMENT',
  document_id  BIGINT UNSIGNED NULL,
  inspection_id BIGINT UNSIGNED NULL,
  payment_id   BIGINT UNSIGNED NULL,
  description  VARCHAR(500)    NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_de_dispute (dispute_id),
  CONSTRAINT fk_de_dispute FOREIGN KEY (dispute_id) REFERENCES disputes (id) ON DELETE CASCADE,
  CONSTRAINT fk_de_user FOREIGN KEY (submitted_by) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_de_doc FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE SET NULL,
  CONSTRAINT fk_de_insp FOREIGN KEY (inspection_id) REFERENCES inspections (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id     CHAR(26)        NOT NULL,
  ticket_number VARCHAR(32)     NOT NULL,
  user_id       BIGINT UNSIGNED NOT NULL,
  property_id   BIGINT UNSIGNED NULL,
  tenancy_id    BIGINT UNSIGNED NULL,
  category      ENUM('ACCOUNT','KYC','LISTING','PAYMENT','AGREEMENT','MAINTENANCE',
                     'INSURANCE','MARKETING','TECHNICAL','OTHER') NOT NULL DEFAULT 'OTHER',
  priority      ENUM('LOW','NORMAL','HIGH','URGENT') NOT NULL DEFAULT 'NORMAL',
  subject       VARCHAR(190)    NOT NULL,
  description   TEXT            NULL,
  status        ENUM('OPEN','ASSIGNED','WAITING_ON_USER','IN_PROGRESS','RESOLVED','CLOSED')
                NOT NULL DEFAULT 'OPEN',
  assigned_to   BIGINT UNSIGNED NULL,
  resolution    TEXT            NULL,
  first_response_at DATETIME    NULL,
  resolved_at   DATETIME        NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_st_public_id (public_id),
  UNIQUE KEY uq_st_number (ticket_number),
  KEY ix_st_user (user_id, status),
  KEY ix_st_assignee (assigned_to, status),
  CONSTRAINT fk_st_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_st_assignee FOREIGN KEY (assigned_to) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS ticket_messages (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ticket_id   BIGINT UNSIGNED NOT NULL,
  author_id   BIGINT UNSIGNED NOT NULL,
  is_internal TINYINT(1)      NOT NULL DEFAULT 0,
  body        TEXT            NOT NULL,
  document_id BIGINT UNSIGNED NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_tm_ticket (ticket_id),
  CONSTRAINT fk_tm_ticket FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE,
  CONSTRAINT fk_tm_author FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- secure in-platform conversation (documents are never sent as chat attachments)
CREATE TABLE IF NOT EXISTS conversations (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  context_type  ENUM('PROPERTY','ENQUIRY','TENANCY','LEGAL_CASE','MAINTENANCE','DISPUTE') NOT NULL,
  context_id    BIGINT UNSIGNED NOT NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_conv_context (context_type, context_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS conversation_participants (
  conversation_id BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  last_read_at    DATETIME        NULL,
  PRIMARY KEY (conversation_id, user_id),
  CONSTRAINT fk_cpart_conv FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_cpart_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS messages (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id       BIGINT UNSIGNED NOT NULL,
  body            TEXT            NOT NULL,
  document_id     BIGINT UNSIGNED NULL,           -- vault reference, access still checked
  created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_msg_conv (conversation_id, created_at),
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- reporting views
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_property_cards AS
SELECT
  p.id, p.public_id, p.slug, p.title, p.listing_type, p.property_type, p.bedrooms, p.bathrooms,
  p.builtup_area_sqft, p.carpet_area_sqft, p.furnishing, p.rent_amount, p.sale_price,
  p.security_deposit, p.locality, p.city, p.state, p.available_from, p.status,
  p.is_protected, p.is_featured, p.listed_by_role, p.view_count, p.published_at,
  (SELECT pi.storage_key FROM property_images pi
     WHERE pi.property_id = p.id ORDER BY pi.is_cover DESC, pi.sort_order ASC LIMIT 1) AS cover_key,
  (SELECT COUNT(*) FROM property_verifications pv
     WHERE pv.property_id = p.id AND pv.status = 'VERIFIED')                        AS verified_checks
FROM properties p
WHERE p.deleted_at IS NULL;

CREATE OR REPLACE VIEW v_admin_kpis AS
SELECT
  (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL)                              AS total_users,
  (SELECT COUNT(*) FROM properties WHERE status = 'ACTIVE')                          AS active_properties,
  (SELECT COUNT(*) FROM properties WHERE status = 'PENDING_VERIFICATION')            AS properties_pending,
  (SELECT COUNT(*) FROM kyc_records WHERE status IN ('SUBMITTED','IN_REVIEW'))       AS kyc_pending,
  (SELECT COUNT(*) FROM tenancies WHERE stage = 'ACTIVE')                            AS active_tenancies,
  (SELECT COUNT(*) FROM agreements WHERE status <> 'EXECUTED')                       AS agreements_open,
  (SELECT COALESCE(SUM(total_amount),0) FROM payments WHERE status = 'PAID')         AS payment_volume,
  (SELECT COALESCE(SUM(total_amount),0) FROM commissions WHERE status = 'PAID')      AS commission_revenue,
  (SELECT COALESCE(SUM(total_amount),0) FROM marketing_orders WHERE status IN ('PAID','LIVE','COMPLETED')) AS marketing_revenue,
  (SELECT COUNT(*) FROM disputes WHERE status NOT IN ('CLOSED','RESOLVED','WITHDRAWN')) AS open_disputes,
  (SELECT COUNT(*) FROM maintenance_requests WHERE status NOT IN ('CLOSED','CANCELLED')) AS open_maintenance,
  (SELECT COUNT(*) FROM support_tickets WHERE status NOT IN ('RESOLVED','CLOSED'))   AS open_tickets;
