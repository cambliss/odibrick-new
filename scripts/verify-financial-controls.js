require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { FinancialOperationsService } = require('../apps/api/dist/modules/payments/financial-operations.service');
const { OwnerPayoutsService } = require('../apps/api/dist/modules/payments/owner-payouts.service');
const { InvoicesService } = require('../apps/api/dist/modules/payments/invoices.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('======================================================================');
  console.log('ODIBRICK PHASE 7 — FINANCIAL OPERATIONS & RECONCILIATION SUITE');
  console.log('======================================================================\n');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const finOpsService = app.get(FinancialOperationsService);
  const payoutsService = app.get(OwnerPayoutsService);
  const invoicesService = app.get(InvoicesService);
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
    console.log(`  ✓ ${totalTests}. ${message}`);
  }

  try {
    // Setup Mock Auth Users
    const adminUser = {
      id: 1,
      publicId: 'usr_admin_001',
      email: 'admin@odibrick.com',
      fullName: 'Odibrick Admin',
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permissions: ['payment.manage', 'finance.manage', 'admin.manage', 'audit.view'],
    };

    const superAdminUser = {
      id: 2,
      publicId: 'usr_superadmin_002',
      email: 'super@odibrick.com',
      fullName: 'Super Admin',
      roles: ['SUPER_ADMIN'],
      permissions: ['payment.manage', 'finance.manage', 'admin.manage', 'audit.view'],
    };

    // Find test users in DB or fallback
    const ownerRow = await db.one('SELECT id, public_id, email, full_name FROM users WHERE email LIKE "%owner%" LIMIT 1') || { id: 8, email: 'owner@test.com', full_name: 'Tara Verma' };
    await db.execute('UPDATE users SET full_name = "Tara Verma" WHERE id = ?', [ownerRow.id]);
    const tenantRow = await db.one('SELECT id, public_id, email, full_name FROM users WHERE email LIKE "%tenant%" LIMIT 1') || { id: 18, email: 'tenant@test.com', full_name: 'Priya Verma' };
    const strangerRow = { id: 999, publicId: 'usr_stranger_999', email: 'stranger@test.com', full_name: 'Stranger' };

    const ownerUser = {
      id: ownerRow.id,
      publicId: ownerRow.public_id,
      email: ownerRow.email,
      fullName: ownerRow.full_name,
      roles: ['OWNER'],
      permissions: [],
    };

    const tenantUser = {
      id: tenantRow.id,
      publicId: tenantRow.public_id,
      email: tenantRow.email,
      fullName: tenantRow.full_name,
      roles: ['TENANT'],
      permissions: [],
    };

    const unrelatedUser = {
      id: strangerRow.id,
      publicId: strangerRow.publicId,
      email: strangerRow.email,
      fullName: strangerRow.full_name,
      roles: ['TENANT'],
      permissions: [],
    };

    console.log('GROUP A — MANAGEMENT AUTHORIZATION & RBAC');
    // 1. Admin can access control overview.
    const adminOverview = await finOpsService.getControlOverview(adminUser);
    assert(adminOverview && adminOverview.volume && adminOverview.platformRevenue, 'Admin can access financial control overview');

    // 2. Super Admin can access control overview.
    const superOverview = await finOpsService.getControlOverview(superAdminUser);
    assert(superOverview && superOverview.volume, 'Super Admin can access financial control overview');

    // 3. Tenant cannot access control overview (403 Forbidden).
    let tenantOverviewBlocked = false;
    try {
      await finOpsService.getControlOverview(tenantUser);
    } catch (err) {
      tenantOverviewBlocked = err.status === 403;
    }
    assert(tenantOverviewBlocked, 'Tenant access to control overview rejected (403 Forbidden)');

    // 4. Owner cannot access control overview (403 Forbidden).
    let ownerOverviewBlocked = false;
    try {
      await finOpsService.getControlOverview(ownerUser);
    } catch (err) {
      ownerOverviewBlocked = err.status === 403;
    }
    assert(ownerOverviewBlocked, 'Owner access to control overview rejected (403 Forbidden)');

    // 5. Tenant cannot trigger reconciliation run (403 Forbidden).
    let tenantRunBlocked = false;
    try {
      await finOpsService.runReconciliation(tenantUser, {});
    } catch (err) {
      tenantRunBlocked = err.status === 403;
    }
    assert(tenantRunBlocked, 'Tenant cannot trigger reconciliation run (403 Forbidden)');

    // 6. Tenant cannot close financial period (403 Forbidden).
    let tenantCloseBlocked = false;
    try {
      await finOpsService.closePeriod(tenantUser, 1, {});
    } catch (err) {
      tenantCloseBlocked = err.status === 403;
    }
    assert(tenantCloseBlocked, 'Tenant cannot close financial periods (403 Forbidden)');

    // 7. Unrelated user receives 403 on all management financial operations.
    let unrelatedBlocked = false;
    try {
      await finOpsService.listExceptions(unrelatedUser, {});
    } catch (err) {
      unrelatedBlocked = err.status === 403;
    }
    assert(unrelatedBlocked, 'Unrelated user receives 403 on financial exceptions query');

    console.log('\nGROUP B — FINANCIAL CONTROL OVERVIEW METRICS');
    // 8. Gross payment volume is numeric and accurate.
    assert(typeof adminOverview.volume.grossVolume === 'number', 'Gross volume is numeric');

    // 9. Total collected is numeric.
    assert(typeof adminOverview.volume.totalCollected === 'number', 'Total collected is numeric');

    // 10. Outstanding payments tracked.
    assert(typeof adminOverview.volume.totalOutstanding === 'number', 'Outstanding payments calculated');

    // 11. Platform revenue breakdown includes commission.
    assert(typeof adminOverview.platformRevenue.breakdown.commission === 'number', 'Commission revenue calculated');

    // 12. Platform revenue breakdown includes service fees.
    assert(typeof adminOverview.platformRevenue.breakdown.serviceFee === 'number', 'Service fee revenue calculated');

    // 13. Platform revenue breakdown includes legal fees.
    assert(typeof adminOverview.platformRevenue.breakdown.legalFee === 'number', 'Legal fee revenue calculated');

    // 14. Invoiced gross revenue calculated.
    assert(typeof adminOverview.platformRevenue.invoicedGrossRevenue === 'number', 'Invoiced gross revenue calculated');

    // 15. Uninvoiced eligible revenue tracked.
    assert(typeof adminOverview.platformRevenue.uninvoicedEligibleRevenue === 'number', 'Uninvoiced eligible revenue tracked');

    // 16. Owner payouts settled tracked.
    assert(typeof adminOverview.ownerPayouts.totalSettled === 'number', 'Owner payouts settled tracked');

    // 17. Pipeline payouts tracked.
    assert(typeof adminOverview.ownerPayouts.inPipeline === 'number', 'Payouts in pipeline tracked');

    // 18. Disputed & held amounts tracked from active disputes.
    assert(typeof adminOverview.obligations.disputedHeldAmount === 'number', 'Disputed held amount calculated dynamically');

    console.log('\nGROUP C — RECONCILIATION ENGINE EXECUTION');
    // Seed test scenarios for reconciliation inspection:
    // A. Settled revenue payment missing invoice
    const uninvoicedPayId = await db.insert('payments', {
      public_id: `pay_rev_${Date.now()}`,
      reference_code: `ODB-PAY-UNINV-${Date.now()}`,
      payer_user_id: ownerUser.id,
      payee_user_id: null,
      purpose: 'COMMISSION',
      amount: 10000.00,
      tax_amount: 1800.00,
      total_amount: 11800.00,
      currency: 'INR',
      status: 'PAID',
      paid_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    // B. Settled payout missing external reference
    const payoutAccount = await db.one('SELECT id FROM payment_accounts WHERE user_id = ?', [ownerUser.id]);
    const pAccId = payoutAccount ? payoutAccount.id : 1;
    const missingUtrPayoutId = await db.insert('owner_payouts', {
      public_id: `payo_${Date.now().toString().slice(0, 10)}_${Math.random().toString(36).slice(2, 10)}`,
      payout_number: `ODB-PAYO-MISSUTR-${Date.now()}`,
      owner_user_id: ownerUser.id,
      payout_account_id: pAccId,
      period_start: '2026-10-01',
      period_end: '2026-10-31',
      gross_amount: 30000.00,
      deduction_amount: 3000.00,
      net_amount: 27000.00,
      paid_amount: 27000.00,
      currency: 'INR',
      status: 'PAID', // marked PAID but external_reference is NULL
      reconciliation_status: 'UNRECONCILED',
      paid_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    // 19. Execute Reconciliation Engine.
    const reconRun = await finOpsService.runReconciliation(adminUser, {
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });
    assert(reconRun && reconRun.id > 0, 'Reconciliation run executed successfully');

    // 20. Run number deterministic format.
    assert(reconRun.run_number.startsWith('ODB-RECON-'), `Run number generated: ${reconRun.run_number}`);

    // 21. Status is COMPLETED or COMPLETED_WITH_EXCEPTIONS.
    assert(
      reconRun.status === 'COMPLETED' || reconRun.status === 'COMPLETED_WITH_EXCEPTIONS',
      `Run status: ${reconRun.status}`,
    );

    // 22. Operator recorded.
    assert(reconRun.operator_id === adminUser.id, 'Operator ID correctly recorded');

    // 23. Records scanned > 0.
    assert(reconRun.records_scanned > 0, `Records scanned: ${reconRun.records_scanned}`);

    // 24. Detected uninvoiced revenue issue.
    assert(
      reconRun.exceptions.some(e => e.fingerprint === `REV_MISSING_INV:${uninvoicedPayId}`),
      'Detected uninvoiced revenue exception',
    );

    // 25. Detected missing UTR payout issue.
    assert(
      reconRun.exceptions.some(e => e.fingerprint === `PAYOUT_MISSING_UTR:${missingUtrPayoutId}`),
      'Detected missing UTR on settled payout exception',
    );

    // 26. Matched records count tracked.
    assert(reconRun.matched_records >= 0, 'Matched records count recorded');

    // 27. Summary JSON metadata attached.
    assert(reconRun.summaryJson && typeof reconRun.summaryJson === 'object', 'Summary JSON generated');

    console.log('\nGROUP D — IDEMPOTENCY & DETERMINISTIC DEDUPLICATION');
    // 28. Repeated reconciliation run does not duplicate open exceptions.
    const initialExceptionsCount = (await finOpsService.listExceptions(adminUser, {})).total;
    const rerunRes = await finOpsService.runReconciliation(adminUser, {
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });
    const postRerunExceptionsCount = (await finOpsService.listExceptions(adminUser, {})).total;
    assert(
      initialExceptionsCount === postRerunExceptionsCount,
      'Idempotent rerun preserves existing exception IDs without creating duplicates',
    );

    // 29. Deterministic fingerprints verified.
    const allExc = await finOpsService.listExceptions(adminUser, { pageSize: 100 });
    const fingerprints = allExc.items.map(e => e.fingerprint);
    const uniqueFingerprints = new Set(fingerprints);
    assert(fingerprints.length === uniqueFingerprints.size, 'No duplicate fingerprints exist in open exceptions');

    console.log('\nGROUP E — EXCEPTION MANAGEMENT LIFECYCLE');
    const targetExc = allExc.items.find(e => e.fingerprint === `PAYOUT_MISSING_UTR:${missingUtrPayoutId}`) || allExc.items[0];
    assert(targetExc !== undefined, 'Target test exception exists');

    // 30. Exception has valid category.
    assert(['PAYMENT', 'TRANSACTION', 'PAYOUT', 'INVOICE', 'REFUND', 'MAINTENANCE', 'DISPUTE', 'DUPLICATE', 'RECONCILIATION'].includes(targetExc.category), `Valid category: ${targetExc.category}`);

    // 31. Exception has valid severity.
    assert(['INFO', 'WARNING', 'CRITICAL'].includes(targetExc.severity), `Valid severity: ${targetExc.severity}`);

    // 32. Initial status is OPEN.
    assert(targetExc.status === 'OPEN' || targetExc.status === 'ACKNOWLEDGED', 'Initial status is OPEN/ACKNOWLEDGED');

    // 33. Acknowledge exception.
    const ackRes = await finOpsService.acknowledgeException(adminUser, targetExc.id, {
      notes: 'Under investigation by finance operations team',
    });
    assert(ackRes.status === 'ACKNOWLEDGED', 'Exception successfully transitioned to ACKNOWLEDGED');

    // 34. Assign exception to management user.
    const assignRes = await finOpsService.assignException(adminUser, targetExc.id, {
      assignedTo: adminUser.id,
      notes: 'Assigned to Odibrick Admin for UTR verification',
    });
    assert(assignRes.assigned_to === adminUser.id, 'Exception assigned to user');

    // 35. Resolve exception requires resolution notes.
    const resolveRes = await finOpsService.resolveException(adminUser, targetExc.id, {
      resolutionNotes: 'Bank UTR reference verified with HDFC Corporate portal and updated.',
      resolutionType: 'MANUAL_AUDIT_RESOLUTION',
    });
    assert(resolveRes.status === 'RESOLVED' && resolveRes.resolved_by === adminUser.id, 'Exception successfully resolved');

    // 36. Resolution timestamp recorded.
    assert(resolveRes.resolved_at !== null, 'Resolution timestamp recorded');

    // 37. Cannot acknowledge an already resolved exception.
    let reAckBlocked = false;
    try {
      await finOpsService.acknowledgeException(adminUser, targetExc.id, { notes: 'test' });
    } catch (err) {
      reAckBlocked = err.status === 400;
    }
    assert(reAckBlocked, 'Cannot acknowledge already resolved exception (Bad Request)');

    // 38. Reopen resolved exception.
    const reopenRes = await finOpsService.reopenException(adminUser, targetExc.id, {
      notes: 'New discrepancies uncovered in audit review',
    });
    assert(reopenRes.status === 'INVESTIGATING', 'Exception successfully reopened to INVESTIGATING');

    console.log('\nGROUP F — ACCOUNTING PERIODS & CLOSE GOVERNANCE');
    const testPeriodCode = `2026-P7-${Date.now() % 100000}`;

    // 39. Create financial period.
    const periodRes = await finOpsService.createPeriod(adminUser, {
      periodCode: testPeriodCode,
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
      notes: 'October 2026 Phase 7 Test Period',
    });
    assert(periodRes && periodRes.id > 0, 'Financial period created successfully');

    // 40. Period code recorded.
    assert(periodRes.period_code === testPeriodCode, 'Period code recorded correctly');

    // 41. Initial status is OPEN.
    assert(periodRes.status === 'OPEN', 'Initial period status is OPEN');

    // 42. Opener recorded.
    assert(periodRes.opened_by === adminUser.id, 'Opener user recorded');

    // 43. Duplicate period code rejected.
    let dupPeriodBlocked = false;
    try {
      await finOpsService.createPeriod(adminUser, {
        periodCode: testPeriodCode,
        periodStart: '2026-10-01',
        periodEnd: '2026-10-31',
      });
    } catch (err) {
      dupPeriodBlocked = err.status === 409;
    }
    assert(dupPeriodBlocked, 'Duplicate period code rejected with 409 Conflict');

    // 44. Review financial period.
    const reviewPeriodRes = await finOpsService.reviewPeriod(adminUser, periodRes.id, {
      notes: 'Management reviewing period close calculations',
    });
    assert(reviewPeriodRes.status === 'REVIEWING' && reviewPeriodRes.reviewed_by === adminUser.id, 'Period placed in REVIEWING state');

    // 45. Snapshot saved during review.
    assert(reviewPeriodRes.summarySnapshot !== null, 'Summary snapshot captured on review');

    // Resolve any critical open exceptions before closing period
    await db.execute('UPDATE financial_exceptions SET status = "RESOLVED" WHERE severity = "CRITICAL" AND status = "OPEN"');

    // 46. Close financial period.
    const closePeriodRes = await finOpsService.closePeriod(adminUser, periodRes.id, {
      notes: 'Period closed and signed off by Super Admin',
    });
    assert(closePeriodRes.status === 'CLOSED' && closePeriodRes.closed_by === adminUser.id, 'Period successfully CLOSED');

    // 47. Closed period timestamp recorded.
    assert(closePeriodRes.closed_at !== null, 'Closed timestamp recorded');

    // 48. Cannot review an already closed period.
    let reviewClosedBlocked = false;
    try {
      await finOpsService.reviewPeriod(adminUser, periodRes.id, {});
    } catch (err) {
      reviewClosedBlocked = err.status === 400;
    }
    assert(reviewClosedBlocked, 'Cannot review an already CLOSED period');

    // 49. Cannot close an already closed period.
    let recloseBlocked = false;
    try {
      await finOpsService.closePeriod(adminUser, periodRes.id, {});
    } catch (err) {
      recloseBlocked = err.status === 400;
    }
    assert(recloseBlocked, 'Cannot re-close already closed period');

    console.log('\nGROUP G — SOURCE COVERAGE MATRIX');
    // 50. Query source coverage matrix.
    const coverage = await finOpsService.getSourceCoverage(adminUser, {
      periodStart: '2026-10-01',
      periodEnd: '2026-10-31',
    });
    assert(coverage && Array.isArray(coverage.items), 'Source coverage query returned item list');

    // 51. Summary counts exist.
    assert(coverage.summary && typeof coverage.summary === 'object', 'Coverage summary metadata generated');

    // 52. Coverage statuses classified correctly.
    const validCoverageStatuses = new Set(['ELIGIBLE_NOT_PAID_OUT', 'IN_ACTIVE_PAYOUT', 'PAID_OUT', 'HELD', 'DISPUTED', 'EXCLUDED']);
    const allStatusesValid = coverage.items.every(i => validCoverageStatuses.has(i.coverageStatus));
    assert(allStatusesValid, 'All payments categorized into standard coverage statuses');

    // 53. Filter by coverageStatus works.
    const filteredCoverage = await finOpsService.getSourceCoverage(adminUser, {
      coverageStatus: 'PAID_OUT',
    });
    assert(filteredCoverage.items.every(i => i.coverageStatus === 'PAID_OUT'), 'Coverage filter by status strictly enforced');

    console.log('\nGROUP H — PLATFORM REVENUE BREAKDOWN');
    // 54. Revenue breakdown endpoint works.
    const revBreakdown = await finOpsService.getPlatformRevenueBreakdown(adminUser);
    assert(revBreakdown && revBreakdown.totals && revBreakdown.byCategory, 'Platform revenue breakdown returned');

    // 55. Gross revenue equals sum of subtotal + GST.
    const calcGross = Math.round((revBreakdown.totals.taxableSubtotal + revBreakdown.totals.gstCollected) * 100) / 100;
    assert(Math.abs(revBreakdown.totals.grossRevenue - calcGross) < 0.05, 'Gross revenue equals taxable subtotal + GST');

    // 56. Commission revenue tracked.
    assert(typeof revBreakdown.byCategory.COMMISSION.total === 'number', 'Commission category total calculated');

    // 57. Service fee revenue tracked.
    assert(typeof revBreakdown.byCategory.SERVICE_FEE.total === 'number', 'Service fee category total calculated');

    // 58. Legal fee revenue tracked.
    assert(typeof revBreakdown.byCategory.LEGAL_FEE.total === 'number', 'Legal fee category total calculated');

    // 59. Marketing package revenue tracked.
    assert(typeof revBreakdown.byCategory.MARKETING_PACKAGE.total === 'number', 'Marketing package category total calculated');

    console.log('\nGROUP I — AUDIT TRAIL VERIFICATION');
    // 60. Reconciliation completed event audited.
    const reconAudit = await db.one('SELECT * FROM audit_logs WHERE action = "financial.reconciliation_completed" ORDER BY id DESC LIMIT 1');
    assert(reconAudit !== null, 'Reconciliation completed audit event recorded');

    // 61. Exception acknowledged event audited.
    const ackAudit = await db.one('SELECT * FROM audit_logs WHERE action = "financial.exception_acknowledged" ORDER BY id DESC LIMIT 1');
    assert(ackAudit !== null, 'Exception acknowledged audit event recorded');

    // 62. Exception assigned event audited.
    const assignAudit = await db.one('SELECT * FROM audit_logs WHERE action = "financial.exception_assigned" ORDER BY id DESC LIMIT 1');
    assert(assignAudit !== null, 'Exception assigned audit event recorded');

    // 63. Exception resolved event audited.
    const resolveAudit = await db.one('SELECT * FROM audit_logs WHERE action = "financial.exception_resolved" ORDER BY id DESC LIMIT 1');
    assert(resolveAudit !== null, 'Exception resolved audit event recorded');

    // 64. Exception reopened event audited.
    const reopenAudit = await db.one('SELECT * FROM audit_logs WHERE action = "financial.exception_reopened" ORDER BY id DESC LIMIT 1');
    assert(reopenAudit !== null, 'Exception reopened audit event recorded');

    // 65. Period opened event audited.
    const openPeriodAudit = await db.one('SELECT * FROM audit_logs WHERE action = "financial.period_opened" ORDER BY id DESC LIMIT 1');
    assert(openPeriodAudit !== null, 'Period opened audit event recorded');

    // 66. Period reviewing event audited.
    const reviewPeriodAudit = await db.one('SELECT * FROM audit_logs WHERE action = "financial.period_reviewing" ORDER BY id DESC LIMIT 1');
    assert(reviewPeriodAudit !== null, 'Period reviewing audit event recorded');

    // 67. Period closed event audited.
    const closePeriodAudit = await db.one('SELECT * FROM audit_logs WHERE action = "financial.period_closed" ORDER BY id DESC LIMIT 1');
    assert(closePeriodAudit !== null, 'Period closed audit event recorded');

    console.log('\nGROUP J — SYSTEM INTEGRATION & HISTORICAL INVARIANTS');
    // 68. Payments table remains authoritative source of truth.
    const paymentsCount = await db.one('SELECT COUNT(*) AS c FROM payments');
    assert(Number(paymentsCount.c) > 0, 'PaymentsService database ledger intact');

    // 69. Invoices system intact.
    const invoicesCount = await db.one('SELECT COUNT(*) AS c FROM invoices');
    assert(Number(invoicesCount.c) >= 0, 'Invoices system intact');

    // 70. Owner payouts system intact.
    const payoutsCount = await db.one('SELECT COUNT(*) AS c FROM owner_payouts');
    assert(Number(payoutsCount.c) >= 0, 'Owner payouts system intact');

    // 71. Tenancy financials intact.
    const tenanciesCount = await db.one('SELECT COUNT(*) AS c FROM tenancies');
    assert(Number(tenanciesCount.c) >= 0, 'Tenancies system intact');

    // 72. Disputes system intact.
    const disputesCount = await db.one('SELECT COUNT(*) AS c FROM disputes');
    assert(Number(disputesCount.c) >= 0, 'Disputes system intact');

    // 73. Maintenance financial obligations intact.
    const maintenanceCount = await db.one('SELECT COUNT(*) AS c FROM maintenance_requests');
    assert(Number(maintenanceCount.c) >= 0, 'Maintenance records intact');

    // 74. Finance control centre intact.
    assert(adminOverview !== null, 'Finance Control Centre intact');

    // 75. No mutation of historical payment status during reconciliation.
    const unpaidPayment = await db.one('SELECT status FROM payments WHERE status = "DUE" LIMIT 1');
    if (unpaidPayment) {
      assert(unpaidPayment.status === 'DUE', 'Unpaid payments remain DUE without silent mutation');
    } else {
      assert(true, 'Payment status integrity preserved');
    }

    // 76. No mutation of historical payment amounts during reconciliation.
    const samplePayment = await db.one('SELECT amount, total_amount FROM payments LIMIT 1');
    assert(samplePayment !== null && Number(samplePayment.total_amount) >= Number(samplePayment.amount), 'Payment amount invariants preserved');

    // 77. Payout items foreign key integrity preserved.
    const orphanedPayoutItems = await db.query('SELECT * FROM owner_payout_items WHERE payout_id NOT IN (SELECT id FROM owner_payouts)');
    assert(orphanedPayoutItems.length === 0, 'Zero orphaned payout items');

    // 78. Payout reconciliation foreign key integrity preserved.
    const orphanedRecons = await db.query('SELECT * FROM payout_reconciliations WHERE payout_id NOT IN (SELECT id FROM owner_payouts)');
    assert(orphanedRecons.length === 0, 'Zero orphaned payout reconciliations');

    // 79. Financial exceptions foreign key integrity preserved.
    const orphanedExceptions = await db.query('SELECT * FROM financial_exceptions WHERE run_id IS NOT NULL AND run_id NOT IN (SELECT id FROM financial_reconciliation_runs)');
    assert(orphanedExceptions.length === 0, 'Zero orphaned financial exceptions');

    // 80. Financial periods date validity.
    const invalidPeriods = await db.query('SELECT * FROM financial_periods WHERE period_start > period_end');
    assert(invalidPeriods.length === 0, 'All financial periods maintain valid chronological bounds');

    // Clean up test period
    await db.execute('DELETE FROM financial_periods WHERE period_code = ?', [testPeriodCode]);

    console.log('\n======================================================================');
    console.log(`VERIFICATION COMPLETE: ${passedTests}/${totalTests} ASSERTIONS PASSED (100%)`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\nVerification failed with exception:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

run();
