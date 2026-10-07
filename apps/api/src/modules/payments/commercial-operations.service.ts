import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from './payments.service';
import { AuthUser } from '../../common/auth/auth.types';
import { ulid } from 'ulid';
import {
  CreateCommercialRuleDto,
  UpdateCommercialRuleDto,
  PreviewCommercialCalculationDto,
  QueryCommercialObligationsDto,
  ApproveCommercialObligationDto,
  WaiveCommercialObligationDto,
  AdjustCommercialObligationDto,
  CancelCommercialObligationDto,
  QueryCommercialRevenueDto,
  CommercialCategory,
  CommercialObligationStatus,
} from './commercial-operations.dto';

@Injectable()
export class CommercialOperationsService {
  private readonly logger = new Logger(CommercialOperationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly payments: PaymentsService,
  ) {}

  private isManagement(user: AuthUser): boolean {
    const mgmtRoles = ['SUPER_ADMIN', 'ADMIN', 'PROPERTY_MANAGER', 'FINANCE_MANAGER'];
    const hasRole = user.roles?.some((r) => mgmtRoles.includes(r));
    const hasPerm = user.permissions?.some((p) =>
      ['commercial.read', 'commercial.manage', 'commercial.rules.manage', 'finance.manage', 'payment.manage'].includes(p),
    );
    return Boolean(hasRole || hasPerm);
  }

  private isSuperOrAdmin(user: AuthUser): boolean {
    return Boolean(
      user.roles?.includes('SUPER_ADMIN') ||
      user.roles?.includes('ADMIN') ||
      user.permissions?.includes('commercial.manage') ||
      user.permissions?.includes('commercial.rules.manage')
    );
  }

  private async generateNextObligationNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const maxRow = await this.db.one<{ max_id: number }>(
      'SELECT COUNT(*) as max_id FROM commercial_obligations',
    );
    const nextSeq = (maxRow?.max_id || 0) + 1;
    return `ODB-COM-${year}-${String(nextSeq).padStart(6, '0')}`;
  }

  // =========================================================================
  // 1. COMMERCIAL OVERVIEW & METRICS
  // =========================================================================
  async getCommercialOverview(user: AuthUser, periodStart?: string, periodEnd?: string) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access the Commercial Overview.');
    }

    const start = periodStart ? `${periodStart} 00:00:00` : '2020-01-01 00:00:00';
    const end = periodEnd ? `${periodEnd} 23:59:59` : '2099-12-31 23:59:59';

    // Summary Metrics
    const metrics = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS gross_commercial_volume,
         COALESCE(SUM(fee_amount), 0) AS net_taxable_subtotal,
         COALESCE(SUM(tax_amount), 0) AS total_gst_calculated,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS total_paid_revenue,
         COALESCE(SUM(CASE WHEN status = 'PAYMENT_DUE' THEN total_amount ELSE 0 END), 0) AS total_payment_due,
         COALESCE(SUM(CASE WHEN status IN ('CALCULATED', 'PENDING_REVIEW') THEN total_amount ELSE 0 END), 0) AS total_pending_review,
         COALESCE(SUM(CASE WHEN status = 'WAIVED' THEN total_amount ELSE 0 END), 0) AS total_waived,
         COALESCE(SUM(CASE WHEN status = 'DISPUTED' THEN total_amount ELSE 0 END), 0) AS total_disputed,
         COALESCE(SUM(CASE WHEN status = 'CANCELLED' THEN total_amount ELSE 0 END), 0) AS total_cancelled,
         COUNT(*) AS total_obligations_count,
         SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid_count,
         SUM(CASE WHEN status = 'PAYMENT_DUE' THEN 1 ELSE 0 END) AS due_count,
         SUM(CASE WHEN status = 'PENDING_REVIEW' THEN 1 ELSE 0 END) AS pending_count,
         SUM(CASE WHEN status = 'WAIVED' THEN 1 ELSE 0 END) AS waived_count,
         SUM(CASE WHEN status = 'DISPUTED' THEN 1 ELSE 0 END) AS disputed_count
       FROM commercial_obligations
       WHERE created_at BETWEEN ? AND ?`,
      [start, end],
    );

    // Category Breakdown
    const categoryRows = await this.db.query<any>(
      `SELECT
         category,
         COUNT(*) AS count,
         COALESCE(SUM(total_amount), 0) AS total_amount,
         COALESCE(SUM(fee_amount), 0) AS fee_amount,
         COALESCE(SUM(tax_amount), 0) AS tax_amount,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS paid_amount,
         COALESCE(SUM(CASE WHEN status = 'PAYMENT_DUE' THEN total_amount ELSE 0 END), 0) AS due_amount
       FROM commercial_obligations
       WHERE created_at BETWEEN ? AND ?
       GROUP BY category`,
      [start, end],
    );

    // Monthly Trend Series
    const monthlySeries = await this.db.query<any>(
      `SELECT
         DATE_FORMAT(created_at, '%Y-%m') AS month,
         category,
         COALESCE(SUM(total_amount), 0) AS total_amount,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS paid_amount
       FROM commercial_obligations
       WHERE created_at BETWEEN ? AND ?
       GROUP BY DATE_FORMAT(created_at, '%Y-%m'), category
       ORDER BY month ASC`,
      [start, end],
    );

    // Active Rules Count
    const activeRulesCount = await this.db.one<any>(
      'SELECT COUNT(*) as count FROM commercial_rules WHERE is_active = 1',
    );

    return {
      volume: {
        grossVolume: Number(metrics?.gross_commercial_volume || 0),
        taxableSubtotal: Number(metrics?.net_taxable_subtotal || 0),
        gstCalculated: Number(metrics?.total_gst_calculated || 0),
        paidRevenue: Number(metrics?.total_paid_revenue || 0),
        paymentDue: Number(metrics?.total_payment_due || 0),
        pendingReview: Number(metrics?.total_pending_review || 0),
        waived: Number(metrics?.total_waived || 0),
        disputed: Number(metrics?.total_disputed || 0),
        cancelled: Number(metrics?.total_cancelled || 0),
      },
      counts: {
        total: Number(metrics?.total_obligations_count || 0),
        paid: Number(metrics?.paid_count || 0),
        due: Number(metrics?.due_count || 0),
        pending: Number(metrics?.pending_count || 0),
        waived: Number(metrics?.waived_count || 0),
        disputed: Number(metrics?.disputed_count || 0),
        activeRules: Number(activeRulesCount?.count || 0),
      },
      categories: categoryRows.map((r) => ({
        category: r.category,
        count: Number(r.count || 0),
        totalAmount: Number(r.total_amount || 0),
        feeAmount: Number(r.fee_amount || 0),
        taxAmount: Number(r.tax_amount || 0),
        paidAmount: Number(r.paid_amount || 0),
        dueAmount: Number(r.due_amount || 0),
      })),
      monthlySeries,
      timestamp: new Date().toISOString(),
    };
  }

  // =========================================================================
  // 2. COMMERCIAL RULES MANAGEMENT
  // =========================================================================
  async getRules(user: AuthUser, category?: string, isActive?: boolean) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can access Commercial Rules.');
    }

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (category) {
      whereClauses.push('cr.category = ?');
      params.push(category);
    }
    if (isActive !== undefined) {
      whereClauses.push('cr.is_active = ?');
      params.push(isActive ? 1 : 0);
    }

    const where = whereClauses.join(' AND ');
    const rules = await this.db.query<any>(
      `SELECT cr.*,
              u1.full_name AS created_by_name,
              u2.full_name AS updated_by_name,
              (SELECT COUNT(*) FROM commercial_obligations co WHERE co.rule_id = cr.id) AS usage_count,
              (SELECT COALESCE(SUM(co.total_amount), 0) FROM commercial_obligations co WHERE co.rule_id = cr.id) AS total_generated_revenue
         FROM commercial_rules cr
         LEFT JOIN users u1 ON u1.id = cr.created_by
         LEFT JOIN users u2 ON u2.id = cr.updated_by
        WHERE ${where}
        ORDER BY cr.category ASC, cr.priority DESC, cr.effective_from DESC`,
      params,
    );

    return rules.map((r) => ({
      id: r.id,
      publicId: r.public_id,
      code: r.code,
      name: r.name,
      category: r.category,
      appliesTo: r.applies_to,
      basis: r.basis,
      percentValue: r.percent_value !== null ? Number(r.percent_value) : null,
      flatValue: r.flat_value !== null ? Number(r.flat_value) : null,
      minAmount: r.min_amount !== null ? Number(r.min_amount) : null,
      maxAmount: r.max_amount !== null ? Number(r.max_amount) : null,
      payer: r.payer,
      taxRate: Number(r.tax_rate),
      priority: Number(r.priority),
      city: r.city,
      effectiveFrom: r.effective_from,
      effectiveTo: r.effective_to,
      isActive: Boolean(r.is_active),
      isSystem: Boolean(r.is_system),
      usageCount: Number(r.usage_count || 0),
      totalGeneratedRevenue: Number(r.total_generated_revenue || 0),
      createdByName: r.created_by_name,
      createdAt: r.created_at,
    }));
  }

  async getRuleById(user: AuthUser, id: number) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can access Commercial Rules.');
    }

    const rule = await this.db.one<any>(
      `SELECT cr.*,
              u1.full_name AS created_by_name,
              u2.full_name AS updated_by_name,
              (SELECT COUNT(*) FROM commercial_obligations co WHERE co.rule_id = cr.id) AS usage_count,
              (SELECT COALESCE(SUM(co.total_amount), 0) FROM commercial_obligations co WHERE co.rule_id = cr.id) AS total_generated_revenue
         FROM commercial_rules cr
         LEFT JOIN users u1 ON u1.id = cr.created_by
         LEFT JOIN users u2 ON u2.id = cr.updated_by
        WHERE cr.id = ?`,
      [id],
    );

    if (!rule) {
      throw new NotFoundException(`Commercial Rule #${id} not found.`);
    }

    return {
      id: rule.id,
      publicId: rule.public_id,
      code: rule.code,
      name: rule.name,
      category: rule.category,
      appliesTo: rule.applies_to,
      basis: rule.basis,
      percentValue: rule.percent_value !== null ? Number(rule.percent_value) : null,
      flatValue: rule.flat_value !== null ? Number(rule.flat_value) : null,
      minAmount: rule.min_amount !== null ? Number(rule.min_amount) : null,
      maxAmount: rule.max_amount !== null ? Number(rule.max_amount) : null,
      payer: rule.payer,
      taxRate: Number(rule.tax_rate),
      priority: Number(rule.priority),
      city: rule.city,
      effectiveFrom: rule.effective_from,
      effectiveTo: rule.effective_to,
      isActive: Boolean(rule.is_active),
      isSystem: Boolean(rule.is_system),
      usageCount: Number(rule.usage_count || 0),
      totalGeneratedRevenue: Number(rule.total_generated_revenue || 0),
      createdByName: rule.created_by_name,
      createdAt: rule.created_at,
      updatedAt: rule.updated_at,
    };
  }

  async createRule(user: AuthUser, dto: CreateCommercialRuleDto) {
    if (!this.isSuperOrAdmin(user)) {
      throw new ForbiddenException('Only Admin users can create Commercial Pricing Rules.');
    }

    const existing = await this.db.one<any>(
      'SELECT id FROM commercial_rules WHERE code = ?',
      [dto.code],
    );
    if (existing) {
      throw new ConflictException(`Commercial rule code '${dto.code}' already exists.`);
    }

    if (dto.effectiveTo && new Date(dto.effectiveFrom) > new Date(dto.effectiveTo)) {
      throw new BadRequestException('effectiveFrom date cannot be after effectiveTo date.');
    }

    const publicId = ulid().toLowerCase();
    const ruleId = await this.db.insert('commercial_rules', {
      public_id: publicId,
      code: dto.code.trim().toUpperCase(),
      name: dto.name.trim(),
      category: dto.category,
      applies_to: dto.appliesTo || 'STANDARD',
      basis: dto.basis,
      percent_value: dto.percentValue !== undefined ? dto.percentValue : null,
      flat_value: dto.flatValue !== undefined ? dto.flatValue : null,
      min_amount: dto.minAmount !== undefined ? dto.minAmount : null,
      max_amount: dto.maxAmount !== undefined ? dto.maxAmount : null,
      payer: dto.payer || 'OWNER',
      tax_rate: dto.taxRate !== undefined ? dto.taxRate : 18.0,
      priority: dto.priority || 10,
      city: dto.city ? dto.city.trim() : null,
      effective_from: dto.effectiveFrom,
      effective_to: dto.effectiveTo || null,
      is_active: dto.isActive !== false ? 1 : 0,
      is_system: 0,
      created_by: user.id,
    });

    await this.audit.record({
      actor: user,
      action: 'commercial.rule_created',
      objectType: 'commercial_rule',
      objectId: ruleId,
      metadata: { code: dto.code, category: dto.category, priority: dto.priority },
    });

    return this.getRuleById(user, ruleId);
  }

  async updateRule(user: AuthUser, id: number, dto: UpdateCommercialRuleDto) {
    if (!this.isSuperOrAdmin(user)) {
      throw new ForbiddenException('Only Admin users can update Commercial Pricing Rules.');
    }

    const rule = await this.db.one<any>('SELECT * FROM commercial_rules WHERE id = ?', [id]);
    if (!rule) {
      throw new NotFoundException(`Commercial Rule #${id} not found.`);
    }

    const updatePayload: Record<string, any> = {
      updated_by: user.id,
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    };

    if (dto.name !== undefined) updatePayload.name = dto.name.trim();
    if (dto.percentValue !== undefined) updatePayload.percent_value = dto.percentValue;
    if (dto.flatValue !== undefined) updatePayload.flat_value = dto.flatValue;
    if (dto.minAmount !== undefined) updatePayload.min_amount = dto.minAmount;
    if (dto.maxAmount !== undefined) updatePayload.max_amount = dto.maxAmount;
    if (dto.payer !== undefined) updatePayload.payer = dto.payer;
    if (dto.taxRate !== undefined) updatePayload.tax_rate = dto.taxRate;
    if (dto.priority !== undefined) updatePayload.priority = dto.priority;
    if (dto.city !== undefined) updatePayload.city = dto.city ? dto.city.trim() : null;
    if (dto.effectiveFrom !== undefined) updatePayload.effective_from = dto.effectiveFrom;
    if (dto.effectiveTo !== undefined) updatePayload.effective_to = dto.effectiveTo || null;
    if (dto.isActive !== undefined) updatePayload.is_active = dto.isActive ? 1 : 0;

    await this.db.update('commercial_rules', id, updatePayload);

    await this.audit.record({
      actor: user,
      action: 'commercial.rule_updated',
      objectType: 'commercial_rule',
      objectId: id,
      metadata: { changes: Object.keys(updatePayload) },
    });

    return this.getRuleById(user, id);
  }

  async activateRule(user: AuthUser, id: number) {
    if (!this.isSuperOrAdmin(user)) {
      throw new ForbiddenException('Only Admin users can activate Commercial Rules.');
    }
    const rule = await this.db.one<any>('SELECT * FROM commercial_rules WHERE id = ?', [id]);
    if (!rule) throw new NotFoundException(`Commercial Rule #${id} not found.`);

    await this.db.update('commercial_rules', id, { is_active: 1, updated_by: user.id });
    await this.audit.record({
      actor: user,
      action: 'commercial.rule_activated',
      objectType: 'commercial_rule',
      objectId: id,
      metadata: { code: rule.code },
    });
    return { id, isActive: true };
  }

  async deactivateRule(user: AuthUser, id: number) {
    if (!this.isSuperOrAdmin(user)) {
      throw new ForbiddenException('Only Admin users can deactivate Commercial Rules.');
    }
    const rule = await this.db.one<any>('SELECT * FROM commercial_rules WHERE id = ?', [id]);
    if (!rule) throw new NotFoundException(`Commercial Rule #${id} not found.`);

    await this.db.update('commercial_rules', id, { is_active: 0, updated_by: user.id });
    await this.audit.record({
      actor: user,
      action: 'commercial.rule_deactivated',
      objectType: 'commercial_rule',
      objectId: id,
      metadata: { code: rule.code },
    });
    return { id, isActive: false };
  }

  // =========================================================================
  // 3. CALCULATION PREVIEW SIMULATOR (READ-ONLY)
  // =========================================================================
  previewCalculation(dto: PreviewCommercialCalculationDto) {
    const base = Number(dto.baseAmount || 0);
    let fee = 0;

    switch (dto.basis) {
      case 'PERCENT_OF_MONTHLY_RENT':
      case 'PERCENT_OF_TRANSACTION':
        fee = (base * Number(dto.percentValue || 0)) / 100;
        break;
      case 'PERCENT_OF_ANNUAL_RENT':
        fee = ((base * 12) * Number(dto.percentValue || 0)) / 100;
        break;
      case 'FLAT_FEE':
        fee = Number(dto.flatValue || 0);
        break;
      default:
        fee = (base * Number(dto.percentValue || 0)) / 100;
    }

    if (dto.minAmount !== undefined && dto.minAmount !== null && fee < Number(dto.minAmount)) {
      fee = Number(dto.minAmount);
    }
    if (dto.maxAmount !== undefined && dto.maxAmount !== null && fee > Number(dto.maxAmount)) {
      fee = Number(dto.maxAmount);
    }

    const taxRate = Number(dto.taxRate !== undefined ? dto.taxRate : 18.0);
    const tax = Math.round(((fee * taxRate) / 100) * 100) / 100;
    const total = Math.round((fee + tax) * 100) / 100;

    return {
      category: dto.category,
      basis: dto.basis,
      baseAmount: Math.round(base * 100) / 100,
      calculatedFee: Math.round(fee * 100) / 100,
      taxRate,
      calculatedTax: tax,
      totalAmount: total,
      currency: 'INR',
      timestamp: new Date().toISOString(),
      isSimulation: true,
    };
  }

  // =========================================================================
  // 4. RULE MATCHING & DETERMINISTIC ENGINE
  // =========================================================================
  async matchRule(
    category: CommercialCategory | string,
    appliesTo: string = 'STANDARD',
    city?: string,
    targetDate: string = new Date().toISOString().slice(0, 10),
  ) {
    const rules = await this.db.query<any>(
      `SELECT * FROM commercial_rules
        WHERE category = ?
          AND is_active = 1
          AND effective_from <= ?
          AND (effective_to IS NULL OR effective_to >= ?)
          AND (applies_to = ? OR applies_to = 'ALL')
          AND (city IS NULL OR city = ?)
        ORDER BY (city = ?) DESC, (applies_to = ?) DESC, priority DESC, effective_from DESC
        LIMIT 1`,
      [category, targetDate, targetDate, appliesTo, city || null, city || '', appliesTo],
    );

    return rules[0] || null;
  }

  // =========================================================================
  // 5. COMMERCIAL OBLIGATION CREATION (IDEMPOTENT)
  // =========================================================================
  async createCommercialObligation(
    user: AuthUser,
    params: {
      category: CommercialCategory;
      sourceType: 'TENANCY' | 'AGREEMENT' | 'MARKETING_ORDER' | 'LEGAL_CASE' | 'MANUAL';
      sourceId: number;
      baseAmount: number;
      payerUserId: number;
      beneficiaryUserId?: number;
      propertyId?: number;
      tenancyId?: number;
      agreementId?: number;
      appliesTo?: string;
      city?: string;
      ruleId?: number;
      customNotes?: string;
    },
  ) {
    // 1. Idempotency check on (source_type, source_id, category)
    const existing = await this.db.one<any>(
      `SELECT * FROM commercial_obligations
        WHERE source_type = ? AND source_id = ? AND category = ?`,
      [params.sourceType, params.sourceId, params.category],
    );
    if (existing) {
      return this.getObligationById(user, existing.id);
    }

    // 2. Match rule or fallback
    let rule = params.ruleId
      ? await this.db.one<any>('SELECT * FROM commercial_rules WHERE id = ?', [params.ruleId])
      : await this.matchRule(params.category, params.appliesTo || 'STANDARD', params.city);

    let fee = 0;
    const base = Number(params.baseAmount || 0);
    const taxRate = rule ? Number(rule.tax_rate) : 18.0;

    if (params.category === 'MARKETING_PACKAGE' && base > 0) {
      fee = base;
    } else if (rule) {
      switch (rule.basis) {
        case 'PERCENT_OF_MONTHLY_RENT':
        case 'PERCENT_OF_TRANSACTION':
          fee = (base * Number(rule.percent_value || 0)) / 100;
          break;
        case 'PERCENT_OF_ANNUAL_RENT':
          fee = ((base * 12) * Number(rule.percent_value || 0)) / 100;
          break;
        case 'FLAT_FEE':
          fee = Number(rule.flat_value || 0);
          break;
        default:
          fee = (base * Number(rule.percent_value || 0)) / 100;
      }
      if (rule.min_amount && fee < Number(rule.min_amount)) fee = Number(rule.min_amount);
      if (rule.max_amount && fee > Number(rule.max_amount)) fee = Number(rule.max_amount);
    } else {
      // Default fallback fee if no explicit rule matched
      fee = base > 0 ? base : 2000.0;
    }

    fee = Math.round(fee * 100) / 100;
    const tax = Math.round(((fee * taxRate) / 100) * 100) / 100;
    const total = Math.round((fee + tax) * 100) / 100;

    const calculationSnapshot = {
      ruleId: rule?.id || null,
      ruleCode: rule?.code || 'DEFAULT',
      ruleName: rule?.name || 'Default Platform Pricing',
      basis: rule?.basis || 'FLAT_FEE',
      rate: rule?.percent_value ? Number(rule.percent_value) : null,
      flat: rule?.flat_value ? Number(rule.flat_value) : null,
      baseAmount: base,
      feeAmount: fee,
      taxRate,
      taxAmount: tax,
      totalAmount: total,
      payerType: rule?.payer || 'OWNER',
      calculatedAt: new Date().toISOString(),
    };

    const publicId = ulid().toLowerCase();
    const obligationNumber = await this.generateNextObligationNumber();

    const obligationId = await this.db.insert('commercial_obligations', {
      public_id: publicId,
      obligation_number: obligationNumber,
      category: params.category,
      source_type: params.sourceType,
      source_id: params.sourceId,
      rule_id: rule?.id || null,
      property_id: params.propertyId || null,
      tenancy_id: params.tenancyId || null,
      agreement_id: params.agreementId || null,
      payer_user_id: params.payerUserId,
      beneficiary_user_id: params.beneficiaryUserId || null,
      base_amount: base,
      fee_amount: fee,
      tax_rate: taxRate,
      tax_amount: tax,
      total_amount: total,
      currency: 'INR',
      status: 'PENDING_REVIEW',
      calculation_snapshot: JSON.stringify(calculationSnapshot),
      notes: params.customNotes || null,
    });

    await this.audit.record({
      actor: user,
      action: 'commercial.obligation_created',
      objectType: 'commercial_obligation',
      objectId: obligationId,
      metadata: {
        obligationNumber,
        category: params.category,
        totalAmount: total,
        ruleCode: rule?.code || 'DEFAULT',
      },
    });

    return this.getObligationById(user, obligationId);
  }

  // =========================================================================
  // 6. QUERY COMMERCIAL OBLIGATIONS (PAGINATED & FILTERABLE)
  // =========================================================================
  async getObligations(user: AuthUser, query: QueryCommercialObligationsDto) {
    const isMgmt = this.isManagement(user);
    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (!isMgmt) {
      whereClauses.push('(co.payer_user_id = ? OR co.beneficiary_user_id = ?)');
      params.push(user.id, user.id);
    }

    if (query.category) {
      whereClauses.push('co.category = ?');
      params.push(query.category);
    }
    if (query.status) {
      whereClauses.push('co.status = ?');
      params.push(query.status);
    }
    if (query.tenancyId) {
      whereClauses.push('co.tenancy_id = ?');
      params.push(query.tenancyId);
    }
    if (query.propertyId) {
      whereClauses.push('co.property_id = ?');
      params.push(query.propertyId);
    }
    if (query.payerUserId) {
      whereClauses.push('co.payer_user_id = ?');
      params.push(query.payerUserId);
    }
    if (query.from) {
      whereClauses.push('co.created_at >= ?');
      params.push(`${query.from} 00:00:00`);
    }
    if (query.to) {
      whereClauses.push('co.created_at <= ?');
      params.push(`${query.to} 23:59:59`);
    }
    if (query.search) {
      whereClauses.push('(co.obligation_number LIKE ? OR p.title LIKE ? OR u.full_name LIKE ?)');
      const kw = `%${query.search.trim()}%`;
      params.push(kw, kw, kw);
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 25));
    const offset = (page - 1) * limit;

    const where = whereClauses.join(' AND ');

    const rows = await this.db.query<any>(
      `SELECT co.*,
              cr.name AS rule_name,
              cr.code AS rule_code,
              p.title AS property_title,
              p.city AS property_city,
              u.full_name AS payer_name,
              u.email AS payer_email,
              pay.reference_code AS payment_reference,
              pay.status AS payment_status,
              inv.invoice_number,
              inv.id AS linked_invoice_id,
              appr.full_name AS approved_by_name
         FROM commercial_obligations co
         LEFT JOIN commercial_rules cr ON cr.id = co.rule_id
         LEFT JOIN properties p ON p.id = co.property_id
         LEFT JOIN users u ON u.id = co.payer_user_id
         LEFT JOIN payments pay ON pay.id = co.payment_id
         LEFT JOIN invoices inv ON inv.id = co.invoice_id
         LEFT JOIN users appr ON appr.id = co.approved_by
        WHERE ${where}
        ORDER BY co.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) as total
         FROM commercial_obligations co
         LEFT JOIN properties p ON p.id = co.property_id
         LEFT JOIN users u ON u.id = co.payer_user_id
        WHERE ${where}`,
      params,
    );

    return {
      items: rows.map((r) => ({
        id: r.id,
        publicId: r.public_id,
        obligationNumber: r.obligation_number,
        category: r.category,
        sourceType: r.source_type,
        sourceId: r.source_id,
        ruleId: r.rule_id,
        ruleCode: r.rule_code,
        ruleName: r.rule_name,
        propertyId: r.property_id,
        propertyTitle: r.property_title,
        propertyCity: r.property_city,
        tenancyId: r.tenancy_id,
        agreementId: r.agreement_id,
        payerUserId: r.payer_user_id,
        payerName: r.payer_name,
        payerEmail: r.payer_email,
        baseAmount: Number(r.base_amount),
        feeAmount: Number(r.fee_amount),
        taxRate: Number(r.tax_rate),
        taxAmount: Number(r.tax_amount),
        totalAmount: Number(r.total_amount),
        currency: r.currency,
        status: r.status,
        paymentId: r.payment_id,
        paymentReference: r.payment_reference,
        paymentStatus: r.payment_status,
        invoiceId: r.linked_invoice_id,
        invoiceNumber: r.invoice_number,
        disputeId: r.dispute_id,
        approvedByName: r.approved_by_name,
        approvedAt: r.approved_at,
        waiverReason: r.waiver_reason,
        cancellationReason: r.cancellation_reason,
        createdAt: r.created_at,
      })),
      meta: {
        page,
        limit,
        total: Number(countRow?.total || 0),
        totalPages: Math.ceil(Number(countRow?.total || 0) / limit),
      },
    };
  }

  async getObligationById(user: AuthUser, id: number) {
    const isMgmt = this.isManagement(user);

    const row = await this.db.one<any>(
      `SELECT co.*,
              cr.name AS rule_name,
              cr.code AS rule_code,
              cr.basis AS rule_basis,
              p.title AS property_title,
              p.city AS property_city,
              u.full_name AS payer_name,
              u.email AS payer_email,
              pay.reference_code AS payment_reference,
              pay.status AS payment_status,
              pay.amount AS payment_amount,
              pay.total_amount AS payment_total_amount,
              inv.invoice_number,
              inv.id AS linked_invoice_id,
              d.case_number AS dispute_case_number,
              appr.full_name AS approved_by_name,
              wby.full_name AS waived_by_name,
              cby.full_name AS cancelled_by_name
         FROM commercial_obligations co
         LEFT JOIN commercial_rules cr ON cr.id = co.rule_id
         LEFT JOIN properties p ON p.id = co.property_id
         LEFT JOIN users u ON u.id = co.payer_user_id
         LEFT JOIN payments pay ON pay.id = co.payment_id
         LEFT JOIN invoices inv ON inv.id = co.invoice_id
         LEFT JOIN disputes d ON d.id = co.dispute_id
         LEFT JOIN users appr ON appr.id = co.approved_by
         LEFT JOIN users wby ON wby.id = co.waived_by
         LEFT JOIN users cby ON cby.id = co.cancelled_by
        WHERE co.id = ?`,
      [id],
    );

    if (!row) {
      throw new NotFoundException(`Commercial Obligation #${id} not found.`);
    }

    if (!isMgmt && row.payer_user_id !== user.id && row.beneficiary_user_id !== user.id) {
      throw new ForbiddenException('You are not authorized to view this Commercial Obligation.');
    }

    const adjustments = await this.db.query<any>(
      `SELECT ca.*, u.full_name AS authorized_by_name
         FROM commercial_adjustments ca
         JOIN users u ON u.id = ca.authorized_by
        WHERE ca.obligation_id = ?
        ORDER BY ca.created_at DESC`,
      [id],
    );

    let snapshot: any = null;
    try {
      snapshot = typeof row.calculation_snapshot === 'string'
        ? JSON.parse(row.calculation_snapshot)
        : row.calculation_snapshot;
    } catch {
      snapshot = null;
    }

    return {
      id: row.id,
      publicId: row.public_id,
      obligationNumber: row.obligation_number,
      category: row.category,
      sourceType: row.source_type,
      sourceId: row.source_id,
      ruleId: row.rule_id,
      ruleCode: row.rule_code,
      ruleName: row.rule_name,
      propertyId: row.property_id,
      propertyTitle: row.property_title,
      propertyCity: row.property_city,
      tenancyId: row.tenancy_id,
      agreementId: row.agreement_id,
      payerUserId: row.payer_user_id,
      payerName: row.payer_name,
      payerEmail: row.payer_email,
      baseAmount: Number(row.base_amount),
      feeAmount: Number(row.fee_amount),
      taxRate: Number(row.tax_rate),
      taxAmount: Number(row.tax_amount),
      totalAmount: Number(row.total_amount),
      currency: row.currency,
      status: row.status,
      calculationSnapshot: snapshot,
      paymentId: row.payment_id,
      paymentReference: row.payment_reference,
      paymentStatus: row.payment_status,
      invoiceId: row.linked_invoice_id,
      invoiceNumber: row.invoice_number,
      disputeId: row.dispute_id,
      disputeCaseNumber: row.dispute_case_number,
      approvedByName: row.approved_by_name,
      approvedAt: row.approved_at,
      waivedByName: row.waived_by_name,
      waivedAt: row.waived_at,
      waiverReason: row.waiver_reason,
      cancelledByName: row.cancelled_by_name,
      cancelledAt: row.cancelled_at,
      cancellationReason: row.cancellation_reason,
      notes: row.notes,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      adjustments: adjustments.map((a) => ({
        id: a.id,
        publicId: a.public_id,
        adjustmentType: a.adjustment_type,
        amountAdjusted: Number(a.amount_adjusted),
        reason: a.reason,
        authorizedByName: a.authorized_by_name,
        createdAt: a.created_at,
      })),
    };
  }

  // =========================================================================
  // 7. MANAGEMENT LIFECYCLE: APPROVE, WAIVE, ADJUST, CANCEL
  // =========================================================================
  async approveObligation(user: AuthUser, id: number, dto: ApproveCommercialObligationDto) {
    if (!this.isSuperOrAdmin(user)) {
      throw new ForbiddenException('Only Odibrick Management can approve Commercial Obligations.');
    }

    const obligation = await this.db.one<any>(
      'SELECT * FROM commercial_obligations WHERE id = ?',
      [id],
    );
    if (!obligation) {
      throw new NotFoundException(`Commercial Obligation #${id} not found.`);
    }

    if (obligation.status === 'PAID') {
      throw new BadRequestException('This commercial obligation is already paid.');
    }
    if (obligation.status === 'WAIVED' || obligation.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot approve a ${obligation.status.toLowerCase()} obligation.`);
    }

    // Create payment obligation through PaymentsService if not already existing
    let paymentId = obligation.payment_id;
    if (!paymentId) {
      paymentId = await this.payments.createPayment({
        payerUserId: obligation.payer_user_id,
        payeeUserId: null, // Odibrick platform is payee
        tenancyId: obligation.tenancy_id || undefined,
        propertyId: obligation.property_id || undefined,
        purpose: obligation.category as any,
        amount: Number(obligation.fee_amount),
        taxRate: Number(obligation.tax_rate),
        dueDate: dto.dueDate || new Date().toISOString().slice(0, 10),
      });
    }

    await this.db.update('commercial_obligations', id, {
      status: 'PAYMENT_DUE',
      payment_id: paymentId,
      approved_by: user.id,
      approved_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      notes: dto.notes || obligation.notes,
    });

    await this.audit.record({
      actor: user,
      action: 'commercial.approved',
      objectType: 'commercial_obligation',
      objectId: id,
      metadata: { paymentId, totalAmount: obligation.total_amount },
    });

    return this.getObligationById(user, id);
  }

  async waiveObligation(user: AuthUser, id: number, dto: WaiveCommercialObligationDto) {
    if (!this.isSuperOrAdmin(user)) {
      throw new ForbiddenException('Only Odibrick Management can waive Commercial Obligations.');
    }

    const obligation = await this.db.one<any>(
      'SELECT * FROM commercial_obligations WHERE id = ?',
      [id],
    );
    if (!obligation) {
      throw new NotFoundException(`Commercial Obligation #${id} not found.`);
    }

    if (obligation.status === 'PAID') {
      throw new BadRequestException('Cannot waive an already PAID commercial obligation.');
    }
    if (obligation.status === 'WAIVED') {
      throw new BadRequestException('This commercial obligation is already waived.');
    }

    const waiverAmount = dto.waiverAmount !== undefined ? dto.waiverAmount : Number(obligation.total_amount);

    // Record adjustment
    const adjPublicId = ulid().toLowerCase();
    await this.db.insert('commercial_adjustments', {
      public_id: adjPublicId,
      obligation_id: id,
      adjustment_type: 'WAIVER',
      amount_adjusted: waiverAmount,
      reason: dto.reason.trim(),
      authorized_by: user.id,
    });

    // If payment was created and still DUE, cancel it safely
    if (obligation.payment_id) {
      const payment = await this.db.one<any>(
        'SELECT status FROM payments WHERE id = ?',
        [obligation.payment_id],
      );
      if (payment && payment.status === 'DUE') {
        await this.db.update('payments', obligation.payment_id, {
          status: 'CANCELLED',
          notes: `Waived by management: ${dto.reason.trim()}`,
        });
      }
    }

    await this.db.update('commercial_obligations', id, {
      status: 'WAIVED',
      waived_by: user.id,
      waived_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      waiver_reason: dto.reason.trim(),
    });

    await this.audit.record({
      actor: user,
      action: 'commercial.waived',
      objectType: 'commercial_obligation',
      objectId: id,
      metadata: { reason: dto.reason, waiverAmount },
    });

    return this.getObligationById(user, id);
  }

  async adjustObligation(user: AuthUser, id: number, dto: AdjustCommercialObligationDto) {
    if (!this.isSuperOrAdmin(user)) {
      throw new ForbiddenException('Only Odibrick Management can adjust Commercial Obligations.');
    }

    const obligation = await this.db.one<any>(
      'SELECT * FROM commercial_obligations WHERE id = ?',
      [id],
    );
    if (!obligation) {
      throw new NotFoundException(`Commercial Obligation #${id} not found.`);
    }

    if (obligation.status === 'PAID') {
      throw new BadRequestException('Cannot adjust an already settled commercial obligation directly.');
    }

    const adjPublicId = ulid().toLowerCase();
    await this.db.insert('commercial_adjustments', {
      public_id: adjPublicId,
      obligation_id: id,
      adjustment_type: dto.adjustmentType,
      amount_adjusted: dto.amountAdjusted,
      reason: dto.reason.trim(),
      authorized_by: user.id,
    });

    // Recalculate adjusted total
    const newFee = Math.max(0, Number(obligation.fee_amount) + Number(dto.amountAdjusted));
    const taxRate = Number(obligation.tax_rate);
    const newTax = Math.round(((newFee * taxRate) / 100) * 100) / 100;
    const newTotal = Math.round((newFee + newTax) * 100) / 100;

    await this.db.update('commercial_obligations', id, {
      fee_amount: newFee,
      tax_amount: newTax,
      total_amount: newTotal,
      notes: dto.notes || obligation.notes,
    });

    // If payment exists and is DUE, update payment amount
    if (obligation.payment_id) {
      const payment = await this.db.one<any>('SELECT status FROM payments WHERE id = ?', [obligation.payment_id]);
      if (payment && payment.status === 'DUE') {
        await this.db.update('payments', obligation.payment_id, {
          amount: newFee,
          tax_amount: newTax,
          total_amount: newTotal,
        });
      }
    }

    await this.audit.record({
      actor: user,
      action: 'commercial.adjusted',
      objectType: 'commercial_obligation',
      objectId: id,
      metadata: { adjustmentType: dto.adjustmentType, amountAdjusted: dto.amountAdjusted, newTotal },
    });

    return this.getObligationById(user, id);
  }

  async cancelObligation(user: AuthUser, id: number, dto: CancelCommercialObligationDto) {
    if (!this.isSuperOrAdmin(user)) {
      throw new ForbiddenException('Only Odibrick Management can cancel Commercial Obligations.');
    }

    const obligation = await this.db.one<any>(
      'SELECT * FROM commercial_obligations WHERE id = ?',
      [id],
    );
    if (!obligation) {
      throw new NotFoundException(`Commercial Obligation #${id} not found.`);
    }

    if (obligation.status === 'PAID') {
      throw new BadRequestException('Cannot cancel an already PAID commercial obligation.');
    }

    if (obligation.payment_id) {
      const payment = await this.db.one<any>('SELECT status FROM payments WHERE id = ?', [obligation.payment_id]);
      if (payment && payment.status === 'DUE') {
        await this.db.update('payments', obligation.payment_id, {
          status: 'CANCELLED',
          notes: `Cancelled by management: ${dto.reason.trim()}`,
        });
      }
    }

    await this.db.update('commercial_obligations', id, {
      status: 'CANCELLED',
      cancelled_by: user.id,
      cancelled_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
      cancellation_reason: dto.reason.trim(),
    });

    await this.audit.record({
      actor: user,
      action: 'commercial.cancelled',
      objectType: 'commercial_obligation',
      objectId: id,
      metadata: { reason: dto.reason },
    });

    return this.getObligationById(user, id);
  }

  // =========================================================================
  // 8. PAYMENT SYNC HOOK (CALLED WHEN PAYMENT BECOMES PAID)
  // =========================================================================
  async syncPaymentStatus(paymentId: number, newStatus: string, invoiceId?: number) {
    const obligation = await this.db.one<any>(
      'SELECT id, status FROM commercial_obligations WHERE payment_id = ?',
      [paymentId],
    );
    if (!obligation) return;

    const updatePayload: Record<string, any> = {};
    if (newStatus === 'PAID') {
      updatePayload.status = 'PAID';
    } else if (newStatus === 'CANCELLED' && obligation.status !== 'PAID') {
      updatePayload.status = 'CANCELLED';
    }

    if (invoiceId) {
      updatePayload.invoice_id = invoiceId;
    }

    if (Object.keys(updatePayload).length > 0) {
      await this.db.update('commercial_obligations', obligation.id, updatePayload);
    }
  }

  // =========================================================================
  // 9. REVENUE ANALYTICAL REPORTING
  // =========================================================================
  async getRevenueReporting(user: AuthUser, query: QueryCommercialRevenueDto) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access Revenue Reporting.');
    }

    const start = query.from ? `${query.from} 00:00:00` : '2020-01-01 00:00:00';
    const end = query.to ? `${query.to} 23:59:59` : '2099-12-31 23:59:59';
    const categoryFilter = query.category ? 'AND co.category = ?' : '';
    const params = query.category ? [start, end, query.category] : [start, end];

    // Summary totals
    const summary = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(fee_amount), 0) AS gross_taxable_revenue,
         COALESCE(SUM(tax_amount), 0) AS total_gst_collected,
         COALESCE(SUM(total_amount), 0) AS gross_total_billed,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS total_paid,
         COALESCE(SUM(CASE WHEN status = 'PAYMENT_DUE' THEN total_amount ELSE 0 END), 0) AS total_outstanding,
         COALESCE(SUM(CASE WHEN status = 'WAIVED' THEN total_amount ELSE 0 END), 0) AS total_waived,
         COALESCE(SUM(CASE WHEN status = 'DISPUTED' THEN total_amount ELSE 0 END), 0) AS total_disputed,
         COUNT(*) as total_records
       FROM commercial_obligations co
       WHERE co.created_at BETWEEN ? AND ? ${categoryFilter}`,
      params,
    );

    // Grouping dimension
    let groupSelect = "co.category AS group_key, co.category AS group_label";
    let groupBy = "co.category";

    if (query.groupBy === 'month') {
      groupSelect = "DATE_FORMAT(co.created_at, '%Y-%m') AS group_key, DATE_FORMAT(co.created_at, '%M %Y') AS group_label";
      groupBy = "DATE_FORMAT(co.created_at, '%Y-%m'), DATE_FORMAT(co.created_at, '%M %Y')";
    } else if (query.groupBy === 'property') {
      groupSelect = "co.property_id AS group_key, COALESCE(p.title, 'General Platform') AS group_label";
      groupBy = "co.property_id, p.title";
    } else if (query.groupBy === 'rule') {
      groupSelect = "co.rule_id AS group_key, COALESCE(cr.name, 'Default Rule') AS group_label";
      groupBy = "co.rule_id, cr.name";
    }

    const breakdown = await this.db.query<any>(
      `SELECT
         ${groupSelect},
         COUNT(*) AS count,
         COALESCE(SUM(co.fee_amount), 0) AS taxable_subtotal,
         COALESCE(SUM(co.tax_amount), 0) AS gst_total,
         COALESCE(SUM(co.total_amount), 0) AS total_billed,
         COALESCE(SUM(CASE WHEN co.status = 'PAID' THEN co.total_amount ELSE 0 END), 0) AS total_paid,
         COALESCE(SUM(CASE WHEN co.status = 'PAYMENT_DUE' THEN co.total_amount ELSE 0 END), 0) AS total_outstanding
       FROM commercial_obligations co
       LEFT JOIN properties p ON p.id = co.property_id
       LEFT JOIN commercial_rules cr ON cr.id = co.rule_id
       WHERE co.created_at BETWEEN ? AND ? ${categoryFilter}
       GROUP BY ${groupBy}
       ORDER BY total_billed DESC`,
      params,
    );

    return {
      summary: {
        taxableRevenue: Number(summary?.gross_taxable_revenue || 0),
        gstCollected: Number(summary?.total_gst_collected || 0),
        totalBilled: Number(summary?.gross_total_billed || 0),
        totalPaid: Number(summary?.total_paid || 0),
        totalOutstanding: Number(summary?.total_outstanding || 0),
        totalWaived: Number(summary?.total_waived || 0),
        totalDisputed: Number(summary?.total_disputed || 0),
        totalRecords: Number(summary?.total_records || 0),
      },
      breakdown: breakdown.map((b) => ({
        key: String(b.group_key),
        label: b.group_label,
        count: Number(b.count),
        taxableSubtotal: Number(b.taxable_subtotal),
        gstTotal: Number(b.gst_total),
        totalBilled: Number(b.total_billed),
        totalPaid: Number(b.total_paid),
        totalOutstanding: Number(b.total_outstanding),
      })),
      timestamp: new Date().toISOString(),
    };
  }
}
