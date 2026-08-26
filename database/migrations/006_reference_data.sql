-- =====================================================================
-- ODIBRICK · 006 · Reference data (not demo data — required to run)
-- =====================================================================
SET NAMES utf8mb4;

INSERT INTO roles (code, name, description, is_staff) VALUES
 ('SUPER_ADMIN','Super admin','Full platform control',1),
 ('ADMIN','Admin','Operational management',1),
 ('LEGAL_TEAM','Legal team','Agreements, clauses, consultations',1),
 ('KYC_TEAM','Verification team','User and property verification',1),
 ('MARKETING_TEAM','Cambliss marketing','Packages and campaigns',1),
 ('PROPERTY_MANAGER','Property manager','Inspections and maintenance',1),
 ('SUPPORT_TEAM','Support','Tickets and escalations',1),
 ('INSURANCE_PARTNER','Insurance partner','Quotes, policies, claims handoff',1),
 ('OWNER','Property owner','Lists and manages own properties',0),
 ('TENANT','Tenant','Searches, applies, rents',0),
 ('AGENT','Agent','Property inventory and leads',0),
 ('BUILDER','Builder','Projects, units and inventory',0)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO permissions (code, resource, action, description) VALUES
 ('user.read','user','read','View user records'),
 ('user.manage','user','manage','Create, suspend, assign roles'),
 ('kyc.read','kyc','read','View KYC submissions'),
 ('kyc.review','kyc','review','Approve or reject KYC'),
 ('property.create','property','create','Create listings'),
 ('property.update.own','property','update.own','Edit own listings'),
 ('property.moderate','property','moderate','Approve, reject, unpublish'),
 ('property.read.private','property','read.private','See private listing data'),
 ('application.decide','application','decide','Accept or reject applications'),
 ('legal.case.manage','legal','manage','Work legal cases'),
 ('agreement.draft','agreement','draft','Create and edit drafts'),
 ('agreement.approve','agreement','approve','Legal approval of an agreement'),
 ('agreement.sign','agreement','sign','Sign as a party'),
 ('payment.read','payment','read','View payments'),
 ('payment.manage','payment','manage','Record, refund, reconcile'),
 ('commission.manage','commission','manage','Rules, cycles, waivers'),
 ('marketing.package.manage','marketing','manage','Create and price packages'),
 ('campaign.manage','campaign','manage','Run campaigns'),
 ('inspection.create','inspection','create','Create condition reports'),
 ('inspection.acknowledge','inspection','acknowledge','Acknowledge a report'),
 ('maintenance.manage','maintenance','manage','Assign and close requests'),
 ('insurance.manage','insurance','manage','Products, quotes, policies'),
 ('dispute.manage','dispute','manage','Work disputes'),
 ('support.manage','support','manage','Work tickets'),
 ('document.read.any','document','read.any','Read any vault document'),
 ('settings.manage','settings','manage','Platform configuration'),
 ('audit.read','audit','read','Read audit logs'),
 ('analytics.read','analytics','read','Platform analytics')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- SUPER_ADMIN gets everything
INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.code = 'SUPER_ADMIN';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('user.read','user.manage','kyc.read','kyc.review','property.moderate',
                'property.read.private','payment.read','payment.manage','commission.manage',
                'marketing.package.manage','campaign.manage','maintenance.manage','insurance.manage',
                'dispute.manage','support.manage','settings.manage','audit.read','analytics.read')
WHERE r.code = 'ADMIN';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('legal.case.manage','agreement.draft','agreement.approve','document.read.any',
                'dispute.manage','kyc.read','property.read.private')
WHERE r.code = 'LEGAL_TEAM';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('kyc.read','kyc.review','property.moderate','property.read.private')
WHERE r.code = 'KYC_TEAM';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('marketing.package.manage','campaign.manage','analytics.read')
WHERE r.code = 'MARKETING_TEAM';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('inspection.create','inspection.acknowledge','maintenance.manage','property.read.private')
WHERE r.code = 'PROPERTY_MANAGER';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('support.manage','user.read','payment.read')
WHERE r.code = 'SUPPORT_TEAM';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('insurance.manage')
WHERE r.code = 'INSURANCE_PARTNER';

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('property.create','property.update.own','application.decide','agreement.sign',
                'inspection.acknowledge','payment.read')
WHERE r.code IN ('OWNER','AGENT','BUILDER');

INSERT IGNORE INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.code IN ('agreement.sign','inspection.create','inspection.acknowledge','payment.read')
WHERE r.code = 'TENANT';

-- ---------------------------------------------------------------------
INSERT INTO amenities (code, name, category, icon) VALUES
 ('LIFT','Lift','BUILDING','lift'),
 ('POWER_BACKUP','Power backup','UTILITY','power'),
 ('BOREWELL','Borewell water','UTILITY','water'),
 ('MUNICIPAL_WATER','Municipal water','UTILITY','water'),
 ('SECURITY','24x7 security','SAFETY','shield'),
 ('CCTV','CCTV','SAFETY','camera'),
 ('FIRE_SAFETY','Fire safety','SAFETY','fire'),
 ('GATED','Gated community','BUILDING','gate'),
 ('GYM','Gym','LIFESTYLE','gym'),
 ('POOL','Swimming pool','LIFESTYLE','pool'),
 ('CLUBHOUSE','Clubhouse','LIFESTYLE','club'),
 ('PLAY_AREA','Children play area','LIFESTYLE','play'),
 ('PARK','Park','LIFESTYLE','park'),
 ('VISITOR_PARKING','Visitor parking','BUILDING','parking'),
 ('MODULAR_KITCHEN','Modular kitchen','UNIT','kitchen'),
 ('WARDROBES','Wardrobes','UNIT','wardrobe'),
 ('AC','Air conditioning','UNIT','ac'),
 ('GEYSER','Geyser','UNIT','geyser'),
 ('PIPED_GAS','Piped gas','UTILITY','gas'),
 ('INTERNET','Internet ready','UTILITY','wifi'),
 ('BALCONY','Balcony','UNIT','balcony'),
 ('SERVANT_ROOM','Servant room','UNIT','room'),
 ('RAINWATER','Rainwater harvesting','UTILITY','rain'),
 ('WASTE_DISPOSAL','Waste disposal','UTILITY','waste')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ---------------------------------------------------------------------
-- clause library: drafting aids for the legal team, never auto-binding
-- ---------------------------------------------------------------------
INSERT INTO clause_library (code, title, category, body_template, is_mandatory, version) VALUES
 ('RENT_AMOUNT','Rent and payment date','RENT',
  'The Licensee shall pay a monthly licence fee of INR {{rent_amount}} on or before the {{rent_due_day}} day of each calendar month to the Licensor.',1,1),
 ('DEPOSIT','Interest-free security deposit','DEPOSIT',
  'The Licensee has paid an interest-free refundable deposit of INR {{deposit_amount}}, refundable within {{refund_days}} days of vacating, subject to deductions recorded in the move-out condition report.',1,1),
 ('LOCK_IN','Lock-in period','LOCK_IN',
  'Neither party shall terminate this agreement during the lock-in period of {{lock_in_months}} months, except as provided herein.',0,1),
 ('NOTICE','Notice period','NOTICE',
  'Either party may terminate this agreement by giving {{notice_period_days}} days written notice to the other party.',1,1),
 ('MAINTENANCE','Maintenance and society charges','MAINTENANCE',
  'Monthly maintenance of INR {{maintenance_amount}} shall be borne by the {{maintenance_bearer}}.',0,1),
 ('UTILITIES','Utilities','UTILITIES',
  'Electricity, water and gas consumption charges from the readings recorded in the check-in condition report shall be borne by the Licensee.',0,1),
 ('REPAIRS','Repairs','REPAIRS',
  'Minor repairs up to INR {{minor_repair_cap}} shall be borne by the Licensee. Structural and major repairs shall be borne by the Licensor.',0,1),
 ('CONDITION_RECORD','Condition record','OTHER',
  'The parties acknowledge the Odibrick check-in condition report dated {{checkin_date}} as the agreed record of the condition of the premises at the commencement of occupancy.',0,1),
 ('RESTRICTIONS','Use of premises','RESTRICTIONS',
  'The premises shall be used for residential purposes only and shall not be sublet or assigned without prior written consent of the Licensor.',1,1),
 ('TERMINATION','Termination','TERMINATION',
  'This agreement may be terminated on the grounds set out herein, following which the Licensee shall hand over vacant possession.',1,1),
 ('DISPUTE_RESOLUTION','Dispute resolution','DISPUTE',
  'Disputes shall first be referred to the Odibrick dispute process. Nothing herein limits either party''s statutory remedies under applicable law.',0,1)
ON DUPLICATE KEY UPDATE title = VALUES(title);

-- ---------------------------------------------------------------------
INSERT INTO commission_rules
 (code, name, applies_to, basis, percent_value, flat_value, min_amount, payer, tax_rate, effective_from) VALUES
 ('STD_ANNUAL','Standard annual service fee','STANDARD','PERCENT_OF_MONTHLY_RENT',50.00,NULL,2500.00,'OWNER',18.00,'2026-01-01'),
 ('PROTECTED_ANNUAL','Protected annual plan','PROTECTED','PERCENT_OF_MONTHLY_RENT',85.00,NULL,6000.00,'OWNER',18.00,'2026-01-01'),
 ('MANAGED_ANNUAL','Premium managed plan','MANAGED','PERCENT_OF_ANNUAL_RENT',6.00,NULL,18000.00,'OWNER',18.00,'2026-01-01')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO marketing_packages
 (code, name, tagline, audience, duration_days, price, ad_budget_included, features, channels, featured_slots, sort_order) VALUES
 ('STARTER','Starter','Get your listings seen','ANY',30,7999.00,0.00,
  JSON_ARRAY('Listing optimisation','Basic social promotion','Property promotion slot','Monthly campaign report'),
  JSON_ARRAY('ODIBRICK','META'),2,1),
 ('GROWTH','Growth','Paid reach with managed creative','AGENT',30,24999.00,7500.00,
  JSON_ARRAY('Everything in Starter','Managed paid advertising','Creative design','Landing page','Remarketing','Lead generation','Performance report'),
  JSON_ARRAY('ODIBRICK','META','GOOGLE'),6,2),
 ('PREMIUM','Premium','Priority placement and video','AGENT',30,59999.00,20000.00,
  JSON_ARRAY('Everything in Growth','High-priority placement','Video production','Property walkthrough','Lead qualification','Dedicated account manager'),
  JSON_ARRAY('ODIBRICK','META','GOOGLE','YOUTUBE'),15,3),
 ('BUILDER_ENTERPRISE','Builder Enterprise','Project launch, end to end','BUILDER',90,0.00,0.00,
  JSON_ARRAY('Project branding','Project microsite','Performance marketing','CRM integration','Inventory management','Sales dashboard','Campaign analytics'),
  JSON_ARRAY('ODIBRICK','META','GOOGLE','YOUTUBE','EMAIL'),50,4)
ON DUPLICATE KEY UPDATE name = VALUES(name);
UPDATE marketing_packages SET is_custom_quote = 1 WHERE code = 'BUILDER_ENTERPRISE';

-- Protection catalogue. Rows with offering_type = ODIBRICK_SERVICE are NOT insurance.
INSERT INTO insurance_products
 (partner_id, code, name, offering_type, category, audience, summary, base_premium, term_months, is_active) VALUES
 (NULL,'ODB_RENT_RECORDS','Odibrick payment & document record','ODIBRICK_SERVICE','OTHER','BOTH',
  'A platform service: receipts, agreement copies and condition records kept in your vault. Not insurance.',0.00,12,1),
 (NULL,'ODB_DEPOSIT_ASSIST','Odibrick deposit dispute assistance','ODIBRICK_SERVICE','OTHER','TENANT',
  'A platform service: structured evidence pack and dispute handling. Not an insurance product and not a guarantee of refund.',0.00,12,1)
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- ---------------------------------------------------------------------
INSERT INTO platform_settings (setting_key, value_json, group_name, description) VALUES
 ('brand.name','"Odibrick"','brand','Public brand name'),
 ('brand.promise','"Property, protected."','brand','Positioning line'),
 ('commission.default_rule','"STD_ANNUAL"','commission','Rule applied when none matches'),
 ('commission.grace_days','15','commission','Days after due date before overdue'),
 ('payments.provider','"manual"','payments','Active payment adapter key'),
 ('payments.settlement_mode','"DIRECT_TO_PAYEE"','payments','No custody until a licensed partner is live'),
 ('video.provider','"pending"','video','Active video adapter key'),
 ('kyc.provider','"manual"','kyc','Active KYC adapter key'),
 ('storage.driver','"LOCAL"','storage','LOCAL or S3'),
 ('listing.free_unlimited','true','listing','Agents and builders list free, without limits'),
 ('listing.auto_publish','false','listing','Listings require verification before going live'),
 ('search.default_city','"Hyderabad"','search','Launch city'),
 ('launch.cities','["Hyderabad","Bengaluru","Pune"]','search','Controlled launch markets'),
 ('tax.gst_rate','18','tax','Default GST rate on Odibrick services')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO notification_templates (event_code, channel, subject, body) VALUES
 ('KYC_SUBMITTED','IN_APP','KYC submitted','Your documents are with our verification team. Most checks finish within 24 hours.'),
 ('KYC_APPROVED','IN_APP','KYC verified','Your identity is verified. You can now list or apply for a property.'),
 ('PROPERTY_APPROVED','IN_APP','Listing is live','{{property_title}} is now visible in search.'),
 ('PROPERTY_REJECTED','IN_APP','Listing needs changes','{{property_title}} was not published. Reason: {{reason}}'),
 ('APPLICATION_SUBMITTED','IN_APP','New application','{{tenant_name}} applied for {{property_title}}.'),
 ('APPLICATION_ACCEPTED','IN_APP','Application accepted','The owner accepted your application for {{property_title}}. Legal review starts next.'),
 ('MEETING_SCHEDULED','IN_APP','Legal consultation scheduled','Your session is on {{scheduled_for}}.'),
 ('AGREEMENT_READY','IN_APP','Agreement ready to sign','Agreement {{agreement_number}} is approved and waiting for your signature.'),
 ('PAYMENT_DUE','IN_APP','Payment due','{{purpose}} of INR {{amount}} is due on {{due_date}}.'),
 ('PAYMENT_RECEIVED','IN_APP','Payment recorded','We recorded {{purpose}} of INR {{amount}}. Receipt is in your vault.'),
 ('CHECK_IN_PENDING','IN_APP','Document your home','Complete your Day 1 condition report within {{days}} days of moving in.'),
 ('RENEWAL_DUE','IN_APP','Renewal approaching','Your tenancy renews on {{renewal_date}}.'),
 ('MAINTENANCE_UPDATE','IN_APP','Maintenance update','{{ticket_number}} is now {{status}}.'),
 ('POLICY_EXPIRY','IN_APP','Policy expiring','Policy {{policy_number}} expires on {{expires_on}}.')
ON DUPLICATE KEY UPDATE body = VALUES(body);
