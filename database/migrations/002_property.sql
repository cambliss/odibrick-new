-- =====================================================================
-- ODIBRICK · 002 · Parties, properties, media, verification, timeline
-- =====================================================================
SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- party profiles (one row per role a user holds)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS owners (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  owner_type         ENUM('INDIVIDUAL','HUF','COMPANY','TRUST') NOT NULL DEFAULT 'INDIVIDUAL',
  pan_last4          VARCHAR(4)      NULL,
  bank_verified      TINYINT(1)      NOT NULL DEFAULT 0,
  payout_account_id  BIGINT UNSIGNED NULL,
  properties_count   INT UNSIGNED    NOT NULL DEFAULT 0,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_owners_user (user_id),
  CONSTRAINT fk_owner_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tenants (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  household_type     ENUM('FAMILY','BACHELOR','COUPLE','COMPANY_LEASE','STUDENT') NULL,
  occupants          TINYINT UNSIGNED NULL,
  has_pets           TINYINT(1)      NOT NULL DEFAULT 0,
  monthly_income     DECIMAL(12,2)   NULL,
  preferred_move_in  DATE            NULL,
  budget_min         DECIMAL(12,2)   NULL,
  budget_max         DECIMAL(12,2)   NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tenants_user (user_id),
  CONSTRAINT fk_tenant_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS agents (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  agency_name        VARCHAR(190)    NOT NULL,
  rera_number        VARCHAR(64)     NULL,
  gstin              VARCHAR(20)     NULL,
  operating_cities   JSON            NULL,
  team_size          SMALLINT UNSIGNED NULL,
  verification_status ENUM('UNVERIFIED','PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'UNVERIFIED',
  rating             DECIMAL(3,2)    NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_agents_user (user_id),
  KEY ix_agents_status (verification_status),
  CONSTRAINT fk_agent_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS builders (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id            BIGINT UNSIGNED NOT NULL,
  company_name       VARCHAR(190)    NOT NULL,
  cin                VARCHAR(32)     NULL,
  gstin              VARCHAR(20)     NULL,
  rera_number        VARCHAR(64)     NULL,
  incorporated_on    DATE            NULL,
  website            VARCHAR(190)    NULL,
  verification_status ENUM('UNVERIFIED','PENDING','VERIFIED','REJECTED') NOT NULL DEFAULT 'UNVERIFIED',
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_builders_user (user_id),
  CONSTRAINT fk_builder_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS builder_projects (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id      CHAR(26)        NOT NULL,
  builder_id     BIGINT UNSIGNED NOT NULL,
  name           VARCHAR(190)    NOT NULL,
  slug           VARCHAR(190)    NOT NULL,
  status         ENUM('PLANNED','UNDER_CONSTRUCTION','READY','DELIVERED') NOT NULL DEFAULT 'UNDER_CONSTRUCTION',
  rera_number    VARCHAR(64)     NULL,
  city           VARCHAR(120)    NOT NULL,
  locality       VARCHAR(120)    NULL,
  address        VARCHAR(255)    NULL,
  latitude       DECIMAL(10,7)   NULL,
  longitude      DECIMAL(10,7)   NULL,
  total_units    INT UNSIGNED    NOT NULL DEFAULT 0,
  possession_on  DATE            NULL,
  description    TEXT            NULL,
  is_featured    TINYINT(1)      NOT NULL DEFAULT 0,
  created_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_public_id (public_id),
  UNIQUE KEY uq_projects_slug (slug),
  KEY ix_projects_builder (builder_id),
  KEY ix_projects_city (city),
  CONSTRAINT fk_project_builder FOREIGN KEY (builder_id) REFERENCES builders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------------
-- properties
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS properties (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id          CHAR(26)        NOT NULL,
  slug               VARCHAR(220)    NOT NULL,     -- /india/hyderabad/gachibowli/2bhk-apartment-xxxx
  listed_by_user_id  BIGINT UNSIGNED NOT NULL,
  listed_by_role     ENUM('OWNER','AGENT','BUILDER') NOT NULL,
  owner_id           BIGINT UNSIGNED NULL,
  agent_id           BIGINT UNSIGNED NULL,
  builder_id         BIGINT UNSIGNED NULL,
  project_id         BIGINT UNSIGNED NULL,

  title              VARCHAR(190)    NOT NULL,
  listing_type       ENUM('RENT','SALE') NOT NULL DEFAULT 'RENT',
  property_type      ENUM('APARTMENT','INDEPENDENT_HOUSE','VILLA','STUDIO','PENTHOUSE',
                          'PLOT','OFFICE','SHOP','WAREHOUSE','PG') NOT NULL,
  bedrooms           TINYINT UNSIGNED NULL,
  bathrooms          TINYINT UNSIGNED NULL,
  balconies          TINYINT UNSIGNED NULL,
  floor_number       SMALLINT        NULL,
  total_floors       SMALLINT        NULL,
  carpet_area_sqft   INT UNSIGNED    NULL,
  builtup_area_sqft  INT UNSIGNED    NULL,
  furnishing         ENUM('UNFURNISHED','SEMI_FURNISHED','FULLY_FURNISHED') NOT NULL DEFAULT 'UNFURNISHED',
  facing             ENUM('N','S','E','W','NE','NW','SE','SW') NULL,
  age_years          TINYINT UNSIGNED NULL,
  parking_covered    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  parking_open       TINYINT UNSIGNED NOT NULL DEFAULT 0,

  rent_amount        DECIMAL(12,2)   NULL,
  sale_price         DECIMAL(14,2)   NULL,
  security_deposit   DECIMAL(12,2)   NULL,
  maintenance_amount DECIMAL(10,2)   NULL,
  maintenance_period ENUM('MONTHLY','QUARTERLY','YEARLY','INCLUDED','NONE') NOT NULL DEFAULT 'MONTHLY',
  price_negotiable   TINYINT(1)      NOT NULL DEFAULT 0,
  lock_in_months     TINYINT UNSIGNED NULL,
  notice_period_days SMALLINT UNSIGNED NULL,

  address_line1      VARCHAR(190)    NOT NULL,
  address_line2      VARCHAR(190)    NULL,
  locality           VARCHAR(120)    NOT NULL,
  city               VARCHAR(120)    NOT NULL,
  state              VARCHAR(120)    NOT NULL,
  pincode            VARCHAR(10)     NOT NULL,
  latitude           DECIMAL(10,7)   NULL,
  longitude          DECIMAL(10,7)   NULL,

  available_from     DATE            NULL,
  preferred_tenants  SET('FAMILY','BACHELOR_MALE','BACHELOR_FEMALE','COMPANY','STUDENT','ANY') NULL,
  pets_allowed       TINYINT(1)      NOT NULL DEFAULT 0,
  non_veg_allowed    TINYINT(1)      NOT NULL DEFAULT 1,
  description        TEXT            NULL,
  house_rules        TEXT            NULL,

  status             ENUM('DRAFT','PENDING_VERIFICATION','ACTIVE','REJECTED','RENTED',
                          'SOLD','PAUSED','ARCHIVED') NOT NULL DEFAULT 'DRAFT',
  wizard_step        TINYINT UNSIGNED NOT NULL DEFAULT 1,
  rejection_reason   VARCHAR(500)    NULL,
  is_protected       TINYINT(1)      NOT NULL DEFAULT 0,  -- Odibrick Protected plan active
  is_featured        TINYINT(1)      NOT NULL DEFAULT 0,
  featured_until     DATETIME        NULL,
  quality_score      TINYINT UNSIGNED NOT NULL DEFAULT 0, -- listing completeness 0-100
  view_count         INT UNSIGNED    NOT NULL DEFAULT 0,
  enquiry_count      INT UNSIGNED    NOT NULL DEFAULT 0,
  is_demo            TINYINT(1)      NOT NULL DEFAULT 0,

  published_at       DATETIME        NULL,
  created_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at         DATETIME        NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_properties_public_id (public_id),
  UNIQUE KEY uq_properties_slug (slug),
  KEY ix_prop_search (status, listing_type, city, property_type, bedrooms),
  KEY ix_prop_rent (city, rent_amount),
  KEY ix_prop_locality (city, locality),
  KEY ix_prop_owner (owner_id),
  KEY ix_prop_agent (agent_id),
  KEY ix_prop_builder (builder_id),
  KEY ix_prop_available (available_from),
  FULLTEXT KEY ft_prop_text (title, description, locality, city),
  CONSTRAINT fk_prop_lister FOREIGN KEY (listed_by_user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_prop_owner FOREIGN KEY (owner_id) REFERENCES owners (id) ON DELETE SET NULL,
  CONSTRAINT fk_prop_agent FOREIGN KEY (agent_id) REFERENCES agents (id) ON DELETE SET NULL,
  CONSTRAINT fk_prop_builder FOREIGN KEY (builder_id) REFERENCES builders (id) ON DELETE SET NULL,
  CONSTRAINT fk_prop_project FOREIGN KEY (project_id) REFERENCES builder_projects (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS property_units (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id    BIGINT UNSIGNED NOT NULL,
  property_id   BIGINT UNSIGNED NULL,
  tower         VARCHAR(48)     NULL,
  unit_number   VARCHAR(48)     NOT NULL,
  floor_number  SMALLINT        NULL,
  unit_type     VARCHAR(48)     NULL,             -- 2BHK / 3BHK
  carpet_area_sqft INT UNSIGNED NULL,
  status        ENUM('AVAILABLE','BLOCKED','SOLD','RENTED') NOT NULL DEFAULT 'AVAILABLE',
  price         DECIMAL(14,2)   NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_unit_project_number (project_id, tower, unit_number),
  KEY ix_unit_status (project_id, status),
  CONSTRAINT fk_unit_project FOREIGN KEY (project_id) REFERENCES builder_projects (id) ON DELETE CASCADE,
  CONSTRAINT fk_unit_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS property_images (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id  BIGINT UNSIGNED NOT NULL,
  storage_key  VARCHAR(400)    NOT NULL,
  caption      VARCHAR(190)    NULL,
  room_tag     VARCHAR(48)     NULL,
  width        SMALLINT UNSIGNED NULL,
  height       SMALLINT UNSIGNED NULL,
  is_cover     TINYINT(1)      NOT NULL DEFAULT 0,
  sort_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_img_property (property_id, sort_order),
  CONSTRAINT fk_img_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS property_videos (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id  BIGINT UNSIGNED NOT NULL,
  storage_key  VARCHAR(400)    NULL,
  external_url VARCHAR(400)    NULL,
  kind         ENUM('WALKTHROUGH','DRONE','VIRTUAL_TOUR','OTHER') NOT NULL DEFAULT 'WALKTHROUGH',
  duration_sec SMALLINT UNSIGNED NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_vid_property (property_id),
  CONSTRAINT fk_vid_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS amenities (
  id        INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  code      VARCHAR(48)   NOT NULL,
  name      VARCHAR(96)   NOT NULL,
  category  ENUM('BUILDING','UNIT','SAFETY','LIFESTYLE','UTILITY') NOT NULL DEFAULT 'BUILDING',
  icon      VARCHAR(48)   NULL,
  is_active TINYINT(1)    NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_amenities_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS property_amenities (
  property_id BIGINT UNSIGNED NOT NULL,
  amenity_id  INT UNSIGNED    NOT NULL,
  PRIMARY KEY (property_id, amenity_id),
  CONSTRAINT fk_pa_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_pa_amenity FOREIGN KEY (amenity_id) REFERENCES amenities (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- verification badges: a badge exists only when a row here is VERIFIED
CREATE TABLE IF NOT EXISTS property_verifications (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id   BIGINT UNSIGNED NOT NULL,
  check_type    ENUM('KYC','OWNER_IDENTITY','OWNERSHIP_DOCUMENT','ADDRESS',
                     'PHOTO_AUTHENTICITY','PHYSICAL_VISIT','PROTECTED_PLAN') NOT NULL,
  status        ENUM('PENDING','IN_REVIEW','VERIFIED','FAILED','EXPIRED') NOT NULL DEFAULT 'PENDING',
  evidence_document_id BIGINT UNSIGNED NULL,
  reviewer_id   BIGINT UNSIGNED NULL,
  notes         VARCHAR(500)    NULL,
  verified_at   DATETIME        NULL,
  expires_at    DATE            NULL,
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pv_property_check (property_id, check_type),
  KEY ix_pv_status (status),
  CONSTRAINT fk_pv_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_pv_doc FOREIGN KEY (evidence_document_id) REFERENCES documents (id) ON DELETE SET NULL,
  CONSTRAINT fk_pv_reviewer FOREIGN KEY (reviewer_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- the property record spine (Odibrick signature feature)
CREATE TABLE IF NOT EXISTS property_timeline (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id  BIGINT UNSIGNED NOT NULL,
  tenancy_id   BIGINT UNSIGNED NULL,
  event_code   ENUM('PROPERTY_CREATED','PROPERTY_VERIFIED','PROPERTY_PUBLISHED','TENANT_SELECTED',
                    'AGREEMENT_SIGNED','PAYMENT_COMPLETED','CHECK_IN_REPORT','MAINTENANCE_EVENT',
                    'INSPECTION','RENEWAL','MOVE_OUT_REPORT','TENANCY_CLOSED','DISPUTE') NOT NULL,
  title        VARCHAR(190)    NOT NULL,
  detail       VARCHAR(500)    NULL,
  actor_id     BIGINT UNSIGNED NULL,
  reference_type VARCHAR(48)   NULL,
  reference_id BIGINT UNSIGNED NULL,
  occurred_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_timeline_property (property_id, occurred_at),
  CONSTRAINT fk_tl_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_tl_actor FOREIGN KEY (actor_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS saved_properties (
  user_id     BIGINT UNSIGNED NOT NULL,
  property_id BIGINT UNSIGNED NOT NULL,
  note        VARCHAR(255)    NULL,
  created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, property_id),
  CONSTRAINT fk_sp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT fk_sp_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS property_views (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  property_id  BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NULL,
  session_hash CHAR(64)        NULL,
  source       VARCHAR(48)     NULL,             -- search / featured / campaign
  campaign_id  BIGINT UNSIGNED NULL,
  created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_view_property_time (property_id, created_at),
  CONSTRAINT fk_view_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
