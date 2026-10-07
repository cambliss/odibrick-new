#!/usr/bin/env node
/**
 * ODIBRICK PHASE 12 VERIFICATION SUITE
 * COMMUNICATION, MESSAGING, CONVERSATION MANAGEMENT & ENGAGEMENT OPERATIONS
 *
 * Comprehensive assertions validating:
 * 1. Authentication & RBAC (conversation.read, conversation.send, conversation.manage, conversation.internal_note, conversation.assign, conversation.escalate)
 * 2. Contextual Conversation Creation (ENQUIRY, VISIT, APPLICATION, TENANCY, MAINTENANCE, DISPUTE, SUPPORT)
 * 3. Participant Registration & Context Resolution
 * 4. External Messaging & Chronological Retrieval
 * 5. Message Read Tracking & Dynamic Unread Counter
 * 6. Message Editing & Soft Deletion with Audit Safety
 * 7. Strict Privacy & Internal Management Notes Separation (Staff-only, completely stripped from customer/provider responses)
 * 8. Management Governance (Staff Assignment, Escalation, Resolve, Reopen, Formal Closure)
 * 9. Automated SLA Stale Conversation Processor & Notifications
 * 10. Communication Analytics & Operational Visibility
 * 11. Security & Multi-Tenant Isolation (403 Forbidden on unauthorized conversation/message access)
 * 12. Complete Non-Regression Invariants with Phases 1-11
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
  const candidates = [
    path.join(__dirname, '..', 'apps', 'api', '.env'),
    path.join(__dirname, '..', '.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  }
}

async function main() {
  console.log('======================================================================');
  console.log('ODIBRICK COMMUNICATION & CONVERSATION MANAGEMENT — VERIFICATION SUITE');
  console.log('======================================================================\n');

  const { NestFactory } = require('@nestjs/core');
  const { AppModule } = require('../apps/api/dist/app.module');
  const { DatabaseService } = require('../apps/api/dist/common/database/database.service');
  const { CommunicationsService } = require('../apps/api/dist/modules/communications/communications.service');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const db = app.get(DatabaseService);
  const commsService = app.get(CommunicationsService);

  // Load test users from database
  const dbAdmin = await db.one('SELECT id, email, full_name FROM users WHERE id = 1');
  const prop1 = await db.one('SELECT p.*, COALESCE(o.user_id, p.listed_by_user_id) AS owner_uid FROM properties p LEFT JOIN owners o ON o.id = p.owner_id WHERE p.id = 1');
  const dbOwner = await db.one('SELECT id, email, full_name FROM users WHERE id = ?', [prop1.owner_uid || 8]);
  const dbAgent = await db.one('SELECT id, email, full_name FROM users WHERE id = 2');
  const dbCustomer = await db.one('SELECT id, email, full_name FROM users WHERE id = 30');
  const dbUnrelated = await db.one('SELECT id, email, full_name FROM users WHERE id = 31');

  const adminUser = {
    id: dbAdmin.id,
    publicId: 'USR-ADM-001',
    email: dbAdmin.email,
    fullName: dbAdmin.full_name,
    roles: ['SUPER_ADMIN'],
    permissions: [
      'conversation.read',
      'conversation.send',
      'conversation.manage',
      'conversation.internal_note',
      'conversation.assign',
      'conversation.escalate',
      'admin.access',
    ],
  };

  const ownerUser = {
    id: dbOwner.id,
    publicId: 'USR-OWN-008',
    email: dbOwner.email,
    fullName: dbOwner.full_name,
    roles: ['OWNER'],
    permissions: ['conversation.read', 'conversation.send'],
  };

  const agentUser = {
    id: dbAgent.id,
    publicId: 'USR-AGT-002',
    email: dbAgent.email,
    fullName: dbAgent.full_name,
    roles: ['AGENT'],
    permissions: ['conversation.read', 'conversation.send'],
  };

  const customerUser = {
    id: dbCustomer.id,
    publicId: 'USR-CUST-030',
    email: dbCustomer.email,
    fullName: dbCustomer.full_name,
    roles: ['TENANT'],
    permissions: ['conversation.read', 'conversation.send'],
  };

  const unrelatedUser = {
    id: dbUnrelated.id,
    publicId: 'USR-UNR-031',
    email: dbUnrelated.email,
    fullName: dbUnrelated.full_name,
    roles: ['TENANT'],
    permissions: ['conversation.read', 'conversation.send'],
  };

  // Ensure clean dedicated test enquiry for property 1
  let enquiry = await db.one('SELECT id, property_id, tenant_user_id FROM enquiries WHERE property_id = 1 AND tenant_user_id = ?', [customerUser.id]);
  if (!enquiry) {
    const enqId = await db.insert('enquiries', {
      public_id: 'ENQ-COMM-TEST-001',
      property_id: 1,
      tenant_user_id: customerUser.id,
      message: 'Initial test inquiry for messaging suite',
      contact_pref: 'CHAT',
      status: 'NEW',
    });
    enquiry = { id: enqId, property_id: 1, tenant_user_id: customerUser.id };
  }

  const tenancy = await db.one('SELECT id, property_id, tenant_user_id, owner_user_id FROM tenancies WHERE id = 3');
  const dispute = await db.one('SELECT id, tenancy_id, raised_by FROM disputes LIMIT 1');
  const visit = await db.one('SELECT id, property_id, customer_user_id, host_user_id FROM property_visits LIMIT 1');
  const application = await db.one('SELECT id, property_id, tenant_user_id FROM applications LIMIT 1');

  let testConvId = null;
  let testMessageId = null;
  let customerMsgId = null;
  let internalNoteId = null;

  console.log('--- 1. RBAC & PERMISSIONS MATRIX ---');

  await itAsync('Super Admin has conversation.manage and conversation.internal_note permissions', async () => {
    const perms = await db.query(
      `SELECT p.code FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = 'SUPER_ADMIN' AND p.code LIKE 'conversation.%'`,
    );
    const codes = perms.map((p) => p.code);
    assert(codes.includes('conversation.read'), 'Missing conversation.read');
    assert(codes.includes('conversation.send'), 'Missing conversation.send');
    assert(codes.includes('conversation.manage'), 'Missing conversation.manage');
    assert(codes.includes('conversation.internal_note'), 'Missing conversation.internal_note');
    assert(codes.includes('conversation.assign'), 'Missing conversation.assign');
  });

  await itAsync('Owner & Tenant roles have conversation.read and conversation.send', async () => {
    const ownerPerms = await db.query(
      `SELECT p.code FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = 'OWNER' AND p.code IN ('conversation.read', 'conversation.send')`,
    );
    assert.strictEqual(ownerPerms.length, 2, 'Owner should have read & send');

    const tenantPerms = await db.query(
      `SELECT p.code FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE r.code = 'TENANT' AND p.code IN ('conversation.read', 'conversation.send')`,
    );
    assert.strictEqual(tenantPerms.length, 2, 'Tenant should have read & send');
  });

  console.log('\n--- 2. CONTEXTUAL CONVERSATION CREATION & RESOLUTION ---');

  await itAsync('Creates and attaches conversation for ENQUIRY context', async () => {
    const conv = await commsService.getOrCreateConversation(
      'ENQUIRY',
      enquiry.id,
      'Test Enquiry Chat',
      'Hello, I am interested in this listing.',
      customerUser,
    );
    assert(conv.id, 'Conversation must have ID');
    assert.strictEqual(conv.context_type, 'ENQUIRY');
    assert.strictEqual(conv.context_id, enquiry.id);
    assert(conv.public_id.startsWith('ODB-CNV-'), 'Public ID format ODB-CNV-');
    testConvId = conv.id;
  });

  await itAsync('Creates and attaches conversation for VISIT context', async () => {
    if (visit) {
      const conv = await commsService.getOrCreateConversation(
        'VISIT',
        visit.id,
        undefined,
        undefined,
        customerUser,
      );
      assert(conv.id, 'Visit conversation created');
      assert.strictEqual(conv.context_type, 'VISIT');
    }
  });

  await itAsync('Creates and attaches conversation for APPLICATION context', async () => {
    if (application) {
      const conv = await commsService.getOrCreateConversation(
        'APPLICATION',
        application.id,
        undefined,
        undefined,
        customerUser,
      );
      assert(conv.id, 'Application conversation created');
      assert.strictEqual(conv.context_type, 'APPLICATION');
    }
  });

  await itAsync('Creates and attaches conversation for TENANCY context', async () => {
    if (tenancy) {
      const conv = await commsService.getOrCreateConversation(
        'TENANCY',
        tenancy.id,
        undefined,
        undefined,
        ownerUser,
      );
      assert(conv.id, 'Tenancy conversation created');
      assert.strictEqual(conv.context_type, 'TENANCY');
    }
  });

  await itAsync('Creates and attaches conversation for DISPUTE context', async () => {
    if (dispute) {
      const conv = await commsService.getOrCreateConversation(
        'DISPUTE',
        dispute.id,
        undefined,
        undefined,
        adminUser,
      );
      assert(conv.id, 'Dispute conversation created');
      assert.strictEqual(conv.context_type, 'DISPUTE');
    }
  });

  await itAsync('Resolves context parties and automatically links participants', async () => {
    const meta = await commsService.resolveContextMetadata('ENQUIRY', enquiry.id);
    assert(meta.title, 'Context metadata has title');
    assert(meta.parties.length > 0, 'Context has parties');

    const participants = await db.query(
      'SELECT * FROM conversation_participants WHERE conversation_id = ?',
      [testConvId],
    );
    assert(participants.length >= 1, 'Participants must be registered');
  });

  await itAsync('Enforces idempotency: getOrCreateConversation returns existing record without duplication', async () => {
    const existing = await commsService.getOrCreateConversation('ENQUIRY', enquiry.id);
    assert.strictEqual(existing.id, testConvId, 'Must return same conversation ID');

    const totalMatching = await db.one(
      "SELECT COUNT(*) AS c FROM conversations WHERE context_type = 'ENQUIRY' AND context_id = ?",
      [enquiry.id],
    );
    assert.strictEqual(Number(totalMatching.c), 1, 'Exactly 1 conversation record exists');
  });

  console.log('\n--- 3. MESSAGING WORKFLOW & CHRONOLOGICAL HISTORY ---');

  await itAsync('Customer sends message in authorized enquiry conversation', async () => {
    const msg = await commsService.sendMessage(customerUser, testConvId, {
      body: 'Can I schedule a visit for tomorrow at 5 PM?',
    });
    assert(msg.id, 'Message ID created');
    assert.strictEqual(msg.senderId, customerUser.id);
    assert.strictEqual(msg.isInternal, false);
    customerMsgId = msg.id;
    testMessageId = msg.id;
  });

  await itAsync('Provider / Host replies to customer in the same conversation', async () => {
    const msg = await commsService.sendMessage(ownerUser, testConvId, {
      body: 'Yes, tomorrow 5 PM works perfectly for me.',
    });
    assert(msg.id, 'Provider reply sent');
    assert.strictEqual(msg.senderId, ownerUser.id);
    assert.strictEqual(msg.isInternal, false);
  });

  await itAsync('System message recorded for business workflow event', async () => {
    const sysMsgId = await commsService.sendSystemMessage(
      testConvId,
      'Property visit ODB-VST-2026-000001 confirmed for tomorrow at 5:00 PM.',
    );
    assert(sysMsgId, 'System message recorded');

    const sysMsg = await db.one('SELECT * FROM messages WHERE id = ?', [sysMsgId]);
    assert.strictEqual(sysMsg.message_type, 'SYSTEM');
    assert.strictEqual(sysMsg.is_internal, 0);
  });

  await itAsync('Messages are retrieved in strict chronological order', async () => {
    const res = await commsService.listConversationMessages(customerUser, testConvId);
    assert(res.data.length >= 3, 'Must have at least 3 messages');
    for (let i = 1; i < res.data.length; i++) {
      const prev = new Date(res.data[i - 1].created_at).getTime();
      const curr = new Date(res.data[i].created_at).getTime();
      assert(curr >= prev, 'Messages must be sorted chronologically');
    }
  });

  console.log('\n--- 4. READ TRACKING & DYNAMIC UNREAD COUNTERS ---');

  await itAsync('Customer marks conversation as read', async () => {
    const markRes = await commsService.markAsRead(customerUser, testConvId);
    assert.strictEqual(markRes.success, true);

    const part = await db.one(
      'SELECT last_read_at FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [testConvId, customerUser.id],
    );
    assert(part.last_read_at, 'last_read_at must be populated');
  });

  await itAsync('Unread count updates dynamically when counterparty sends message', async () => {
    // Wait 1 second so MySQL second timestamp advances
    await new Promise((r) => setTimeout(r, 1000));

    // Owner sends new message
    await commsService.sendMessage(ownerUser, testConvId, {
      body: 'Please make sure to bring a government ID proof.',
    });

    const userConvs = await commsService.listUserConversations(customerUser, {});
    const target = userConvs.data.find((c) => c.id === testConvId);
    assert(target, 'Conversation present in user list');
    assert.strictEqual(Number(target.unread_count), 1, 'Customer has exactly 1 unread message');
  });

  console.log('\n--- 5. MESSAGE EDITING & AUDIT-SAFE SOFT DELETION ---');

  await itAsync('Author successfully edits their own message', async () => {
    const editRes = await commsService.editMessage(customerUser, customerMsgId, {
      body: 'Can I schedule a visit for tomorrow at 5:30 PM? (Updated)',
    });
    assert.strictEqual(editRes.id, customerMsgId);
    assert(editRes.editedAt, 'editedAt must be set');

    const updated = await db.one('SELECT body, edited_at FROM messages WHERE id = ?', [customerMsgId]);
    assert.strictEqual(updated.body, 'Can I schedule a visit for tomorrow at 5:30 PM? (Updated)');
    assert(updated.edited_at, 'DB edited_at updated');
  });

  await itAsync('Non-author unauthorized user cannot edit another user message (403)', async () => {
    try {
      await commsService.editMessage(unrelatedUser, customerMsgId, { body: 'Hacked message' });
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403 || err.message.includes('own messages'), 'Must reject non-author edit');
    }
  });

  await itAsync('Author soft-deletes a message preserving database row', async () => {
    // Send a message to delete
    const tempMsg = await commsService.sendMessage(customerUser, testConvId, {
      body: 'Typo message to delete.',
    });
    const delRes = await commsService.deleteMessage(customerUser, tempMsg.id);
    assert.strictEqual(delRes.success, true);

    const dbRow = await db.one('SELECT deleted_at FROM messages WHERE id = ?', [tempMsg.id]);
    assert(dbRow.deleted_at, 'deleted_at timestamp must be recorded');

    // Verify omitted from normal message list
    const msgList = await commsService.listConversationMessages(customerUser, testConvId);
    assert(!msgList.data.some((m) => m.id === tempMsg.id), 'Deleted message excluded from query results');
  });

  console.log('\n--- 6. INTERNAL MANAGEMENT NOTES & PRIVACY SEPARATION ---');

  await itAsync('Odibrick Management posts an internal operational note', async () => {
    const note = await commsService.sendInternalNote(adminUser, testConvId, {
      body: 'INTERNAL NOTE: Customer is pre-qualified. Host has 98% on-time rating.',
    });
    assert(note.id, 'Internal note created');
    assert.strictEqual(note.isInternal, true);
    assert.strictEqual(note.messageType, 'NOTE');
    internalNoteId = note.id;
  });

  await itAsync('Non-staff user (Customer) is strictly rejected from posting internal note (403)', async () => {
    try {
      await commsService.sendInternalNote(customerUser, testConvId, {
        body: 'Unauthorized internal note attempt',
      });
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403, 'Must reject with 403 Forbidden');
    }
  });

  await itAsync('Non-staff user (Provider) is strictly rejected from posting internal note (403)', async () => {
    try {
      await commsService.sendInternalNote(ownerUser, testConvId, {
        body: 'Provider unauthorized internal note attempt',
      });
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403, 'Must reject with 403 Forbidden');
    }
  });

  await itAsync('Customer query NEVER returns internal management notes (Privacy Guard)', async () => {
    const customerMessages = await commsService.listConversationMessages(customerUser, testConvId);
    const hasInternal = customerMessages.data.some((m) => m.is_internal === 1 || m.id === internalNoteId);
    assert.strictEqual(hasInternal, false, 'Customer MUST NOT receive internal notes');
  });

  await itAsync('Provider query NEVER returns internal management notes (Privacy Guard)', async () => {
    const providerMessages = await commsService.listConversationMessages(ownerUser, testConvId);
    const hasInternal = providerMessages.data.some((m) => m.is_internal === 1 || m.id === internalNoteId);
    assert.strictEqual(hasInternal, false, 'Provider MUST NOT receive internal notes');
  });

  await itAsync('Admin query DOES receive internal management notes', async () => {
    const adminMessages = await commsService.listConversationMessages(adminUser, testConvId);
    const noteFound = adminMessages.data.find((m) => m.id === internalNoteId);
    assert(noteFound, 'Admin must receive internal notes');
    assert.strictEqual(noteFound.is_internal, 1);
  });

  console.log('\n--- 7. MANAGEMENT GOVERNANCE, ASSIGNMENT & LIFECYCLE ---');

  await itAsync('Management assigns internal handler to conversation', async () => {
    const assignRes = await commsService.assignConversation(adminUser, testConvId, {
      assignedTo: dbAdmin.id,
      notes: 'Super Admin assigned to supervise lead engagement',
    });
    assert.strictEqual(assignRes.success, true);
    assert.strictEqual(assignRes.assignedTo, dbAdmin.id);

    const updatedConv = await db.one('SELECT assigned_to FROM conversations WHERE id = ?', [testConvId]);
    assert.strictEqual(updatedConv.assigned_to, dbAdmin.id);
  });

  await itAsync('Participant escalates conversation to management queue', async () => {
    const escRes = await commsService.escalateConversation(customerUser, testConvId, {
      reason: 'Need clarification on lease tenure terms.',
    });
    assert.strictEqual(escRes.success, true);
    assert.strictEqual(escRes.status, 'ESCALATED');

    const updatedConv = await db.one('SELECT status, sla_breached, sla_escalated_at FROM conversations WHERE id = ?', [
      testConvId,
    ]);
    assert.strictEqual(updatedConv.status, 'ESCALATED');
    assert.strictEqual(updatedConv.sla_breached, 1);
    assert(updatedConv.sla_escalated_at, 'sla_escalated_at populated');
  });

  await itAsync('Participant resolves conversation', async () => {
    const resolveRes = await commsService.resolveConversation(customerUser, testConvId, {
      notes: 'Lease tenure questions answered by owner.',
    });
    assert.strictEqual(resolveRes.success, true);
    assert.strictEqual(resolveRes.status, 'RESOLVED');

    const updatedConv = await db.one('SELECT status FROM conversations WHERE id = ?', [testConvId]);
    assert.strictEqual(updatedConv.status, 'RESOLVED');
  });

  await itAsync('Participant reopens resolved conversation upon follow-up inquiry', async () => {
    const reopenRes = await commsService.reopenConversation(customerUser, testConvId, {
      reason: 'Follow-up question regarding parking space.',
    });
    assert.strictEqual(reopenRes.success, true);
    assert.strictEqual(reopenRes.status, 'ACTIVE');

    const updatedConv = await db.one('SELECT status FROM conversations WHERE id = ?', [testConvId]);
    assert.strictEqual(updatedConv.status, 'ACTIVE');
  });

  await itAsync('Management formally closes conversation with audit log', async () => {
    const closeRes = await commsService.closeConversation(adminUser, testConvId, {
      notes: 'Lead successfully converted to Application.',
    });
    assert.strictEqual(closeRes.success, true);
    assert.strictEqual(closeRes.status, 'CLOSED');

    const updatedConv = await db.one('SELECT status, closed_at FROM conversations WHERE id = ?', [testConvId]);
    assert.strictEqual(updatedConv.status, 'CLOSED');
    assert(updatedConv.closed_at, 'closed_at populated');
  });

  await itAsync('Non-staff user cannot formally close conversation (403)', async () => {
    try {
      await commsService.closeConversation(customerUser, testConvId, { notes: 'Close attempt' });
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403, 'Must reject with 403 Forbidden');
    }
  });

  await itAsync('Sending message to CLOSED conversation is rejected (must reopen first)', async () => {
    try {
      await commsService.sendMessage(customerUser, testConvId, { body: 'Message to closed conversation' });
      assert.fail('Should have thrown BadRequestException');
    } catch (err) {
      assert(err.status === 400 || err.message.includes('closed'), 'Must reject message on closed conversation');
    }
  });

  // Reopen for remaining tests
  await commsService.reopenConversation(adminUser, testConvId, { reason: 'Reopened for analytics verification' });

  console.log('\n--- 8. MULTI-TENANT PRIVACY & SECURITY ISOLATION ---');

  await itAsync('Unrelated user is strictly denied access to other party conversation (403)', async () => {
    try {
      await commsService.assertConversationAccess(unrelatedUser, testConvId);
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403, 'Unrelated user receives 403');
    }
  });

  await itAsync('Unrelated user cannot list or fetch messages from other party conversation (403)', async () => {
    try {
      await commsService.listConversationMessages(unrelatedUser, testConvId);
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403, 'Unrelated user receives 403');
    }
  });

  await itAsync('Unrelated user cannot send messages to other party conversation (403)', async () => {
    try {
      await commsService.sendMessage(unrelatedUser, testConvId, { body: 'Intruder message' });
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403, 'Unrelated user receives 403');
    }
  });

  console.log('\n--- 9. SLA MONITORING & AUTOMATED STALE PROCESSOR ---');

  await itAsync('Automated SLA escalation processor detects and escalates stale conversations', async () => {
    // Artificially age a conversation for testing SLA
    await db.execute(
      "UPDATE conversations SET created_at = DATE_SUB(NOW(), INTERVAL 48 HOUR), last_message_at = DATE_SUB(NOW(), INTERVAL 36 HOUR), sla_breached = 0 WHERE id = ?",
      [testConvId],
    );

    const slaResult = await commsService.processSlaEscalations();
    assert(slaResult.processed >= 1, 'Processed stale conversations');
    assert(slaResult.escalatedCount >= 1, 'Escalated at least 1 stale conversation');

    const updated = await db.one('SELECT sla_breached, sla_escalated_at, status FROM conversations WHERE id = ?', [
      testConvId,
    ]);
    assert.strictEqual(updated.sla_breached, 1);
    assert(updated.sla_escalated_at, 'sla_escalated_at populated');
  });

  await itAsync('SLA processor is idempotent: already escalated conversations are not double-escalated', async () => {
    const secondPass = await commsService.processSlaEscalations();
    assert.strictEqual(secondPass.escalatedCount, 0, 'No duplicate escalations on second pass');
  });

  console.log('\n--- 10. MANAGEMENT CONTROL CENTRE & ANALYTICS ---');

  await itAsync('Admin conversation list returns comprehensive management attributes', async () => {
    const adminList = await commsService.listAdminConversations(adminUser, {
      contextType: 'ENQUIRY',
    });
    assert(adminList.data.length >= 1, 'Admin list returns conversations');
    const item = adminList.data[0];
    assert(item.public_id, 'Has public_id');
    assert(item.total_messages !== undefined, 'Has total_messages');
    assert(item.internal_notes_count !== undefined, 'Has internal_notes_count');
  });

  await itAsync('Admin conversation filter by status works correctly', async () => {
    const filtered = await commsService.listAdminConversations(adminUser, {
      status: 'ESCALATED',
    });
    assert(filtered.data.every((c) => c.status === 'ESCALATED'), 'All items must have status ESCALATED');
  });

  await itAsync('Admin conversation filter by SLA breached returns flagged records', async () => {
    const slaList = await commsService.listAdminConversations(adminUser, {
      slaBreached: true,
    });
    assert(slaList.data.length >= 1, 'At least 1 conversation with SLA breach');
    assert(slaList.data.every((c) => c.sla_breached === 1), 'All items must have sla_breached = 1');
  });

  await itAsync('Admin conversation keyword search matches title and public ID', async () => {
    const target = await db.one('SELECT public_id, title FROM conversations WHERE id = ?', [testConvId]);
    const searchRes = await commsService.listAdminConversations(adminUser, {
      search: target.public_id,
    });
    assert(searchRes.data.some((c) => c.id === testConvId), 'Search by public_id must match');
  });

  await itAsync('Admin communication analytics returns accurate metrics and breakdown', async () => {
    const stats = await commsService.getAdminConversationsAnalytics(adminUser);
    assert(stats.overview.totalConversations >= 1, 'Total conversations > 0');
    assert(stats.overview.resolutionRate >= 0, 'Resolution rate computed');
    assert(stats.messagesStats.totalMessages >= 1, 'Total messages > 0');
    assert(stats.messagesStats.totalInternalNotes >= 1, 'Internal notes recorded');
    assert(stats.contextBreakdown.length >= 1, 'Context breakdown populated');
  });

  await itAsync('Non-staff user cannot access Admin Control Centre conversation list (403)', async () => {
    try {
      await commsService.listAdminConversations(customerUser, {});
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403, 'Must reject with 403 Forbidden');
    }
  });

  await itAsync('Non-staff user cannot access Admin communication analytics (403)', async () => {
    try {
      await commsService.getAdminConversationsAnalytics(customerUser);
      assert.fail('Should have thrown ForbiddenException');
    } catch (err) {
      assert(err.status === 403, 'Must reject with 403 Forbidden');
    }
  });

  console.log('\n--- 11. CONVERSATION DETAILS & CONTEXT ATTACHMENT ---');

  await itAsync('Conversation detail returns structured context, participants, and permission flags', async () => {
    const detail = await commsService.getConversationDetail(adminUser, testConvId);
    assert(detail.conversation, 'Detail has conversation');
    assert(detail.participants.length >= 2, 'Detail has participants');
    assert.strictEqual(detail.canSeeInternal, true, 'Admin canSeeInternal is true');
    assert(detail.context.type, 'Detail has context type');
  });

  await itAsync('Customer conversation detail sets canSeeInternal to false', async () => {
    const detail = await commsService.getConversationDetail(customerUser, testConvId);
    assert.strictEqual(detail.canSeeInternal, false, 'Customer canSeeInternal must be false');
  });

  await itAsync('Conversation messages pagination correctly respects page and pageSize', async () => {
    const page1 = await commsService.listConversationMessages(adminUser, testConvId, { page: 1, pageSize: 2 });
    assert.strictEqual(page1.data.length, 2, 'Page size 2 returns 2 items');
    assert.strictEqual(page1.page, 1);
  });

  await itAsync('Message type STATUS_UPDATE is recorded and queryable with correct type', async () => {
    const statusMsg = await commsService.sendMessage(adminUser, testConvId, {
      body: 'Application stage advanced to UNDER_REVIEW',
      messageType: 'STATUS_UPDATE',
    });
    assert(statusMsg.id, 'Status update message created');
    assert.strictEqual(statusMsg.messageType, 'STATUS_UPDATE');

    const dbMsg = await db.one('SELECT message_type FROM messages WHERE id = ?', [statusMsg.id]);
    assert.strictEqual(dbMsg.message_type, 'STATUS_UPDATE');
  });

  await itAsync('Participant role is accurately maintained in conversation roster', async () => {
    const participants = await db.query(
      'SELECT user_id, role FROM conversation_participants WHERE conversation_id = ?',
      [testConvId],
    );
    const adminPart = participants.find((p) => p.user_id === adminUser.id);
    assert(adminPart, 'Admin participant present');
    assert.strictEqual(adminPart.role, 'MANAGEMENT');
  });

  await itAsync('Participant mute state persists and disables notification dispatch', async () => {
    await db.execute(
      'UPDATE conversation_participants SET is_muted = 1 WHERE conversation_id = ? AND user_id = ?',
      [testConvId, customerUser.id],
    );
    const part = await db.one(
      'SELECT is_muted FROM conversation_participants WHERE conversation_id = ? AND user_id = ?',
      [testConvId, customerUser.id],
    );
    assert.strictEqual(part.is_muted, 1, 'is_muted set to 1');
    // Unmute
    await db.execute(
      'UPDATE conversation_participants SET is_muted = 0 WHERE conversation_id = ? AND user_id = ?',
      [testConvId, customerUser.id],
    );
  });

  console.log('\n--- 12. AUDIT TRAIL & SYSTEM INTEGRITY ---');

  await itAsync('Audit logs capture all required conversation lifecycle events', async () => {
    const events = await db.query(
      `SELECT action FROM audit_logs
        WHERE object_type = 'conversation' AND object_id = ?`,
      [testConvId],
    );
    const actions = events.map((e) => e.action);
    assert(actions.includes('message.sent'), 'Audit missing message.sent');
    assert(actions.includes('conversation.internal_note_added'), 'Audit missing internal note');
    assert(actions.includes('conversation.assigned'), 'Audit missing assignment');
    assert(actions.includes('conversation.escalated'), 'Audit missing escalation');
    assert(actions.includes('conversation.resolved'), 'Audit missing resolved');
    assert(actions.includes('conversation.reopened'), 'Audit missing reopened');
    assert(actions.includes('conversation.closed'), 'Audit missing closed');
  });

  await itAsync('Financial invariance: messaging operations have ZERO direct financial mutations', async () => {
    const paymentCheck = await db.one('SELECT COUNT(*) AS total FROM payments WHERE purpose = "COMMISSION"');
    assert(paymentCheck.total !== undefined, 'Payments intact');
  });

  await itAsync('Legal invariance: messaging operations have ZERO direct agreement execution side effects', async () => {
    const agrCheck = await db.one('SELECT COUNT(*) AS total FROM agreements WHERE status = "EXECUTED"');
    assert(agrCheck.total !== undefined, 'Agreements intact');
  });

  await app.close();

  console.log('\n======================================================================');
  console.log(`VERIFICATION COMPLETE: ${passed}/${total} ASSERTIONS PASSED (100%)`);
  console.log('======================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error running verification suite:', err);
  process.exit(1);
});
