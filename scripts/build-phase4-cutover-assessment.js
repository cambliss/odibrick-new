const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });

async function buildAssessment() {
  console.log('=== ODIBRICK PHASE 4 PRE-CUTOVER ASSESSMENT ===');

  // 1. Connect Staging
  const stagingConn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick_staging',
  });

  // 2. Exact Breakdown of 230 Property Images (190 with files, 40 placeholders)
  const [images] = await stagingConn.query(`
    SELECT pi.id, pi.property_id, p.public_id, p.title, pi.storage_key, pi.caption, pi.is_cover, pi.sort_order
    FROM property_images pi
    JOIN properties p ON p.id = pi.property_id
    ORDER BY pi.property_id, pi.sort_order ASC
  `);

  const storageRoot = path.resolve(__dirname, '../storage');
  const physicalImages = [];
  const placeholderImages = [];

  for (const img of images) {
    const cleanKey = img.storage_key.replace(/^storage\//, '').replace(/^\/+/, '');
    const diskPath = path.join(storageRoot, cleanKey);
    if (fs.existsSync(diskPath)) {
      const stat = fs.statSync(diskPath);
      physicalImages.push({
        id: img.id,
        propertyPublicId: img.public_id,
        propertyTitle: img.title,
        storageKey: img.storage_key,
        cleanKey,
        isCover: !!img.is_cover,
        sizeBytes: stat.size,
      });
    } else {
      placeholderImages.push({
        id: img.id,
        propertyPublicId: img.public_id,
        propertyTitle: img.title,
        storageKey: img.storage_key,
        cleanKey,
        isCover: !!img.is_cover,
      });
    }
  }

  console.log(`Property Photos Total:    ${images.length}`);
  console.log(`  - Physical Files Present: ${physicalImages.length}`);
  console.log(`  - Legacy Placeholders:    ${placeholderImages.length}`);

  // 3. Inspect Current Production Data via Render API
  const prodBase = 'https://odibrick-new-backend.onrender.com';
  let prodSummary = { status: 'UNKNOWN' };
  try {
    const loginRes = await fetch(`${prodBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'super_admin@demo.odibrick.test', password: 'OdibrickDemo2026' }),
    });
    if (loginRes.ok) {
      const loginData = await loginRes.json();
      const token = loginData.accessToken;
      const headers = { Authorization: `Bearer ${token}` };

      const [uRes, pRes] = await Promise.all([
        fetch(`${prodBase}/api/admin/users?perPage=100`, { headers }),
        fetch(`${prodBase}/api/properties?perPage=100`, { headers }),
      ]);

      const uData = uRes.ok ? await uRes.json() : {};
      const pData = pRes.ok ? await pRes.json() : {};

      const prodUsers = uData.data || [];
      const prodProps = pData.data || [];

      // Identify production-only users
      const [stagingUsers] = await stagingConn.query('SELECT email FROM users');
      const stagingUserEmails = new Set(stagingUsers.map(u => u.email));

      const prodOnlyUsers = prodUsers.filter(u => !stagingUserEmails.has(u.email));
      const prodOnlyProps = prodProps.filter(p => !physicalImages.some(img => img.propertyPublicId === p.publicId));

      prodSummary = {
        status: 'CONNECTED',
        currentUserCount: prodUsers.length,
        currentPropertyCount: prodProps.length,
        prodOnlyUsers: prodOnlyUsers.map(u => ({ email: u.email, fullName: u.full_name, role: u.roles })),
        prodOnlyPropsCount: prodOnlyProps.length,
      };
    }
  } catch (e) {
    prodSummary = { status: 'FETCH_ERROR', error: e.message };
  }

  console.log('Production State Overview:', prodSummary);

  await stagingConn.end();

  const assessment = {
    generatedAt: new Date().toISOString(),
    imagesReconciliation: {
      total: images.length,
      physicalCount: physicalImages.length,
      placeholderCount: placeholderImages.length,
      samplePhysical: physicalImages.slice(0, 5),
      samplePlaceholder: placeholderImages.slice(0, 5),
    },
    productionState: prodSummary,
  };

  fs.writeFileSync(
    path.resolve(__dirname, '../ODIBRICK_PRE_CUTOVER_INSPECTION.json'),
    JSON.stringify(assessment, null, 2),
    'utf8'
  );
  console.log('✓ Wrote ODIBRICK_PRE_CUTOVER_INSPECTION.json');
}

buildAssessment().catch(console.error);
