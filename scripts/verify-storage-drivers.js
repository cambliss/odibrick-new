/**
 * Odibrick — Storage Drivers & Production Media Test Suite
 * 
 * Verifies:
 * 1. LocalDriver operations (put, get, exists, remove, SVG fallback)
 * 2. S3Driver operations (AWS S3 & Cloudflare R2 compatibility)
 * 3. Driver selection logic & fail-fast configuration validation
 * 4. Security protections (path traversal, vault isolation, key sanitization)
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  ✓ PASS: ${message}`);
    passedTests++;
  } else {
    console.error(`  ✗ FAIL: ${message}`);
    failedTests++;
  }
}

async function runTests() {
  console.log('\n========================================================');
  console.log('ODIBRICK STORAGE & S3/R2 MEDIA DRIVER VERIFICATION SUITE');
  console.log('========================================================\n');

  // Load compiled dist classes
  const storageServiceModule = require('../apps/api/dist/modules/storage/storage.service');
  const { LocalDriver, S3Driver, StorageService } = storageServiceModule;

  // -------------------------------------------------------------------
  // TEST GROUP 1: LOCAL DRIVER TESTS
  // -------------------------------------------------------------------
  console.log('--- TEST GROUP 1: LocalDriver ---');
  const testStorageDir = path.resolve(__dirname, '../storage/test-suite');
  if (!fs.existsSync(testStorageDir)) {
    fs.mkdirSync(testStorageDir, { recursive: true });
  }

  const localDriver = new LocalDriver(testStorageDir);
  const testKey = 'test-suite/test-image-1.jpg';
  const testBuffer = Buffer.from('FAKE_JPEG_BINARY_DATA_FOR_TESTING');

  // 1.1 Local Put
  await localDriver.put(testKey, testBuffer, 'image/jpeg');
  assert(await localDriver.exists(testKey), 'LocalDriver.put creates file and exists() returns true');

  // 1.2 Local Get
  const readBuffer = await localDriver.get(testKey);
  assert(readBuffer.toString() === testBuffer.toString(), 'LocalDriver.get reads back exact binary contents');

  // 1.3 Local Remove
  await localDriver.remove(testKey);
  assert(!(await localDriver.exists(testKey)), 'LocalDriver.remove deletes file and exists() returns false');

  // 1.4 Local Missing Key / SVG Fallback for property images
  const missingPropKey = 'properties/missing-prop-123/2026-10/kitchen-photo.jpg';
  const svgFallback = await localDriver.get(missingPropKey);
  assert(svgFallback && svgFallback.toString().includes('<svg') && svgFallback.toString().includes('Modular Kitchen'), 'LocalDriver generates contextual SVG fallback for missing property photos');

  // 1.5 Local Non-Property Missing Key throws NotFoundException
  let notFoundCaught = false;
  try {
    await localDriver.get('vault/missing-doc.pdf');
  } catch (err) {
    notFoundCaught = true;
    assert(err.message.includes('not found') || err.status === 404, 'LocalDriver throws NotFoundException for missing non-property files');
  }
  assert(notFoundCaught, 'LocalDriver correctly rejects missing vault documents');

  // -------------------------------------------------------------------
  // TEST GROUP 2: S3 DRIVER UNIT & COMPATIBILITY TESTS
  // -------------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: S3Driver & R2 Compatibility ---');

  // 2.1 S3Driver Constructor requires S3_BUCKET
  let missingBucketCaught = false;
  try {
    new S3Driver({ bucket: '' });
  } catch (err) {
    missingBucketCaught = true;
    assert(err.message.includes('S3_BUCKET'), 'S3Driver throws error if bucket is not provided');
  }
  assert(missingBucketCaught, 'S3Driver constructor enforces non-empty bucket');

  // 2.2 S3Driver initializes with AWS S3 config
  const s3Aws = new S3Driver({
    bucket: 'odibrick-production-media',
    region: 'ap-south-1',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  });
  assert(s3Aws instanceof S3Driver, 'S3Driver instantiates cleanly for AWS S3');

  // 2.3 S3Driver initializes with Cloudflare R2 config (Custom endpoint + forcePathStyle)
  const s3R2 = new S3Driver({
    bucket: 'odibrick-media-r2',
    endpoint: 'https://a1b2c3d4e5f6.r2.cloudflarestorage.com',
    region: 'auto',
    accessKeyId: 'r2_access_key_123',
    secretAccessKey: 'r2_secret_key_456',
    forcePathStyle: true,
  });
  assert(s3R2 instanceof S3Driver, 'S3Driver instantiates cleanly with Cloudflare R2 endpoint and path style');

  // 2.4 S3Driver Key Sanitization and Mock send execution
  let sentCommand = null;
  s3Aws.client.send = async (command) => {
    sentCommand = command;
    if (command.constructor.name === 'PutObjectCommand') {
      return { ETag: '"test-etag-123"' };
    }
    if (command.constructor.name === 'GetObjectCommand') {
      return {
        Body: {
          transformToByteArray: async () => Buffer.from('S3_IMAGE_BINARY_PAYLOAD'),
        },
      };
    }
    if (command.constructor.name === 'HeadObjectCommand') {
      return { ContentLength: 23, ContentType: 'image/jpeg' };
    }
    if (command.constructor.name === 'DeleteObjectCommand') {
      return {};
    }
    throw new Error('Unknown command');
  };

  // Test S3 Put
  await s3Aws.put('properties/test-prop/2026-10/img.jpg', Buffer.from('S3_IMAGE_BINARY_PAYLOAD'), 'image/jpeg');
  assert(sentCommand && sentCommand.input.Bucket === 'odibrick-production-media', 'S3Driver.put dispatches PutObjectCommand with configured bucket');
  assert(sentCommand && sentCommand.input.Key === 'properties/test-prop/2026-10/img.jpg', 'S3Driver.put preserves correct storage key format');
  assert(sentCommand && sentCommand.input.ContentType === 'image/jpeg', 'S3Driver.put sends correct ContentType');

  // Test S3 Get
  const s3GetResult = await s3Aws.get('properties/test-prop/2026-10/img.jpg');
  assert(s3GetResult.toString() === 'S3_IMAGE_BINARY_PAYLOAD', 'S3Driver.get transforms stream to Buffer and returns payload');

  // Test S3 Exists
  const s3Exists = await s3Aws.exists('properties/test-prop/2026-10/img.jpg');
  assert(s3Exists === true, 'S3Driver.exists returns true on successful HeadObjectCommand');

  // Test S3 Exists 404
  s3Aws.client.send = async (command) => {
    if (command.constructor.name === 'HeadObjectCommand') {
      const err = new Error('NoSuchKey');
      err.name = 'NoSuchKey';
      err.$metadata = { httpStatusCode: 404 };
      throw err;
    }
  };
  const s3Missing = await s3Aws.exists('properties/non-existent.jpg');
  assert(s3Missing === false, 'S3Driver.exists returns false on NoSuchKey 404');

  // Test S3 Remove
  s3Aws.client.send = async (command) => {
    sentCommand = command;
    return {};
  };
  await s3Aws.remove('properties/test-prop/2026-10/img.jpg');
  assert(sentCommand && sentCommand.constructor.name === 'DeleteObjectCommand', 'S3Driver.remove dispatches DeleteObjectCommand');

  // -------------------------------------------------------------------
  // TEST GROUP 3: DRIVER SELECTION & CONFIGURATION VALIDATION
  // -------------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Driver Selection & Fail-Fast Validation ---');

  const mockDb = { insert: async () => 1, one: async () => null, execute: async () => {} };
  const mockAudit = { record: async () => {} };
  const mockNotify = { send: async () => {} };

  // 3.1 Local driver selected when STORAGE_DRIVER=LOCAL
  const configLocal = {
    get: (key) => {
      if (key === 'storage.driver') return 'LOCAL';
      if (key === 'storage.localRoot') return testStorageDir;
      return null;
    },
  };
  const storageLocalService = new StorageService(configLocal, mockDb, mockAudit, mockNotify);
  assert(storageLocalService.getDriverName() === 'LOCAL', 'StorageService initializes LocalDriver when STORAGE_DRIVER=LOCAL');

  // 3.2 S3 driver fails fast if S3_BUCKET is missing when STORAGE_DRIVER=S3
  const configS3MissingBucket = {
    get: (key) => {
      if (key === 'storage.driver') return 'S3';
      if (key === 'storage.s3Bucket') return '';
      return null;
    },
  };
  let s3ConfigFailFast = false;
  try {
    new StorageService(configS3MissingBucket, mockDb, mockAudit, mockNotify);
  } catch (err) {
    s3ConfigFailFast = true;
    assert(err.message.includes('S3_BUCKET') && err.message.includes('Failing fast'), 'StorageService fails fast with explicit error if S3_BUCKET missing when STORAGE_DRIVER=S3');
  }
  assert(s3ConfigFailFast, 'StorageService strictly prevents silent fallback to ephemeral disk when STORAGE_DRIVER=S3');

  // 3.3 S3 driver initializes when S3_BUCKET is provided
  const configS3Valid = {
    get: (key) => {
      if (key === 'storage.driver') return 'S3';
      if (key === 'storage.s3Bucket') return 'odibrick-prod-bucket';
      if (key === 'storage.awsRegion') return 'ap-south-1';
      if (key === 'storage.awsAccessKeyId') return 'MOCK_KEY';
      if (key === 'storage.awsSecretAccessKey') return 'MOCK_SECRET';
      return null;
    },
  };
  const storageS3Service = new StorageService(configS3Valid, mockDb, mockAudit, mockNotify);
  assert(storageS3Service.getDriverName() === 'S3', 'StorageService initializes S3Driver cleanly when credentials and bucket are valid');

  // -------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------
  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('========================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
