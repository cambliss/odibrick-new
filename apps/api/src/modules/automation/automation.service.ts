import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { pageParams, paginate } from '../../common/util/pagination';
import { BusinessEvent, WorkflowAction, WorkflowRule } from './automation.types';
import {
  AcknowledgeFailureDto,
  EmitEventDto,
  ToggleRuleDto,
  UpdateNotificationPreferenceDto,
} from './automation.dto';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  /**
   * Central Event Dispatcher & Workflow Rule Orchestrator.
   * Business modules call emit(event) to trigger governed automation.
   */
  async emit(
    eventDto: BusinessEvent | EmitEventDto,
    actor?: AuthUser,
    req?: Request,
  ): Promise<{
    eventId: number;
    publicId: string;
    rulesMatched: number;
    executionsCreated: number;
  }> {
    if (!eventDto.eventType || !eventDto.entityType || !eventDto.entityId) {
      throw new BadRequestException('Event must specify eventType, entityType, and entityId.');
    }

    const publicId = `ODB-EVT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
    const correlationId =
      eventDto.correlationId ||
      `CORR-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;

    const actorId = actor?.id ?? eventDto.actorId ?? null;
    const actorRole = actor?.roles?.[0] ?? eventDto.actorRole ?? null;
    const payload = eventDto.payload || {};

    // 1. Persist Event to durable Workflow Event Store
    const eventId = await this.db.insert('workflow_events', {
      public_id: publicId,
      event_type: eventDto.eventType.toUpperCase(),
      entity_type: eventDto.entityType.toLowerCase(),
      entity_id: Number(eventDto.entityId),
      actor_id: actorId,
      actor_role: actorRole,
      correlation_id: correlationId,
      idempotency_key: eventDto.idempotencyKey || null,
      payload: JSON.stringify(payload),
      occurred_at: eventDto.occurredAt ? new Date(eventDto.occurredAt) : new Date(),
    });

    // 2. Resolve matching enabled rules
    const rules = await this.db.query<any>(
      `SELECT * FROM workflow_rules
        WHERE event_type = ? AND is_enabled = 1
        ORDER BY priority ASC, id ASC`,
      [eventDto.eventType.toUpperCase()],
    );

    let rulesMatched = 0;
    let executionsCreated = 0;

    for (const rule of rules) {
      let conditions: Record<string, any> = {};
      let actions: WorkflowAction[] = [];
      try {
        conditions = typeof rule.conditions === 'string' ? JSON.parse(rule.conditions) : rule.conditions || {};
        actions = typeof rule.actions === 'string' ? JSON.parse(rule.actions) : rule.actions || [];
      } catch (parseErr) {
        this.logger.error(`Failed parsing rule JSON for rule ${rule.rule_code}`);
        continue;
      }

      // Check deterministic conditions
      if (!this.evaluateConditions(conditions, payload)) {
        continue;
      }

      rulesMatched++;

      // Execute each action
      for (const action of actions) {
        const actionPublicId = `ODB-ACT-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
        const idempotencyKey = `${rule.rule_code}:${eventDto.entityType}:${eventDto.entityId}:${eventDto.idempotencyKey || publicId}:${action.type}`;

        // Check idempotency in workflow_executions
        const existingExec = await this.db.one<any>(
          'SELECT id, status FROM workflow_executions WHERE idempotency_key = ?',
          [idempotencyKey],
        );

        if (existingExec && (existingExec.status === 'COMPLETED' || existingExec.status === 'PROCESSING')) {
          continue;
        }

        let execId = existingExec?.id;
        if (!execId) {
          execId = await this.db.insert('workflow_executions', {
            public_id: actionPublicId,
            event_id: eventId,
            rule_id: rule.id,
            idempotency_key: idempotencyKey,
            status: 'PROCESSING',
            action_type: action.type,
            action_payload: JSON.stringify(action),
            retry_count: 0,
            max_retries: 3,
          });
          executionsCreated++;
        } else {
          await this.db.update('workflow_executions', execId, {
            status: 'PROCESSING',
            updated_at: new Date(),
          });
        }

        // Execute action with controlled error and retry handling
        try {
          const result = await this.executeAction(action, {
            event: { ...eventDto, id: eventId, publicId },
            actor,
            payload,
          });

          await this.db.update('workflow_executions', execId, {
            status: 'COMPLETED',
            result_payload: JSON.stringify(result || { status: 'SUCCESS' }),
            processed_at: new Date(),
            last_error: null,
          });

          await this.audit.record({
            actor,
            action: 'automation.action_completed',
            objectType: 'workflow_execution',
            objectId: execId,
            metadata: {
              ruleCode: rule.rule_code,
              actionType: action.type,
              correlationId,
            },
            req,
          });
        } catch (actionErr: any) {
          this.logger.error(`Workflow action failed (${rule.rule_code} - ${action.type}): ${actionErr.message}`);

          await this.db.execute(
            `UPDATE workflow_executions
                SET status = 'FAILED',
                    retry_count = retry_count + 1,
                    last_error = ?,
                    processed_at = NOW(),
                    updated_at = NOW()
              WHERE id = ?`,
            [actionErr.message?.slice(0, 1000) || 'Action failed', execId],
          );

          await this.audit.record({
            actor,
            action: 'automation.action_failed',
            objectType: 'workflow_execution',
            objectId: execId,
            metadata: {
              ruleCode: rule.rule_code,
              actionType: action.type,
              error: actionErr.message,
              correlationId,
            },
            req,
          });
        }
      }
    }

    return {
      eventId,
      publicId,
      rulesMatched,
      executionsCreated,
    };
  }

  /** Deterministic condition evaluation against payload */
  private evaluateConditions(conditions: Record<string, any>, payload: Record<string, any>): boolean {
    if (!conditions || Object.keys(conditions).length === 0) return true;

    for (const [key, expected] of Object.entries(conditions)) {
      const val = payload[key];
      if (key === 'minDaysOverdue') {
        const days = Number(payload.daysOverdue ?? payload.days_overdue ?? 0);
        if (days < Number(expected)) return false;
      } else if (key === 'hoursUnacknowledged') {
        const hours = Number(payload.hoursUnacknowledged ?? payload.hours_unacknowledged ?? 0);
        if (hours < Number(expected)) return false;
      } else if (key === 'severity') {
        if (payload.severity !== expected) return false;
      } else if (key === 'status') {
        if (payload.status !== expected) return false;
      } else if (typeof expected === 'object' && expected !== null) {
        // Range check
        if (expected.gte !== undefined && Number(val) < Number(expected.gte)) return false;
        if (expected.lte !== undefined && Number(val) > Number(expected.lte)) return false;
        if (expected.eq !== undefined && val !== expected.eq) return false;
      } else {
        if (val !== undefined && val !== expected) return false;
      }
    }

    return true;
  }

  /** Execute allowlisted workflow actions */
  private async executeAction(
    action: WorkflowAction,
    context: {
      event: any;
      actor?: AuthUser;
      payload: Record<string, any>;
    },
  ): Promise<any> {
    const { event, payload, actor } = context;

    switch (action.type) {
      case 'SEND_NOTIFICATION': {
        const recipientUserIds = await this.resolveRecipients(action.recipient, payload, event);
        const eventCode = action.eventCode || event.eventType;
        const title = action.title || `Update: ${event.eventType.replace(/_/g, ' ')}`;
        const body =
          action.body ||
          payload.notes ||
          payload.message ||
          `Automated notification regarding ${event.entityType} #${event.entityId}.`;
        const severity = action.severity || payload.severity || 'INFO';
        const actionUrl = action.actionUrl || payload.actionUrl || this.resolveContextUrl(event.entityType, event.entityId);

        let sentCount = 0;
        for (const uid of recipientUserIds) {
          if (!uid) continue;
          // Check preferences
          const allowed = await this.isChannelAllowed(uid, action.category || 'SYSTEM', 'IN_APP', severity);
          if (allowed) {
            await this.notify.send(uid, eventCode, {
              title,
              body,
              severity,
              actionUrl,
            });
            sentCount++;
          }
        }
        return { action: 'SEND_NOTIFICATION', recipientsNotified: sentCount };
      }

      case 'CREATE_TASK_OR_FOLLOW_UP':
      case 'CREATE_OPERATIONAL_TASK':
      case 'ESCALATE_TO_MANAGEMENT': {
        const title = action.title || `🚨 Operational Escalation: ${event.entityType.toUpperCase()} #${event.entityId}`;
        const body =
          action.notes ||
          payload.notes ||
          `SLA or domain threshold exceeded for ${event.entityType} #${event.entityId}. Immediate Management review required.`;

        // Create Operational Task in Control Tower if not already existing
        const idempotencyKey = `AUTO:TSK:${event.entityType}:${event.entityId}:${event.eventType}`;
        const publicId = `TSK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
          100000 + Math.random() * 900000,
        )}`;
        const priority = action.severity === 'CRITICAL' ? 'CRITICAL' : action.severity === 'WARNING' ? 'HIGH' : 'NORMAL';
        const domain = (action.category || event.entityType || 'GENERAL').toUpperCase();

        try {
          await this.db.query(
            `INSERT IGNORE INTO operational_tasks (
              public_id, task_type, title, description, source_domain, source_entity_type, source_entity_id,
              priority, status, assigned_team, due_at, sla_due_at, sla_status, metadata, idempotency_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR), DATE_ADD(NOW(), INTERVAL 12 HOUR), 'ON_TRACK', ?, ?)`,
            [
              publicId,
              `${event.eventType}_ESCALATION`,
              title,
              body,
              domain,
              event.entityType,
              String(event.entityId),
              priority,
              'OPEN',
              domain,
              JSON.stringify(payload || {}),
              idempotencyKey,
            ],
          );
        } catch (taskErr: any) {
          this.logger.error(`Failed to insert operational task: ${taskErr.message}`);
        }

        // Query admin user IDs
        const admins = await this.db.query<any>(
          `SELECT u.id FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
            WHERE r.code IN ('SUPER_ADMIN', 'ADMIN')`,
        );
        const adminIds = admins.map((a: any) => a.id);

        for (const aid of adminIds) {
          await this.notify.send(aid, 'SLA_ESCALATION_MANAGEMENT', {
            title,
            body,
            severity: action.severity || 'CRITICAL',
            actionUrl: this.resolveAdminContextUrl(event.entityType, event.entityId),
          });
        }
        return { action: action.type, adminsAlerted: adminIds.length, taskCreated: true };
      }

      case 'CREATE_COMPLIANCE_EXCEPTION': {
        const publicId = `ODB-EXC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 900 + 100)}`;
        const excId = await this.db.insert('compliance_exceptions', {
          public_id: publicId,
          category: action.category || 'OTHER',
          context_type: event.entityType.toUpperCase(),
          context_id: event.entityId,
          user_id: payload.userId || payload.ownerUserId || payload.payerUserId || null,
          document_id: event.entityType === 'document' ? event.entityId : null,
          title: `Compliance Exception: ${event.entityType.toUpperCase()} #${event.entityId}`,
          description: action.notes || payload.notes || 'Automated compliance rule triggered exception.',
          severity: action.severity || 'HIGH',
          status: 'OPEN',
        });
        return { action: 'CREATE_COMPLIANCE_EXCEPTION', exceptionId: excId, publicId };
      }

      case 'CREATE_AUDIT_EVENT': {
        await this.audit.record({
          actor,
          action: `automation.${event.eventType.toLowerCase()}`,
          objectType: event.entityType,
          objectId: event.entityId,
          metadata: {
            correlationId: event.correlationId,
            notes: action.notes,
            payload,
          },
        });
        return { action: 'CREATE_AUDIT_EVENT', logged: true };
      }

      case 'CREATE_SYSTEM_MESSAGE': {
        if (payload.conversationId) {
          await this.db.insert('messages', {
            conversation_id: payload.conversationId,
            sender_id: actor?.id ?? 1,
            message_type: 'SYSTEM',
            body: action.body || payload.notes || 'System automated status update.',
          });
          return { action: 'CREATE_SYSTEM_MESSAGE', conversationId: payload.conversationId };
        }
        return { action: 'CREATE_SYSTEM_MESSAGE', skipped: 'no_conversation_id' };
      }

      case 'MARK_SLA_BREACHED': {
        if (event.entityType === 'conversation' && event.entityId) {
          await this.db.execute(
            'UPDATE conversations SET sla_breached = 1, sla_escalated_at = NOW() WHERE id = ?',
            [event.entityId],
          );
        }
        return { action: 'MARK_SLA_BREACHED', entityType: event.entityType, entityId: event.entityId };
      }

      default:
        throw new BadRequestException(`Unsupported workflow action type: ${action.type}`);
    }
  }

  /** Resolves recipient user IDs based on context */
  private async resolveRecipients(
    recipientType: string | undefined,
    payload: Record<string, any>,
    event: any,
  ): Promise<number[]> {
    if (!recipientType) return [];

    switch (recipientType) {
      case 'ACTOR':
        return event.actorId ? [event.actorId] : [];
      case 'PAYER':
        return payload.payerUserId ? [Number(payload.payerUserId)] : [];
      case 'PAYEE':
        return payload.payeeUserId ? [Number(payload.payeeUserId)] : [];
      case 'OWNER':
        return payload.ownerUserId ? [Number(payload.ownerUserId)] : [];
      case 'TENANT':
        return payload.tenantUserId ? [Number(payload.tenantUserId)] : [];
      case 'CUSTOMER':
        return payload.customerUserId
          ? [Number(payload.customerUserId)]
          : payload.applicantUserId
            ? [Number(payload.applicantUserId)]
            : [];
      case 'ASSIGNEE':
        return payload.assignedUserId
          ? [Number(payload.assignedUserId)]
          : payload.assignedTo
            ? [Number(payload.assignedTo)]
            : [];
      case 'PARTIES': {
        const uids: number[] = [];
        if (payload.ownerUserId) uids.push(Number(payload.ownerUserId));
        if (payload.tenantUserId) uids.push(Number(payload.tenantUserId));
        if (payload.customerUserId) uids.push(Number(payload.customerUserId));
        if (payload.hostUserId) uids.push(Number(payload.hostUserId));
        return Array.from(new Set(uids));
      }
      case 'MANAGEMENT': {
        const admins = await this.db.query<any>(
          `SELECT u.id FROM users u
             JOIN user_roles ur ON ur.user_id = u.id
             JOIN roles r ON r.id = ur.role_id
            WHERE r.code IN ('SUPER_ADMIN', 'ADMIN')`,
        );
        return admins.map((a: any) => a.id);
      }
      default:
        return [];
    }
  }

  private resolveContextUrl(entityType: string, entityId: number): string {
    switch (entityType.toLowerCase()) {
      case 'payment':
        return '/dashboard/payments';
      case 'document':
      case 'kyc':
        return '/dashboard/documents';
      case 'visit':
        return '/dashboard/visits';
      case 'lead':
      case 'enquiry':
        return '/dashboard/leads';
      case 'conversation':
        return '/dashboard/messages';
      case 'dispute':
        return `/dashboard/disputes/${entityId}`;
      case 'tenancy':
        return `/dashboard/tenancy/${entityId}`;
      case 'maintenance':
        return `/dashboard/maintenance/${entityId}`;
      case 'application':
        return '/dashboard/applications';
      default:
        return '/dashboard';
    }
  }

  private resolveAdminContextUrl(entityType: string, entityId: number): string {
    switch (entityType.toLowerCase()) {
      case 'payment':
        return '/dashboard/admin/finance';
      case 'document':
      case 'kyc':
        return '/dashboard/admin/compliance';
      case 'visit':
        return '/dashboard/admin/visits';
      case 'lead':
      case 'enquiry':
        return '/dashboard/admin/leads';
      case 'conversation':
        return '/dashboard/admin/messages';
      case 'dispute':
        return `/dashboard/disputes/${entityId}`;
      default:
        return '/dashboard/admin/automation';
    }
  }

  private async isChannelAllowed(
    userId: number,
    category: string,
    channel: string,
    severity: string,
  ): Promise<boolean> {
    // Critical or Action items are never muted
    if (severity === 'CRITICAL' || severity === 'ACTION') return true;

    const pref = await this.db.one<any>(
      'SELECT is_enabled FROM user_notification_preferences WHERE user_id = ? AND category = ? AND channel = ?',
      [userId, category, channel],
    );
    return pref ? pref.is_enabled === 1 : true;
  }

  /** Manual Retry of Failed Execution */
  async retryExecution(user: AuthUser, executionId: number, req?: Request) {
    const exec = await this.db.one<any>(
      `SELECT e.*, ev.payload AS event_payload, ev.event_type, ev.entity_type, ev.entity_id, ev.actor_id,
              r.rule_code
         FROM workflow_executions e
         JOIN workflow_events ev ON ev.id = e.event_id
         JOIN workflow_rules r ON r.id = e.rule_id
        WHERE e.id = ?`,
      [executionId],
    );
    if (!exec) throw new NotFoundException('Workflow execution record not found.');

    if (exec.status === 'COMPLETED') {
      throw new BadRequestException('This action is already completed successfully.');
    }

    let actionPayload: WorkflowAction;
    let eventPayload: Record<string, any>;
    try {
      actionPayload = typeof exec.action_payload === 'string' ? JSON.parse(exec.action_payload) : exec.action_payload;
      eventPayload = typeof exec.event_payload === 'string' ? JSON.parse(exec.event_payload) : exec.event_payload;
    } catch {
      throw new BadRequestException('Malformed action payload.');
    }

    await this.db.update('workflow_executions', executionId, {
      status: 'PROCESSING',
      updated_at: new Date(),
    });

    try {
      const actionToRun: WorkflowAction = {
        ...actionPayload,
        type: (actionPayload?.type || exec.action_type) as any,
      };

      const result = await this.executeAction(actionToRun, {
        event: {
          id: exec.event_id,
          eventType: exec.event_type,
          entityType: exec.entity_type,
          entityId: exec.entity_id,
          actorId: exec.actor_id,
        },
        actor: user,
        payload: eventPayload,
      });

      await this.db.update('workflow_executions', executionId, {
        status: 'COMPLETED',
        result_payload: JSON.stringify(result || { status: 'SUCCESS' }),
        processed_at: new Date(),
        last_error: null,
      });

      await this.audit.record({
        actor: user,
        action: 'automation.retry',
        objectType: 'workflow_execution',
        objectId: executionId,
        metadata: { ruleCode: exec.rule_code, status: 'COMPLETED' },
        req,
      });

      return { id: executionId, status: 'COMPLETED', result };
    } catch (err: any) {
      await this.db.execute(
        `UPDATE workflow_executions
            SET status = 'FAILED',
                retry_count = retry_count + 1,
                last_error = ?,
                processed_at = NOW(),
                updated_at = NOW()
          WHERE id = ?`,
        [err.message?.slice(0, 1000) || 'Retry failed', executionId],
      );

      await this.audit.record({
        actor: user,
        action: 'automation.retry_failed',
        objectType: 'workflow_execution',
        objectId: executionId,
        metadata: { ruleCode: exec.rule_code, error: err.message },
        req,
      });

      throw new BadRequestException(`Retry failed: ${err.message}`);
    }
  }

  /** Acknowledge Failure */
  async acknowledgeFailure(user: AuthUser, executionId: number, dto: AcknowledgeFailureDto, req?: Request) {
    const exec = await this.db.one<any>('SELECT * FROM workflow_executions WHERE id = ?', [executionId]);
    if (!exec) throw new NotFoundException('Execution not found.');

    await this.db.update('workflow_executions', executionId, {
      status: 'SKIPPED',
      acknowledged: 1,
      acknowledged_by: user.id,
      acknowledged_at: new Date(),
      last_error: dto.notes ? `${exec.last_error || ''} [Ack: ${dto.notes}]` : exec.last_error,
    });

    await this.audit.record({
      actor: user,
      action: 'automation.failure_acknowledged',
      objectType: 'workflow_execution',
      objectId: executionId,
      metadata: { notes: dto.notes },
      req,
    });

    return { id: executionId, acknowledged: true };
  }

  /** Enable / Disable Workflow Rule */
  async toggleRule(user: AuthUser, ruleId: number, dto: ToggleRuleDto, req?: Request) {
    const rule = await this.db.one<any>('SELECT * FROM workflow_rules WHERE id = ?', [ruleId]);
    if (!rule) throw new NotFoundException('Workflow rule not found.');

    await this.db.update('workflow_rules', ruleId, {
      is_enabled: dto.isEnabled ? 1 : 0,
      updated_by: user.id,
      updated_at: new Date(),
    });

    await this.audit.record({
      actor: user,
      action: dto.isEnabled ? 'automation.rule_enabled' : 'automation.rule_disabled',
      objectType: 'workflow_rule',
      objectId: ruleId,
      metadata: { ruleCode: rule.rule_code, isEnabled: dto.isEnabled },
      req,
    });

    return { id: ruleId, ruleCode: rule.rule_code, isEnabled: dto.isEnabled };
  }

  /** Retry Processor: Re-executes retryable failed actions */
  async processRetries(): Promise<{ retriedCount: number; succeeded: number; failed: number }> {
    const failedExecs = await this.db.query<any>(
      `SELECT id FROM workflow_executions
        WHERE status = 'FAILED' AND retry_count < max_retries AND acknowledged = 0
        LIMIT 50`,
    );

    let succeeded = 0;
    let failed = 0;

    for (const item of failedExecs) {
      try {
        await this.retryExecution({ id: 1, publicId: 'SYSTEM', email: 'system@odibrick.com', fullName: 'Automation System', roles: ['SUPER_ADMIN'], permissions: ['automation.manage'] }, item.id);
        succeeded++;
      } catch {
        failed++;
      }
    }

    return { retriedCount: failedExecs.length, succeeded, failed };
  }

  /** Run Unified Scheduled Automation & SLA Engine */
  async runScheduledAutomation(actor?: AuthUser) {
    const now = new Date();
    let paymentsOverdue = 0;
    let visitsReminded = 0;
    let documentsExpiring = 0;
    let staleLeads = 0;

    // 1. Process Retries
    const retriesRes = await this.processRetries();

    // 2. Scheduled Payment Overdue Evaluation
    try {
      const overduePayments = await this.db.query<any>(
        `SELECT p.id, p.amount, p.status, p.payer_user_id, p.payee_user_id, p.due_date,
                DATEDIFF(CURDATE(), p.due_date) AS days_overdue
           FROM payments p
          WHERE p.status = 'OVERDUE' OR (p.status = 'PENDING' AND p.due_date < CURDATE())
          LIMIT 50`,
      );
      for (const p of overduePayments) {
        const days = Math.max(1, Number(p.days_overdue || 1));
        await this.emit({
          eventType: 'PAYMENT_OVERDUE',
          entityType: 'payment',
          entityId: p.id,
          idempotencyKey: `PAY-${p.id}-OVERDUE-${days}D`,
          payload: {
            daysOverdue: days,
            amount: Number(p.amount),
            payerUserId: p.payer_user_id,
            payeeUserId: p.payee_user_id,
          },
        }, actor);
        paymentsOverdue++;
      }
    } catch (e: any) {
      this.logger.error(`Scheduled payment evaluation error: ${e.message}`);
    }

    // 3. Scheduled Visit Reminders (<= 24h)
    try {
      const upcomingVisits = await this.db.query<any>(
        `SELECT pv.id, pv.customer_user_id, pv.host_user_id, pv.scheduled_start,
                TIMESTAMPDIFF(HOUR, NOW(), pv.scheduled_start) AS hours_until_start
           FROM property_visits pv
          WHERE pv.status = 'CONFIRMED'
            AND pv.scheduled_start > NOW()
            AND pv.scheduled_start <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
          LIMIT 50`,
      );
      for (const v of upcomingVisits) {
        await this.emit({
          eventType: 'VISIT_REMINDER_DUE',
          entityType: 'visit',
          entityId: v.id,
          idempotencyKey: `VISIT-${v.id}-REMINDER-24H`,
          payload: {
            hoursUntilStart: Number(v.hours_until_start),
            customerUserId: v.customer_user_id,
            hostUserId: v.host_user_id,
            scheduledStart: v.scheduled_start,
          },
        }, actor);
        visitsReminded++;
      }
    } catch (e: any) {
      this.logger.error(`Scheduled visit reminder error: ${e.message}`);
    }

    // 4. Scheduled Document Expiry (<= 30 days)
    try {
      const expiringDocs = await this.db.query<any>(
        `SELECT d.id, d.owner_user_id, d.title, d.category, d.expiry_date,
                DATEDIFF(d.expiry_date, CURDATE()) AS days_until_expiry
           FROM documents d
          WHERE d.verification_status = 'VERIFIED'
            AND d.expiry_date IS NOT NULL
            AND d.expiry_date > CURDATE()
            AND d.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
          LIMIT 50`,
      );
      for (const doc of expiringDocs) {
        await this.emit({
          eventType: 'DOCUMENT_EXPIRING',
          entityType: 'document',
          entityId: doc.id,
          idempotencyKey: `DOC-${doc.id}-EXPIRY-30D`,
          payload: {
            daysUntilExpiry: Number(doc.days_until_expiry),
            ownerUserId: doc.owner_user_id,
            title: doc.title,
            category: doc.category,
            expiryDate: doc.expiry_date,
          },
        }, actor);
        documentsExpiring++;
      }
    } catch (e: any) {
      this.logger.error(`Scheduled document expiry error: ${e.message}`);
    }

    // 5. Scheduled Stale Lead Evaluation (>= 24h)
    try {
      const staleLeadsRows = await this.db.query<any>(
        `SELECT l.id, l.assigned_user_id, l.status,
                TIMESTAMPDIFF(HOUR, l.created_at, NOW()) AS hours_unacknowledged
           FROM leads l
          WHERE l.status IN ('NEW', 'ASSIGNED')
            AND l.created_at <= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          LIMIT 50`,
      );
      for (const lead of staleLeadsRows) {
        await this.emit({
          eventType: 'LEAD_STALE',
          entityType: 'lead',
          entityId: lead.id,
          idempotencyKey: `LEAD-${lead.id}-STALE-24H`,
          payload: {
            hoursUnacknowledged: Number(lead.hours_unacknowledged),
            assignedUserId: lead.assigned_user_id,
          },
        }, actor);
        staleLeads++;
      }
    } catch (e: any) {
      this.logger.error(`Scheduled stale lead error: ${e.message}`);
    }

    return {
      executedAt: now,
      status: 'SUCCESS',
      summary: {
        paymentsOverdue,
        visitsReminded,
        documentsExpiring,
        staleLeads,
        retries: retriesRes,
      },
    };
  }

  /** Admin Analytics & KPI Metrics */
  async getAnalytics() {
    const [
      eventsTotal,
      executionsTotal,
      completedTotal,
      failedTotal,
      pendingRetries,
      activeRules,
      todayEvents,
      escalations,
    ] = await Promise.all([
      this.db.one<{ count: number }>('SELECT COUNT(*) AS count FROM workflow_events'),
      this.db.one<{ count: number }>('SELECT COUNT(*) AS count FROM workflow_executions'),
      this.db.one<{ count: number }>("SELECT COUNT(*) AS count FROM workflow_executions WHERE status = 'COMPLETED'"),
      this.db.one<{ count: number }>("SELECT COUNT(*) AS count FROM workflow_executions WHERE status = 'FAILED'"),
      this.db.one<{ count: number }>("SELECT COUNT(*) AS count FROM workflow_executions WHERE status = 'FAILED' AND retry_count < max_retries AND acknowledged = 0"),
      this.db.one<{ count: number }>('SELECT COUNT(*) AS count FROM workflow_rules WHERE is_enabled = 1'),
      this.db.one<{ count: number }>('SELECT COUNT(*) AS count FROM workflow_events WHERE DATE(occurred_at) = CURRENT_DATE'),
      this.db.one<{ count: number }>("SELECT COUNT(*) AS count FROM workflow_executions WHERE action_type = 'ESCALATE_TO_MANAGEMENT' AND status = 'COMPLETED'"),
    ]);

    return {
      eventsProcessed: Number(eventsTotal?.count || 0),
      workflowsExecuted: Number(executionsTotal?.count || 0),
      notificationsSent: Number(completedTotal?.count || 0),
      failedActions: Number(failedTotal?.count || 0),
      pendingRetries: Number(pendingRetries?.count || 0),
      activeRules: Number(activeRules?.count || 0),
      todayEvents: Number(todayEvents?.count || 0),
      slaEscalations: Number(escalations?.count || 0),
    };
  }

  /** Get Paginated Workflow Events */
  async getEvents(
    filters: { eventType?: string; entityType?: string; correlationId?: string; search?: string; page?: number; perPage?: number } = {},
  ) {
    const { page: p, perPage: pp, offset } = pageParams(filters.page, filters.perPage);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.eventType) {
      where.push('we.event_type = ?');
      params.push(filters.eventType.toUpperCase());
    }
    if (filters.entityType) {
      where.push('we.entity_type = ?');
      params.push(filters.entityType.toLowerCase());
    }
    if (filters.correlationId) {
      where.push('we.correlation_id = ?');
      params.push(filters.correlationId);
    }
    if (filters.search) {
      where.push('(we.public_id LIKE ? OR we.event_type LIKE ? OR we.correlation_id LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    const totalRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM workflow_events we WHERE ${where.join(' AND ')}`,
      params,
    );

    const rows = await this.db.query(
      `SELECT we.*, u.full_name AS actor_name, u.email AS actor_email
         FROM workflow_events we
         LEFT JOIN users u ON u.id = we.actor_id
        WHERE ${where.join(' AND ')}
        ORDER BY we.occurred_at DESC, we.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );

    return paginate(rows, totalRow?.total ?? 0, p, pp);
  }

  /** Get Paginated Workflow Executions */
  async getExecutions(
    filters: { status?: string; actionType?: string; ruleCode?: string; page?: number; perPage?: number } = {},
  ) {
    const { page: p, perPage: pp, offset } = pageParams(filters.page, filters.perPage);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.status) {
      where.push('we.status = ?');
      params.push(filters.status.toUpperCase());
    }
    if (filters.actionType) {
      where.push('we.action_type = ?');
      params.push(filters.actionType);
    }
    if (filters.ruleCode) {
      where.push('r.rule_code = ?');
      params.push(filters.ruleCode);
    }

    const totalRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM workflow_executions we
         JOIN workflow_rules r ON r.id = we.rule_id
        WHERE ${where.join(' AND ')}`,
      params,
    );

    const rows = await this.db.query(
      `SELECT we.*, r.rule_code, r.name AS rule_name,
              ev.event_type, ev.entity_type, ev.entity_id, ev.correlation_id
         FROM workflow_executions we
         JOIN workflow_rules r ON r.id = we.rule_id
         JOIN workflow_events ev ON ev.id = we.event_id
        WHERE ${where.join(' AND ')}
        ORDER BY we.created_at DESC, we.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );

    return paginate(rows, totalRow?.total ?? 0, p, pp);
  }

  /** Get Failures Queue */
  async getFailures(filters: { acknowledged?: boolean; page?: number; perPage?: number } = {}) {
    const { page: p, perPage: pp, offset } = pageParams(filters.page, filters.perPage);
    const where: string[] = ["we.status = 'FAILED'"];
    const params: unknown[] = [];

    if (filters.acknowledged !== undefined) {
      where.push('we.acknowledged = ?');
      params.push(filters.acknowledged ? 1 : 0);
    }

    const totalRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM workflow_executions we WHERE ${where.join(' AND ')}`,
      params,
    );

    const rows = await this.db.query(
      `SELECT we.*, r.rule_code, r.name AS rule_name,
              ev.event_type, ev.entity_type, ev.entity_id, ev.correlation_id,
              ack.full_name AS acknowledged_by_name
         FROM workflow_executions we
         JOIN workflow_rules r ON r.id = we.rule_id
         JOIN workflow_events ev ON ev.id = we.event_id
         LEFT JOIN users ack ON ack.id = we.acknowledged_by
        WHERE ${where.join(' AND ')}
        ORDER BY we.updated_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );

    return paginate(rows, totalRow?.total ?? 0, p, pp);
  }

  /** Get All Workflow Rules */
  async getRules() {
    return this.db.query(
      `SELECT r.*,
              (SELECT COUNT(*) FROM workflow_executions we WHERE we.rule_id = r.id) AS total_executions,
              (SELECT COUNT(*) FROM workflow_executions we WHERE we.rule_id = r.id AND we.status = 'COMPLETED') AS successful_executions,
              (SELECT COUNT(*) FROM workflow_executions we WHERE we.rule_id = r.id AND we.status = 'FAILED') AS failed_executions
         FROM workflow_rules r
        ORDER BY r.priority ASC, r.id ASC`,
    );
  }

  /** User Notification Preferences */
  async getUserPreferences(userId: number) {
    const prefs = await this.db.query(
      'SELECT category, channel, is_enabled FROM user_notification_preferences WHERE user_id = ?',
      [userId],
    );
    return prefs;
  }

  async updatePreference(userId: number, dto: UpdateNotificationPreferenceDto) {
    await this.db.execute(
      `INSERT INTO user_notification_preferences (user_id, category, channel, is_enabled)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), updated_at = NOW()`,
      [userId, dto.category, dto.channel, dto.isEnabled ? 1 : 0],
    );
    return { userId, category: dto.category, channel: dto.channel, isEnabled: dto.isEnabled };
  }
}
