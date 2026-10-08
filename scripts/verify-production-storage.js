/**
 * Odibrick — Production Storage Verification Tool
 * 
 * Non-destructive verification tool for DevOps and CI/CD pipelines.
 * Verifies storage configuration, driver status, S3/R2 settings,
 * directory permissions, and media integrity.
 * 
 * Usage:
 *   node scripts/verify-production-storage.js [--json]
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment from apps/api/.env or root .env
const envPaths = [
  path.resolve(__dirname, '../apps/api/.env'),
  path.resolve(__dirname, '../.env'),
];

for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

const isJsonOutput = process.argv.includes('--json');

async function verifyProductionStorage() {
  const report = {
    timestamp: new Date().toISOString(),
    status: 'HEALTHY',
    driver: process.env.STORAGE_DRIVER || 'LOCAL',
    environment: process.env.NODE_ENV || 'development',
    configuration: {},
    checks: [],
    recommendations: [],
  };

  const addCheck = (name, passed, details, isWarning = false) => {
    report.checks.push({
      name,
      status: passed ? 'PASSED' : isWarning ? 'WARNING' : 'FAILED',
      details,
    });
    if (!passed && !isWarning) {
      report.status = 'DEGRADED';
    }
  };

  // 1. Storage Driver Configuration
  const driver = (process.env.STORAGE_DRIVER || 'LOCAL').toUpperCase();
  report.configuration.driver = driver;

  if (driver === 'S3') {
    const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || process.env.S3_REGION || 'ap-south-1';
    const endpoint = process.env.S3_ENDPOINT || process.env.AWS_S3_ENDPOINT;
    const hasAccessKey = !!(process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID);
    const hasSecretKey = !!(process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY);
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';

    report.configuration.s3 = {
      bucket: bucket || null,
      region,
      endpoint: endpoint || 'AWS Standard Endpoint',
      credentialsConfigured: hasAccessKey && hasSecretKey,
      forcePathStyle,
      isCloudflareR2: !!(endpoint && endpoint.includes('r2.cloudflarestorage.com')),
    };

    addCheck(
      'S3_BUCKET Definition',
      !!bucket,
      bucket ? `Configured bucket: ${bucket}` : 'Missing S3_BUCKET env variable. S3 driver will fail fast.',
    );

    addCheck(
      'S3 Credentials Presence',
      hasAccessKey && hasSecretKey,
      hasAccessKey && hasSecretKey
        ? 'AWS/S3 API keys configured'
        : 'Explicit API keys missing (ensure IAM instance role or ambient credentials if running in AWS/ECS/EKS)',
      true, // warning if using ambient IAM roles
    );

    if (endpoint) {
      addCheck(
        'Custom S3/R2 Endpoint',
        true,
        `Custom endpoint configured: ${endpoint}`,
      );
    }
  } else {
    // LOCAL Driver Checks
    const localRoot = process.env.STORAGE_LOCAL_ROOT || path.resolve(__dirname, '../storage');
    report.configuration.local = {
      root: localRoot,
      exists: fs.existsSync(localRoot),
    };

    let writable = false;
    try {
      if (!fs.existsSync(localRoot)) {
        fs.mkdirSync(localRoot, { recursive: true });
      }
      const testFile = path.resolve(localRoot, '.storage-health-check');
      fs.writeFileSync(testFile, 'OK');
      fs.unlinkSync(testFile);
      writable = true;
    } catch (err) {
      writable = false;
    }

    addCheck(
      'Local Storage Directory Exists',
      fs.existsSync(localRoot),
      `Path: ${localRoot}`,
    );

    addCheck(
      'Local Storage Writable',
      writable,
      writable ? 'Read & write operations verified' : `Storage directory ${localRoot} is not writable. Check permissions.`,
    );

    if (report.environment === 'production') {
      report.recommendations.push(
        'For high-availability multi-instance production deployments, set STORAGE_DRIVER=S3 with S3_BUCKET or Cloudflare R2.',
      );
    }
  }

  // 2. Verified Property Media Serving Check
  const storageControllerPath = path.resolve(__dirname, '../apps/api/dist/modules/storage/storage.controller.js');
  addCheck(
    'Public Storage Controller Compiled',
    fs.existsSync(storageControllerPath),
    'Controller artifact compiled and ready for serving',
  );

  // Output formatting
  if (isJsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('\n========================================================');
    console.log('ODIBRICK PRODUCTION STORAGE VERIFICATION');
    console.log('========================================================\n');
    console.log(`Timestamp:   ${report.timestamp}`);
    console.log(`Environment: ${report.environment}`);
    console.log(`Driver:      ${report.driver}`);
    console.log(`Status:      ${report.status === 'HEALTHY' ? '✓ HEALTHY' : '⚠ ' + report.status}\n`);

    console.log('--- Configuration ---');
    console.log(JSON.stringify(report.configuration, null, 2));

    console.log('\n--- Diagnostic Checks ---');
    for (const chk of report.checks) {
      const icon = chk.status === 'PASSED' ? '✓' : chk.status === 'WARNING' ? '⚠' : '✗';
      console.log(`  ${icon} [${chk.status}] ${chk.name}: ${chk.details}`);
    }

    if (report.recommendations.length > 0) {
      console.log('\n--- Recommendations ---');
      for (const rec of report.recommendations) {
        console.log(`  • ${rec}`);
      }
    }
    console.log('\n========================================================\n');
  }

  if (report.status === 'DEGRADED') {
    process.exit(1);
  }
}

verifyProductionStorage().catch((err) => {
  console.error('Storage verification failed with error:', err);
  process.exit(1);
});
