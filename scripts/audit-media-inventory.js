/**
 * Odibrick — Read-Only Media Inventory Audit
 * 
 * Cross-references local database image/document keys with physical files on disk.
 * Connects ONLY to local development MySQL (127.0.0.1:3307, odibrick).
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.resolve(REPO_ROOT, 'migration-media-manifest.json');

async function runAudit() {
  console.log('===============================================================');
  console.log('ODIBRICK — MEDIA INVENTORY AUDIT & DATABASE RECONCILIATION');
  console.log('===============================================================\n');

  // Read manifest
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`Manifest not found at ${MANIFEST_PATH}. Please run migration script in dry-run first.`);
    process.exit(1);
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const physicalMap = new Map();
  for (const entry of manifest.entries) {
    physicalMap.set(entry.key.toLowerCase(), entry);
  }

  console.log(`Manifest loaded: ${manifest.entries.length} unique physical keys.`);

  // Connect to local database (read-only)
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'cambliss@123',
    database: process.env.DB_NAME || 'odibrick',
  });

  console.log(`Connected to local database: ${process.env.DB_NAME || 'odibrick'}\n`);

  // Query property_images
  const [propImages] = await connection.query(
    'SELECT id, property_id, storage_key, caption, room_tag, is_cover FROM property_images'
  );
  console.log(`Queried property_images: found ${propImages.length} records.`);

  // Query documents
  const [docs] = await connection.query(
    'SELECT id, public_id, category, storage_key, mime_type, title, is_active FROM documents'
  );
  console.log(`Queried documents: found ${docs.length} records.`);

  // Query inspection_media if table exists
  let inspectionMedia = [];
  try {
    const [media] = await connection.query(
      'SELECT id, inspection_id, media_type, storage_key FROM inspection_media'
    );
    inspectionMedia = media;
    console.log(`Queried inspection_media: found ${inspectionMedia.length} records.`);
  } catch (err) {
    console.log('Table inspection_media not present or empty.');
  }

  await connection.end();

  // Combine DB keys
  const dbReferencedKeys = new Map();

  for (const row of propImages) {
    if (row.storage_key) {
      dbReferencedKeys.set(row.storage_key, {
        table: 'property_images',
        id: row.id,
        propertyId: row.property_id,
        caption: row.caption,
        tag: row.room_tag,
      });
    }
  }

  for (const row of docs) {
    if (row.storage_key) {
      dbReferencedKeys.set(row.storage_key, {
        table: 'documents',
        id: row.id,
        publicId: row.public_id,
        category: row.category,
        title: row.title,
      });
    }
  }

  for (const row of inspectionMedia) {
    if (row.storage_key) {
      dbReferencedKeys.set(row.storage_key, {
        table: 'inspection_media',
        id: row.id,
        mediaType: row.media_type,
      });
    }
  }

  // Cross-reference
  const dbKeysWithPhysicalFile = [];
  const dbKeysMissingPhysicalFile = [];
  const physicalKeysWithNoDbRef = [];
  const caseSensitivityMismatches = [];

  for (const [dbKey, info] of dbReferencedKeys.entries()) {
    const normalizedDbKey = dbKey.replace(/\\/g, '/').replace(/^\/+/, '');
    const directMatch = manifest.entries.find((e) => e.key === normalizedDbKey);
    const caseInsensitiveMatch = physicalMap.get(normalizedDbKey.toLowerCase());

    if (directMatch) {
      dbKeysWithPhysicalFile.push({ key: dbKey, ...info, physical: directMatch });
    } else if (caseInsensitiveMatch) {
      caseSensitivityMismatches.push({
        dbKey,
        physicalKey: caseInsensitiveMatch.key,
        ...info,
      });
      dbKeysWithPhysicalFile.push({ key: dbKey, ...info, physical: caseInsensitiveMatch });
    } else {
      dbKeysMissingPhysicalFile.push({ key: dbKey, ...info });
    }
  }

  const referencedLowerKeys = new Set(Array.from(dbReferencedKeys.keys()).map((k) => k.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()));

  for (const entry of manifest.entries) {
    if (!referencedLowerKeys.has(entry.key.toLowerCase())) {
      physicalKeysWithNoDbRef.push(entry);
    }
  }

  // File type & size distribution
  const typeDistribution = {};
  for (const entry of manifest.entries) {
    typeDistribution[entry.mimeType] = (typeDistribution[entry.mimeType] || 0) + 1;
  }

  console.log('\n===============================================================');
  console.log('AUDIT RESULTS');
  console.log('===============================================================');
  console.log(`Total Database-Referenced Keys       : ${dbReferencedKeys.size}`);
  console.log(`  - With Matching Physical File      : ${dbKeysWithPhysicalFile.length}`);
  console.log(`  - Missing Physical File (Need SVG) : ${dbKeysMissingPhysicalFile.length}`);
  console.log(`Physical Files Discovered On Disk     : ${manifest.entries.length}`);
  console.log(`  - Linked to Active DB Records      : ${dbKeysWithPhysicalFile.length}`);
  console.log(`  - Unreferenced / Seed / Static     : ${physicalKeysWithNoDbRef.length}`);
  console.log(`Case Sensitivity Discrepancies       : ${caseSensitivityMismatches.length}`);
  console.log('\nMIME Type Distribution of Physical Files:');
  for (const [mime, count] of Object.entries(typeDistribution)) {
    console.log(`  ${mime.padEnd(25)} : ${count}`);
  }

  if (dbKeysMissingPhysicalFile.length > 0) {
    console.log(`\nSample Missing Database Keys (Will receive fixed SVG fallback):`);
    dbKeysMissingPhysicalFile.slice(0, 10).forEach((m) => {
      console.log(`  - [${m.table}] ID: ${m.id} Key: ${m.key}`);
    });
    if (dbKeysMissingPhysicalFile.length > 10) {
      console.log(`  ... and ${dbKeysMissingPhysicalFile.length - 10} more`);
    }
  }

  // Check Property 56 specifically (the reported property from investigation)
  const prop56Photos = propImages.filter((p) => p.property_id === 56);
  console.log(`\nSpecific Check — Property 56 Photos (${prop56Photos.length} records):`);
  for (const photo of prop56Photos) {
    const hasPhysical = physicalMap.has(photo.storage_key.toLowerCase());
    console.log(`  Photo #${photo.id} (${photo.room_tag || 'NO TAG'}): ${photo.storage_key} -> ${hasPhysical ? 'PRESENT ON DISK' : 'MISSING ON DISK'}`);
  }

  console.log('\n===============================================================\n');

  // Write detailed audit JSON
  const auditReport = {
    auditedAt: new Date().toISOString(),
    totalDiscoveredPhysical: manifest.entries.length,
    totalDbReferenced: dbReferencedKeys.size,
    dbMatchedCount: dbKeysWithPhysicalFile.length,
    dbMissingCount: dbKeysMissingPhysicalFile.length,
    unreferencedPhysicalCount: physicalKeysWithNoDbRef.length,
    caseMismatchCount: caseSensitivityMismatches.length,
    typeDistribution,
    missingDbKeys: dbKeysMissingPhysicalFile,
    caseMismatches: caseSensitivityMismatches,
    property56: prop56Photos.map((p) => ({
      id: p.id,
      storageKey: p.storage_key,
      roomTag: p.room_tag,
      hasPhysicalFile: physicalMap.has(p.storage_key.toLowerCase()),
    })),
  };

  fs.writeFileSync(
    path.resolve(REPO_ROOT, 'media-inventory-audit-report.json'),
    JSON.stringify(auditReport, null, 2),
    'utf8'
  );
  console.log('Saved detailed audit report: media-inventory-audit-report.json');
}

runAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
