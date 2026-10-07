-- ======================================================================
-- ODIBRICK MIGRATION 021: PERSONALIZATION, DISCOVERY & RECOMMENDATIONS
-- ======================================================================

-- 1. User Property Preferences
CREATE TABLE IF NOT EXISTS user_property_preferences (
  id                              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id                         BIGINT UNSIGNED NOT NULL UNIQUE,
  preferred_city                  VARCHAR(96)     NULL,
  preferred_locality              VARCHAR(190)    NULL,
  property_type                   VARCHAR(48)     NULL,
  min_bhk                         INT             NULL,
  max_bhk                         INT             NULL,
  min_rent                        DECIMAL(14,2)   NULL,
  max_rent                        DECIMAL(14,2)   NULL,
  furnishing                      VARCHAR(48)     NULL,
  preferred_amenities             JSON            NULL,
  min_carpet_area_sqft            INT             NULL,
  preferred_lease_duration_months INT             NULL,
  move_in_timeframe               VARCHAR(64)     NULL,
  tenant_type                     VARCHAR(64)     NULL,
  created_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pref_user (user_id),
  KEY ix_pref_city_locality (preferred_city, preferred_locality),
  CONSTRAINT fk_pref_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 2. Saved Searches & Search Alerts
CREATE TABLE IF NOT EXISTS saved_searches (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NOT NULL,
  name              VARCHAR(190)    NOT NULL,
  city              VARCHAR(96)     NULL,
  locality          VARCHAR(190)    NULL,
  property_type     VARCHAR(48)     NULL,
  min_bhk           INT             NULL,
  max_bhk           INT             NULL,
  min_rent          DECIMAL(14,2)   NULL,
  max_rent          DECIMAL(14,2)   NULL,
  furnishing        VARCHAR(48)     NULL,
  amenities         JSON            NULL,
  filters           JSON            NULL,
  is_alert_enabled  TINYINT(1)      NOT NULL DEFAULT 1,
  frequency         ENUM('INSTANT','DAILY','WEEKLY') NOT NULL DEFAULT 'INSTANT',
  last_alerted_at   DATETIME        NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_saved_search_user (user_id),
  KEY ix_saved_search_alert (is_alert_enabled, frequency),
  CONSTRAINT fk_saved_search_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 3. Property Interaction Telemetry (Foundation for Future ML)
CREATE TABLE IF NOT EXISTS property_interactions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id           BIGINT UNSIGNED NULL,
  session_id        VARCHAR(128)    NULL,
  property_id       BIGINT UNSIGNED NOT NULL,
  interaction_type  ENUM('VIEW','SAVE','UNSAVE','ENQUIRY','VISIT_REQUEST','APPLICATION','SHARE') NOT NULL,
  source            VARCHAR(64)     NULL DEFAULT 'ORGANIC',
  metadata          JSON            NULL,
  created_at        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY ix_pi_user_type (user_id, interaction_type, created_at),
  KEY ix_pi_prop_type (property_id, interaction_type, created_at),
  KEY ix_pi_created (created_at),
  CONSTRAINT fk_pi_property FOREIGN KEY (property_id) REFERENCES properties (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Register RBAC Permissions for Personalization & Provider Experience
INSERT IGNORE INTO permissions (id, code, description) VALUES
  (44, 'personalization.read', 'View customer preferences, recommendations, and saved items'),
  (45, 'personalization.manage', 'Create, update, and delete preferences, saved searches, and saved properties'),
  (46, 'provider.insights', 'Access provider listing performance, action centre, and aggregate market demand insights');

-- Assign to SUPER_ADMIN (role_id=1) and ADMIN (role_id=2)
INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES
  (1, 44), (1, 45), (1, 46),
  (2, 44), (2, 45), (2, 46);
