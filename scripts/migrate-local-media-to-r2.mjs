#!/usr/bin/env node
/**
 * Odibrick — Safe Local Media to Cloudflare R2 Migration Utility
 * 
 * Safety Rules Enforced:
 * 1. DRY-RUN by default. Requires explicit `--execute` to upload.
 * 2. Never deletes or mutates local files.
 * 3. Never modifies database records or schemas.
 * 4. Resolves duplicate keys across multiple source roots and aborts on hash conflicts.
 * 5. Classifies private documents (vault/, kyc/, agreements/) and never makes them public.
 * 6. Generates SHA-256 checksums and records a verifiable migration manifest.
 * 7. Supports safe resumption (--resume) and post-upload verification (--verify).
 * 8. Sanitizes logs and manifest (no credentials, secrets, or signed URLs).
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import {
  S3Client,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

// Command line argument parser
const args = process.argv.slice(2);
const hasExecute = args.includes('--execute');
const hasDryRun = args.includes('--dry-run');
const isVerifyOnly = args.includes('--verify');
const allowOverwrite = args.includes('--overwrite');

// 1. Enforce safe flag precedence: strictly reject contradictory flags
if (hasDryRun && hasExecute) {
  console.error('\n[FATAL ERROR] Contradictory flags provided: cannot specify both --dry-run and --execute.');
  console.error('Specify either --dry-run (for read-only simulation) or --execute (for live migration).\n');
  process.exit(1);
}

// 2. Dry-run is the absolute default unless --execute is explicitly and uniquely passed
const isExecute = hasExecute && !hasDryRun;
const isDryRun = !isExecute;

function getArgValue(flag) {
  const match = args.find((a) => a.startsWith(`${flag}=`));
  return match ? match.slice(flag.length + 1) : null;
}

// Configurable source roots
const sourceArg = getArgValue('--source');
const sourceDirs = sourceArg
  ? sourceArg.split(',').map((s) => path.resolve(REPO_ROOT, s.trim()))
  : [
      path.resolve(REPO_ROOT, 'apps/api/storage'),
      path.resolve(REPO_ROOT, 'storage'),
    ];

const manifestPath =
  getArgValue('--manifest') ||
  path.resolve(REPO_ROOT, 'migration-media-manifest.json');

// S3 / R2 Configuration (from env or args)
const r2Config = {
  bucket: process.env.S3_BUCKET || getArgValue('--bucket') || '',
  endpoint: process.env.S3_ENDPOINT || getArgValue('--endpoint') || '',
  region: process.env.S3_REGION || process.env.AWS_REGION || 'auto',
  accessKeyId:
    process.env.S3_ACCESS_KEY ||
    process.env.AWS_ACCESS_KEY_ID ||
    getArgValue('--access-key') ||
    '',
  secretAccessKey:
    process.env.S3_SECRET_KEY ||
    process.env.AWS_SECRET_ACCESS_KEY ||
    getArgValue('--secret-key') ||
    '',
  forcePathStyle:
    process.env.S3_FORCE_PATH_STYLE === 'true' ||
    process.env.S3_FORCE_PATH_STYLE === '1',
};

// 3. Fail fast when execution or verification configuration is missing
if (isExecute || isVerifyOnly) {
  const missingConfigs = [];
  if (!r2Config.bucket) missingConfigs.push('S3_BUCKET (or --bucket=<bucket>)');
  if (!r2Config.accessKeyId) missingConfigs.push('S3_ACCESS_KEY / AWS_ACCESS_KEY_ID (or --access-key=<key>)');
  if (!r2Config.secretAccessKey) missingConfigs.push('S3_SECRET_KEY / AWS_SECRET_ACCESS_KEY (or --secret-key=<secret>)');
  if (!r2Config.endpoint && process.env.STORAGE_DRIVER !== 'AWS_S3') {
    missingConfigs.push('S3_ENDPOINT (or --endpoint=<url>)');
  }

  if (missingConfigs.length > 0) {
    console.error(`\n[FATAL CONFIGURATION ERROR] Cannot run in ${isExecute ? '--execute' : '--verify'} mode. Missing required settings:`);
    missingConfigs.forEach((m) => console.error(`  - ${m}`));
    console.error('\nExecution aborted with exit code 1 to prevent silent upload failure.\n');
    process.exit(1);
  }
}

// MIME detection
const EXT_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.json': 'application/json',
};

function detectMime(filePath, buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }
  const ext = path.extname(filePath).toLowerCase();
  return EXT_MIME[ext] || 'application/octet-stream';
}

function calculateSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function normalizeKey(relativePath) {
  return relativePath
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '');
}

function isPrivateDocument(key) {
  const normalized = key.toLowerCase();
  return (
    normalized.startsWith('vault/') ||
    normalized.startsWith('kyc/') ||
    normalized.startsWith('agreements/')
  );
}

const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git/,
  /\.DS_Store/,
  /test-suite/,
  /unit-test-tmp/,
  /\.tmp$/,
  /\.log$/,
];

function scanDirectory(dir, baseDir = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relToRoot = path.relative(baseDir, fullPath);

    if (IGNORE_PATTERNS.some((p) => p.test(fullPath) || p.test(entry.name))) {
      continue;
    }

    if (entry.isDirectory()) {
      results.push(...scanDirectory(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push({
        fullPath,
        relPath: normalizeKey(relToRoot),
        sourceRoot: baseDir,
      });
    }
  }
  return results;
}

async function retryOperation(fn, retries = 3, delayMs = 500) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = delayMs * Math.pow(2, attempt - 1);
      await new Promise((res) => setTimeout(res, wait));
    }
  }
}

export async function runMigration() {
  console.log('===============================================================');
  console.log('ODIBRICK — DURABLE MEDIA MIGRATION TO CLOUDFLARE R2');
  console.log('===============================================================');
  console.log(`Execution Mode : ${isExecute ? 'LIVE EXECUTION' : isVerifyOnly ? 'VERIFY ONLY' : 'DRY RUN (Read Only)'}`);
  console.log(`Source Roots   :`);
  sourceDirs.forEach((d) => console.log(`  - ${d} (${fs.existsSync(d) ? 'EXISTS' : 'NOT FOUND'})`));
  console.log(`Target Bucket  : ${r2Config.bucket || '[NOT CONFIGURED]'}`);
  console.log(`Endpoint       : ${r2Config.endpoint || '[AWS DEFAULT / NOT CONFIGURED]'}`);
  console.log(`Manifest Path  : ${manifestPath}`);
  console.log('---------------------------------------------------------------\n');

  // Step 1: Scan and Discover
  console.log('Step 1: Scanning local source directories...');
  const discoveredFiles = new Map(); // key -> { fullPath, sha256, sizeBytes, mimeType, sources: [] }
  const duplicateKeys = [];
  const hashConflicts = [];

  let totalPhysicalFiles = 0;

  for (const sourceRoot of sourceDirs) {
    if (!fs.existsSync(sourceRoot)) {
      console.warn(`[WARN] Source directory does not exist: ${sourceRoot}`);
      continue;
    }

    const files = scanDirectory(sourceRoot);
    console.log(`  Scanned ${sourceRoot}: found ${files.length} physical files.`);
    totalPhysicalFiles += files.length;

    for (const file of files) {
      const key = file.relPath;
      const buffer = fs.readFileSync(file.fullPath);
      const sha256 = calculateSha256(buffer);
      const sizeBytes = buffer.length;
      const mimeType = detectMime(file.fullPath, buffer);

      if (discoveredFiles.has(key)) {
        const existing = discoveredFiles.get(key);
        existing.sources.push(file.fullPath);
        duplicateKeys.push({ key, source1: existing.fullPath, source2: file.fullPath });

        if (existing.sha256 !== sha256) {
          hashConflicts.push({
            key,
            source1: existing.fullPath,
            hash1: existing.sha256,
            size1: existing.sizeBytes,
            source2: file.fullPath,
            hash2: sha256,
            size2: sizeBytes,
          });
        }
      } else {
        discoveredFiles.set(key, {
          key,
          fullPath: file.fullPath,
          sha256,
          sizeBytes,
          mimeType,
          isPrivate: isPrivateDocument(key),
          sources: [file.fullPath],
        });
      }
    }
  }

  console.log(`\nInventory Discovery Summary:`);
  console.log(`  Total Physical Files Scanned : ${totalPhysicalFiles}`);
  console.log(`  Unique Storage Keys Found    : ${discoveredFiles.size}`);
  console.log(`  Duplicate Keys (Same Name)   : ${duplicateKeys.length}`);
  console.log(`  Hash Conflicts (Diff Bytes)  : ${hashConflicts.length}`);

  if (hashConflicts.length > 0) {
    console.error('\n[FATAL ERROR] Content hash conflicts detected across source roots:');
    hashConflicts.forEach((c) => {
      console.error(`  - Key: ${c.key}`);
      console.error(`    Root 1 (${c.size1} B, SHA: ${c.hash1}): ${c.source1}`);
      console.error(`    Root 2 (${c.size2} B, SHA: ${c.hash2}): ${c.source2}`);
    });
    console.error('Migration aborted. Duplicate keys with differing file contents must be resolved manually.');
    process.exit(1);
  }

  // Breakdown by category
  let publicCount = 0;
  let privateCount = 0;
  let totalBytes = 0;

  for (const item of discoveredFiles.values()) {
    totalBytes += item.sizeBytes;
    if (item.isPrivate) {
      privateCount++;
    } else {
      publicCount++;
    }
  }

  console.log(`  Public Property Photos / Media: ${publicCount}`);
  console.log(`  Private Documents (Vault/KYC) : ${privateCount}`);
  console.log(`  Total Payload Size            : ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);

  // Step 2: Initialize R2 S3Client if credentials provided
  let s3Client = null;
  const canConnectR2 = !!(r2Config.bucket && r2Config.accessKeyId && r2Config.secretAccessKey);

  if (canConnectR2) {
    const clientOptions = {
      region: r2Config.region,
      credentials: {
        accessKeyId: r2Config.accessKeyId,
        secretAccessKey: r2Config.secretAccessKey,
      },
    };
    if (r2Config.endpoint) {
      clientOptions.endpoint = r2Config.endpoint;
    }
    if (r2Config.forcePathStyle !== undefined) {
      clientOptions.forcePathStyle = r2Config.forcePathStyle;
    }
    s3Client = new S3Client(clientOptions);
    console.log(`\nConnected S3/R2 client for bucket: ${r2Config.bucket}`);
  } else {
    console.log('\n[INFO] R2 credentials not fully provided. Cloud operations will be simulated in dry-run manifest.');
  }

  // Step 3: Migration / Verification Loop
  console.log('\nStep 2: Processing media inventory...');
  const manifestEntries = [];
  let uploadedCount = 0;
  let skippedCount = 0;
  let verifiedCount = 0;
  let failedCount = 0;

  for (const item of discoveredFiles.values()) {
    const manifestItem = {
      key: item.key,
      sourcePath: path.relative(REPO_ROOT, item.fullPath),
      sizeBytes: item.sizeBytes,
      sha256: item.sha256,
      mimeType: item.mimeType,
      isPrivate: item.isPrivate,
      status: 'PENDING',
      r2Status: 'UNCHECKED',
      error: null,
    };

    if (s3Client) {
      // Check if object already exists in destination bucket
      let existsOnR2 = false;
      let r2Size = 0;
      let r2MetadataChecksum = null;
      let r2ETag = null;

      try {
        const head = await retryOperation(() =>
          s3Client.send(
            new HeadObjectCommand({
              Bucket: r2Config.bucket,
              Key: item.key,
            }),
          ),
        );
        existsOnR2 = true;
        r2Size = head.ContentLength || 0;
        r2MetadataChecksum = head.Metadata?.['sha256-checksum'] || null;
        r2ETag = head.ETag ? head.ETag.replace(/"/g, '') : null;
      } catch (err) {
        if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404 || err.name === 'NoSuchKey') {
          existsOnR2 = false;
        } else {
          manifestItem.error = `HeadObject failed: ${err.message}`;
        }
      }

      if (existsOnR2) {
        manifestItem.r2Size = r2Size;
        manifestItem.r2MetadataChecksum = r2MetadataChecksum;
        // Note: S3/R2 ETag is MD5 (or multipart composite) and is NOT a SHA-256 checksum
        manifestItem.r2ETag = r2ETag;

        if (r2Size !== item.sizeBytes) {
          manifestItem.r2Status = 'EXISTS_SIZE_MISMATCH';
          if (!allowOverwrite) {
            manifestItem.status = 'CONFLICT_SIZE_MISMATCH';
            manifestItem.error = `Remote size (${r2Size} bytes) does not match local size (${item.sizeBytes} bytes)`;
            failedCount++;
          }
        } else {
          // Object size matches. Now determine verification vs upload skip
          if (isVerifyOnly) {
            // DEEP CONTENT INTEGRITY VERIFICATION:
            // Download actual object bytes and independently compute SHA-256
            try {
              const getRes = await retryOperation(() =>
                s3Client.send(
                  new GetObjectCommand({
                    Bucket: r2Config.bucket,
                    Key: item.key,
                  }),
                ),
              );

              if (!getRes.Body) {
                throw new Error('Storage service returned empty response body');
              }

              const byteArray = await getRes.Body.transformToByteArray();
              const downloadedBuffer = Buffer.from(byteArray);
              const downloadedSha256 = calculateSha256(downloadedBuffer);
              manifestItem.downloadedSha256 = downloadedSha256;

              // Compare actual downloaded byte checksum against local checksum
              if (downloadedSha256 === item.sha256) {
                manifestItem.r2Status = 'EXISTS_MATCH';
                manifestItem.status = 'VERIFIED_CHECKSUM_MATCH';
                verifiedCount++;
                skippedCount++;
              } else {
                manifestItem.r2Status = 'EXISTS_CHECKSUM_MISMATCH';
                manifestItem.status = 'VERIFICATION_CHECKSUM_MISMATCH';
                manifestItem.error = `Byte SHA-256 mismatch: local=${item.sha256}, downloaded=${downloadedSha256}`;
                failedCount++;
              }
            } catch (verifyErr) {
              manifestItem.status = 'VERIFICATION_FAILED';
              manifestItem.error = `Byte download/verification failed: ${verifyErr.message}`;
              failedCount++;
            }
          } else {
            // Live upload or dry-run skip check:
            if (r2MetadataChecksum) {
              if (r2MetadataChecksum === item.sha256) {
                manifestItem.r2Status = 'EXISTS_MATCH';
                manifestItem.status = 'SKIPPED_IDENTICAL';
                skippedCount++;
              } else {
                manifestItem.r2Status = 'EXISTS_CHECKSUM_MISMATCH';
                manifestItem.status = 'CONFLICT_CHECKSUM_MISMATCH';
                manifestItem.error = `Metadata SHA-256 mismatch: local=${item.sha256}, remote=${r2MetadataChecksum}`;
                failedCount++;
              }
            } else {
              // Size matches, but metadata is absent. Do not claim verified checksum match!
              manifestItem.r2Status = 'EXISTS_SIZE_ONLY_MATCH';
              manifestItem.status = 'SKIPPED_SIZE_ONLY';
              manifestItem.error = 'Remote object matches size, but lacks SHA-256 metadata. Run with --verify for byte verification.';
              skippedCount++;
            }
          }
        }
      } else {
        manifestItem.r2Status = 'MISSING';
      }

      // Upload if live execute mode and eligible
      if (
        isExecute &&
        !isDryRun &&
        !isVerifyOnly &&
        (manifestItem.r2Status === 'MISSING' ||
          ((manifestItem.r2Status === 'EXISTS_SIZE_MISMATCH' || manifestItem.r2Status === 'EXISTS_CHECKSUM_MISMATCH') && allowOverwrite))
      ) {
        try {
          const buffer = fs.readFileSync(item.fullPath);
          await retryOperation(() =>
            s3Client.send(
              new PutObjectCommand({
                Bucket: r2Config.bucket,
                Key: item.key,
                Body: buffer,
                ContentType: item.mimeType,
                Metadata: {
                  'sha256-checksum': item.sha256,
                  'original-size': String(item.sizeBytes),
                  'is-private': String(item.isPrivate),
                },
              }),
            ),
          );
          manifestItem.status = 'UPLOADED';
          uploadedCount++;
        } catch (uploadErr) {
          manifestItem.status = 'FAILED';
          manifestItem.error = uploadErr.message;
          failedCount++;
        }
      }
    } else {
      manifestItem.status = isDryRun ? 'DRY_RUN_ELIGIBLE' : 'SKIPPED_NO_R2_CONFIG';
      if (isDryRun) skippedCount++;
    }

    manifestEntries.push(manifestItem);
  }

  // Step 4: Write Manifest
  const manifestData = {
    generatedAt: new Date().toISOString(),
    executionMode: isExecute ? 'LIVE_EXECUTION' : isVerifyOnly ? 'VERIFY_ONLY' : 'DRY_RUN',
    sourceRoots: sourceDirs.map((d) => path.relative(REPO_ROOT, d)),
    targetBucket: r2Config.bucket || 'UNCONFIGURED',
    targetEndpoint: r2Config.endpoint || 'AWS_DEFAULT',
    stats: {
      totalDiscovered: discoveredFiles.size,
      totalPhysicalFiles,
      duplicateKeysCount: duplicateKeys.length,
      hashConflictsCount: hashConflicts.length,
      publicMediaCount: publicCount,
      privateDocsCount: privateCount,
      totalBytes,
      uploadedCount,
      skippedCount,
      verifiedCount,
      failedCount,
    },
    entries: manifestEntries,
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2), 'utf8');
  console.log(`\nMigration manifest saved: ${manifestPath}`);

  // Summary Report
  console.log('\n===============================================================');
  console.log('MIGRATION REPORT SUMMARY');
  console.log('===============================================================');
  console.log(`Total Keys Discovered : ${discoveredFiles.size}`);
  console.log(`Total Storage Volume   : ${(totalBytes / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`Uploads Executed      : ${uploadedCount}`);
  console.log(`Skipped / Identical   : ${skippedCount}`);
  console.log(`Verified On Target    : ${verifiedCount}`);
  console.log(`Failures / Errors     : ${failedCount}`);
  if (!isExecute) {
    console.log('\n[NOTICE] This was a DRY RUN. No files were uploaded or modified in the cloud.');
    console.log('To execute live migration to Cloudflare R2, configure environment variables:');
    console.log('  S3_BUCKET, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY');
    console.log('Then run with explicit authorization:');
    console.log('  node scripts/migrate-local-media-to-r2.mjs --execute');
  }
  console.log('===============================================================\n');

  return manifestData;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigration().catch((err) => {
    console.error('Fatal Migration Error:', err);
    process.exit(1);
  });
}
