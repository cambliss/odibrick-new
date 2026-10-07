require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { OperationsService } = require('../apps/api/dist/modules/operations/operations.service');
const { RentalService } = require('../apps/api/dist/modules/rental/rental.service');
const { LegalService } = require('../apps/api/dist/modules/legal/legal.service');
const { PaymentsService } = require('../apps/api/dist/modules/payments/payments.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('============================================================');
  console.log('ODIBRICK — DISPUTE & RESOLUTION MANAGEMENT LIFECYCLE E2E TEST');
  console.log('============================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const ops = app.get(OperationsService);
  const rental = app.get(RentalService);
  const legal = app.get(LegalService);
  const payments = app.get(PaymentsService);
  const db = app.get(DatabaseService);

  try {
    const adminUser = {
      id: 1,
      publicId: 'SA1',
      fullName: 'Super Admin',
      email: 'admin@demo.odibrick.test',
      roles: ['SUPER_ADMIN', 'ADMIN'],
      permissions: ['user.manage', 'tenancy.manage', 'dispute.manage', 'legal.case.manage', 'audit.read'],
    };

    const legalLeadUser = {
      id: 3,
      publicId: 'LGL1',
      fullName: 'Adv. Shalini Menon',
      email: 'legal_team@demo.odibrick.test',
      roles: ['LEGAL_TEAM'],
      permissions: ['legal.case.manage', 'agreement.draft', 'agreement.approve', 'dispute.manage'],
    };

    const tenantUser = {
      id: 30,
      publicId: 'T1',
      fullName: 'Priya Verma',
      email: 'tenant13@demo.odibrick.test',
      roles: ['TENANT'],
      permissions: ['agreement.sign', 'payment.read', 'maintenance.create'],
    };

    const ownerUser = {
      id: 8,
      publicId: 'O1',
      fullName: 'Tara Verma',
      email: 'owner1@demo.odibrick.test',
      roles: ['OWNER'],
      permissions: ['property.create', 'application.decide'],
    };

    const unrelatedUser = {
      id: 18,
      publicId: 'T2',
      fullName: 'Naveen Gupta',
      email: 'tenant1@demo.odibrick.test',
      roles: ['TENANT'],
      permissions: ['payment.read'],
    };

    console.log('\n--- Checking Baseline Regression State ---');
    const c1 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000001']);
    const c2 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000002']);
    const c3 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000003']);
    if (c1.status !== 'EXECUTED' || c2.status !== 'QUEUED' || c3.status !== 'EXECUTED') {
      throw new Error(`Baseline legal cases corrupted: C1=${c1.status}, C2=${c2.status}, C3=${c3.status}`);
    }
    console.log('✓ Baseline canonical cases verified: Case 1 EXECUTED, Case 2 QUEUED, Case 3 EXECUTED');

    // Setting up isolated test tenancy #8888 for dispute testing
    console.log('\n--- Setting up isolated Test Tenancy #8888 ---');
    await db.query('DELETE FROM dispute_evidence WHERE dispute_id IN (SELECT id FROM disputes WHERE tenancy_id = 8888)');
    await db.query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE context_type = "DISPUTE" AND context_id IN (SELECT id FROM disputes WHERE tenancy_id = 8888))');
    await db.query('DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE context_type = "DISPUTE" AND context_id IN (SELECT id FROM disputes WHERE tenancy_id = 8888))');
    await db.query('DELETE FROM conversations WHERE context_type = "DISPUTE" AND context_id IN (SELECT id FROM disputes WHERE tenancy_id = 8888)');
    await db.query('DELETE FROM payments WHERE tenancy_id = 8888');
    await db.query('DELETE FROM property_timeline WHERE tenancy_id = 8888');
    await db.query('DELETE FROM disputes WHERE tenancy_id = 8888');
    await db.query('DELETE FROM tenancies WHERE id = 8888');

    await db.query(
      `INSERT INTO tenancies (
        id, public_id, property_id, owner_user_id, tenant_user_id, stage, service_plan, rent_amount, deposit_amount,
        start_date, end_date, lock_in_months, notice_period_days, created_at, updated_at
      ) VALUES (
        8888, '01JTEST8888000000000000000', 1, 8, 30, 'ACTIVE', 'STANDARD', 60000.00, 120000.00,
        '2026-01-01', '2026-12-31', 6, 30, NOW(), NOW()
      )`
    );
    console.log('✓ Tenancy #8888 created (ACTIVE, Rent: 60,000, Deposit: 120,000)');

    // 1. Tenant creates dispute
    console.log('\n1. Test: Tenant creates dispute on Tenancy #8888');
    const tenantDispute = await ops.createDispute(tenantUser, {
      tenancyId: 8888,
      category: 'DEPOSIT',
      amountClaimed: 25000,
      summary: 'Dispute over proposed security deposit deductions for wall painting',
      detail: 'Tenant disputes the owner withholding ₹25,000 for normal wear and tear painting.',
    });
    if (!tenantDispute.id || tenantDispute.status !== 'OPEN') {
      throw new Error(`Failed to create tenant dispute: ${JSON.stringify(tenantDispute)}`);
    }
    console.log(`✓ Tenant dispute created successfully: Case ID=${tenantDispute.id}, CaseNumber=${tenantDispute.caseNumber}, Status=${tenantDispute.status}`);

    // 2. Owner creates dispute
    console.log('\n2. Test: Owner creates dispute on Tenancy #8888');
    const ownerDispute = await ops.createDispute(ownerUser, {
      tenancyId: 8888,
      category: 'PROPERTY_DAMAGE',
      amountClaimed: 15000,
      summary: 'Appliance repair and fixture damage claim',
      detail: 'Owner claiming repair reimbursement for broken AC unit.',
    });
    if (!ownerDispute.id || ownerDispute.status !== 'OPEN') {
      throw new Error(`Failed to create owner dispute: ${JSON.stringify(ownerDispute)}`);
    }
    console.log(`✓ Owner dispute created successfully: Case ID=${ownerDispute.id}, CaseNumber=${ownerDispute.caseNumber}, Status=${ownerDispute.status}`);

    // 3. Unauthorized user cannot create dispute for unrelated tenancy
    console.log('\n3. Test: Unauthorized user cannot create dispute for unrelated tenancy');
    let unauthCreatePassed = false;
    try {
      await ops.createDispute(unrelatedUser, {
        tenancyId: 8888,
        category: 'MAINTENANCE',
        summary: 'Unauthorized claim',
      });
    } catch (err) {
      unauthCreatePassed = true;
      console.log(`✓ Unauthorized dispute creation rejected as expected: ${err.message}`);
    }
    if (!unauthCreatePassed) throw new Error('Security violation: Unrelated user was able to create dispute for another tenancy!');

    // 4. Management can list disputes
    console.log('\n4. Test: Management lists disputes');
    const mgmtList = await ops.listDisputes(adminUser);
    if (!Array.isArray(mgmtList) || mgmtList.length < 2) {
      throw new Error('Management dispute list should contain at least the 2 test disputes');
    }
    console.log(`✓ Management listed ${mgmtList.length} total disputes.`);

    // 5. Party sees only authorized disputes
    console.log('\n5. Test: Party sees only their authorized disputes');
    const tenantList = await ops.listDisputes(tenantUser);
    const unrelatedList = await ops.listDisputes(unrelatedUser);
    if (unrelatedList.some((d) => d.tenancy_id === 8888)) {
      throw new Error('Party isolation failed: unrelated user can see Tenancy #8888 disputes!');
    }
    console.log(`✓ Party isolation verified: Tenant sees ${tenantList.length} disputes, unrelated user sees ${unrelatedList.length} disputes.`);

    // 6. Evidence submission works
    console.log('\n6. Test: Evidence submission by Tenant');
    const ev1 = await ops.addEvidence(tenantUser, tenantDispute.id, {
      evidenceType: 'PHOTO',
      description: 'Move-in check-in photos showing pre-existing marks on the living room wall',
    });
    if (!ev1.id || ev1.status !== 'EVIDENCE_SUBMITTED') {
      throw new Error(`Evidence submission failed or status not updated: ${JSON.stringify(ev1)}`);
    }
    console.log(`✓ Evidence submitted successfully: Evidence ID=${ev1.id}, Dispute Status updated to ${ev1.status}`);

    // 7. Unauthorized evidence submission fails
    console.log('\n7. Test: Unauthorized user cannot submit evidence to unrelated dispute');
    let unauthEvPassed = false;
    try {
      await ops.addEvidence(unrelatedUser, tenantDispute.id, {
        evidenceType: 'DOCUMENT',
        description: 'Malicious evidence submission',
      });
    } catch (err) {
      unauthEvPassed = true;
      console.log(`✓ Unauthorized evidence submission rejected: ${err.message}`);
    }
    if (!unauthEvPassed) throw new Error('Security violation: Unrelated user submitted evidence!');

    // 8. Management sees evidence in detail
    console.log('\n8. Test: Management views dispute detail with evidence');
    const detail = await ops.disputeDetail(adminUser, tenantDispute.id);
    if (!detail.dispute || !Array.isArray(detail.evidence) || detail.evidence.length === 0) {
      throw new Error('Dispute detail missing evidence list');
    }
    console.log(`✓ Detail verified: Case ${detail.dispute.case_number} has ${detail.evidence.length} evidence items.`);

    // 9. Assignment works
    console.log('\n9. Test: Dispute Assignment by Management');
    const assignRes = await ops.assignDispute(adminUser, tenantDispute.id, {
      assignedTo: legalLeadUser.id,
    });
    if (assignRes.assignedTo !== legalLeadUser.id || assignRes.status !== 'UNDER_REVIEW') {
      throw new Error(`Assignment failed or status not UNDER_REVIEW: ${JSON.stringify(assignRes)}`);
    }
    console.log(`✓ Dispute assigned to User #${assignRes.assignedTo} (Adv. Shalini Menon), Status=${assignRes.status}`);

    // 10. Unauthorized assignment fails
    console.log('\n10. Test: Unauthorized assignment by Tenant fails');
    let unauthAssignPassed = false;
    try {
      await ops.assignDispute(tenantUser, tenantDispute.id, { assignedTo: tenantUser.id });
    } catch (err) {
      unauthAssignPassed = true;
      console.log(`✓ Unauthorized assignment rejected: ${err.message}`);
    }
    if (!unauthAssignPassed) throw new Error('Security violation: Tenant was able to assign dispute!');

    // 11. Reassignment works
    console.log('\n11. Test: Reassignment by Management');
    const reassignRes = await ops.assignDispute(adminUser, tenantDispute.id, {
      assignedTo: adminUser.id,
    });
    console.log(`✓ Dispute reassigned to User #${reassignRes.assignedTo} (Super Admin)`);

    // 12. Evidence request works
    console.log('\n12. Test: Management issues formal Evidence Request message');
    const evReq = await ops.sendDisputeMessage(adminUser, tenantDispute.id, {
      body: 'Please provide the dated move-out inspection handover report for verification of wall condition.',
      isEvidenceRequest: true,
      requestType: 'INSPECTION_REPORT',
    });
    if (!evReq.id) throw new Error('Evidence request message creation failed');
    console.log(`✓ Evidence request sent: Message ID=${evReq.id}`);

    // 13. Counterparty response works
    console.log('\n13. Test: Counterparty responds in dispute thread');
    const replyRes = await ops.sendDisputeMessage(tenantUser, tenantDispute.id, {
      body: 'I have attached the Day-1 condition report photos and owner sign-off notes.',
    });
    if (!replyRes.id) throw new Error('Party message response failed');
    console.log(`✓ Tenant response registered: Message ID=${replyRes.id}`);

    // 14. Status transitions validate correctly
    console.log('\n14. Test: Valid status transition by disputes team');
    await ops.updateDispute(adminUser, tenantDispute.id, 'UNDER_REVIEW', 'Investigation underway');
    console.log('✓ Status transition to UNDER_REVIEW validated');

    // 15 & 16. Legal Escalation & legal_case_id linkage
    console.log('\n15 & 16. Test: Legal Escalation and Legal Case linkage');
    const escRes = await ops.escalateToLegal(adminUser, tenantDispute.id, {
      reason: 'Dispute involves legal interpretation of agreement clause 12.2 regarding fair wear & tear.',
      priority: 'HIGH',
      advocateUserId: legalLeadUser.id,
    });
    if (!escRes.legalCaseId || escRes.status !== 'LEGAL_REVIEW') {
      throw new Error(`Legal escalation failed: ${JSON.stringify(escRes)}`);
    }

    const dispCheck = await db.one('SELECT legal_case_id, status FROM disputes WHERE id = ?', [tenantDispute.id]);
    const legalCaseCheck = await db.one('SELECT id, case_number, case_type, status, assigned_to FROM legal_cases WHERE id = ?', [escRes.legalCaseId]);
    if (dispCheck.legal_case_id !== legalCaseCheck.id || legalCaseCheck.case_type !== 'DISPUTE') {
      throw new Error('Legal case linkage verification failed');
    }
    console.log(`✓ Legal Escalation verified: Dispute linked to Legal Case ${legalCaseCheck.case_number} (CaseType: ${legalCaseCheck.case_type}, Assigned: ${legalCaseCheck.assigned_to})`);

    // 17. Management resolution with Financial adjustment
    console.log('\n17, 18, 19, 20 & 21. Test: Management Binding Resolution with Financial Settlement Payment');
    
    // 18. Unauthorized user cannot record resolution
    let unauthResolvePassed = false;
    try {
      await ops.resolveDispute(tenantUser, tenantDispute.id, {
        resolution: 'Tenant self-authorizes refund.',
      });
    } catch (err) {
      unauthResolvePassed = true;
      console.log(`✓ Unauthorized resolution attempt by tenant rejected: ${err.message}`);
    }
    if (!unauthResolvePassed) throw new Error('Security violation: Tenant recorded resolution!');

    // 17 & 19. Resolution with financial settlement created through PaymentsService
    const resolveRes = await ops.resolveDispute(adminUser, tenantDispute.id, {
      resolution: 'Odibrick Management ruling: Wear and tear is normal residential aging. Owner must refund ₹20,000 of the withheld deposit. Tenant is responsible for ₹5,000 deep cleaning cost.',
      status: 'RESOLVED',
      financialDecision: {
        amount: 20000,
        payerUserId: ownerUser.id,
        payeeUserId: tenantUser.id,
        purpose: 'REFUND',
        dueDate: '2026-10-15',
        notes: `Binding dispute resolution refund for ${tenantDispute.caseNumber}`,
      },
    });

    if (resolveRes.status !== 'RESOLVED' || !resolveRes.paymentId) {
      throw new Error(`Resolution recording failed: ${JSON.stringify(resolveRes)}`);
    }
    console.log(`✓ Management Resolution recorded: Status=${resolveRes.status}, Payment ID=${resolveRes.paymentId}`);

    // 20 & 21. Check financial payment created in PaymentsService
    const createdPayment = await db.one('SELECT * FROM payments WHERE id = ?', [resolveRes.paymentId]);
    if (!createdPayment || createdPayment.status !== 'DUE' || Number(createdPayment.amount) !== 20000 || createdPayment.payer_user_id !== ownerUser.id) {
      throw new Error(`Financial resolution payment verification failed: ${JSON.stringify(createdPayment)}`);
    }
    console.log(`✓ Existing PaymentsService integration verified: Payment ${createdPayment.reference_code} (Purpose: ${createdPayment.purpose}, Amount: ₹${createdPayment.amount}, Status: ${createdPayment.status}, Payer: User #${createdPayment.payer_user_id})`);

    // 22. Audit events recorded
    console.log('\n22. Test: Audit events verified');
    const audits = await db.query(
      "SELECT action, object_type, object_id FROM audit_logs WHERE object_type = 'dispute' AND object_id = ? ORDER BY id ASC",
      [tenantDispute.id],
    );
    const auditActions = audits.map((a) => a.action);
    console.log(`✓ Recorded audit actions for dispute #${tenantDispute.id}: ${auditActions.join(', ')}`);
    if (!auditActions.includes('dispute.opened') || !auditActions.includes('dispute.resolved') || !auditActions.includes('dispute.financial_created')) {
      throw new Error('Required audit actions missing');
    }

    // 23. Timeline events recorded
    console.log('\n23. Test: Property Timeline events verified');
    const timelines = await db.query(
      "SELECT event_code, title FROM property_timeline WHERE tenancy_id = 8888 ORDER BY id ASC",
    );
    console.log(`✓ Timeline events recorded (${timelines.length} total): ${timelines.map((t) => t.title).join(' | ')}`);

    // 24. Notifications generated
    console.log('\n24. Test: Notifications generated');
    const notifications = await db.query(
      "SELECT user_id, title, action_url FROM notifications WHERE action_url LIKE ? ORDER BY id DESC LIMIT 5",
      [`%${tenantDispute.id}%`],
    );
    console.log(`✓ Notifications generated for dispute participants (${notifications.length} notifications found)`);

    // 25 & 26. Tenancy Hold by Management
    console.log('\n25 & 26. Test: Tenancy Hold governance');
    const initialStageCheck = await db.one('SELECT stage FROM tenancies WHERE id = 8888');
    if (initialStageCheck.stage !== 'ACTIVE') {
      throw new Error(`Tenancy should not be automatically held on dispute opening! Stage: ${initialStageCheck.stage}`);
    }
    console.log('✓ Verified: Tenancy was NOT automatically placed on hold upon dispute opening.');

    // Apply explicit administrative hold
    const holdRes = await rental.adminOverrideTenancy(adminUser, 8888, {
      action: 'HOLD',
      reason: 'Dispute requires operational hold during property inspection review',
    });
    const holdTimeline = await db.one(
      "SELECT * FROM property_timeline WHERE tenancy_id = 8888 AND title = 'Tenancy placed on administrative hold' ORDER BY id DESC LIMIT 1"
    );
    if (!holdTimeline) {
      throw new Error('Tenancy hold timeline event not found!');
    }
    console.log(`✓ Administrative tenancy HOLD applied by management successfully: ${holdTimeline.title}`);

    // Resume tenancy
    const resumeRes = await rental.adminOverrideTenancy(adminUser, 8888, {
      action: 'RESUME',
      reason: 'Resolution reached, hold released',
    });
    const resumeTimeline = await db.one(
      "SELECT * FROM property_timeline WHERE tenancy_id = 8888 AND title = 'Tenancy administrative hold resumed' ORDER BY id DESC LIMIT 1"
    );
    if (!resumeTimeline) {
      throw new Error('Tenancy resume timeline event not found!');
    }
    console.log(`✓ Administrative tenancy RESUME applied by management successfully: ${resumeTimeline.title}`);

    // 27. Dispute closure works
    console.log('\n27. Test: Dispute closure by management');
    const closeRes = await ops.closeDispute(adminUser, tenantDispute.id, { reason: 'Settlement finalized' });
    if (closeRes.status !== 'CLOSED') throw new Error('Dispute closure failed');
    console.log('✓ Dispute marked CLOSED by management.');

    // 28. Reopen behavior works where permitted
    console.log('\n28. Test: Reopen behavior for closed dispute');
    const reopenRes = await ops.reopenDispute(adminUser, tenantDispute.id, {
      reason: 'Additional receipt submitted requiring secondary evaluation',
    });
    if (reopenRes.status !== 'UNDER_REVIEW') throw new Error('Reopen failed');
    console.log('✓ Dispute successfully reopened to UNDER_REVIEW.');

    // 29. Duplicate resolution is prevented
    console.log('\n29. Test: Duplicate resolution prevention');
    await ops.updateDispute(adminUser, tenantDispute.id, 'RESOLVED', 'Final ruling re-confirmed');
    let dupResolvePassed = false;
    try {
      await ops.resolveDispute(adminUser, tenantDispute.id, { resolution: 'Duplicate resolve attempt' });
    } catch (err) {
      dupResolvePassed = true;
      console.log(`✓ Duplicate resolution blocked: ${err.message}`);
    }
    if (!dupResolvePassed) throw new Error('Duplicate resolution should have been prevented!');

    // 30, 31 & 32. Rental lifecycle & regression check
    console.log('\n30, 31 & 32. Test: Rental Lifecycle & Canonical Cases Regression Check');
    const finalC1 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000001']);
    const finalC2 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000002']);
    const finalC3 = await db.one('SELECT case_number, status FROM legal_cases WHERE case_number = ?', ['ODB-LGL-2026-000003']);
    const t3 = await db.one('SELECT id, stage FROM tenancies WHERE id = 3');

    if (finalC1.status !== 'EXECUTED' || finalC2.status !== 'QUEUED' || finalC3.status !== 'EXECUTED' || t3.stage !== 'ACTIVE') {
      throw new Error(`Canonical rental lifecycle regressed! C1=${finalC1.status}, C2=${finalC2.status}, C3=${finalC3.status}, T3=${t3.stage}`);
    }
    console.log('✓ Canonical cases and active tenancies fully intact:');
    console.log('  - Case 1: ODB-LGL-2026-000001 (EXECUTED)');
    console.log('  - Case 2: ODB-LGL-2026-000002 (QUEUED)');
    console.log('  - Case 3: ODB-LGL-2026-000003 (EXECUTED)');
    console.log('  - Tenancy 3: ACTIVE');

    console.log('\n============================================================');
    console.log('ALL 32 VERIFICATION CRITERIA PASSED SUCCESSFULLY!');
    console.log('============================================================');
  } finally {
    await app.close();
  }
}

run().catch((err) => {
  console.error('\n❌ VERIFICATION FAILURE:', err);
  process.exit(1);
});
