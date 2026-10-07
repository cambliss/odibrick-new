import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';
import { pageParams, paginate } from '../../common/util/pagination';

@Injectable()
export class AdminService {
  constructor(private readonly db: DatabaseService, private readonly audit: AuditService) {}

  /** Everything the control centre needs in a single round trip. */
  async kpis() {
    const [totals, revenueSeries, funnel, cities] = await Promise.all([
      this.db.one('SELECT * FROM v_admin_kpis'),
      this.db.query(
        `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month,
                SUM(CASE WHEN purpose = 'COMMISSION' THEN total_amount ELSE 0 END) AS commission,
                SUM(CASE WHEN purpose = 'MARKETING_PACKAGE' THEN total_amount ELSE 0 END) AS marketing,
                SUM(CASE WHEN purpose IN ('SERVICE_FEE','LEGAL_FEE') THEN total_amount ELSE 0 END) AS services,
                SUM(total_amount) AS total
           FROM payments
          WHERE status = 'PAID' AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
          GROUP BY month ORDER BY month`),
      this.db.one(
        `SELECT (SELECT COUNT(*) FROM property_views WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS views,
                (SELECT COUNT(*) FROM enquiries WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS enquiries,
                (SELECT COUNT(*) FROM applications WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS applications,
                (SELECT COUNT(*) FROM tenancies WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) AS tenancies`),
      this.db.query(
        `SELECT city, COUNT(*) AS properties,
                SUM(status = 'ACTIVE') AS active,
                AVG(NULLIF(rent_amount,0)) AS avg_rent
           FROM properties GROUP BY city ORDER BY properties DESC LIMIT 10`),
    ]);

    const usersByRole = await this.db.query(
      `SELECT r.code AS role, COUNT(ur.user_id) AS count
         FROM roles r LEFT JOIN user_roles ur ON ur.role_id = r.id
        GROUP BY r.code ORDER BY count DESC`,
    );

    return { totals, revenueSeries, funnel, cities, usersByRole };
  }

  async users(filters: { role?: string; status?: string; q?: string }, page?: number, perPage?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, perPage);
    const where = ['u.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (filters.role) {
      where.push('EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = ?)');
      params.push(filters.role);
    }
    if (filters.status) {
      where.push('u.status = ?');
      params.push(filters.status);
    }
    if (filters.q) {
      where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ?)');
      const like = `%${filters.q}%`;
      params.push(like, like, like);
    }
    const clause = where.join(' AND ');
    const rows = await this.db.query(
      `SELECT u.id, u.public_id, u.full_name, u.email, u.phone, u.status, u.created_at, u.last_login_at,
              u.is_demo,
              (SELECT GROUP_CONCAT(r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id) AS roles,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS kyc_status,
              (SELECT COUNT(*) FROM properties p WHERE p.listed_by_user_id = u.id) AS property_count
         FROM users u WHERE ${clause}
        ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM users u WHERE ${clause}`, params,
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  async setUserStatus(actor: AuthUser, userId: number, status: string, reason?: string) {
    const target = await this.db.one<any>('SELECT id, email FROM users WHERE id = ?', [userId]);
    if (!target) throw new NotFoundException('User not found.');
    if (target.id === actor.id) throw new ForbiddenException('You cannot change your own account status.');

    await this.db.update('users', userId, { status });
    if (status !== 'ACTIVE') {
      await this.db.execute(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId],
      );
    }
    await this.audit.record({
      actor, action: 'user.status_changed', objectType: 'user', objectId: userId,
      metadata: { status, reason },
    });
    return { id: userId, status };
  }

  async assignRole(actor: AuthUser, userId: number, roleCode: string, grant: boolean) {
    if (roleCode === 'SUPER_ADMIN' && !actor.roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('Only a super admin can grant that role.');
    }
    if (grant) {
      await this.db.execute(
        `INSERT IGNORE INTO user_roles (user_id, role_id, granted_by)
         SELECT ?, id, ? FROM roles WHERE code = ?`,
        [userId, actor.id, roleCode],
      );
    } else {
      await this.db.execute(
        'DELETE ur FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ? AND r.code = ?',
        [userId, roleCode],
      );
    }
    await this.audit.record({
      actor, action: grant ? 'user.role_granted' : 'user.role_revoked', objectType: 'user', objectId: userId,
      metadata: { roleCode },
    });
    return { userId, roleCode, granted: grant };
  }

  async settings(group?: string) {
    const params = group ? [group] : [];
    return this.db.query(
      `SELECT setting_key, value_json, group_name, description, updated_at
         FROM platform_settings ${group ? 'WHERE group_name = ?' : ''} ORDER BY group_name, setting_key`,
      params,
    );
  }

  async updateSetting(actor: AuthUser, key: string, value: unknown) {
    const existing = await this.db.one<any>('SELECT setting_key FROM platform_settings WHERE setting_key = ?', [key]);
    if (!existing) throw new NotFoundException('Unknown setting.');
    await this.db.execute(
      'UPDATE platform_settings SET value_json = ?, updated_by = ? WHERE setting_key = ?',
      [JSON.stringify(value), actor.id, key],
    );
    await this.audit.record({
      actor, action: 'settings.updated', objectType: 'setting', metadata: { key, value },
    });
    return { key, value };
  }

  async commissionRules() {
    return this.db.query('SELECT * FROM commission_rules ORDER BY applies_to, effective_from DESC');
  }

  async saveCommissionRule(actor: AuthUser, rule: any, id?: number) {
    const payload = {
      code: rule.code,
      name: rule.name,
      applies_to: rule.appliesTo,
      basis: rule.basis,
      percent_value: rule.percentValue ?? null,
      flat_value: rule.flatValue ?? null,
      min_amount: rule.minAmount ?? null,
      max_amount: rule.maxAmount ?? null,
      payer: rule.payer ?? 'OWNER',
      tax_rate: rule.taxRate ?? 18,
      city: rule.city ?? null,
      effective_from: rule.effectiveFrom,
      effective_to: rule.effectiveTo ?? null,
      is_active: rule.isActive === false ? 0 : 1,
    };
    const ruleId = id ? (await this.db.update('commission_rules', id, payload), id)
                      : await this.db.insert('commission_rules', payload);
    await this.audit.record({ actor, action: 'commission.rule_saved', objectType: 'commission_rule', objectId: ruleId });
    return { id: ruleId };
  }

  async auditLog(filters: { actorId?: number; action?: string; objectType?: string }, page?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, 50);
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.actorId) {
      where.push('a.actor_id = ?');
      params.push(filters.actorId);
    }
    if (filters.action) {
      where.push('a.action LIKE ?');
      params.push(`${filters.action}%`);
    }
    if (filters.objectType) {
      where.push('a.object_type = ?');
      params.push(filters.objectType);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.query(
      `SELECT a.id, a.action, a.object_type, a.object_id, a.result, a.ip, a.metadata, a.created_at,
              u.full_name AS actor_name, u.email AS actor_email, a.actor_role
         FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
         ${clause} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM audit_logs a ${clause}`, params,
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  /** Simple, explainable heuristics — flagged for a human, never auto-enforced. */
  async fraudSignals() {
    const [duplicates, rapidListings, mismatchedPricing] = await Promise.all([
      this.db.query(
        `SELECT address_line1, pincode, COUNT(*) AS listings, GROUP_CONCAT(id) AS property_ids
           FROM properties WHERE status IN ('ACTIVE','PENDING_VERIFICATION') AND deleted_at IS NULL
          GROUP BY address_line1, pincode HAVING listings > 1 LIMIT 25`),
      this.db.query(
        `SELECT listed_by_user_id, u.full_name, COUNT(*) AS listings
           FROM properties p JOIN users u ON u.id = p.listed_by_user_id
          WHERE p.created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
          GROUP BY listed_by_user_id, u.full_name HAVING listings > 15 LIMIT 25`),
      this.db.query(
        `SELECT p.id, p.title, p.city, p.locality, p.rent_amount, ROUND(avg_rent) AS locality_avg
           FROM properties p
           JOIN (SELECT city, locality, AVG(rent_amount) AS avg_rent FROM properties
                  WHERE status = 'ACTIVE' AND rent_amount > 0 GROUP BY city, locality HAVING COUNT(*) > 4) a
             ON a.city = p.city AND a.locality = p.locality
          WHERE p.status = 'ACTIVE' AND p.rent_amount < a.avg_rent * 0.4 LIMIT 25`),
    ]);
    return { duplicates, rapidListings, mismatchedPricing };
  }

  /** Operational governance overview for platform management. */
  async operationalOverview() {
    const [
      pendingKyc,
      pendingProperties,
      unassignedLegalCases,
      openDisputes,
      moveOutTenancies,
      recentAuditEvents,
    ] = await Promise.all([
      this.db.query(
        `SELECT k.id, k.legal_name, k.subject_type, k.id_type, k.submitted_at, u.id AS user_id, u.full_name, u.email
           FROM kyc_records k JOIN users u ON u.id = k.user_id
          WHERE k.status = 'SUBMITTED' ORDER BY k.submitted_at ASC LIMIT 10`,
      ),
      this.db.query(
        `SELECT p.id, p.title, p.city, p.locality, p.rent_amount, p.created_at, u.full_name AS owner_name
           FROM properties p JOIN users u ON u.id = p.listed_by_user_id
          WHERE p.status = 'PENDING_VERIFICATION' AND p.deleted_at IS NULL ORDER BY p.created_at ASC LIMIT 10`,
      ),
      this.db.query(
        `SELECT c.id, c.case_number, c.case_type, c.status, c.priority, c.opened_at,
                o.full_name AS owner_name, t.full_name AS tenant_name
           FROM legal_cases c
           JOIN tenancies tn ON tn.id = c.tenancy_id
           JOIN users o ON o.id = tn.owner_user_id
           JOIN users t ON t.id = tn.tenant_user_id
          WHERE c.assigned_to IS NULL AND c.status NOT IN ('EXECUTED', 'CANCELLED')
          ORDER BY c.opened_at ASC LIMIT 10`,
      ),
      this.db.query(
        `SELECT d.id, d.case_number, d.category, d.status, d.amount_claimed, d.summary, d.created_at,
                r.full_name AS raised_by_name
           FROM disputes d JOIN users r ON r.id = d.raised_by
          WHERE d.status IN ('OPEN', 'UNDER_REVIEW') ORDER BY d.created_at ASC LIMIT 10`,
      ),
      this.db.query(
        `SELECT t.id, t.public_id, t.stage, t.rent_amount, t.deposit_amount,
                p.title AS property_title, o.full_name AS owner_name, tn.full_name AS tenant_name
           FROM tenancies t
           JOIN properties p ON p.id = t.property_id
           JOIN users o ON o.id = t.owner_user_id
           JOIN users tn ON tn.id = t.tenant_user_id
          WHERE t.stage = 'MOVE_OUT' ORDER BY t.updated_at DESC LIMIT 10`,
      ),
      this.db.query(
        `SELECT a.id, a.action, a.object_type, a.object_id, a.created_at, u.full_name AS actor_name, a.actor_role
           FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_id
          WHERE a.action LIKE 'management.%' OR a.action LIKE 'user.%' OR a.action LIKE 'kyc.%'
          ORDER BY a.id DESC LIMIT 10`,
      ),
    ]);

    return {
      pendingKyc,
      pendingProperties,
      unassignedLegalCases,
      openDisputes,
      moveOutTenancies,
      recentAuditEvents,
    };
  }

  private parsePeriod(period?: string, from?: string, to?: string): { from: string; to: string } {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const formatDate = (d: Date, endOfDay = false) => {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${endOfDay ? '23:59:59' : '00:00:00'}`;
    };

    if (period === 'custom' && from && to) {
      const fromStr = from.includes(' ') ? from : `${from} 00:00:00`;
      const toStr = to.includes(' ') ? to : `${to} 23:59:59`;
      return { from: fromStr, to: toStr };
    }

    if (period === 'today') {
      return { from: formatDate(now), to: formatDate(now, true) };
    }

    if (period === 'this_week') {
      const startOfWeek = new Date(now);
      const day = startOfWeek.getDay();
      const diff = (day === 0 ? -6 : 1) - day;
      startOfWeek.setDate(startOfWeek.getDate() + diff);
      return { from: formatDate(startOfWeek), to: formatDate(now, true) };
    }

    if (period === 'last_month') {
      const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: formatDate(startOfLastMonth), to: formatDate(endOfLastMonth, true) };
    }

    if (period === 'last_3_months') {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { from: formatDate(threeMonthsAgo), to: formatDate(now, true) };
    }

    if (period === 'last_6_months') {
      const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1);
      return { from: formatDate(sixMonthsAgo), to: formatDate(now, true) };
    }

    if (period === 'last_12_months') {
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, 1);
      return { from: formatDate(twelveMonthsAgo), to: formatDate(now, true) };
    }

    // Default: 'this_month'
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: formatDate(startOfMonth), to: formatDate(now, true) };
  }

  /** Platform-wide management financial overview */
  async financeOverview(query?: { period?: string; from?: string; to?: string }) {
    const { from, to } = this.parsePeriod(query?.period, query?.from, query?.to);

    const [
      summaryTotals,
      refundTotals,
      paymentBreakdown,
      revenueSeries,
      overduePayments,
      commissionQueue,
      recentTransactions,
      financialExceptions,
      activeMoveOutSettlements,
      openFinancialDisputes,
      manualReconciliation,
    ] = await Promise.all([
      this.db.one<{
        grossPaymentVolume: number;
        totalCollected: number;
        totalOutstanding: number;
        totalOverdue: number;
        commissionRevenue: number;
        marketingRevenue: number;
        serviceRevenue: number;
      }>(
        `SELECT 
           COALESCE(SUM(CASE WHEN created_at BETWEEN ? AND ? THEN total_amount ELSE 0 END), 0) AS grossPaymentVolume,
           COALESCE(SUM(CASE WHEN status = 'PAID' AND paid_at BETWEEN ? AND ? THEN total_amount ELSE 0 END), 0) AS totalCollected,
           COALESCE(SUM(CASE WHEN status IN ('DUE', 'INITIATED', 'PROCESSING') THEN total_amount ELSE 0 END), 0) AS totalOutstanding,
           COALESCE(SUM(CASE WHEN status IN ('DUE', 'INITIATED', 'PROCESSING') AND due_date < CURDATE() THEN total_amount ELSE 0 END), 0) AS totalOverdue,
           COALESCE(SUM(CASE WHEN purpose = 'COMMISSION' AND status = 'PAID' AND paid_at BETWEEN ? AND ? THEN total_amount ELSE 0 END), 0) AS commissionRevenue,
           COALESCE(SUM(CASE WHEN purpose = 'MARKETING_PACKAGE' AND status = 'PAID' AND paid_at BETWEEN ? AND ? THEN total_amount ELSE 0 END), 0) AS marketingRevenue,
           COALESCE(SUM(CASE WHEN purpose IN ('SERVICE_FEE', 'LEGAL_FEE') AND status = 'PAID' AND paid_at BETWEEN ? AND ? THEN total_amount ELSE 0 END), 0) AS serviceRevenue
         FROM payments`,
        [from, to, from, to, from, to, from, to, from, to],
      ),
      this.db.one<{ totalRefunded: number }>(
        `SELECT COALESCE(SUM(total_amount), 0) AS totalRefunded 
           FROM payments 
          WHERE (purpose = 'REFUND' OR status IN ('REFUNDED', 'PARTIALLY_REFUNDED')) 
            AND status = 'PAID' AND paid_at BETWEEN ? AND ?`,
        [from, to],
      ),
      this.db.query(
        `SELECT purpose,
                COUNT(*) AS count,
                COALESCE(SUM(total_amount), 0) AS totalAmount,
                COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS collectedAmount,
                COALESCE(SUM(CASE WHEN status IN ('DUE', 'INITIATED', 'PROCESSING') THEN total_amount ELSE 0 END), 0) AS outstandingAmount
           FROM payments
          WHERE created_at BETWEEN ? AND ?
          GROUP BY purpose
          ORDER BY totalAmount DESC`,
        [from, to],
      ),
      this.db.query(
        `SELECT DATE_FORMAT(paid_at, '%Y-%m') AS month,
                COALESCE(SUM(CASE WHEN purpose = 'COMMISSION' THEN total_amount ELSE 0 END), 0) AS commission,
                COALESCE(SUM(CASE WHEN purpose = 'MARKETING_PACKAGE' THEN total_amount ELSE 0 END), 0) AS marketing,
                COALESCE(SUM(CASE WHEN purpose IN ('SERVICE_FEE','LEGAL_FEE') THEN total_amount ELSE 0 END), 0) AS services,
                COALESCE(SUM(CASE WHEN purpose IN ('COMMISSION','MARKETING_PACKAGE','SERVICE_FEE','LEGAL_FEE') THEN total_amount ELSE 0 END), 0) AS platformRevenue,
                COALESCE(SUM(total_amount), 0) AS grossVolume
           FROM payments
          WHERE status = 'PAID' AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
          GROUP BY month ORDER BY month`,
      ),
      this.db.query(
        `SELECT p.id, p.public_id, p.reference_code, p.purpose, p.amount, p.total_amount, p.currency,
                p.status, p.settlement_status, p.due_date,
                DATEDIFF(CURDATE(), p.due_date) AS days_overdue,
                p.payer_user_id, payer.full_name AS payer_name, payer.email AS payer_email,
                p.payee_user_id, payee.full_name AS payee_name,
                p.tenancy_id, t.public_id AS tenancy_public_id, prop.title AS property_title
           FROM payments p
           JOIN users payer ON payer.id = p.payer_user_id
           LEFT JOIN users payee ON payee.id = p.payee_user_id
           LEFT JOIN tenancies t ON t.id = p.tenancy_id
           LEFT JOIN properties prop ON prop.id = p.property_id
          WHERE p.status IN ('DUE', 'INITIATED', 'PROCESSING')
            AND p.due_date < CURDATE()
          ORDER BY p.due_date ASC
          LIMIT 25`,
      ),
      this.db.query(
        `SELECT c.id, c.tenancy_id, t.public_id AS tenancy_public_id, prop.title AS property_title,
                c.cycle_year, c.period_start, c.period_end, c.base_amount, c.commission_amount, c.tax_amount, c.total_amount,
                c.payer, c.status, c.grace_until, c.payment_id, c.invoice_id,
                owner.full_name AS owner_name, owner.email AS owner_email,
                inv.invoice_number, inv.status AS invoice_status,
                cr.name AS rule_name, cr.basis AS rule_basis
           FROM commissions c
           JOIN tenancies t ON t.id = c.tenancy_id
           LEFT JOIN properties prop ON prop.id = t.property_id
           LEFT JOIN users owner ON owner.id = t.owner_user_id
           LEFT JOIN invoices inv ON inv.id = c.invoice_id
           LEFT JOIN commission_rules cr ON cr.id = c.rule_id
          ORDER BY c.created_at DESC
          LIMIT 25`,
      ),
      this.db.query(
        `SELECT pt.id, pt.payment_id, pt.txn_reference, pt.direction, pt.provider, pt.method,
                pt.amount, pt.currency, pt.status, pt.occurred_at,
                p.reference_code AS payment_reference, p.purpose,
                payer.full_name AS payer_name
           FROM payment_transactions pt
           JOIN payments p ON p.id = pt.payment_id
           JOIN users payer ON payer.id = p.payer_user_id
          ORDER BY pt.occurred_at DESC
          LIMIT 20`,
      ),
      this.db.query(
        `SELECT 'STUCK_PAYMENT' AS exception_type,
                p.id AS record_id, p.reference_code, p.purpose, p.total_amount, p.status, p.created_at,
                CONCAT('Payment stuck in ', p.status, ' for over 24 hours') AS description
           FROM payments p
          WHERE p.status IN ('INITIATED', 'PROCESSING') AND p.created_at <= DATE_SUB(NOW(), INTERVAL 24 HOUR)
         UNION ALL
         SELECT 'FAILED_TRANSACTION' AS exception_type,
                pt.id AS record_id, pt.txn_reference AS reference_code, p.purpose, pt.amount AS total_amount, pt.status, pt.occurred_at AS created_at,
                CONCAT('Transaction failed: ', COALESCE(pt.failure_reason, 'Provider failure')) AS description
           FROM payment_transactions pt
           JOIN payments p ON p.id = pt.payment_id
          WHERE pt.status = 'FAILED'
         UNION ALL
         SELECT 'PENDING_REFUND' AS exception_type,
                p.id AS record_id, p.reference_code, p.purpose, p.total_amount, p.status, p.created_at,
                'Refund payment waiting to be settled' AS description
           FROM payments p
          WHERE p.purpose = 'REFUND' AND p.status = 'DUE'
         ORDER BY created_at DESC
         LIMIT 25`,
      ),
      this.db.query(
        `SELECT t.id AS tenancy_id, t.public_id AS tenancy_public_id, t.stage, t.rent_amount, t.deposit_amount,
                t.start_date, t.end_date,
                prop.title AS property_title,
                tenant.full_name AS tenant_name, owner.full_name AS owner_name,
                p.id AS refund_payment_id, p.reference_code AS refund_reference, p.total_amount AS refund_amount, p.status AS refund_status
           FROM tenancies t
           JOIN properties prop ON prop.id = t.property_id
           JOIN users tenant ON tenant.id = t.tenant_user_id
           JOIN users owner ON owner.id = t.owner_user_id
           LEFT JOIN payments p ON p.tenancy_id = t.id AND p.purpose = 'REFUND'
          WHERE t.stage = 'MOVE_OUT' OR (p.id IS NOT NULL AND p.status IN ('DUE', 'INITIATED', 'PROCESSING'))
          ORDER BY t.updated_at DESC
          LIMIT 15`,
      ),
      this.db.query(
        `SELECT d.id, d.case_number, d.category, d.status, d.amount_claimed, d.summary, d.created_at,
                d.tenancy_id, t.public_id AS tenancy_public_id,
                prop.title AS property_title,
                raised.full_name AS raised_by_name, against.full_name AS against_name
           FROM disputes d
           LEFT JOIN tenancies t ON t.id = d.tenancy_id
           LEFT JOIN properties prop ON prop.id = t.property_id
           LEFT JOIN users raised ON raised.id = d.raised_by
           LEFT JOIN users against ON against.id = d.against_user_id
          WHERE d.status NOT IN ('RESOLVED', 'CLOSED', 'WITHDRAWN')
            AND (d.amount_claimed > 0 OR d.category IN ('DEPOSIT', 'PAYMENT', 'MAINTENANCE'))
          ORDER BY d.created_at DESC
          LIMIT 15`,
      ),
      this.db.query(
        `SELECT p.id, p.reference_code, p.purpose, p.total_amount, p.currency, p.status, p.settlement_status,
                p.settlement_mode, p.paid_at, p.notes,
                payer.full_name AS payer_name, payee.full_name AS payee_name,
                (SELECT pt.txn_reference FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS txn_reference,
                (SELECT pt.provider FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS provider,
                (SELECT pt.method FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS method
           FROM payments p
           JOIN users payer ON payer.id = p.payer_user_id
           LEFT JOIN users payee ON payee.id = p.payee_user_id
          WHERE p.settlement_mode = 'OFFLINE_RECORDED' OR p.notes LIKE '%manual%' OR p.notes LIKE '%UTR%' OR p.notes LIKE '%bank%'
          ORDER BY p.paid_at DESC, p.created_at DESC
          LIMIT 25`,
      ),
    ]);

    const grossVol = Number(summaryTotals?.grossPaymentVolume ?? 0);
    const totalColl = Number(summaryTotals?.totalCollected ?? 0);
    const totalOut = Number(summaryTotals?.totalOutstanding ?? 0);
    const totalOvd = Number(summaryTotals?.totalOverdue ?? 0);
    const totalRef = Number(refundTotals?.totalRefunded ?? 0);
    const commRev = Number(summaryTotals?.commissionRevenue ?? 0);
    const mktRev = Number(summaryTotals?.marketingRevenue ?? 0);
    const srvRev = Number(summaryTotals?.serviceRevenue ?? 0);
    const grossPlatformRev = commRev + mktRev + srvRev;

    return {
      period: { from, to },
      summary: {
        grossPaymentVolume: grossVol,
        totalCollected: totalColl,
        totalOutstanding: totalOut,
        totalOverdue: totalOvd,
        totalRefunded: totalRef,
        commissionRevenue: commRev,
        marketingRevenue: mktRev,
        serviceRevenue: srvRev,
        grossPlatformRevenue: grossPlatformRev,
      },
      paymentBreakdown,
      revenueSeries,
      overduePayments,
      commissionQueue,
      recentTransactions,
      financialExceptions,
      activeMoveOutSettlements,
      openFinancialDisputes,
      manualReconciliation,
    };
  }

  /** Platform-wide management financial ledger */
  async financeLedger(
    filters: {
      from?: string;
      to?: string;
      purpose?: string;
      status?: string;
      settlementStatus?: string;
      tenancyId?: number;
      payerUserId?: number;
      payeeUserId?: number;
      paymentMethod?: string;
      q?: string;
    },
    page?: number,
    pageSize?: number,
  ) {
    const { page: p, perPage: pp, offset } = pageParams(page, pageSize ?? 25);
    const where: string[] = ['1=1'];
    const params: unknown[] = [];

    if (filters.from && filters.to) {
      where.push('p.created_at BETWEEN ? AND ?');
      params.push(filters.from, filters.to);
    } else if (filters.from) {
      where.push('p.created_at >= ?');
      params.push(filters.from);
    } else if (filters.to) {
      where.push('p.created_at <= ?');
      params.push(filters.to);
    }

    if (filters.purpose) {
      where.push('p.purpose = ?');
      params.push(filters.purpose);
    }

    if (filters.status) {
      where.push('p.status = ?');
      params.push(filters.status);
    }

    if (filters.settlementStatus) {
      where.push('p.settlement_status = ?');
      params.push(filters.settlementStatus);
    }

    if (filters.tenancyId) {
      where.push('p.tenancy_id = ?');
      params.push(filters.tenancyId);
    }

    if (filters.payerUserId) {
      where.push('p.payer_user_id = ?');
      params.push(filters.payerUserId);
    }

    if (filters.payeeUserId) {
      where.push('p.payee_user_id = ?');
      params.push(filters.payeeUserId);
    }

    if (filters.paymentMethod) {
      where.push(`EXISTS (SELECT 1 FROM payment_transactions pt WHERE pt.payment_id = p.id AND (pt.method = ? OR pt.provider = ?))`);
      params.push(filters.paymentMethod, filters.paymentMethod);
    }

    if (filters.q) {
      where.push('(p.reference_code LIKE ? OR payer.full_name LIKE ? OR payee.full_name LIKE ? OR p.notes LIKE ?)');
      const like = `%${filters.q}%`;
      params.push(like, like, like, like);
    }

    const clause = where.join(' AND ');

    const rows = await this.db.query(
      `SELECT p.id, p.public_id, p.reference_code, p.purpose, p.amount, p.tax_amount, p.total_amount, p.currency,
              p.status, p.settlement_status, p.settlement_mode, p.due_date, p.paid_at, p.settled_at,
              p.invoice_id, p.notes, p.created_at,
              p.payer_user_id, payer.full_name AS payer_name, payer.email AS payer_email,
              p.payee_user_id, payee.full_name AS payee_name, payee.email AS payee_email,
              p.tenancy_id, t.public_id AS tenancy_public_id,
              p.property_id, prop.title AS property_title,
              (SELECT pt.txn_reference FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS txn_reference,
              (SELECT pt.provider FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS provider,
              (SELECT pt.method FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS payment_method
         FROM payments p
         JOIN users payer ON payer.id = p.payer_user_id
         LEFT JOIN users payee ON payee.id = p.payee_user_id
         LEFT JOIN tenancies t ON t.id = p.tenancy_id
         LEFT JOIN properties prop ON prop.id = p.property_id
        WHERE ${clause}
        ORDER BY p.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );

    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total 
         FROM payments p 
         JOIN users payer ON payer.id = p.payer_user_id
         LEFT JOIN users payee ON payee.id = p.payee_user_id
        WHERE ${clause}`,
      params,
    );

    return paginate(rows, total?.total ?? 0, p, pp);
  }
}

