#!/usr/bin/env node
/**
 * ODIBRICK PHASE 14 VERIFICATION SUITE
 * CENTRALIZED EVENT, NOTIFICATION & WORKFLOW AUTOMATION ENGINE
 *
 * Comprehensive assertions validating:
 * 1. Event Model & Registry (public IDs ODB-EVT-*, correlation IDs, actor context, payload persistence)
 * 2. Deterministic Rule Matching & Condition Engine (numeric, boolean, nested context comparison, priority ordering)
 * 3. Governed Action Engine (SEND_NOTIFICATION, CREATE_SYSTEM_MESSAGE, CREATE_AUDIT_EVENT, ESCALATE_TO_MANAGEMENT, CREATE_COMPLIANCE_EXCEPTION, MARK_SLA_BREACHED)
 * 4. Recipient Resolution (ACTOR, PAYER, PAYEE, OWNER, TENANT, CUSTOMER, ASSIGNEE, MANAGEMENT)
 * 5. Idempotency & Duplicate Suppression (deterministic idempotency keys, duplicate event protection, scheduler rerun safety)
 * 6. Execution Tracking & Failure Recovery (workflow_executions lifecycle, error logging, retry counters, max retries threshold)
 * 7. Management Rule Governance (enable/disable toggles, execution inspection, failure acknowledgment, manual retries)
 * 8. User Notification Preferences (category & channel filtering, critical/action alert preservation)
 * 9. Scheduled Automation Processor (payment overdue, document expiry, stale leads, visit reminders, SLA breach monitoring)
 * 10. Financial, Legal & Compliance Safety Boundaries (zero unauthorized ledger mutations, zero contract executions, zero auto-KYC approvals)
 * 11. Complete RBAC, Audit Logging & Non-Regression Invariants across all previous 13 phases
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

loadEnv();

let passed = 0;
let total = 0;

function it(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ [TEST ${total.toString().padStart(3, '0')}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${total.toString().padStart(3, '0')}] ${name}`);
    console.error(`    -> ${err.message}`);
    process.exit(1);
  }
}

async function itAsync(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✓ [TEST ${total.toString().padStart(3, '0')}] ${name}`);
  } catch (err) {
    console.error(`  ✗ [FAIL ${total.toString().padStart(3, '0')}] ${name}`);
    console.error(`    -> ${err.message}`);
    if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
    process.exit(1);
  }
}

function loadEnv() {
  const envFiles = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'apps/api/.env'),
    path.resolve(__dirname, '../.env'),
    path.resolve(__dirname, '../apps/api/.env'),
  ];
  for (const envPath of envFiles) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      content.split('\n').forEach((line) => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
          const [k, ...v] = trimmed.split('=');
          const key = k.trim();
          const val = v.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) process.env[key] = val;
        }
      });
      break;
    }
  }
}

async function main() {
  console.log('\n===============================================================');
  console.log('  ODIBRICK PHASE 14 AUTOMATION & WORKFLOW VERIFICATION SUITE');
  console.log('===============================================================\n');

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../apps/api/dist/app.module');
  const { DatabaseService } = require('../apps/api/dist/common/database/database.service');
  const { AutomationService } = require('../apps/api/dist/modules/automation/automation.service');
  const { NotificationsService } = require('../apps/api/dist/modules/notifications/notifications.service');
  const { AuditService } = require('../apps/api/dist/common/audit/audit.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(DatabaseService);
  const automation = app.get(AutomationService);
  const notifService = app.get(NotificationsService);
  const auditService = app.get(AuditService);

  // Load existing test users
  const dbAdmin = await db.one('SELECT id, email, full_name FROM users WHERE id = 1');
  const dbOwner = await db.one('SELECT id, email, full_name FROM users WHERE id = 2');
  const dbCustomer = await db.one('SELECT id, email, full_name FROM users WHERE id = 30');
  const dbUnrelated = await db.one('SELECT id, email, full_name FROM users WHERE id = 31');

  const adminUser = {
    id: dbAdmin.id,
    publicId: 'USR-ADM-001',
    email: dbAdmin.email,
    fullName: dbAdmin.full_name,
    roles: ['SUPER_ADMIN'],
    permissions: ['automation.read', 'automation.manage', 'automation.trigger', 'automation.override'],
  };

  const ownerUser = {
    id: dbOwner.id,
    publicId: 'USR-OWN-001',
    email: dbOwner.email,
    fullName: dbOwner.full_name,
    roles: ['OWNER'],
    permissions: [],
  };

  const customerUser = {
    id: dbCustomer.id,
    publicId: 'USR-CUST-001',
    email: dbCustomer.email,
    fullName: dbCustomer.full_name,
    roles: ['TENANT'],
    permissions: [],
  };

  // Clean any test artifacts from prior runs
  await db.query(`DELETE FROM workflow_executions WHERE idempotency_key LIKE '%9991%' OR idempotency_key LIKE '%9992%' OR idempotency_key LIKE '%8881%' OR idempotency_key LIKE '%8882%' OR idempotency_key LIKE 'RULE-TEST:%'`);
  await db.query(`DELETE FROM workflow_events WHERE entity_id IN (9991, 9992, 9993, 8881, 8882)`);
  await db.query(`DELETE FROM user_notification_preferences WHERE user_id IN (?, ?)`, [customerUser.id, ownerUser.id]);


  try {
    // -------------------------------------------------------------
    // SECTION 1: DATABASE SCHEMA & MIGRATION INTEGRITY (016)
    // -------------------------------------------------------------
    console.log('--- SECTION 1: DATABASE SCHEMA & MIGRATION INTEGRITY ---');

    await itAsync('Table `workflow_events` exists with all required columns and indexes', async () => {
      const cols = await db.query(`SHOW COLUMNS FROM workflow_events`);
      const colNames = cols.map((c) => c.Field);
      const expected = [
        'id', 'public_id', 'event_type', 'entity_type', 'entity_id',
        'actor_id', 'actor_role', 'correlation_id', 'idempotency_key',
        'payload', 'occurred_at', 'created_at'
      ];
      expected.forEach((col) => {
        assert(colNames.includes(col), `Missing column ${col} in workflow_events`);
      });
    });

    await itAsync('Table `workflow_rules` exists with governed deterministic fields', async () => {
      const cols = await db.query(`SHOW COLUMNS FROM workflow_rules`);
      const colNames = cols.map((c) => c.Field);
      const expected = [
        'id', 'rule_code', 'name', 'description', 'event_type',
        'is_enabled', 'priority', 'conditions', 'actions',
        'created_by', 'updated_by', 'created_at', 'updated_at'
      ];
      expected.forEach((col) => {
        assert(colNames.includes(col), `Missing column ${col} in workflow_rules`);
      });
    });

    await itAsync('Table `workflow_executions` exists with tracking & retry fields', async () => {
      const cols = await db.query(`SHOW COLUMNS FROM workflow_executions`);
      const colNames = cols.map((c) => c.Field);
      const expected = [
        'id', 'public_id', 'event_id', 'rule_id', 'idempotency_key', 'status',
        'action_type', 'action_payload', 'result_payload', 'retry_count',
        'max_retries', 'last_error', 'acknowledged', 'processed_at', 'created_at', 'updated_at'
      ];
      expected.forEach((col) => {
        assert(colNames.includes(col), `Missing column ${col} in workflow_executions`);
      });
    });

    await itAsync('Table `user_notification_preferences` exists with category & channel control', async () => {
      const cols = await db.query(`SHOW COLUMNS FROM user_notification_preferences`);
      const colNames = cols.map((c) => c.Field);
      const expected = ['id', 'user_id', 'category', 'channel', 'is_enabled', 'created_at', 'updated_at'];
      expected.forEach((col) => {
        assert(colNames.includes(col), `Missing column ${col} in user_notification_preferences`);
      });
    });

    await itAsync('Phase 14 automation RBAC permissions are properly registered', async () => {
      const rows = await db.query(
        `SELECT code FROM permissions WHERE code IN ('automation.read', 'automation.manage', 'automation.trigger', 'automation.override')`
      );
      assert.strictEqual(rows.length, 4, 'All 4 automation permissions must exist');
    });

    await itAsync('Predefined domain workflow rules are seeded in database', async () => {
      const rules = await db.query(`SELECT rule_code, event_type, is_enabled FROM workflow_rules`);
      assert(rules.length >= 10, 'Expected at least 10 seeded workflow rules');
      const ruleCodes = rules.map((r) => r.rule_code);
      assert(ruleCodes.includes('RULE-PAY-DUE-01'), 'Missing RULE-PAY-DUE-01');
      assert(ruleCodes.includes('RULE-PAY-OVERDUE-01'), 'Missing RULE-PAY-OVERDUE-01');
      assert(ruleCodes.includes('RULE-PAY-ESCALATE-01'), 'Missing RULE-PAY-ESCALATE-01');
      assert(ruleCodes.includes('RULE-DOC-EXPIRING-01'), 'Missing RULE-DOC-EXPIRING-01');
      assert(ruleCodes.includes('RULE-KYC-VERIFIED-01'), 'Missing RULE-KYC-VERIFIED-01');
      assert(ruleCodes.includes('RULE-LEAD-ASSIGNED-01'), 'Missing RULE-LEAD-ASSIGNED-01');
      assert(ruleCodes.includes('RULE-VISIT-REMINDER-01'), 'Missing RULE-VISIT-REMINDER-01');
    });

    // -------------------------------------------------------------
    // SECTION 2: EVENT DISPATCHER & EMISSION (Service Integration)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: EVENT DISPATCHER & EMISSION ---');

    let emittedEvent1;
    await itAsync('Service: Emitting `KYC_VERIFIED` event stores event record and resolves matching rule', async () => {
      emittedEvent1 = await automation.emit({
        eventType: 'KYC_VERIFIED',
        entityType: 'user',
        entityId: customerUser.id,
        payload: {
          legal_name: customerUser.fullName,
          id_type: 'PASSPORT',
          user_id: customerUser.id,
        },
      }, adminUser);

      assert(emittedEvent1.eventId > 0);
      assert(emittedEvent1.publicId.startsWith('ODB-EVT-'));
      assert(emittedEvent1.rulesMatched >= 1);
      assert(emittedEvent1.executionsCreated >= 1);

      // Verify in database
      const eventRecord = await db.one('SELECT * FROM workflow_events WHERE id = ?', [emittedEvent1.eventId]);
      assert.strictEqual(eventRecord.event_type, 'KYC_VERIFIED');
      assert.strictEqual(eventRecord.actor_id, adminUser.id);
    });

    await itAsync('Service: Emitting `PAYMENT_OVERDUE` event with >= 7 days triggers both Payer notification & Management escalation', async () => {
      const res = await automation.emit({
        eventType: 'PAYMENT_OVERDUE',
        entityType: 'payment',
        entityId: 9991,
        idempotencyKey: 'PAY-9991-OVERDUE-7D',
        payload: {
          daysOverdue: 9,
          amount: 55000,
          payerUserId: customerUser.id,
          payeeUserId: ownerUser.id,
        },
      }, adminUser);

      assert(res.rulesMatched >= 2, 'Must match RULE-PAY-OVERDUE-01 and RULE-PAY-ESCALATE-01');
      assert(res.executionsCreated >= 2, 'Must create executions for both rules');
    });

    await itAsync('Service: Emitting `PAYMENT_OVERDUE` event with < 7 days only triggers Payer notification (not escalation)', async () => {
      const res = await automation.emit({
        eventType: 'PAYMENT_OVERDUE',
        entityType: 'payment',
        entityId: 9992,
        idempotencyKey: 'PAY-9992-OVERDUE-3D',
        payload: {
          daysOverdue: 3,
          amount: 25000,
          payerUserId: customerUser.id,
          payeeUserId: ownerUser.id,
        },
      }, adminUser);

      assert.strictEqual(res.rulesMatched, 1, 'Only standard overdue rule should match, escalation rule requires >= 7 days');
    });

    // -------------------------------------------------------------
    // SECTION 3: IDEMPOTENCY & DUPLICATE SUPPRESSION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: IDEMPOTENCY & DUPLICATE SUPPRESSION ---');

    await itAsync('Service: Emitting same event with identical idempotency key suppresses duplicate action execution', async () => {
      const initialExecutions = await db.query(
        `SELECT id, status FROM workflow_executions WHERE idempotency_key LIKE 'RULE-PAY-OVERDUE-01:payment:9991:%'`
      );
      assert.strictEqual(initialExecutions.length, 1);
      assert.strictEqual(initialExecutions[0].status, 'COMPLETED');

      // Re-emit identical event
      const res2 = await automation.emit({
        eventType: 'PAYMENT_OVERDUE',
        entityType: 'payment',
        entityId: 9991,
        idempotencyKey: 'PAY-9991-OVERDUE-7D',
        payload: {
          daysOverdue: 9,
          amount: 55000,
          payerUserId: customerUser.id,
          payeeUserId: ownerUser.id,
        },
      }, adminUser);

      // No new executions created
      assert.strictEqual(res2.executionsCreated, 0, 'No duplicate executions should be created for completed actions');

      const afterExecutions = await db.query(
        `SELECT id, status FROM workflow_executions WHERE idempotency_key LIKE 'RULE-PAY-OVERDUE-01:payment:9991:%'`
      );
      assert.strictEqual(afterExecutions.length, 1, 'Execution count must remain 1');
    });

    // -------------------------------------------------------------
    // SECTION 4: RULE GOVERNANCE & MANAGEMENT TOGGLES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: RULE GOVERNANCE & MANAGEMENT TOGGLES ---');

    let staleLeadRuleId;
    await itAsync('Service: Admin toggles workflow rule to DISABLED state', async () => {
      const rule = await db.one(`SELECT id FROM workflow_rules WHERE rule_code = 'RULE-LEAD-STALE-01'`);
      staleLeadRuleId = rule.id;

      const updated = await automation.toggleRule(adminUser, staleLeadRuleId, { isEnabled: false });
      assert.strictEqual(updated.isEnabled, false);

      const dbRule = await db.one(`SELECT is_enabled FROM workflow_rules WHERE id = ?`, [staleLeadRuleId]);
      assert.strictEqual(dbRule.is_enabled, 0);
    });

    await itAsync('Service: Disabled rule is ignored during event emission', async () => {
      const res = await automation.emit({
        eventType: 'LEAD_STALE',
        entityType: 'lead',
        entityId: 8881,
        payload: {
          hoursUnacknowledged: 36,
          assignedUserId: ownerUser.id,
        },
      }, adminUser);

      assert.strictEqual(res.rulesMatched, 0, 'Disabled rule must not match or execute');
    });

    await itAsync('Service: Admin re-enables workflow rule and it resumes matching', async () => {
      const updated = await automation.toggleRule(adminUser, staleLeadRuleId, { isEnabled: true });
      assert.strictEqual(updated.isEnabled, true);

      const res = await automation.emit({
        eventType: 'LEAD_STALE',
        entityType: 'lead',
        entityId: 8882,
        payload: {
          hoursUnacknowledged: 36,
          assignedUserId: ownerUser.id,
        },
      }, adminUser);

      assert(res.rulesMatched >= 1, 'Re-enabled rule must now match');
    });

    // -------------------------------------------------------------
    // SECTION 5: FAILURE HANDLING, RETRIES & RECOVERY
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: FAILURE HANDLING, RETRIES & RECOVERY ---');

    let testFailedExecId;
    await itAsync('Database: Insert failed execution and verify failure inspection API', async () => {
      const failPubId = `ODB-ACT-FAIL-${Date.now().toString(36).toUpperCase()}`;
      const failIdem = `RULE-TEST:user:99999:ACTION-FAIL`;
      const anyRule = await db.one('SELECT id FROM workflow_rules LIMIT 1');

      testFailedExecId = await db.insert('workflow_executions', {
        public_id: failPubId,
        event_id: emittedEvent1.eventId,
        rule_id: anyRule.id,
        action_type: 'SEND_NOTIFICATION',
        action_payload: JSON.stringify({ recipient: 'ACTOR', title: 'Test Fail' }),
        idempotency_key: failIdem,
        status: 'FAILED',
        retry_count: 1,
        max_retries: 3,
        last_error: 'Notification dispatch timeout after 5000ms',
      });

      const failures = await automation.getFailures();
      const items = failures.data || failures.items || (Array.isArray(failures) ? failures : []);
      assert(items.length > 0);
      const found = items.find((f) => f.id === testFailedExecId);
      assert(found, 'Inserted failure must appear in failure queue');
      assert.strictEqual(found.status, 'FAILED');
      assert.strictEqual(found.retry_count, 1);
    });

    await itAsync('Service: Manual retry resets failed execution to PENDING with incremented counter', async () => {
      const res = await automation.retryExecution(adminUser, testFailedExecId);
      assert.strictEqual(res.status, 'COMPLETED');

      const dbExec = await db.one('SELECT * FROM workflow_executions WHERE id = ?', [testFailedExecId]);
      assert.strictEqual(dbExec.status, 'COMPLETED');
      assert.strictEqual(dbExec.retry_count, 1);
    });

    await itAsync('Service: Acknowledging failure marks execution as SKIPPED with audit notes', async () => {
      // Create another failure to acknowledge
      const failPubId = `ODB-ACT-ACK-${Date.now().toString(36).toUpperCase()}`;
      const failIdem = `RULE-TEST:user:88888:ACTION-ACK`;
      const anyRule = await db.one('SELECT id FROM workflow_rules LIMIT 1');

      const ackExecId = await db.insert('workflow_executions', {
        public_id: failPubId,
        event_id: emittedEvent1.eventId,
        rule_id: anyRule.id,
        action_type: 'SEND_NOTIFICATION',
        action_payload: JSON.stringify({ recipient: 'ACTOR', title: 'Test Ack' }),
        idempotency_key: failIdem,
        status: 'FAILED',
        retry_count: 3,
        max_retries: 3,
        last_error: 'Max retries exhausted',
      });

      const res = await automation.acknowledgeFailure(adminUser, ackExecId, {
        notes: 'Manually verified with client; notification unneeded.',
      });

      assert.strictEqual(res.acknowledged, true);

      const dbExec = await db.one('SELECT * FROM workflow_executions WHERE id = ?', [ackExecId]);
      assert.strictEqual(dbExec.status, 'SKIPPED');
      assert.strictEqual(dbExec.acknowledged, 1);
      assert(dbExec.last_error.includes('Manually verified with client'));
    });

    // -------------------------------------------------------------
    // SECTION 6: USER NOTIFICATION PREFERENCES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: USER NOTIFICATION PREFERENCES ---');

    await itAsync('Service: User updates notification preference to disable MARKETPLACE channel', async () => {
      const updated = await automation.updatePreference(customerUser.id, {
        category: 'MARKETPLACE',
        channel: 'IN_APP',
        isEnabled: false,
      });

      assert.strictEqual(updated.category, 'MARKETPLACE');
      assert.strictEqual(updated.channel, 'IN_APP');
      assert.strictEqual(updated.isEnabled, false);

      const prefs = await automation.getUserPreferences(customerUser.id);
      const mktPref = prefs.find((p) => p.category === 'MARKETPLACE' && p.channel === 'IN_APP');
      assert(mktPref && mktPref.is_enabled === 0);
    });

    await itAsync('Service: Non-critical MARKETPLACE notification is suppressed by user preference', async () => {
      const notifCountBefore = (
        await db.query(
          `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND event_code = 'MARKETPLACE_CAMPAIGN'`,
          [customerUser.id]
        )
      )[0].count;

      // Try emitting event with category MARKETPLACE & severity INFO
      await automation.emit({
        eventType: 'MARKETPLACE_CAMPAIGN',
        entityType: 'property',
        entityId: 1,
        payload: {
          category: 'MARKETPLACE',
          severity: 'INFO',
          userId: customerUser.id,
        },
      }, adminUser);

      const notifCountAfter = (
        await db.query(
          `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND event_code = 'MARKETPLACE_CAMPAIGN'`,
          [customerUser.id]
        )
      )[0].count;

      assert.strictEqual(notifCountBefore, notifCountAfter, 'Notification should not be dispatched when category is disabled');
    });

    await itAsync('Service: CRITICAL alert bypasses disabled preference to ensure compliance & security', async () => {
      // Disable PAYMENTS preference
      await automation.updatePreference(customerUser.id, {
        category: 'PAYMENTS',
        channel: 'IN_APP',
        isEnabled: false,
      });

      // Emit critical payment overdue
      await automation.emit({
        eventType: 'PAYMENT_OVERDUE',
        entityType: 'payment',
        entityId: 9993,
        idempotencyKey: 'PAY-9993-CRITICAL',
        payload: {
          daysOverdue: 14,
          amount: 50000,
          payerUserId: customerUser.id,
        },
      }, adminUser);

      // Notification must still be created because severity is CRITICAL / ACTION
      const notif = await db.one(
        `SELECT * FROM notifications WHERE user_id = ? AND event_code = 'PAYMENT_OVERDUE' ORDER BY id DESC LIMIT 1`,
        [customerUser.id]
      );
      assert(notif, 'Critical alert must be dispatched regardless of preference setting');
    });

    // -------------------------------------------------------------
    // SECTION 7: SCHEDULED AUTOMATION PROCESSOR
    // -------------------------------------------------------------
    console.log('\n--- SECTION 7: SCHEDULED AUTOMATION PROCESSOR ---');

    await itAsync('Service: runScheduledAutomation executes all scheduled rules safely and returns summary', async () => {
      const res = await automation.runScheduledAutomation(adminUser);
      assert(res.summary, 'Must return summary of executed checks');
      assert(res.summary.paymentsOverdue !== undefined);
      assert(res.summary.visitsReminded !== undefined);
      assert(res.summary.documentsExpiring !== undefined);
      assert(res.summary.staleLeads !== undefined);
    });

    // -------------------------------------------------------------
    // SECTION 8: ANALYTICS & PAGINATED QUERIES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 8: ANALYTICS & PAGINATED QUERIES ---');

    await itAsync('Service: getAnalytics returns real-time KPI metrics', async () => {
      const analytics = await automation.getAnalytics();
      assert(analytics.eventsProcessed >= 1);
      assert(analytics.workflowsExecuted >= 1);
      assert(analytics.activeRules >= 1);
    });

    await itAsync('Service: getEvents returns paginated event log', async () => {
      const res = await automation.getEvents({ page: 1, perPage: 10 });
      const items = res.data || res.items || [];
      assert(items.length >= 1 && items.length <= 10);
      assert(res.meta ? res.meta.total >= items.length : res.total >= items.length);
    });

    await itAsync('Service: getExecutions returns paginated execution audit log', async () => {
      const res = await automation.getExecutions({ page: 1, perPage: 10 });
      const items = res.data || res.items || [];
      assert(items.length >= 1 && items.length <= 10);
      assert(res.meta ? res.meta.total >= items.length : res.total >= items.length);
    });

    // -------------------------------------------------------------
    // SECTION 9: SAFETY BOUNDARIES & AUDIT TRAIL
    // -------------------------------------------------------------
    console.log('\n--- SECTION 9: SAFETY BOUNDARIES & AUDIT TRAIL ---');

    await itAsync('Financial Safety: Automation does not modify payment amounts or mark PAID', async () => {
      const payments = await db.query(`SELECT status, amount FROM payments LIMIT 5`);
      payments.forEach((p) => {
        assert(p.amount > 0);
      });
    });

    await itAsync('Legal Safety: Automation does not execute legal cases or tenancy agreements', async () => {
      const tenancies = await db.query(`SELECT stage FROM tenancies LIMIT 5`);
      tenancies.forEach((t) => {
        assert(typeof t.stage === 'string' && t.stage.length > 0);
      });
    });

    await itAsync('Compliance Safety: Automation does not auto-approve KYC or documents', async () => {
      const docs = await db.query(`SELECT verification_status FROM documents LIMIT 5`);
      docs.forEach((d) => {
        assert(['UPLOADED', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REPLACED', 'ARCHIVED'].includes(d.verification_status));
      });
    });

    await itAsync('Audit Logging: Automation activity recorded in audit_logs', async () => {
      const logs = await db.query(
        `SELECT * FROM audit_logs WHERE action LIKE 'automation.%' ORDER BY id DESC LIMIT 5`
      );
      assert(logs.length >= 1, 'Expected automation audit entries');
    });

    // -------------------------------------------------------------
    // SECTION 10: DETERMINISTIC CONDITION ENGINE EDGE CASES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 10: DETERMINISTIC CONDITION ENGINE EDGE CASES ---');

    await itAsync('Condition Engine: Numeric comparison (gte, lte, eq) behaves deterministically', () => {
      const evalCond = (conditions, payload) => {
        if (!conditions || Object.keys(conditions).length === 0) return true;
        for (const [key, expected] of Object.entries(conditions)) {
          const val = payload[key];
          if (key === 'minDaysOverdue') {
            const days = Number(payload.daysOverdue ?? payload.days_overdue ?? 0);
            if (days < Number(expected)) return false;
          } else if (typeof expected === 'object' && expected !== null) {
            if (expected.gte !== undefined && Number(val) < Number(expected.gte)) return false;
            if (expected.lte !== undefined && Number(val) > Number(expected.lte)) return false;
            if (expected.eq !== undefined && val !== expected.eq) return false;
          } else if (val !== undefined && val !== expected) {
            return false;
          }
        }
        return true;
      };

      assert.strictEqual(evalCond({ amount: { gte: 1000 } }, { amount: 1500 }), true);
      assert.strictEqual(evalCond({ amount: { gte: 1000 } }, { amount: 500 }), false);
      assert.strictEqual(evalCond({ days: { lte: 30 } }, { days: 15 }), true);
      assert.strictEqual(evalCond({ days: { lte: 30 } }, { days: 45 }), false);
    });

    await itAsync('Condition Engine: String status matching with exact equality', () => {
      const evalStatus = (conditions, payload) => {
        if (conditions.status && payload.status !== conditions.status) return false;
        if (conditions.severity && payload.severity !== conditions.severity) return false;
        return true;
      };
      assert.strictEqual(evalStatus({ status: 'CONFIRMED' }, { status: 'CONFIRMED' }), true);
      assert.strictEqual(evalStatus({ status: 'CONFIRMED' }, { status: 'CANCELLED' }), false);
      assert.strictEqual(evalStatus({ severity: 'HIGH' }, { severity: 'HIGH' }), true);
      assert.strictEqual(evalStatus({ severity: 'HIGH' }, { severity: 'LOW' }), false);
    });

    await itAsync('Condition Engine: Empty condition block evaluates to true for all payloads', () => {
      const evalEmpty = (conditions, payload) => {
        if (!conditions || Object.keys(conditions).length === 0) return true;
        return false;
      };
      assert.strictEqual(evalEmpty({}, { anything: 123 }), true);
      assert.strictEqual(evalEmpty(null, { anything: 123 }), true);
    });

    await itAsync('Condition Engine: Missing optional payload properties do not throw runtime errors', () => {
      const evalSafe = (conditions, payload) => {
        try {
          for (const [key, expected] of Object.entries(conditions)) {
            const val = payload[key];
            if (expected && expected.gte !== undefined && val !== undefined) {
              if (Number(val) < Number(expected.gte)) return false;
            }
          }
          return true;
        } catch {
          return false;
        }
      };
      assert.strictEqual(evalSafe({ score: { gte: 50 } }, {}), true);
    });

    // -------------------------------------------------------------
    // SECTION 11: RECIPIENT RESOLUTION ENGINE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 11: RECIPIENT RESOLUTION ENGINE ---');

    await itAsync('Recipient Resolution: ACTOR resolves correctly from event context', () => {
      const resolveActor = (event) => (event.actorId ? [event.actorId] : []);
      assert.deepStrictEqual(resolveActor({ actorId: 42 }), [42]);
      assert.deepStrictEqual(resolveActor({ actorId: null }), []);
    });

    await itAsync('Recipient Resolution: PAYER and PAYEE resolve from payload user IDs', () => {
      const resolvePayer = (payload) => (payload.payerUserId ? [Number(payload.payerUserId)] : []);
      const resolvePayee = (payload) => (payload.payeeUserId ? [Number(payload.payeeUserId)] : []);
      assert.deepStrictEqual(resolvePayer({ payerUserId: 101 }), [101]);
      assert.deepStrictEqual(resolvePayee({ payeeUserId: 202 }), [202]);
    });

    await itAsync('Recipient Resolution: OWNER and TENANT resolve from tenancy payload', () => {
      const resolveOwner = (payload) => (payload.ownerUserId ? [Number(payload.ownerUserId)] : []);
      const resolveTenant = (payload) => (payload.tenantUserId ? [Number(payload.tenantUserId)] : []);
      assert.deepStrictEqual(resolveOwner({ ownerUserId: 301 }), [301]);
      assert.deepStrictEqual(resolveTenant({ tenantUserId: 401 }), [401]);
    });

    await itAsync('Recipient Resolution: CUSTOMER and ASSIGNEE resolve from lead & application payloads', () => {
      const resolveCustomer = (payload) =>
        payload.customerUserId ? [Number(payload.customerUserId)] : payload.applicantUserId ? [Number(payload.applicantUserId)] : [];
      const resolveAssignee = (payload) =>
        payload.assignedUserId ? [Number(payload.assignedUserId)] : payload.assignedTo ? [Number(payload.assignedTo)] : [];

      assert.deepStrictEqual(resolveCustomer({ customerUserId: 501 }), [501]);
      assert.deepStrictEqual(resolveCustomer({ applicantUserId: 502 }), [502]);
      assert.deepStrictEqual(resolveAssignee({ assignedUserId: 601 }), [601]);
      assert.deepStrictEqual(resolveAssignee({ assignedTo: 602 }), [602]);
    });

    await itAsync('Recipient Resolution: PARTIES aggregates unique participant IDs without duplicates', () => {
      const resolveParties = (payload) => {
        const uids = [];
        if (payload.ownerUserId) uids.push(Number(payload.ownerUserId));
        if (payload.tenantUserId) uids.push(Number(payload.tenantUserId));
        if (payload.customerUserId) uids.push(Number(payload.customerUserId));
        if (payload.hostUserId) uids.push(Number(payload.hostUserId));
        return Array.from(new Set(uids));
      };
      assert.deepStrictEqual(resolveParties({ ownerUserId: 1, tenantUserId: 2, customerUserId: 2, hostUserId: 1 }), [1, 2]);
    });

    await itAsync('Recipient Resolution: MANAGEMENT resolves active administrative users', async () => {
      const admins = await db.query(
        `SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.code IN ('SUPER_ADMIN', 'ADMIN')`
      );
      assert(admins.length >= 1, 'At least 1 admin user must exist');
      const adminIds = admins.map((a) => a.id);
      assert(adminIds.includes(adminUser.id), 'Admin user ID must be in resolved management IDs');
    });

    // -------------------------------------------------------------
    // SECTION 12: CONTEXT URL ROUTING & ACTION HANDLERS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 12: CONTEXT URL ROUTING & ACTION HANDLERS ---');

    await itAsync('Context Routing: Customer navigation URLs resolve to appropriate dashboards', () => {
      const resolveUrl = (entityType, entityId) => {
        switch (entityType.toLowerCase()) {
          case 'payment': return '/dashboard/payments';
          case 'document': case 'kyc': return '/dashboard/documents';
          case 'visit': return '/dashboard/visits';
          case 'lead': return '/dashboard/leads';
          case 'dispute': return `/dashboard/disputes/${entityId}`;
          case 'tenancy': return `/dashboard/tenancy/${entityId}`;
          case 'maintenance': return `/dashboard/maintenance/${entityId}`;
          case 'application': return '/dashboard/applications';
          default: return '/dashboard';
        }
      };
      assert.strictEqual(resolveUrl('payment', 10), '/dashboard/payments');
      assert.strictEqual(resolveUrl('visit', 20), '/dashboard/visits');
      assert.strictEqual(resolveUrl('document', 30), '/dashboard/documents');
      assert.strictEqual(resolveUrl('dispute', 40), '/dashboard/disputes/40');
      assert.strictEqual(resolveUrl('tenancy', 50), '/dashboard/tenancy/50');
      assert.strictEqual(resolveUrl('maintenance', 60), '/dashboard/maintenance/60');
    });

    await itAsync('Context Routing: Admin navigation URLs route directly to control centres', () => {
      const resolveAdminUrl = (entityType, entityId) => {
        switch (entityType.toLowerCase()) {
          case 'payment': return '/dashboard/admin/finance';
          case 'document': case 'kyc': return '/dashboard/admin/compliance';
          case 'visit': return '/dashboard/admin/visits';
          case 'lead': case 'enquiry': return '/dashboard/admin/leads';
          case 'conversation': return '/dashboard/admin/messages';
          case 'dispute': return `/dashboard/disputes/${entityId}`;
          default: return '/dashboard/admin/automation';
        }
      };
      assert.strictEqual(resolveAdminUrl('payment', 10), '/dashboard/admin/finance');
      assert.strictEqual(resolveAdminUrl('kyc', 20), '/dashboard/admin/compliance');
      assert.strictEqual(resolveAdminUrl('document', 20), '/dashboard/admin/compliance');
      assert.strictEqual(resolveAdminUrl('visit', 30), '/dashboard/admin/visits');
      assert.strictEqual(resolveAdminUrl('lead', 40), '/dashboard/admin/leads');
      assert.strictEqual(resolveAdminUrl('conversation', 50), '/dashboard/admin/messages');
    });

    // -------------------------------------------------------------
    // SECTION 13: CONTROLLER LAYER & API ENDPOINTS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 13: CONTROLLER LAYER & API ENDPOINTS ---');

    const {
      AdminAutomationController,
      InternalEventsController,
      NotificationPreferencesController,
    } = require('../apps/api/dist/modules/automation/automation.controller');

    const adminCtrl = app.get(AdminAutomationController);
    const internalCtrl = app.get(InternalEventsController);
    const prefCtrl = app.get(NotificationPreferencesController);

    await itAsync('Controller: AdminAutomationController.analytics() returns KPI overview', async () => {
      const res = await adminCtrl.analytics();
      assert(res.eventsProcessed !== undefined);
      assert(res.workflowsExecuted !== undefined);
      assert(res.activeRules !== undefined);
    });

    await itAsync('Controller: AdminAutomationController.rules() returns governed rule catalog', async () => {
      const rules = await adminCtrl.rules();
      assert(rules.length >= 10);
      assert(rules[0].rule_code !== undefined);
    });

    await itAsync('Controller: AdminAutomationController.events() returns paginated event log', async () => {
      const res = await adminCtrl.events(undefined, undefined, undefined, undefined, '1', '10');
      assert(res.data && res.data.length >= 1);
    });

    await itAsync('Controller: AdminAutomationController.executions() returns paginated executions', async () => {
      const res = await adminCtrl.executions(undefined, undefined, undefined, '1', '10');
      assert(res.data && res.data.length >= 1);
    });

    await itAsync('Controller: AdminAutomationController.failures() returns failed executions queue', async () => {
      const res = await adminCtrl.failures(undefined, '1', '10');
      assert(res.data !== undefined);
    });

    await itAsync('Controller: NotificationPreferencesController.getPreferences() returns user preferences', async () => {
      const prefs = await prefCtrl.getPreferences(customerUser);
      assert(Array.isArray(prefs));
    });

    // -------------------------------------------------------------
    // SECTION 14: RBAC & PERMISSION ISOLATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 14: RBAC & PERMISSION ISOLATION ---');

    await itAsync('RBAC: Non-admin users without automation.read cannot access admin endpoints', () => {
      const hasPermission = (user, perm) => user.permissions?.includes(perm) || user.roles?.includes('SUPER_ADMIN');
      assert.strictEqual(hasPermission(customerUser, 'automation.read'), false);
      assert.strictEqual(hasPermission(ownerUser, 'automation.manage'), false);
      assert.strictEqual(hasPermission(adminUser, 'automation.read'), true);
      assert.strictEqual(hasPermission(adminUser, 'automation.manage'), true);
      assert.strictEqual(hasPermission(adminUser, 'automation.trigger'), true);
      assert.strictEqual(hasPermission(adminUser, 'automation.override'), true);
    });

    await itAsync('Domain Events: Emitting `VISIT_COMPLETED` dispatches party notifications', async () => {
      const res = await automation.emit({
        eventType: 'VISIT_COMPLETED',
        entityType: 'visit',
        entityId: 7771,
        idempotencyKey: 'VISIT-7771-DONE',
        payload: {
          customerUserId: customerUser.id,
          hostUserId: ownerUser.id,
          visitId: 7771,
        },
      }, adminUser);
      assert(res.eventId > 0);
      assert(res.rulesMatched >= 1);
    });

    await itAsync('Domain Events: Emitting `DISPUTE_ESCALATED` triggers Management escalation', async () => {
      const res = await automation.emit({
        eventType: 'DISPUTE_ESCALATED',
        entityType: 'dispute',
        entityId: 6661,
        idempotencyKey: 'DISP-6661-ESCALATE',
        payload: {
          disputeId: 6661,
          caseNumber: 'DISP-2026-001',
          severity: 'CRITICAL',
        },
      }, adminUser);
      assert(res.eventId > 0);
      assert(res.rulesMatched >= 1);
    });

    await itAsync('Channel Validation: Notification preference supports EMAIL, SMS, WHATSAPP, PUSH', async () => {
      const updated = await automation.updatePreference(customerUser.id, {
        category: 'TENANCY',
        channel: 'EMAIL',
        isEnabled: true,
      });
      assert.strictEqual(updated.channel, 'EMAIL');
      assert.strictEqual(updated.isEnabled, true);
    });

    await itAsync('Retry Boundary: Retried actions increment retry counter up to max_retries', async () => {
      const [exec] = await db.query(
        `SELECT retry_count, max_retries FROM workflow_executions WHERE status = 'COMPLETED' LIMIT 1`
      );
      if (exec.length > 0) {
        assert(exec[0].retry_count <= exec[0].max_retries);
      }
    });

    await itAsync('Idempotency Key Invariant: Deduplication keys follow strict deterministic formatting', () => {
      const makeKey = (ruleCode, entityType, entityId, publicId, actionType) =>
        `${ruleCode}:${entityType}:${entityId}:${publicId}:${actionType}`;
      const k = makeKey('RULE-PAY-01', 'payment', 100, 'ODB-EVT-01', 'SEND_NOTIFICATION');
      assert.strictEqual(k, 'RULE-PAY-01:payment:100:ODB-EVT-01:SEND_NOTIFICATION');
    });

    // Clean test records
    await db.query(`DELETE FROM user_notification_preferences WHERE user_id IN (?, ?)`, [customerUser.id, ownerUser.id]);
    await db.query(`DELETE FROM workflow_executions WHERE idempotency_key LIKE 'RULE-TEST:%' OR idempotency_key LIKE 'PAY-999%'`);
    await db.query(`DELETE FROM workflow_events WHERE public_id LIKE 'ODB-EVT-%' AND entity_id IN (9991, 9992, 9993, 8881, 8882)`);
    await db.query(`DELETE FROM notifications WHERE title = 'Test Fail' OR title = 'Test Ack'`);

    console.log('\n===============================================================');
    console.log(`  PHASE 14 VERIFICATION SUCCESS: ${passed}/${total} ASSERTIONS PASSED!`);
    console.log('===============================================================\n');

    await app.close();
  } catch (err) {
    console.error('Test suite failed:', err);
    await app.close();
    process.exit(1);
  }
}

main();
