const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });
const mysql = require('mysql2/promise');

async function audit() {
  console.log('========================================================================');
  console.log('  ODIBRICK LOCAL VS PRODUCTION PROPERTY DATA & MEDIA AUDIT');
  console.log('========================================================================\n');

  // 1. Connect Local Database
  const localDb = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick',
  });

  const [localProps] = await localDb.query(`
    SELECT p.id, p.public_id, p.slug, p.title, p.locality, p.city, p.state,
           p.property_type, p.listing_type, p.status, p.rent_amount,
           p.listed_by_user_id, u.full_name AS lister_name, u.email AS lister_email,
           r.code AS lister_role,
           (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) AS photo_count,
           p.created_at
      FROM properties p
      LEFT JOIN users u ON u.id = p.listed_by_user_id
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
     WHERE p.deleted_at IS NULL
     ORDER BY p.id ASC
  `);

  const [localImages] = await localDb.query(`
    SELECT id, property_id, storage_key, caption, is_cover, sort_order
      FROM property_images
     ORDER BY property_id, sort_order
  `);

  console.log('[LOCAL DATABASE]');
  console.log('- Host: 127.0.0.1:3307');
  console.log('- Database: odibrick');
  console.log(`- Total Properties: ${localProps.length}`);
  console.log(`- Total Images in DB: ${localImages.length}\n`);

  // 2. Connect to Production Backend
  const prodBase = 'https://odibrick-new-backend.onrender.com';
  console.log('[PRODUCTION BACKEND]');
  console.log(`- URL: ${prodBase}`);

  const loginRes = await fetch(`${prodBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'super_admin@demo.odibrick.test', password: 'OdibrickDemo2026' }),
  });

  if (!loginRes.ok) {
    console.error('Failed to log in to production API:', await loginRes.text());
    await localDb.end();
    return;
  }
  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log(`- Authenticated as Super Admin: ${loginData.user?.email}`);

  // Fetch admin marketplace listings (all properties)
  const adminMarketRes = await fetch(`${prodBase}/api/admin/marketplace?perPage=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let prodProps = [];
  if (adminMarketRes.ok) {
    const marketData = await adminMarketRes.json();
    prodProps = marketData.data || [];
  } else {
    console.error('Failed to fetch admin marketplace:', adminMarketRes.status, await adminMarketRes.text());
  }

  // Fetch public properties
  const pubPropRes = await fetch(`${prodBase}/api/properties?perPage=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let pubProps = [];
  if (pubPropRes.ok) {
    const pData = await pubPropRes.json();
    pubProps = pData.data || [];
  }

  console.log(`- Total Properties on Production (Admin Marketplace): ${prodProps.length}`);
  console.log(`- Total Active Public Properties on Production: ${pubProps.length}\n`);

  // Status distributions
  const localStatusCount = {};
  localProps.forEach((p) => {
    localStatusCount[p.status] = (localStatusCount[p.status] || 0) + 1;
  });

  const prodStatusCount = {};
  prodProps.forEach((p) => {
    prodStatusCount[p.status] = (prodStatusCount[p.status] || 0) + 1;
  });

  console.log('--- STATUS DISTRIBUTION ---');
  console.log('Local Statuses:     ', JSON.stringify(localStatusCount));
  console.log('Production Statuses:', JSON.stringify(prodStatusCount));

  // Role distributions
  const localRoleCount = {};
  localProps.forEach((p) => {
    const role = p.lister_role || 'UNKNOWN';
    localRoleCount[role] = (localRoleCount[role] || 0) + 1;
  });
  console.log('\n--- LISTER ROLE DISTRIBUTION (LOCAL) ---');
  console.log(JSON.stringify(localRoleCount));

  // Compare properties by public_id
  const localMap = new Map(localProps.map((p) => [p.public_id, p]));
  const prodMap = new Map(prodProps.map((p) => [p.public_id, p]));

  const matching = [];
  const localOnly = [];
  const prodOnly = [];

  for (const p of localProps) {
    if (prodMap.has(p.public_id)) {
      matching.push({ local: p, prod: prodMap.get(p.public_id) });
    } else {
      localOnly.push(p);
    }
  }

  for (const p of prodProps) {
    if (!localMap.has(p.public_id)) {
      prodOnly.push(p);
    }
  }

  console.log('\n--- INVENTORY RECONCILIATION ---');
  console.log(`Matching Properties:       ${matching.length}`);
  console.log(`Local-Only Properties:      ${localOnly.length}`);
  console.log(`Production-Only Properties: ${prodOnly.length}`);

  if (localOnly.length > 0) {
    console.log('\n[LOCAL-ONLY PROPERTIES]:');
    localOnly.forEach((p, idx) => {
      console.log(`  ${idx + 1}. [${p.public_id}] "${p.title}" | ${p.status} | ${p.city} | Lister: ${p.lister_name} (${p.lister_role}) | Photos: ${p.photo_count}`);
    });
  }

  if (prodOnly.length > 0) {
    console.log('\n[PRODUCTION-ONLY PROPERTIES]:');
    prodOnly.forEach((p, idx) => {
      console.log(`  ${idx + 1}. [${p.public_id}] "${p.title}" | ${p.status} | ${p.city} | Lister: ${p.lister_name || 'N/A'} | Photos: ${p.photo_count || 0}`);
    });
  }

  if (matching.length > 0) {
    console.log('\n[MATCHING PROPERTIES]:');
    matching.forEach((m, idx) => {
      console.log(`  ${idx + 1}. [${m.local.public_id}] Local: "${m.local.title}" (${m.local.status}, Photos: ${m.local.photo_count}) <==> Prod: "${m.prod.title}" (${m.prod.status}, Photos: ${m.prod.photo_count || 0})`);
    });
  }

  // 3. Test Production Media Flow for Properties
  console.log('\n--- PRODUCTION MEDIA AUDIT ---');
  if (prodProps.length > 0) {
    for (const prodP of prodProps.slice(0, 5)) {
      console.log(`\nInspecting Media for Production Property [${prodP.public_id}] "${prodP.title}"...`);
      const detailRes = await fetch(`${prodBase}/api/admin/marketplace/${prodP.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (detailRes.ok) {
        const detail = await detailRes.json();
        console.log(`- Images Count in DB: ${detail.images?.length || 0}`);
        if (detail.images?.length > 0) {
          for (const img of detail.images) {
            const imgUrl = `${prodBase}/api/storage/${img.storage_key}`;
            const imgRes = await fetch(imgUrl);
            console.log(`  - Image #${img.id} [${img.storage_key}]: GET -> HTTP ${imgRes.status}, Content-Type: ${imgRes.headers.get('content-type')}, Size: ${imgRes.headers.get('content-length')} bytes`);
          }
        }
      }
    }
  }

  await localDb.end();
}

audit().catch(console.error);
