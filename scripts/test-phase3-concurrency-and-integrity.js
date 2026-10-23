/**
 * Phase 3 Independent Database Concurrency, Integrity & Transaction Test Suite
 *
 * Runs against the local development/test database (127.0.0.1:3307, database: odibrick).
 * Never runs against production.
 *
 * Test Scenarios:
 * 1. Reference sequence generation under high concurrency (20 simultaneous workers)
 * 2. Tenancy double-booking prevention under concurrent application decisions
 * 3. Financial idempotency & atomic state transitions under duplicate callbacks & offline settlements
 * 4. Transaction rollback verification under injected failure (zero partial records)
 * 5. Database CHECK constraints and Foreign Key integrity enforcement
 */

const mysql = require('mysql2/promise');

const DB_CONFIG = {
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'cambliss@123',
  database: 'odibrick',
};

async function createPool() {
  return mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 25,
    queueLimit: 0,
  });
}

function formatReference(prefix, seq, year = new Date().getFullYear()) {
  return `ODB-${prefix}-${year}-${String(seq).padStart(6, '0')}`;
}

async function runTests() {
  const pool = await createPool();
  console.log('================================================================');
  console.log('Phase 3 Real Database Concurrency & Integrity Test Suite');
  console.log(`Connected to Local Database: ${DB_CONFIG.host}:${DB_CONFIG.port}/${DB_CONFIG.database}`);
  console.log('================================================================\n');

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    details: [],
  };

  function assert(condition, message) {
    results.total++;
    if (condition) {
      results.passed++;
      console.log(`  [PASS] ${message}`);
      results.details.push({ test: message, passed: true });
    } else {
      results.failed++;
      console.error(`  [FAIL] ${message}`);
      results.details.push({ test: message, passed: false });
    }
  }

  try {
    // ------------------------------------------------------------------
    // TEST 1: Reference Sequence Generator Tests
    // ------------------------------------------------------------------
    console.log('--- 1. Testing Reference Sequence Generator (First-Use, Isolation & Concurrency) ---');

    // 1A. First-use behavior on a brand new sequence name + immunity to connection LAST_INSERT_ID pollution
    const firstUseSeqName = `TEST_FIRST_USE_${Date.now()}`;
    const conn1 = await pool.getConnection();
    try {
      // Simulate prior auto-increment insert pollution on this connection
      await conn1.execute('SELECT LAST_INSERT_ID(9999)');

      // First call on non-existent sequence name
      await conn1.execute(
        `INSERT INTO reference_sequences (sequence_name, current_value)
         VALUES (?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(current_value + 1)`,
        [firstUseSeqName]
      );
      const [r1] = await conn1.execute('SELECT LAST_INSERT_ID() AS val');
      const val1 = Number(r1[0].val);

      // Second call on same sequence
      await conn1.execute(
        `INSERT INTO reference_sequences (sequence_name, current_value)
         VALUES (?, LAST_INSERT_ID(1))
         ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(current_value + 1)`,
        [firstUseSeqName]
      );
      const [r2] = await conn1.execute('SELECT LAST_INSERT_ID() AS val');
      const val2 = Number(r2[0].val);

      assert(val1 === 1, `First-use call returned exactly 1 (unpolluted by connection prior ID 9999)`);
      assert(val2 === 2, `Second-use call returned exactly 2 (monotonically incremented)`);
    } finally {
      await conn1.execute('DELETE FROM reference_sequences WHERE sequence_name = ?', [firstUseSeqName]);
      conn1.release();
    }

    // 1B. Concurrent first-use: 10 workers simultaneously inserting a non-existent sequence
    const concFirstUseSeq = `TEST_CONC_FIRST_USE_${Date.now()}`;
    const firstUseWorkers = [];
    for (let i = 0; i < 10; i++) {
      firstUseWorkers.push(
        (async () => {
          const conn = await pool.getConnection();
          try {
            await conn.execute('SELECT LAST_INSERT_ID(7777)');
            await conn.execute(
              `INSERT INTO reference_sequences (sequence_name, current_value)
               VALUES (?, LAST_INSERT_ID(1))
               ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(current_value + 1)`,
              [concFirstUseSeq]
            );
            const [rows] = await conn.execute('SELECT LAST_INSERT_ID() AS val');
            return Number(rows[0].val);
          } finally {
            conn.release();
          }
        })()
      );
    }
    const firstUseResults = await Promise.all(firstUseWorkers);
    const sortedFirstUse = [...firstUseResults].sort((a, b) => a - b);
    const uniqueFirstUse = new Set(firstUseResults);

    assert(uniqueFirstUse.size === 10, 'Concurrent first-use generated 10 strictly unique sequence numbers');
    assert(sortedFirstUse[0] === 1 && sortedFirstUse[9] === 10, 'Concurrent first-use values are consecutive 1 through 10');

    await pool.execute('DELETE FROM reference_sequences WHERE sequence_name = ?', [concFirstUseSeq]);

    // 1C. High-concurrency on an existing sequence (20 simultaneous workers)
    const WORKER_COUNT = 20;
    const seqPromises = [];

    for (let i = 0; i < WORKER_COUNT; i++) {
      seqPromises.push(
        (async () => {
          const conn = await pool.getConnection();
          try {
            await conn.execute(
              `INSERT INTO reference_sequences (sequence_name, current_value)
               VALUES ('TEST_CONCURRENCY', LAST_INSERT_ID(1))
               ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(current_value + 1)`
            );
            const [rows] = await conn.execute('SELECT LAST_INSERT_ID() AS val');
            const seqVal = Number(rows[0].val);
            const refCode = formatReference('TEST', seqVal);
            return { seqVal, refCode };
          } finally {
            conn.release();
          }
        })()
      );
    }

    const generatedRefs = await Promise.all(seqPromises);
    const uniqueVals = new Set(generatedRefs.map((r) => r.seqVal));
    const uniqueRefs = new Set(generatedRefs.map((r) => r.refCode));

    assert(
      generatedRefs.length === WORKER_COUNT,
      `All ${WORKER_COUNT} concurrent sequence requests completed`
    );
    assert(
      uniqueVals.size === WORKER_COUNT,
      `All ${WORKER_COUNT} sequence values are strictly unique`
    );
    assert(
      uniqueRefs.size === WORKER_COUNT,
      `All ${WORKER_COUNT} formatted references (ODB-TEST-YYYY-XXXXXX) are strictly unique`
    );

    // Clean up test sequence
    await pool.execute("DELETE FROM reference_sequences WHERE sequence_name = 'TEST_CONCURRENCY'");

    // ------------------------------------------------------------------
    // TEST 2: Tenancy Double-Booking Prevention under Concurrent Decisions
    // ------------------------------------------------------------------
    console.log('\n--- 2. Testing Tenancy Double-Booking Concurrency Protection ---');

    const timestamp = Date.now();
    const [propRes] = await pool.execute(
      `INSERT INTO properties (
        public_id, slug, listed_by_user_id, listed_by_role, title, property_type,
        rent_amount, security_deposit, status, address_line1, locality, city, state, pincode
      ) VALUES (
        ?, ?, 1, 'OWNER', 'Concurrency Test Apartment', 'APARTMENT',
        35000, 100000, 'ACTIVE', '42 Test Lane', 'Koramangala', 'Bengaluru', 'Karnataka', '560034'
      )`,
      [`PROP_CONC_${timestamp}`, `prop-conc-${timestamp}`]
    );
    const testPropId = propRes.insertId;

    const [app1Res] = await pool.execute(
      `INSERT INTO applications (
        public_id, property_id, tenant_user_id, status, offered_rent, offered_deposit
      ) VALUES (?, ?, 1, 'SUBMITTED', 35000, 100000)`,
      [`APP_CONC_1_${timestamp}`, testPropId]
    );
    const app1Id = app1Res.insertId;

    const [app2Res] = await pool.execute(
      `INSERT INTO applications (
        public_id, property_id, tenant_user_id, status, offered_rent, offered_deposit
      ) VALUES (?, ?, 2, 'SUBMITTED', 36000, 100000)`,
      [`APP_CONC_2_${timestamp}`, testPropId]
    );
    const app2Id = app2Res.insertId;

    // Simulate two concurrent requests deciding on competing applications simultaneously
    async function simulateDecideApplication(applicationId, deciderUserId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        // 1. Lock property row FOR UPDATE
        const [propRows] = await conn.execute(
          'SELECT id, status FROM properties WHERE id = ? FOR UPDATE',
          [testPropId]
        );
        if (!propRows.length) throw new Error('Property not found');

        // 2. Lock application row FOR UPDATE
        const [appRows] = await conn.execute(
          'SELECT id, status FROM applications WHERE id = ? FOR UPDATE',
          [applicationId]
        );
        if (!appRows.length || !['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'].includes(appRows[0].status)) {
          throw new Error('409_CONFLICT: This application has already been decided.');
        }

        // 3. Check for existing active tenancy FOR UPDATE
        const [existingActive] = await conn.execute(
          `SELECT id, public_id, stage FROM tenancies WHERE property_id = ? AND stage NOT IN ('CLOSED', 'CANCELLED') LIMIT 1 FOR UPDATE`,
          [testPropId]
        );
        if (existingActive.length > 0) {
          throw new Error(`409_CONFLICT: Property already has an active tenancy (${existingActive[0].public_id}) in stage ${existingActive[0].stage}.`);
        }

        // 4. Update application status
        await conn.execute(
          "UPDATE applications SET status = 'ACCEPTED', decided_by = ?, decided_at = NOW() WHERE id = ?",
          [deciderUserId, applicationId]
        );

        // 5. Reject competing applications
        await conn.execute(
          `UPDATE applications SET status = 'REJECTED', decision_note = 'Another applicant was selected.'
           WHERE property_id = ? AND id <> ? AND status IN ('SUBMITTED','UNDER_REVIEW','SHORTLISTED')`,
          [testPropId, applicationId]
        );

        // 6. Insert new tenancy
        const [tenRes] = await conn.execute(
          `INSERT INTO tenancies (
            public_id, property_id, application_id, owner_user_id, tenant_user_id,
            stage, rent_amount, deposit_amount
          ) VALUES (?, ?, ?, 1, 1, 'LEGAL_REVIEW', 35000, 100000)`,
          [`TEN_CONC_${applicationId}_${timestamp}`, testPropId, applicationId]
        );

        // 7. Update property to PAUSED
        await conn.execute("UPDATE properties SET status = 'PAUSED' WHERE id = ?", [testPropId]);

        await conn.commit();
        return { success: true, tenancyId: tenRes.insertId };
      } catch (err) {
        await conn.rollback();
        return { success: false, error: err.message };
      } finally {
        conn.release();
      }
    }

    // Execute concurrently
    const [outcome1, outcome2] = await Promise.all([
      simulateDecideApplication(app1Id, 1),
      simulateDecideApplication(app2Id, 1),
    ]);

    const successes = [outcome1, outcome2].filter((o) => o.success);
    const conflicts = [outcome1, outcome2].filter((o) => !o.success && o.error.includes('409_CONFLICT'));

    assert(successes.length === 1, 'Exactly one concurrent application decision succeeded');
    assert(conflicts.length === 1, 'The competing concurrent decision was safely rejected with 409 Conflict');

    // Verify persisted database state
    const [persistedTenancies] = await pool.execute(
      'SELECT id, stage, property_id FROM tenancies WHERE property_id = ?',
      [testPropId]
    );
    assert(persistedTenancies.length === 1, 'Exactly 1 tenancy row was created for the property');

    const [persistedApps] = await pool.execute(
      'SELECT id, status FROM applications WHERE property_id = ? ORDER BY id ASC',
      [testPropId]
    );
    const acceptedCount = persistedApps.filter((a) => a.status === 'ACCEPTED').length;
    const rejectedCount = persistedApps.filter((a) => a.status === 'REJECTED').length;
    assert(acceptedCount === 1, 'Exactly 1 application status is ACCEPTED');
    assert(rejectedCount === 1, 'The competing application status is REJECTED');

    const [finalProp] = await pool.execute('SELECT status FROM properties WHERE id = ?', [testPropId]);
    assert(finalProp[0].status === 'PAUSED', 'Property status correctly transitioned to PAUSED');

    // Clean up test tenancy, applications, and property
    await pool.execute('DELETE FROM tenancies WHERE property_id = ?', [testPropId]);
    await pool.execute('DELETE FROM applications WHERE property_id = ?', [testPropId]);
    await pool.execute('DELETE FROM properties WHERE id = ?', [testPropId]);

    // ------------------------------------------------------------------
    // TEST 3: Financial Idempotency & Atomicity
    // ------------------------------------------------------------------
    console.log('\n--- 3. Testing Financial Idempotency & Atomicity ---');

    // 3.1 Concurrent duplicate offline payment confirmations
    const [testPayRes] = await pool.execute(
      `INSERT INTO payments (
        public_id, reference_code, payer_user_id, payee_user_id,
        purpose, amount, tax_amount, total_amount, status, due_date
      ) VALUES (
        ?, ?, 1, 2, 'MONTHLY_RENT', 28000, 0, 28000, 'DUE', CURDATE()
      )`,
      [`PAY_CONC_${timestamp}`, `ODB-PAY-CONC-${timestamp}`]
    );
    const testPayId = testPayRes.insertId;

    async function recordOffline(bankRef) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [payments] = await conn.execute(
          'SELECT * FROM payments WHERE id = ? FOR UPDATE',
          [testPayId]
        );
        if (!payments.length) throw new Error('Payment not found');
        const p = payments[0];
        if (p.status === 'PAID') {
          throw new Error('400_BAD_REQUEST: This payment is already recorded as settled.');
        }

        const idemKey = `manual:${testPayId}:${bankRef}`;
        const [existingTxn] = await conn.execute(
          'SELECT id FROM payment_transactions WHERE idempotency_key = ? LIMIT 1',
          [idemKey]
        );
        if (existingTxn.length > 0) {
          throw new Error('400_BAD_REQUEST: A transaction with this bank reference has already been recorded.');
        }

        await conn.execute(
          `INSERT INTO payment_transactions (
            payment_id, txn_reference, direction, provider, provider_txn_id,
            method, amount, currency, status, idempotency_key
          ) VALUES (?, ?, 'COLLECTION', 'manual', ?, 'NEFT', 28000, 'INR', 'SUCCESS', ?)`,
          [testPayId, `TXN_CONC_${Date.now()}`, bankRef, idemKey]
        );

        await conn.execute(
          "UPDATE payments SET status = 'PAID', paid_at = NOW(), settlement_status = 'SETTLED' WHERE id = ?",
          [testPayId]
        );

        await conn.commit();
        return { success: true };
      } catch (err) {
        await conn.rollback();
        return { success: false, error: err.message };
      } finally {
        conn.release();
      }
    }

    const [off1, off2] = await Promise.all([
      recordOffline('HDFC-NEFT-999888'),
      recordOffline('HDFC-NEFT-999888'),
    ]);

    const offSuccesses = [off1, off2].filter((o) => o.success);
    const offFailures = [off1, off2].filter((o) => !o.success && o.error.includes('400_BAD_REQUEST'));

    assert(offSuccesses.length === 1, 'Exactly one concurrent offline confirmation succeeded');
    assert(offFailures.length === 1, 'The duplicate confirmation was rejected with 400 Bad Request');

    const [persistedTxns] = await pool.execute(
      'SELECT id, status FROM payment_transactions WHERE payment_id = ?',
      [testPayId]
    );
    assert(persistedTxns.length === 1, 'Exactly 1 transaction row was persisted');
    assert(persistedTxns[0].status === 'SUCCESS', 'Transaction status is SUCCESS');

    const [persistedPay] = await pool.execute('SELECT status FROM payments WHERE id = ?', [testPayId]);
    assert(persistedPay[0].status === 'PAID', 'Payment status is PAID');

    // 3.2 Duplicate Provider Webhook Callback Idempotency
    const [provPayRes] = await pool.execute(
      `INSERT INTO payments (
        public_id, reference_code, payer_user_id, payee_user_id,
        purpose, amount, tax_amount, total_amount, status, due_date
      ) VALUES (
        ?, ?, 1, 2, 'MONTHLY_RENT', 30000, 0, 30000, 'INITIATED', CURDATE()
      )`,
      [`PAY_WH_${timestamp}`, `ODB-PAY-WH-${timestamp}`]
    );
    const provPayId = provPayRes.insertId;

    const [initialTxnRes] = await pool.execute(
      `INSERT INTO payment_transactions (
        payment_id, txn_reference, direction, provider, provider_order_id,
        amount, currency, status, idempotency_key
      ) VALUES (?, 'TXN-WH-INIT', 'COLLECTION', 'razorpay', ?, 30000, 'INR', 'CREATED', ?)`,
      [provPayId, `order_test_${timestamp}`, `order:${provPayId}:order_test_${timestamp}`]
    );
    const txnId = initialTxnRes.insertId;

    async function handleWebhookCallback(providerTxnId) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const [txns] = await conn.execute(
          'SELECT * FROM payment_transactions WHERE provider_order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
          [`order_test_${timestamp}`]
        );
        if (!txns.length) throw new Error('Order not found');
        const t = txns[0];

        // Idempotency check: if transaction is already marked SUCCESS
        if (t.status === 'SUCCESS') {
          await conn.commit();
          return { handled: true, duplicate: true };
        }

        const [dupTxn] = await conn.execute(
          'SELECT id FROM payment_transactions WHERE provider_txn_id = ? AND id <> ? LIMIT 1',
          [providerTxnId, t.id]
        );
        if (dupTxn.length > 0) {
          await conn.commit();
          return { handled: true, duplicate: true };
        }

        await conn.execute(
          "UPDATE payment_transactions SET provider_txn_id = ?, status = 'SUCCESS' WHERE id = ?",
          [providerTxnId, t.id]
        );

        await conn.execute(
          "UPDATE payments SET status = 'PAID', paid_at = NOW(), settlement_status = 'SETTLED' WHERE id = ?",
          [provPayId]
        );

        await conn.commit();
        return { handled: true, duplicate: false };
      } catch (err) {
        await conn.rollback();
        return { handled: false, error: err.message };
      } finally {
        conn.release();
      }
    }

    const [wh1, wh2] = await Promise.all([
      handleWebhookCallback(`pay_txn_${timestamp}`),
      handleWebhookCallback(`pay_txn_${timestamp}`),
    ]);

    const whSuccess = [wh1, wh2].filter((w) => w.handled && !w.duplicate);
    const whDup = [wh1, wh2].filter((w) => w.handled && w.duplicate);

    assert(whSuccess.length === 1, 'First webhook callback handled and marked payment SUCCESS');
    assert(whDup.length === 1, 'Duplicate webhook callback detected idempotently (duplicate: true)');

    const [whPayFinal] = await pool.execute('SELECT status FROM payments WHERE id = ?', [provPayId]);
    assert(whPayFinal[0].status === 'PAID', 'Payment final status remains PAID');

    // Clean up
    await pool.execute('DELETE FROM payment_transactions WHERE payment_id IN (?, ?)', [testPayId, provPayId]);
    await pool.execute('DELETE FROM payments WHERE id IN (?, ?)', [testPayId, provPayId]);

    // ------------------------------------------------------------------
    // TEST 4: Transaction Rollback on Failure (Zero Partial Records)
    // ------------------------------------------------------------------
    console.log('\n--- 4. Testing Transaction Rollback on Injected Failure ---');

    const [rbPayRes] = await pool.execute(
      `INSERT INTO payments (
        public_id, reference_code, payer_user_id, payee_user_id,
        purpose, amount, tax_amount, total_amount, status, due_date
      ) VALUES (
        ?, ?, 1, 2, 'MONTHLY_RENT', 15000, 0, 15000, 'DUE', CURDATE()
      )`,
      [`PAY_RB_${timestamp}`, `ODB-PAY-RB-${timestamp}`]
    );
    const rbPayId = rbPayRes.insertId;

    let transactionFailedCleanly = false;
    const connRb = await pool.getConnection();
    try {
      await connRb.beginTransaction();

      // Step 1: Insert transaction
      await connRb.execute(
        `INSERT INTO payment_transactions (
          payment_id, txn_reference, direction, provider, provider_txn_id,
          amount, currency, status, idempotency_key
        ) VALUES (?, 'TXN-RB-WILL-FAIL', 'COLLECTION', 'manual', 'NEFT-FAIL', 15000, 'INR', 'SUCCESS', ?)`,
        [rbPayId, `manual:${rbPayId}:NEFT-FAIL`]
      );

      // Step 2: Inject simulated failure before payment status update
      throw new Error('SIMULATED_DATABASE_FAILURE_MID_TRANSACTION');
    } catch (err) {
      if (err.message === 'SIMULATED_DATABASE_FAILURE_MID_TRANSACTION') {
        transactionFailedCleanly = true;
      }
      await connRb.rollback();
    } finally {
      connRb.release();
    }

    assert(transactionFailedCleanly, 'Controlled failure was injected mid-transaction');

    // Verify rollback: no transaction rows should exist, payment must remain DUE
    const [rbTxnRows] = await pool.execute(
      'SELECT id FROM payment_transactions WHERE payment_id = ?',
      [rbPayId]
    );
    assert(rbTxnRows.length === 0, 'Rollback verified: 0 partial payment_transactions rows persisted');

    const [rbPayFinal] = await pool.execute('SELECT status FROM payments WHERE id = ?', [rbPayId]);
    assert(rbPayFinal[0].status === 'DUE', 'Rollback verified: Payment status remains DUE');

    // Clean up
    await pool.execute('DELETE FROM payments WHERE id = ?', [rbPayId]);

    // ------------------------------------------------------------------
    // TEST 5: Schema CHECK Constraints and Foreign Key Integrity
    // ------------------------------------------------------------------
    console.log('\n--- 5. Testing Schema CHECK & Foreign Key Constraints ---');

    // 5.1 Negative payment amount CHECK constraint
    let chkPayFailed = false;
    try {
      await pool.execute(
        `INSERT INTO payments (
          public_id, reference_code, payer_user_id, payee_user_id,
          purpose, amount, tax_amount, total_amount, status, due_date
        ) VALUES (
          'PAY_NEG_CHK', 'ODB-PAY-NEG', 1, 2, 'MONTHLY_RENT', -100, 0, -100, 'DUE', CURDATE()
        )`
      );
    } catch (err) {
      if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.message.includes('chk_payments_amount') || err.message.toLowerCase().includes('check constraint')) {
        chkPayFailed = true;
      }
    }
    assert(chkPayFailed, 'CHECK constraint (chk_payments_amount) correctly rejected negative payment amount');

    // 5.2 Negative owner payout net_amount CHECK constraint
    let chkPayoutFailed = false;
    try {
      await pool.execute(
        `INSERT INTO owner_payouts (
          public_id, payout_number, owner_user_id, gross_amount, deduction_amount, net_amount, status,
          period_start, period_end
        ) VALUES (
          'PO_NEG_CHK', 'ODB-PAYO-NEG', 1, 1000, 2000, -1000, 'PENDING_REVIEW', CURDATE(), CURDATE()
        )`
      );
    } catch (err) {
      if (err.code === 'ER_CHECK_CONSTRAINT_VIOLATED' || err.message.includes('chk_payouts_net') || err.message.toLowerCase().includes('check constraint')) {
        chkPayoutFailed = true;
      }
    }
    assert(chkPayoutFailed, 'CHECK constraint (chk_payouts_net) correctly rejected negative net_amount');

    // 5.3 Invoices payment_id Uniqueness Constraint (uq_inv_payment)
    const [invPayRes] = await pool.execute(
      `INSERT INTO payments (
        public_id, reference_code, payer_user_id, payee_user_id,
        purpose, amount, tax_amount, total_amount, status, due_date
      ) VALUES (
        'PAY_INV_CHK', 'ODB-PAY-INV-CHK', 1, 2, 'COMMISSION', 4000, 720, 4720, 'PAID', CURDATE()
      )`
    );
    const invPayId = invPayRes.insertId;

    const [firstInv] = await pool.execute(
      `INSERT INTO invoices (
        invoice_number, user_id, payment_id, billing_name, subtotal, total, status, issued_on
      ) VALUES ('ODB-INV-CHK-001', 1, ?, 'Test Payer', 4000, 4720, 'PAID', CURDATE())`,
      [invPayId]
    );

    let uqInvFailed = false;
    try {
      await pool.execute(
        `INSERT INTO invoices (
          invoice_number, user_id, payment_id, billing_name, subtotal, total, status, issued_on
        ) VALUES ('ODB-INV-CHK-002', 1, ?, 'Test Payer', 4000, 4720, 'PAID', CURDATE())`,
        [invPayId]
      );
    } catch (err) {
      if (err.message.includes('uq_inv_payment') || err.message.includes('Duplicate entry')) {
        uqInvFailed = true;
      }
    }
    assert(uqInvFailed, 'Unique constraint (uq_inv_payment) prevented duplicate invoices for same payment');

    // 5.4 Foreign Key Integrity (invoices -> tenancies)
    let fkTenancyFailed = false;
    try {
      await pool.execute(
        `INSERT INTO invoices (
          invoice_number, user_id, tenancy_id, billing_name, subtotal, total, status, issued_on
        ) VALUES ('ODB-INV-FK-TEST', 1, 999999999, 'Test Payer', 1000, 1180, 'PAID', CURDATE())`
      );
    } catch (err) {
      if (err.message.includes('fk_inv_tenancy') || err.message.includes('foreign key constraint fails')) {
        fkTenancyFailed = true;
      }
    }
    assert(fkTenancyFailed, 'Foreign key constraint (fk_inv_tenancy) rejected non-existent tenancy ID');

    // Clean up
    await pool.execute('DELETE FROM invoices WHERE id = ?', [firstInv.insertId]);
    await pool.execute('DELETE FROM payments WHERE id = ?', [invPayId]);

    // ------------------------------------------------------------------
    // FINAL SUMMARY
    // ------------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`Phase 3 Test Execution Complete: ${results.passed}/${results.total} Passed (${results.failed} Failed)`);
    console.log('================================================================\n');

    if (results.failed > 0) {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
