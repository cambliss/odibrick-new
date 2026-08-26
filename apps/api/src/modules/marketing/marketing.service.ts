import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { formatReference, newPublicId } from '../../common/util/ids';
import { pageParams, paginate } from '../../common/util/pagination';
import { CampaignUpdateDto, CreateOrderDto, PackageDto } from './marketing.dto';

/**
 * The Cambliss marketing marketplace.
 *
 * Listing inventory is free and unlimited — nothing here gates property
 * creation. What is sold is visibility and campaign work.
 */
@Injectable()
export class MarketingService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly notify: NotificationsService,
  ) {}

  async packages(audience?: string) {
    const params: unknown[] = [];
    let clause = 'WHERE is_active = 1';
    if (audience) {
      clause += " AND audience IN (?, 'ANY')";
      params.push(audience);
    }
    return this.db.query(
      `SELECT id, code, name, tagline, audience, duration_days, price, tax_rate, ad_budget_included,
              features, channels, featured_slots, is_custom_quote
         FROM marketing_packages ${clause} ORDER BY sort_order`,
      params,
    );
  }

  async upsertPackage(user: AuthUser, dto: PackageDto, id?: number) {
    const payload = {
      code: dto.code,
      name: dto.name,
      tagline: dto.tagline ?? null,
      audience: dto.audience ?? 'ANY',
      duration_days: dto.durationDays ?? 30,
      price: dto.price,
      tax_rate: dto.taxRate ?? 18,
      ad_budget_included: dto.adBudgetIncluded ?? 0,
      features: JSON.stringify(dto.features ?? []),
      channels: JSON.stringify(dto.channels ?? []),
      featured_slots: dto.featuredSlots ?? 0,
      is_custom_quote: dto.isCustomQuote ? 1 : 0,
      is_active: dto.isActive === false ? 0 : 1,
    };
    const packageId = id ? (await this.db.update('marketing_packages', id, payload), id)
                         : await this.db.insert('marketing_packages', payload);
    await this.audit.record({ actor: user, action: 'marketing.package_saved', objectType: 'package', objectId: packageId });
    return { id: packageId };
  }

  async order(user: AuthUser, dto: CreateOrderDto) {
    if (!user.roles.some((r) => ['AGENT', 'BUILDER', 'OWNER'].includes(r))) {
      throw new ForbiddenException('Marketing packages are for owners, agents and builders.');
    }
    const pkg = await this.db.one<any>(
      'SELECT * FROM marketing_packages WHERE id = ? AND is_active = 1', [dto.packageId],
    );
    if (!pkg) throw new NotFoundException('That package is not available.');

    const [agent, builder] = await Promise.all([
      this.db.one<any>('SELECT id FROM agents WHERE user_id = ?', [user.id]),
      this.db.one<any>('SELECT id FROM builders WHERE user_id = ?', [user.id]),
    ]);

    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM marketing_orders');
    const amount = Number(pkg.price);
    const tax = Number((amount * Number(pkg.tax_rate) / 100).toFixed(2));

    const orderId = await this.db.insert('marketing_orders', {
      public_id: newPublicId(),
      order_number: formatReference('MKT', (seq?.c ?? 0) + 1),
      package_id: pkg.id,
      buyer_user_id: user.id,
      agent_id: agent?.id ?? null,
      builder_id: builder?.id ?? null,
      amount,
      tax_amount: tax,
      total_amount: amount + tax,
      status: pkg.is_custom_quote ? 'REQUESTED' : 'AWAITING_PAYMENT',
      brief: dto.brief ?? null,
      starts_on: dto.startsOn ?? null,
    });

    let paymentId: number | null = null;
    if (!pkg.is_custom_quote) {
      paymentId = await this.payments.createPayment({
        payerUserId: user.id,
        purpose: 'MARKETING_PACKAGE',
        amount,
        taxRate: Number(pkg.tax_rate),
        notes: `${pkg.name} package`,
      });
      await this.db.update('marketing_orders', orderId, { payment_id: paymentId });
    }

    const campaignId = await this.db.insert('campaigns', {
      public_id: newPublicId(),
      order_id: orderId,
      name: dto.campaignName ?? `${pkg.name} — ${user.fullName}`,
      objective: dto.objective ?? 'LEADS',
      status: 'REQUESTED',
      budget: Number(pkg.ad_budget_included),
      starts_on: dto.startsOn ?? null,
    });

    if (dto.propertyIds?.length) {
      const owned = await this.db.query<any>(
        `SELECT id FROM properties WHERE listed_by_user_id = ?
           AND id IN (${dto.propertyIds.map(() => '?').join(',')})`,
        [user.id, ...dto.propertyIds],
      );
      for (const property of owned) {
        await this.db.execute(
          'INSERT IGNORE INTO campaign_properties (campaign_id, property_id) VALUES (?, ?)',
          [campaignId, property.id],
        );
      }
    }

    await this.audit.record({ actor: user, action: 'marketing.ordered', objectType: 'marketing_order', objectId: orderId });
    return {
      orderId,
      campaignId,
      paymentId,
      status: pkg.is_custom_quote ? 'REQUESTED' : 'AWAITING_PAYMENT',
      message: pkg.is_custom_quote
        ? 'Our team will send a scoped quote for this project.'
        : 'Complete the payment to send your campaign into production.',
    };
  }

  async myOrders(user: AuthUser) {
    return this.db.query(
      `SELECT o.id, o.order_number, o.status, o.amount, o.tax_amount, o.total_amount, o.starts_on,
              o.ends_on, o.created_at, mp.name AS package_name, mp.code AS package_code,
              c.id AS campaign_id, c.name AS campaign_name, c.status AS campaign_status,
              c.impressions, c.clicks, c.leads, c.spend, c.budget,
              pay.status AS payment_status, pay.id AS payment_id
         FROM marketing_orders o
         JOIN marketing_packages mp ON mp.id = o.package_id
         LEFT JOIN campaigns c ON c.order_id = o.id
         LEFT JOIN payments pay ON pay.id = o.payment_id
        WHERE o.buyer_user_id = ? ORDER BY o.created_at DESC`,
      [user.id],
    );
  }

  /** Cambliss delivery board. */
  async campaignBoard(status?: string, page?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, 25);
    const where = status ? 'WHERE c.status = ?' : '';
    const params = status ? [status] : [];
    const rows = await this.db.query(
      `SELECT c.id, c.name, c.objective, c.status, c.budget, c.spend, c.impressions, c.clicks, c.leads,
              c.starts_on, c.ends_on, o.order_number, o.total_amount, o.status AS order_status,
              mp.name AS package_name, u.full_name AS client_name, u.email AS client_email,
              manager.full_name AS manager_name,
              (SELECT COUNT(*) FROM campaign_properties cp WHERE cp.campaign_id = c.id) AS property_count
         FROM campaigns c
         JOIN marketing_orders o ON o.id = c.order_id
         JOIN marketing_packages mp ON mp.id = o.package_id
         JOIN users u ON u.id = o.buyer_user_id
         LEFT JOIN users manager ON manager.id = c.owner_manager_id
         ${where}
        ORDER BY FIELD(c.status,'REQUESTED','APPROVED','IN_PRODUCTION','SCHEDULED','LIVE','PAUSED','COMPLETED'),
                 c.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM campaigns c ${where}`, params,
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  async updateCampaign(user: AuthUser, id: number, dto: CampaignUpdateDto) {
    const campaign = await this.db.one<any>(
      `SELECT c.*, o.buyer_user_id, o.status AS order_status, o.id AS order_id
         FROM campaigns c JOIN marketing_orders o ON o.id = c.order_id WHERE c.id = ?`,
      [id],
    );
    if (!campaign) throw new NotFoundException('Campaign not found.');
    if (dto.status === 'LIVE' && campaign.order_status !== 'PAID') {
      throw new BadRequestException('This campaign cannot go live until the package payment is settled.');
    }

    await this.db.update('campaigns', id, {
      status: dto.status,
      owner_manager_id: dto.managerId ?? user.id,
      budget: dto.budget,
      spend: dto.spend,
      impressions: dto.impressions,
      clicks: dto.clicks,
      leads: dto.leads,
      starts_on: dto.startsOn,
      ends_on: dto.endsOn,
    });

    if (dto.status) {
      const orderStatus = { LIVE: 'LIVE', COMPLETED: 'COMPLETED', IN_PRODUCTION: 'IN_PRODUCTION', APPROVED: 'APPROVED' }[dto.status];
      if (orderStatus) await this.db.update('marketing_orders', campaign.order_id, { status: orderStatus });

      // Featured placement is granted only while a paid campaign is actually live.
      if (dto.status === 'LIVE') {
        await this.db.execute(
          `UPDATE properties p JOIN campaign_properties cp ON cp.property_id = p.id
              SET p.is_featured = 1, p.featured_until = COALESCE(?, DATE_ADD(NOW(), INTERVAL 30 DAY))
            WHERE cp.campaign_id = ?`,
          [dto.endsOn ?? null, id],
        );
      }
      if (dto.status === 'COMPLETED' || dto.status === 'PAUSED') {
        await this.db.execute(
          `UPDATE properties p JOIN campaign_properties cp ON cp.property_id = p.id
              SET p.is_featured = 0, p.featured_until = NULL WHERE cp.campaign_id = ?`,
          [id],
        );
      }
      await this.notify.send(campaign.buyer_user_id, 'MAINTENANCE_UPDATE', {
        title: 'Campaign update',
        body: `${campaign.name} is now ${dto.status.toLowerCase().replace('_', ' ')}.`,
        actionUrl: '/dashboard/marketing',
      });
    }

    await this.audit.record({ actor: user, action: 'campaign.updated', objectType: 'campaign', objectId: id, metadata: { status: dto.status } });
    return { id, status: dto.status ?? campaign.status };
  }

  async campaignPerformance(user: AuthUser, id: number) {
    const campaign = await this.db.one<any>(
      `SELECT c.*, o.buyer_user_id FROM campaigns c JOIN marketing_orders o ON o.id = c.order_id WHERE c.id = ?`,
      [id],
    );
    if (!campaign) throw new NotFoundException('Campaign not found.');
    if (campaign.buyer_user_id !== user.id && !user.permissions.includes('campaign.manage')) {
      throw new ForbiddenException('This campaign belongs to another account.');
    }
    const [properties, leads] = await Promise.all([
      this.db.query(
        `SELECT p.id, p.title, p.city, p.view_count, p.enquiry_count,
                (SELECT COUNT(*) FROM property_views pv WHERE pv.property_id = p.id
                  AND pv.created_at >= COALESCE(?, p.created_at)) AS views_in_period
           FROM campaign_properties cp JOIN properties p ON p.id = cp.property_id
          WHERE cp.campaign_id = ?`,
        [campaign.starts_on, id]),
      this.db.query(
        `SELECT id, name, phone, email, channel, score, status, created_at
           FROM campaign_leads WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 200`, [id]),
    ]);
    const ctr = campaign.impressions ? (campaign.clicks / campaign.impressions) * 100 : 0;
    const cpl = campaign.leads ? campaign.spend / campaign.leads : null;
    return { campaign, properties, leads, metrics: { ctr: Number(ctr.toFixed(2)), costPerLead: cpl } };
  }
}
