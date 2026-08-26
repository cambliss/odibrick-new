import {
  BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { formatReference, newPublicId } from '../../common/util/ids';
import { randomToken } from '../../common/util/crypto';
import { pageParams, paginate } from '../../common/util/pagination';
import { PAYMENT_PROVIDER } from './payments.tokens';
import { PaymentProvider } from './providers/payment-provider.interface';
import { RecordPaymentDto, RefundDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // ------------------------------------------------------------- creation
  /** Called when an agreement is executed: deposit + first month + service fee. */
  async raiseMoveInDues(tenancy: any): Promise<void> {
    const existing = await this.db.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM payments WHERE tenancy_id = ? AND purpose IN ('SECURITY_DEPOSIT','ADVANCE_RENT')",
      [tenancy.id],
    );
    if ((existing?.c ?? 0) > 0) return;

    const dueDate = tenancy.start_date ?? new Date().toISOString().slice(0, 10);

    if (Number(tenancy.deposit_amount) > 0) {
      await this.createPayment({
        payerUserId: tenancy.tenant_user_id,
        payeeUserId: tenancy.owner_user_id,
        tenancyId: tenancy.id,
        propertyId: tenancy.property_id,
        purpose: 'SECURITY_DEPOSIT',
        amount: Number(tenancy.deposit_amount),
        dueDate,
      });
    }
    await this.createPayment({
      payerUserId: tenancy.tenant_user_id,
      payeeUserId: tenancy.owner_user_id,
      tenancyId: tenancy.id,
      propertyId: tenancy.property_id,
      purpose: 'ADVANCE_RENT',
      amount: Number(tenancy.rent_amount),
      dueDate,
    });

    await this.scheduleAnnualCommission(tenancy);
  }

  async createPayment(input: {
    payerUserId: number;
    payeeUserId?: number | null;
    tenancyId?: number | null;
    propertyId?: number | null;
    purpose: string;
    amount: number;
    taxRate?: number;
    dueDate?: string;
    notes?: string;
  }): Promise<number> {
    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM payments');
    const tax = input.taxRate ? Number((input.amount * input.taxRate / 100).toFixed(2)) : 0;
    const id = await this.db.insert('payments', {
      public_id: newPublicId(),
      reference_code: formatReference('PAY', (seq?.c ?? 0) + 1),
      payer_user_id: input.payerUserId,
      payee_user_id: input.payeeUserId ?? null,
      tenancy_id: input.tenancyId ?? null,
      property_id: input.propertyId ?? null,
      purpose: input.purpose,
      amount: input.amount,
      tax_amount: tax,
      total_amount: Number((input.amount + tax).toFixed(2)),
      status: 'DUE',
      settlement_mode: this.provider.custodial ? 'PLATFORM_COLLECT_AND_PAYOUT' : 'DIRECT_TO_PAYEE',
      due_date: input.dueDate ?? null,
      notes: input.notes ?? null,
    });

    await this.notify.send(input.payerUserId, 'PAYMENT_DUE', {
      title: 'Payment due',
      body: `${this.label(input.purpose)} of INR ${(input.amount + tax).toLocaleString('en-IN')} is due.`,
      actionUrl: '/dashboard/payments',
      severity: 'ACTION',
    });
    return id;
  }

  // ------------------------------------------------------------- checkout
  async startCheckout(user: AuthUser, paymentId: number) {
    const payment = await this.assertPayer(user, paymentId);
    if (payment.status === 'PAID') throw new BadRequestException('This payment is already settled.');

    const order = await this.provider.createOrder({
      referenceCode: payment.reference_code,
      amount: Number(payment.total_amount),
      currency: payment.currency,
      purpose: payment.purpose,
      payerEmail: user.email,
    });

    await this.db.insert('payment_transactions', {
      payment_id: payment.id,
      txn_reference: `TXN-${randomToken(8).toUpperCase()}`,
      direction: 'COLLECTION',
      provider: this.provider.key,
      provider_order_id: order.providerOrderId,
      amount: Number(payment.total_amount),
      currency: payment.currency,
      status: 'CREATED',
      idempotency_key: `order:${payment.id}:${order.providerOrderId}`,
    });
    await this.db.update('payments', payment.id, { status: 'INITIATED' });

    return {
      referenceCode: payment.reference_code,
      amount: Number(payment.total_amount),
      currency: payment.currency,
      provider: this.provider.key,
      custodial: this.provider.custodial,
      checkout: order.checkoutPayload,
      instructions: order.instructions,
    };
  }

  /** Provider webhook. Signature is verified inside the adapter. */
  async handleCallback(payload: Record<string, unknown>, signature?: string) {
    const verified = await this.provider.verifyCallback(payload, signature);
    const txn = await this.db.one<any>(
      'SELECT * FROM payment_transactions WHERE provider_order_id = ? ORDER BY id DESC LIMIT 1',
      [verified.providerOrderId],
    );
    if (!txn) {
      this.logger.warn(`Callback for unknown order ${verified.providerOrderId}`);
      return { handled: false };
    }

    const duplicate = await this.db.one<any>(
      'SELECT id FROM payment_transactions WHERE provider_txn_id = ? LIMIT 1', [verified.providerTxnId],
    );
    if (duplicate) return { handled: true, duplicate: true };

    await this.db.update('payment_transactions', txn.id, {
      provider_txn_id: verified.providerTxnId,
      method: verified.method ?? null,
      status: verified.status === 'SUCCESS' ? 'SUCCESS' : verified.status === 'FAILED' ? 'FAILED' : 'PENDING',
      failure_code: verified.failureCode ?? null,
      failure_reason: verified.failureReason ?? null,
      raw_payload: verified.raw ? JSON.stringify(verified.raw) : null,
    });

    if (verified.status === 'SUCCESS') {
      await this.markPaid(txn.payment_id, 'provider-callback');
    } else if (verified.status === 'FAILED') {
      await this.db.update('payments', txn.payment_id, { status: 'FAILED' });
    }
    return { handled: true };
  }

  /**
   * Operator confirmation for off-platform transfers. Requires payment.manage
   * and a bank reference, and is written to the audit log with the actor.
   */
  async recordOfflinePayment(user: AuthUser, paymentId: number, dto: RecordPaymentDto, req?: Request) {
    const payment = await this.db.one<any>('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!payment) throw new NotFoundException('Payment not found.');
    if (payment.status === 'PAID') throw new BadRequestException('This payment is already recorded as settled.');
    if (!dto.bankReference) throw new BadRequestException('Enter the bank or UPI reference for this credit.');

    await this.db.insert('payment_transactions', {
      payment_id: paymentId,
      txn_reference: `TXN-${randomToken(8).toUpperCase()}`,
      direction: 'COLLECTION',
      provider: 'manual',
      provider_txn_id: dto.bankReference,
      method: dto.method ?? 'NEFT',
      amount: dto.amount ?? Number(payment.total_amount),
      currency: payment.currency,
      status: 'SUCCESS',
      idempotency_key: `manual:${paymentId}:${dto.bankReference}`,
    });
    await this.markPaid(paymentId, `recorded-by:${user.id}`);
    await this.audit.record({
      actor: user, action: 'payment.recorded_offline', objectType: 'payment', objectId: paymentId,
      metadata: { bankReference: dto.bankReference }, req,
    });
    return { id: paymentId, status: 'PAID' };
  }

  private async markPaid(paymentId: number, source: string) {
    const payment = await this.db.one<any>('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!payment) return;

    await this.db.update('payments', paymentId, {
      status: 'PAID',
      paid_at: new Date(),
      settlement_status: this.provider.custodial ? 'PENDING' : 'SETTLED',
      settled_at: this.provider.custodial ? null : new Date(),
    });

    if (payment.payee_user_id) {
      await this.notify.send(payment.payee_user_id, 'PAYMENT_RECEIVED', {
        title: 'Payment received',
        body: `${this.label(payment.purpose)} of INR ${Number(payment.total_amount).toLocaleString('en-IN')} was received.`,
        actionUrl: '/dashboard/payments',
      });
    }
    await this.notify.send(payment.payer_user_id, 'PAYMENT_RECEIVED', {
      title: 'Payment recorded',
      body: 'Your receipt is available in your document vault.',
      actionUrl: '/dashboard/payments',
    });

    if (payment.tenancy_id) {
      await this.advanceTenancyAfterPayment(payment.tenancy_id);
    }
    this.logger.log(`Payment ${payment.reference_code} marked PAID (${source})`);
  }

  /** Once move-in dues clear, the tenancy moves to check-in documentation. */
  private async advanceTenancyAfterPayment(tenancyId: number) {
    const outstanding = await this.db.one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM payments
        WHERE tenancy_id = ? AND purpose IN ('SECURITY_DEPOSIT','ADVANCE_RENT') AND status <> 'PAID'`,
      [tenancyId],
    );
    if ((outstanding?.c ?? 0) > 0) return;

    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    if (!tenancy || tenancy.stage !== 'AWAITING_PAYMENT') return;

    await this.db.update('tenancies', tenancyId, { stage: 'CHECK_IN_PENDING' });
    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancyId,
      event_code: 'PAYMENT_COMPLETED',
      title: 'Move-in payments completed',
    });
    await this.notify.send(tenancy.tenant_user_id, 'CHECK_IN_PENDING', {
      title: 'Document your home',
      body: 'Record the Day 1 condition report as soon as you take possession. It protects your deposit.',
      actionUrl: '/dashboard/condition-report',
      severity: 'ACTION',
    });
  }

  // ------------------------------------------------------------- listings
  async myPayments(user: AuthUser, role: 'PAYER' | 'PAYEE' | 'ALL' = 'ALL', status?: string, page?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, 25);
    const where: string[] = [];
    const params: unknown[] = [];
    if (role === 'PAYER') {
      where.push('pay.payer_user_id = ?');
      params.push(user.id);
    } else if (role === 'PAYEE') {
      where.push('pay.payee_user_id = ?');
      params.push(user.id);
    } else {
      where.push('(pay.payer_user_id = ? OR pay.payee_user_id = ?)');
      params.push(user.id, user.id);
    }
    if (status) {
      where.push('pay.status = ?');
      params.push(status);
    }
    const clause = where.join(' AND ');
    const rows = await this.db.query(
      `SELECT pay.id, pay.reference_code, pay.purpose, pay.amount, pay.tax_amount, pay.total_amount,
              pay.currency, pay.status, pay.settlement_status, pay.due_date, pay.paid_at,
              pay.payer_user_id, pay.payee_user_id,
              p.title AS property_title, p.slug,
              (SELECT pt.provider_txn_id FROM payment_transactions pt
                WHERE pt.payment_id = pay.id AND pt.status = 'SUCCESS' ORDER BY pt.id DESC LIMIT 1) AS reference
         FROM payments pay
         LEFT JOIN properties p ON p.id = pay.property_id
        WHERE ${clause}
        ORDER BY FIELD(pay.status,'DUE','FAILED','INITIATED','PROCESSING','PAID'), pay.due_date ASC, pay.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM payments pay WHERE ${clause}`, params,
    );
    return paginate(rows.map((r: any) => ({ ...r, direction: r.payer_user_id === user.id ? 'OUT' : 'IN' })), total?.total ?? 0, p, pp);
  }

  async ledger(paymentId: number, user: AuthUser) {
    const payment = await this.db.one<any>('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!payment) throw new NotFoundException('Payment not found.');
    const isParty = [payment.payer_user_id, payment.payee_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('payment.read')) {
      throw new ForbiddenException('This payment belongs to other parties.');
    }
    const transactions = await this.db.query(
      `SELECT id, txn_reference, direction, provider, provider_txn_id, method, amount, status,
              failure_reason, occurred_at
         FROM payment_transactions WHERE payment_id = ? ORDER BY occurred_at`,
      [paymentId],
    );
    return { payment, transactions };
  }

  async refund(user: AuthUser, paymentId: number, dto: RefundDto, req?: Request) {
    const payment = await this.db.one<any>('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!payment) throw new NotFoundException('Payment not found.');
    if (payment.status !== 'PAID') throw new BadRequestException('Only a settled payment can be refunded.');

    const amount = dto.amount ?? Number(payment.total_amount);
    const original = await this.db.one<any>(
      "SELECT provider_txn_id FROM payment_transactions WHERE payment_id = ? AND status = 'SUCCESS' ORDER BY id DESC LIMIT 1",
      [paymentId],
    );

    let providerTxnId = dto.bankReference ?? null;
    let status: 'SUCCESS' | 'PENDING' = 'PENDING';
    if (this.provider.custodial && original?.provider_txn_id) {
      const result = await this.provider.refund({ providerTxnId: original.provider_txn_id, amount, reason: dto.reason });
      providerTxnId = result.providerTxnId;
      status = result.status === 'SUCCESS' ? 'SUCCESS' : 'PENDING';
    } else if (!dto.bankReference) {
      throw new BadRequestException('Enter the bank reference used to send the refund.');
    } else {
      status = 'SUCCESS';
    }

    await this.db.insert('payment_transactions', {
      payment_id: paymentId,
      txn_reference: `RFD-${randomToken(8).toUpperCase()}`,
      direction: 'REFUND',
      provider: this.provider.key,
      provider_txn_id: providerTxnId,
      amount,
      currency: payment.currency,
      status: status === 'SUCCESS' ? 'SUCCESS' : 'PENDING',
    });
    await this.db.update('payments', paymentId, {
      status: amount >= Number(payment.total_amount) ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
    });
    await this.audit.record({
      actor: user, action: 'payment.refunded', objectType: 'payment', objectId: paymentId,
      metadata: { amount, reason: dto.reason }, req,
    });
    return { id: paymentId, refunded: amount, status };
  }

  // ---------------------------------------------------------- commissions
  /** Annual model: one commission row per tenancy year, generated on execution. */
  async scheduleAnnualCommission(tenancy: any) {
    const rule = await this.db.one<any>(
      `SELECT * FROM commission_rules
        WHERE applies_to = ? AND is_active = 1 AND effective_from <= CURDATE()
          AND (effective_to IS NULL OR effective_to >= CURDATE())
          AND (city IS NULL OR city = (SELECT city FROM properties WHERE id = ?))
        ORDER BY city IS NULL, effective_from DESC LIMIT 1`,
      [tenancy.service_plan ?? 'STANDARD', tenancy.property_id],
    );
    if (!rule) return;

    const monthlyRent = Number(tenancy.rent_amount);
    let base = monthlyRent;
    let commission = 0;
    switch (rule.basis) {
      case 'PERCENT_OF_MONTHLY_RENT':
        commission = (monthlyRent * Number(rule.percent_value)) / 100;
        break;
      case 'PERCENT_OF_ANNUAL_RENT':
        base = monthlyRent * 12;
        commission = (base * Number(rule.percent_value)) / 100;
        break;
      case 'FLAT_ANNUAL':
        commission = Number(rule.flat_value);
        break;
      default:
        commission = (monthlyRent * Number(rule.percent_value ?? 0)) / 100;
    }
    if (rule.min_amount) commission = Math.max(commission, Number(rule.min_amount));
    if (rule.max_amount) commission = Math.min(commission, Number(rule.max_amount));

    const tax = (commission * Number(rule.tax_rate)) / 100;
    const start = tenancy.start_date ? new Date(tenancy.start_date) : new Date();
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);

    await this.db.execute(
      `INSERT IGNORE INTO commissions (tenancy_id, rule_id, cycle_year, period_start, period_end,
        base_amount, commission_amount, tax_amount, total_amount, payer, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED')`,
      [
        tenancy.id, rule.id, start.getFullYear(),
        start.toISOString().slice(0, 10), end.toISOString().slice(0, 10),
        base.toFixed(2), commission.toFixed(2), tax.toFixed(2), (commission + tax).toFixed(2), rule.payer,
      ],
    );
    await this.db.update('tenancies', tenancy.id, { renewal_due_on: end.toISOString().slice(0, 10) });
  }

  async invoiceCommission(user: AuthUser, commissionId: number) {
    const commission = await this.db.one<any>(
      `SELECT c.*, t.owner_user_id, t.tenant_user_id, t.property_id FROM commissions c
         JOIN tenancies t ON t.id = c.tenancy_id WHERE c.id = ?`,
      [commissionId],
    );
    if (!commission) throw new NotFoundException('Commission not found.');
    if (commission.status !== 'SCHEDULED') throw new BadRequestException('This cycle is already invoiced.');

    const payerId = commission.payer === 'TENANT' ? commission.tenant_user_id : commission.owner_user_id;
    const paymentId = await this.createPayment({
      payerUserId: payerId,
      payeeUserId: null,
      tenancyId: commission.tenancy_id,
      propertyId: commission.property_id,
      purpose: 'COMMISSION',
      amount: Number(commission.commission_amount),
      taxRate: (Number(commission.tax_amount) / Number(commission.commission_amount)) * 100,
      dueDate: commission.period_start,
    });
    await this.db.update('commissions', commissionId, { status: 'INVOICED', payment_id: paymentId });
    await this.audit.record({ actor: user, action: 'commission.invoiced', objectType: 'commission', objectId: commissionId });
    return { id: commissionId, paymentId, status: 'INVOICED' };
  }

  async commissionList(status?: string, page?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, 25);
    const where = status ? 'WHERE c.status = ?' : '';
    const params = status ? [status] : [];
    const rows = await this.db.query(
      `SELECT c.id, c.cycle_year, c.period_start, c.period_end, c.base_amount, c.commission_amount,
              c.tax_amount, c.total_amount, c.payer, c.status, c.grace_until,
              cr.name AS rule_name, t.id AS tenancy_id, t.service_plan,
              p.title AS property_title, p.city, own.full_name AS owner_name
         FROM commissions c
         JOIN tenancies t ON t.id = c.tenancy_id
         JOIN properties p ON p.id = t.property_id
         JOIN users own ON own.id = t.owner_user_id
         LEFT JOIN commission_rules cr ON cr.id = c.rule_id
         ${where}
        ORDER BY c.period_end ASC LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM commissions c ${where}`, params,
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  // ------------------------------------------------------------ internals
  private async assertPayer(user: AuthUser, paymentId: number) {
    const payment = await this.db.one<any>('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!payment) throw new NotFoundException('Payment not found.');
    if (payment.payer_user_id !== user.id) throw new ForbiddenException('This payment is addressed to another account.');
    return payment;
  }

  private label(purpose: string): string {
    return purpose
      .toLowerCase()
      .split('_')
      .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ');
  }
}
