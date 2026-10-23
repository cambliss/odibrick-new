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

  /**
   * Generates recurring monthly rent for active tenancies for a target period (e.g. year: 2026, month: 10).
   * Idempotent: Skips if a MONTHLY_RENT payment already exists for that tenancy & period.
   */
  async generateMonthlyRent(input?: { tenancyId?: number; year?: number; month?: number; req?: Request }) {
    const where: string[] = ["t.stage = 'ACTIVE'"];
    const params: unknown[] = [];
    if (input?.tenancyId) {
      where.push('t.id = ?');
      params.push(input.tenancyId);
    }

    const tenancies = await this.db.query<any>(
      `SELECT t.*, p.title AS property_title, p.locality, p.city,
              a.id AS agreement_id, a.effective_from, a.effective_to,
              v.variables AS agreement_vars
         FROM tenancies t
         JOIN properties p ON p.id = t.property_id
         LEFT JOIN agreements a ON a.id = (
           SELECT a2.id FROM agreements a2
            WHERE a2.tenancy_id = t.id AND a2.status = 'EXECUTED'
            ORDER BY a2.id DESC LIMIT 1
         )
         LEFT JOIN agreement_versions v ON v.agreement_id = a.id AND v.version = a.current_version
        WHERE ${where.join(' AND ')}`,
      params,
    );

    const now = new Date();
    const targetYear = input?.year ?? now.getFullYear();
    const targetMonth = input?.month ?? (now.getMonth() + 1); // 1-12

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthName = monthNames[targetMonth - 1];

    const results: Array<{ tenancyId: number; paymentId?: number; status: 'CREATED' | 'ALREADY_EXISTS' | 'SKIPPED'; message?: string }> = [];

    for (const t of tenancies) {
      let vars: any = {};
      if (t.agreement_vars) {
        vars = typeof t.agreement_vars === 'string' ? JSON.parse(t.agreement_vars) : t.agreement_vars;
      }
      const rentAmount = Number(vars.rent_amount ?? t.rent_amount);
      const rentDueDay = Number(vars.rent_due_day ?? t.rent_due_day ?? 5);

      const lastDayOfMonth = new Date(targetYear, targetMonth, 0).getDate();
      const periodStart = `${targetYear}-${String(targetMonth).padStart(2, '0')}-01`;
      const periodEnd = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
      const dueDate = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(Math.min(rentDueDay, lastDayOfMonth)).padStart(2, '0')}`;
      const periodLabel = `Rent for ${monthName} ${targetYear} (${periodStart} to ${periodEnd})`;

      if (t.end_date && new Date(t.end_date) < new Date(periodStart)) {
        results.push({ tenancyId: t.id, status: 'SKIPPED', message: 'Tenancy ended before period.' });
        continue;
      }
      if (t.effective_to && new Date(t.effective_to) < new Date(periodStart)) {
        results.push({ tenancyId: t.id, status: 'SKIPPED', message: 'Agreement ended before period.' });
        continue;
      }

      // Idempotency: Check if monthly rent already exists for this tenancy and period
      const existing = await this.db.one<any>(
        `SELECT id, status, reference_code FROM payments
          WHERE tenancy_id = ? AND purpose = 'MONTHLY_RENT'
            AND (due_date = ? OR notes LIKE ?) LIMIT 1`,
        [t.id, dueDate, `%${monthName} ${targetYear}%`],
      );

      if (existing) {
        results.push({
          tenancyId: t.id,
          paymentId: existing.id,
          status: 'ALREADY_EXISTS',
          message: `Payment ${existing.reference_code} already exists (${existing.status}).`,
        });
        continue;
      }

      const paymentId = await this.createPayment({
        payerUserId: t.tenant_user_id,
        payeeUserId: t.owner_user_id,
        tenancyId: t.id,
        propertyId: t.property_id,
        purpose: 'MONTHLY_RENT',
        amount: rentAmount,
        dueDate,
        notes: periodLabel,
      });

      if (input?.req && (input.req as any).user) {
        await this.audit.record({
          actor: (input.req as any).user,
          action: 'payment.rent_generated',
          objectType: 'payment',
          objectId: paymentId,
          metadata: { tenancyId: t.id, rentAmount, dueDate, periodLabel },
          req: input.req,
        });
      }

      results.push({
        tenancyId: t.id,
        paymentId,
        status: 'CREATED',
        message: `Created payment for ${periodLabel} with due date ${dueDate}.`,
      });
    }

    return { targetPeriod: `${monthName} ${targetYear}`, count: results.length, results };
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
    const seq = await this.db.nextSequence('PAY');
    const tax = input.taxRate ? Number((input.amount * input.taxRate / 100).toFixed(2)) : 0;
    const id = await this.db.insert('payments', {
      public_id: newPublicId(),
      reference_code: formatReference('PAY', seq),
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

  /** Allows the authenticated payer to submit their payment claim/reference in transfer flow. Awaiting operator confirmation. */
  async settleByPayer(
    user: AuthUser,
    paymentId: number,
    dto: { method?: string; reference?: string },
    req?: Request,
  ) {
    const payment = await this.assertPayer(user, paymentId);
    if (payment.status === 'PAID') throw new BadRequestException('This payment is already settled.');
    if (payment.status === 'PROCESSING') {
      throw new BadRequestException('A payment claim has already been submitted and is currently pending verification.');
    }

    const txnRef = dto.reference ? dto.reference.trim() : `UPI-${randomToken(8).toUpperCase()}`;

    await this.db.transaction(async (conn) => {
      const [locked]: any = await conn.execute(
        'SELECT id, status FROM payments WHERE id = ? FOR UPDATE',
        [paymentId],
      );
      if (locked?.length && locked[0].status === 'PAID') {
        throw new BadRequestException('This payment is already settled.');
      }
      if (locked?.length && locked[0].status === 'PROCESSING') {
        throw new BadRequestException('A payment claim has already been submitted and is currently pending verification.');
      }

      await this.db.insert('payment_transactions', {
        payment_id: payment.id,
        txn_reference: `TXN-${randomToken(8).toUpperCase()}`,
        direction: 'COLLECTION',
        provider: 'manual',
        provider_txn_id: txnRef,
        method: dto.method ?? 'UPI',
        amount: Number(payment.total_amount),
        currency: payment.currency,
        status: 'PENDING',
        idempotency_key: `payer:${payment.id}:${txnRef}`,
      });

      await this.db.update('payments', payment.id, {
        status: 'PROCESSING',
        settlement_status: 'PENDING',
      });
    });

    await this.audit.record({
      actor: user,
      action: 'payment.claim_submitted',
      objectType: 'payment',
      objectId: payment.id,
      metadata: { method: dto.method ?? 'UPI', reference: txnRef },
      req,
    });
    return {
      id: payment.id,
      status: 'PROCESSING',
      referenceCode: payment.reference_code,
      message: 'Payment reference submitted and pending operator confirmation.',
    };
  }

  /** Provider webhook. Signature is verified inside the adapter. */
  async handleCallback(payload: Record<string, unknown>, signature?: string) {
    const verified = await this.provider.verifyCallback(payload, signature);

    const { handled, duplicate, newlyMarked, payment, tenancyTransition, tenancy } = await this.db.transaction(async (conn) => {
      const [txns]: any = await conn.execute(
        'SELECT * FROM payment_transactions WHERE provider_order_id = ? ORDER BY id DESC LIMIT 1 FOR UPDATE',
        [verified.providerOrderId],
      );
      if (!txns.length) {
        return { handled: false, duplicate: false, newlyMarked: false, payment: null, tenancyTransition: null, tenancy: null };
      }
      const txn = txns[0];

      // Idempotency: if transaction is already marked SUCCESS, duplicate callback delivery
      if (txn.status === 'SUCCESS') {
        return { handled: true, duplicate: true, newlyMarked: false, payment: null, tenancyTransition: null, tenancy: null };
      }

      if (verified.providerTxnId) {
        const [dupTxn]: any = await conn.execute(
          'SELECT id FROM payment_transactions WHERE provider_txn_id = ? AND id <> ? LIMIT 1',
          [verified.providerTxnId, txn.id],
        );
        if (dupTxn.length > 0) {
          return { handled: true, duplicate: true, newlyMarked: false, payment: null, tenancyTransition: null, tenancy: null };
        }
      }

      const txnStatus = verified.status === 'SUCCESS' ? 'SUCCESS' : verified.status === 'FAILED' ? 'FAILED' : 'PENDING';

      await conn.execute(
        `UPDATE payment_transactions
            SET provider_txn_id = ?, method = ?, status = ?, failure_code = ?, failure_reason = ?, raw_payload = ?
          WHERE id = ?`,
        [
          verified.providerTxnId ?? null,
          verified.method ?? null,
          txnStatus,
          verified.failureCode ?? null,
          verified.failureReason ?? null,
          verified.raw ? JSON.stringify(verified.raw) : null,
          txn.id,
        ],
      );

      if (verified.status === 'SUCCESS') {
        const res = await this.applyPaymentSuccess(conn, txn.payment_id, 'provider-callback');
        return {
          handled: true,
          duplicate: false,
          newlyMarked: res.newlyMarked,
          payment: res.payment,
          tenancyTransition: res.tenancyTransition,
          tenancy: res.tenancy,
        };
      } else if (verified.status === 'FAILED') {
        await conn.execute(
          `UPDATE payments SET status = 'FAILED' WHERE id = ? AND status <> 'PAID'`,
          [txn.payment_id],
        );
        return { handled: true, duplicate: false, newlyMarked: false, payment: null, tenancyTransition: null, tenancy: null };
      }

      return { handled: true, duplicate: false, newlyMarked: false, payment: null, tenancyTransition: null, tenancy: null };
    });

    if (!handled) {
      this.logger.warn(`Callback for unknown order ${verified.providerOrderId}`);
      return { handled: false };
    }
    if (duplicate) {
      return { handled: true, duplicate: true };
    }
    if (newlyMarked && payment) {
      await this.dispatchPaymentNotifications(payment, tenancyTransition, tenancy);
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
    if (!dto.bankReference || !dto.bankReference.trim()) {
      throw new BadRequestException('Enter the bank or UPI reference for this credit.');
    }
    const bankRef = dto.bankReference.trim();

    const { newlyMarked, tenancyTransition, tenancy } = await this.db.transaction(async (conn) => {
      const [payments]: any = await conn.execute(
        'SELECT * FROM payments WHERE id = ? FOR UPDATE',
        [paymentId],
      );
      if (payments?.length && payments[0].status === 'PAID') {
        throw new BadRequestException('This payment is already recorded as settled.');
      }

      const idemKey = `manual:${paymentId}:${bankRef}`;
      const [existingTxn]: any = await conn.execute(
        'SELECT id FROM payment_transactions WHERE idempotency_key = ? LIMIT 1',
        [idemKey],
      );
      if (existingTxn?.length > 0) {
        throw new BadRequestException('A transaction with this bank reference has already been recorded for this payment.');
      }

      const txnReference = `TXN-${randomToken(8).toUpperCase()}`;
      await conn.execute(
        `INSERT INTO payment_transactions
          (payment_id, txn_reference, direction, provider, provider_txn_id, method, amount, currency, status, idempotency_key)
         VALUES (?, ?, 'COLLECTION', 'manual', ?, ?, ?, ?, 'SUCCESS', ?)`,
        [
          paymentId,
          txnReference,
          bankRef,
          dto.method ?? 'NEFT',
          dto.amount ?? Number(payment.total_amount),
          payment.currency,
          idemKey,
        ],
      );

      const res = await this.applyPaymentSuccess(conn, paymentId, `recorded-by:${user.id}`);
      return res;
    });

    if (newlyMarked) {
      await this.dispatchPaymentNotifications(payment, tenancyTransition, tenancy);
    }

    await this.audit.record({
      actor: user,
      action: 'payment.recorded_offline',
      objectType: 'payment',
      objectId: paymentId,
      metadata: { bankReference: bankRef },
      req,
    });
    return { id: paymentId, status: 'PAID' };
  }

  private async markPaid(paymentId: number, source: string) {
    const res = await this.db.transaction(async (conn) => {
      return this.applyPaymentSuccess(conn, paymentId, source);
    });
    if (res.newlyMarked && res.payment) {
      await this.dispatchPaymentNotifications(res.payment, res.tenancyTransition, res.tenancy);
    }
  }

  private async applyPaymentSuccess(
    conn: any,
    paymentId: number,
    source: string,
  ): Promise<{ payment: any; newlyMarked: boolean; tenancyTransition: 'CHECK_IN' | 'CLOSED' | null; tenancy: any }> {
    const [payments]: any = await conn.execute(
      'SELECT * FROM payments WHERE id = ? FOR UPDATE',
      [paymentId],
    );
    if (!payments.length) {
      return { payment: null, newlyMarked: false, tenancyTransition: null, tenancy: null };
    }
    const payment = payments[0];
    if (payment.status === 'PAID') {
      return { payment, newlyMarked: false, tenancyTransition: null, tenancy: null };
    }

    const settledAt = this.provider.custodial ? null : new Date();
    const settlementStatus = this.provider.custodial ? 'PENDING' : 'SETTLED';

    await conn.execute(
      `UPDATE payments SET status = 'PAID', paid_at = NOW(), settlement_status = ?, settled_at = ? WHERE id = ?`,
      [settlementStatus, settledAt, paymentId],
    );

    // Synchronize linked Commercial Obligations
    await conn.execute(
      `UPDATE commercial_obligations SET status = 'PAID' WHERE payment_id = ? AND status != 'PAID'`,
      [paymentId],
    );

    // Activate linked Listing Promotions upon payment settlement
    const [promos]: any = await conn.execute(
      `SELECT lp.*, mp.duration_days
         FROM listing_promotions lp
         LEFT JOIN marketing_packages mp ON mp.id = lp.package_id
        WHERE lp.payment_id = ? AND lp.status = 'PENDING_PAYMENT'`,
      [paymentId],
    );
    if (promos.length > 0) {
      const promo = promos[0];
      const durationDays = Number(promo.duration_days || 30);
      const startsAt = new Date();
      const endsAt = new Date(Date.now() + durationDays * 86400000);
      await conn.execute(
        `UPDATE listing_promotions SET status = 'ACTIVE', starts_at = ?, ends_at = ? WHERE id = ?`,
        [startsAt, endsAt, promo.id],
      );
      await conn.execute(
        `UPDATE properties SET is_featured = 1, visibility_tier = ?, featured_until = ?, promoted_until = ? WHERE id = ?`,
        [promo.visibility_tier || 'FEATURED', endsAt, endsAt, promo.listing_id],
      );
    }

    let tenancyTransition: 'CHECK_IN' | 'CLOSED' | null = null;
    let tenancyRow: any = null;

    if (payment.tenancy_id) {
      const [tenancies]: any = await conn.execute(
        'SELECT * FROM tenancies WHERE id = ? FOR UPDATE',
        [payment.tenancy_id],
      );
      if (tenancies.length > 0) {
        tenancyRow = tenancies[0];
        if (tenancyRow.stage === 'AWAITING_PAYMENT') {
          const [outstanding]: any = await conn.execute(
            `SELECT COUNT(*) AS c FROM payments
              WHERE tenancy_id = ? AND purpose IN ('SECURITY_DEPOSIT','ADVANCE_RENT') AND status <> 'PAID' AND id <> ?`,
            [payment.tenancy_id, paymentId],
          );
          if ((outstanding[0]?.c ?? 0) === 0) {
            await conn.execute(`UPDATE tenancies SET stage = 'CHECK_IN_PENDING' WHERE id = ?`, [payment.tenancy_id]);
            await conn.execute(
              `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title)
               VALUES (?, ?, 'PAYMENT_COMPLETED', 'Move-in payments completed')`,
              [tenancyRow.property_id, payment.tenancy_id],
            );
            tenancyTransition = 'CHECK_IN';
          }
        } else if (tenancyRow.stage === 'MOVE_OUT' && payment.purpose === 'REFUND') {
          const [openRefunds]: any = await conn.execute(
            `SELECT COUNT(*) AS c FROM payments
              WHERE tenancy_id = ? AND purpose = 'REFUND' AND status <> 'PAID' AND id <> ?`,
            [payment.tenancy_id, paymentId],
          );
          if ((openRefunds[0]?.c ?? 0) === 0) {
            await conn.execute(`UPDATE tenancies SET stage = 'CLOSED', closed_at = NOW() WHERE id = ?`, [payment.tenancy_id]);
            await conn.execute(
              `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, actor_id)
               VALUES (?, ?, 'TENANCY_CLOSED', 'Tenancy closed', ?, ?)`,
              [
                tenancyRow.property_id,
                payment.tenancy_id,
                `Security deposit refund of INR ${Number(payment.total_amount).toLocaleString('en-IN')} settled. Tenancy closed.`,
                payment.payer_user_id,
              ],
            );
            tenancyTransition = 'CLOSED';
          }
        }
      }
    }

    this.logger.log(`Payment ${payment.reference_code} marked PAID (${source})`);
    return { payment, newlyMarked: true, tenancyTransition, tenancy: tenancyRow };
  }

  private async dispatchPaymentNotifications(
    payment: any,
    tenancyTransition: 'CHECK_IN' | 'CLOSED' | null,
    tenancy: any,
  ) {
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

    if (tenancyTransition === 'CHECK_IN' && tenancy) {
      await this.notify.send(tenancy.tenant_user_id, 'CHECK_IN_PENDING', {
        title: 'Document your home',
        body: 'Record the Day 1 condition report as soon as you take possession. It protects your deposit.',
        actionUrl: '/dashboard/condition-report',
        severity: 'ACTION',
      });
    } else if (tenancyTransition === 'CLOSED' && tenancy) {
      await this.notify.send(payment.payee_user_id, 'PAYMENT_RECEIVED', {
        title: 'Security deposit refund settled',
        body: `Security deposit refund of INR ${Number(payment.total_amount).toLocaleString('en-IN')} has been recorded.`,
        actionUrl: '/dashboard/payments',
      });

      await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'PAYMENT_RECEIVED', {
        title: 'Tenancy closed',
        body: 'Tenancy closed. Final settlement complete.',
        actionUrl: `/dashboard/tenancy/${tenancy.id}`,
      });

      await this.audit.record({
        actor: {
          id: payment.payer_user_id,
          publicId: '',
          fullName: 'Owner',
          email: '',
          roles: ['OWNER'],
          permissions: [],
        },
        action: 'deposit.refund_paid',
        objectType: 'payment',
        objectId: payment.id,
        metadata: { tenancyId: tenancy.id, refundAmount: Number(payment.total_amount) },
      });

      await this.audit.record({
        actor: {
          id: payment.payer_user_id,
          publicId: '',
          fullName: 'Owner',
          email: '',
          roles: ['OWNER'],
          permissions: [],
        },
        action: 'tenancy.closed',
        objectType: 'tenancy',
        objectId: tenancy.id,
        metadata: { paymentId: payment.id, refundAmount: Number(payment.total_amount) },
      });
    }
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
              pay.payer_user_id, pay.payee_user_id, pay.notes, pay.tenancy_id,
              p.title AS property_title, p.slug,
              payer.full_name AS payer_name, payee.full_name AS payee_name,
              (SELECT pt.provider_txn_id FROM payment_transactions pt
                WHERE pt.payment_id = pay.id AND pt.status = 'SUCCESS' ORDER BY pt.id DESC LIMIT 1) AS reference
         FROM payments pay
         LEFT JOIN properties p ON p.id = pay.property_id
         LEFT JOIN users payer ON payer.id = pay.payer_user_id
         LEFT JOIN users payee ON payee.id = pay.payee_user_id
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
    if (!isParty && !user.permissions.includes('payment.manage')) {
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
