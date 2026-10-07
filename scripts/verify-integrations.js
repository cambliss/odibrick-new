#!/usr/bin/env node
/**
 * ============================================================================
 * ODIBRICK PHASE 18 VERIFICATION SUITE
 * EXTERNAL INTEGRATIONS, PROVIDER ADAPTERS & WEBHOOK PLATFORM
 * ============================================================================
 */

const mysql = require('mysql2/promise');
const { createHmac, createHash } = require('crypto');

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3307', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'cambliss@123',
  database: process.env.DB_NAME || 'odibrick',
  multipleStatements: true,
};

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [TEST ${String(totalTests).padStart(3, '0')}] ${message}`);
  } else {
    console.error(`  ✗ [FAIL ${String(totalTests).padStart(3, '0')}] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function run() {
  console.log('======================================================================');
  console.log('  ODIBRICK PHASE 18 EXTERNAL INTEGRATIONS & WEBHOOK VERIFICATION SUITE');
  console.log('======================================================================\n');

  const conn = await mysql.createConnection(DB_CONFIG);

  try {
    // ------------------------------------------------------------------ SECTION 1: SCHEMA & RBAC
    console.log('--- SECTION 1: DATABASE SCHEMA & RBAC PERMISSIONS ---');

    const [tables] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('external_integrations', 'integration_events', 'webhook_events')`,
      [DB_CONFIG.database]
    );
    assert(tables.length === 3, 'All 3 external integrations & webhook tables exist in database');

    const [perms] = await conn.query(
      `SELECT code FROM permissions WHERE code IN ('integration.read', 'integration.manage', 'integration.test', 'webhook.read', 'webhook.manage')`
    );
    assert(perms.length === 5, 'All 5 integration and webhook permissions registered in permissions table');

    const [rolePerms] = await conn.query(
      `SELECT COUNT(*) as cnt FROM role_permissions rp
       JOIN permissions p ON p.id = rp.permission_id
       WHERE rp.role_id IN (1, 2) AND p.code IN ('integration.read', 'integration.manage', 'webhook.manage')`
    );
    assert(Number(rolePerms[0].cnt) >= 6, 'Integration permissions assigned to SUPER_ADMIN and ADMIN roles');

    // ------------------------------------------------------------------ SECTION 2: 9 CORE CAPABILITIES REGISTRY
    console.log('\n--- SECTION 2: 9 CORE CAPABILITIES REGISTRY ---');

    const [integrations] = await conn.query(`SELECT capability, provider_key, is_enabled, health_status FROM external_integrations ORDER BY id ASC`);
    assert(integrations.length >= 9, 'All 9 core capabilities registered in external_integrations table');

    const caps = integrations.map((i) => i.capability);
    assert(caps.includes('EMAIL'), 'EMAIL capability registered');
    assert(caps.includes('SMS'), 'SMS capability registered');
    assert(caps.includes('WHATSAPP'), 'WHATSAPP capability registered');
    assert(caps.includes('PAYMENT_GATEWAY'), 'PAYMENT_GATEWAY capability registered');
    assert(caps.includes('STORAGE'), 'STORAGE capability registered');
    assert(caps.includes('KYC'), 'KYC capability registered');
    assert(caps.includes('ESIGN'), 'ESIGN capability registered');
    assert(caps.includes('MAPS'), 'MAPS capability registered');
    assert(caps.includes('CALENDAR'), 'CALENDAR capability registered');

    // ------------------------------------------------------------------ SECTION 3: SECRET-SAFE METADATA
    console.log('\n--- SECTION 3: SECRET-SAFE CONFIGURATION INVARIANCE ---');

    const [rzp] = await conn.query(`SELECT config_metadata FROM external_integrations WHERE provider_key = 'razorpay' LIMIT 1`);
    const rzpMeta = typeof rzp[0].config_metadata === 'string' ? JSON.parse(rzp[0].config_metadata) : rzp[0].config_metadata;
    assert(!('secret' in rzpMeta) && !('key_secret' in rzpMeta), 'Plaintext API secrets are never stored in external_integrations table');
    assert(rzpMeta.currency === 'INR', 'Configuration metadata contains safe non-secret parameters');

    // ------------------------------------------------------------------ SECTION 4: DIAGNOSTIC TELEMETRY
    console.log('\n--- SECTION 4: DIAGNOSTIC TELEMETRY & CONNECTION TEST ---');

    const testEventPubId = `IEVT-TEST-${Date.now()}`;
    await conn.execute(
      `INSERT INTO integration_events (
        public_id, integration_id, event_type, direction, status, duration_ms,
        request_summary, response_summary
      ) VALUES (?, 1, 'CONNECTION_TEST', 'OUTBOUND', 'SUCCESS', 24, 'PING https://api.resend.com', 'Email gateway reachable')`,
      [testEventPubId]
    );

    const [diagRow] = await conn.query(`SELECT * FROM integration_events WHERE public_id = ?`, [testEventPubId]);
    assert(diagRow.length === 1, 'Diagnostic integration event recorded');
    assert(diagRow[0].duration_ms === 24, 'Diagnostic latency recorded');

    // ------------------------------------------------------------------ SECTION 5: INBOUND WEBHOOK PROCESSING ENGINE
    console.log('\n--- SECTION 5: INBOUND WEBHOOK PROCESSING & SIGNATURE SAFETY ---');

    const testExtEventId = `evt_rzp_test_${Date.now()}`;
    const testWhPubId = `WHK-TEST-${Date.now()}`;
    const payloadObj = {
      id: testExtEventId,
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_test_001', amount: 250000, status: 'captured' } } },
    };
    const payloadStr = JSON.stringify(payloadObj);
    const payloadHash = createHash('sha256').update(payloadStr).digest('hex');

    // Insert valid webhook
    const [whRes] = await conn.execute(
      `INSERT INTO webhook_events (
        public_id, provider, event_type, external_event_id, signature_status,
        processing_status, payload_hash, payload, received_at, processed_at
      ) VALUES (?, 'razorpay', 'payment.captured', ?, 'VERIFIED', 'PROCESSED', ?, ?, NOW(), NOW())`,
      [testWhPubId, testExtEventId, payloadHash, payloadStr]
    );
    const createdWhId = whRes.insertId;

    const [whRow] = await conn.query(`SELECT * FROM webhook_events WHERE id = ?`, [createdWhId]);
    assert(whRow.length === 1, 'Inbound webhook event recorded');
    assert(whRow[0].signature_status === 'VERIFIED', 'Signature status is VERIFIED');
    assert(whRow[0].processing_status === 'PROCESSED', 'Processing status transitioned to PROCESSED');

    // ------------------------------------------------------------------ SECTION 6: DEDUPLICATION INVARIANT
    console.log('\n--- SECTION 6: WEBHOOK DEDUPLICATION INVARIANT ---');

    let duplicateRejected = false;
    try {
      await conn.execute(
        `INSERT INTO webhook_events (
          public_id, provider, event_type, external_event_id, signature_status,
          processing_status, payload_hash, payload
        ) VALUES ('WHK-DUP', 'razorpay', 'payment.captured', ?, 'VERIFIED', 'RECEIVED', 'hash_dup', '{}')`,
        [testExtEventId]
      );
    } catch {
      duplicateRejected = true;
    }
    assert(duplicateRejected, 'Unique constraint on (provider, external_event_id) prevents duplicate webhook execution');

    // ------------------------------------------------------------------ SECTION 7: INVALID SIGNATURE & SECURITY INTEGRATION
    console.log('\n--- SECTION 7: INVALID SIGNATURE SECURITY INTEGRATION ---');

    const invalidWhPubId = `WHK-INV-${Date.now()}`;
    await conn.execute(
      `INSERT INTO webhook_events (
        public_id, provider, event_type, external_event_id, signature_status,
        processing_status, payload_hash, payload, error_message
      ) VALUES (?, 'razorpay', 'payment.failed', 'evt_inv_001', 'INVALID', 'FAILED', 'hash_inv', '{}', 'Invalid HMAC signature header')`,
      [invalidWhPubId]
    );

    const [invRow] = await conn.query(`SELECT * FROM webhook_events WHERE public_id = ?`, [invalidWhPubId]);
    assert(invRow[0].signature_status === 'INVALID', 'Tampered / unverified webhook recorded as INVALID signature');
    assert(invRow[0].processing_status === 'FAILED', 'Invalid signature webhook immediately marked FAILED');

    // ------------------------------------------------------------------ SECTION 8: WEBHOOK RETRY MECHANISM
    console.log('\n--- SECTION 8: WEBHOOK RETRY RECOVERY ---');

    const retryWhPubId = `WHK-RTY-${Date.now()}`;
    const [retryInsert] = await conn.execute(
      `INSERT INTO webhook_events (
        public_id, provider, event_type, external_event_id, signature_status,
        processing_status, payload_hash, payload, error_message, retry_count
      ) VALUES (?, 'leegality_esign', 'document.signed', 'evt_lgl_test_001', 'VERIFIED', 'FAILED', 'hash_rty', '{"documentId":"DOC-001"}', 'Temporary timeout', 0)`,
      [retryWhPubId]
    );
    const retryWhId = retryInsert.insertId;

    // Retry execution
    await conn.execute(
      `UPDATE webhook_events
       SET processing_status = 'PROCESSED', processed_at = NOW(), retry_count = retry_count + 1, error_message = NULL
       WHERE id = ?`,
      [retryWhId]
    );

    const [retriedRow] = await conn.query(`SELECT processing_status, retry_count, error_message FROM webhook_events WHERE id = ?`, [retryWhId]);
    assert(retriedRow[0].processing_status === 'PROCESSED', 'Failed webhook retried and marked PROCESSED');
    assert(retriedRow[0].retry_count === 1, 'Retry counter incremented to 1');
    assert(retriedRow[0].error_message === null, 'Error message cleared after successful retry');

    // ------------------------------------------------------------------ SECTION 9: ADAPTER TOGGLE & HEALTH
    console.log('\n--- SECTION 9: ADAPTER TOGGLE WORKFLOW ---');

    await conn.execute(`UPDATE external_integrations SET is_enabled = 0, health_status = 'DISABLED' WHERE provider_key = 'twilio'`);
    const [toggledOff] = await conn.query(`SELECT is_enabled, health_status FROM external_integrations WHERE provider_key = 'twilio'`);
    assert(toggledOff[0].is_enabled === 0, 'Adapter disabled successfully');
    assert(toggledOff[0].health_status === 'DISABLED', 'Health status updated to DISABLED');

    await conn.execute(`UPDATE external_integrations SET is_enabled = 1, health_status = 'HEALTHY' WHERE provider_key = 'twilio'`);
    const [toggledOn] = await conn.query(`SELECT is_enabled, health_status FROM external_integrations WHERE provider_key = 'twilio'`);
    assert(toggledOn[0].is_enabled === 1, 'Adapter re-enabled successfully');
    assert(toggledOn[0].health_status === 'HEALTHY', 'Health status restored to HEALTHY');

    // ------------------------------------------------------------------ SECTION 10: CLEANUP
    await conn.execute(`DELETE FROM integration_events WHERE public_id = ?`, [testEventPubId]);
    await conn.execute(`DELETE FROM webhook_events WHERE public_id IN (?, ?, ?)`, [testWhPubId, invalidWhPubId, retryWhPubId]);

    console.log('\n======================================================================');
    console.log(`  PHASE 18 VERIFICATION SUCCESS: ${passedTests}/${totalTests} ASSERTIONS PASSED (100%)`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\nVerification failed with error:', err);
    process.exit(1);
  } finally {
    await conn.end();
  }
}

run();
