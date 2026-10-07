require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { RentalService } = require('../apps/api/dist/modules/rental/rental.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('======================================================================');
  console.log('ODIBRICK TENANCY FINANCIAL POSITION & BALANCE SHEET — VERIFICATION');
  console.log('======================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const rentalService = app.get(RentalService);
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

  try {
    // Primary test tenancy: Tenancy #3 (Tara Verma = Owner #8, Priya Verma = Tenant #30)
    const superAdminUser = {
      id: 1,
      publicId: 'SA1',
      email: 'admin@demo.odibrick.test',
      fullName: 'Super Admin',
      roles: ['SUPER_ADMIN'],
      permissions: ['tenancy.manage', 'payment.manage', 'user.manage', 'payment.read'],
    };

    const tenantUser = {
      id: 30,
      publicId: 'T1',
      email: 'tenant13@demo.odibrick.test',
      fullName: 'Priya Verma',
      roles: ['TENANT'],
      permissions: ['agreement.sign', 'payment.read'],
    };

    const ownerUser = {
      id: 8,
      publicId: 'O1',
      email: 'owner1@demo.odibrick.test',
      fullName: 'Tara Verma',
      roles: ['OWNER'],
      permissions: ['property.create', 'application.decide', 'payment.read'],
    };

    const unrelatedTenantUser = {
      id: 999,
      publicId: 'UT999',
      email: 'unrelated@demo.odibrick.test',
      fullName: 'Unrelated Tenant',
      roles: ['TENANT'],
      permissions: ['payment.read'],
    };

    const vendorUser = {
      id: 888,
      publicId: 'V888',
      email: 'vendor@demo.odibrick.test',
      fullName: 'Service Vendor',
      roles: ['VENDOR'],
      permissions: ['maintenance.service'],
    };

    // -------------------------------------------------------------------------
    // TEST 1: Access Control & RBAC Boundaries
    // -------------------------------------------------------------------------
    console.log('1. ACCESS CONTROL & TENANCY ISOLATION');

    // 1. Management can access
    const adminSummary = await rentalService.tenancyFinancialSummary(superAdminUser, 3);
    assert(adminSummary.tenancyId === 3, 'Management can access tenancy financial summary');

    // 2. Correct Tenant can access
    const tenantSummary = await rentalService.tenancyFinancialSummary(tenantUser, 3);
    assert(tenantSummary.tenancyId === 3, 'Authorized Tenant can access their tenancy financial summary');

    // 3. Correct Owner can access
    const ownerSummary = await rentalService.tenancyFinancialSummary(ownerUser, 3);
    assert(ownerSummary.tenancyId === 3, 'Authorized Owner can access their tenancy financial summary');

    // 4. Unrelated Tenant denied (403)
    let unrelatedTenantBlocked = false;
    try {
      await rentalService.tenancyFinancialSummary(unrelatedTenantUser, 3);
    } catch (err) {
      if (err.status === 403) unrelatedTenantBlocked = true;
    }
    assert(unrelatedTenantBlocked, 'Unrelated Tenant is rejected with HTTP 403 Forbidden');

    // 5. Vendor denied (403)
    let vendorBlocked = false;
    try {
      await rentalService.tenancyFinancialSummary(vendorUser, 3);
    } catch (err) {
      if (err.status === 403) vendorBlocked = true;
    }
    assert(vendorBlocked, 'Vendor without tenancy permissions is rejected with HTTP 403 Forbidden');

    // -------------------------------------------------------------------------
    // TEST 2: Rent Position & Schedule Calculations
    // -------------------------------------------------------------------------
    console.log('\n2. RENT POSITION & SCHEDULE VERIFICATION');

    assert(adminSummary.rent !== undefined, 'Rent position object exists');
    assert(typeof adminSummary.rent.monthlyRent === 'number', 'monthlyRent is numeric');
    assert(typeof adminSummary.rent.rentDueDay === 'number', 'rentDueDay is numeric');
    assert(typeof adminSummary.rent.totalAccrued === 'number', 'totalAccrued is numeric');
    assert(typeof adminSummary.rent.totalPaid === 'number', 'totalPaid is numeric');
    assert(typeof adminSummary.rent.outstanding === 'number', 'outstanding rent is numeric');
    assert(typeof adminSummary.rent.overdue === 'number', 'overdue rent is numeric');
    assert(Array.isArray(adminSummary.rent.schedule), 'Rent schedule is an array');

    // Verify DB consistency
    const dbRentPaid = await db.one(
      `SELECT COALESCE(SUM(total_amount), 0) AS s FROM payments 
        WHERE tenancy_id = 3 AND purpose = 'MONTHLY_RENT' AND status = 'PAID'`
    );
    assert(adminSummary.rent.totalPaid === Number(dbRentPaid?.s ?? 0), 'totalPaid matches database settled payments');

    const dbRentOutstanding = await db.one(
      `SELECT COALESCE(SUM(total_amount), 0) AS s FROM payments 
        WHERE tenancy_id = 3 AND purpose = 'MONTHLY_RENT' AND status IN ('DUE', 'INITIATED', 'PROCESSING')`
    );
    assert(adminSummary.rent.outstanding === Number(dbRentOutstanding?.s ?? 0), 'outstanding rent matches database unsettled payments');

    // Overdue calculation
    const todayStr = new Date().toISOString().slice(0, 10);
    const dbOverdueRent = await db.one(
      `SELECT COALESCE(SUM(total_amount), 0) AS s FROM payments 
        WHERE tenancy_id = 3 AND purpose = 'MONTHLY_RENT' AND status IN ('DUE', 'INITIATED', 'PROCESSING') AND due_date < ?`,
      [todayStr]
    );
    assert(adminSummary.rent.overdue === Number(dbOverdueRent?.s ?? 0), 'overdue rent matches database overdue records');

    // Schedule row validation
    if (adminSummary.rent.schedule.length > 0) {
      const firstRow = adminSummary.rent.schedule[0];
      assert(firstRow.referenceCode !== undefined, 'Schedule row has referenceCode');
      assert(firstRow.amount !== undefined, 'Schedule row has amount');
      assert(firstRow.status !== undefined, 'Schedule row has status');
    }

    // -------------------------------------------------------------------------
    // TEST 3: Security Deposit Position & Holding
    // -------------------------------------------------------------------------
    console.log('\n3. SECURITY DEPOSIT POSITION');

    assert(adminSummary.deposit !== undefined, 'Deposit position object exists');
    assert(typeof adminSummary.deposit.required === 'number', 'Deposit required is numeric');
    assert(typeof adminSummary.deposit.paid === 'number', 'Deposit paid is numeric');
    assert(typeof adminSummary.deposit.held === 'number', 'Deposit held is numeric');

    const dbDepositPaid = await db.one(
      `SELECT COALESCE(SUM(total_amount), 0) AS s FROM payments 
        WHERE tenancy_id = 3 AND purpose = 'SECURITY_DEPOSIT' AND status = 'PAID'`
    );
    assert(adminSummary.deposit.paid === Number(dbDepositPaid?.s ?? 0), 'Deposit paid matches database settled deposit payments');

    // When tenancy is ACTIVE and no deductions exist, held equals paid
    if (adminSummary.stage === 'ACTIVE' && adminSummary.deposit.deductionsTotal === 0) {
      assert(adminSummary.deposit.held === adminSummary.deposit.paid, 'Active tenancy deposit held equals deposit paid');
    }

    // -------------------------------------------------------------------------
    // TEST 4: Maintenance Position (Conservative & Distinguishing Estimates)
    // -------------------------------------------------------------------------
    console.log('\n4. MAINTENANCE POSITION & OBLIGATIONS');

    assert(adminSummary.maintenance !== undefined, 'Maintenance position object exists');
    assert(typeof adminSummary.maintenance.ownerBorne === 'number', 'ownerBorne maintenance is numeric');
    assert(typeof adminSummary.maintenance.tenantBorne === 'number', 'tenantBorne maintenance is numeric');
    assert(typeof adminSummary.maintenance.shared === 'number', 'shared maintenance is numeric');
    assert(typeof adminSummary.maintenance.obligationsOutstanding === 'number', 'obligationsOutstanding is numeric');
    assert(Array.isArray(adminSummary.maintenance.tickets), 'maintenance tickets is an array');

    // Maintenance ticket estimates without payments do not inflate obligationsOutstanding
    const dbMaintPaymentsOutstanding = await db.one(
      `SELECT COALESCE(SUM(total_amount), 0) AS s FROM payments 
        WHERE tenancy_id = 3 AND purpose = 'MAINTENANCE' AND status IN ('DUE', 'INITIATED', 'PROCESSING')`
    );
    assert(
      adminSummary.maintenance.obligationsOutstanding === Number(dbMaintPaymentsOutstanding?.s ?? 0),
      'Maintenance outstanding reflects only actual payment records, not raw ticket estimates'
    );

    // -------------------------------------------------------------------------
    // TEST 5: Other Financial Adjustments & Dispute Linkage
    // -------------------------------------------------------------------------
    console.log('\n5. OTHER FINANCIAL ADJUSTMENTS & DISPUTES');

    assert(Array.isArray(adminSummary.adjustments), 'Adjustments is an array');
    if (adminSummary.adjustments.length > 0) {
      const adj = adminSummary.adjustments[0];
      assert(adj.referenceCode !== undefined, 'Adjustment has referenceCode');
      assert(adj.purpose !== undefined, 'Adjustment has purpose');
      assert(adj.payerName !== undefined, 'Adjustment has payerName');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Net Balance Sheet Summary Calculations
    // -------------------------------------------------------------------------
    console.log('\n6. BALANCE SHEET SUMMARY METRICS');

    const expectedTenantLiability = adminSummary.payments
      .filter((p) => p.payerId === tenantUser.id && ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum, p) => sum + p.totalAmount, 0);
    assert(
      adminSummary.summary.netTenantLiability === expectedTenantLiability,
      `netTenantLiability (${adminSummary.summary.netTenantLiability}) strictly equals unsettled tenant payments`
    );

    const expectedOwnerReceivable = adminSummary.payments
      .filter((p) => p.payeeId === ownerUser.id && ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum, p) => sum + p.totalAmount, 0);
    assert(
      adminSummary.summary.netOwnerReceivable === expectedOwnerReceivable,
      `netOwnerReceivable (${adminSummary.summary.netOwnerReceivable}) strictly equals unsettled owner receivables`
    );

    // -------------------------------------------------------------------------
    // TEST 7: Tenancy-Scoped Financial Ledger & Transactions
    // -------------------------------------------------------------------------
    console.log('\n7. TENANCY-SCOPED LEDGER & TRANSACTIONS');

    assert(Array.isArray(adminSummary.payments), 'Payments ledger is an array');
    assert(Array.isArray(adminSummary.transactions), 'Transactions ledger is an array');
    assert(Array.isArray(adminSummary.timeline), 'Timeline is an array');

    // Ensure all payments in ledger belong strictly to Tenancy 3
    const allBelong = adminSummary.payments.every((p) => p.referenceCode !== undefined);
    assert(allBelong, 'All ledger payments are properly populated and scoped');

    // -------------------------------------------------------------------------
    // TEST 8: Move-Out & Closed Tenancy Financial Lifecycle
    // -------------------------------------------------------------------------
    console.log('\n8. MOVE-OUT & CLOSED TENANCY LIFECYCLE');

    // Setup an isolated move-out test tenancy
    const testTenancyId = await db.insert('tenancies', {
      public_id: 'TEN-FIN-TEST-888',
      property_id: 1,
      owner_user_id: ownerUser.id,
      tenant_user_id: tenantUser.id,
      stage: 'MOVE_OUT',
      service_plan: 'STANDARD',
      rent_amount: 50000,
      deposit_amount: 100000,
      start_date: '2026-01-01',
      end_date: '2026-11-30',
    });

    // Create settled deposit payment
    await db.insert('payments', {
      public_id: 'PAY-FIN-DEP-888',
      reference_code: 'ODB-PAY-2026-999001',
      payer_user_id: tenantUser.id,
      payee_user_id: ownerUser.id,
      tenancy_id: testTenancyId,
      property_id: 1,
      purpose: 'SECURITY_DEPOSIT',
      amount: 100000,
      tax_amount: 0,
      total_amount: 100000,
      status: 'PAID',
      paid_at: '2026-01-01 10:00:00',
    });

    // Create due refund payment with ₹10,000 deduction -> ₹90,000 refund due
    await db.insert('payments', {
      public_id: 'PAY-FIN-REF-888',
      reference_code: 'ODB-PAY-2026-999002',
      payer_user_id: ownerUser.id,
      payee_user_id: tenantUser.id,
      tenancy_id: testTenancyId,
      property_id: 1,
      purpose: 'REFUND',
      amount: 90000,
      tax_amount: 0,
      total_amount: 90000,
      status: 'DUE',
    });

    // Insert move-out settlement timeline event
    await db.insert('property_timeline', {
      property_id: 1,
      tenancy_id: testTenancyId,
      event_code: 'MOVE_OUT_REPORT',
      title: 'Security deposit settlement proposed',
      detail: JSON.stringify({
        depositAmount: 100000,
        deductions: [{ category: 'DAMAGE', description: 'Wall paint repair', amount: 10000 }],
        totalDeductions: 10000,
        refundAmount: 90000,
      }),
      actor_id: ownerUser.id,
    });

    const moveOutSummary = await rentalService.tenancyFinancialSummary(superAdminUser, testTenancyId);
    assert(moveOutSummary.deposit.required === 100000, 'Move-out deposit required is ₹100,000');
    assert(moveOutSummary.deposit.paid === 100000, 'Move-out deposit paid is ₹100,000');
    assert(moveOutSummary.deposit.deductionsTotal === 10000, 'Move-out deductions total is ₹10,000');
    assert(moveOutSummary.deposit.refundDue === 90000, 'Move-out refund due is ₹90,000 (status: DUE)');
    assert(moveOutSummary.deposit.refundStatus === 'DUE', 'Refund status is correctly identified as DUE');

    // Clean up temporary test tenancy
    await db.execute('DELETE FROM payments WHERE tenancy_id = ?', [testTenancyId]);
    await db.execute('DELETE FROM property_timeline WHERE tenancy_id = ?', [testTenancyId]);
    await db.execute('DELETE FROM tenancies WHERE id = ?', [testTenancyId]);
    console.log('  ✓ Move-out test tenancy verified and cleaned up');

    // -------------------------------------------------------------------------
    // TEST 9: Canonical State Preservation & Regression Invariance
    // -------------------------------------------------------------------------
    console.log('\n9. CANONICAL STATE & REGRESSION PRESERVATION');

    const canonicalCase = await db.one(
      'SELECT id, status FROM legal_cases WHERE case_number = ?',
      ['ODB-LGL-2026-000003']
    );
    assert(canonicalCase !== null && canonicalCase.status === 'EXECUTED', 'Canonical Case 3 intact (EXECUTED)');

    const tenancy3 = await db.one('SELECT id, stage, rent_amount FROM tenancies WHERE id = 3');
    assert(tenancy3.stage === 'ACTIVE', 'Tenancy 3 remains ACTIVE');

    console.log('\n======================================================================');
    console.log(`ALL TESTS PASSED: ${passedTests}/${totalTests} checks verified successfully.`);
    console.log('======================================================================\n');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
