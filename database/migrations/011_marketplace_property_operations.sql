-- ============================================================================
-- ODIBRICK MIGRATION 011: PROPERTY OPERATIONS, LISTING MONETIZATION & MARKETPLACE
-- ============================================================================

-- 1. Permissions
INSERT IGNORE INTO permissions (code, resource, action, description) VALUES
  ('marketplace.read', 'marketplace', 'read', 'View marketplace overview, listings, promotions and leads'),
  ('marketplace.manage', 'marketplace', 'manage', 'Manage marketplace listings, promotions, packages and overrides'),
  ('listing.moderate', 'listing', 'moderate', 'Review, approve, reject and suspend listings'),
  ('package.manage', 'package', 'manage', 'Create and configure marketplace monetization packages')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Grant marketplace permissions to SUPER_ADMIN and ADMIN
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('marketplace.read', 'marketplace.manage', 'listing.moderate', 'package.manage')
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN');

-- 2. Extend properties table for marketplace operations & visibility tiers
ALTER TABLE properties 
  MODIFY COLUMN status ENUM('DRAFT','PENDING_VERIFICATION','ACTIVE','REJECTED','RENTED','SOLD','PAUSED','ARCHIVED','SUSPENDED') NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN visibility_tier ENUM('STANDARD','FEATURED','PROMOTED','PREMIUM') NOT NULL DEFAULT 'STANDARD' AFTER is_featured,
  ADD COLUMN promoted_until DATETIME NULL AFTER featured_until,
  ADD COLUMN suspended_at DATETIME NULL AFTER rejection_reason,
  ADD COLUMN suspension_reason VARCHAR(500) NULL AFTER suspended_at,
  ADD COLUMN suspended_by BIGINT UNSIGNED NULL AFTER suspension_reason,
  ADD COLUMN moderated_by BIGINT UNSIGNED NULL AFTER suspended_by,
  ADD COLUMN moderated_at DATETIME NULL AFTER moderated_by,
  ADD COLUMN duplicate_of_property_id BIGINT UNSIGNED NULL AFTER moderated_at,
  ADD COLUMN duplicate_flagged_at DATETIME NULL AFTER duplicate_of_property_id;

-- 2b. Expand event_code on property_timeline for operations
ALTER TABLE property_timeline MODIFY COLUMN event_code VARCHAR(48) NOT NULL;

-- 3. Listing Promotions Table (Traceability: Listing <-> Package <-> Commercial Obligation <-> Payment <-> Invoice)
CREATE TABLE IF NOT EXISTS listing_promotions (
  id                        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id                 CHAR(26)        NOT NULL,
  promotion_code            VARCHAR(32)     NOT NULL, -- e.g. 'ODB-PRM-2026-000001'
  listing_id                BIGINT UNSIGNED NOT NULL,
  package_id                INT UNSIGNED    NULL,
  buyer_user_id             BIGINT UNSIGNED NOT NULL,
  visibility_tier           ENUM('FEATURED','PROMOTED','PREMIUM') NOT NULL DEFAULT 'FEATURED',
  commercial_obligation_id  BIGINT UNSIGNED NULL,
  payment_id                BIGINT UNSIGNED NULL,
  invoice_id                BIGINT UNSIGNED NULL,
  starts_at                 DATETIME        NOT NULL,
  ends_at                   DATETIME        NOT NULL,
  status                    ENUM('PENDING_PAYMENT','ACTIVE','EXPIRED','CANCELLED','SUSPENDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
  activation_source         ENUM('PAID_PACKAGE','MANAGEMENT_OVERRIDE','PROMOTIONAL') NOT NULL DEFAULT 'PAID_PACKAGE',
  created_by                BIGINT UNSIGNED NULL,
  notes                     VARCHAR(500)    NULL,
  created_at                DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lp_public_id (public_id),
  UNIQUE KEY uq_lp_code (promotion_code),
  KEY ix_lp_listing_status (listing_id, status),
  KEY ix_lp_buyer (buyer_user_id),
  KEY ix_lp_dates (starts_at, ends_at),
  KEY ix_lp_payment (payment_id),
  KEY ix_lp_obligation (commercial_obligation_id),
  CONSTRAINT fk_lp_listing FOREIGN KEY (listing_id) REFERENCES properties (id) ON DELETE CASCADE,
  CONSTRAINT fk_lp_package FOREIGN KEY (package_id) REFERENCES marketing_packages (id) ON DELETE SET NULL,
  CONSTRAINT fk_lp_buyer FOREIGN KEY (buyer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_lp_obligation FOREIGN KEY (commercial_obligation_id) REFERENCES commercial_obligations (id) ON DELETE SET NULL,
  CONSTRAINT fk_lp_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_lp_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE SET NULL,
  CONSTRAINT fk_lp_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 4. Extend enquiries table with promotion attribution
ALTER TABLE enquiries
  ADD COLUMN promotion_id BIGINT UNSIGNED NULL AFTER campaign_id;

-- 5. Seed default Marketplace Monetization Packages if not present
INSERT IGNORE INTO marketing_packages (
  code, name, tagline, audience, duration_days, price, tax_rate, ad_budget_included, features, channels, featured_slots, is_custom_quote, is_active, sort_order
) VALUES
  ('PKG-BOOST-7D', '7-Day Priority Boost', 'Move your listing above standard search results for 7 days', 'ANY', 7, 1999.00, 18.00, 500.00, 
   JSON_ARRAY('Priority in city search', 'Promoted badge', 'Instant lead notifications'), 
   JSON_ARRAY('SEARCH_BOOST', 'CATEGORY_TOP'), 1, 0, 1, 10),
  ('PKG-FEATURED-30D', '30-Day Featured Listing', 'Featured placement on home page and top of locality listings for 30 days', 'ANY', 30, 4999.00, 18.00, 1500.00, 
   JSON_ARRAY('Homepage featured badge', 'Top rank in locality search', 'Direct WhatsApp lead connect', 'Detailed analytics'), 
   JSON_ARRAY('HOMEPAGE_FEATURED', 'SEARCH_TOP', 'SOCIAL_HIGHLIGHT'), 3, 0, 1, 20),
  ('PKG-PREMIUM-30D', '30-Day Premium Showcase', 'Comprehensive multi-channel visibility, top-tier featured badge, and verified badge boost', 'ANY', 30, 9999.00, 18.00, 3500.00, 
   JSON_ARRAY('Gold Premium badge', 'Dedicated featured carousel', 'Priority verified processing', 'Lead accelerator (3x views)', 'Dedicated relationship manager'), 
   JSON_ARRAY('HOMEPAGE_FEATURED', 'SEARCH_TOP', 'EMAIL_BLAST', 'SOCIAL_HIGHLIGHT'), 5, 0, 1, 30),
  ('PKG-BUILDER-60D', '60-Day Project Showcase', 'Dedicated project banner, multi-unit bulk promotion, and builder showcase slot', 'BUILDER', 60, 24999.00, 18.00, 10000.00, 
   JSON_ARRAY('Project banner showcase', 'Up to 10 project units promoted', 'Dedicated landing page', 'Targeted buyer SMS & email campaign'), 
   JSON_ARRAY('HOMEPAGE_BANNER', 'SEARCH_TOP', 'EMAIL_BLAST', 'SMS_CAMPAIGN'), 10, 0, 1, 40)
ON DUPLICATE KEY UPDATE name = VALUES(name), price = VALUES(price), duration_days = VALUES(duration_days), is_active = VALUES(is_active);
