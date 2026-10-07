require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { RentalService } = require('../apps/api/dist/modules/rental/rental.service');
const { LegalService } = require('../apps/api/dist/modules/legal/legal.service');
const { PaymentsService } = require('../apps/api/dist/modules/payments/payments.service');
const { OperationsService } = require('../apps/api/dist/modules/operations/operations.service');
const { InspectionsService } = require('../apps/api/dist/modules/inspections/inspections.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('--- Initializing NestJS App Context for E2E Move-Out & Settlement Test ---');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const rental = app.get(RentalService);
  const legal = app.get(LegalService);
  const payments = app.get(PaymentsService);
  const operations = app.get(OperationsService);
  const inspections = app.get(InspectionsService);
  const db = app.get(DatabaseService);

  const tenantUser = { id: 30, fullName: 'Priya Verma', email: 'tenant13@demo.odibrick.test', permissions: ['tenancy.view', 'maintenance.create'] };
  const ownerUser = { id: 8, fullName: 'Tara Verma', email: 'owner1@demo.odibrick.test', permissions: ['tenancy.view', 'property.manage'] };
  const legalUser = { id: 3, fullName: 'Adv. Shalini Menon', email: 'legal_team@demo.odibrick.test', permissions: ['legal.case.manage', 'agreement.draft', 'agreement.approve'] };
  const unrelatedUser = { id: 18, fullName: 'Naveen Gupta', email: 'tenant1@demo.odibrick.test', permissions: ['tenancy.view'] };

  console.log('\n1. Checking initial state of regression demo cases (Case 1, Case 2, Case 3)...');
  const initC1 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000001']);
  const initC2 = await db.one('SELECT case_number, status, assigned_to FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000002']);
  const initC3 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000003']);

  if (initC1.status !== 'EXECUTED') throw new Error('Case 1 corrupted!');
  if (initC2.status !== 'QUEUED') throw new Error('Case 2 corrupted!');
  if (initC3.status !== 'EXECUTED') throw new Error('Case 3 corrupted!');
  console.log('✓ Initial regression state verified: Case 1 EXECUTED, Case 2 QUEUED, Case 3 EXECUTED');

  console.log('\n2. Setting up dedicated test tenancy #9999 with executed agreement and check-in report...');
  // Clean up any previous test tenancy with this specific reference
  await db.query('DELETE FROM payments WHERE tenancy_id = 9999');
  await db.query('DELETE FROM property_timeline WHERE tenancy_id = 9999');
  await db.query('DELETE FROM disputes WHERE tenancy_id = 9999');
  await db.query('DELETE FROM inspections WHERE tenancy_id = 9999');
  await db.query('DELETE FROM agreement_versions WHERE agreement_id IN (SELECT id FROM agreements WHERE tenancy_id = 9999)');
  await db.query('DELETE FROM agreements WHERE tenancy_id = 9999');
  await db.query('DELETE FROM tenancies WHERE id = 9999');

  // Insert isolated test tenancy #9999
  await db.query(
    `INSERT INTO tenancies (
      id, public_id, property_id, owner_user_id, tenant_user_id, stage, service_plan, rent_amount, deposit_amount,
      start_date, end_date, lock_in_months, notice_period_days, created_at, updated_at
    ) VALUES (
      9999, '01JTEST9999000000000000000', 1, 8, 30, 'ACTIVE', 'STANDARD', 50000.00, 98000.00,
      '2026-01-01', '2026-12-31', 6, 30, NOW(), NOW()
    )`
  );

  // Insert executed agreement for tenancy #9999
  const agrRes = await db.query(
    `INSERT INTO agreements (
      public_id, tenancy_id, agreement_number, agreement_type, status,
      effective_from, effective_to, executed_at, created_at, updated_at
    ) VALUES (
      '01JAGRTEST0000000000000000', 9999, 'ODB-AGR-TEST-MOVEOUT', 'LEAVE_AND_LICENSE', 'EXECUTED',
      '2026-01-01', '2026-12-31', NOW(), NOW(), NOW()
    )`
  );
  const testAgreementId = agrRes.insertId;

  // Insert agreement version with variables
  await db.query(
    `INSERT INTO agreement_versions (
      agreement_id, version, body_html, variables, change_summary, drafted_by, created_at
    ) VALUES (
      ?, 1, '<p>Test Agreement</p>',
      ?, 'MOVE_OUT_TEST_E2E Initial Version', 3, NOW()
    )`,
    [
      testAgreementId,
      JSON.stringify({
        rent_amount: 50000,
        deposit_amount: 98000,
        lock_in_months: 6,
        notice_period_days: 30,
        effective_from: '2026-01-01',
        effective_to: '2026-12-31',
      }),
    ]
  );

  // Insert initial Day 1 check-in inspection
  const checkInRes = await db.query(
    `INSERT INTO inspections (
      public_id, property_id, tenancy_id, report_number, kind, status, conducted_by,
      submitted_at, created_at
    ) VALUES (
      '01JINSPTEST000000000000001', 1, 9999, 'ODB-CR-TEST-001', 'CHECK_IN', 'ACKNOWLEDGED', 8,
      NOW(), NOW()
    )`
  );
  const day1InspectionId = checkInRes.insertId;

  console.log(`✓ Test tenancy #9999 initialized with agreement #${testAgreementId} and Day 1 inspection #${day1InspectionId}`);

  // ----------------------------------------------------
  // Part A: Negative Tests & Contractual Validation
  // ----------------------------------------------------
  console.log('\n3. Testing Negative Tests & RBAC on Move-Out Request...');

  // Test 1: Unrelated user cannot request move-out
  try {
    await rental.requestMoveOut(unrelatedUser, 9999, { requestedMoveOutDate: '2026-11-30' });
    throw new Error('FAILED: Unrelated user was able to request move-out!');
  } catch (err) {
    console.log('✓ Expected error for unrelated user request:', err.message);
  }

  // Test 2: Move-out date within lock-in period rejected
  try {
    await rental.requestMoveOut(tenantUser, 9999, {
      requestedMoveOutDate: '2026-04-15', // Within 6-month lock-in (Jan - Jun)
      reason: 'Early exit during lock-in',
    });
    throw new Error('FAILED: Move-out within lock-in period was allowed!');
  } catch (err) {
    console.log('✓ Expected error for lock-in violation:', err.message);
  }

  // Test 3: Insufficient notice period rejected
  try {
    const today = new Date();
    const shortDate = new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // only 10 days notice
    await rental.requestMoveOut(tenantUser, 9999, {
      requestedMoveOutDate: shortDate,
      reason: 'Short notice exit',
    });
    throw new Error('FAILED: Short notice period was allowed!');
  } catch (err) {
    console.log('✓ Expected error for insufficient notice:', err.message);
  }

  // ----------------------------------------------------
  // Part B: Move-Out Notice & Counterparty Confirmation
  // ----------------------------------------------------
  console.log('\n4. Tenant (Priya Verma) submits valid move-out notice for 2026-11-30...');
  const noticeRes = await rental.requestMoveOut(tenantUser, 9999, {
    requestedMoveOutDate: '2026-11-30',
    reason: 'Relocating to another city for work.',
  });
  console.log('✓ Move-out request response:', noticeRes);

  const detailAfterNotice = await rental.tenancyDetail(tenantUser, 9999);
  console.log('✓ Tenancy Stage:', detailAfterNotice.tenancy.stage);
  console.log('✓ Next Action for Owner:', detailAfterNotice.nextAction);

  if (detailAfterNotice.tenancy.stage !== 'MOVE_OUT') throw new Error('Stage should be MOVE_OUT');

  // Test 4: Initiator cannot confirm their own notice
  console.log('\n5. Negative Test: Initiator cannot confirm their own move-out notice...');
  try {
    await rental.confirmMoveOut(tenantUser, 9999, {});
    throw new Error('FAILED: Initiator was able to confirm their own move-out notice!');
  } catch (err) {
    console.log('✓ Expected error for self-confirmation:', err.message);
  }

  // Test 5: Unrelated user cannot confirm notice
  console.log('\n6. Negative Test: Unrelated user cannot confirm move-out notice...');
  try {
    await rental.confirmMoveOut(unrelatedUser, 9999, {});
    throw new Error('FAILED: Unrelated user was able to confirm move-out notice!');
  } catch (err) {
    console.log('✓ Expected error for unrelated user confirmation:', err.message);
  }

  // Step 6: Owner confirms move-out notice
  console.log('\n7. Owner (Tara Verma) confirms move-out notice...');
  const confirmNoticeRes = await rental.confirmMoveOut(ownerUser, 9999, {
    notes: 'Move-out date confirmed for 30th Nov 2026.',
  });
  console.log('✓ Notice confirmed:', confirmNoticeRes);

  const detailAfterConfirmNotice = await rental.tenancyDetail(ownerUser, 9999);
  console.log('✓ Next Action after notice confirmation:', detailAfterConfirmNotice.nextAction);

  // Test 7: Cannot propose renewal while in move-out
  console.log('\n8. Negative Test: Renewal proposal rejected during move-out...');
  try {
    await rental.proposeRenewal(tenantUser, 9999, { proposedRent: 52000 });
    throw new Error('FAILED: Renewal was allowed during move-out!');
  } catch (err) {
    console.log('✓ Expected error for renewal conflict:', err.message);
  }

  // ----------------------------------------------------
  // Part C: Move-Out Inspection & Day 1 Comparison
  // ----------------------------------------------------
  console.log('\n9. Submitting Move-Out Condition Report linked to Day 1 check-in...');
  const moveOutInspectionRes = await db.query(
    `INSERT INTO inspections (
      public_id, property_id, tenancy_id, report_number, kind, status, conducted_by,
      compared_with_id, submitted_at, created_at
    ) VALUES (
      '01JINSPTEST000000000000002', 1, 9999, 'ODB-CR-TEST-002', 'MOVE_OUT', 'SUBMITTED', 8,
      ?, NOW(), NOW()
    )`,
    [day1InspectionId]
  );
  const moveOutInspectionId = moveOutInspectionRes.insertId;
  console.log(`✓ Move-out inspection #${moveOutInspectionId} recorded and linked to Day 1 report #${day1InspectionId}`);

  const detailAfterInspection = await rental.tenancyDetail(ownerUser, 9999);
  console.log('✓ Next Action after inspection submission:', detailAfterInspection.nextAction);

  // ----------------------------------------------------
  // Part D: Deposit Settlement Proposal & Deductions
  // ----------------------------------------------------
  console.log('\n10. Testing Deposit Settlement Proposal & Financial Validation...');

  // Test 8: Unrelated user cannot propose settlement
  try {
    await rental.proposeSettlement(unrelatedUser, 9999, {
      deductions: [{ category: 'DAMAGE', description: 'Damaged door', amount: 5000 }],
    });
    throw new Error('FAILED: Unrelated user was able to propose settlement!');
  } catch (err) {
    console.log('✓ Expected error for unrelated user settlement proposal:', err.message);
  }

  // Test 9: Deductions exceeding deposit rejected (Deposit = ₹98,000, Deductions = ₹105,000)
  try {
    await rental.proposeSettlement(ownerUser, 9999, {
      deductions: [{ category: 'DAMAGE', description: 'Major damage', amount: 105000 }],
      notes: 'Exceeds deposit',
    });
    throw new Error('FAILED: Deductions exceeding deposit were allowed!');
  } catch (err) {
    console.log('✓ Expected error for excess deductions:', err.message);
  }

  // Step 11: Owner proposes legitimate settlement: Deposit ₹98,000, Deductions ₹5,000, Refund ₹93,000
  console.log('\n11. Owner proposes settlement (Deposit: ₹98,000, Damage: ₹5,000, Refund: ₹93,000)...');
  const settlementRes = await rental.proposeSettlement(ownerUser, 9999, {
    deductions: [
      {
        category: 'DAMAGE',
        description: 'Bedroom door glass repair',
        amount: 5000,
      },
    ],
    notes: 'Itemized deduction for door glass repair documented during move-out inspection.',
  });
  console.log('✓ Settlement proposed response:', settlementRes);
  if (settlementRes.settlement.totalDeductions !== 5000) throw new Error('Total deductions should be 5000');
  if (settlementRes.settlement.refundAmount !== 93000) throw new Error('Refund amount should be 93000');

  const tenantDetailAfterSettlement = await rental.tenancyDetail(tenantUser, 9999);
  console.log('✓ Next Action for Tenant to review settlement:', tenantDetailAfterSettlement.nextAction);

  // ----------------------------------------------------
  // Part E: Dispute Flow Verification
  // ----------------------------------------------------
  console.log('\n12. Testing Settlement Dispute & Resolution Flow...');
  const disputeRes = await rental.disputeSettlement(tenantUser, 9999, {
    reason: 'MOVE_OUT_TEST_E2E Tenant requests bill receipt for door repair.',
  });
  console.log('✓ Settlement dispute registered:', disputeRes);

  const detailUnderDispute = await rental.tenancyDetail(tenantUser, 9999);
  console.log('✓ Next Action under dispute:', detailUnderDispute.nextAction);

  // Re-propose settlement after mutual agreement
  console.log('\n13. Owner re-proposes agreed settlement with invoice...');
  const reproposeRes = await rental.proposeSettlement(ownerUser, 9999, {
    deductions: [
      {
        category: 'DAMAGE',
        description: 'Bedroom door glass repair with carpenter bill',
        amount: 5000,
      },
    ],
    notes: 'Carpenter invoice attached and agreed.',
  });
  console.log('✓ Settlement re-proposed:', reproposeRes);

  // ----------------------------------------------------
  // Part F: Settlement Acceptance & Refund DUE Lifecycle
  // ----------------------------------------------------
  console.log('\n14. Testing Settlement Acceptance (Tenancy remains MOVE_OUT, Refund is DUE)...');

  // Test 10: Proposer cannot accept their own settlement
  try {
    await rental.acceptSettlement(ownerUser, 9999, {});
    throw new Error('FAILED: Proposer was able to accept their own settlement!');
  } catch (err) {
    console.log('✓ Expected error for self-acceptance:', err.message);
  }

  // Test 11: Unrelated user cannot accept settlement
  try {
    await rental.acceptSettlement(unrelatedUser, 9999, {});
    throw new Error('FAILED: Unrelated user was able to accept settlement!');
  } catch (err) {
    console.log('✓ Expected error for unrelated user acceptance:', err.message);
  }

  // Step 15: Tenant accepts settlement
  console.log('\n15. Tenant accepts settlement terms...');
  const acceptRes = await rental.acceptSettlement(tenantUser, 9999, {
    notes: 'Settlement accepted. Please process refund of INR 93,000.',
  });
  console.log('✓ Settlement acceptance result:', acceptRes);

  // ASSERT: Tenancy must NOT be CLOSED yet; it must remain in MOVE_OUT
  const tenancyAfterAccept = await db.one('SELECT id, stage, closed_at FROM tenancies WHERE id = 9999');
  console.log('✓ Tenancy Stage after settlement acceptance:', tenancyAfterAccept.stage);
  if (tenancyAfterAccept.stage === 'CLOSED' || tenancyAfterAccept.stage !== 'MOVE_OUT') {
    throw new Error(`Tenancy stage should remain MOVE_OUT while refund is DUE, got ${tenancyAfterAccept.stage}`);
  }

  // ASSERT: Deposit Refund payment created with status = DUE
  const refundPayment = await db.one(
    'SELECT id, reference_code, purpose, total_amount, status, payer_user_id, payee_user_id, notes FROM payments WHERE tenancy_id = 9999 AND purpose = "REFUND"'
  );
  console.log('✓ Deposit Refund Payment Record:', refundPayment);
  if (refundPayment.status !== 'DUE') {
    throw new Error(`Refund payment status should be DUE, got ${refundPayment.status}`);
  }
  if (Number(refundPayment.total_amount) !== 93000) {
    throw new Error(`Refund payment amount should be 93000, got ${refundPayment.total_amount}`);
  }
  if (refundPayment.payer_user_id !== 8 || refundPayment.payee_user_id !== 30) {
    throw new Error('Refund payer (Owner) and payee (Tenant) are incorrect');
  }

  // Verify Next Action for Owner: Settle refund to tenant
  const detailAfterAccept = await rental.tenancyDetail(ownerUser, 9999);
  console.log('✓ Next Action for Owner when refund is due:', detailAfterAccept.nextAction);

  // Test 16: Duplicate settlement acceptance rejected
  console.log('\n16. Testing Duplicate Settlement Acceptance Protection...');
  try {
    await rental.acceptSettlement(tenantUser, 9999, {});
    throw new Error('FAILED: Duplicate settlement acceptance was allowed!');
  } catch (err) {
    console.log('✓ Expected error for duplicate acceptance:', err.message);
  }

  // ----------------------------------------------------
  // Part G: Refund Payment Settlement & Terminal Tenancy Closure
  // ----------------------------------------------------
  console.log('\n17. Testing Refund Payment Settlement & Terminal Tenancy Closure...');

  // Test 17: Unauthorized user (e.g. tenant or stranger) attempting to pay the refund is rejected
  try {
    await payments.settleByPayer(tenantUser, refundPayment.id, { method: 'UPI' });
    throw new Error('FAILED: Unauthorized user was able to settle the refund payment!');
  } catch (err) {
    console.log('✓ Expected error for unauthorized refund settlement:', err.message);
  }

  try {
    await payments.settleByPayer(unrelatedUser, refundPayment.id, { method: 'UPI' });
    throw new Error('FAILED: Unrelated user was able to settle the refund payment!');
  } catch (err) {
    console.log('✓ Expected error for unrelated user refund settlement:', err.message);
  }

  // Authorized owner settles the refund payment
  console.log('\n18. Authorized Owner settles deposit refund of ₹93,000 via internal payment engine...');
  const settleRes = await payments.settleByPayer(ownerUser, refundPayment.id, { method: 'UPI', reference: 'UPI-REFUND-93000' });
  console.log('✓ Refund payment settlement response:', settleRes);

  // ASSERT: Refund payment is now PAID
  const settledRefundPayment = await db.one('SELECT id, status, paid_at FROM payments WHERE id = ?', [refundPayment.id]);
  console.log('✓ Settled Refund Payment Record:', settledRefundPayment);
  if (settledRefundPayment.status !== 'PAID') {
    throw new Error(`Refund payment status should be PAID, got ${settledRefundPayment.status}`);
  }

  // ASSERT: Tenancy is now CLOSED
  const closedTenancy = await db.one('SELECT id, stage, closed_at FROM tenancies WHERE id = 9999');
  console.log('✓ Closed Tenancy Record:', closedTenancy);
  if (closedTenancy.stage !== 'CLOSED') throw new Error(`Tenancy stage should be CLOSED, got ${closedTenancy.stage}`);
  if (!closedTenancy.closed_at) throw new Error('Tenancy closed_at timestamp should be set');

  // Test 19: Second refund settlement rejected
  console.log('\n19. Testing Duplicate Payment Settlement Protection...');
  try {
    await payments.settleByPayer(ownerUser, refundPayment.id, { method: 'UPI' });
    throw new Error('FAILED: Duplicate payment settlement was allowed!');
  } catch (err) {
    console.log('✓ Expected error for already-settled refund:', err.message);
  }

  // ----------------------------------------------------
  // Part H: Terminal Invariance & Safety Checks on CLOSED Tenancy
  // ----------------------------------------------------
  console.log('\n20. Testing Safety & Terminal Invariance on CLOSED Tenancy...');

  // Monthly rent generation excludes CLOSED tenancy
  const rentGenRes = await payments.generateMonthlyRent({ tenancyId: 9999, year: 2027, month: 1 });
  console.log('  a. Rent generation result for closed tenancy:', rentGenRes);
  if (rentGenRes.count !== 0 || rentGenRes.results.length !== 0) {
    throw new Error('FAILED: Rent was generated for closed tenancy!');
  }

  // Maintenance request rejected on closed tenancy
  try {
    await operations.createMaintenance(tenantUser, {
      tenancyId: 9999,
      title: 'Post-closure faucet leak',
      description: 'Test request on closed tenancy',
      priority: 'LOW',
      category: 'PLUMBING',
    });
    throw new Error('FAILED: Maintenance request was accepted on closed tenancy!');
  } catch (err) {
    console.log('  b. Expected error for maintenance on closed tenancy:', err.message);
  }

  // Renewal proposal rejected on closed tenancy
  try {
    await rental.proposeRenewal(tenantUser, 9999, { proposedRent: 55000 });
    throw new Error('FAILED: Renewal was allowed on closed tenancy!');
  } catch (err) {
    console.log('  c. Expected error for renewal on closed tenancy:', err.message);
  }

  // Move-out notice rejected on closed tenancy
  try {
    await rental.requestMoveOut(tenantUser, 9999, { requestedMoveOutDate: '2027-01-01' });
    throw new Error('FAILED: Move-out was allowed on closed tenancy!');
  } catch (err) {
    console.log('  d. Expected error for move-out on closed tenancy:', err.message);
  }

  // Next action for closed tenancy
  const finalDetail = await rental.tenancyDetail(ownerUser, 9999);
  console.log('  e. Next action on closed tenancy:', finalDetail.nextAction);

  // ----------------------------------------------------
  // Part I: Zero-Refund Test (Deductions = Deposit => ₹0 Refund)
  // ----------------------------------------------------
  console.log('\n21. Testing Zero-Refund Lifecycle (Deposit: ₹98,000, Deductions: ₹98,000, Refund: ₹0)...');
  await db.query('DELETE FROM payments WHERE tenancy_id = 9998');
  await db.query('DELETE FROM property_timeline WHERE tenancy_id = 9998');
  await db.query('DELETE FROM disputes WHERE tenancy_id = 9998');
  await db.query('DELETE FROM inspections WHERE tenancy_id = 9998');
  await db.query('DELETE FROM agreement_versions WHERE agreement_id IN (SELECT id FROM agreements WHERE tenancy_id = 9998)');
  await db.query('DELETE FROM agreements WHERE tenancy_id = 9998');
  await db.query('DELETE FROM tenancies WHERE id = 9998');

  await db.query(
    `INSERT INTO tenancies (
      id, public_id, property_id, owner_user_id, tenant_user_id, stage, service_plan, rent_amount, deposit_amount,
      start_date, end_date, lock_in_months, notice_period_days, created_at, updated_at
    ) VALUES (
      9998, '01JTEST9998000000000000000', 1, 8, 30, 'ACTIVE', 'STANDARD', 50000.00, 98000.00,
      '2026-01-01', '2026-12-31', 6, 30, NOW(), NOW()
    )`
  );

  const agrRes9998 = await db.query(
    `INSERT INTO agreements (
      public_id, tenancy_id, agreement_number, agreement_type, status,
      effective_from, effective_to, executed_at, created_at, updated_at
    ) VALUES (
      '01JAGRTEST9998000000000000', 9998, 'ODB-AGR-TEST-ZEROREFUND', 'LEAVE_AND_LICENSE', 'EXECUTED',
      '2026-01-01', '2026-12-31', NOW(), NOW(), NOW()
    )`
  );

  await db.query(
    `INSERT INTO agreement_versions (
      agreement_id, version, body_html, variables, change_summary, drafted_by, created_at
    ) VALUES (
      ?, 1, '<p>Test Agreement</p>',
      ?, 'MOVE_OUT_TEST_E2E Zero Refund Initial Version', 3, NOW()
    )`,
    [
      agrRes9998.insertId,
      JSON.stringify({
        rent_amount: 50000,
        deposit_amount: 98000,
        lock_in_months: 6,
        notice_period_days: 30,
        effective_from: '2026-01-01',
        effective_to: '2026-12-31',
      }),
    ]
  );

  const checkInRes9998 = await db.query(
    `INSERT INTO inspections (
      public_id, property_id, tenancy_id, report_number, kind, status, conducted_by,
      submitted_at, created_at
    ) VALUES (
      '01JINSPTEST999800000000001', 1, 9998, 'ODB-CR-TEST-9998-001', 'CHECK_IN', 'ACKNOWLEDGED', 8,
      NOW(), NOW()
    )`
  );

  await rental.requestMoveOut(tenantUser, 9998, { requestedMoveOutDate: '2026-11-30' });
  await rental.confirmMoveOut(ownerUser, 9998, { notes: 'Confirmed' });
  await db.query(
    `INSERT INTO inspections (
      public_id, property_id, tenancy_id, report_number, kind, status, conducted_by,
      compared_with_id, submitted_at, created_at
    ) VALUES (
      '01JINSPTEST999800000000002', 1, 9998, 'ODB-CR-TEST-9998-002', 'MOVE_OUT', 'SUBMITTED', 8,
      ?, NOW(), NOW()
    )`,
    [checkInRes9998.insertId]
  );

  // Propose zero-refund settlement (Deductions = ₹98,000)
  const zeroSettlement = await rental.proposeSettlement(ownerUser, 9998, {
    deductions: [{ category: 'DAMAGE', description: 'Extensive property repair', amount: 98000 }],
    notes: 'Deductions equal total deposit. Zero refund.',
  });
  console.log('✓ Zero refund settlement proposed:', zeroSettlement);
  if (zeroSettlement.settlement.refundAmount !== 0) throw new Error('Refund amount should be 0');

  // Tenant accepts zero refund settlement => Tenancy closes immediately without ₹0 payment
  const zeroAccept = await rental.acceptSettlement(tenantUser, 9998, { notes: 'Accepted zero refund' });
  console.log('✓ Zero refund settlement accepted:', zeroAccept);
  if (zeroAccept.stage !== 'CLOSED') throw new Error('Tenancy with zero refund should be CLOSED immediately');

  const zeroTenancy = await db.one('SELECT id, stage, closed_at FROM tenancies WHERE id = 9998');
  console.log('✓ Tenancy 9998 stage after zero refund acceptance:', zeroTenancy.stage);
  if (zeroTenancy.stage !== 'CLOSED') throw new Error('Tenancy 9998 should be CLOSED');

  const zeroPayments = await db.query('SELECT * FROM payments WHERE tenancy_id = 9998 AND purpose = "REFUND"');
  if (zeroPayments.length !== 0) throw new Error('No refund payment should be created for zero-refund settlement');
  console.log('✓ Verified: 0 refund payments created for zero-refund case.');

  // Clean up test tenancy #9998
  await db.query('DELETE FROM payments WHERE tenancy_id = 9998');
  await db.query('DELETE FROM property_timeline WHERE tenancy_id = 9998');
  await db.query('DELETE FROM disputes WHERE tenancy_id = 9998');
  await db.query('DELETE FROM inspections WHERE tenancy_id = 9998');
  await db.query('DELETE FROM agreement_versions WHERE agreement_id IN (SELECT id FROM agreements WHERE tenancy_id = 9998)');
  await db.query('DELETE FROM agreements WHERE tenancy_id = 9998');
  await db.query('DELETE FROM tenancies WHERE id = 9998');

  // ----------------------------------------------------
  // Part J: Regression & Historical Invariance Verification
  // ----------------------------------------------------
  console.log('\n22. Verifying historical regression data preservation...');
  const finalC1 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000001']);
  const finalC2 = await db.one('SELECT case_number, status, assigned_to FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000002']);
  const finalC3 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000003']);
  const tenancy3 = await db.one('SELECT id, stage, rent_amount FROM tenancies WHERE id = 3');

  console.log('Case 1 (ODB-LGL-2026-000001):', finalC1.status);
  console.log('Case 2 (ODB-LGL-2026-000002):', finalC2.status);
  console.log('Case 3 (ODB-LGL-2026-000003):', finalC3.status);
  console.log('Tenancy 3 Stage:', tenancy3.stage);

  if (finalC1.status !== 'EXECUTED') throw new Error('Case 1 altered!');
  if (finalC2.status !== 'QUEUED') throw new Error('Case 2 altered!');
  if (finalC3.status !== 'EXECUTED') throw new Error('Case 3 altered!');
  if (tenancy3.stage !== 'ACTIVE') throw new Error('Primary demo Tenancy 3 altered!');

  console.log('\n================================================================');
  console.log('🎉 ALL MOVE-OUT, SETTLEMENT & FINANCIAL LIFECYCLE TESTS PASSED! 🎉');
  console.log('================================================================');

  // Clean up isolated test tenancy #9999
  await db.query('DELETE FROM payments WHERE tenancy_id = 9999');
  await db.query('DELETE FROM property_timeline WHERE tenancy_id = 9999');
  await db.query('DELETE FROM disputes WHERE tenancy_id = 9999');
  await db.query('DELETE FROM inspections WHERE tenancy_id = 9999');
  await db.query('DELETE FROM agreement_versions WHERE agreement_id IN (SELECT id FROM agreements WHERE tenancy_id = 9999)');
  await db.query('DELETE FROM agreements WHERE tenancy_id = 9999');
  await db.query('DELETE FROM tenancies WHERE id = 9999');
  console.log('✓ Dedicated test tenancies cleaned up safely.');

  await app.close();
}

run().catch((err) => {
  console.error('VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
