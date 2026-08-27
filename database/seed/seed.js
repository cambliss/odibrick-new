#!/usr/bin/env node
/**
 * Odibrick demo seed.
 *
 * Creates a realistic but obviously-fake dataset: 10 owners, 20 tenants,
 * 5 agents, 3 builders, 30 properties, plus one tenancy carried all the way
 * through legal review, signature, payment and a Day-1 condition report.
 *
 * Everything it writes is marked is_demo = 1 or carries a demo@odibrick.test
 * address, so `node database/seed/seed.js --purge` can remove all of it.
 *
 * It never runs against a database whose users table already holds non-demo
 * accounts unless --force is passed.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const argon2 = require('argon2');

loadEnv();

const DEMO_PASSWORD = 'OdibrickDemo2026';
const CITIES = [
  { city: 'Hyderabad', state: 'Telangana', localities: ['Gachibowli', 'Kondapur', 'Madhapur', 'Kokapet', 'Manikonda', 'Banjara Hills'], pin: '5000' },
  { city: 'Bengaluru', state: 'Karnataka', localities: ['Indiranagar', 'Whitefield', 'HSR Layout', 'Koramangala', 'Jayanagar'], pin: '5600' },
  { city: 'Pune', state: 'Maharashtra', localities: ['Baner', 'Kharadi', 'Viman Nagar', 'Hinjewadi'], pin: '4110' },
];
const FIRST = ['Aarav','Diya','Kabir','Meera','Rohan','Ananya','Vikram','Ishita','Arjun','Nisha','Karthik','Sneha','Rahul','Priya','Aditya','Tara','Sameer','Lakshmi','Naveen','Divya'];
const LAST = ['Sharma','Reddy','Iyer','Nair','Patel','Rao','Gupta','Menon','Kulkarni','Verma'];
const TYPES = ['APARTMENT','APARTMENT','APARTMENT','INDEPENDENT_HOUSE','VILLA','STUDIO','PENTHOUSE'];
const FURNISH = ['UNFURNISHED','SEMI_FURNISHED','FULLY_FURNISHED'];

const ulidLike = () => crypto.randomBytes(13).toString('hex').toUpperCase().slice(0, 26);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const between = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const round = (n, to) => Math.round(n / to) * to;
const daysFromNow = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
async function main() {
  const ssl =
    process.env.DB_SSL === 'true' || process.env.DB_SSL === '1'
      ? { minVersion: 'TLSv1.2', rejectUnauthorized: true }
      : undefined;

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'odibrick',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'odibrick',
    ssl,
    multipleStatements: false,
  });

  if (process.argv.includes('--purge')) {
    await purge(conn);
    console.log('Demo data removed.');
    await conn.end();
    return;
  }

  const [[real]] = await conn.query("SELECT COUNT(*) AS c FROM users WHERE is_demo = 0");
  if (real.c > 0 && !process.argv.includes('--force')) {
    console.error(
      `Refusing to seed: this database already has ${real.c} real account(s). Pass --force only on a demo environment.`,
    );
    await conn.end();
    process.exit(1);
  }

  await purge(conn);
  const hash = await argon2.hash(DEMO_PASSWORD + (process.env.PASSWORD_PEPPER || ''), { type: argon2.argon2id });

  console.log('Seeding staff...');
  const staff = {};
  for (const [role, name] of [
    ['SUPER_ADMIN', 'Odibrick Admin'],
    ['ADMIN', 'Operations Desk'],
    ['LEGAL_TEAM', 'Adv. Shalini Menon'],
    ['KYC_TEAM', 'Verification Desk'],
    ['MARKETING_TEAM', 'Cambliss Campaigns'],
    ['SUPPORT_TEAM', 'Support Desk'],
    ['PROPERTY_MANAGER', 'Field Operations'],
  ]) {
    staff[role] = await createUser(conn, hash, name, `${role.toLowerCase()}@demo.odibrick.test`, role);
  }

  console.log('Seeding owners, tenants, agents, builders...');
  const owners = [];
  for (let i = 0; i < 10; i += 1) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const userId = await createUser(conn, hash, name, `owner${i + 1}@demo.odibrick.test`, 'OWNER');
    const [res] = await conn.execute('INSERT INTO owners (user_id, bank_verified) VALUES (?, 1)', [userId]);
    await verifyKyc(conn, userId, name, staff.KYC_TEAM);
    owners.push({ userId, ownerId: res.insertId, name });
  }

  const tenants = [];
  for (let i = 0; i < 20; i += 1) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const userId = await createUser(conn, hash, name, `tenant${i + 1}@demo.odibrick.test`, 'TENANT');
    await conn.execute(
      `INSERT INTO tenants (user_id, household_type, occupants, has_pets, monthly_income, budget_min, budget_max)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, pick(['FAMILY','BACHELOR','COUPLE','STUDENT']), between(1, 4), Math.random() > 0.7 ? 1 : 0,
       between(60000, 250000), 15000, between(30000, 90000)],
    );
    if (i < 14) await verifyKyc(conn, userId, name, staff.KYC_TEAM);
    tenants.push({ userId, name });
  }

  const agents = [];
  for (let i = 0; i < 5; i += 1) {
    const name = `${pick(FIRST)} ${pick(LAST)}`;
    const agency = `${pick(['Skyline','Metro','Anchor','Nest','Compass'])} Realty`;
    const userId = await createUser(conn, hash, name, `agent${i + 1}@demo.odibrick.test`, 'AGENT');
    const [res] = await conn.execute(
      `INSERT INTO agents (user_id, agency_name, rera_number, verification_status, team_size, rating)
       VALUES (?, ?, ?, 'VERIFIED', ?, ?)`,
      [userId, `${agency} ${i + 1}`, `TS/RERA/AG/${1000 + i}`, between(2, 20), (3.8 + Math.random()).toFixed(2)],
    );
    await verifyKyc(conn, userId, name, staff.KYC_TEAM);
    agents.push({ userId, agentId: res.insertId });
  }

  const builders = [];
  for (let i = 0; i < 3; i += 1) {
    const company = `${pick(['Meridian','Aurora','Sterling'])} Developers`;
    const userId = await createUser(conn, hash, `${company} Sales`, `builder${i + 1}@demo.odibrick.test`, 'BUILDER');
    const [res] = await conn.execute(
      `INSERT INTO builders (user_id, company_name, cin, rera_number, verification_status)
       VALUES (?, ?, ?, ?, 'VERIFIED')`,
      [userId, `${company} Pvt Ltd`, `U45200TG20${10 + i}PTC0${1000 + i}`, `TS/RERA/PRJ/${2000 + i}`],
    );
    const location = CITIES[i % CITIES.length];
    const [proj] = await conn.execute(
      `INSERT INTO builder_projects (public_id, builder_id, name, slug, status, city, locality, total_units, possession_on, is_featured)
       VALUES (?, ?, ?, ?, 'UNDER_CONSTRUCTION', ?, ?, ?, ?, ?)`,
      [ulidLike(), res.insertId, `${company} Heights`, `${company.toLowerCase().replace(/\s+/g, '-')}-heights-${i}`,
       location.city, pick(location.localities), between(80, 400), daysFromNow(between(120, 700)), i === 0 ? 1 : 0],
    );
    builders.push({ userId, builderId: res.insertId, projectId: proj.insertId });
  }

  console.log('Seeding 30 properties...');
  const [amenityRows] = await conn.query('SELECT id, code FROM amenities');
  const properties = [];
  for (let i = 0; i < 30; i += 1) {
    const location = pick(CITIES);
    const locality = pick(location.localities);
    const type = pick(TYPES);
    const bedrooms = type === 'STUDIO' ? 1 : between(1, 4);
    const listingType = i % 7 === 0 ? 'SALE' : 'RENT';
    const rent = round(between(14000, 95000), 500);
    const area = bedrooms * between(450, 700);

    let lister;
    let role;
    if (i < 14) { lister = pick(owners); role = 'OWNER'; }
    else if (i < 25) { lister = pick(agents); role = 'AGENT'; }
    else { lister = pick(builders); role = 'BUILDER'; }

    const publicId = ulidLike();
    const slug = `india/${location.city.toLowerCase()}/${locality.toLowerCase().replace(/\s+/g, '-')}/${bedrooms}bhk-${type.toLowerCase().replace(/_/g, '-')}-${publicId.slice(-8).toLowerCase()}`;
    const status = i < 24 ? 'ACTIVE' : i < 27 ? 'PENDING_VERIFICATION' : 'DRAFT';

    const [res] = await conn.execute(
      `INSERT INTO properties (public_id, slug, listed_by_user_id, listed_by_role, owner_id, agent_id,
        builder_id, project_id, title, listing_type, property_type, bedrooms, bathrooms, balconies,
        floor_number, total_floors, carpet_area_sqft, builtup_area_sqft, furnishing, facing, age_years,
        parking_covered, rent_amount, sale_price, security_deposit, maintenance_amount, address_line1,
        locality, city, state, pincode, latitude, longitude, available_from, preferred_tenants,
        pets_allowed, description, house_rules, status, is_protected, is_featured, quality_score,
        view_count, enquiry_count, is_demo, published_at, lock_in_months, notice_period_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
               ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      [
        publicId, slug, lister.userId, role,
        role === 'OWNER' ? lister.ownerId : null,
        role === 'AGENT' ? lister.agentId : null,
        role === 'BUILDER' ? lister.builderId : null,
        role === 'BUILDER' ? lister.projectId : null,
        `${bedrooms} BHK ${type.replace(/_/g, ' ').toLowerCase()} in ${locality}`,
        listingType, type, bedrooms, Math.max(1, bedrooms - 1), between(0, 2),
        between(1, 14), between(5, 22), Math.round(area * 0.82), area,
        pick(FURNISH), pick(['N','S','E','W','NE','SE']), between(0, 12), between(0, 2),
        listingType === 'RENT' ? rent : null,
        listingType === 'SALE' ? round(rent * 1400, 100000) : null,
        listingType === 'RENT' ? rent * between(2, 4) : null,
        listingType === 'RENT' ? round(between(1500, 6000), 500) : null,
        `Plot ${between(1, 90)}, ${pick(['Sunrise','Lake View','Green Meadows','Palm Court'])} ${pick(['Residency','Enclave','Towers'])}`,
        locality, location.city, location.state, `${location.pin}${between(10, 99)}`,
        (17 + Math.random()).toFixed(6), (78 + Math.random()).toFixed(6),
        daysFromNow(between(-30, 60)),
        pick(['FAMILY','FAMILY,COMPANY','BACHELOR_MALE,FAMILY','ANY']),
        Math.random() > 0.6 ? 1 : 0,
        `A ${pick(['bright','quiet','spacious','well-kept'])} ${bedrooms} BHK in ${locality} with ${pick(['covered parking','a large balcony','a modular kitchen','24x7 water'])}. Close to ${pick(['the metro','the tech corridor','schools','the ORR'])}, with ${pick(['a gated society','power backup','round-the-clock security'])}. Demo listing for the Odibrick sandbox.`,
        'No smoking indoors. Society quiet hours after 10 pm.',
        status,
        i % 5 === 0 ? 1 : 0,
        i % 9 === 0 ? 1 : 0,
        between(55, 95), between(20, 900), between(0, 25),
        status === 'ACTIVE' ? new Date() : null,
        between(3, 11), pick([30, 60]),
      ],
    );
    const propertyId = res.insertId;

    for (let n = 0; n < between(4, 7); n += 1) {
      await conn.execute(
        `INSERT INTO property_images (property_id, storage_key, caption, room_tag, is_cover, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [propertyId, `demo/properties/${publicId}/photo-${n + 1}.jpg`,
         pick(['Living room','Bedroom','Kitchen','Balcony view','Building entrance']),
         pick(['LIVING_ROOM','BEDROOM','KITCHEN','BALCONY']), n === 0 ? 1 : 0, n],
      );
    }

    const chosen = amenityRows.sort(() => 0.5 - Math.random()).slice(0, between(5, 11));
    for (const amenity of chosen) {
      await conn.execute('INSERT IGNORE INTO property_amenities (property_id, amenity_id) VALUES (?, ?)', [propertyId, amenity.id]);
    }

    if (status === 'ACTIVE') {
      for (const check of ['KYC', 'OWNER_IDENTITY', 'ADDRESS']) {
        await conn.execute(
          `INSERT IGNORE INTO property_verifications (property_id, check_type, status, reviewer_id, verified_at)
           VALUES (?, ?, 'VERIFIED', ?, NOW())`,
          [propertyId, check, staff.KYC_TEAM],
        );
      }
      if (i % 3 === 0) {
        await conn.execute(
          `INSERT IGNORE INTO property_verifications (property_id, check_type, status, reviewer_id, verified_at)
           VALUES (?, 'OWNERSHIP_DOCUMENT', 'VERIFIED', ?, NOW())`,
          [propertyId, staff.KYC_TEAM],
        );
      }
    }

    await conn.execute(
      `INSERT INTO property_timeline (property_id, event_code, title, actor_id) VALUES (?, 'PROPERTY_CREATED', 'Listing created', ?)`,
      [propertyId, lister.userId],
    );

    properties.push({ id: propertyId, ownerUserId: lister.userId, rent, status, role, ownerId: lister.ownerId });
  }

  console.log('Seeding enquiries and applications...');
  const activeProps = properties.filter((p) => p.status === 'ACTIVE');
  for (let i = 0; i < 40; i += 1) {
    const property = pick(activeProps);
    const tenant = pick(tenants);
    await conn.execute(
      `INSERT IGNORE INTO enquiries (public_id, property_id, tenant_user_id, message, status)
       VALUES (?, ?, ?, ?, ?)`,
      [ulidLike(), property.id, tenant.userId,
       pick(['Is this available from next month?','Can I schedule a visit this weekend?','Is the deposit negotiable?']),
       pick(['NEW','NEW','CONTACTED','VISIT_SCHEDULED','CLOSED'])],
    );
  }

  const applied = new Set();
  for (let i = 0; i < 12; i += 1) {
    const property = pick(activeProps.filter((p) => p.role === 'OWNER'));
    const tenant = pick(tenants.slice(0, 14));
    const key = `${property.id}:${tenant.userId}`;
    if (applied.has(key)) continue;
    applied.add(key);
    await conn.execute(
      `INSERT IGNORE INTO applications (public_id, property_id, tenant_user_id, occupants, household_type,
        move_in_date, tenure_months, offered_rent, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ulidLike(), property.id, tenant.userId, between(1, 4), pick(['FAMILY','COUPLE','BACHELOR']),
       daysFromNow(between(5, 40)), pick([11, 12, 24]), property.rent,
       'We are a working couple, no pets, looking for a long-term stay.',
       pick(['SUBMITTED','SUBMITTED','UNDER_REVIEW','SHORTLISTED'])],
    );
  }

  console.log('Seeding one complete tenancy (legal -> signature -> payment -> Day 1 report)...');
  await seedCompleteTenancy(conn, activeProps[0], pick(tenants.slice(0, 5)), staff);

  console.log('Seeding marketing orders and campaigns...');
  const [[growth]] = await conn.query("SELECT * FROM marketing_packages WHERE code = 'GROWTH'");
  for (const agent of agents.slice(0, 3)) {
    const [order] = await conn.execute(
      `INSERT INTO marketing_orders (public_id, order_number, package_id, buyer_user_id, agent_id, amount,
        tax_amount, total_amount, status, brief, starts_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PAID', ?, ?)`,
      [ulidLike(), `ODB-MKT-2026-${String(between(100, 999)).padStart(6, '0')}`, growth.id, agent.userId,
       agent.agentId, growth.price, growth.price * 0.18, growth.price * 1.18,
       'Promote our new inventory in the tech corridor.', daysFromNow(-15)],
    );
    await conn.execute(
      `INSERT INTO campaigns (public_id, order_id, name, objective, status, owner_manager_id, budget, spend,
        impressions, clicks, leads, starts_on, ends_on)
       VALUES (?, ?, ?, 'LEADS', 'LIVE', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ulidLike(), order.insertId, 'Tech corridor rentals', staff.MARKETING_TEAM,
       growth.ad_budget_included, between(2000, 7000), between(20000, 90000),
       between(400, 2500), between(10, 90), daysFromNow(-15), daysFromNow(15)],
    );
  }

  console.log('Seeding maintenance and support...');
  const [[tenancyRow]] = await conn.query('SELECT * FROM tenancies ORDER BY id LIMIT 1');
  if (tenancyRow) {
    for (const [category, title] of [
      ['PLUMBING', 'Kitchen sink drains slowly'],
      ['AC', 'Bedroom AC not cooling'],
      ['ELECTRICAL', 'Balcony light flickering'],
    ]) {
      await conn.execute(
        `INSERT INTO maintenance_requests (public_id, ticket_number, property_id, tenancy_id, raised_by,
          category, priority, title, description, status)
         VALUES (?, ?, ?, ?, ?, ?, 'NORMAL', ?, ?, ?)`,
        [ulidLike(), `ODB-MNT-2026-${String(between(100, 999)).padStart(6, '0')}`, tenancyRow.property_id,
         tenancyRow.id, tenancyRow.tenant_user_id, category, title,
         'Reported through the Odibrick demo dataset.', pick(['OWNER_REVIEW','APPROVED','COMPLETED'])],
      );
    }
  }
  await conn.execute(
    `INSERT INTO support_tickets (public_id, ticket_number, user_id, category, priority, subject, description, status)
     VALUES (?, ?, ?, 'KYC', 'NORMAL', ?, ?, 'OPEN')`,
    [ulidLike(), 'ODB-SUP-2026-000001', tenants[0].userId,
     'My Aadhaar upload keeps failing', 'The file is a 6 MB PDF scan.'],
  );

  const [[counts]] = await conn.query(`
    SELECT (SELECT COUNT(*) FROM users WHERE is_demo = 1) AS users,
           (SELECT COUNT(*) FROM properties WHERE is_demo = 1) AS properties,
           (SELECT COUNT(*) FROM tenancies) AS tenancies,
           (SELECT COUNT(*) FROM payments) AS payments`);

  console.log('\nDemo data ready.');
  console.table(counts);
  console.log(`\nSign in with any seeded address and the password: ${DEMO_PASSWORD}`);
  console.log('  admin      super_admin@demo.odibrick.test');
  console.log('  legal      legal_team@demo.odibrick.test');
  console.log('  verifier   kyc_team@demo.odibrick.test');
  console.log('  owner      owner1@demo.odibrick.test');
  console.log('  tenant     tenant1@demo.odibrick.test');
  console.log('  agent      agent1@demo.odibrick.test');
  console.log('  builder    builder1@demo.odibrick.test\n');

  await conn.end();
}

async function seedCompleteTenancy(conn, property, tenant, staff) {
  const [app] = await conn.execute(
    `INSERT INTO applications (public_id, property_id, tenant_user_id, occupants, household_type,
      move_in_date, tenure_months, offered_rent, status, decided_by, decided_at)
     VALUES (?, ?, ?, 2, 'COUPLE', ?, 11, ?, 'ACCEPTED', ?, NOW())
     ON DUPLICATE KEY UPDATE status = 'ACCEPTED'`,
    [ulidLike(), property.id, tenant.userId, daysFromNow(-20), property.rent, property.ownerUserId],
  );

  const [tenancy] = await conn.execute(
    `INSERT INTO tenancies (public_id, property_id, application_id, owner_user_id, tenant_user_id, stage,
      service_plan, rent_amount, deposit_amount, maintenance_amount, start_date, end_date,
      lock_in_months, notice_period_days, renewal_due_on)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'PROTECTED', ?, ?, 2500, ?, ?, 6, 60, ?)`,
    [ulidLike(), property.id, app.insertId, property.ownerUserId, tenant.userId,
     property.rent, property.rent * 3, daysFromNow(-20), daysFromNow(345), daysFromNow(345)],
  );
  const tenancyId = tenancy.insertId;

  const [legalCase] = await conn.execute(
    `INSERT INTO legal_cases (public_id, case_number, tenancy_id, case_type, status, assigned_to, jurisdiction, closed_at)
     VALUES (?, 'ODB-LGL-2026-000001', ?, 'NEW_AGREEMENT', 'EXECUTED', ?, 'Telangana', NOW())`,
    [ulidLike(), tenancyId, staff.LEGAL_TEAM],
  );

  const [agreement] = await conn.execute(
    `INSERT INTO agreements (public_id, agreement_number, tenancy_id, legal_case_id, agreement_type, status,
      current_version, effective_from, effective_to, stamp_duty_status, approved_by, approved_at, executed_at)
     VALUES (?, 'ODB-AGR-2026-000001', ?, ?, 'LEAVE_AND_LICENSE', 'EXECUTED', 1, ?, ?, 'PENDING', ?, NOW(), NOW())`,
    [ulidLike(), tenancyId, legalCase.insertId, daysFromNow(-20), daysFromNow(345), staff.LEGAL_TEAM],
  );

  await conn.execute(
    `INSERT INTO agreement_versions (agreement_id, version, body_html, variables, drafted_by, drafted_with_ai,
      reviewed_by, reviewed_at, change_summary)
     VALUES (?, 1, ?, ?, ?, 0, ?, NOW(), 'First draft reviewed and approved.')`,
    [agreement.insertId,
     '<h1>Leave and Licence Agreement</h1><p>Demo document for the Odibrick sandbox. Not a real agreement and of no legal effect.</p>',
     JSON.stringify({ rent_amount: property.rent, deposit_amount: property.rent * 3, notice_period_days: 60 }),
     staff.LEGAL_TEAM, staff.LEGAL_TEAM],
  );

  const [[clauses]] = await conn.query("SELECT id, title, body_template FROM clause_library WHERE is_mandatory = 1 LIMIT 5");
  const clauseRows = Array.isArray(clauses) ? clauses : [clauses];
  for (const [index, clause] of clauseRows.filter(Boolean).entries()) {
    await conn.execute(
      `INSERT INTO agreement_clauses (agreement_id, clause_id, sort_order, title, body)
       VALUES (?, ?, ?, ?, ?)`,
      [agreement.insertId, clause.id, index, clause.title,
       clause.body_template
         .replace('{{rent_amount}}', property.rent)
         .replace('{{deposit_amount}}', property.rent * 3)
         .replace('{{rent_due_day}}', '5')
         .replace('{{notice_period_days}}', '60')
         .replace('{{refund_days}}', '30')],
    );
  }

  for (const [userId, role, order] of [
    [property.ownerUserId, 'OWNER', 1],
    [tenant.userId, 'TENANT', 2],
  ]) {
    await conn.execute(
      `INSERT INTO agreement_signatories (agreement_id, user_id, party_role, sign_order, status, provider,
        consent_text, signed_at, signed_ip)
       VALUES (?, ?, ?, ?, 'SIGNED', 'CLICKWRAP', 'I have read the agreement and accept its terms.', NOW(), '203.0.113.10')`,
      [agreement.insertId, userId, role, order],
    );
  }

  await conn.execute(
    `INSERT INTO legal_meetings (public_id, legal_case_id, tenancy_id, purpose, provider, scheduled_for,
      duration_min, status, host_user_id, agenda, outcome_notes)
     VALUES (?, ?, ?, 'LEGAL_CONSULTATION', 'PENDING_PROVIDER', ?, 30, 'COMPLETED', ?, ?, ?)`,
    [ulidLike(), legalCase.insertId, tenancyId, daysFromNow(-24), staff.LEGAL_TEAM,
     'Walk both parties through deposit, lock-in, notice and repairs.',
     'Both parties agreed to a 6-month lock-in and 60-day notice. Deposit refund window set at 30 days.'],
  );

  let paySeq = 1;
  for (const [purpose, amount, status] of [
    ['SECURITY_DEPOSIT', property.rent * 3, 'PAID'],
    ['ADVANCE_RENT', property.rent, 'PAID'],
    ['MONTHLY_RENT', property.rent, 'DUE'],
  ]) {
    const [pay] = await conn.execute(
      `INSERT INTO payments (public_id, reference_code, payer_user_id, payee_user_id, tenancy_id, property_id,
        purpose, amount, tax_amount, total_amount, status, settlement_status, settlement_mode, due_date, paid_at, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'DIRECT_TO_PAYEE', ?, ?, 1)`,
      [ulidLike(), `ODB-PAY-2026-${String(paySeq).padStart(6, '0')}`, tenant.userId, property.ownerUserId,
       tenancyId, property.id, purpose, amount, amount, status,
       status === 'PAID' ? 'SETTLED' : 'PENDING',
       status === 'PAID' ? daysFromNow(-19) : daysFromNow(5),
       status === 'PAID' ? new Date() : null],
    );
    if (status === 'PAID') {
      await conn.execute(
        `INSERT INTO payment_transactions (payment_id, txn_reference, direction, provider, provider_txn_id,
          method, amount, status)
         VALUES (?, ?, 'COLLECTION', 'manual', ?, 'NEFT', ?, 'SUCCESS')`,
        [pay.insertId, `TXN-DEMO${paySeq}`, `DEMOREF${1000 + paySeq}`, amount],
      );
    }
    paySeq += 1;
  }

  await conn.execute(
    `INSERT INTO commissions (tenancy_id, cycle_year, period_start, period_end, base_amount,
      commission_amount, tax_amount, total_amount, payer, status)
     VALUES (?, 2026, ?, ?, ?, ?, ?, ?, 'OWNER', 'INVOICED')`,
    [tenancyId, daysFromNow(-20), daysFromNow(345), property.rent,
     property.rent * 0.85, property.rent * 0.85 * 0.18, property.rent * 0.85 * 1.18],
  );

  const [inspection] = await conn.execute(
    `INSERT INTO inspections (public_id, report_number, property_id, tenancy_id, kind, conducted_by,
      conducted_role, status, started_at, submitted_at, tenant_ack_at, owner_ack_at, overall_condition,
      electricity_reading, water_reading)
     VALUES (?, 'ODB-CR-2026-000001', ?, ?, 'CHECK_IN', ?, 'TENANT', 'ACKNOWLEDGED', ?, ?, ?, ?, 'GOOD', '48213', '00912')`,
    [ulidLike(), property.id, tenancyId, tenant.userId, daysFromNow(-19), daysFromNow(-19), daysFromNow(-19), daysFromNow(-18)],
  );

  const items = [
    ['LIVING_ROOM', 'WALLS', 'GOOD', 'SCRATCH', 'Minor scuff near the TV unit.'],
    ['LIVING_ROOM', 'FLOORING', 'GOOD', 'NONE', null],
    ['KITCHEN', 'APPLIANCES', 'FAIR', 'WEAR', 'Chimney filter needs cleaning.'],
    ['KITCHEN', 'PLUMBING', 'GOOD', 'NONE', null],
    ['BEDROOM', 'WALLS', 'NEW', 'NONE', 'Freshly painted.'],
    ['BEDROOM', 'WINDOWS', 'GOOD', 'NONE', null],
    ['BATHROOM', 'FIXTURES', 'FAIR', 'STAIN', 'Hard water marks on the shower panel.'],
    ['BALCONY', 'FLOORING', 'GOOD', 'NONE', null],
  ];
  for (const [index, [room, element, rating, damage, notes]] of items.entries()) {
    const [item] = await conn.execute(
      `INSERT INTO inspection_items (inspection_id, room, element, condition_rating, damage_type, notes, flagged, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [inspection.insertId, room, element, rating, damage, notes, rating === 'DAMAGED' ? 1 : 0, index],
    );
    await conn.execute(
      `INSERT INTO inspection_media (inspection_id, inspection_item_id, media_type, storage_key, captured_at, caption)
       VALUES (?, ?, 'PHOTO', ?, ?, ?)`,
      [inspection.insertId, item.insertId, `demo/inspections/checkin-${index + 1}.jpg`, daysFromNow(-19),
       `${room.replace(/_/g, ' ').toLowerCase()} — ${element.toLowerCase()}`],
    );
  }

  for (const [code, title, detail, offset] of [
    ['TENANT_SELECTED', 'Tenant selected', 'Application accepted by the owner', -22],
    ['AGREEMENT_SIGNED', 'Agreement executed', 'ODB-AGR-2026-000001', -20],
    ['PAYMENT_COMPLETED', 'Move-in payments completed', 'Deposit and first month received', -19],
    ['CHECK_IN_REPORT', 'Day 1 condition report submitted', '8 items, 8 photographs', -19],
  ]) {
    await conn.execute(
      `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [property.id, tenancyId, code, title, detail, daysFromNow(offset)],
    );
  }

  await conn.execute("UPDATE properties SET status = 'RENTED', is_protected = 1 WHERE id = ?", [property.id]);
}

async function createUser(conn, hash, name, email, role) {
  const [res] = await conn.execute(
    `INSERT INTO users (public_id, email, phone, password_hash, full_name, status, email_verified_at, is_demo)
     VALUES (?, ?, ?, ?, ?, 'ACTIVE', NOW(), 1)`,
    [ulidLike(), email, `9${between(100000000, 999999999)}`, hash, name],
  );
  await conn.execute(
    'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?', [res.insertId, role],
  );
  await conn.execute('INSERT IGNORE INTO user_profiles (user_id, city) VALUES (?, ?)', [res.insertId, pick(CITIES).city]);
  return res.insertId;
}

async function verifyKyc(conn, userId, name, reviewerId) {
  await conn.execute(
    `INSERT INTO kyc_records (user_id, legal_name, id_type, id_last4, status, provider, reviewer_id,
      submitted_at, reviewed_at)
     VALUES (?, ?, 'AADHAAR', ?, 'VERIFIED', 'manual', ?, NOW(), NOW())`,
    [userId, name, String(between(1000, 9999)), reviewerId],
  );
}

async function purge(conn) {
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  const tables = [
    'inspection_media', 'inspection_items', 'inspections', 'maintenance_updates', 'maintenance_requests',
    'dispute_evidence', 'disputes', 'ticket_messages', 'support_tickets', 'messages',
    'conversation_participants', 'conversations', 'campaign_leads', 'campaign_properties', 'campaigns',
    'marketing_orders', 'commissions', 'payment_transactions', 'invoice_lines', 'invoices', 'payments',
    'insurance_policies', 'insurance_quotes', 'meeting_participants', 'legal_meetings',
    'agreement_signatories', 'agreement_clauses', 'agreement_versions', 'agreements', 'legal_notes',
    'legal_cases', 'tenancies', 'applications', 'viewings', 'enquiries', 'property_timeline',
    'property_views', 'saved_properties', 'property_verifications', 'property_amenities',
    'property_videos', 'property_images', 'property_units', 'properties', 'builder_projects',
    'builders', 'agents', 'tenants', 'owners', 'kyc_records', 'documents', 'document_access_logs',
    'notifications', 'refresh_tokens', 'user_profiles', 'user_roles',
  ];
  for (const table of tables) {
    await conn.query(`DELETE FROM \`${table}\``);
  }
  await conn.query('DELETE FROM users');
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

function loadEnv() {
  const candidates = [
    path.join(__dirname, '..', '..', 'apps', 'api', '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
