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
  /** Called when an agreement is signed: deposit + first month + Odibrick fee invoice. */
  async raiseMoveInDues(tenancy: any): Promise<void> {
    const existing = await this.db.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM payments WHERE tenancy_id = ? AND purpose IN ('SECURITY_DEPOSIT','ADVANCE_RENT','SERVICE_FEE','COMMISSION')",
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

    await this.raiseOdibrickFeeInvoice(tenancy, dueDate);
  }

  /**
   * Generates a traceable GST invoice and payment obligation for the Odibrick service fee.
   * Idempotent: Skips if a fee payment or invoice already exists for the tenancy.
   */
  async raiseOdibrickFeeInvoice(tenancy: any, dueDate?: string): Promise<number | null> {
    const existingFee = await this.db.one<any>(
      "SELECT id, status, invoice_id FROM payments WHERE tenancy_id = ? AND purpose IN ('SERVICE_FEE','COMMISSION') LIMIT 1",
      [tenancy.id],
    );
    if (existingFee) return existingFee.id;

    const rule = await this.db.one<any>(
      `SELECT * FROM commission_rules
        WHERE applies_to = ? AND is_active = 1 AND effective_from <= CURDATE()
          AND (effective_to IS NULL OR effective_to >= CURDATE())
          AND (city IS NULL OR city = (SELECT city FROM properties WHERE id = ?))
        ORDER BY city IS NULL, effective_from DESC LIMIT 1`,
      [tenancy.service_plan ?? 'STANDARD', tenancy.property_id],
    );

    const monthlyRent = Number(tenancy.rent_amount);
    let base = monthlyRent;
    let fee = 0;
    const taxRate = rule ? Number(rule.tax_rate ?? 18) : 18;

    if (rule) {
      switch (rule.basis) {
        case 'PERCENT_OF_MONTHLY_RENT':
          fee = (monthlyRent * Number(rule.percent_value)) / 100;
          break;
        case 'PERCENT_OF_ANNUAL_RENT':
          base = monthlyRent * 12;
          fee = (base * Number(rule.percent_value)) / 100;
          break;
        case 'FLAT_ANNUAL':
          fee = Number(rule.flat_value);
          break;
        default:
          fee = (monthlyRent * Number(rule.percent_value ?? 0)) / 100;
      }
      if (rule.min_amount) fee = Math.max(fee, Number(rule.min_amount));
      if (rule.max_amount) fee = Math.min(fee, Number(rule.max_amount));
    } else {
      fee = monthlyRent * 0.5; // Standard default 50%
    }

    fee = Number(fee.toFixed(2));
    const taxAmount = Number(((fee * taxRate) / 100).toFixed(2));
    const totalAmount = Number((fee + taxAmount).toFixed(2));
    const payerUserId = rule?.payer === 'TENANT' ? tenancy.tenant_user_id : tenancy.owner_user_id;
    const due = dueDate ?? tenancy.start_date ?? new Date().toISOString().slice(0, 10);

    // 1. Create payment obligation for Odibrick service fee
    const paymentId = await this.createPayment({
      payerUserId,
      payeeUserId: null, // Odibrick platform collect
      tenancyId: tenancy.id,
      propertyId: tenancy.property_id,
      purpose: 'SERVICE_FEE',
      amount: fee,
      taxRate,
      dueDate: due,
      notes: `Odibrick Service Fee (${tenancy.service_plan ?? 'STANDARD'} plan)`,
    });

    // 2. Create traceable GST tax invoice in invoices table
    const invSeq = await this.db.nextSequence('INV');
    const invoiceNumber = `ODB-INV-${new Date().getFullYear()}-${String(invSeq).padStart(6, '0')}`;
    const payerUser = await this.db.one<any>('SELECT full_name, email FROM users WHERE id = ?', [payerUserId]);
    const property = await this.db.one<any>(
      'SELECT address_line1, locality, city, state, pincode FROM properties WHERE id = ?',
      [tenancy.property_id],
    );
    const billingName = payerUser?.full_name || 'Odibrick Client';
    const billingAddress = [
      property?.address_line1,
      property?.locality,
      property?.city,
      property?.state,
      property?.pincode,
    ].filter(Boolean).join(', ') || 'Bengaluru, Karnataka';
    const state = property?.state || 'Karnataka';
    const isIntraState = state.toLowerCase().includes('karnataka');
    const cgst = isIntraState ? Number((taxAmount / 2).toFixed(2)) : 0;
    const sgst = isIntraState ? Number((taxAmount - cgst).toFixed(2)) : 0;
    const igst = isIntraState ? 0 : taxAmount;

    const invoiceId = await this.db.insert('invoices', {
      invoice_number: invoiceNumber,
      user_id: payerUserId,
      tenancy_id: tenancy.id,
      payment_id: paymentId,
      billing_name: billingName,
      billing_address: billingAddress,
      place_of_supply: state,
      subtotal: fee,
      cgst,
      sgst,
      igst,
      total: totalAmount,
      status: 'ISSUED',
      issued_on: new Date(),
    });

    await this.db.execute(
      `INSERT INTO invoice_lines (invoice_id, description, hsn_sac, quantity, unit_price, tax_rate, line_total)
       VALUES (?, ?, '997212', 1, ?, ?, ?)`,
      [invoiceId, `Odibrick Service Fee (${tenancy.service_plan ?? 'STANDARD'} plan)`, fee, taxRate, fee],
    );

    await this.db.update('payments', paymentId, { invoice_id: invoiceId });

    // 3. Link commissions table record
    const start = tenancy.start_date ? new Date(tenancy.start_date) : new Date();
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1);
    end.setDate(end.getDate() - 1);

    await this.db.execute(
      `INSERT INTO commissions (tenancy_id, rule_id, cycle_year, period_start, period_end,
        base_amount, commission_amount, tax_amount, total_amount, payer, status, payment_id, invoice_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'INVOICED', ?, ?)
       ON DUPLICATE KEY UPDATE payment_id = VALUES(payment_id), invoice_id = VALUES(invoice_id), status = 'INVOICED'`,
      [
        tenancy.id, rule?.id ?? null, start.getFullYear(),
        start.toISOString().slice(0, 10), end.toISOString().slice(0, 10),
        base.toFixed(2), fee.toFixed(2), taxAmount.toFixed(2), totalAmount.toFixed(2),
        rule?.payer ?? 'OWNER', paymentId, invoiceId,
      ],
    );
    await this.db.update('tenancies', tenancy.id, { renewal_due_on: end.toISOString().slice(0, 10) });

    await this.audit.record({
      actor: { id: payerUserId, publicId: '', fullName: billingName, email: payerUser?.email || '', roles: [], permissions: [] },
      action: 'invoice.service_fee_issued',
      objectType: 'invoice',
      objectId: invoiceId,
      metadata: { tenancyId: tenancy.id, paymentId, totalAmount, invoiceNumber },
    });

    return paymentId;
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
      try {
        await this.dispatchPaymentNotifications(payment, tenancyTransition, tenancy);
      } catch (err: any) {
        this.logger.error(
          `Post-commit payment notification delivery failed for payment #${payment.id} (${payment.reference_code}): ${err?.message}`,
          err?.stack,
        );
      }
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
      // 1. If tenancy-linked, lock root tenancy row FIRST to enforce uniform lock hierarchy
      let preLockedTenancy: any = null;
      if (payment.tenancy_id) {
        const [tRows]: any = await conn.execute(
          'SELECT * FROM tenancies WHERE id = ? FOR UPDATE',
          [payment.tenancy_id],
        );
        preLockedTenancy = tRows[0] ?? null;
      }

      // 2. Lock the payment row SECOND
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

      const res = await this.applyPaymentSuccess(conn, paymentId, `recorded-by:${user.id}`, preLockedTenancy);
      return res;
    });

    let notificationError: string | null = null;
    if (newlyMarked) {
      try {
        await this.dispatchPaymentNotifications(payment, tenancyTransition, tenancy);
      } catch (err: any) {
        notificationError = err?.message || 'Notification service error';
        this.logger.error(
          `Post-commit payment notification delivery failed for payment #${paymentId} (${payment.reference_code}): ${notificationError}`,
          err?.stack,
        );
      }
    }

    await this.audit.record({
      actor: user,
      action: 'payment.recorded_offline',
      objectType: 'payment',
      objectId: paymentId,
      metadata: {
        bankReference: bankRef,
        notificationsDelivered: newlyMarked ? notificationError === null : false,
        ...(notificationError ? { notificationError } : {}),
      },
      req,
    });
    return {
      id: paymentId,
      status: 'PAID',
      ...(notificationError ? { notificationWarning: 'Payment recorded, but party notification delivery failed.' } : {}),
    };
  }

  private async markPaid(paymentId: number, source: string) {
    const res = await this.db.transaction(async (conn) => {
      return this.applyPaymentSuccess(conn, paymentId, source);
    });
    if (res.newlyMarked && res.payment) {
      try {
        await this.dispatchPaymentNotifications(res.payment, res.tenancyTransition, res.tenancy);
      } catch (err: any) {
        this.logger.error(
          `Post-commit payment notification delivery failed for payment #${res.payment.id} (${res.payment.reference_code}): ${err?.message}`,
          err?.stack,
        );
      }
    }
  }

  private async applyPaymentSuccess(
    conn: any,
    paymentId: number,
    source: string,
    preLockedTenancy?: any,
  ): Promise<{ payment: any; newlyMarked: boolean; tenancyTransition: 'CHECK_IN' | 'CLOSED' | null; tenancy: any }> {
    // 1. If tenancy-linked and not pre-locked by caller, lock root tenancy FIRST
    let tenancyRow: any = preLockedTenancy ?? null;
    if (!tenancyRow) {
      const [pCheck]: any = await conn.execute(
        'SELECT id, tenancy_id, status FROM payments WHERE id = ?',
        [paymentId],
      );
      if (!pCheck.length) {
        return { payment: null, newlyMarked: false, tenancyTransition: null, tenancy: null };
      }
      if (pCheck[0].tenancy_id) {
        const [tenancies]: any = await conn.execute(
          'SELECT * FROM tenancies WHERE id = ? FOR UPDATE',
          [pCheck[0].tenancy_id],
        );
        tenancyRow = tenancies[0] ?? null;
      }
    }

    // 2. Lock the target payment row SECOND
    const [payments]: any = await conn.execute(
      'SELECT * FROM payments WHERE id = ? FOR UPDATE',
      [paymentId],
    );
    if (!payments.length) {
      return { payment: null, newlyMarked: false, tenancyTransition: null, tenancy: null };
    }
    const payment = payments[0];
    if (payment.status === 'PAID') {
      return { payment, newlyMarked: false, tenancyTransition: null, tenancy: tenancyRow };
    }

    const settledAt = this.provider.custodial ? null : new Date();
    const settlementStatus = this.provider.custodial ? 'PENDING' : 'SETTLED';

    await conn.execute(
      `UPDATE payments SET status = 'PAID', paid_at = NOW(), settlement_status = ?, settled_at = ? WHERE id = ?`,
      [settlementStatus, settledAt, paymentId],
    );

    // Synchronize linked Commercial Obligations, Invoices, and Commissions
    await conn.execute(
      `UPDATE commercial_obligations SET status = 'PAID' WHERE payment_id = ? AND status != 'PAID'`,
      [paymentId],
    );
    await conn.execute(
      `UPDATE invoices SET status = 'PAID' WHERE payment_id = ? AND status <> 'PAID'`,
      [paymentId],
    );
    await conn.execute(
      `UPDATE commissions SET status = 'PAID' WHERE payment_id = ? AND status <> 'PAID'`,
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

    if (payment.tenancy_id) {
      if (!tenancyRow) {
        const [tenancies]: any = await conn.execute(
          'SELECT * FROM tenancies WHERE id = ? FOR UPDATE',
          [payment.tenancy_id],
        );
        if (tenancies.length > 0) {
          tenancyRow = tenancies[0];
        }
      }
      if (tenancyRow) {
        if (tenancyRow.stage === 'AWAITING_PAYMENT') {
          // 1. Verify Odibrick service fee obligation exists and is confirmed PAID
          const [feeRows]: any = await conn.execute(
            `SELECT id, status FROM payments
              WHERE tenancy_id = ? AND purpose IN ('SERVICE_FEE','COMMISSION')
              FOR UPDATE`,
            [payment.tenancy_id],
          );
          const hasFeeObligation = feeRows.length > 0;
          const feeConfirmed =
            hasFeeObligation &&
            feeRows.every((f: any) => f.id === paymentId || f.status === 'PAID');

          if (feeConfirmed) {
            // Find active agreement for this tenancy under row lock
            const [agrs]: any = await conn.execute(
              `SELECT id, legal_case_id, current_version, status, approved_by,
                      stamp_duty_status, stamp_reference, registration_ref,
                      stamp_verified_by, stamp_verified_at
                 FROM agreements
                WHERE tenancy_id = ? AND status <> 'CANCELLED'
                ORDER BY id DESC LIMIT 1 FOR UPDATE`,
              [payment.tenancy_id],
            );
            if (agrs.length > 0) {
              const agr = agrs[0];

              // Condition 4a: Must have a legally approved, current agreement version
              const [currVer]: any = await conn.execute(
                `SELECT version, reviewed_at FROM agreement_versions
                  WHERE agreement_id = ? AND version = ?`,
                [agr.id, agr.current_version],
              );
              const isVersionApproved =
                agr.approved_by !== null &&
                currVer.length > 0 &&
                currVer[0].reviewed_at !== null;

              // Condition 4b & 5: All required signatories present and signed; zero-signatory cannot pass
              const [sigStats]: any = await conn.execute(
                `SELECT COUNT(*) AS total_sigs,
                        SUM(CASE WHEN status = 'SIGNED' THEN 1 ELSE 0 END) AS signed_sigs,
                        SUM(CASE WHEN status <> 'SIGNED' THEN 1 ELSE 0 END) AS pending_sigs
                   FROM agreement_signatories WHERE agreement_id = ?`,
                [agr.id],
              );
              const totalSigs = Number(sigStats[0]?.total_sigs || 0);
              const pendingSigs = Number(sigStats[0]?.pending_sigs || 0);
              const areSignatoriesComplete = totalSigs >= 2 && pendingSigs === 0;

              // Condition 4c: Stamping is verified as PAID or REGISTERED, or explicitly marked NOT_APPLICABLE by authorized staff
              const isStampingSatisfied =
                (agr.stamp_duty_status === 'PAID' &&
                  agr.stamp_verified_by != null &&
                  agr.stamp_verified_at != null &&
                  Boolean(agr.stamp_reference && String(agr.stamp_reference).trim())) ||
                (agr.stamp_duty_status === 'REGISTERED' &&
                  agr.stamp_verified_by != null &&
                  agr.stamp_verified_at != null &&
                  Boolean((agr.registration_ref && String(agr.registration_ref).trim()) || (agr.stamp_reference && String(agr.stamp_reference).trim()))) ||
                (agr.stamp_duty_status === 'NOT_APPLICABLE' &&
                  agr.stamp_verified_by != null &&
                  agr.stamp_verified_at != null &&
                  agr.stamp_reference === 'NOT_APPLICABLE');

              if (isVersionApproved && areSignatoriesComplete && isStampingSatisfied && agr.status !== 'EXECUTED') {
                await conn.execute(
                  `UPDATE agreements SET status = 'EXECUTED', executed_at = NOW() WHERE id = ?`,
                  [agr.id],
                );
                if (agr.legal_case_id) {
                  await conn.execute(
                    `UPDATE legal_cases SET status = 'EXECUTED', closed_at = NOW() WHERE id = ?`,
                    [agr.legal_case_id],
                  );
                }
                await conn.execute(
                  `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail)
                   VALUES (?, ?, 'AGREEMENT_EXECUTED', 'Agreement executed', ?)`,
                  [tenancyRow.property_id, payment.tenancy_id, `Agreement #${agr.id} (v${agr.current_version}) legally executed following stamping verification and Odibrick service fee confirmation.`],
                );

                await conn.execute(`UPDATE tenancies SET stage = 'CHECK_IN_PENDING' WHERE id = ?`, [payment.tenancy_id]);
                await conn.execute(`UPDATE properties SET status = 'RENTED' WHERE id = ?`, [tenancyRow.property_id]);
                await conn.execute(
                  `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title)
                   VALUES (?, ?, 'PAYMENT_COMPLETED', 'Odibrick service fee confirmed & stamping verified; move-in scheduled')`,
                  [tenancyRow.property_id, payment.tenancy_id],
                );
                tenancyTransition = 'CHECK_IN';
              } else if (isVersionApproved && areSignatoriesComplete && !isStampingSatisfied && agr.status !== 'EXECUTED') {
                // Payment is confirmed PAID, but stamping remains pending or rejected.
                // Do not execute agreement or advance tenancy to CHECK_IN_PENDING.
                await conn.execute(
                  `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail)
                   VALUES (?, ?, 'PAYMENT_COMPLETED', 'Odibrick service fee confirmed', 'Fee payment confirmed. Awaiting e-stamp verification before agreement execution.')`,
                  [tenancyRow.property_id, payment.tenancy_id],
                );
              }
            }
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
      await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'AGREEMENT_READY', {
        title: 'Agreement executed',
        body: 'Initial payment confirmed and agreement has been formally executed. Move-in check-in is now pending.',
        actionUrl: `/dashboard/tenancy/${tenancy.id}`,
        severity: 'INFO',
      });
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
