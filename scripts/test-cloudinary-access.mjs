#!/usr/bin/env node
/**
 * Odibrick — Cloudinary API Access Verification & Isolated Local Test Runner
 *
 * Safety Boundaries:
 * 1. Read-only dry run by default; live cloud calls require explicit `--execute`.
 * 2. Constrained exclusively to dedicated folder: `odibrick-dev-test/`.
 * 3. Uses only 1 designated public sample image (apps/api/storage/demo/properties/.../photo-1.jpg).
 * 4. Never touches or uploads private KYC PDFs or agreements.
 * 5. Overwrite protection: `overwrite: false` to ensure existing assets are never replaced.
 * 6. Zero leakage: API secret is read from local environment, never printed or committed.
 * 7. Scoped cleanup: cleanup requires explicit `--cleanup` and deletes only the test asset.
 * 8. Zero production impact: does not alter Render, Vercel, Aiven, or active storage driver.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// CLI Arguments
const args = process.argv.slice(2);
const isExecute = args.includes('--execute');
const isDryRun = !isExecute || args.includes('--dry-run');
const doCleanup = args.includes('--cleanup');

function getArgValue(flag) {
  const match = args.find((a) => a.startsWith(`${flag}=`));
  return match ? match.slice(flag.length + 1) : null;
}

// Configuration from environment or CLI
const cloudName =
  process.env.CLOUDINARY_CLOUD_NAME ||
  getArgValue('--cloud-name') ||
  'defxtdiis';

const apiKey =
  process.env.CLOUDINARY_API_KEY ||
  getArgValue('--api-key') ||
  '';

const apiSecret =
  process.env.CLOUDINARY_API_SECRET ||
  getArgValue('--api-secret') ||
  '';

const targetFolder = 'odibrick-dev-test';
const testPublicId = 'sample-test-image';
const fullPublicId = `${targetFolder}/${testPublicId}`;

// Mask helper for safe display
function maskSecret(val) {
  if (!val) return '[NOT CONFIGURED]';
  if (val.length <= 8) return '********';
  return `${val.slice(0, 4)}...${val.slice(-4)}`;
}

// Designated local public sample image
const designatedImagePath = path.resolve(
  REPO_ROOT,
  'apps/api/storage/demo/properties/00FC08F142DB7A1800D2F39FF2/photo-1.jpg',
);

// Sign parameters for Cloudinary Upload API
function generateCloudinarySignature(params, secret) {
  // 1. Filter out parameters not included in signature
  const excludedKeys = new Set(['api_key', 'file', 'resource_type', 'signature']);
  const filteredKeys = Object.keys(params).filter((k) => !excludedKeys.has(k) && params[k] !== undefined && params[k] !== '');

  // 2. Sort keys alphabetically
  filteredKeys.sort();

  // 3. Join as key=value&...
  const serialized = filteredKeys.map((k) => `${k}=${params[k]}`).join('&');

  // 4. Append secret and hash with SHA-1
  return crypto.createHash('sha1').update(serialized + secret).digest('hex');
}

export async function runCloudinaryAccessTest() {
  console.log('===============================================================');
  console.log('ODIBRICK — CLOUDINARY API ACCESS & ISOLATED LOCAL TEST');
  console.log('===============================================================');
  console.log(`Execution Mode : ${isExecute ? 'LIVE CLOUD TEST (--execute)' : 'DRY RUN (Read Only)'}`);
  console.log(`Cloud Name     : ${cloudName}`);
  console.log(`API Key        : ${maskSecret(apiKey)}`);
  console.log(`API Secret     : ${apiSecret ? '[CONFIGURED - MASKED]' : '[NOT CONFIGURED]'}`);
  console.log(`Target Folder  : ${targetFolder}/`);
  console.log(`Target Asset   : ${fullPublicId}`);
  console.log(`Overwrite Gate : FORBIDDEN (overwrite: false)`);
  console.log('---------------------------------------------------------------\n');

  // Safety Gate 1: Check credentials
  if (!cloudName) {
    console.error('[SAFETY BLOCKER] Cloud Name is missing. Set CLOUDINARY_CLOUD_NAME.');
    process.exit(1);
  }
  if (!apiKey && isExecute) {
    console.error('[SAFETY BLOCKER] API Key is missing. Set CLOUDINARY_API_KEY.');
    process.exit(1);
  }
  if (!apiSecret && isExecute) {
    console.error('[SAFETY BLOCKER] API Secret is required for live execution. Set CLOUDINARY_API_SECRET.');
    process.exit(1);
  }

  // Safety Gate 2: Validate sample file exists and is strictly a public asset
  if (!fs.existsSync(designatedImagePath)) {
    console.error(`[SAFETY BLOCKER] Designated sample file not found: ${designatedImagePath}`);
    process.exit(1);
  }

  // Enforce zero private documents
  if (
    designatedImagePath.includes('vault') ||
    designatedImagePath.includes('kyc') ||
    designatedImagePath.includes('agreements')
  ) {
    console.error('[FATAL SAFETY VIOLATION] Refusing to process private documents!');
    process.exit(1);
  }

  const imageBuffer = fs.readFileSync(designatedImagePath);
  const imageSha256 = crypto.createHash('sha256').update(imageBuffer).digest('hex');

  console.log('Designated Sample Image:');
  console.log(`  - File Path : ${path.relative(REPO_ROOT, designatedImagePath)}`);
  console.log(`  - Size      : ${imageBuffer.length} bytes`);
  console.log(`  - SHA-256   : ${imageSha256}`);
  console.log(`  - Target    : ${fullPublicId}\n`);

  // Step 1: Dry run verification
  if (isDryRun) {
    console.log('--- PREFLIGHT VALIDATION (DRY RUN) ---');
    console.log('  ✓ Verified designated public sample image exists on disk.');
    console.log(`  ✓ Target folder strictly constrained to "${targetFolder}/".`);
    console.log('  ✓ Overwrite protection set to false (no existing assets will be modified).');
    console.log('  ✓ Zero private KYC / agreement files included.');
    console.log('  ✓ No production databases, endpoints, or environment variables modified.');
    console.log('\nDry run complete. No remote network calls were dispatched.');
    console.log('To execute the live test once approved, run with: --execute\n');
    return { dryRun: true };
  }

  // Step 2: Cleanup mode
  if (doCleanup && isExecute) {
    console.log('--- CLEANUP: REMOVING TEST ASSET ---');
    const timestamp = Math.floor(Date.now() / 1000);
    const params = {
      public_id: fullPublicId,
      timestamp,
    };
    const signature = generateCloudinarySignature(params, apiSecret);

    const formData = new URLSearchParams();
    formData.append('public_id', fullPublicId);
    formData.append('timestamp', timestamp.toString());
    formData.append('api_key', apiKey);
    formData.append('signature', signature);

    const destroyUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`;
    console.log(`  Dispatching destroy request for ${fullPublicId}...`);

    try {
      const res = await fetch(destroyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
      const data = await res.json();
      console.log('  Response:', data);
      if (data.result === 'ok' || data.result === 'not found') {
        console.log(`  ✓ Cleanup completed successfully: ${data.result}`);
      } else {
        console.warn(`  ! Cleanup response: ${JSON.stringify(data)}`);
      }
    } catch (err) {
      console.error('  ✗ Cleanup failed:', err.message);
    }
    return { cleanup: true };
  }

  // Step 3: Live Upload API Verification
  console.log('--- TEST STEP: SERVER-SIDE UPLOAD API CALL ---');
  const timestamp = Math.floor(Date.now() / 1000);
  const uploadParams = {
    folder: targetFolder,
    public_id: testPublicId,
    overwrite: 'false',
    tags: 'odibrick-dev-test,local-verification',
    timestamp: timestamp.toString(),
  };

  const signature = generateCloudinarySignature(uploadParams, apiSecret);

  // Construct multipart body
  const boundary = '----WebKitFormBoundaryOdibrickTest' + crypto.randomBytes(8).toString('hex');
  const bodyParts = [];

  for (const [key, val] of Object.entries(uploadParams)) {
    bodyParts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`,
      ),
    );
  }

  // Add API Key and Signature
  bodyParts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="api_key"\r\n\r\n${apiKey}\r\n`,
    ),
  );
  bodyParts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="signature"\r\n\r\n${signature}\r\n`,
    ),
  );

  // Add file
  bodyParts.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo-1.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`,
    ),
  );
  bodyParts.push(imageBuffer);
  bodyParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const fullBody = Buffer.concat(bodyParts);
  const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;

  console.log(`  Endpoint  : POST ${uploadUrl}`);
  console.log(`  Parameters: folder=${targetFolder}, public_id=${testPublicId}, overwrite=false`);
  console.log('  Sending upload request...');

  try {
    const response = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': fullBody.length.toString(),
      },
      body: fullBody,
    });

    const result = await response.json();

    if (!response.ok || result.error) {
      console.error('\n===============================================================');
      console.error('CLOUDINARY UPLOAD API ERROR RESPONSE');
      console.error('===============================================================');
      console.error(`HTTP Status : ${response.status} ${response.statusText}`);
      console.error(`Error Code  : ${result.error?.message || 'Unknown error'}`);
      console.error('---------------------------------------------------------------');
      console.error('Diagnosis:');
      if (response.status === 401 || result.error?.message?.includes('authorization') || result.error?.message?.includes('permission')) {
        console.error('  -> The API Key / Secret credentials were authenticated, but the');
        console.error('     key lacks permission to execute server-side Upload API calls');
        console.error(`     into folder "${targetFolder}/" with its current role.`);
      } else {
        console.error(`  -> Raw Response: ${JSON.stringify(result)}`);
      }
      console.error('===============================================================\n');
      return { success: false, error: result.error, status: response.status };
    }

    console.log('\n===============================================================');
    console.log('✓ CLOUDINARY UPLOAD API SUCCESS');
    console.log('===============================================================');
    console.log(`Public ID      : ${result.public_id}`);
    console.log(`Format         : ${result.format}`);
    console.log(`Dimensions     : ${result.width}x${result.height}`);
    console.log(`Bytes          : ${result.bytes}`);
    console.log(`Resource Type  : ${result.resource_type}`);
    console.log(`Secure URL     : ${result.secure_url}`);
    console.log(`Created At     : ${result.created_at}`);
    console.log('---------------------------------------------------------------');
    console.log('Access Control Verification:');
    console.log('  ✓ Server-side Upload API access is confirmed active.');
    console.log('  ✓ Upload to dedicated test folder succeeded without overwriting existing assets.');
    console.log('---------------------------------------------------------------');
    console.log('Cleanup Command (to be executed separately after review):');
    console.log(`  node scripts/test-cloudinary-access.mjs --execute --cleanup`);
    console.log('===============================================================\n');

    return { success: true, result };
  } catch (err) {
    console.error('Upload Request Exception:', err.message);
    return { success: false, error: err.message };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCloudinaryAccessTest().catch((err) => {
    console.error('Test Runner Failed:', err);
    process.exit(1);
  });
}
