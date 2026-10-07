import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';

export const REMINDER_CONFIG = {
  PRE_DUE_DAYS: [3, 1],
  ESCALATION_DAYS: [3, 7, 15, 30],
};

export type ReminderRunStats = {
  targetDate: string;
  processed: number;
  remindersSent: number;
  escalationsSent: number;
  managementAlertsSent: number;
  skippedAlreadySent: number;
  skippedPaid: number;
  skippedIneligible: number;
  skippedGracePeriod: number;
  failures: number;
  details: Array<{
    paymentId: number;
    referenceCode: string;
    stage: string;
    status: 'SENT' | 'SKIPPED' | 'FAILED';
    reason?: string;
  }>;
};

@Injectable()
export class PaymentReminderService {
  private readonly logger = new Logger(PaymentReminderService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly notify: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Safe hourly scheduled execution.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyCron() {
    this.logger.log('Starting scheduled hourly payment reminder run...');
    try {
      const stats = await this.processDueReminders();
      this.logger.log(
        `Payment reminder run completed: processed=${stats.processed} sent=${stats.remindersSent} escalated=${stats.escalationsSent} managementAlerts=${stats.managementAlertsSent} skipped=${stats.skippedAlreadySent} failed=${stats.failures}`,
      );
    } catch (err: any) {
      this.logger.error(`Error in scheduled payment reminder execution: ${err.message}`, err.stack);
    }
  }

  /**
   * Main idempotent payment reminder & escalation processor.
   * Can be called by scheduled cron or manual admin test endpoint with targetDate override.
   */
  async processDueReminders(targetDate?: string, actor?: AuthUser): Promise<ReminderRunStats> {
    const todayStr = targetDate || new Date().toISOString().slice(0, 10);
    const today = new Date(todayStr);

    const stats: ReminderRunStats = {
      targetDate: todayStr,
      processed: 0,
      remindersSent: 0,
      escalationsSent: 0,
      managementAlertsSent: 0,
      skippedAlreadySent: 0,
      skippedPaid: 0,
      skippedIneligible: 0,
      skippedGracePeriod: 0,
      failures: 0,
      details: [],
    };

    // Query candidate open payments
    const candidatePayments = await this.db.query(
      `SELECT p.id, p.public_id, p.reference_code, p.purpose, p.amount, p.tax_amount, p.total_amount, p.currency,
              p.status, p.settlement_status, p.due_date, p.payer_user_id, p.payee_user_id, p.tenancy_id, p.notes,
              payer.full_name AS payer_name, payer.email AS payer_email,
              payee.full_name AS payee_name, payee.email AS payee_email,
              t.public_id AS tenancy_public_id, prop.title AS property_title,
              comm.grace_until
         FROM payments p
         JOIN users payer ON payer.id = p.payer_user_id
         LEFT JOIN users payee ON payee.id = p.payee_user_id
         LEFT JOIN tenancies t ON t.id = p.tenancy_id
         LEFT JOIN properties prop ON prop.id = p.property_id
         LEFT JOIN commissions comm ON comm.payment_id = p.id
        WHERE p.status IN ('DUE', 'INITIATED', 'PROCESSING')
          AND p.due_date IS NOT NULL
          AND p.total_amount > 0
        ORDER BY p.due_date ASC`,
    );

    // Get active management user IDs for escalation alerts
    const managementUsers = await this.db.query(
      `SELECT DISTINCT u.id FROM users u
         JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id
        WHERE r.code IN ('SUPER_ADMIN', 'ADMIN') AND u.status = 'ACTIVE'`,
    );
    const managementUserIds = managementUsers.map((m: any) => Number(m.id));

    for (const p of candidatePayments) {
      stats.processed++;

      try {
        // 1. Re-verify payment status from DB to avoid race conditions with concurrent settlements
        const livePayment = await this.db.one<any>('SELECT status, total_amount FROM payments WHERE id = ?', [p.id]);
        if (!livePayment || !['DUE', 'INITIATED', 'PROCESSING'].includes(livePayment.status)) {
          stats.skippedPaid++;
          stats.details.push({
            paymentId: p.id,
            referenceCode: p.reference_code,
            stage: 'LIVE_CHECK',
            status: 'SKIPPED',
            reason: 'Payment already settled or cancelled',
          });
          continue;
        }

        // 2. Compute date difference
        const dueDateRaw = p.due_date.toISOString ? p.due_date.toISOString().slice(0, 10) : p.due_date.toString().slice(0, 10);
        const dueDate = new Date(dueDateRaw);
        const diffMs = dueDate.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

        // 3. Check Commission grace period
        if (p.purpose === 'COMMISSION' && p.grace_until) {
          const graceUntilRaw = p.grace_until.toISOString ? p.grace_until.toISOString().slice(0, 10) : p.grace_until.toString().slice(0, 10);
          if (graceUntilRaw > todayStr && diffDays < 0) {
            // Still in grace period
            stats.skippedGracePeriod++;
            stats.details.push({
              paymentId: p.id,
              referenceCode: p.reference_code,
              stage: 'COMMISSION_GRACE',
              status: 'SKIPPED',
              reason: `Within grace period until ${graceUntilRaw}`,
            });
            continue;
          }
        }

        // 4. Identify applicable reminder / escalation stages
        const stagesToEvaluate: Array<{
          stage: string;
          eventCode: string;
          severity: 'INFO' | 'ACTION' | 'WARNING' | 'CRITICAL';
          isEscalation: boolean;
          notifyManagement: boolean;
          title: string;
          body: string;
          managementTitle?: string;
          managementBody?: string;
        }> = [];

        if (diffDays === 3) {
          stagesToEvaluate.push({
            stage: 'T_MINUS_3',
            eventCode: 'PAYMENT_DUE_SOON',
            severity: 'INFO',
            isEscalation: false,
            notifyManagement: false,
            title: `Upcoming Payment: ${this.formatPurpose(p.purpose)} due in 3 days`,
            body: `Your payment of INR ${Number(p.total_amount).toLocaleString('en-IN')} (${p.reference_code}) is due on ${dueDateRaw}.`,
          });
        } else if (diffDays === 1) {
          stagesToEvaluate.push({
            stage: 'T_MINUS_1',
            eventCode: 'PAYMENT_DUE_SOON',
            severity: 'INFO',
            isEscalation: false,
            notifyManagement: false,
            title: `Payment Due Tomorrow: ${this.formatPurpose(p.purpose)}`,
            body: `Your payment of INR ${Number(p.total_amount).toLocaleString('en-IN')} (${p.reference_code}) is due tomorrow (${dueDateRaw}).`,
          });
        } else if (diffDays === 0) {
          stagesToEvaluate.push({
            stage: 'DUE_TODAY',
            eventCode: 'PAYMENT_DUE',
            severity: 'ACTION',
            isEscalation: false,
            notifyManagement: false,
            title: `Payment Due Today: ${this.formatPurpose(p.purpose)}`,
            body: `Your payment of INR ${Number(p.total_amount).toLocaleString('en-IN')} (${p.reference_code}) is due today.`,
          });
        } else if (diffDays < 0) {
          const daysOverdue = -diffDays;

          if (daysOverdue >= 1 && daysOverdue < 3) {
            stagesToEvaluate.push({
              stage: 'OVERDUE_1D',
              eventCode: 'PAYMENT_OVERDUE',
              severity: 'WARNING',
              isEscalation: false,
              notifyManagement: false,
              title: `Payment Overdue: ${this.formatPurpose(p.purpose)}`,
              body: `Your payment of INR ${Number(p.total_amount).toLocaleString('en-IN')} (${p.reference_code}) was due on ${dueDateRaw} and is now overdue.`,
            });
          }

          if (daysOverdue >= 3 && daysOverdue < 7) {
            stagesToEvaluate.push({
              stage: 'ESCALATION_3D',
              eventCode: 'PAYMENT_ESCALATION',
              severity: 'WARNING',
              isEscalation: true,
              notifyManagement: false,
              title: `[Overdue Notice] ${this.formatPurpose(p.purpose)} is ${daysOverdue} days overdue`,
              body: `Payment of INR ${Number(p.total_amount).toLocaleString('en-IN')} (${p.reference_code}) is ${daysOverdue} days overdue. Please settle promptly to prevent service interruption.`,
            });
          }

          if (daysOverdue >= 7 && daysOverdue < 15) {
            stagesToEvaluate.push({
              stage: 'ESCALATION_7D',
              eventCode: 'PAYMENT_ESCALATION',
              severity: 'WARNING',
              isEscalation: true,
              notifyManagement: true,
              title: `[Urgent Notice] ${this.formatPurpose(p.purpose)} is ${daysOverdue} days overdue`,
              body: `Payment of INR ${Number(p.total_amount).toLocaleString('en-IN')} (${p.reference_code}) is ${daysOverdue} days overdue. Odibrick Management has been alerted.`,
              managementTitle: `[Level 2 Escalation] Payment ${p.reference_code} is ${daysOverdue} days overdue`,
              managementBody: `Payer ${p.payer_name} (${p.payer_email}) owes INR ${Number(p.total_amount).toLocaleString('en-IN')} for ${this.formatPurpose(p.purpose)} on Tenancy #${p.tenancy_id || 'N/A'}. Due date was ${dueDateRaw}.`,
            });
          }

          if (daysOverdue >= 15 && daysOverdue < 30) {
            stagesToEvaluate.push({
              stage: 'ESCALATION_15D',
              eventCode: 'PAYMENT_ESCALATION',
              severity: 'CRITICAL',
              isEscalation: true,
              notifyManagement: true,
              title: `[High Priority Escalation] ${this.formatPurpose(p.purpose)} is ${daysOverdue} days overdue`,
              body: `Immediate action required: Payment of INR ${Number(p.total_amount).toLocaleString('en-IN')} (${p.reference_code}) is ${daysOverdue} days overdue.`,
              managementTitle: `[Level 3 High Priority] Payment ${p.reference_code} is ${daysOverdue} days overdue`,
              managementBody: `Payer ${p.payer_name} (${p.payer_email}) owes INR ${Number(p.total_amount).toLocaleString('en-IN')} for ${this.formatPurpose(p.purpose)} on Tenancy #${p.tenancy_id || 'N/A'}. Persistently unpaid for 15+ days.`,
            });
          }

          if (daysOverdue >= 30) {
            stagesToEvaluate.push({
              stage: 'ESCALATION_30D',
              eventCode: 'PAYMENT_ESCALATION',
              severity: 'CRITICAL',
              isEscalation: true,
              notifyManagement: true,
              title: `[Critical Financial Escalation] ${this.formatPurpose(p.purpose)} is ${daysOverdue} days overdue`,
              body: `Critical: Payment of INR ${Number(p.total_amount).toLocaleString('en-IN')} (${p.reference_code}) has been delinquent for ${daysOverdue} days.`,
              managementTitle: `[Level 4 Critical Alert] Payment ${p.reference_code} is ${daysOverdue} days overdue (30+ Days)`,
              managementBody: `Critical delinquency: Payer ${p.payer_name} (${p.payer_email}) has unpaid balance of INR ${Number(p.total_amount).toLocaleString('en-IN')} for ${this.formatPurpose(p.purpose)} on Tenancy #${p.tenancy_id || 'N/A'}.`,
            });
          }
        }

        if (stagesToEvaluate.length === 0) {
          stats.skippedIneligible++;
          continue;
        }

        // 5. Evaluate and dispatch each applicable stage idempotently
        for (const item of stagesToEvaluate) {
          const idempotencyKey = `${p.id}:${item.stage}:${dueDateRaw}`;
          const alreadySent = await this.checkAlreadySent(p.id, item.stage, idempotencyKey);

          if (alreadySent) {
            stats.skippedAlreadySent++;
            stats.details.push({
              paymentId: p.id,
              referenceCode: p.reference_code,
              stage: item.stage,
              status: 'SKIPPED',
              reason: 'Already sent for this stage/due window',
            });
            continue;
          }

          // Dispatch notification to payer
          await this.notify.send(p.payer_user_id, item.eventCode, {
            title: item.title,
            body: item.body,
            actionUrl: `/dashboard/payments/${p.id}`,
            severity: item.severity,
          });

          // Dispatch management alert if required
          if (item.notifyManagement && managementUserIds.length > 0) {
            await this.notify.sendMany(managementUserIds, 'MANAGEMENT_PAYMENT_ALERT', {
              title: item.managementTitle || item.title,
              body: item.managementBody || item.body,
              actionUrl: `/dashboard/admin/finance`,
              severity: item.severity,
            });
            stats.managementAlertsSent++;
          }

          // Record audit log for deterministic idempotency
          await this.audit.record({
            actor: actor || null,
            action: 'payment.reminder_sent',
            objectType: 'payment',
            objectId: p.id,
            metadata: {
              stage: item.stage,
              eventCode: item.eventCode,
              idempotencyKey,
              dueDate: dueDateRaw,
              daysDiff: diffDays,
              daysOverdue: diffDays < 0 ? -diffDays : 0,
              totalAmount: p.total_amount,
              payerId: p.payer_user_id,
              isEscalation: item.isEscalation,
              notifiedManagement: item.notifyManagement,
              targetDate: todayStr,
              sentAt: new Date().toISOString(),
            },
          });

          if (item.isEscalation) {
            stats.escalationsSent++;
          } else {
            stats.remindersSent++;
          }

          stats.details.push({
            paymentId: p.id,
            referenceCode: p.reference_code,
            stage: item.stage,
            status: 'SENT',
          });
        }
      } catch (err: any) {
        stats.failures++;
        this.logger.error(`Failed to process payment reminder for payment #${p.id}: ${err.message}`);
        stats.details.push({
          paymentId: p.id,
          referenceCode: p.reference_code,
          stage: 'UNKNOWN',
          status: 'FAILED',
          reason: err.message,
        });
      }
    }

    return stats;
  }

  /**
   * Deterministic idempotency checker querying audit_logs.
   */
  private async checkAlreadySent(paymentId: number, stage: string, idempotencyKey: string): Promise<boolean> {
    const existing = await this.db.one<any>(
      `SELECT id FROM audit_logs 
        WHERE action = 'payment.reminder_sent' 
          AND object_type = 'payment' 
          AND object_id = ? 
          AND (
            metadata LIKE ?
            OR metadata LIKE ?
            OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.stage')) = ?
            OR JSON_UNQUOTE(JSON_EXTRACT(metadata, '$.idempotencyKey')) = ?
          )
        LIMIT 1`,
      [paymentId, `%"stage":"${stage}"%`, `%"idempotencyKey":"${idempotencyKey}"%`, stage, idempotencyKey],
    );
    return !!existing;
  }

  /**
   * Retrieve reminder history for a specific payment.
   */
  async getPaymentReminders(paymentId: number) {
    const auditEntries = await this.db.query(
      `SELECT id, action, object_id, metadata, created_at
         FROM audit_logs
        WHERE action = 'payment.reminder_sent' AND object_type = 'payment' AND object_id = ?
        ORDER BY id ASC`,
      [paymentId],
    );

    return auditEntries.map((a: any) => {
      let meta: any = {};
      if (a.metadata) {
        if (typeof a.metadata === 'object') {
          meta = a.metadata;
        } else {
          try {
            meta = JSON.parse(a.metadata);
          } catch {}
        }
      }
      return {
        id: a.id,
        stage: meta.stage,
        eventCode: meta.eventCode,
        idempotencyKey: meta.idempotencyKey,
        dueDate: meta.dueDate,
        daysOverdue: meta.daysOverdue,
        isEscalation: meta.isEscalation,
        notifiedManagement: meta.notifiedManagement,
        sentAt: a.created_at,
      };
    });
  }

  /**
   * Retrieve active payment escalations for Odibrick Management.
   */
  async getPaymentEscalations(filters: { minDaysOverdue?: number; stage?: string; limit?: number; asOfDate?: string }) {
    const minDays = filters.minDaysOverdue ?? 1;
    const asOfParam = filters.asOfDate || null;
    const rows = await this.db.query(
      `SELECT p.id, p.public_id, p.reference_code, p.purpose, p.amount, p.tax_amount, p.total_amount, p.currency,
              p.status, p.settlement_status, p.due_date, p.created_at,
              DATEDIFF(COALESCE(?, CURDATE()), p.due_date) AS days_overdue,
              p.payer_user_id, payer.full_name AS payer_name, payer.email AS payer_email,
              p.payee_user_id, payee.full_name AS payee_name, payee.email AS payee_email,
              p.tenancy_id, t.public_id AS tenancy_public_id, prop.title AS property_title,
              (SELECT a.created_at FROM audit_logs a 
                WHERE a.action = 'payment.reminder_sent' AND a.object_type = 'payment' AND a.object_id = p.id 
                ORDER BY a.id DESC LIMIT 1) AS last_notification_at,
              (SELECT a.metadata FROM audit_logs a 
                WHERE a.action = 'payment.reminder_sent' AND a.object_type = 'payment' AND a.object_id = p.id 
                ORDER BY a.id DESC LIMIT 1) AS last_notification_meta
         FROM payments p
         JOIN users payer ON payer.id = p.payer_user_id
         LEFT JOIN users payee ON payee.id = p.payee_user_id
         LEFT JOIN tenancies t ON t.id = p.tenancy_id
         LEFT JOIN properties prop ON prop.id = p.property_id
        WHERE p.status IN ('DUE', 'INITIATED', 'PROCESSING')
          AND p.due_date < COALESCE(?, CURDATE())
          AND DATEDIFF(COALESCE(?, CURDATE()), p.due_date) >= ?
        ORDER BY p.due_date ASC
        LIMIT ?`,
      [asOfParam, asOfParam, asOfParam, minDays, filters.limit ?? 50],
    );

    return rows.map((r: any) => {
      const days = Number(r.days_overdue);
      let escalationLevel = 'LOW';
      if (days >= 30) escalationLevel = 'CRITICAL';
      else if (days >= 15) escalationLevel = 'HIGH';
      else if (days >= 7) escalationLevel = 'MEDIUM';
      else if (days >= 3) escalationLevel = 'LOW';

      let lastMeta: any = null;
      if (r.last_notification_meta) {
        if (typeof r.last_notification_meta === 'object') {
          lastMeta = r.last_notification_meta;
        } else {
          try {
            lastMeta = JSON.parse(r.last_notification_meta);
          } catch {}
        }
      }

      return {
        id: r.id,
        publicId: r.public_id,
        referenceCode: r.reference_code,
        purpose: r.purpose,
        amount: Number(r.amount),
        taxAmount: Number(r.tax_amount),
        totalAmount: Number(r.total_amount),
        currency: r.currency,
        status: r.status,
        dueDate: r.due_date,
        daysOverdue: days,
        escalationLevel,
        payerId: r.payer_user_id,
        payerName: r.payer_name,
        payerEmail: r.payer_email,
        payeeId: r.payee_user_id,
        payeeName: r.payee_name,
        tenancyId: r.tenancy_id,
        tenancyPublicId: r.tenancy_public_id,
        propertyTitle: r.property_title,
        lastNotificationAt: r.last_notification_at,
        lastStage: lastMeta?.stage ?? null,
      };
    });
  }

  private formatPurpose(purpose: string): string {
    return purpose
      .split('_')
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(' ');
  }
}
