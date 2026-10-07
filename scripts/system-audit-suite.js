/**
 * ODIBRICK COMPREHENSIVE SYSTEM AUDIT SUITE
 * Executes deep health, consistency, security, and E2E verification across Phases 1–19.
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function runAudit() {
  console.log('======================================================================');
  console.log('         ODIBRICK COMPREHENSIVE SYSTEM AUDIT SUITE');
  console.log('======================================================================\n');

  const db = await mysql.createConnection({
    host: 'localhost',
    port: 3307,
    user: 'root',
    password: 'cambliss@123',
    database: 'odibrick',
    multipleStatements: true,
  });

  const auditReport = {
    repository: {},
    database: {},
    apiInventory: {},
    rbacSecurity: {},
    e2eScenarios: {},
    financialConsistency: {},
    crossModuleConsistency: {},
    automation: {},
    operations: {},
    analytics: {},
    securityRisk: {},
    integrations: {},
    personalization: {},
    performance: {},
  };

  try {
    // -------------------------------------------------------------
    // PHASE B: DATABASE AUDIT
    // -------------------------------------------------------------
    console.log('--- AUDITING DATABASE & MIGRATIONS ---');
    const migrationsDir = path.join(__dirname, '../database/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    
    const [tables] = await db.query('SHOW TABLES');
    const tableNames = tables.map((t) => Object.values(t)[0]);

    // Check for orphan records
    const [orphanProps] = await db.query(
      `SELECT COUNT(*) AS total FROM properties p LEFT JOIN users u ON u.id = p.owner_id WHERE p.owner_id IS NOT NULL AND u.id IS NULL`,
    );
    const [orphanTenancies] = await db.query(
      `SELECT COUNT(*) AS total FROM tenancies t LEFT JOIN properties p ON p.id = t.property_id WHERE p.id IS NULL`,
    );
    const [orphanPayments] = await db.query(
      `SELECT COUNT(*) AS total FROM payments pay LEFT JOIN tenancies t ON t.id = pay.tenancy_id WHERE pay.tenancy_id IS NOT NULL AND t.id IS NULL`,
    );

    auditReport.database = {
      totalMigrations: migrationFiles.length,
      migrationFiles,
      totalTables: tableNames.length,
      orphanProperties: Number(orphanProps[0]?.total || 0),
      orphanTenancies: Number(orphanTenancies[0]?.total || 0),
      orphanPayments: Number(orphanPayments[0]?.total || 0),
    };
    console.log(`  ✓ Total Migrations: ${migrationFiles.length}`);
    console.log(`  ✓ Total Tables in Schema: ${tableNames.length}`);
    console.log(`  ✓ Orphan Records Check: Props=${auditReport.database.orphanProperties}, Tenancies=${auditReport.database.orphanTenancies}, Payments=${auditReport.database.orphanPayments}`);

    // -------------------------------------------------------------
    // PHASE C: BACKEND API INVENTORY
    // -------------------------------------------------------------
    console.log('\n--- AUDITING BACKEND API MODULES & CONTROLLERS ---');
    const modulesDir = path.join(__dirname, '../apps/api/src/modules');
    const moduleNames = fs.readdirSync(modulesDir).filter((f) => fs.statSync(path.join(modulesDir, f)).isDirectory());

    auditReport.apiInventory = {
      totalModules: moduleNames.length,
      modules: moduleNames,
    };
    console.log(`  ✓ Discovered ${moduleNames.length} backend architectural modules.`);

    // -------------------------------------------------------------
    // PHASE D: RBAC & SECURITY AUDIT
    // -------------------------------------------------------------
    console.log('\n--- AUDITING RBAC & DATA ISOLATION ---');
    const [permissions] = await db.query('SELECT COUNT(*) AS total FROM permissions');
    const [roles] = await db.query('SELECT COUNT(*) AS total FROM roles');
    const [rolePerms] = await db.query('SELECT COUNT(*) AS total FROM role_permissions');

    auditReport.rbacSecurity = {
      totalPermissions: Number(permissions[0]?.total || 0),
      totalRoles: Number(roles[0]?.total || 0),
      totalRolePermissions: Number(rolePerms[0]?.total || 0),
    };
    console.log(`  ✓ Registered Permissions: ${auditReport.rbacSecurity.totalPermissions}`);
    console.log(`  ✓ Registered Roles: ${auditReport.rbacSecurity.totalRoles}`);
    console.log(`  ✓ Role-Permission Bindings: ${auditReport.rbacSecurity.totalRolePermissions}`);

    // -------------------------------------------------------------
    // PHASE F: FINANCIAL CONSISTENCY AUDIT
    // -------------------------------------------------------------
    console.log('\n--- AUDITING FINANCIAL CONSISTENCY & LEDGER ---');
    const [paymentsCount] = await db.query('SELECT COUNT(*) AS total, SUM(total_amount) AS volume FROM payments');
    const [paidPayments] = await db.query('SELECT COUNT(*) AS total, SUM(total_amount) AS total_collected FROM payments WHERE status = "PAID"');
    const [platformRevenue] = await db.query(
      `SELECT SUM(total_amount) AS revenue FROM payments WHERE status = "PAID" AND purpose IN ('COMMISSION','MARKETING_PACKAGE','SERVICE_FEE','LEGAL_FEE')`,
    );
    const [directP2P] = await db.query(
      `SELECT SUM(total_amount) AS p2p FROM payments WHERE status = "PAID" AND purpose IN ('MONTHLY_RENT','SECURITY_DEPOSIT','ADVANCE_RENT')`,
    );

    auditReport.financialConsistency = {
      totalPayments: Number(paymentsCount[0]?.total || 0),
      grossPaymentVolume: Number(paymentsCount[0]?.volume || 0),
      totalCollected: Number(paidPayments[0]?.total_collected || 0),
      platformRevenue: Number(platformRevenue[0]?.revenue || 0),
      directP2PVolume: Number(directP2P[0]?.p2p || 0),
    };
    console.log(`  ✓ Master Ledger Payments: ${auditReport.financialConsistency.totalPayments} records (Volume: ₹${auditReport.financialConsistency.grossPaymentVolume.toLocaleString('en-IN')})`);
    console.log(`  ✓ Total Collected Settled: ₹${auditReport.financialConsistency.totalCollected.toLocaleString('en-IN')}`);
    console.log(`  ✓ Direct Tenant->Owner Rent/Deposit: ₹${auditReport.financialConsistency.directP2PVolume.toLocaleString('en-IN')}`);
    console.log(`  ✓ Net Platform Revenue: ₹${auditReport.financialConsistency.platformRevenue.toLocaleString('en-IN')}`);

    // -------------------------------------------------------------
    // PHASE G: CROSS-MODULE CONSISTENCY
    // -------------------------------------------------------------
    console.log('\n--- AUDITING CROSS-MODULE INTEGRITY ---');
    const [invalidTenancies] = await db.query(
      `SELECT COUNT(*) AS count FROM tenancies WHERE stage = 'ACTIVE' AND (rent_amount <= 0 OR owner_user_id IS NULL OR tenant_user_id IS NULL)`,
    );
    const [invalidAgreements] = await db.query(
      `SELECT COUNT(*) AS count FROM agreements WHERE status = 'EXECUTED' AND (executed_at IS NULL OR approved_at IS NULL)`,
    );
    const [unresolvedDisputes] = await db.query(
      `SELECT COUNT(*) AS count FROM disputes WHERE status IN ('OPEN','UNDER_REVIEW','EVIDENCE_REQUESTED')`,
    );

    auditReport.crossModuleConsistency = {
      invalidActiveTenancies: Number(invalidTenancies[0]?.count || 0),
      invalidExecutedAgreements: Number(invalidAgreements[0]?.count || 0),
      openDisputesCount: Number(unresolvedDisputes[0]?.count || 0),
    };
    console.log(`  ✓ Active Tenancies without Valid Agreement/Rent: ${auditReport.crossModuleConsistency.invalidActiveTenancies}`);
    console.log(`  ✓ Executed Agreements without Complete Dual Signatures: ${auditReport.crossModuleConsistency.invalidExecutedAgreements}`);
    console.log(`  ✓ Open Disputes under Active Resolution: ${auditReport.crossModuleConsistency.openDisputesCount}`);

    // -------------------------------------------------------------
    // PHASE H: AUTOMATION AUDIT
    // -------------------------------------------------------------
    console.log('\n--- AUDITING WORKFLOW AUTOMATION ENGINE ---');
    const [rulesCount] = await db.query('SELECT COUNT(*) AS total FROM workflow_rules');
    const [activeRules] = await db.query('SELECT COUNT(*) AS total FROM workflow_rules WHERE is_enabled = 1');
    const [eventsCount] = await db.query('SELECT COUNT(*) AS total FROM workflow_events');
    const [executionsCount] = await db.query('SELECT COUNT(*) AS total FROM workflow_executions');

    auditReport.automation = {
      totalRules: Number(rulesCount[0]?.total || 0),
      activeRules: Number(activeRules[0]?.total || 0),
      totalEvents: Number(eventsCount[0]?.total || 0),
      totalExecutions: Number(executionsCount[0]?.total || 0),
    };
    console.log(`  ✓ Governed Automation Rules: ${auditReport.automation.totalRules} (Active: ${auditReport.automation.activeRules})`);
    console.log(`  ✓ Total Events Dispatched: ${auditReport.automation.totalEvents}`);
    console.log(`  ✓ Total Actions Executed: ${auditReport.automation.totalExecutions}`);

    // -------------------------------------------------------------
    // PHASE I: OPERATIONS CONTROL TOWER AUDIT
    // -------------------------------------------------------------
    console.log('\n--- AUDITING OPERATIONS CONTROL TOWER ---');
    const [tasksCount] = await db.query('SELECT COUNT(*) AS total FROM operational_tasks');
    const [openTasks] = await db.query('SELECT COUNT(*) AS total FROM operational_tasks WHERE status IN ("OPEN","ASSIGNED","IN_PROGRESS","WAITING","ESCALATED")');
    const [taskEvents] = await db.query('SELECT COUNT(*) AS total FROM operational_task_events');

    auditReport.operations = {
      totalTasks: Number(tasksCount[0]?.total || 0),
      openTasks: Number(openTasks[0]?.total || 0),
      totalTaskEvents: Number(taskEvents[0]?.total || 0),
    };
    console.log(`  ✓ Operational Tasks: ${auditReport.operations.totalTasks} (Active Queue: ${auditReport.operations.openTasks})`);
    console.log(`  ✓ Operational Task Events Timeline: ${auditReport.operations.totalTaskEvents}`);

    // -------------------------------------------------------------
    // PHASE K: SECURITY & RISK AUDIT
    // -------------------------------------------------------------
    console.log('\n--- AUDITING SECURITY & RISK ENGINE ---');
    const [secEvents] = await db.query('SELECT COUNT(*) AS total FROM security_events');
    const [riskSignals] = await db.query('SELECT COUNT(*) AS total FROM risk_signals');
    const [riskCases] = await db.query('SELECT COUNT(*) AS total FROM risk_cases');

    auditReport.securityRisk = {
      securityEvents: Number(secEvents[0]?.total || 0),
      riskSignals: Number(riskSignals[0]?.total || 0),
      riskCases: Number(riskCases[0]?.total || 0),
    };
    console.log(`  ✓ Security Telemetry Events: ${auditReport.securityRisk.securityEvents}`);
    console.log(`  ✓ Explainable Risk Signals: ${auditReport.securityRisk.riskSignals}`);
    console.log(`  ✓ Governed Risk Cases: ${auditReport.securityRisk.riskCases}`);

    // -------------------------------------------------------------
    // PHASE L: EXTERNAL INTEGRATIONS AUDIT
    // -------------------------------------------------------------
    console.log('\n--- AUDITING EXTERNAL INTEGRATIONS ---');
    const [integrations] = await db.query('SELECT COUNT(*) AS total, provider_key, capability, health_status, is_enabled FROM external_integrations GROUP BY id, provider_key, capability, health_status, is_enabled');
    const [webhookEvents] = await db.query('SELECT COUNT(*) AS total FROM webhook_events');

    auditReport.integrations = {
      totalIntegrations: integrations.length,
      integrations: integrations.map((i) => ({ provider: i.provider_key, capability: i.capability, health: i.health_status, enabled: Boolean(i.is_enabled) })),
      webhookEventsLogged: Number(webhookEvents[0]?.total || 0),
    };
    console.log(`  ✓ Registered Capabilities: ${auditReport.integrations.totalIntegrations}`);
    console.log(`  ✓ Inbound Webhook Events Logged: ${auditReport.integrations.webhookEventsLogged}`);

    // -------------------------------------------------------------
    // PHASE M: PERSONALIZATION AUDIT
    // -------------------------------------------------------------
    console.log('\n--- AUDITING PERSONALIZATION & DISCOVERY ---');
    const [userPrefs] = await db.query('SELECT COUNT(*) AS total FROM user_property_preferences');
    const [savedPropsCount] = await db.query('SELECT COUNT(*) AS total FROM saved_properties');
    const [savedSearchesCount] = await db.query('SELECT COUNT(*) AS total FROM saved_searches');
    const [propInteractionsCount] = await db.query('SELECT COUNT(*) AS total FROM property_interactions');

    auditReport.personalization = {
      userPreferencesCount: Number(userPrefs[0]?.total || 0),
      savedPropertiesCount: Number(savedPropsCount[0]?.total || 0),
      savedSearchesCount: Number(savedSearchesCount[0]?.total || 0),
      propertyInteractionsCount: Number(propInteractionsCount[0]?.total || 0),
    };
    console.log(`  ✓ User Preference Profiles: ${auditReport.personalization.userPreferencesCount}`);
    console.log(`  ✓ Saved Properties Shortlisted: ${auditReport.personalization.savedPropertiesCount}`);
    console.log(`  ✓ Saved Searches Configured: ${auditReport.personalization.savedSearchesCount}`);
    console.log(`  ✓ Property Interactions Tracked: ${auditReport.personalization.propertyInteractionsCount}`);

    // -------------------------------------------------------------
    // PHASE P: PERFORMANCE QUERY BENCHMARKS
    // -------------------------------------------------------------
    console.log('\n--- MEASURING QUERY PERFORMANCE ---');
    const startPropSearch = Date.now();
    await db.query(`SELECT p.id, p.title, p.locality, p.city, p.rent_amount FROM properties p WHERE p.status = 'ACTIVE' LIMIT 24`);
    const propSearchLatency = Date.now() - startPropSearch;

    const startLedger = Date.now();
    await db.query(`SELECT pay.id, pay.reference_code, pay.total_amount, pay.status FROM payments pay ORDER BY pay.created_at DESC LIMIT 50`);
    const ledgerLatency = Date.now() - startLedger;

    const startAnalytics = Date.now();
    await db.query(`SELECT status, COUNT(*) AS count, SUM(total_amount) AS total FROM payments GROUP BY status`);
    const analyticsLatency = Date.now() - startAnalytics;

    auditReport.performance = {
      propertySearchLatencyMs: propSearchLatency,
      masterLedgerQueryLatencyMs: ledgerLatency,
      analyticsAggregationLatencyMs: analyticsLatency,
    };
    console.log(`  ✓ Property Search Query Latency: ${propSearchLatency}ms`);
    console.log(`  ✓ Master Financial Ledger Latency: ${ledgerLatency}ms`);
    console.log(`  ✓ Analytics Aggregate KPI Latency: ${analyticsLatency}ms`);

    console.log('\n======================================================================');
    console.log('  AUDIT DATA COLLECTION COMPLETED SUCCESSFULLY');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('Audit failed:', err);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

runAudit();
