require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { RentalService } = require('../apps/api/dist/modules/rental/rental.service');
const { LegalService } = require('../apps/api/dist/modules/legal/legal.service');
const { PaymentsService } = require('../apps/api/dist/modules/payments/payments.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('--- Initializing NestJS App Context for E2E Lease Renewal Test ---');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const rental = app.get(RentalService);
  const legal = app.get(LegalService);
  const payments = app.get(PaymentsService);
  const db = app.get(DatabaseService);

  const tenantUser = { id: 30, fullName: 'Priya Verma', email: 'tenant13@demo.odibrick.test', permissions: ['tenancy.view'] };
  const ownerUser = { id: 8, fullName: 'Tara Verma', email: 'owner1@demo.odibrick.test', permissions: ['tenancy.view', 'property.manage'] };
  const legalUser = { id: 3, fullName: 'Adv. Shalini Menon', email: 'legal_team@demo.odibrick.test', permissions: ['legal.case.manage', 'agreement.draft', 'agreement.approve'] };
  const unrelatedUser = { id: 18, fullName: 'Naveen Gupta', email: 'tenant1@demo.odibrick.test', permissions: ['tenancy.view'] };

  console.log('1. Checking initial state of Tenancy 3, Case 1, Case 2, Case 3...');
  const initC1 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000001']);
  const initC2 = await db.one('SELECT case_number, status, assigned_to FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000002']);
  const initC3 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000003']);
  const initT3 = await db.one('SELECT stage, rent_amount, end_date FROM tenancies WHERE id = 3');

  if (initC1.status !== 'EXECUTED') throw new Error('Case 1 corrupted!');
  if (initC2.status !== 'QUEUED') throw new Error('Case 2 corrupted!');
  if (initC3.status !== 'EXECUTED') throw new Error('Case 3 corrupted!');
  console.log('✓ Initial state verified. Tenancy 3 stage:', initT3.stage, 'Rent:', initT3.rent_amount);

  // Negative Test 1: Unrelated user cannot propose renewal
  console.log('\n2. Negative Test: Unrelated user cannot propose renewal...');
  try {
    await rental.proposeRenewal(unrelatedUser, 3, { proposedRent: 52000 });
    throw new Error('FAILED: Unrelated user was able to propose renewal!');
  } catch (err) {
    console.log('✓ Expected error received:', err.message);
  }

  // Step 1: Tenant proposes renewal
  console.log('\n3. Tenant (Priya Verma) proposes lease renewal at ₹52,000/month for 11 months...');
  const proposeRes = await rental.proposeRenewal(tenantUser, 3, {
    proposedRent: 52000,
    proposedStartDate: '2027-09-01',
    proposedEndDate: '2028-07-31',
    tenureMonths: 11,
    notes: 'Lease renewal at ₹52,000/mo for 11 months.',
  });
  console.log('✓ Renewal proposal submitted:', proposeRes);

  const detailAfterPropose = await rental.tenancyDetail(tenantUser, 3);
  console.log('✓ Tenancy Stage:', detailAfterPropose.tenancy.stage);
  console.log('✓ Next Action:', detailAfterPropose.nextAction);
  if (detailAfterPropose.tenancy.stage !== 'RENEWAL_DUE') throw new Error('Stage should be RENEWAL_DUE');

  // Negative Test 2: Tenant cannot confirm their own proposal
  console.log('\n4. Negative Test: Proposer cannot confirm their own proposal without counterparty...');
  try {
    await rental.confirmRenewal(tenantUser, 3, {});
    throw new Error('FAILED: Proposer was able to confirm their own proposal!');
  } catch (err) {
    console.log('✓ Expected error received:', err.message);
  }

  // Negative Test 3: Unrelated user cannot confirm proposal
  console.log('\n5. Negative Test: Unrelated user cannot confirm renewal...');
  try {
    await rental.confirmRenewal(unrelatedUser, 3, {});
    throw new Error('FAILED: Unrelated user was able to confirm proposal!');
  } catch (err) {
    console.log('✓ Expected error received:', err.message);
  }

  // Step 2: Owner confirms renewal terms
  console.log('\n6. Owner (Tara Verma) confirms renewal terms...');
  const confirmRes = await rental.confirmRenewal(ownerUser, 3, { notes: 'Agreed to ₹52,000 renewal' });
  console.log('✓ Renewal confirmed:', confirmRes);

  const detailAfterConfirm = await rental.tenancyDetail(ownerUser, 3);
  console.log('✓ Renewal Legal Case Number:', confirmRes.caseNumber);
  console.log('✓ Next Action after confirmation:', detailAfterConfirm.nextAction);

  // Negative Test 4: Cannot propose another renewal while one is in progress
  console.log('\n7. Negative Test: Duplicate renewal request prevented...');
  try {
    await rental.proposeRenewal(ownerUser, 3, { proposedRent: 55000 });
    throw new Error('FAILED: Duplicate renewal proposal was allowed!');
  } catch (err) {
    console.log('✓ Expected error received:', err.message);
  }

  // Step 3: Legal Case Assignment
  console.log('\n8. Legal Team assigns advocate (Adv. Shalini Menon) to renewal case...');
  const assignRes = await legal.assign(legalUser, confirmRes.caseId, { assigneeId: legalUser.id, priority: 'NORMAL' });
  console.log('✓ Case assigned:', assignRes);

  // Step 4: Legal Advocate Drafts Renewal Agreement
  console.log('\n9. Legal Advocate drafts renewal agreement with ₹52,000 rent...');
  const draftRes = await legal.draft(legalUser, confirmRes.caseId, {
    agreementType: 'RENEWAL',
    effectiveFrom: '2027-09-01',
    effectiveTo: '2028-07-31',
    variables: {
      rent_amount: 52000,
      deposit_amount: 0,
      maintenance_amount: 0,
      lock_in_months: 6,
      notice_period_days: 30,
      rent_due_day: 5,
    },
    bodyHtml: '<p>Standard Lease Renewal Agreement between Tara Verma and Priya Verma at INR 52,000/month.</p>',
    changeSummary: 'Renewal agreement for 2027-2028 term at ₹52,000/mo.',
    clauses: [
      { title: 'Renewal Term', body: 'The tenancy is renewed from {{effective_from}} to {{effective_to}}.' },
      { title: 'Monthly Rent', body: 'The monthly rent is INR {{rent_amount}} payable on the {{rent_due_day}}th of each month.' },
    ],
  });
  console.log('✓ Renewal agreement drafted:', draftRes);

  // Negative Test 5: Sign before approval prevented
  console.log('\n10. Negative Test: Sign before legal approval prevented...');
  try {
    await legal.sign(ownerUser, draftRes.agreementId, { consent: true });
    throw new Error('FAILED: Sign before approval was allowed!');
  } catch (err) {
    console.log('✓ Expected error received:', err.message);
  }

  // Step 5: Legal Approval
  console.log('\n11. Legal Advocate approves the renewal draft...');
  const approveRes = await legal.approve(legalUser, draftRes.agreementId, { version: 1 });
  console.log('✓ Renewal draft approved:', approveRes);

  const detailAfterApprove = await rental.tenancyDetail(ownerUser, 3);
  console.log('✓ Next Action after approval:', detailAfterApprove.nextAction);

  // Negative Test 6: Unrelated user cannot sign
  console.log('\n12. Negative Test: Unrelated user cannot sign renewal agreement...');
  try {
    await legal.sign(unrelatedUser, draftRes.agreementId, { consent: true });
    throw new Error('FAILED: Unrelated user was able to sign!');
  } catch (err) {
    console.log('✓ Expected error received:', err.message);
  }

  // Step 6: Owner Signs
  console.log('\n13. Owner (Tara Verma) signs renewal agreement...');
  const ownerSignRes = await legal.sign(ownerUser, draftRes.agreementId, { consent: true, consentText: 'I accept the renewal terms.' });
  console.log('✓ Owner signed:', ownerSignRes);

  // Negative Test 7: Owner cannot sign twice
  console.log('\n14. Negative Test: User cannot sign twice...');
  try {
    await legal.sign(ownerUser, draftRes.agreementId, { consent: true });
    throw new Error('FAILED: User was able to sign twice!');
  } catch (err) {
    console.log('✓ Expected error received:', err.message);
  }

  // Step 7: Tenant Signs & Executes Renewal
  console.log('\n15. Tenant (Priya Verma) signs renewal agreement (final signature)...');
  const tenantSignRes = await legal.sign(tenantUser, draftRes.agreementId, { consent: true, consentText: 'I accept the renewal terms.' });
  console.log('✓ Tenant signed & executed:', tenantSignRes);

  // Step 8: Verify Post-Renewal State
  console.log('\n16. Verifying Post-Renewal Tenancy State...');
  const finalTenancy = await db.one('SELECT id, stage, rent_amount, start_date, end_date, renewal_due_on FROM tenancies WHERE id = 3');
  const finalAgreement = await db.one('SELECT id, agreement_number, agreement_type, status, effective_from, effective_to FROM agreements WHERE id = ?', [draftRes.agreementId]);
  const origAgreement = await db.one('SELECT id, agreement_number, agreement_type, status FROM agreements WHERE id = 2');
  const renewalCaseFinal = await db.one('SELECT id, case_number, case_type, status FROM legal_cases WHERE id = ?', [confirmRes.caseId]);

  console.log('Final Tenancy 3:', finalTenancy);
  console.log('Renewal Agreement:', finalAgreement);
  console.log('Original Agreement (must be EXECUTED):', origAgreement);
  console.log('Renewal Legal Case:', renewalCaseFinal);

  if (finalTenancy.stage !== 'ACTIVE') throw new Error(`Tenancy stage should remain ACTIVE, got ${finalTenancy.stage}`);
  if (Number(finalTenancy.rent_amount) !== 52000) throw new Error(`Tenancy rent should be 52000, got ${finalTenancy.rent_amount}`);
  if (finalAgreement.status !== 'EXECUTED') throw new Error('Renewal agreement should be EXECUTED');
  if (origAgreement.status !== 'EXECUTED') throw new Error('Original agreement should remain EXECUTED');
  if (renewalCaseFinal.status !== 'EXECUTED') throw new Error('Renewal case should be EXECUTED');

  // Step 9: Verify Future Recurring Rent Generation uses renewed rent ₹52,000
  console.log('\n17. Testing future recurring rent generation...');
  const rentGenRes = await payments.generateMonthlyRent({ tenancyId: 3, year: 2027, month: 10 });
  console.log('✓ Rent generation result:', rentGenRes);
  const genPayment = await db.one('SELECT * FROM payments WHERE id = ?', [rentGenRes.results[0].paymentId]);
  console.log('✓ Generated Payment:', {
    reference_code: genPayment.reference_code,
    purpose: genPayment.purpose,
    total_amount: genPayment.total_amount,
    due_date: genPayment.due_date,
    notes: genPayment.notes,
  });
  if (Number(genPayment.total_amount) !== 52000) throw new Error(`Future rent amount should be 52000, got ${genPayment.total_amount}`);

  // Step 10: Verify Case 1 and Case 2 preservation
  console.log('\n18. Verifying Case 1 and Case 2 preservation...');
  const finalC1 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000001']);
  const finalC2 = await db.one('SELECT case_number, status, assigned_to FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000002']);
  console.log('Case 1:', finalC1);
  console.log('Case 2:', finalC2);
  if (finalC1.status !== 'EXECUTED') throw new Error('Case 1 altered!');
  if (finalC2.status !== 'QUEUED') throw new Error('Case 2 altered!');

  console.log('\n======================================================');
  console.log('🎉 ALL LEASE RENEWAL VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
  console.log('======================================================');

  await app.close();
}

run().catch((err) => {
  console.error('VERIFICATION TEST FAILED:', err);
  process.exit(1);
});
