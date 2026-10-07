import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { ulid } from 'ulid';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';
import {
  ApprovePayoutDto,
  CreatePayoutDto,
  HoldPayoutDto,
  PayoutQueryDto,
  PreviewPayoutDto,
  ProcessPayoutDto,
  ReconcilePayoutDto,
  RecordPayoutPaymentDto,
  RejectPayoutDto,
} from './owner-payouts.dto';

@Injectable()
export class OwnerPayoutsService {
  private readonly logger = new Logger(OwnerPayoutsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Determine if the actor is platform management.
   */
  private isManagement(user: AuthUser): boolean {
    const roles = user.roles || [];
    return (
      roles.includes('SUPER_ADMIN') ||
      roles.includes('ADMIN') ||
      roles.includes('LEGAL_TEAM') ||
      roles.includes('PROPERTY_MANAGER') ||
      roles.includes('SUPPORT_TEAM') ||
      (user.permissions || []).includes('payment.manage') ||
      (user.permissions || []).includes('admin.manage')
    );
  }

  /**
   * Deterministic sequential payout number generation (e.g. ODB-PAYO-2026-000001).
   */
  private async generateNextPayoutNumber(prefix = 'ODB'): Promise<string> {
    const year = new Date().getFullYear();
    const maxRow = await this.db.one<any>(
      'SELECT COALESCE(MAX(id), 0) AS max_id FROM owner_payouts',
    );
    const nextSeq = (maxRow?.max_id || 0) + 1;
    const padded = String(nextSeq).padStart(6, '0');
    return `${prefix}-PAYO-${year}-${padded}`;
  }

  /**
   * Mask sensitive banking numbers (e.g. show only last 4 digits).
   */
  private maskAccountNumber(accountNum?: string | null): string {
    if (!accountNum) return '••••';
    const clean = accountNum.trim();
    if (clean.length <= 4) return clean;
    return `••••${clean.slice(-4)}`;
  }

  /**
   * Calculate and preview owner payable balance dynamically from existing payments.
   */
  async previewOwnerPayable(user: AuthUser, dto: PreviewPayoutDto) {
    const ownerId = Number(dto.ownerUserId);
    if (!this.isManagement(user) && user.id !== ownerId) {
      throw new ForbiddenException('You are not authorized to view this owner financial position.');
    }

    const owner = await this.db.one<any>(
      'SELECT id, public_id, email, full_name, phone FROM users WHERE id = ?',
      [ownerId],
    );
    if (!owner) throw new NotFoundException(`Owner #${ownerId} not found.`);

    // Fetch primary payout account
    const payoutAccount = await this.db.one<any>(
      `SELECT pa.* FROM payment_accounts pa
        WHERE pa.user_id = ?
        ORDER BY pa.is_primary DESC, pa.id DESC LIMIT 1`,
      [ownerId],
    );

    // Date bounds
    const periodStart = dto.periodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const periodEnd = dto.periodEnd || new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10);

    // 1. Fetch all candidate payments involving this owner
    const candidatePayments = await this.db.query<any>(
      `SELECT p.*,
              prop.title AS property_title,
              payer.full_name AS payer_name,
              payee.full_name AS payee_name
         FROM payments p
         LEFT JOIN properties prop ON prop.id = p.property_id
         LEFT JOIN users payer ON payer.id = p.payer_user_id
         LEFT JOIN users payee ON payee.id = p.payee_user_id
        WHERE (p.payee_user_id = ? OR p.payer_user_id = ? OR prop.listed_by_user_id = ?)
          AND (
            (p.paid_at IS NOT NULL AND p.paid_at >= ? AND p.paid_at <= ?)
            OR (p.paid_at IS NULL AND p.created_at >= ? AND p.created_at <= ?)
          )
        ORDER BY p.paid_at DESC, p.created_at DESC`,
      [
        ownerId,
        ownerId,
        ownerId,
        `${periodStart} 00:00:00`,
        `${periodEnd} 23:59:59`,
        `${periodStart} 00:00:00`,
        `${periodEnd} 23:59:59`,
      ],
    );

    // 2. Fetch all payments already included in active / approved / paid payouts
    const alreadyPaidOutRows = await this.db.query<any>(
      `SELECT opi.payment_id, op.payout_number, op.status
         FROM owner_payout_items opi
         JOIN owner_payouts op ON op.id = opi.payout_id
        WHERE op.owner_user_id = ?
          AND op.status NOT IN ('REJECTED', 'CANCELLED')`,
      [ownerId],
    );
    const alreadyPaidOutMap = new Map<number, string>();
    alreadyPaidOutRows.forEach((r) => {
      if (r.payment_id) alreadyPaidOutMap.set(Number(r.payment_id), r.payout_number);
    });

    // 3. Fetch active disputes for hold exclusions
    const activeDisputes = await this.db.query<any>(
      `SELECT id, case_number, category, amount_claimed, tenancy_id
         FROM disputes
        WHERE (against_user_id = ? OR raised_by = ?)
          AND status NOT IN ('RESOLVED', 'CLOSED', 'WITHDRAWN')`,
      [ownerId, ownerId],
    );
    const hasDisputes = activeDisputes.length > 0;
    const totalDisputedHold = activeDisputes.reduce((sum, d) => sum + Number(d.amount_claimed || 0), 0);

    const eligibleCredits: any[] = [];
    const eligibleDebits: any[] = [];
    const excludedItems: any[] = [];

    let grossReceivable = 0;
    let commissionDeductions = 0;
    let serviceFeeDeductions = 0;
    let maintenanceDeductions = 0;
    let refundDeductions = 0;
    let otherDeductions = 0;

    for (const p of candidatePayments) {
      const pId = Number(p.id);
      const amount = Number(p.total_amount);

      // Check if already paid out in another payout
      if (alreadyPaidOutMap.has(pId)) {
        excludedItems.push({
          paymentId: pId,
          referenceCode: p.reference_code,
          purpose: p.purpose,
          amount,
          status: p.status,
          reason: `Already included in payout ${alreadyPaidOutMap.get(pId)}`,
        });
        continue;
      }

      // Check status: only settled PAID payments are eligible for payout / deductions
      if (p.status !== 'PAID') {
        excludedItems.push({
          paymentId: pId,
          referenceCode: p.reference_code,
          purpose: p.purpose,
          amount,
          status: p.status,
          reason: `Payment is not settled (status: ${p.status})`,
        });
        continue;
      }

      // Check if linked to an active dispute hold
      const isDisputed = activeDisputes.some((d) => d.tenancy_id && p.tenancy_id && d.tenancy_id === p.tenancy_id);
      if (isDisputed && p.purpose === 'MONTHLY_RENT') {
        excludedItems.push({
          paymentId: pId,
          referenceCode: p.reference_code,
          purpose: p.purpose,
          amount,
          status: p.status,
          reason: 'Held due to active financial dispute on tenancy',
        });
        continue;
      }

      // Categorize Credit (Receivable to Owner)
      if (p.payee_user_id === ownerId || (p.purpose === 'MONTHLY_RENT' && p.payer_user_id !== ownerId)) {
        grossReceivable += amount;
        eligibleCredits.push({
          paymentId: pId,
          referenceCode: p.reference_code,
          itemType: 'RECEIVABLE',
          direction: 'CREDIT',
          amount,
          purpose: p.purpose,
          description: `Gross rent/receivable settlement (${p.reference_code})`,
          paidAt: p.paid_at,
          propertyTitle: p.property_title,
        });
      }
      // Categorize Debit (Deduction from Owner)
      else if (p.payer_user_id === ownerId || p.purpose === 'COMMISSION' || p.purpose === 'SERVICE_FEE') {
        let itemType = 'OTHER_DEDUCTION';
        let desc = `Platform deduction (${p.reference_code})`;

        if (p.purpose === 'COMMISSION') {
          itemType = 'COMMISSION_DEDUCTION';
          commissionDeductions += amount;
          desc = `Platform brokerage commission (${p.reference_code})`;
        } else if (p.purpose === 'SERVICE_FEE' || p.purpose === 'LEGAL_FEE') {
          itemType = 'SERVICE_FEE_DEDUCTION';
          serviceFeeDeductions += amount;
          desc = `Platform property management & service fee (${p.reference_code})`;
        } else if (p.purpose === 'MAINTENANCE') {
          itemType = 'MAINTENANCE_DEDUCTION';
          maintenanceDeductions += amount;
          desc = `Owner-borne maintenance cost (${p.reference_code})`;
        } else if (p.purpose === 'REFUND') {
          itemType = 'REFUND_DEDUCTION';
          refundDeductions += amount;
          desc = `Security deposit refund paid by owner (${p.reference_code})`;
        } else {
          otherDeductions += amount;
        }

        eligibleDebits.push({
          paymentId: pId,
          referenceCode: p.reference_code,
          itemType,
          direction: 'DEBIT',
          amount,
          purpose: p.purpose,
          description: desc,
          paidAt: p.paid_at,
          propertyTitle: p.property_title,
        });
      }
    }

    grossReceivable = Math.round(grossReceivable * 100) / 100;
    const totalDeductions = Math.round(
      (commissionDeductions + serviceFeeDeductions + maintenanceDeductions + refundDeductions + otherDeductions) * 100,
    ) / 100;

    const netPayable = Math.max(0, Math.round((grossReceivable - totalDeductions) * 100) / 100);

    return {
      owner: {
        id: owner.id,
        publicId: owner.public_id,
        fullName: owner.full_name,
        email: owner.email,
        phone: owner.phone,
      },
      payoutAccount: payoutAccount
        ? {
            id: payoutAccount.id,
            accountType: payoutAccount.account_type,
            holderName: payoutAccount.holder_name,
            accountNumberMasked: this.maskAccountNumber(payoutAccount.account_last4 || payoutAccount.provider_ref),
            accountLast4: payoutAccount.account_last4,
            ifsc: payoutAccount.ifsc,
            upiHandle: payoutAccount.upi_handle,
            isVerified: !!payoutAccount.verified_at,
          }
        : null,
      period: {
        start: periodStart,
        end: periodEnd,
      },
      calculation: {
        grossReceivable,
        deductions: {
          commission: commissionDeductions,
          serviceFee: serviceFeeDeductions,
          maintenance: maintenanceDeductions,
          refund: refundDeductions,
          other: otherDeductions,
          total: totalDeductions,
        },
        netPayable,
        disputedHoldAmount: totalDisputedHold,
        currency: 'INR',
      },
      lineItems: [...eligibleCredits, ...eligibleDebits],
      excludedItems,
      isEligibleForPayout: netPayable > 0 && !!payoutAccount,
    };
  }

  /**
   * Create an Owner Payout proposal for Management Review.
   */
  async createPayout(user: AuthUser, dto: CreatePayoutDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can create owner payout proposals.');
    }

    const preview = await this.previewOwnerPayable(user, {
      ownerUserId: dto.ownerUserId,
      periodStart: dto.periodStart,
      periodEnd: dto.periodEnd,
    });

    // Filter items if specific payment IDs selected
    let selectedLineItems = preview.lineItems;
    if (dto.selectedPaymentIds && dto.selectedPaymentIds.length > 0) {
      const idSet = new Set(dto.selectedPaymentIds.map(Number));
      const alreadyExcluded = preview.excludedItems.find((item) => idSet.has(Number(item.paymentId)));
      if (alreadyExcluded) {
        throw new BadRequestException(
          `Payment #${alreadyExcluded.paymentId} is ${alreadyExcluded.reason.toLowerCase() || 'not eligible for payout'}.`,
        );
      }
      selectedLineItems = preview.lineItems.filter((item) => idSet.has(Number(item.paymentId)));
    }

    if (selectedLineItems.length === 0) {
      throw new BadRequestException('No eligible transactions selected for payout.');
    }

    // Check for concurrency / idempotency collision on any payment item
    const paymentIds = selectedLineItems.map((i) => i.paymentId).filter(Boolean);
    if (paymentIds.length > 0) {
      const conflictingRows = await this.db.query<any>(
        `SELECT opi.payment_id, op.payout_number
           FROM owner_payout_items opi
           JOIN owner_payouts op ON op.id = opi.payout_id
          WHERE opi.payment_id IN (${paymentIds.map(() => '?').join(',')})
            AND op.status NOT IN ('REJECTED', 'CANCELLED')`,
        paymentIds,
      );

      if (conflictingRows.length > 0) {
        throw new BadRequestException(
          `Payment #${conflictingRows[0].payment_id} is already included in active payout ${conflictingRows[0].payout_number}.`,
        );
      }
    }

    const grossAmount = selectedLineItems
      .filter((i) => i.direction === 'CREDIT')
      .reduce((sum, i) => sum + Number(i.amount), 0);

    const deductionAmount = selectedLineItems
      .filter((i) => i.direction === 'DEBIT')
      .reduce((sum, i) => sum + Number(i.amount), 0);

    const netAmount = Math.max(0, Math.round((grossAmount - deductionAmount) * 100) / 100);

    if (netAmount <= 0) {
      throw new BadRequestException(
        `Net payable amount (₹${netAmount}) must be positive to generate a payout.`,
      );
    }

    const payoutNumber = await this.generateNextPayoutNumber();
    const publicId = ulid().toLowerCase();

    const snapshotData = {
      payoutNumber,
      createdAt: new Date().toISOString(),
      owner: preview.owner,
      payoutAccount: preview.payoutAccount,
      period: {
        start: dto.periodStart,
        end: dto.periodEnd,
      },
      calculation: {
        grossAmount,
        deductionAmount,
        netAmount,
        currency: 'INR',
      },
      lineItems: selectedLineItems,
      notes: dto.notes || '',
    };

    const payoutId = await this.db.insert('owner_payouts', {
      public_id: publicId,
      payout_number: payoutNumber,
      owner_user_id: dto.ownerUserId,
      payout_account_id: dto.payoutAccountId || preview.payoutAccount?.id || null,
      period_start: dto.periodStart,
      period_end: dto.periodEnd,
      gross_amount: grossAmount,
      deduction_amount: deductionAmount,
      net_amount: netAmount,
      currency: 'INR',
      status: 'PENDING_REVIEW',
      reconciliation_status: 'UNRECONCILED',
      snapshot_data: JSON.stringify(snapshotData),
      notes: dto.notes || null,
    });

    for (const item of selectedLineItems) {
      await this.db.insert('owner_payout_items', {
        payout_id: payoutId,
        payment_id: item.paymentId || null,
        item_type: item.itemType,
        direction: item.direction,
        amount: item.amount,
        description: item.description,
        reference_code: item.referenceCode || null,
      });
    }

    await this.audit.record({
      actor: user,
      action: 'payout.created',
      objectType: 'owner_payout',
      objectId: payoutId,
      metadata: {
        payoutNumber,
        ownerUserId: dto.ownerUserId,
        netAmount,
        itemCount: selectedLineItems.length,
      },
      req,
    });

    return this.getPayout(user, payoutId);
  }

  /**
   * Get single payout with authorization.
   */
  async getPayout(user: AuthUser, id: number) {
    const payout = await this.db.one<any>(
      `SELECT op.*,
              u.full_name AS owner_name, u.email AS owner_email, u.phone AS owner_phone,
              pa.account_type, pa.holder_name, pa.account_last4, pa.ifsc, pa.upi_handle, pa.verified_at AS account_verified_at,
              approver.full_name AS approved_by_name,
              reconciler.full_name AS reconciled_by_name
         FROM owner_payouts op
         JOIN users u ON u.id = op.owner_user_id
         LEFT JOIN payment_accounts pa ON pa.id = op.payout_account_id
         LEFT JOIN users approver ON approver.id = op.approved_by
         LEFT JOIN users reconciler ON reconciler.id = op.reconciled_by
        WHERE op.id = ?`,
      [id],
    );

    if (!payout) {
      throw new NotFoundException(`Payout #${id} not found.`);
    }

    // RBAC: Management or Owner
    if (!this.isManagement(user) && payout.owner_user_id !== user.id) {
      throw new ForbiddenException('You are not authorized to view this payout.');
    }

    const items = await this.db.query<any>(
      `SELECT opi.*,
              p.reference_code AS payment_reference, p.purpose AS payment_purpose, p.status AS payment_status, p.paid_at AS payment_paid_at
         FROM owner_payout_items opi
         LEFT JOIN payments p ON p.id = opi.payment_id
        WHERE opi.payout_id = ?
        ORDER BY opi.id ASC`,
      [id],
    );

    const reconciliations = await this.db.query<any>(
      `SELECT pr.*, u.full_name AS reconciled_by_name
         FROM payout_reconciliations pr
         JOIN users u ON u.id = pr.reconciled_by
        WHERE pr.payout_id = ?
        ORDER BY pr.id DESC`,
      [id],
    );

    let parsedSnapshot = null;
    if (payout.snapshot_data) {
      try {
        parsedSnapshot = typeof payout.snapshot_data === 'string'
          ? JSON.parse(payout.snapshot_data)
          : payout.snapshot_data;
      } catch {
        parsedSnapshot = null;
      }
    }

    return {
      ...payout,
      payoutAccount: {
        accountType: payout.account_type,
        holderName: payout.holder_name,
        accountNumberMasked: this.maskAccountNumber(payout.account_last4),
        ifsc: payout.ifsc,
        upiHandle: payout.upi_handle,
        isVerified: !!payout.account_verified_at,
      },
      items,
      reconciliations,
      snapshot: parsedSnapshot,
    };
  }

  /**
   * List payouts for Finance Control Centre or Owner Dashboard.
   */
  async listPayouts(user: AuthUser, query: PayoutQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize || 20)));
    const offset = (page - 1) * pageSize;

    const where: string[] = ['1=1'];
    const params: any[] = [];

    // RBAC: Non-management users can only view their own payouts
    if (!this.isManagement(user)) {
      where.push('op.owner_user_id = ?');
      params.push(user.id);
    } else if (query.ownerUserId) {
      where.push('op.owner_user_id = ?');
      params.push(query.ownerUserId);
    }

    if (query.status && query.status !== 'ALL') {
      where.push('op.status = ?');
      params.push(query.status);
    }

    if (query.reconciliationStatus && query.reconciliationStatus !== 'ALL') {
      where.push('op.reconciliation_status = ?');
      params.push(query.reconciliationStatus);
    }

    if (query.from) {
      where.push('op.period_start >= ?');
      params.push(query.from);
    }

    if (query.to) {
      where.push('op.period_end <= ?');
      params.push(query.to);
    }

    if (query.q) {
      where.push('(op.payout_number LIKE ? OR u.full_name LIKE ? OR op.external_reference LIKE ?)');
      const pattern = `%${query.q}%`;
      params.push(pattern, pattern, pattern);
    }

    const whereSql = where.join(' AND ');

    const countRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total
         FROM owner_payouts op
         JOIN users u ON u.id = op.owner_user_id
        WHERE ${whereSql}`,
      params,
    );

    const items = await this.db.query<any>(
      `SELECT op.*,
              u.full_name AS owner_name, u.email AS owner_email,
              pa.account_type, pa.account_last4, pa.ifsc,
              approver.full_name AS approved_by_name
         FROM owner_payouts op
         JOIN users u ON u.id = op.owner_user_id
         LEFT JOIN payment_accounts pa ON pa.id = op.payout_account_id
         LEFT JOIN users approver ON approver.id = op.approved_by
        WHERE ${whereSql}
        ORDER BY op.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    const total = Number(countRow?.total || 0);

    return {
      items: items.map((i) => ({
        ...i,
        accountNumberMasked: this.maskAccountNumber(i.account_last4),
      })),
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
    };
  }

  /**
   * Approve Payout (Management only).
   */
  async approvePayout(user: AuthUser, id: number, dto?: ApprovePayoutDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can approve owner payouts.');
    }

    const payout = await this.db.one<any>('SELECT * FROM owner_payouts WHERE id = ?', [id]);
    if (!payout) throw new NotFoundException(`Payout #${id} not found.`);

    if (payout.status !== 'PENDING_REVIEW') {
      throw new BadRequestException(`Cannot approve payout in ${payout.status} state.`);
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.execute(
      'UPDATE owner_payouts SET status = ?, approved_by = ?, approved_at = ?, notes = COALESCE(?, notes) WHERE id = ?',
      ['APPROVED', user.id, now, dto?.notes || null, id],
    );

    await this.audit.record({
      actor: user,
      action: 'payout.approved',
      objectType: 'owner_payout',
      objectId: id,
      metadata: { payoutNumber: payout.payout_number, approvedBy: user.id },
      req,
    });

    return this.getPayout(user, id);
  }

  /**
   * Reject Payout (Management only).
   */
  async rejectPayout(user: AuthUser, id: number, dto: RejectPayoutDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can reject owner payouts.');
    }

    const payout = await this.db.one<any>('SELECT * FROM owner_payouts WHERE id = ?', [id]);
    if (!payout) throw new NotFoundException(`Payout #${id} not found.`);

    if (['PAID', 'PROCESSING'].includes(payout.status)) {
      throw new BadRequestException(`Cannot reject payout in ${payout.status} status.`);
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.execute(
      'UPDATE owner_payouts SET status = ?, rejected_by = ?, rejected_at = ?, rejection_reason = ? WHERE id = ?',
      ['REJECTED', user.id, now, dto.reason, id],
    );

    await this.audit.record({
      actor: user,
      action: 'payout.rejected',
      objectType: 'owner_payout',
      objectId: id,
      metadata: { payoutNumber: payout.payout_number, reason: dto.reason },
      req,
    });

    return this.getPayout(user, id);
  }

  /**
   * Put Payout on Hold (Management only).
   */
  async holdPayout(user: AuthUser, id: number, dto: HoldPayoutDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can place payouts on hold.');
    }

    const payout = await this.db.one<any>('SELECT * FROM owner_payouts WHERE id = ?', [id]);
    if (!payout) throw new NotFoundException(`Payout #${id} not found.`);

    if (payout.status === 'PAID') {
      throw new BadRequestException('Cannot put already PAID payout on hold.');
    }

    await this.db.execute(
      'UPDATE owner_payouts SET status = ?, hold_reason = ? WHERE id = ?',
      ['ON_HOLD', dto.reason, id],
    );

    await this.audit.record({
      actor: user,
      action: 'payout.on_hold',
      objectType: 'owner_payout',
      objectId: id,
      metadata: { payoutNumber: payout.payout_number, reason: dto.reason },
      req,
    });

    return this.getPayout(user, id);
  }

  /**
   * Mark Payout as Processing (Management only).
   */
  async processPayout(user: AuthUser, id: number, dto: ProcessPayoutDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can process owner payouts.');
    }

    const payout = await this.db.one<any>('SELECT * FROM owner_payouts WHERE id = ?', [id]);
    if (!payout) throw new NotFoundException(`Payout #${id} not found.`);

    if (payout.status !== 'APPROVED') {
      throw new BadRequestException(`Payout must be in APPROVED status to begin processing. Current: ${payout.status}`);
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.execute(
      'UPDATE owner_payouts SET status = ?, payout_method = ?, processed_at = ?, notes = COALESCE(?, notes) WHERE id = ?',
      ['PROCESSING', dto.payoutMethod || 'NEFT', now, dto.notes || null, id],
    );

    await this.audit.record({
      actor: user,
      action: 'payout.processing',
      objectType: 'owner_payout',
      objectId: id,
      metadata: { payoutNumber: payout.payout_number, method: dto.payoutMethod },
      req,
    });

    return this.getPayout(user, id);
  }

  /**
   * Record External Settlement & Perform Financial Reconciliation (Management only).
   */
  async recordPayoutPayment(
    user: AuthUser,
    id: number,
    dto: RecordPayoutPaymentDto,
    req?: Request,
  ) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can record payout settlement.');
    }

    const payout = await this.db.one<any>('SELECT * FROM owner_payouts WHERE id = ?', [id]);
    if (!payout) throw new NotFoundException(`Payout #${id} not found.`);

    if (!['APPROVED', 'PROCESSING', 'ON_HOLD'].includes(payout.status)) {
      throw new BadRequestException(
        `Cannot record payment for payout in ${payout.status} status. Payout must be APPROVED or PROCESSING.`,
      );
    }

    const expected = Number(payout.net_amount);
    const actual = Math.round(Number(dto.paidAmount) * 100) / 100;
    const diff = Math.round((actual - expected) * 100) / 100;

    let reconStatus = 'UNRECONCILED';
    if (diff === 0) {
      reconStatus = 'MATCHED';
    } else if (actual > 0 && actual < expected) {
      reconStatus = 'PARTIALLY_MATCHED';
    } else {
      reconStatus = 'MISMATCHED';
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const settlementDate = dto.settlementDate || new Date().toISOString().slice(0, 10);

    // 1. Update owner_payouts record
    await this.db.execute(
      `UPDATE owner_payouts
          SET status = 'PAID',
              paid_amount = ?,
              paid_at = ?,
              external_reference = ?,
              payout_method = COALESCE(?, payout_method),
              reconciliation_status = ?,
              reconciled_at = ?,
              reconciled_by = ?,
              notes = COALESCE(?, notes)
        WHERE id = ?`,
      [
        actual,
        now,
        dto.externalReference,
        dto.payoutMethod || null,
        reconStatus,
        now,
        user.id,
        dto.notes || null,
        id,
      ],
    );

    // 2. Insert reconciliation record
    await this.db.insert('payout_reconciliations', {
      payout_id: id,
      expected_amount: expected,
      actual_amount: actual,
      difference: diff,
      status: reconStatus,
      external_reference: dto.externalReference,
      settlement_date: settlementDate,
      reconciled_by: user.id,
      notes: dto.notes || `Settlement recorded with status ${reconStatus}`,
    });

    // 3. Record Audit events
    await this.audit.record({
      actor: user,
      action: 'payout.paid',
      objectType: 'owner_payout',
      objectId: id,
      metadata: {
        payoutNumber: payout.payout_number,
        paidAmount: actual,
        externalReference: dto.externalReference,
      },
      req,
    });

    await this.audit.record({
      actor: user,
      action: 'payout.reconciled',
      objectType: 'owner_payout',
      objectId: id,
      metadata: {
        payoutNumber: payout.payout_number,
        reconciliationStatus: reconStatus,
        difference: diff,
      },
      req,
    });

    if (reconStatus === 'MISMATCHED') {
      await this.audit.record({
        actor: user,
        action: 'payout.mismatch_detected',
        objectType: 'owner_payout',
        objectId: id,
        metadata: {
          payoutNumber: payout.payout_number,
          expected,
          actual,
          difference: diff,
        },
        req,
      });
    }

    return this.getPayout(user, id);
  }

  /**
   * Standalone Reconciliation Action (Management only).
   */
  async reconcilePayout(user: AuthUser, id: number, dto: ReconcilePayoutDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can reconcile payouts.');
    }

    const payout = await this.db.one<any>('SELECT * FROM owner_payouts WHERE id = ?', [id]);
    if (!payout) throw new NotFoundException(`Payout #${id} not found.`);

    const expected = Number(payout.net_amount);
    const actual = Math.round(Number(dto.actualAmount) * 100) / 100;
    const diff = Math.round((actual - expected) * 100) / 100;

    let reconStatus = 'UNRECONCILED';
    if (diff === 0) {
      reconStatus = 'MATCHED';
    } else if (actual > 0 && actual < expected) {
      reconStatus = 'PARTIALLY_MATCHED';
    } else {
      reconStatus = 'MISMATCHED';
    }

    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.insert('payout_reconciliations', {
      payout_id: id,
      expected_amount: expected,
      actual_amount: actual,
      difference: diff,
      status: reconStatus,
      external_reference: dto.externalReference,
      settlement_date: dto.settlementDate || new Date().toISOString().slice(0, 10),
      reconciled_by: user.id,
      notes: dto.notes || `Reconciliation performed: ${reconStatus}`,
    });

    await this.db.execute(
      'UPDATE owner_payouts SET reconciliation_status = ?, reconciled_at = ?, reconciled_by = ? WHERE id = ?',
      [reconStatus, now, user.id, id],
    );

    await this.audit.record({
      actor: user,
      action: 'payout.reconciled',
      objectType: 'owner_payout',
      objectId: id,
      metadata: {
        payoutNumber: payout.payout_number,
        reconciliationStatus: reconStatus,
        difference: diff,
      },
      req,
    });

    return this.getPayout(user, id);
  }
}
