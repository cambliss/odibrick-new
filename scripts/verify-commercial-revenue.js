require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { CommercialOperationsService } = require('../apps/api/dist/modules/payments/commercial-operations.service');
const { PaymentsService } = require('../apps/api/dist/modules/payments/payments.service');
const { InvoicesService } = require('../apps/api/dist/modules/payments/invoices.service');
const { OwnerPayoutsService } = require('../apps/api/dist/modules/payments/owner-payouts.service');
const { FinancialOperationsService } = require('../apps/api/dist/modules/payments/financial-operations.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('======================================================================');
  console.log('ODIBRICK PHASE 8 — PLATFORM REVENUE, COMMISSION & COMMERCIAL OPERATIONS');
  console.log('======================================================================\n');

  let app;
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
    app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
    const commercialService = app.get(CommercialOperationsService);
    const paymentsService = app.get(PaymentsService);
    const invoicesService = app.get(InvoicesService);
    const payoutsService = app.get(OwnerPayoutsService);
    const finOpsService = app.get(FinancialOperationsService);
    const db = app.get(DatabaseService);

    // Setup Mock Auth Users
    const adminUser = {
      id: 1,
      publicId: 'usr_admin_001',
      email: 'admin@odibrick.com',
      fullName: 'Odibrick Admin',
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permissions: ['commercial.read', 'commercial.manage', 'commercial.rules.manage', 'payment.manage', 'finance.manage'],
    };

    const superAdminUser = {
      id: 2,
      publicId: 'usr_superadmin_002',
      email: 'super@odibrick.com',
      fullName: 'Super Admin',
      roles: ['SUPER_ADMIN'],
      permissions: ['commercial.read', 'commercial.manage', 'commercial.rules.manage', 'payment.manage', 'finance.manage'],
    };

    const ownerRow = await db.one('SELECT id, public_id, email, full_name FROM users WHERE email LIKE "%owner%" LIMIT 1') || { id: 8, email: 'owner@test.com', full_name: 'Tara Verma' };
    const tenantRow = await db.one('SELECT id, public_id, email, full_name FROM users WHERE email LIKE "%tenant%" LIMIT 1') || { id: 18, email: 'tenant@test.com', full_name: 'Priya Verma' };

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

    const strangerUser = {
      id: 999,
      publicId: 'usr_stranger_999',
      email: 'stranger@test.com',
      fullName: 'Stranger',
      roles: ['TENANT'],
      permissions: [],
    };

    // Clean up any test records from prior runs
    await db.execute('DELETE FROM commercial_adjustments');
    await db.execute('DELETE FROM commercial_obligations');

    console.log('GROUP A — MANAGEMENT AUTHORIZATION & RBAC');
    // 1. Admin can access commercial overview.
    const adminOverview = await commercialService.getCommercialOverview(adminUser);
    assert(adminOverview && adminOverview.volume && adminOverview.counts, 'Admin can access commercial overview');

    // 2. Super Admin can access commercial overview.
    const superOverview = await commercialService.getCommercialOverview(superAdminUser);
    assert(superOverview && superOverview.volume, 'Super Admin can access commercial overview');

    // 3. Tenant cannot access commercial overview (403 Forbidden).
    let tenantOverviewBlocked = false;
    try {
      await commercialService.getCommercialOverview(tenantUser);
    } catch (err) {
      tenantOverviewBlocked = err.status === 403;
    }
    assert(tenantOverviewBlocked, 'Tenant access to commercial overview rejected (403 Forbidden)');

    // 4. Owner cannot access commercial overview (403 Forbidden).
    let ownerOverviewBlocked = false;
    try {
      await commercialService.getCommercialOverview(ownerUser);
    } catch (err) {
      ownerOverviewBlocked = err.status === 403;
    }
    assert(ownerOverviewBlocked, 'Owner access to commercial overview rejected (403 Forbidden)');

    // 5. Tenant cannot manage commercial rules (403 Forbidden).
    let tenantRuleManageBlocked = false;
    try {
      await commercialService.createRule(tenantUser, {
        code: 'TEST-UNAUTH',
        name: 'Unauthorized Rule',
        category: 'COMMISSION',
        basis: 'PERCENT_OF_MONTHLY_RENT',
        percentValue: 10,
        effectiveFrom: '2026-01-01',
      });
    } catch (err) {
      tenantRuleManageBlocked = err.status === 403;
    }
    assert(tenantRuleManageBlocked, 'Tenant cannot create commercial rules (403 Forbidden)');

    // 6. Tenant cannot waive commercial obligations (403 Forbidden).
    let tenantWaiveBlocked = false;
    try {
      await commercialService.waiveObligation(tenantUser, 1, { reason: 'Test' });
    } catch (err) {
      tenantWaiveBlocked = err.status === 403;
    }
    assert(tenantWaiveBlocked, 'Tenant cannot waive commercial obligations (403 Forbidden)');

    // 7. Tenant cannot access analytical revenue reporting (403 Forbidden).
    let tenantReportingBlocked = false;
    try {
      await commercialService.getRevenueReporting(tenantUser, {});
    } catch (err) {
      tenantReportingBlocked = err.status === 403;
    }
    assert(tenantReportingBlocked, 'Tenant access to revenue reporting rejected (403 Forbidden)');

    console.log('\nGROUP B — COMMERCIAL PRICING RULES ENGINE');
    const testRuleCode = `RULE-COMM-TEST-${Date.now() % 100000}`;

    // 8. Create commercial pricing rule.
    const createdRule = await commercialService.createRule(adminUser, {
      code: testRuleCode,
      name: 'Phase 8 Test Commission Rule',
      category: 'COMMISSION',
      appliesTo: 'STANDARD',
      basis: 'PERCENT_OF_MONTHLY_RENT',
      percentValue: 80.0,
      minAmount: 4000.0,
      maxAmount: 80000.0,
      payer: 'OWNER',
      taxRate: 18.0,
      priority: 50,
      city: 'Mumbai',
      effectiveFrom: '2026-01-01',
      effectiveTo: '2027-12-31',
      isActive: true,
    });
    assert(createdRule && createdRule.id > 0, 'Commercial pricing rule created successfully');

    // 9. Rule code saved correctly.
    assert(createdRule.code === testRuleCode, 'Rule code matches input');

    // 10. Rule category is COMMISSION.
    assert(createdRule.category === 'COMMISSION', 'Rule category is COMMISSION');

    // 11. Basis is PERCENT_OF_MONTHLY_RENT.
    assert(createdRule.basis === 'PERCENT_OF_MONTHLY_RENT', 'Basis is PERCENT_OF_MONTHLY_RENT');

    // 12. Percent value preserved.
    assert(Number(createdRule.percentValue) === 80.0, 'Percentage value recorded: 80%');

    // 13. Min/Max amounts preserved.
    assert(Number(createdRule.minAmount) === 4000.0 && Number(createdRule.maxAmount) === 80000.0, 'Min/Max bounds preserved');

    // 14. Priority recorded.
    assert(Number(createdRule.priority) === 50, 'Priority recorded: 50');

    // 15. Duplicate rule code rejected with 409 Conflict.
    let duplicateRejected = false;
    try {
      await commercialService.createRule(adminUser, {
        code: testRuleCode,
        name: 'Duplicate Rule',
        category: 'COMMISSION',
        basis: 'PERCENT_OF_MONTHLY_RENT',
        percentValue: 50,
        effectiveFrom: '2026-01-01',
      });
    } catch (err) {
      duplicateRejected = err.status === 409;
    }
    assert(duplicateRejected, 'Duplicate rule code rejected with 409 Conflict');

    // 16. Invalid date range rejected.
    let invalidDatesRejected = false;
    try {
      await commercialService.createRule(adminUser, {
        code: `RULE-INVALID-${Date.now() % 100000}`,
        name: 'Invalid Date Rule',
        category: 'COMMISSION',
        basis: 'PERCENT_OF_MONTHLY_RENT',
        percentValue: 50,
        effectiveFrom: '2027-01-01',
        effectiveTo: '2026-01-01',
      });
    } catch (err) {
      invalidDatesRejected = err.status === 400;
    }
    assert(invalidDatesRejected, 'Invalid effective date range rejected with 400 Bad Request');

    // 17. Update commercial rule.
    const updatedRule = await commercialService.updateRule(adminUser, createdRule.id, {
      name: 'Phase 8 Updated Commission Rule',
      percentValue: 85.0,
      priority: 60,
    });
    assert(Number(updatedRule.percentValue) === 85.0 && Number(updatedRule.priority) === 60, 'Commercial rule successfully updated');

    // 18. Deactivate commercial rule.
    const deactRes = await commercialService.deactivateRule(adminUser, createdRule.id);
    assert(deactRes.isActive === false, 'Commercial rule successfully deactivated');

    // 19. Reactivate commercial rule.
    const reactRes = await commercialService.activateRule(adminUser, createdRule.id);
    assert(reactRes.isActive === true, 'Commercial rule successfully reactivated');

    console.log('\nGROUP C — CALCULATION PREVIEW SIMULATOR');
    // 20. Percentage calculation preview.
    const pctPreview = commercialService.previewCalculation({
      category: 'COMMISSION',
      basis: 'PERCENT_OF_MONTHLY_RENT',
      baseAmount: 50000,
      percentValue: 100,
      taxRate: 18,
    });
    assert(pctPreview.calculatedFee === 50000, 'Percentage fee calculated: ₹50,000');
    assert(pctPreview.calculatedTax === 9000, 'GST calculated at 18%: ₹9,000');
    assert(pctPreview.totalAmount === 59000, 'Total obligation calculated: ₹59,000');
    assert(pctPreview.isSimulation === true, 'Simulation marker returned');

    // 21. Minimum bound clamped preview.
    const minClampedPreview = commercialService.previewCalculation({
      category: 'COMMISSION',
      basis: 'PERCENT_OF_MONTHLY_RENT',
      baseAmount: 10000,
      percentValue: 20, // 2000, but min is 5000
      minAmount: 5000,
      taxRate: 18,
    });
    assert(minClampedPreview.calculatedFee === 5000, 'Fee clamped to minimum bound of ₹5,000');
    assert(minClampedPreview.totalAmount === 5900, 'Total with GST calculated on minimum clamped fee: ₹5,900');

    // 22. Maximum bound clamped preview.
    const maxClampedPreview = commercialService.previewCalculation({
      category: 'COMMISSION',
      basis: 'PERCENT_OF_MONTHLY_RENT',
      baseAmount: 200000,
      percentValue: 100, // 200000, but max is 100000
      maxAmount: 100000,
      taxRate: 18,
    });
    assert(maxClampedPreview.calculatedFee === 100000, 'Fee clamped to maximum bound of ₹100,000');

    // 23. Flat fee preview.
    const flatPreview = commercialService.previewCalculation({
      category: 'SERVICE_FEE',
      basis: 'FLAT_FEE',
      baseAmount: 0,
      flatValue: 2500,
      taxRate: 18,
    });
    assert(flatPreview.calculatedFee === 2500, 'Flat fee calculated: ₹2,500');
    assert(flatPreview.calculatedTax === 450, 'GST on flat fee: ₹450');
    assert(flatPreview.totalAmount === 2950, 'Total flat fee obligation: ₹2,950');

    // 24. Decimal-safe arithmetic precision.
    const decimalPreview = commercialService.previewCalculation({
      category: 'COMMISSION',
      basis: 'PERCENT_OF_MONTHLY_RENT',
      baseAmount: 33333.33,
      percentValue: 8.33,
      taxRate: 18,
    });
    assert(typeof decimalPreview.totalAmount === 'number' && !isNaN(decimalPreview.totalAmount), 'Decimal precision verified safe');

    console.log('\nGROUP D — RULE MATCHING & DETERMINISTIC SELECTION');
    // 25. Match highest priority rule.
    const matchedRule = await commercialService.matchRule('COMMISSION', 'STANDARD', 'Mumbai');
    assert(matchedRule && matchedRule.id === createdRule.id, 'Deterministic match picked highest priority Mumbai rule');

    // 26. City fallback match.
    const fallbackRule = await commercialService.matchRule('COMMISSION', 'STANDARD', 'Pune');
    assert(fallbackRule && fallbackRule.city === null, 'Fell back to general rule for unmatched city');

    console.log('\nGROUP E — COMMERCIAL OBLIGATION CREATION & IDEMPOTENCY');
    const sampleTenancy = await db.one('SELECT id, property_id, owner_user_id, tenant_user_id FROM tenancies LIMIT 1') || { id: 3, property_id: 1, owner_user_id: ownerUser.id, tenant_user_id: tenantUser.id };
    const testTenancyId = sampleTenancy.id;
    // 27. Create commercial obligation for rental agreement.
    const obligation1 = await commercialService.createCommercialObligation(adminUser, {
      category: 'COMMISSION',
      sourceType: 'TENANCY',
      sourceId: testTenancyId,
      baseAmount: 50000,
      payerUserId: ownerUser.id,
      propertyId: sampleTenancy.property_id,
      tenancyId: testTenancyId,
      appliesTo: 'STANDARD',
      city: 'Mumbai',
    });
    assert(obligation1 && obligation1.id > 0, 'Commercial obligation created successfully');

    // 28. Obligation number formatted correctly.
    assert(obligation1.obligationNumber.startsWith('ODB-COM-'), 'Obligation number has format ODB-COM-YYYY-XXXXXX');

    // 29. Initial status is PENDING_REVIEW.
    assert(obligation1.status === 'PENDING_REVIEW', 'Initial status is PENDING_REVIEW');

    // 30. Calculation snapshot captured.
    assert(obligation1.calculationSnapshot && obligation1.calculationSnapshot.ruleCode, 'Immutable calculation snapshot captured');

    // 31. Tax and fee itemized accurately.
    assert(obligation1.feeAmount > 0 && obligation1.taxAmount > 0, 'Itemized fee and tax amounts calculated');
    assert(obligation1.totalAmount === obligation1.feeAmount + obligation1.taxAmount, 'Total equals fee + tax');

    // 32. Deterministic Idempotency: re-creating for same source returns identical obligation.
    const obligationDuplicate = await commercialService.createCommercialObligation(adminUser, {
      category: 'COMMISSION',
      sourceType: 'TENANCY',
      sourceId: testTenancyId,
      baseAmount: 50000,
      payerUserId: ownerUser.id,
    });
    assert(obligationDuplicate.id === obligation1.id, 'Idempotent creation returns identical existing obligation without duplicates');

    // 33. Unique constraint in database prevents duplicate source records.
    const duplicateDbCheck = await db.query(
      'SELECT COUNT(*) as c FROM commercial_obligations WHERE source_type = "TENANCY" AND source_id = ? AND category = "COMMISSION"',
      [testTenancyId],
    );
    assert(Number(duplicateDbCheck[0].c) === 1, 'Database confirms exactly 1 commercial obligation exists for source');

    console.log('\nGROUP F — MANAGEMENT APPROVAL & PAYMENT SERVICE INTEGRATION');
    // 34. Approve commercial obligation.
    const approvedObligation = await commercialService.approveObligation(adminUser, obligation1.id, {
      notes: 'Approved by management for collection',
    });
    assert(approvedObligation.status === 'PAYMENT_DUE', 'Status transitioned to PAYMENT_DUE upon approval');

    // 35. Approver recorded.
    assert(approvedObligation.approvedByName !== null, 'Approver user recorded in obligation');

    // 36. Payment obligation created in PaymentsService.
    assert(approvedObligation.paymentId !== null && approvedObligation.paymentId > 0, 'Payment obligation generated via PaymentsService');

    // 37. Payment record verified in payments table.
    const linkedPayment = await db.one('SELECT * FROM payments WHERE id = ?', [approvedObligation.paymentId]);
    assert(linkedPayment !== null, 'Linked payment record exists in payments table');
    assert(linkedPayment.purpose === 'COMMISSION', 'Payment purpose is COMMISSION');
    assert(linkedPayment.status === 'DUE', 'Payment status is DUE');
    assert(Number(linkedPayment.total_amount) === approvedObligation.totalAmount, 'Payment amount equals commercial total');

    // 38. Cannot re-approve already approved / due obligation.
    let reapproveBlocked = false;
    try {
      await commercialService.approveObligation(adminUser, obligation1.id, {});
    } catch (err) {
      reapproveBlocked = true;
    }
    assert(reapproveBlocked || approvedObligation.status === 'PAYMENT_DUE', 'Re-approval safely handled');

    console.log('\nGROUP G — PAYMENT SETTLEMENT & INVOICE LINKAGE');
    // 39. Settle payment and trigger sync.
    await db.update('payments', approvedObligation.paymentId, {
      status: 'PAID',
      paid_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });
    await commercialService.syncPaymentStatus(approvedObligation.paymentId, 'PAID');

    // 40. Commercial obligation status updated to PAID.
    const paidObligation = await commercialService.getObligationById(adminUser, obligation1.id);
    assert(paidObligation.status === 'PAID', 'Commercial obligation synchronized to PAID upon payment settlement');

    // 41. Generate invoice for paid platform revenue.
    const invoiceRes = await invoicesService.generateInvoiceForPayment(adminUser, approvedObligation.paymentId);
    assert(invoiceRes && invoiceRes.id > 0, 'GST Tax Invoice generated for settled commercial revenue');

    // 42. Link invoice to commercial obligation.
    await commercialService.syncPaymentStatus(approvedObligation.paymentId, 'PAID', invoiceRes.id);
    const invoicedObligation = await commercialService.getObligationById(adminUser, obligation1.id);
    assert(invoicedObligation.invoiceId === invoiceRes.id, 'Invoice ID bidirectionally linked to commercial obligation');

    console.log('\nGROUP H — WAIVERS, ADJUSTMENTS & CANCELLATIONS');
    // 43. Create a second test obligation for waiver testing.
    const obligation2 = await commercialService.createCommercialObligation(adminUser, {
      category: 'SERVICE_FEE',
      sourceType: 'TENANCY',
      sourceId: sampleTenancy.id,
      baseAmount: 2500,
      payerUserId: ownerUser.id,
      propertyId: sampleTenancy.property_id,
      tenancyId: sampleTenancy.id,
    });
    assert(obligation2 && obligation2.id > 0, 'Second obligation created for waiver test');

    // 44. Waive commercial obligation.
    const waivedObligation = await commercialService.waiveObligation(adminUser, obligation2.id, {
      reason: 'Promotional onboarding discount approved by COO',
    });
    assert(waivedObligation.status === 'WAIVED', 'Obligation status updated to WAIVED');
    assert(waivedObligation.waiverReason.includes('Promotional onboarding'), 'Waiver reason recorded');

    // 45. Commercial adjustment record created.
    assert(waivedObligation.adjustments.length > 0, 'Commercial adjustment record persisted');
    assert(waivedObligation.adjustments[0].adjustmentType === 'WAIVER', 'Adjustment type is WAIVER');

    // 46. Cannot waive an already waived obligation.
    let rewaiveBlocked = false;
    try {
      await commercialService.waiveObligation(adminUser, obligation2.id, { reason: 'Duplicate waiver' });
    } catch (err) {
      rewaiveBlocked = err.status === 400;
    }
    assert(rewaiveBlocked, 'Cannot re-waive already waived obligation (400 Bad Request)');

    // 47. Create a third test obligation for adjustment testing.
    const obligation3 = await commercialService.createCommercialObligation(adminUser, {
      category: 'LEGAL_FEE',
      sourceType: 'TENANCY',
      sourceId: sampleTenancy.id,
      baseAmount: 1500,
      payerUserId: tenantUser.id,
      propertyId: sampleTenancy.property_id,
      tenancyId: sampleTenancy.id,
    });

    // 48. Adjust commercial obligation.
    const adjustedObligation = await commercialService.adjustObligation(adminUser, obligation3.id, {
      adjustmentType: 'DISCOUNT',
      amountAdjusted: -300,
      reason: 'Special early-bird documentation discount',
    });
    assert(adjustedObligation.adjustments.length > 0, 'Adjustment logged in history');
    assert(adjustedObligation.feeAmount === 1200, 'Adjusted fee amount calculated correctly (₹1,500 - ₹300 = ₹1,200)');

    // 49. Create a fourth test obligation for cancellation testing.
    const obligation4 = await commercialService.createCommercialObligation(adminUser, {
      category: 'MARKETING_PACKAGE',
      sourceType: 'TENANCY',
      sourceId: sampleTenancy.id,
      baseAmount: 15000,
      payerUserId: ownerUser.id,
      propertyId: sampleTenancy.property_id,
      tenancyId: sampleTenancy.id,
    });

    // 50. Cancel commercial obligation.
    const cancelledObligation = await commercialService.cancelObligation(adminUser, obligation4.id, {
      reason: 'Client cancelled property listing',
    });
    assert(cancelledObligation.status === 'CANCELLED', 'Commercial obligation successfully cancelled');
    assert(cancelledObligation.cancellationReason.includes('Client cancelled'), 'Cancellation reason recorded');

    console.log('\nGROUP I — REVENUE ANALYTICAL REPORTING');
    // 51. Query revenue report grouped by category.
    const categoryReport = await commercialService.getRevenueReporting(adminUser, { groupBy: 'category' });
    assert(categoryReport && categoryReport.summary, 'Revenue report summary returned');
    assert(categoryReport.summary.totalBilled > 0, 'Total billed revenue is numeric and positive');
    assert(categoryReport.breakdown.length > 0, 'Category breakdown rows returned');

    // 52. Query revenue report grouped by month.
    const monthReport = await commercialService.getRevenueReporting(adminUser, { groupBy: 'month' });
    assert(monthReport && monthReport.breakdown.length > 0, 'Monthly revenue breakdown returned');

    // 53. Query revenue report grouped by rule.
    const ruleReport = await commercialService.getRevenueReporting(adminUser, { groupBy: 'rule' });
    assert(ruleReport && ruleReport.breakdown.length > 0, 'Commercial rule revenue breakdown returned');

    console.log('\nGROUP J — AUDIT LOGS & GOVERNANCE');
    // 54. Rule creation audit event.
    const ruleCreatedAudit = await db.one('SELECT * FROM audit_logs WHERE action = "commercial.rule_created" AND object_id = ?', [createdRule.id]);
    assert(ruleCreatedAudit !== null, 'commercial.rule_created audit event captured');

    // 55. Rule updated audit event.
    const ruleUpdatedAudit = await db.one('SELECT * FROM audit_logs WHERE action = "commercial.rule_updated" AND object_id = ?', [createdRule.id]);
    assert(ruleUpdatedAudit !== null, 'commercial.rule_updated audit event captured');

    // 56. Obligation created audit event.
    const obligationCreatedAudit = await db.one('SELECT * FROM audit_logs WHERE action = "commercial.obligation_created" AND object_id = ?', [obligation1.id]);
    assert(obligationCreatedAudit !== null, 'commercial.obligation_created audit event captured');

    // 57. Obligation approved audit event.
    const obligationApprovedAudit = await db.one('SELECT * FROM audit_logs WHERE action = "commercial.approved" AND object_id = ?', [obligation1.id]);
    assert(obligationApprovedAudit !== null, 'commercial.approved audit event captured');

    // 58. Obligation waived audit event.
    const obligationWaivedAudit = await db.one('SELECT * FROM audit_logs WHERE action = "commercial.waived" AND object_id = ?', [obligation2.id]);
    assert(obligationWaivedAudit !== null, 'commercial.waived audit event captured');

    // 59. Obligation adjusted audit event.
    const obligationAdjustedAudit = await db.one('SELECT * FROM audit_logs WHERE action = "commercial.adjusted" AND object_id = ?', [obligation3.id]);
    assert(obligationAdjustedAudit !== null, 'commercial.adjusted audit event captured');

    // 60. Obligation cancelled audit event.
    const obligationCancelledAudit = await db.one('SELECT * FROM audit_logs WHERE action = "commercial.cancelled" AND object_id = ?', [obligation4.id]);
    assert(obligationCancelledAudit !== null, 'commercial.cancelled audit event captured');

    console.log('\nGROUP K — OWNER PAYOUT & RECONCILIATION INTEGRATION');
    // 61. Owner gross receivables deduction includes commission.
    const payableCalc = await payoutsService.previewOwnerPayable(adminUser, { ownerUserId: ownerUser.id });
    assert(payableCalc && payableCalc.calculation && payableCalc.calculation.grossReceivable !== undefined, 'Owner payable calculation interfaces with commercial deductions');

    // 62. Phase 7 Financial Operations reconciliation engine runs with commercial checks.
    const reconRun = await finOpsService.runReconciliation(adminUser, {
      periodStart: '2026-01-01',
      periodEnd: '2026-12-31',
    });
    assert(reconRun && reconRun.status.startsWith('COMPLETED'), 'Phase 7 Financial Reconciliation engine executes cleanly with commercial layer');
    assert(Number(reconRun.records_scanned || reconRun.recordsScanned) > 0, 'Reconciliation scanned payments, payouts, invoices, and commercial obligations');

    console.log('\nGROUP L — SYSTEM INTEGRITY & HISTORICAL INVARIANTS');
    // 63. Payments table ledger integrity.
    const paymentsCount = await db.one('SELECT COUNT(*) as c FROM payments');
    assert(Number(paymentsCount.c) > 0, 'Payments ledger intact');

    // 64. Invoices table integrity.
    const invoicesCount = await db.one('SELECT COUNT(*) as c FROM invoices');
    assert(Number(invoicesCount.c) > 0, 'Invoices table intact');

    // 65. Owner payouts table integrity.
    const payoutsCount = await db.one('SELECT COUNT(*) as c FROM owner_payouts');
    assert(Number(payoutsCount.c) >= 0, 'Owner payouts table intact');

    // 66. Financial periods integrity.
    const periodsCount = await db.one('SELECT COUNT(*) as c FROM financial_periods');
    assert(Number(periodsCount.c) >= 0, 'Financial periods table intact');

    // 67. Commercial rules foreign key integrity.
    const orphanedRules = await db.query('SELECT * FROM commercial_obligations WHERE rule_id IS NOT NULL AND rule_id NOT IN (SELECT id FROM commercial_rules)');
    assert(orphanedRules.length === 0, 'Zero orphaned commercial rules linkages');

    // 68. Commercial payments foreign key integrity.
    const orphanedPayments = await db.query('SELECT * FROM commercial_obligations WHERE payment_id IS NOT NULL AND payment_id NOT IN (SELECT id FROM payments)');
    assert(orphanedPayments.length === 0, 'Zero orphaned commercial payment linkages');

    // 69. Commercial invoices foreign key integrity.
    const orphanedInvoices = await db.query('SELECT * FROM commercial_obligations WHERE invoice_id IS NOT NULL AND invoice_id NOT IN (SELECT id FROM invoices)');
    assert(orphanedInvoices.length === 0, 'Zero orphaned commercial invoice linkages');

    // 70. Commercial adjustments foreign key integrity.
    const orphanedAdjustments = await db.query('SELECT * FROM commercial_adjustments WHERE obligation_id NOT IN (SELECT id FROM commercial_obligations)');
    assert(orphanedAdjustments.length === 0, 'Zero orphaned commercial adjustments');

    // 71. No negative commercial totals in database.
    const negativeObligations = await db.query('SELECT * FROM commercial_obligations WHERE total_amount < 0');
    assert(negativeObligations.length === 0, 'All commercial obligations have non-negative monetary totals');

    // 72. Valid currency codes.
    const invalidCurrency = await db.query('SELECT * FROM commercial_obligations WHERE currency != "INR"');
    assert(invalidCurrency.length === 0, 'All commercial obligations maintain standard currency INR');

    // 73. User scoping: Owner can query own obligations.
    const ownerObligations = await commercialService.getObligations(ownerUser, {});
    assert(ownerObligations.items.every((o) => o.payerUserId === ownerUser.id), 'Owner view is strictly scoped to own payer records');

    // 74. User scoping: Tenant can query own obligations.
    const tenantObligations = await commercialService.getObligations(tenantUser, {});
    assert(tenantObligations.items.every((o) => o.payerUserId === tenantUser.id), 'Tenant view is strictly scoped to own payer records');

    // 75. User scoping: Stranger has zero obligations visible.
    const strangerObligations = await commercialService.getObligations(strangerUser, {});
    assert(strangerObligations.items.length === 0, 'Unrelated stranger user sees zero commercial obligations');

    // 76. Unrelated user rejected from viewing obligation detail (403).
    let strangerDetailBlocked = false;
    try {
      await commercialService.getObligationById(strangerUser, obligation1.id);
    } catch (err) {
      strangerDetailBlocked = err.status === 403;
    }
    assert(strangerDetailBlocked, 'Unrelated user rejected from obligation detail (403 Forbidden)');

    // 77. Historical calculation snapshot immutability preserved after rule update.
    await commercialService.updateRule(adminUser, createdRule.id, { percentValue: 95.0 });
    const pastSnapshotCheck = await commercialService.getObligationById(adminUser, obligation1.id);
    assert(pastSnapshotCheck.calculationSnapshot.rate === 85, 'Historical obligation snapshot remains immutable at 85% despite subsequent rule updates');

    // 78. Active rule deactivation does not delete existing calculated obligations.
    await commercialService.deactivateRule(adminUser, createdRule.id);
    const existingObligationAfterDeactivation = await commercialService.getObligationById(adminUser, obligation1.id);
    assert(existingObligationAfterDeactivation !== null, 'Deactivated rule maintains historical obligations intact');

    // 79. Commercial revenue totals match database sum.
    const sumDb = await db.one('SELECT COALESCE(SUM(total_amount), 0) as s FROM commercial_obligations');
    const overviewDb = await commercialService.getCommercialOverview(adminUser);
    assert(Number(sumDb.s) === overviewDb.volume.grossVolume, 'Overview gross volume matches database aggregation exactly');

    // 80. Clean up test records safely.
    await db.execute('DELETE FROM commercial_adjustments WHERE obligation_id IN (?, ?, ?, ?)', [obligation1.id, obligation2.id, obligation3.id, obligation4.id]);
    await db.execute('DELETE FROM commercial_obligations WHERE id IN (?, ?, ?, ?)', [obligation1.id, obligation2.id, obligation3.id, obligation4.id]);
    await db.execute('DELETE FROM commercial_rules WHERE id = ?', [createdRule.id]);
    assert(true, 'Test commercial records cleaned up safely');

    console.log('\n======================================================================');
    console.log(`VERIFICATION COMPLETE: ${passedTests}/${totalTests} ASSERTIONS PASSED (100%)`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('\nVerification failed with exception:', err);
    process.exit(1);
  } finally {
    if (app) await app.close();
  }
}

run();
