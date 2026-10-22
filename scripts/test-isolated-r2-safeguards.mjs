/**
 * Automated Safety & Safeguard Tests for Isolated R2 Test Runner
 * 
 * Verifies:
 * 1. Target validation strictly blocks accidental execution against production bucket.
 * 2. Target validation requires isolated prefix (strictly isolated-test/).
 * 3. Mocked S3 client executes complete workflow:
 *    - Uploads small public image (~3 KB) with overwrite protection
 *    - Downloads and verifies SHA-256 hash match
 *    - Validates SVG fallback on missing key
 *    - Validates private document public route rejection (HTTP 403)
 *    - Validates authorized document endpoint enforcement (HTTP 401 / 403 / 200)
 *    - Validates idempotency
 *    - Validates cleanup strictly scoped to isolated prefix
 * 4. CLI execution safeguards fail fast with exit code 1 on safety violations.
 */

import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateTestSafety, runIsolatedR2Test } from './isolated-r2-test.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.resolve(REPO_ROOT, 'scripts/isolated-r2-test.mjs');

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

console.log('\n===============================================================');
console.log('ISOLATED R2 TEST SAFEGUARD & WORKFLOW VERIFICATION');
console.log('===============================================================\n');

// -------------------------------------------------------------------
// TEST GROUP 1: Safety Validation Unit Checks
// -------------------------------------------------------------------
console.log('--- TEST GROUP 1: Safety Validation Unit Checks ---');

// 1.1 Blocking production bucket
const checkProdNoPrefix = validateTestSafety('odibrick-production-media', '');
assert(!checkProdNoPrefix.safe, 'Blocks production bucket when prefix is empty');

const checkProdRootPrefix = validateTestSafety('odibrick-production-media', '/');
assert(!checkProdRootPrefix.safe, 'Blocks production bucket when prefix is root (/)');

const checkProdWithTestPrefix = validateTestSafety('odibrick-production-media', 'isolated-test/');
assert(!checkProdWithTestPrefix.safe, 'Blocks production bucket even when prefix is isolated-test/');

const checkProdShortWithTestPrefix = validateTestSafety('odibrick-prod-media', 'isolated-test/');
assert(!checkProdShortWithTestPrefix.safe, 'Blocks odibrick-prod-media even with test prefix');

// 1.2 Dedicated test bucket naming
const checkTestBucket = validateTestSafety('odibrick-test-media', 'isolated-test/');
assert(checkTestBucket.safe, 'Allows dedicated test bucket (odibrick-test-media) with test prefix');

const checkCustomTestBucket = validateTestSafety('my-test-bucket', 'isolated-test/');
assert(checkCustomTestBucket.safe, 'Allows custom bucket containing "test" with test prefix');

const checkNonTestBucket = validateTestSafety('random-media-bucket', 'isolated-test/');
assert(!checkNonTestBucket.safe, 'Blocks bucket that does not contain "test" in name');

// 1.3 Missing bucket or invalid prefix
const checkMissingBucket = validateTestSafety('', 'isolated-test/');
assert(!checkMissingBucket.safe, 'Blocks execution when bucket name is empty');

const checkInvalidPrefix = validateTestSafety('odibrick-test-media', 'production/');
assert(!checkInvalidPrefix.safe, 'Blocks execution when prefix is not strictly "isolated-test/"');

// -------------------------------------------------------------------
// TEST GROUP 2: Mocked R2 Workflow Simulation
// -------------------------------------------------------------------
console.log('\n--- TEST GROUP 2: Mocked R2 Client Workflow ---');

async function testMockWorkflow() {
  const dispatchedCommands = [];
  const storedObjects = new Map();

  const mockS3Client = {
    send: async (command) => {
      const name = command.constructor.name;
      dispatchedCommands.push({ name, input: command.input });

      if (name === 'PutObjectCommand') {
        storedObjects.set(command.input.Key, {
          body: command.input.Body,
          length: command.input.Body.length,
          contentType: command.input.ContentType,
          metadata: command.input.Metadata,
        });
        return {};
      }

      if (name === 'GetObjectCommand') {
        const obj = storedObjects.get(command.input.Key);
        if (!obj) {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          throw err;
        }
        return {
          Body: {
            transformToByteArray: async () => new Uint8Array(obj.body),
          },
        };
      }

      if (name === 'HeadObjectCommand') {
        const obj = storedObjects.get(command.input.Key);
        if (!obj) {
          const err = new Error('NotFound');
          err.name = 'NotFound';
          err.$metadata = { httpStatusCode: 404 };
          throw err;
        }
        return {
          ContentLength: obj.length,
          Metadata: obj.metadata,
        };
      }

      if (name === 'DeleteObjectCommand') {
        storedObjects.delete(command.input.Key);
        return {};
      }

      throw new Error(`Unhandled mock command: ${name}`);
    },
  };

  // Run isolated test with mock client in execute mode targeting test bucket
  const results = await runIsolatedR2Test({
    customClient: mockS3Client,
    bucket: 'odibrick-test-media',
    prefix: 'isolated-test/',
    isExecute: true,
    isMock: false,
    suppressExit: true,
  });

  assert(results.step1_upload_public, 'Step 1: Upload representative image passed');
  assert(results.step2_download_verify_sha256, 'Step 2: Download & SHA-256 match passed');
  assert(results.step3_missing_svg_fallback, 'Step 3: Missing SVG fallback passed');
  assert(results.step4_private_isolation, 'Step 4: Private document public route 403 isolation passed');
  assert(results.step4_authorized_document_route, 'Step 4: Authorized document route access enforcement passed');
  assert(results.step5_idempotency_skip, 'Step 5: Idempotency skip check passed');
  assert(results.step6_cleanup_executed, 'Step 6: Scoped cleanup handled passed');

  // Verify that any DeleteObjectCommand ONLY targeted keys under the test prefix
  const deleteCalls = dispatchedCommands.filter((c) => c.name === 'DeleteObjectCommand');
  const allDeletesScoped = deleteCalls.every((c) => c.input.Key.startsWith('isolated-test/'));
  assert(allDeletesScoped, 'All delete commands were strictly scoped to isolated-test/ prefix');
}

await testMockWorkflow();

// -------------------------------------------------------------------
// TEST GROUP 3: CLI Process Invocations
// -------------------------------------------------------------------
console.log('\n--- TEST GROUP 3: CLI Execution Safeguards ---');

// 3.1 Attempting to run --execute against production bucket
const resProdAttempt = spawnSync('node', [SCRIPT_PATH, '--execute', '--bucket=odibrick-production-media'], {
  encoding: 'utf8',
});
assert(resProdAttempt.status === 1, 'CLI halts with exit code 1 when attempting to target production bucket');
assert(
  resProdAttempt.stderr.includes('SAFETY GATE BLOCKED') ||
  resProdAttempt.stdout.includes('SAFETY GATE BLOCKED'),
  'CLI prints SAFETY GATE BLOCKED message'
);

// 3.2 Attempting to run with non-isolated prefix
const resPrefixAttempt = spawnSync('node', [SCRIPT_PATH, '--execute', '--bucket=odibrick-test-media', '--prefix=live/'], {
  encoding: 'utf8',
});
assert(resPrefixAttempt.status === 1, 'CLI halts with exit code 1 when attempting non-isolated prefix');

// 3.3 Running dry-run mode completes safely
const resDryRun = spawnSync('node', [SCRIPT_PATH, '--dry-run', '--bucket=odibrick-test-media'], {
  encoding: 'utf8',
});
assert(resDryRun.status === 0, 'CLI completes with exit code 0 in safe dry-run mode');
assert(resDryRun.stdout.includes('DRY RUN (Read Only)'), 'CLI reports DRY RUN (Read Only) mode');

console.log('\n===============================================================');
console.log(`TEST SUMMARY: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
console.log('===============================================================\n');

if (failedTests > 0) {
  process.exit(1);
}
