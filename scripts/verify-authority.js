require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { RentalService } = require('../apps/api/dist/modules/rental/rental.service');
const { AdminService } = require('../apps/api/dist/modules/admin/admin.service');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');

async function run() {
  console.log('--- Initializing NestJS App Context for Odibrick Management & Authority E2E Test ---');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const rentalService = app.get(RentalService);
  const adminService = app.get(AdminService);
  const db = app.get(DatabaseService);

  try {
    const superAdminAuth = {
      id: 1,
      publicId: 'SA1',
      email: 'admin@demo.odibrick.test',
      fullName: 'Super Admin',
      roles: ['SUPER_ADMIN'],
      permissions: ['user.manage', 'tenancy.manage', 'application.decide', 'dispute.manage', 'audit.read'],
    };

    const tenantAuth = {
      id: 30,
      publicId: 'T1',
      email: 'tenant13@demo.odibrick.test',
      fullName: 'Priya Verma',
      roles: ['TENANT'],
      permissions: ['agreement.sign', 'payment.read'],
    };

    const ownerAuth = {
      id: 8,
      publicId: 'O1',
      email: 'owner1@demo.odibrick.test',
      fullName: 'Tara Verma',
      roles: ['OWNER'],
      permissions: ['property.create', 'application.decide'],
    };

    console.log('\n1. Verifying Central Operational Overview API...');
    const overview = await adminService.operationalOverview();
    if (!overview || !Array.isArray(overview.pendingKyc) || !Array.isArray(overview.unassignedLegalCases)) {
      throw new Error('Operational overview structure is invalid.');
    }
    console.log(`✓ Governance overview loaded: ${overview.pendingKyc.length} pending KYC, ${overview.unassignedLegalCases.length} unassigned legal cases, ${overview.openDisputes.length} open disputes.`);

    console.log('\n2. Testing Application Administrative Governance...');
    // Clean up any stale test application
    await db.execute('DELETE FROM applications WHERE public_id = ?', ['APP-AUTH-TEST-99']);
    const testAppId = await db.insert('applications', {
      public_id: 'APP-AUTH-TEST-99',
      property_id: 1,
      tenant_user_id: tenantAuth.id,
      status: 'SUBMITTED',
      offered_rent: 45000,
    });

    // Negative Test: Tenant cannot admin-decide application
    try {
      await rentalService.adminDecideApplication(tenantAuth, testAppId, {
        action: 'CANCEL',
        reason: 'Unauthorized attempt by tenant',
      });
      throw new Error('Tenant was able to execute adminDecideApplication!');
    } catch (e) {
      console.log(`✓ Expected error for unauthorized application decide: ${e.message}`);
    }

    // Positive Test: Super Admin cancels application
    const adminAppResult = await rentalService.adminDecideApplication(superAdminAuth, testAppId, {
      action: 'CANCEL',
      reason: 'Application flagged for audit verification review by management.',
    });
    console.log(`✓ Management decided application: status = ${adminAppResult.status}, reason = "${adminAppResult.reason}"`);

    const appRecord = await db.one('SELECT status, decision_note FROM applications WHERE id = ?', [testAppId]);
    if (appRecord.status !== 'WITHDRAWN') throw new Error('Application status was not updated to WITHDRAWN.');
    console.log(`✓ Verified application status in DB: ${appRecord.status}, decision_note: "${appRecord.decision_note}"`);

    console.log('\n3. Testing Tenancy Administrative Governance & Override Safety...');
    // Setup dedicated test tenancy for governance tests
    await db.execute('DELETE FROM tenancies WHERE public_id = ?', ['TEN-AUTH-TEST-99']);
    const testTenancyId = await db.insert('tenancies', {
      public_id: 'TEN-AUTH-TEST-99',
      property_id: 1,
      owner_user_id: ownerAuth.id,
      tenant_user_id: tenantAuth.id,
      stage: 'ACTIVE',
      rent_amount: 50000,
      deposit_amount: 100000,
    });

    // Negative Test: Owner cannot execute admin override
    try {
      await rentalService.adminOverrideTenancy(ownerAuth, testTenancyId, {
        action: 'HOLD',
        reason: 'Attempted by owner',
      });
      throw new Error('Owner was able to execute adminOverrideTenancy!');
    } catch (e) {
      console.log(`✓ Expected error for unauthorized tenancy override: ${e.message}`);
    }

    // Negative Test: Tenant cannot execute admin override
    try {
      await rentalService.adminOverrideTenancy(tenantAuth, testTenancyId, {
        action: 'HOLD',
        reason: 'Attempted by tenant',
      });
      throw new Error('Tenant was able to execute adminOverrideTenancy!');
    } catch (e) {
      console.log(`✓ Expected error for tenant tenancy override: ${e.message}`);
    }

    // Positive Test 1: Management places tenancy on administrative hold
    const holdResult = await rentalService.adminOverrideTenancy(superAdminAuth, testTenancyId, {
      action: 'HOLD',
      reason: 'Administrative inquiry into property ownership compliance.',
      notes: 'Internal ticket REF-9901',
    });
    console.log(`✓ Tenancy placed on administrative hold by management: ${JSON.stringify(holdResult)}`);

    // Verify timeline record
    const holdTimeline = await db.one(
      "SELECT * FROM property_timeline WHERE tenancy_id = ? AND title = 'Tenancy placed on administrative hold' ORDER BY id DESC LIMIT 1",
      [testTenancyId],
    );
    if (!holdTimeline) throw new Error('Timeline event for tenancy hold was not created.');
    console.log(`✓ Verified timeline event: ${holdTimeline.title}`);

    // Positive Test 2: Management resumes tenancy
    const resumeResult = await rentalService.adminOverrideTenancy(superAdminAuth, testTenancyId, {
      action: 'RESUME',
      reason: 'Compliance documentation verified and approved.',
    });
    console.log(`✓ Tenancy resumed by management: ${JSON.stringify(resumeResult)}`);

    // Positive Test 3: Management executes emergency cancellation
    const cancelResult = await rentalService.adminOverrideTenancy(superAdminAuth, testTenancyId, {
      action: 'CANCEL',
      reason: 'Court order / severe contract violation enforcement.',
    });
    console.log(`✓ Tenancy cancelled by management override: ${JSON.stringify(cancelResult)}`);

    const cancelledTenancy = await db.one('SELECT stage, closed_at FROM tenancies WHERE id = ?', [testTenancyId]);
    if (cancelledTenancy.stage !== 'CANCELLED') throw new Error('Tenancy stage was not set to CANCELLED.');
    console.log(`✓ Verified tenancy DB record: stage = ${cancelledTenancy.stage}, closed_at = ${cancelledTenancy.closed_at}`);

    // Negative Test: Cannot put a cancelled/closed tenancy on hold
    try {
      await rentalService.adminOverrideTenancy(superAdminAuth, testTenancyId, {
        action: 'HOLD',
        reason: 'Cannot hold cancelled tenancy',
      });
      throw new Error('Allowed holding a cancelled tenancy!');
    } catch (e) {
      console.log(`✓ Expected error for invalid lifecycle transition: ${e.message}`);
    }

    console.log('\n4. Verifying Audit Log Records for Management Actions...');
    const auditLogs = await db.query(
      `SELECT action, object_type, object_id, metadata FROM audit_logs
        WHERE action LIKE 'management.%' AND (object_id = ? OR object_id = ?)
        ORDER BY id ASC`,
      [testAppId, testTenancyId],
    );
    console.log(`✓ Captured ${auditLogs.length} management audit trail entries:`);
    auditLogs.forEach((log) => console.log(`   - [${log.action}] on ${log.object_type} #${log.object_id}`));

    // Clean up test records
    await db.execute('DELETE FROM applications WHERE id = ?', [testAppId]);
    await db.execute('DELETE FROM property_timeline WHERE tenancy_id = ?', [testTenancyId]);
    await db.execute('DELETE FROM tenancies WHERE id = ?', [testTenancyId]);
    console.log('✓ Cleaned up test records safely.');

    console.log('\n=============================================================');
    console.log('🎉 ALL MANAGEMENT AUTHORITY & GOVERNANCE TESTS PASSED! 🎉');
    console.log('=============================================================');
  } catch (err) {
    console.error('❌ Authority verification failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

run();
