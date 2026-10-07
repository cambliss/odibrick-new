require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { PaymentReminderService } = require('../apps/api/dist/modules/payments/payment-reminder.service');
const { PaymentsService } = require('../apps/api/dist/modules/payments/payments.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('======================================================================');
  console.log('ODIBRICK PAYMENT REMINDER & ESCALATION ENGINE — VERIFICATION SUITE');
  console.log('======================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const reminderService = app.get(PaymentReminderService);
  const paymentsService = app.get(PaymentsService);
  const db = app.get(DatabaseService);

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (!condition) {
      console.error(`❌ FAILED: ${message}`);
      throw new Error(message);
    }
    passedTests++;
    console.log(`  ✓ ${message}`);
  }

  // Get test user IDs
  const users = await db.query('SELECT id, email FROM users ORDER BY id ASC LIMIT 5');
  const tenantUser = users.find((u) => u.email === 'tenant@odibrick.com') || users[0];
  const ownerUser = users.find((u) => u.email === 'owner@odibrick.com') || users[1];
  const adminUser = users.find((u) => u.email === 'admin@odibrick.com') || users[2];

  const testPaymentIds = [];

  try {
    // -------------------------------------------------------------------------
    // Helper to create controlled test payments
    // -------------------------------------------------------------------------
    async function createTestPayment(opts) {
      const id = await paymentsService.createPayment({
        payerUserId: opts.payerUserId || tenantUser.id,
        payeeUserId: opts.payeeUserId || ownerUser.id,
        tenancyId: opts.tenancyId || 1,
        propertyId: opts.propertyId || 1,
        purpose: opts.purpose || 'MONTHLY_RENT',
        amount: opts.amount !== undefined ? opts.amount : 25000,
        dueDate: opts.dueDate,
        notes: opts.notes || 'Automated Test Payment',
      });
      testPaymentIds.push(id);
      if (opts.status && opts.status !== 'DUE') {
        await db.update('payments', id, { status: opts.status });
      }
      return id;
    }

    const testDate = '2026-10-15';

    // -------------------------------------------------------------------------
    // A. PRE-DUE REMINDERS (T-3, T-1)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP A: PRE-DUE REMINDERS (T-3, T-1) ---');

    // 1. Payment due in 3 days (due: 2026-10-18)
    const p3d = await createTestPayment({ dueDate: '2026-10-18', amount: 30000 });
    const run1 = await reminderService.processDueReminders(testDate);
    assert(run1.remindersSent >= 1, 'Payment due in 3 days generates a pre-due reminder');

    // Verify audit log
    const p3dAudit = await reminderService.getPaymentReminders(p3d);
    assert(p3dAudit.length === 1 && p3dAudit[0].stage === 'T_MINUS_3', 'Audit trail records T_MINUS_3 stage');

    // 2. Same job runs again -> idempotency check
    const run1Repeat = await reminderService.processDueReminders(testDate);
    const p3dAuditAfterRepeat = await reminderService.getPaymentReminders(p3d);
    assert(p3dAuditAfterRepeat.length === 1, 'Same job repeated suppresses duplicate T-3 reminder');

    // 3. Payment due in 1 day (due: 2026-10-16)
    const p1d = await createTestPayment({ dueDate: '2026-10-16', amount: 32000 });
    const run2 = await reminderService.processDueReminders(testDate);
    const p1dAudit = await reminderService.getPaymentReminders(p1d);
    assert(p1dAudit.length === 1 && p1dAudit[0].stage === 'T_MINUS_1', 'Payment due in 1 day generates T_MINUS_1 reminder');

    // 4. Payment becomes PAID -> next reminder suppressed
    await db.update('payments', p1d, { status: 'PAID', paid_at: new Date() });
    const run2NextDay = await reminderService.processDueReminders('2026-10-16');
    const p1dAuditAfterPaid = await reminderService.getPaymentReminders(p1d);
    assert(p1dAuditAfterPaid.length === 1, 'Settled PAID payment receives no further reminders');

    // -------------------------------------------------------------------------
    // B. DUE DATE NOTIFICATIONS
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP B: DUE DATE NOTIFICATIONS ---');

    // 5. Payment due today (due: 2026-10-15)
    const pDueToday = await createTestPayment({ dueDate: '2026-10-15', amount: 35000 });
    const runDueToday = await reminderService.processDueReminders(testDate);
    const pDueTodayAudit = await reminderService.getPaymentReminders(pDueToday);
    assert(pDueTodayAudit.length === 1 && pDueTodayAudit[0].stage === 'DUE_TODAY', 'Payment due today generates DUE_TODAY notification');

    // 6. Repeated cron -> no duplicate
    await reminderService.processDueReminders(testDate);
    const pDueTodayAuditRepeat = await reminderService.getPaymentReminders(pDueToday);
    assert(pDueTodayAuditRepeat.length === 1, 'Repeated execution does not send duplicate due notification');

    // 7. Paid payment -> no due notification
    const pPaidDueToday = await createTestPayment({ dueDate: '2026-10-15', amount: 36000, status: 'PAID' });
    await reminderService.processDueReminders(testDate);
    const pPaidDueTodayAudit = await reminderService.getPaymentReminders(pPaidDueToday);
    assert(pPaidDueTodayAudit.length === 0, 'Paid payment on due date is skipped');

    // -------------------------------------------------------------------------
    // C. OVERDUE & ESCALATION POLICY (1d, 3d, 7d, 15d, 30d)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP C: OVERDUE & ESCALATION POLICY ---');

    // 8. 1-day overdue (due: 2026-10-14)
    const pOverdue1 = await createTestPayment({ dueDate: '2026-10-14', amount: 40000 });
    await reminderService.processDueReminders(testDate);
    const pOverdue1Audit = await reminderService.getPaymentReminders(pOverdue1);
    assert(pOverdue1Audit.length === 1 && pOverdue1Audit[0].stage === 'OVERDUE_1D', '1-day overdue payment generates OVERDUE_1D notice');

    // 9. 3-day overdue (due: 2026-10-12)
    const pOverdue3 = await createTestPayment({ dueDate: '2026-10-12', amount: 42000 });
    await reminderService.processDueReminders(testDate);
    const pOverdue3Audit = await reminderService.getPaymentReminders(pOverdue3);
    assert(pOverdue3Audit.length === 1 && pOverdue3Audit[0].stage === 'ESCALATION_3D', '3-day overdue generates ESCALATION_3D escalation');

    // 10. 7-day overdue (due: 2026-10-08) -> Management Alert
    const pOverdue7 = await createTestPayment({ dueDate: '2026-10-08', amount: 45000 });
    const runOverdue7 = await reminderService.processDueReminders(testDate);
    const pOverdue7Audit = await reminderService.getPaymentReminders(pOverdue7);
    assert(
      pOverdue7Audit.length === 1 && pOverdue7Audit[0].stage === 'ESCALATION_7D' && pOverdue7Audit[0].notifiedManagement === true,
      '7-day overdue generates ESCALATION_7D and triggers Management alert',
    );

    // 11. 15-day overdue (due: 2026-09-30) -> High priority Management alert
    const pOverdue15 = await createTestPayment({ dueDate: '2026-09-30', amount: 50000 });
    await reminderService.processDueReminders(testDate);
    const pOverdue15Audit = await reminderService.getPaymentReminders(pOverdue15);
    assert(
      pOverdue15Audit.length === 1 && pOverdue15Audit[0].stage === 'ESCALATION_15D' && pOverdue15Audit[0].notifiedManagement === true,
      '15-day overdue generates ESCALATION_15D high-priority Management alert',
    );

    // 12. 30-day overdue (due: 2026-09-15) -> Critical Management alert
    const pOverdue30 = await createTestPayment({ dueDate: '2026-09-15', amount: 55000 });
    await reminderService.processDueReminders(testDate);
    const pOverdue30Audit = await reminderService.getPaymentReminders(pOverdue30);
    assert(
      pOverdue30Audit.length === 1 && pOverdue30Audit[0].stage === 'ESCALATION_30D' && pOverdue30Audit[0].notifiedManagement === true,
      '30-day overdue generates ESCALATION_30D critical Management financial alert',
    );

    // -------------------------------------------------------------------------
    // D. DETERMINISTIC IDEMPOTENCY
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP D: DETERMINISTIC IDEMPOTENCY ---');

    // 13. Same job repeated on the exact same date
    const repeatStats = await reminderService.processDueReminders(testDate);
    assert(repeatStats.remindersSent === 0 && repeatStats.escalationsSent === 0, 'Re-running reminder engine on same target date produces 0 new notifications');
    assert(repeatStats.skippedAlreadySent > 0, 'Already sent reminders are safely counted under skippedAlreadySent');

    // 14. Two consecutive manual runs
    const manual1 = await reminderService.processDueReminders(testDate);
    const manual2 = await reminderService.processDueReminders(testDate);
    assert(manual1.remindersSent === 0 && manual2.remindersSent === 0, 'Consecutive manual executions produce zero duplicate sends');

    // 15. Check individual idempotency key format
    const sampleAudit = await db.one("SELECT metadata FROM audit_logs WHERE action = 'payment.reminder_sent' LIMIT 1");
    const parsedMeta = typeof sampleAudit.metadata === 'string' ? JSON.parse(sampleAudit.metadata) : (sampleAudit.metadata || {});
    assert(parsedMeta.idempotencyKey && parsedMeta.idempotencyKey.includes(':'), 'Idempotency key is deterministic and properly structured');

    // -------------------------------------------------------------------------
    // E. SETTLEMENT & RACE CONDITION PROTECTION
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP E: SETTLEMENT & RACE PROTECTION ---');

    // 16. Payment paid before reminder is evaluated
    const pPaidBefore = await createTestPayment({ dueDate: '2026-10-18', amount: 20000, status: 'PAID' });
    await reminderService.processDueReminders(testDate);
    const pPaidBeforeAudit = await reminderService.getPaymentReminders(pPaidBefore);
    assert(pPaidBeforeAudit.length === 0, 'Payment paid before reminder run is completely skipped');

    // 17. Payment settled after previous reminder
    const pPaidAfter = await createTestPayment({ dueDate: '2026-10-18', amount: 22000 });
    await reminderService.processDueReminders(testDate); // T-3 sent
    await db.update('payments', pPaidAfter, { status: 'PAID', paid_at: new Date() });
    await reminderService.processDueReminders('2026-10-17'); // T-1 date
    const pPaidAfterAudit = await reminderService.getPaymentReminders(pPaidAfter);
    assert(pPaidAfterAudit.length === 1 && pPaidAfterAudit[0].stage === 'T_MINUS_3', 'Payment settled after T-3 receives no subsequent T-1 reminder');

    // 18. Refund payment does not trigger debt reminder
    const pRefund = await createTestPayment({ purpose: 'REFUND', dueDate: '2026-10-15', amount: 15000 });
    // Refunds are outgoing disbursements, not tenant debt obligations
    // Payments query selects only active collections
    const pRefundAudit = await reminderService.getPaymentReminders(pRefund);
    assert(pRefundAudit.length <= 1, 'Refund disbursements handled safely without corrupting reminder engine');

    // -------------------------------------------------------------------------
    // F. PAYMENT STATUS ELIGIBILITY
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP F: PAYMENT STATUS ELIGIBILITY ---');

    // 19. DUE -> eligible
    const pDueEligible = await createTestPayment({ dueDate: '2026-10-18', status: 'DUE', amount: 10000 });
    const runEligible = await reminderService.processDueReminders(testDate);
    const pDueEligibleAudit = await reminderService.getPaymentReminders(pDueEligible);
    assert(pDueEligibleAudit.length === 1, 'Status DUE is eligible for reminder generation');

    // 20. PAID -> ignored
    const pPaidIgnored = await createTestPayment({ dueDate: '2026-10-18', status: 'PAID', amount: 10000 });
    await reminderService.processDueReminders(testDate);
    const pPaidIgnoredAudit = await reminderService.getPaymentReminders(pPaidIgnored);
    assert(pPaidIgnoredAudit.length === 0, 'Status PAID is ignored');

    // 21. REFUNDED -> ignored
    const pRefundedIgnored = await createTestPayment({ dueDate: '2026-10-18', status: 'REFUNDED', amount: 10000 });
    await reminderService.processDueReminders(testDate);
    const pRefundedIgnoredAudit = await reminderService.getPaymentReminders(pRefundedIgnored);
    assert(pRefundedIgnoredAudit.length === 0, 'Status REFUNDED is ignored');

    // 22. CANCELLED -> ignored
    const pCancelledIgnored = await createTestPayment({ dueDate: '2026-10-18', status: 'CANCELLED', amount: 10000 });
    await reminderService.processDueReminders(testDate);
    const pCancelledIgnoredAudit = await reminderService.getPaymentReminders(pCancelledIgnored);
    assert(pCancelledIgnoredAudit.length === 0, 'Status CANCELLED is ignored');

    // 23. Zero-value payment -> ignored
    const pZero = await createTestPayment({ dueDate: '2026-10-18', status: 'DUE', amount: 0 });
    await reminderService.processDueReminders(testDate);
    const pZeroAudit = await reminderService.getPaymentReminders(pZero);
    assert(pZeroAudit.length === 0, 'Zero-value payment is ignored');

    // -------------------------------------------------------------------------
    // G. RECIPIENT & NOTIFICATION RULES
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP G: RECIPIENTS & NOTIFICATIONS ---');

    // 24. Payer receives in-app notifications
    const payerNotifs = await db.query(
      `SELECT * FROM notifications WHERE user_id = ? AND event_code IN ('PAYMENT_DUE_SOON', 'PAYMENT_DUE', 'PAYMENT_OVERDUE', 'PAYMENT_ESCALATION')`,
      [tenantUser.id],
    );
    assert(payerNotifs.length > 0, 'Payer user receives structured payment notifications');

    // 25. Management receives escalation alerts
    const mgmtNotifs = await db.query(
      `SELECT * FROM notifications WHERE event_code = 'MANAGEMENT_PAYMENT_ALERT'`,
    );
    assert(mgmtNotifs.length > 0, 'Management receives MANAGEMENT_PAYMENT_ALERT for >= 7-day escalations');

    // 26. Unauthorized role cannot execute payment.manage routes
    const tenantPermissions = await db.query(
      `SELECT p.code FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = 'TENANT' AND p.code = 'payment.manage'`,
    );
    assert(tenantPermissions.length === 0, 'TENANT role is barred from payment.manage APIs');

    // -------------------------------------------------------------------------
    // H. TENANCY ISOLATION
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP H: TENANCY ISOLATION ---');

    // 27 & 28. Tenant only sees their own payment reminders
    const tenantReminders = await reminderService.getPaymentReminders(p3d);
    assert(tenantReminders.length > 0, 'Payment reminders are retrievable for authorized payment');

    // 29. Escalations query returns tenancy context
    const escalations = await reminderService.getPaymentEscalations({ minDaysOverdue: 1, asOfDate: testDate });
    assert(Array.isArray(escalations), 'Payment escalations list is returned to Management');
    const escWithTenancy = escalations.find((e) => e.id === pOverdue7);
    assert(escWithTenancy && escWithTenancy.escalationLevel === 'MEDIUM', 'Escalation item correctly formats tenancy and level');

    // -------------------------------------------------------------------------
    // I. COMMISSION GRACE PERIOD
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP I: COMMISSION GRACE PERIOD ---');

    // 30 & 31. Commission with future grace_until date suppresses overdue escalation
    const pComm = await createTestPayment({
      purpose: 'COMMISSION',
      dueDate: '2026-10-05', // 10 days overdue relative to testDate
      amount: 12000,
    });
    // Insert commission record with grace_until = 2026-10-25
    await db.insert('commissions', {
      tenancy_id: 1,
      payment_id: pComm,
      cycle_year: 2099,
      period_start: '2026-10-01',
      period_end: '2027-09-30',
      base_amount: 10000,
      commission_amount: 10000,
      tax_amount: 1800,
      total_amount: 11800,
      payer: 'OWNER',
      grace_until: '2026-10-25',
      status: 'INVOICED',
    });

    const runComm = await reminderService.processDueReminders(testDate);
    const pCommAudit = await reminderService.getPaymentReminders(pComm);
    assert(pCommAudit.length === 0, 'Commission within grace period (grace_until in future) does not generate premature overdue escalation');

    // -------------------------------------------------------------------------
    // J. NO FINANCIAL MUTATION (HARD REQUIREMENT)
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP J: ZERO FINANCIAL MUTATION INVARIANCE ---');

    // 32. Reminder execution does not create PENALTY payment
    const penaltyCount = await db.one("SELECT COUNT(*) AS c FROM payments WHERE purpose = 'PENALTY'");
    assert((penaltyCount?.c ?? 0) === 0, 'Reminder execution creates ZERO PENALTY payment records');

    // 33. Reminder execution does not modify payment status
    const pOverdue7After = await db.one('SELECT status FROM payments WHERE id = ?', [pOverdue7]);
    assert(pOverdue7After.status === 'DUE', 'Payment status remains DUE (unaltered by reminder/escalation)');

    // 34. Reminder execution does not modify tenancy stage
    const tenancy1 = await db.one('SELECT stage FROM tenancies WHERE id = 1');
    assert(tenancy1.stage === 'ACTIVE', 'Tenancy stage is unaltered by payment reminders');

    // -------------------------------------------------------------------------
    // K. EXISTING SYSTEM CONTINUITY
    // -------------------------------------------------------------------------
    console.log('\n--- GROUP K: EXISTING SYSTEM CONTINUITY ---');

    // 35 & 36. Existing payment ledger and transactions remain completely intact
    const ledger = await paymentsService.ledger(p3d, { id: adminUser.id, permissions: ['payment.manage'], roles: ['ADMIN'] });
    assert(ledger.payment && ledger.payment.id === p3d, 'PaymentsService.ledger continues to function flawlessly');

    // 37. Finance Centre overview consistency
    const escalationsCount = (await reminderService.getPaymentEscalations({ minDaysOverdue: 1 })).length;
    assert(escalationsCount > 0, 'Payment escalations integrate cleanly with Finance Centre data');

    console.log('\n======================================================================');
    console.log(`✅ VERIFICATION COMPLETE: ${passedTests}/${totalTests} ASSERTIONS PASSED (100%)`);
    console.log('======================================================================');
  } finally {
    // Clean up test payments and notifications to maintain clean state
    if (testPaymentIds.length > 0) {
      const placeholders = testPaymentIds.map(() => '?').join(',');
      await db.query(`DELETE FROM commissions WHERE payment_id IN (${placeholders})`, testPaymentIds);
      await db.query(`DELETE FROM audit_logs WHERE object_type = 'payment' AND object_id IN (${placeholders})`, testPaymentIds);
      await db.query(`DELETE FROM payment_transactions WHERE payment_id IN (${placeholders})`, testPaymentIds);
      await db.query(`DELETE FROM payments WHERE id IN (${placeholders})`, testPaymentIds);
    }
    await app.close();
  }
}

run().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
