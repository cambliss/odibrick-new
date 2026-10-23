require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const path = require('path');
const mysql = require(path.resolve(__dirname, '../node_modules/mysql2/promise'));
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { RentalService } = require('../apps/api/dist/modules/rental/rental.service');

async function run() {
  console.log('============================================================');
  console.log('SAFE CLOSURE OF TEST FIXTURE TENANCY #8888');
  console.log('============================================================');

  // 1. Verify DB Target
  const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3307', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'cambliss@123',
    database: process.env.DB_NAME || 'odibrick',
  };

  console.log(`Connecting to: ${dbConfig.host}:${dbConfig.port}, Database: ${dbConfig.database}`);
  if (dbConfig.port !== 3307 || !['localhost', '127.0.0.1'].includes(dbConfig.host)) {
    throw new Error(`CRITICAL ABORT: Refusing to run on non-local target: ${dbConfig.host}:${dbConfig.port}`);
  }

  const conn = await mysql.createConnection(dbConfig);
  const [dbNameCheck] = await conn.execute('SELECT DATABASE() as db, @@hostname as host');
  console.log('Confirmed Target:', dbNameCheck[0]);

  // 2. Precondition Checks
  console.log('\n--- Checking Preconditions ---');
  const [t8888Rows] = await conn.execute('SELECT * FROM tenancies WHERE id = 8888');
  if (t8888Rows.length === 0) {
    throw new Error('Precondition failed: Tenancy 8888 not found.');
  }
  const t8888Before = t8888Rows[0];
  console.log(`Tenancy 8888 Before: Stage=${t8888Before.stage}, PropertyID=${t8888Before.property_id}, ClosedAt=${t8888Before.closed_at}`);

  if (t8888Before.property_id !== 1 || t8888Before.stage !== 'ACTIVE' || t8888Before.closed_at !== null) {
    throw new Error(`Precondition failed: Tenancy 8888 state unexpected: PropertyID=${t8888Before.property_id}, Stage=${t8888Before.stage}, ClosedAt=${t8888Before.closed_at}`);
  }

  // Preconditions on Tenancy 1
  const [t1Rows] = await conn.execute('SELECT * FROM tenancies WHERE id = 1');
  if (t1Rows.length === 0 || t1Rows[0].stage !== 'ACTIVE' || t1Rows[0].property_id !== 1) {
    throw new Error('Precondition failed: Canonical Tenancy 1 is not in ACTIVE stage on Property 1.');
  }
  const [l1Rows] = await conn.execute('SELECT * FROM legal_cases WHERE tenancy_id = 1 AND case_number = "ODB-LGL-2026-000001"');
  if (l1Rows.length === 0 || l1Rows[0].status !== 'EXECUTED') {
    throw new Error('Precondition failed: Canonical Legal Case 1 not found or not EXECUTED.');
  }
  const [a1Rows] = await conn.execute('SELECT * FROM agreements WHERE tenancy_id = 1 AND agreement_number = "ODB-AGR-2026-000001"');
  if (a1Rows.length === 0 || a1Rows[0].status !== 'EXECUTED') {
    throw new Error('Precondition failed: Canonical Agreement 1 not found or not EXECUTED.');
  }
  const [p1Rows] = await conn.execute('SELECT COUNT(*) as cnt FROM payments WHERE tenancy_id = 1');
  const p1CountBefore = p1Rows[0].cnt;
  console.log(`Canonical Tenancy 1 Verified: Stage=${t1Rows[0].stage}, Case=${l1Rows[0].case_number}, Agr=${a1Rows[0].agreement_number}, Payments=${p1CountBefore}`);

  // Count existing 8888 records before
  const [dispBefore] = await conn.execute('SELECT COUNT(*) as cnt FROM disputes WHERE tenancy_id = 8888');
  const [legBefore] = await conn.execute('SELECT COUNT(*) as cnt FROM legal_cases WHERE tenancy_id = 8888');
  const [payBefore] = await conn.execute('SELECT COUNT(*) as cnt FROM payments WHERE tenancy_id = 8888');
  const [timeBefore] = await conn.execute('SELECT COUNT(*) as cnt FROM property_timeline WHERE tenancy_id = 8888');
  const [audBefore] = await conn.execute('SELECT COUNT(*) as cnt FROM audit_logs WHERE object_type = "tenancy" AND object_id = 8888');

  console.log(`Tenancy 8888 Child Rows Before: Disputes=${dispBefore[0].cnt}, LegalCases=${legBefore[0].cnt}, Payments=${payBefore[0].cnt}, Timeline=${timeBefore[0].cnt}, AuditLogs=${audBefore[0].cnt}`);

  await conn.end();

  // 3. Execute Transition via Application RentalService
  console.log('\n--- Executing Administrative Override via RentalService ---');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const rentalService = app.get(RentalService);

  const adminUser = {
    id: 1,
    publicId: 'SA1',
    fullName: 'Super Admin',
    email: 'admin@demo.odibrick.test',
    roles: ['SUPER_ADMIN', 'ADMIN'],
    permissions: ['user.manage', 'tenancy.manage', 'dispute.manage', 'audit.read'],
  };

  const overrideResult = await rentalService.adminOverrideTenancy(adminUser, 8888, {
    action: 'FORCE_CLOSE',
    reason: 'Decommissioning contaminated dispute-test fixture tenancy #8888 to eliminate duplicate active tenancy on Property 1',
    notes: 'Approved cleanup of historical dispute verification test fixture',
  });
  console.log('Override Result:', overrideResult);

  await app.close();

  // 4. Post-condition Verification
  console.log('\n--- Verifying Post-Transition State ---');
  const verifyConn = await mysql.createConnection(dbConfig);

  const [t8888AfterRows] = await verifyConn.execute('SELECT id, public_id, property_id, stage, closed_at FROM tenancies WHERE id = 8888');
  const t8888After = t8888AfterRows[0];
  console.log(`Tenancy 8888 After: Stage=${t8888After.stage}, PropertyID=${t8888After.property_id}, ClosedAt=${t8888After.closed_at}`);

  if (t8888After.stage !== 'CLOSED' || !t8888After.closed_at) {
    throw new Error(`Verification failed: Tenancy 8888 was not transitioned to CLOSED with closed_at set! Stage=${t8888After.stage}`);
  }

  // Verify timeline entry
  const [timelineRows] = await verifyConn.execute(
    'SELECT * FROM property_timeline WHERE tenancy_id = 8888 AND event_code = "TENANCY_CLOSED" ORDER BY id DESC LIMIT 1'
  );
  if (timelineRows.length === 0) {
    throw new Error('Verification failed: No TENANCY_CLOSED event in property_timeline.');
  }
  console.log(`Timeline Entry Verified: Title="${timelineRows[0].title}", EventCode=${timelineRows[0].event_code}`);

  // Verify audit log entry
  const [auditRows] = await verifyConn.execute(
    'SELECT * FROM audit_logs WHERE object_type = "tenancy" AND object_id = 8888 AND action = "management.tenancy.closed" ORDER BY id DESC LIMIT 1'
  );
  if (auditRows.length === 0) {
    throw new Error('Verification failed: No management.tenancy.closed entry in audit_logs.');
  }
  console.log(`Audit Log Entry Verified: Action="${auditRows[0].action}", ActorID=${auditRows[0].actor_id}, Result=${auditRows[0].result}`);

  // Verify 8888 child rows untouched
  const [dispAfter] = await verifyConn.execute('SELECT COUNT(*) as cnt FROM disputes WHERE tenancy_id = 8888');
  const [legAfter] = await verifyConn.execute('SELECT COUNT(*) as cnt FROM legal_cases WHERE tenancy_id = 8888');
  const [payAfter] = await verifyConn.execute('SELECT COUNT(*) as cnt FROM payments WHERE tenancy_id = 8888');
  const [timeAfter] = await verifyConn.execute('SELECT COUNT(*) as cnt FROM property_timeline WHERE tenancy_id = 8888');
  const [audAfter] = await verifyConn.execute('SELECT COUNT(*) as cnt FROM audit_logs WHERE object_type = "tenancy" AND object_id = 8888');

  console.log(`Tenancy 8888 Child Rows After: Disputes=${dispAfter[0].cnt} (was ${dispBefore[0].cnt}), LegalCases=${legAfter[0].cnt} (was ${legBefore[0].cnt}), Payments=${payAfter[0].cnt} (was ${payBefore[0].cnt}), Timeline=${timeAfter[0].cnt} (was ${timeBefore[0].cnt}), AuditLogs=${audAfter[0].cnt} (was ${audBefore[0].cnt})`);

  if (dispAfter[0].cnt !== dispBefore[0].cnt || legAfter[0].cnt !== legBefore[0].cnt || payAfter[0].cnt !== payBefore[0].cnt) {
    throw new Error('Verification failed: Child records of Tenancy 8888 were altered or deleted!');
  }

  // Verify Tenancy 1 remains untouched
  const [t1AfterRows] = await verifyConn.execute('SELECT id, public_id, property_id, stage FROM tenancies WHERE id = 1');
  const [l1AfterRows] = await verifyConn.execute('SELECT status FROM legal_cases WHERE tenancy_id = 1 AND case_number = "ODB-LGL-2026-000001"');
  const [a1AfterRows] = await verifyConn.execute('SELECT status FROM agreements WHERE tenancy_id = 1 AND agreement_number = "ODB-AGR-2026-000001"');
  const [p1AfterRows] = await verifyConn.execute('SELECT COUNT(*) as cnt FROM payments WHERE tenancy_id = 1');

  console.log(`Canonical Tenancy 1 After: Stage=${t1AfterRows[0].stage}, CaseStatus=${l1AfterRows[0].status}, AgrStatus=${a1AfterRows[0].status}, PaymentsCount=${p1AfterRows[0].cnt}`);

  if (t1AfterRows[0].stage !== 'ACTIVE' || l1AfterRows[0].status !== 'EXECUTED' || a1AfterRows[0].status !== 'EXECUTED' || p1AfterRows[0].cnt !== p1CountBefore) {
    throw new Error('Verification failed: Canonical Tenancy 1 records altered!');
  }

  // Active tenancies on Property 1 check
  const [activeTenanciesProp1] = await verifyConn.execute(
    'SELECT id, public_id, stage FROM tenancies WHERE property_id = 1 AND stage NOT IN ("CLOSED", "CANCELLED")'
  );
  console.log('\n--- Active Tenancies on Property 1 Now ---');
  console.table(activeTenanciesProp1);
  if (activeTenanciesProp1.length !== 1 || activeTenanciesProp1[0].id !== 1) {
    throw new Error(`Expected exactly 1 active tenancy (ID 1) on Property 1, found: ${activeTenanciesProp1.length}`);
  }

  await verifyConn.end();
  console.log('\n✓ SUCCESS: Test fixture Tenancy #8888 was safely transitioned to CLOSED with complete audit and timeline trail.');
  console.log('✓ Property 1 now has exactly ONE active tenancy (canonical Tenancy #1).');
}

run().catch((err) => {
  console.error('\n❌ EXECUTION FAILED:', err);
  process.exit(1);
});
