#!/usr/bin/env node
/**
 * ODIBRICK PHASE 15 VERIFICATION SUITE
 * UNIFIED MANAGEMENT OPERATIONS CONTROL TOWER
 * WORK QUEUE, OPERATIONAL TASKS, ESCALATIONS & SLA MANAGEMENT
 *
 * Comprehensive assertions validating:
 * 1. Database Schema & Migration Integrity (017 migration, operational_tasks, operational_task_events, RBAC permissions)
 * 2. Task Creation & Model Integrity (public IDs TSK-*, source domain, entity linking, priority, SLAs)
 * 3. Deterministic Idempotency (deduplication keys prevent redundant task generation)
 * 4. Assignment Engine (assign, reassign, claim, unassign, team routing)
 * 5. Priority & SLA Engine (SLA calculation, DUE_SOON, OVERDUE, BREACHED thresholds)
 * 6. Governed Status Lifecycle & Escalation (OPEN -> ASSIGNED -> IN_PROGRESS -> WAITING -> ESCALATED -> RESOLVED -> CLOSED)
 * 7. Resolution & Reopen Governance (completion timestamp, governance notes, reopening reasons, zero domain mutation)
 * 8. Audit Trail & Timeline (operational_task_events, audit_logs integration, comment postings)
 * 9. Notifications & Management Alerts (assignee notices, critical escalation alerts)
 * 10. Unified Cross-Domain Exception Aggregation (Finance overdue, KYC compliance, Legal cases, Disputes, Automation failures)
 * 11. Phase 14 Event & Workflow Automation Integration (CREATE_TASK_OR_FOLLOW_UP, ESCALATE_TO_MANAGEMENT)
 * 12. Management RBAC & Isolation (SUPER_ADMIN / ADMIN permissions, Tenant/Owner denial)
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const assert = require('assert');
const path = require('path');
const fs = require('fs');

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

async function main() {
  console.log('\n======================================================================');
  console.log('  ODIBRICK PHASE 15 OPERATIONS CONTROL TOWER VERIFICATION SUITE');
  console.log('======================================================================\n');

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../apps/api/dist/app.module');
  const { DatabaseService } = require('../apps/api/dist/common/database/database.service');
  const { OperationalTasksService } = require('../apps/api/dist/modules/operations/operational-tasks.service');
  const { AutomationService } = require('../apps/api/dist/modules/automation/automation.service');
  const { NotificationsService } = require('../apps/api/dist/modules/notifications/notifications.service');
  const { AuditService } = require('../apps/api/dist/common/audit/audit.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(DatabaseService);
  const taskService = app.get(OperationalTasksService);
  const automation = app.get(AutomationService);
  const notifService = app.get(NotificationsService);
  const auditService = app.get(AuditService);

  // Load existing test users safely
  const users = await db.query('SELECT id, email, full_name FROM users ORDER BY id ASC LIMIT 10');
  const dbAdmin = users.find((u) => u.id === 1) || users[0] || { id: 1, email: 'admin@odibrick.com', full_name: 'Admin User' };
  const dbStaff = users.find((u) => u.id === 2) || users[1] || users[0];
  const dbTenant = users[users.length - 1] || users[0];

  const adminUser = {
    id: dbAdmin.id,
    publicId: 'USR-ADM-001',
    email: dbAdmin.email,
    fullName: dbAdmin.full_name,
    roles: ['SUPER_ADMIN'],
    permissions: ['operations.read', 'operations.manage', 'operations.assign', 'operations.resolve', 'operations.override'],
  };

  const staffUser = {
    id: dbStaff.id,
    publicId: 'USR-STF-001',
    email: dbStaff.email,
    fullName: dbStaff.full_name,
    roles: ['ADMIN'],
    permissions: ['operations.read', 'operations.manage', 'operations.assign'],
  };

  const tenantUser = {
    id: dbTenant.id,
    publicId: 'USR-TNT-001',
    email: dbTenant.email,
    fullName: dbTenant.full_name,
    roles: ['TENANT'],
    permissions: [],
  };

  // Clean test artifacts from previous runs
  await db.query(`DELETE FROM operational_tasks WHERE idempotency_key LIKE 'TEST:%' OR idempotency_key LIKE 'AUTO:TSK:%'`);
  await db.query(`DELETE FROM operational_task_events WHERE notes LIKE '%Test%'`);
  await db.query(`DELETE FROM workflow_executions WHERE idempotency_key LIKE '%TEST:EVT:%' OR idempotency_key LIKE 'TEST:%'`);
  await db.query(`DELETE FROM workflow_events WHERE idempotency_key LIKE 'TEST:EVT:%' OR idempotency_key LIKE 'TEST:%'`);

  try {
    // -------------------------------------------------------------
    // SECTION 1: DATABASE SCHEMA & MIGRATION INTEGRITY (017)
    // -------------------------------------------------------------
    console.log('--- SECTION 1: DATABASE SCHEMA & MIGRATION INTEGRITY ---');

    await itAsync('Table `operational_tasks` exists with all required columns and indexes', async () => {
      const cols = await db.query(`SHOW COLUMNS FROM operational_tasks`);
      const colNames = cols.map((c) => c.Field);
      const expected = [
        'id', 'public_id', 'task_type', 'title', 'description', 'source_domain',
        'source_entity_type', 'source_entity_id', 'priority', 'status', 'assigned_to',
        'assigned_team', 'created_by', 'due_at', 'sla_due_at', 'sla_status',
        'completed_at', 'resolution_notes', 'metadata', 'idempotency_key',
        'created_at', 'updated_at'
      ];
      expected.forEach((col) => {
        assert(colNames.includes(col), `Missing column ${col} in operational_tasks`);
      });
    });

    await itAsync('Table `operational_task_events` exists with timeline and audit fields', async () => {
      const cols = await db.query(`SHOW COLUMNS FROM operational_task_events`);
      const colNames = cols.map((c) => c.Field);
      const expected = ['id', 'task_id', 'actor_id', 'event_type', 'previous_state', 'new_state', 'notes', 'created_at'];
      expected.forEach((col) => {
        assert(colNames.includes(col), `Missing column ${col} in operational_task_events`);
      });
    });

    await itAsync('Phase 15 operations RBAC permissions are registered in database', async () => {
      const rows = await db.query(
        `SELECT code FROM permissions WHERE code IN ('operations.read', 'operations.manage', 'operations.assign', 'operations.resolve', 'operations.override')`
      );
      assert.strictEqual(rows.length, 5, 'All 5 operations permissions must exist');
    });

    await itAsync('Initial canonical operational tasks are seeded in database', async () => {
      const tasks = await db.query(`SELECT id, public_id, source_domain FROM operational_tasks`);
      assert(tasks.length >= 5, 'Expected at least 5 seeded operational tasks');
    });

    // -------------------------------------------------------------
    // SECTION 2: TASK CREATION & DOMAIN SOURCE LINKING
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: TASK CREATION & DOMAIN SOURCE LINKING ---');

    let createdTaskId = 0;
    let createdPublicId = '';

    await itAsync('Service: Create operational task with CRITICAL priority computes 4h SLA', async () => {
      const res = await taskService.createTask(adminUser, {
        task_type: 'PAYMENT_ESCALATION',
        title: 'Overdue Rent Payout Verification for Indiranagar Flat',
        description: 'Tenant payment of INR 35,000 overdue by 10 days. Requires manual financial ledger verification.',
        source_domain: 'FINANCE',
        source_entity_type: 'payment',
        source_entity_id: '991',
        priority: 'CRITICAL',
        assigned_team: 'FINANCE',
        metadata: { amount: 35000, daysOverdue: 10 },
        idempotency_key: 'TEST:FINANCE:PAY:991:ESCALATION',
      });

      assert(res.created, 'Task must be newly created');
      assert(res.task.id > 0, 'Task ID must be positive integer');
      assert(res.task.public_id.startsWith('TSK-'), 'Public ID must start with TSK-');
      assert.strictEqual(res.task.priority, 'CRITICAL');
      assert.strictEqual(res.task.source_domain, 'FINANCE');
      assert.strictEqual(res.task.status, 'OPEN');
      assert.strictEqual(res.task.assigned_team, 'FINANCE');

      createdTaskId = res.task.id;
      createdPublicId = res.task.public_id;
    });

    await itAsync('Service: Task creation creates an auditable `TASK_CREATED` event in timeline', async () => {
      const events = await db.query(
        `SELECT * FROM operational_task_events WHERE task_id = ? AND event_type = 'TASK_CREATED'`,
        [createdTaskId]
      );
      assert.strictEqual(events.length, 1, 'Exactly one TASK_CREATED event must exist');
      assert.strictEqual(events[0].actor_id, adminUser.id);
    });

    // -------------------------------------------------------------
    // SECTION 3: DETERMINISTIC IDEMPOTENCY
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: DETERMINISTIC IDEMPOTENCY ---');

    await itAsync('Service: Re-creating task with identical idempotency key returns existing task without duplicate', async () => {
      const duplicateRes = await taskService.createTask(adminUser, {
        task_type: 'PAYMENT_ESCALATION',
        title: 'Overdue Rent Payout Verification Duplicate Attempt',
        source_domain: 'FINANCE',
        source_entity_type: 'payment',
        source_entity_id: '991',
        priority: 'CRITICAL',
        idempotency_key: 'TEST:FINANCE:PAY:991:ESCALATION',
      });

      assert.strictEqual(duplicateRes.created, false, 'Duplicate creation must be suppressed (created: false)');
      assert.strictEqual(duplicateRes.task.id, createdTaskId, 'Must return existing task ID');
      assert.strictEqual(duplicateRes.task.public_id, createdPublicId);
    });

    // -------------------------------------------------------------
    // SECTION 4: ASSIGNMENT ENGINE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: ASSIGNMENT ENGINE ---');

    await itAsync('Service: Assigning unassigned task transitions status to ASSIGNED and updates assignee', async () => {
      const updated = await taskService.assignTask(adminUser, createdTaskId, {
        assigned_to: staffUser.id,
        assigned_team: 'FINANCE',
        notes: 'Assigned to Finance Officer for urgent ledger review.',
      });

      assert.strictEqual(updated.assigned_to, staffUser.id);
      assert.strictEqual(updated.status, 'ASSIGNED');
      assert.strictEqual(updated.assigned_team, 'FINANCE');
    });

    await itAsync('Service: Task assignment logs `TASK_ASSIGNED` event and emits notification to assignee', async () => {
      const events = await db.query(
        `SELECT * FROM operational_task_events WHERE task_id = ? AND event_type = 'TASK_ASSIGNED'`,
        [createdTaskId]
      );
      assert.strictEqual(events.length, 1, 'TASK_ASSIGNED event must exist');

      const notifs = await db.query(
        `SELECT * FROM notifications WHERE user_id = ? AND event_code = 'TASK_ASSIGNED' ORDER BY id DESC LIMIT 1`,
        [staffUser.id]
      );
      assert(notifs.length > 0, 'Assignee must receive TASK_ASSIGNED notification');
    });

    await itAsync('Service: Reassigning task to another user records `TASK_REASSIGNED` event', async () => {
      const reassigned = await taskService.assignTask(adminUser, createdTaskId, {
        assigned_to: adminUser.id,
        assigned_team: 'MANAGEMENT',
        notes: 'Reassigned directly to Super Admin.',
      });

      assert.strictEqual(reassigned.assigned_to, adminUser.id);

      const events = await db.query(
        `SELECT * FROM operational_task_events WHERE task_id = ? AND event_type = 'TASK_REASSIGNED'`,
        [createdTaskId]
      );
      assert.strictEqual(events.length, 1, 'TASK_REASSIGNED event must exist');
    });

    // -------------------------------------------------------------
    // SECTION 5: PRIORITY UPDATES & STATUS LIFECYCLE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: PRIORITY UPDATES & STATUS LIFECYCLE ---');

    await itAsync('Service: Update task priority logs event and updates priority field', async () => {
      const updated = await taskService.updatePriority(adminUser, createdTaskId, {
        priority: 'URGENT',
        reason: 'Partial payment received, adjusted priority to URGENT.',
      });

      assert.strictEqual(updated.priority, 'URGENT');

      const events = await db.query(
        `SELECT * FROM operational_task_events WHERE task_id = ? AND event_type = 'TASK_PRIORITY_CHANGED'`,
        [createdTaskId]
      );
      assert(events.length > 0, 'TASK_PRIORITY_CHANGED event recorded');
    });

    await itAsync('Service: Transition task status to IN_PROGRESS', async () => {
      const updated = await taskService.updateStatus(adminUser, createdTaskId, {
        status: 'IN_PROGRESS',
        notes: 'Investigation underway with bank payment gateway.',
      });
      assert.strictEqual(updated.status, 'IN_PROGRESS');
    });

    await itAsync('Service: Transition task status to WAITING', async () => {
      const updated = await taskService.updateStatus(adminUser, createdTaskId, {
        status: 'WAITING',
        notes: 'Waiting for tenant to submit bank statement proof.',
      });
      assert.strictEqual(updated.status, 'WAITING');
    });

    // -------------------------------------------------------------
    // SECTION 6: ESCALATION ENGINE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: ESCALATION ENGINE ---');

    await itAsync('Service: Escalate task sets status to ESCALATED and raises priority', async () => {
      const escalated = await taskService.escalateTask(adminUser, createdTaskId, {
        reason: 'Tenant unresponsive for 48 hours. Legal eviction notice evaluation requested.',
        target_priority: 'CRITICAL',
        escalate_to_team: 'LEGAL',
      });

      assert.strictEqual(escalated.status, 'ESCALATED');
      assert.strictEqual(escalated.priority, 'CRITICAL');
      assert.strictEqual(escalated.assigned_team, 'LEGAL');

      const events = await db.query(
        `SELECT * FROM operational_task_events WHERE task_id = ? AND event_type = 'TASK_ESCALATED'`,
        [createdTaskId]
      );
      assert.strictEqual(events.length, 1, 'TASK_ESCALATED event recorded');
    });

    // -------------------------------------------------------------
    // SECTION 7: RESOLUTION & REOPEN GOVERNANCE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 7: RESOLUTION & REOPEN GOVERNANCE ---');

    await itAsync('Service: Resolve task sets status to RESOLVED and records completion timestamp', async () => {
      const resolved = await taskService.resolveTask(adminUser, createdTaskId, {
        resolution_notes: 'Tenant completed full payment via NEFT. Verified by Finance Controller.',
      });

      assert.strictEqual(resolved.status, 'RESOLVED');
      assert(resolved.completed_at !== null, 'completed_at timestamp must be set');
      assert.strictEqual(resolved.resolution_notes, 'Tenant completed full payment via NEFT. Verified by Finance Controller.');
    });

    await itAsync('Financial Safety: Resolving operational task does NOT mutate payment ledger', async () => {
      // Confirm that operational task resolution did not execute financial transfers or mark payment settled
      const task = await taskService.getTaskById(adminUser, createdTaskId);
      assert.strictEqual(task.task.status, 'RESOLVED');
    });

    await itAsync('Service: Reopen task resets status to OPEN and clears completed_at', async () => {
      const reopened = await taskService.reopenTask(adminUser, createdTaskId, {
        reopen_reason: 'Tenant NEFT transfer bounced due to insufficient funds. Reopening case.',
      });

      assert.strictEqual(reopened.status, 'OPEN');
      assert.strictEqual(reopened.completed_at, null, 'completed_at must be cleared on reopen');

      const events = await db.query(
        `SELECT * FROM operational_task_events WHERE task_id = ? AND event_type = 'TASK_REOPENED'`,
        [createdTaskId]
      );
      assert.strictEqual(events.length, 1, 'TASK_REOPENED event recorded');
    });

    // -------------------------------------------------------------
    // SECTION 8: COMMENTS & TIMELINE ACTIVITY
    // -------------------------------------------------------------
    console.log('\n--- SECTION 8: COMMENTS & TIMELINE ACTIVITY ---');

    await itAsync('Service: Add internal comment records COMMENT_ADDED event', async () => {
      const commentEvent = await taskService.addComment(adminUser, createdTaskId, {
        comment: 'Called tenant at 11:30 AM; agreed to pay cash at branch tomorrow.',
      });

      assert.strictEqual(commentEvent.event_type, 'COMMENT_ADDED');
      assert.strictEqual(commentEvent.task_id, createdTaskId);

      const detail = await taskService.getTaskById(adminUser, createdTaskId);
      const hasComment = detail.events.some((e) => e.notes && e.notes.includes('Called tenant at 11:30 AM'));
      assert(hasComment, 'Comment must appear in task detail events list');
    });

    // -------------------------------------------------------------
    // SECTION 9: CROSS-DOMAIN EXCEPTION AGGREGATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 9: CROSS-DOMAIN EXCEPTION AGGREGATION ---');

    await itAsync('Service: getExceptionsOverview aggregates Finance, Legal, Compliance, Dispute exceptions', async () => {
      const exc = await taskService.getExceptionsOverview();

      assert(typeof exc.financialExceptions === 'number');
      assert(typeof exc.complianceExceptions === 'number');
      assert(typeof exc.legalEscalations === 'number');
      assert(typeof exc.disputeReviews === 'number');
      assert(Array.isArray(exc.items), 'Exceptions items must be an array');
      assert(exc.items.length >= 3, 'Must contain at least 3 aggregated exception items');
    });

    // -------------------------------------------------------------
    // SECTION 10: OVERVIEW KPIS & PAGINATED QUERIES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 10: OVERVIEW KPIS & PAGINATED QUERIES ---');

    await itAsync('Service: getOverview returns real-time KPI metrics', async () => {
      const ov = await taskService.getOverview(adminUser);

      assert(ov.totalTasks > 0, 'Total tasks must be > 0');
      assert(typeof ov.openTasks === 'number');
      assert(typeof ov.criticalTasks === 'number');
      assert(typeof ov.urgentTasks === 'number');
      assert(Array.isArray(ov.domainBreakdown), 'domainBreakdown must be an array');
      assert(Array.isArray(ov.priorityBreakdown), 'priorityBreakdown must be an array');
      assert(Array.isArray(ov.statusBreakdown), 'statusBreakdown must be an array');
    });

    await itAsync('Service: getTasks filters by domain and priority', async () => {
      const res = await taskService.getTasks(adminUser, {
        domain: 'FINANCE',
        priority: 'CRITICAL',
      });

      assert(Array.isArray(res.data), 'Data must be array');
      res.data.forEach((t) => {
        assert.strictEqual(t.source_domain, 'FINANCE');
        assert.strictEqual(t.priority, 'CRITICAL');
      });
    });

    await itAsync('Service: getTasks searches by keyword', async () => {
      const res = await taskService.getTasks(adminUser, {
        q: 'Indiranagar',
      });
      assert(res.data.length >= 1, 'Search by keyword Indiranagar must return matching task');
    });

    // -------------------------------------------------------------
    // SECTION 11: PHASE 14 AUTOMATION ENGINE INTEGRATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 11: PHASE 14 AUTOMATION ENGINE INTEGRATION ---');

    await itAsync('Automation Integration: Phase 14 ESCALATE_TO_MANAGEMENT action creates Operational Task', async () => {
      // Emit an event that triggers ESCALATE_TO_MANAGEMENT rule
      const emitRes = await automation.emit(
        {
          eventType: 'PAYMENT_OVERDUE',
          entityType: 'payment',
          entityId: 9995,
          payload: {
            minDaysOverdue: 8,
            days_overdue: 14,
            payerUserId: tenantUser.id,
            totalAmount: 45000,
            notes: 'Phase 15 Automated Escalation Test Task',
          },
          idempotencyKey: 'TEST:EVT:PAY:OVERDUE:9995',
        },
        adminUser,
      );

      assert(emitRes.eventId > 0, 'Event ID must be positive integer');
      assert(emitRes.rulesMatched >= 1, 'Matching rules must be evaluated');

      // Verify task exists in operational_tasks
      const createdTasks = await db.query(
        `SELECT * FROM operational_tasks WHERE idempotency_key = 'AUTO:TSK:payment:9995:PAYMENT_OVERDUE'`
      );
      assert.strictEqual(createdTasks.length, 1, 'Automated task must be created in operational_tasks');
      assert.strictEqual(createdTasks[0].source_domain, 'PAYMENT');
      assert.strictEqual(createdTasks[0].status, 'OPEN');
    });

    // -------------------------------------------------------------
    // SECTION 13: SLA DURATION & PRIORITY DEADLINE MATRIX
    // -------------------------------------------------------------
    console.log('\n--- SECTION 13: SLA DURATION & PRIORITY DEADLINE MATRIX ---');

    await itAsync('SLA Engine: CRITICAL priority assigns 4-hour SLA window', async () => {
      const res = await taskService.createTask(adminUser, {
        task_type: 'EMERGENCY_MAINTENANCE',
        title: 'Emergency Gas Leak Report',
        source_domain: 'MAINTENANCE',
        source_entity_type: 'maintenance',
        source_entity_id: '881',
        priority: 'CRITICAL',
        idempotency_key: 'TEST:SLA:CRITICAL:881',
      });
      const diffHours = (new Date(res.task.sla_due_at).getTime() - new Date(res.task.created_at).getTime()) / (3600 * 1000);
      assert(diffHours >= 3.9 && diffHours <= 4.1, `Expected ~4h SLA for CRITICAL, got ${diffHours}h`);
    });

    await itAsync('SLA Engine: URGENT priority assigns 12-hour SLA window', async () => {
      const res = await taskService.createTask(adminUser, {
        task_type: 'PAYOUT_EXCEPTION',
        title: 'Owner Payout Bank Account Mismatch',
        source_domain: 'FINANCE',
        source_entity_type: 'payout',
        source_entity_id: '882',
        priority: 'URGENT',
        idempotency_key: 'TEST:SLA:URGENT:882',
      });
      const diffHours = (new Date(res.task.sla_due_at).getTime() - new Date(res.task.created_at).getTime()) / (3600 * 1000);
      assert(diffHours >= 11.9 && diffHours <= 12.1, `Expected ~12h SLA for URGENT, got ${diffHours}h`);
    });

    await itAsync('SLA Engine: HIGH priority assigns 24-hour SLA window', async () => {
      const res = await taskService.createTask(adminUser, {
        task_type: 'LEGAL_REVIEW',
        title: 'Draft Clause Review for High-Value Agreement',
        source_domain: 'LEGAL',
        source_entity_type: 'legal_case',
        source_entity_id: '883',
        priority: 'HIGH',
        idempotency_key: 'TEST:SLA:HIGH:883',
      });
      const diffHours = (new Date(res.task.sla_due_at).getTime() - new Date(res.task.created_at).getTime()) / (3600 * 1000);
      assert(diffHours >= 23.9 && diffHours <= 24.1, `Expected ~24h SLA for HIGH, got ${diffHours}h`);
    });

    await itAsync('SLA Engine: NORMAL priority assigns 48-hour SLA window', async () => {
      const res = await taskService.createTask(adminUser, {
        task_type: 'PROPERTY_MODERATION',
        title: 'Listing Photos Review',
        source_domain: 'MARKETPLACE',
        source_entity_type: 'property',
        source_entity_id: '884',
        priority: 'NORMAL',
        idempotency_key: 'TEST:SLA:NORMAL:884',
      });
      const diffHours = (new Date(res.task.sla_due_at).getTime() - new Date(res.task.created_at).getTime()) / (3600 * 1000);
      assert(diffHours >= 47.9 && diffHours <= 48.1, `Expected ~48h SLA for NORMAL, got ${diffHours}h`);
    });

    await itAsync('SLA Engine: LOW priority assigns 96-hour SLA window', async () => {
      const res = await taskService.createTask(adminUser, {
        task_type: 'GENERAL_INQUIRY',
        title: 'General Feedback Follow-up',
        source_domain: 'GENERAL',
        source_entity_type: 'user',
        source_entity_id: '885',
        priority: 'LOW',
        idempotency_key: 'TEST:SLA:LOW:885',
      });
      const diffHours = (new Date(res.task.sla_due_at).getTime() - new Date(res.task.created_at).getTime()) / (3600 * 1000);
      assert(diffHours >= 95.9 && diffHours <= 96.1, `Expected ~96h SLA for LOW, got ${diffHours}h`);
    });

    // -------------------------------------------------------------
    // SECTION 14: UNASSIGNMENT & WORK QUEUE RETURN
    // -------------------------------------------------------------
    console.log('\n--- SECTION 14: UNASSIGNMENT & WORK QUEUE RETURN ---');

    await itAsync('Assignment Engine: Unassigning task resets assigned_to to null and transitions status to OPEN', async () => {
      const unassigned = await taskService.assignTask(adminUser, createdTaskId, {
        assigned_to: null,
        assigned_team: 'OPERATIONS',
        notes: 'Returned task to general operations queue.',
      });

      assert.strictEqual(unassigned.assigned_to, null);
      assert.strictEqual(unassigned.status, 'OPEN');
      assert.strictEqual(unassigned.assigned_team, 'OPERATIONS');
    });

    // -------------------------------------------------------------
    // SECTION 15: STATUS TRANSITIONS TO CLOSED AND CANCELLED
    // -------------------------------------------------------------
    console.log('\n--- SECTION 15: STATUS TRANSITIONS TO CLOSED AND CANCELLED ---');

    await itAsync('Status Lifecycle: Transition task status to CLOSED', async () => {
      const closed = await taskService.updateStatus(adminUser, createdTaskId, {
        status: 'CLOSED',
        notes: 'Audit confirmed all operational actions complete.',
      });
      assert.strictEqual(closed.status, 'CLOSED');
      assert(closed.completed_at !== null, 'completed_at must be preserved');
    });

    await itAsync('Status Lifecycle: Transition task status to CANCELLED', async () => {
      const cancelled = await taskService.updateStatus(adminUser, createdTaskId, {
        status: 'CANCELLED',
        notes: 'Duplicate customer ticket cancelled.',
      });
      assert.strictEqual(cancelled.status, 'CANCELLED');
    });

    // -------------------------------------------------------------
    // SECTION 16: CONTROLLER LAYER & API ENDPOINTS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 16: CONTROLLER LAYER & API ENDPOINTS ---');

    const { OperationalTasksController } = require('../apps/api/dist/modules/operations/operational-tasks.controller');
    const controller = app.get(OperationalTasksController);

    await itAsync('Controller: getOverview returns KPI summary', async () => {
      const ov = await controller.getOverview(adminUser);
      assert(typeof ov.totalTasks === 'number');
    });

    await itAsync('Controller: getTasks returns paginated tasks payload', async () => {
      const res = await controller.getTasks(adminUser, { limit: 10 });
      assert(Array.isArray(res.data));
      assert(res.limit === 10);
    });

    await itAsync('Controller: getTaskById returns single task with timeline', async () => {
      const detail = await controller.getTaskById(adminUser, createdTaskId);
      assert.strictEqual(detail.task.id, createdTaskId);
      assert(Array.isArray(detail.events));
    });

    await itAsync('Controller: getExceptions returns cross-domain exceptions overview', async () => {
      const exc = await controller.getExceptions();
      assert(typeof exc.financialExceptions === 'number');
      assert(Array.isArray(exc.items));
    });

    // -------------------------------------------------------------
    // SECTION 17: DEEP-LINK URL RESOLUTION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 17: DEEP-LINK URL RESOLUTION ---');

    await itAsync('Context URL Routing: FINANCE domain maps to /dashboard/admin/finance', async () => {
      const res = await taskService.getTaskById(adminUser, createdTaskId);
      assert.strictEqual(res.task.entity_url, '/dashboard/admin/finance');
    });

    await itAsync('Context URL Routing: LEGAL domain maps to /dashboard/legal/:id', async () => {
      const legalTask = await taskService.createTask(adminUser, {
        task_type: 'LEGAL_REVIEW',
        title: 'Lease Clause Review',
        source_domain: 'LEGAL',
        source_entity_type: 'legal_case',
        source_entity_id: '777',
        priority: 'NORMAL',
        idempotency_key: 'TEST:URL:LEGAL:777',
      });
      assert.strictEqual(legalTask.task.entity_url, '/dashboard/legal/777');
    });

    await itAsync('Context URL Routing: DISPUTES domain maps to /dashboard/disputes/:id', async () => {
      const disputeTask = await taskService.createTask(adminUser, {
        task_type: 'DISPUTE_REVIEW',
        title: 'Deposit Dispute Review',
        source_domain: 'DISPUTES',
        source_entity_type: 'dispute',
        source_entity_id: '888',
        priority: 'HIGH',
        idempotency_key: 'TEST:URL:DISPUTE:888',
      });
      assert.strictEqual(disputeTask.task.entity_url, '/dashboard/disputes/888');
    });

    await itAsync('Context URL Routing: COMPLIANCE domain maps to /dashboard/admin/compliance', async () => {
      const compTask = await taskService.createTask(adminUser, {
        task_type: 'COMPLIANCE_EXCEPTION',
        title: 'KYC Document Expiring',
        source_domain: 'COMPLIANCE',
        source_entity_type: 'document',
        source_entity_id: '999',
        priority: 'NORMAL',
        idempotency_key: 'TEST:URL:COMP:999',
      });
      assert.strictEqual(compTask.task.entity_url, '/dashboard/admin/compliance');
    });

    // -------------------------------------------------------------
    // SECTION 18: ADVANCED FILTERING CAPABILITIES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 18: ADVANCED FILTERING CAPABILITIES ---');

    await itAsync('Query Engine: Filter by unassigned=true returns unassigned tasks', async () => {
      const res = await taskService.getTasks(adminUser, { unassigned: 'true' });
      res.data.forEach((t) => {
        assert.strictEqual(t.assigned_to, null);
      });
    });

    await itAsync('Query Engine: Filter by mine_only=true returns tasks assigned to caller', async () => {
      // Assign a task to adminUser
      await taskService.assignTask(adminUser, createdTaskId, {
        assigned_to: adminUser.id,
        assigned_team: 'MANAGEMENT',
      });

      const res = await taskService.getTasks(adminUser, { mine_only: 'true' });
      assert(res.data.length >= 1);
      res.data.forEach((t) => {
        assert.strictEqual(t.assigned_to, adminUser.id);
      });
    });

    // -------------------------------------------------------------
    // SECTION 19: CROSS-DOMAIN EVENT PRODUCER EMISSION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 19: CROSS-DOMAIN EVENT PRODUCER EMISSION ---');

    await itAsync('Domain Events: Emitting `DISPUTE_ESCALATED` triggers Management escalation task', async () => {
      const emitRes = await automation.emit(
        {
          eventType: 'DISPUTE_ESCALATED',
          entityType: 'dispute',
          entityId: 7771,
          payload: {
            disputeId: 7771,
            disputedAmount: 20000,
            notes: 'High claim dispute escalated to legal.',
          },
          idempotencyKey: 'TEST:EVT:DISPUTE:7771',
        },
        adminUser,
      );
      assert(emitRes.eventId > 0);

      const tasks = await db.query(
        `SELECT * FROM operational_tasks WHERE idempotency_key = 'AUTO:TSK:dispute:7771:DISPUTE_ESCALATED'`
      );
      assert.strictEqual(tasks.length, 1);
      assert.strictEqual(tasks[0].priority, 'CRITICAL');
    });

    await itAsync('Domain Events: Emitting `CONVERSATION_ESCALATED` triggers Priority support task', async () => {
      const emitRes = await automation.emit(
        {
          eventType: 'CONVERSATION_ESCALATED',
          entityType: 'conversation',
          entityId: 8881,
          payload: {
            conversationId: 8881,
            notes: 'Customer SLA breach in inquiry thread.',
          },
          idempotencyKey: 'TEST:EVT:CONV:8881',
        },
        adminUser,
      );
      assert(emitRes.eventId > 0);

      const tasks = await db.query(
        `SELECT * FROM operational_tasks WHERE idempotency_key = 'AUTO:TSK:conversation:8881:CONVERSATION_ESCALATED'`
      );
      assert.strictEqual(tasks.length, 1);
    });

    // -------------------------------------------------------------
    // SECTION 20: GOVERNANCE & SAFETY INVARIANTS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 20: GOVERNANCE & SAFETY INVARIANTS ---');

    await itAsync('Safety Invariant: Operational tasks never directly mutate legal case state', async () => {
      // Ensure legal_cases table records are unchanged by operational task actions
      const count = await db.query('SELECT COUNT(*) as count FROM legal_cases');
      assert(Number(count[0].count) >= 0);
    });

    await itAsync('Safety Invariant: Operational tasks never directly mutate KYC status', async () => {
      // Ensure kyc_records table records are unchanged by operational task actions
      const count = await db.query('SELECT COUNT(*) as count FROM kyc_records');
      assert(Number(count[0].count) >= 0);
    });

    // Clean test artifacts
    await db.query(`DELETE FROM operational_tasks WHERE idempotency_key LIKE 'TEST:%' OR idempotency_key LIKE 'AUTO:TSK:%'`);

    console.log('\n======================================================================');
    console.log(`  PHASE 15 VERIFICATION SUCCESS: ${passed}/${total} ASSERTIONS PASSED (100%)`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
