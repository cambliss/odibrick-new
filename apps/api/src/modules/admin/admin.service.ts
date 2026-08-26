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
}
