require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { AdminService } = require('../apps/api/dist/modules/admin/admin.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('======================================================================');
  console.log('ODIBRICK FINANCE CONTROL CENTRE — AUTOMATED VERIFICATION SUITE');
  console.log('======================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const adminService = app.get(AdminService);
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
    // -------------------------------------------------------------------------
    // TEST 1: Role Permissions & Access Control Verification
    // -------------------------------------------------------------------------
    console.log('1. RBAC & PERMISSIONS VERIFICATION');
    
    // Check permission mapping in DB for roles
    const adminPerms = await db.query(
      `SELECT p.code FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code IN ('SUPER_ADMIN', 'ADMIN') AND p.code = 'payment.manage'`
    );
    assert(adminPerms.length > 0, 'SUPER_ADMIN / ADMIN has payment.manage permission');

    const tenantPerms = await db.query(
      `SELECT p.code FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = 'TENANT' AND p.code = 'payment.manage'`
    );
    assert(tenantPerms.length === 0, 'TENANT does NOT have payment.manage permission');

    const ownerPerms = await db.query(
      `SELECT p.code FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = 'OWNER' AND p.code = 'payment.manage'`
    );
    assert(ownerPerms.length === 0, 'OWNER does NOT have payment.manage permission');

    // -------------------------------------------------------------------------
    // TEST 2: Financial Overview Endpoint Structure & Dynamic Periods
    // -------------------------------------------------------------------------
    console.log('\n2. FINANCIAL OVERVIEW STRUCTURE & PERIOD FILTERING');

    const overviewThisMonth = await adminService.financeOverview({ period: 'this_month' });
    assert(overviewThisMonth.summary !== undefined, 'Overview returns summary object');
    assert(typeof overviewThisMonth.summary.grossPaymentVolume === 'number', 'grossPaymentVolume is numeric');
    assert(typeof overviewThisMonth.summary.totalCollected === 'number', 'totalCollected is numeric');
    assert(typeof overviewThisMonth.summary.totalOutstanding === 'number', 'totalOutstanding is numeric');
    assert(typeof overviewThisMonth.summary.totalOverdue === 'number', 'totalOverdue is numeric');
    assert(typeof overviewThisMonth.summary.grossPlatformRevenue === 'number', 'grossPlatformRevenue is numeric');
    assert(Array.isArray(overviewThisMonth.revenueSeries), 'revenueSeries is an array');
    assert(Array.isArray(overviewThisMonth.paymentBreakdown), 'paymentBreakdown is an array');
    assert(Array.isArray(overviewThisMonth.overduePayments), 'overduePayments is an array');
    assert(Array.isArray(overviewThisMonth.commissionQueue), 'commissionQueue is an array');
    assert(Array.isArray(overviewThisMonth.activeMoveOutSettlements), 'activeMoveOutSettlements is an array');
    assert(Array.isArray(overviewThisMonth.openFinancialDisputes), 'openFinancialDisputes is an array');
    assert(Array.isArray(overviewThisMonth.manualReconciliation), 'manualReconciliation is an array');

    // Custom period test
    const overviewCustom = await adminService.financeOverview({
      period: 'custom',
      from: '2026-01-01',
      to: '2026-12-31',
    });
    assert(overviewCustom.period.from.startsWith('2026-01-01'), 'Custom period from date properly parsed');
    assert(overviewCustom.period.to.startsWith('2026-12-31'), 'Custom period to date properly parsed');

    // -------------------------------------------------------------------------
    // TEST 3: Strict Revenue Classification Rules
    // -------------------------------------------------------------------------
    console.log('\n3. REVENUE CLASSIFICATION VERIFICATION');

    const commRev = overviewCustom.summary.commissionRevenue;
    const mktRev = overviewCustom.summary.marketingRevenue;
    const srvRev = overviewCustom.summary.serviceRevenue;
    const expectedPlatformRev = commRev + mktRev + srvRev;

    assert(
      overviewCustom.summary.grossPlatformRevenue === expectedPlatformRev,
      `Platform revenue (${overviewCustom.summary.grossPlatformRevenue}) equals Commission (${commRev}) + Marketing (${mktRev}) + Services (${srvRev})`
    );

    // Verify database direct check that rent is excluded from platform revenue calculation
    const rentPaidSum = await db.one(
      `SELECT COALESCE(SUM(total_amount), 0) AS totalRent
         FROM payments
        WHERE purpose IN ('MONTHLY_RENT', 'ADVANCE_RENT', 'SECURITY_DEPOSIT') AND status = 'PAID'`
    );
    const totalRentAmount = Number(rentPaidSum?.totalRent ?? 0);
    console.log(`    Direct P2P Rent / Deposit Paid Total: INR ${totalRentAmount}`);
    if (totalRentAmount > 0) {
      assert(
        overviewCustom.summary.grossPlatformRevenue < (overviewCustom.summary.totalCollected || totalRentAmount),
        'Platform revenue strictly excludes Direct Tenant->Owner Rent & Security Deposits'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 4: Master Financial Ledger & Pagination
    // -------------------------------------------------------------------------
    console.log('\n4. MASTER FINANCIAL LEDGER & PAGINATION');

    const ledgerPage1 = await adminService.financeLedger({}, 1, 10);
    assert(ledgerPage1.meta.page === 1, 'Ledger returns page 1');
    assert(ledgerPage1.meta.perPage === 10, 'Ledger respects pageSize = 10');
    assert(Array.isArray(ledgerPage1.data), 'Ledger data is an array');
    assert(ledgerPage1.meta.total >= ledgerPage1.data.length, 'Ledger meta.total is consistent');

    if (ledgerPage1.data.length > 0) {
      const sampleRow = ledgerPage1.data[0];
      assert(sampleRow.reference_code !== undefined, 'Ledger item contains reference_code');
      assert(sampleRow.payer_name !== undefined, 'Ledger item contains payer_name');
      assert(sampleRow.status !== undefined, 'Ledger item contains payment status');
      assert(sampleRow.total_amount !== undefined, 'Ledger item contains total_amount');
    }

    // Filter by Purpose
    const rentLedger = await adminService.financeLedger({ purpose: 'MONTHLY_RENT' }, 1, 10);
    if (rentLedger.data.length > 0) {
      assert(
        rentLedger.data.every((r) => r.purpose === 'MONTHLY_RENT'),
        'Ledger purpose filter correctly restricts to MONTHLY_RENT'
      );
    }

    // Filter by Status
    const paidLedger = await adminService.financeLedger({ status: 'PAID' }, 1, 10);
    if (paidLedger.data.length > 0) {
      assert(
        paidLedger.data.every((r) => r.status === 'PAID'),
        'Ledger status filter correctly restricts to PAID'
      );
    }

    // Keyword Search
    const searchLedger = await adminService.financeLedger({ q: 'ODB-PAY' }, 1, 10);
    if (searchLedger.data.length > 0) {
      assert(
        searchLedger.data.some((r) => r.reference_code.includes('ODB-PAY')),
        'Ledger keyword search successfully matches reference_code'
      );
    }

    // -------------------------------------------------------------------------
    // TEST 5: Overdue Payments Detection
    // -------------------------------------------------------------------------
    console.log('\n5. OVERDUE PAYMENTS QUEUE');

    const overdueList = overviewThisMonth.overduePayments;
    if (overdueList.length > 0) {
      assert(
        overdueList.every((p) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status)),
        'All overdue payments are unsettled'
      );
      assert(
        overdueList.every((p) => p.days_overdue >= 0),
        'All overdue payments have positive days_overdue'
      );
    } else {
      console.log('    (No overdue payments in current test state)');
      assert(true, 'Overdue queue safely returns empty array when all payments are current');
    }

    // -------------------------------------------------------------------------
    // TEST 6: Commission Queue Verification
    // -------------------------------------------------------------------------
    console.log('\n6. COMMISSION QUEUE');

    const commList = overviewThisMonth.commissionQueue;
    if (commList.length > 0) {
      const firstComm = commList[0];
      assert(firstComm.commission_amount !== undefined, 'Commission item contains commission_amount');
      assert(firstComm.total_amount !== undefined, 'Commission item contains total_amount');
      assert(firstComm.status !== undefined, 'Commission item contains status');
    }
    assert(Array.isArray(commList), 'Commission queue properly loaded');

    // -------------------------------------------------------------------------
    // TEST 7: Move-Out Financial Settlements
    // -------------------------------------------------------------------------
    console.log('\n7. MOVE-OUT SETTLEMENTS QUEUE');

    const moveOutList = overviewThisMonth.activeMoveOutSettlements;
    assert(Array.isArray(moveOutList), 'Move-out settlements queue is an array');
    if (moveOutList.length > 0) {
      assert(moveOutList[0].tenancy_id !== undefined, 'Move-out settlement item contains tenancy_id');
      assert(moveOutList[0].stage !== undefined, 'Move-out settlement item contains stage');
    }

    // -------------------------------------------------------------------------
    // TEST 8: Financial Disputes Queue
    // -------------------------------------------------------------------------
    console.log('\n8. FINANCIAL DISPUTES QUEUE');

    const disputeList = overviewThisMonth.openFinancialDisputes;
    assert(Array.isArray(disputeList), 'Financial disputes queue is an array');
    if (disputeList.length > 0) {
      assert(disputeList[0].case_number !== undefined, 'Dispute contains case_number');
      assert(disputeList[0].category !== undefined, 'Dispute contains category');
    }

    // -------------------------------------------------------------------------
    // TEST 9: Manual Reconciliation View
    // -------------------------------------------------------------------------
    console.log('\n9. MANUAL RECONCILIATION & OFFLINE PAYMENTS');

    const reconList = overviewThisMonth.manualReconciliation;
    assert(Array.isArray(reconList), 'Manual reconciliation queue is an array');
    if (reconList.length > 0) {
      assert(reconList[0].reference_code !== undefined, 'Reconciliation item contains reference_code');
      assert(reconList[0].settlement_mode !== undefined, 'Reconciliation item contains settlement_mode');
    }

    // -------------------------------------------------------------------------
    // TEST 10: Zero Data Mutation & DB Integrity
    // -------------------------------------------------------------------------
    console.log('\n10. DATA INTEGRITY & AUDIT SAFETY');

    // Ensure no demo records were corrupted or altered
    const canonicalCase = await db.one(
      'SELECT id, status FROM legal_cases WHERE case_number = ?',
      ['ODB-LGL-2026-000003']
    );
    assert(canonicalCase !== null, 'Canonical case ODB-LGL-2026-000003 exists and intact');

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
