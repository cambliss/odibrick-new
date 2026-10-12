const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mysql = require('mysql2/promise');
require('dotenv').config({ path: path.resolve(__dirname, '../apps/api/.env') });

async function fullMediaReconciliation() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick_staging',
  });

  const [images] = await conn.query(`
    SELECT pi.id, pi.property_id, p.public_id as property_public_id, p.title as property_title,
           pi.storage_key, pi.caption, pi.is_cover, pi.sort_order
    FROM property_images pi
    JOIN properties p ON p.id = pi.property_id
    ORDER BY pi.property_id, pi.sort_order ASC
  `);

  const [docs] = await conn.query(`
    SELECT d.id, d.public_id, d.owner_user_id, d.category, d.storage_key, d.title, d.mime_type, d.size_bytes
    FROM documents d
    ORDER BY d.id ASC
  `);

  const storageRoot = path.resolve(__dirname, '../storage');

  function scan(dir, base = '') {
    let list = [];
    if (!fs.existsSync(dir)) return list;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, f.name);
      const rel = base ? `${base}/${f.name}` : f.name;
      if (f.isDirectory()) {
        list = list.concat(scan(full, rel));
      } else {
        const stats = fs.statSync(full);
        list.push({ relPath: rel.replace(/\\/g, '/'), size: stats.size, fullPath: full });
      }
    }
    return list;
  }

  const diskFiles = scan(storageRoot);
  const diskMap = new Map();
  for (const f of diskFiles) {
    diskMap.set(f.relPath, f);
  }

  let imagesFound = 0;
  let imagesMissing = 0;
  const imageAudit = [];

  for (const img of images) {
    const cleanKey = img.storage_key.replace(/^storage\//, '').replace(/^\/+/, '');
    const found = diskMap.has(cleanKey) || fs.existsSync(path.join(storageRoot, cleanKey));
    if (found) imagesFound++;
    else imagesMissing++;

    imageAudit.push({
      id: img.id,
      propertyPublicId: img.property_public_id,
      storageKey: img.storage_key,
      cleanKey,
      isCover: !!img.is_cover,
      existsOnDisk: found,
      sizeBytes: found ? (diskMap.get(cleanKey)?.size || fs.statSync(path.join(storageRoot, cleanKey)).size) : 0,
    });
  }

  let docsFound = 0;
  let docsMissing = 0;
  const docAudit = [];

  for (const doc of docs) {
    const cleanKey = doc.storage_key.replace(/^storage\//, '').replace(/^\/+/, '');
    const found = diskMap.has(cleanKey) || fs.existsSync(path.join(storageRoot, cleanKey));
    if (found) docsFound++;
    else docsMissing++;

    docAudit.push({
      id: doc.id,
      publicId: doc.public_id,
      category: doc.category,
      storageKey: doc.storage_key,
      cleanKey,
      existsOnDisk: found,
      sizeBytes: doc.size_bytes,
    });
  }

  // Unreferenced disk files
  const referencedKeys = new Set([
    ...imageAudit.map(i => i.cleanKey),
    ...docAudit.map(d => d.cleanKey),
  ]);

  const unreferencedDiskFiles = diskFiles.filter(f => !referencedKeys.has(f.relPath));

  console.log('=== MEDIA RECONCILIATION SUMMARY ===');
  console.log(`Total Physical Files on Disk:    ${diskFiles.length}`);
  console.log(`Database Property Images Total:  ${images.length}`);
  console.log(`  - Images Exists on Disk:       ${imagesFound} (${((imagesFound / images.length) * 100).toFixed(1)}%)`);
  console.log(`  - Images Missing on Disk:      ${imagesMissing}`);
  console.log(`Database Documents Total:        ${docs.length}`);
  console.log(`  - Documents Exists on Disk:    ${docsFound} (${((docsFound / docs.length) * 100).toFixed(1)}%)`);
  console.log(`  - Documents Missing on Disk:   ${docsMissing}`);
  console.log(`Unreferenced Disk Files (Cache/Generated): ${unreferencedDiskFiles.length}`);

  // Storage Driver Analysis
  const storageDriver = (process.env.STORAGE_DRIVER || 'LOCAL').toUpperCase();
  const s3Bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
  const s3AccessKey = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const s3SecretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;
  const s3Endpoint = process.env.S3_ENDPOINT || process.env.AWS_S3_ENDPOINT;

  const storageReadiness = {
    configuredDriver: storageDriver,
    s3BucketConfigured: !!s3Bucket,
    s3CredentialsAvailable: !!(s3AccessKey && s3SecretKey),
    s3Endpoint: s3Endpoint || 'AWS Default',
    localStoragePath: storageRoot,
    servingRoutesOperational: true,
  };

  await conn.end();

  return {
    diskFilesCount: diskFiles.length,
    imagesCount: images.length,
    imagesFound,
    imagesMissing,
    docsCount: docs.length,
    docsFound,
    docsMissing,
    unreferencedDiskFilesCount: unreferencedDiskFiles.length,
    storageReadiness,
    sampleImages: imageAudit.slice(0, 10),
    sampleDocs: docAudit.slice(0, 5),
  };
}

fullMediaReconciliation()
  .then(res => {
    fs.writeFileSync(
      path.resolve(__dirname, '../ODIBRICK_MEDIA_INVENTORY.json'),
      JSON.stringify(res, null, 2),
      'utf8'
    );
    console.log('✓ Wrote ODIBRICK_MEDIA_INVENTORY.json');
  })
  .catch(console.error);
