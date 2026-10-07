import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';
import { AnalyticsQueryDto } from './analytics.dto';
import {
  PlatformOverviewKpis,
  PropertyFunnelMetrics,
  ListingPerformanceItem,
  LeadAnalyticsMetrics,
  VisitAnalyticsMetrics,
  ApplicationAnalyticsMetrics,
  TenancyLifecycleMetrics,
  LegalAnalyticsMetrics,
  FinancialAnalyticsMetrics,
  PaymentPerformanceMetrics,
  MaintenanceAnalyticsMetrics,
  DisputeAnalyticsMetrics,
  ComplianceAnalyticsMetrics,
  OperationsAnalyticsMetrics,
  AutomationAnalyticsMetrics,
  ReportPayload,
} from './analytics.types';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Helper to parse date filters safely and return SQL boundary conditions.
   */
  public resolveDateRange(dto: AnalyticsQueryDto, dateColumn = 'created_at'): {
    start: Date;
    end: Date;
    sqlClause: string;
    params: any[];
    rangeName: string;
  } {
    const range = (dto.range || '30D').toUpperCase();
    const now = new Date();
    let start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    let end = now;
    let rangeName = range;

    if (range === 'TODAY') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (range === '7D') {
      start = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
    } else if (range === '30D') {
      start = new Date(now.getTime() - 30 * 24 * 3600 * 1000);
    } else if (range === '90D') {
      start = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    } else if (range === '6M') {
      start = new Date(now.getTime() - 180 * 24 * 3600 * 1000);
    } else if (range === '1Y') {
      start = new Date(now.getTime() - 365 * 24 * 3600 * 1000);
    } else if (range === 'CUSTOM') {
      if (dto.from) {
        const parsedFrom = new Date(dto.from);
        if (!isNaN(parsedFrom.getTime())) {
          start = parsedFrom;
        }
      }
      if (dto.to) {
        const parsedTo = new Date(dto.to);
        if (!isNaN(parsedTo.getTime())) {
          // Set to end of day
          parsedTo.setHours(23, 59, 59, 999);
          end = parsedTo;
        }
      }
      rangeName = `CUSTOM (${dto.from || 'start'} to ${dto.to || 'now'})`;
    }

    const sqlClause = `${dateColumn} >= ? AND ${dateColumn} <= ?`;
    return {
      start,
      end,
      sqlClause,
      params: [start, end],
      rangeName,
    };
  }

  /**
   * Helper to safely calculate percentages with zero-denominator handling.
   */
  private calcRate(numerator: number, denominator: number): number {
    if (!denominator || denominator <= 0) return 0;
    const rate = (numerator / denominator) * 100;
    return Math.round(rate * 10) / 10;
  }

  /**
   * 1. Management Executive Overview KPIs
   */
  async getOverview(dto: AnalyticsQueryDto): Promise<PlatformOverviewKpis> {
    const { start, end } = this.resolveDateRange(dto);

    const [
      usersCount,
      propsCount,
      demandCount,
      tenancyCount,
      financeCount,
      opsCount,
      compCount,
      autoCount,
    ] = await Promise.all([
      // Users
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalUsers,
           SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as activeUsers,
           SUM(CASE WHEN created_at >= ? AND created_at <= ? THEN 1 ELSE 0 END) as newUsers,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'OWNER') THEN 1 ELSE 0 END) as activeOwners,
           SUM(CASE WHEN EXISTS (SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id AND r.code = 'TENANT') THEN 1 ELSE 0 END) as activeTenants
         FROM users u WHERE deleted_at IS NULL`,
        [start, end],
      ),

      // Properties
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalProperties,
           SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) as activeListings,
           SUM(CASE WHEN status IN ('DRAFT', 'PENDING_REVIEW') THEN 1 ELSE 0 END) as pendingVerification,
           SUM(CASE WHEN status = 'SUSPENDED' THEN 1 ELSE 0 END) as suspendedListings,
           SUM(CASE WHEN status = 'RENTED' THEN 1 ELSE 0 END) as rentedProperties,
           AVG(NULLIF(rent_amount, 0)) as averageMonthlyRent
         FROM properties WHERE deleted_at IS NULL`,
      ),

      // Demand
      this.db.one<any>(
        `SELECT
           (SELECT COUNT(*) FROM enquiries WHERE created_at >= ? AND created_at <= ?) as enquiriesCount,
           (SELECT COUNT(*) FROM enquiries WHERE status != 'SPAM' AND created_at >= ? AND created_at <= ?) as leadsCount,
           (SELECT COUNT(*) FROM property_visits WHERE created_at >= ? AND created_at <= ?) as visitsCount,
           (SELECT COUNT(*) FROM applications WHERE created_at >= ? AND created_at <= ?) as applicationsCount`,
        [start, end, start, end, start, end, start, end],
      ),

      // Tenancy
      this.db.one<any>(
        `SELECT
           SUM(CASE WHEN stage IN ('ACTIVE', 'CHECKED_IN') THEN 1 ELSE 0 END) as activeTenancies,
           SUM(CASE WHEN stage IN ('AGREEMENT_SIGNING', 'PAYMENT_PENDING') THEN 1 ELSE 0 END) as upcomingMoveIns,
           SUM(CASE WHEN stage = 'MOVE_OUT' THEN 1 ELSE 0 END) as upcomingMoveOuts,
           SUM(CASE WHEN stage = 'RENEWAL' THEN 1 ELSE 0 END) as renewalsCount,
           SUM(CASE WHEN stage = 'CLOSED' THEN 1 ELSE 0 END) as closedTenancies
         FROM tenancies`,
      ),

      // Finance
      this.db.one<any>(
        `SELECT
           SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) as grossTransactionVolume,
           SUM(CASE WHEN status = 'PAID' AND purpose IN ('COMMISSION', 'SERVICE_FEE', 'LEGAL_FEE', 'MARKETING_PACKAGE') THEN total_amount ELSE 0 END) as platformRevenue,
           SUM(CASE WHEN status = 'PENDING' THEN total_amount ELSE 0 END) as pendingReceivables,
           SUM(CASE WHEN status = 'OVERDUE' OR (status = 'PENDING' AND due_date < CURDATE()) THEN total_amount ELSE 0 END) as overduePayments,
           (SELECT COALESCE(SUM(net_amount), 0) FROM owner_payouts WHERE status = 'PROCESSED') as ownerPayouts,
           SUM(CASE WHEN status = 'PAID' AND purpose = 'REFUND' THEN total_amount ELSE 0 END) as refundsTotal
         FROM payments WHERE status != 'CANCELLED'`,
      ),

      // Operations
      this.db.one<any>(
        `SELECT
           (SELECT COUNT(*) FROM operational_tasks WHERE status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')) as openTasks,
           (SELECT COUNT(*) FROM operational_tasks WHERE priority = 'CRITICAL' AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')) as criticalTasks,
           (SELECT COUNT(*) FROM operational_tasks WHERE sla_status = 'BREACHED' AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')) as slaBreaches,
           (SELECT COUNT(*) FROM disputes WHERE status NOT IN ('RESOLVED', 'CLOSED')) as openDisputes,
           (SELECT COUNT(*) FROM maintenance_requests WHERE status NOT IN ('COMPLETED', 'CANCELLED')) as openMaintenance`,
      ),

      // Compliance
      this.db.one<any>(
        `SELECT
           (SELECT COUNT(*) FROM kyc_records WHERE status = 'PENDING') as kycPending,
           (SELECT COUNT(*) FROM kyc_records WHERE status = 'VERIFIED') as kycVerified,
           (SELECT COUNT(*) FROM kyc_records WHERE status = 'REJECTED') as kycRejected,
           (SELECT COUNT(*) FROM documents WHERE expiry_date IS NOT NULL AND expiry_date > CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)) as expiringDocuments,
           (SELECT COUNT(*) FROM documents WHERE expiry_date IS NOT NULL AND expiry_date < CURDATE()) as expiredDocuments`,
      ),

      // Automation
      this.db.one<any>(
        `SELECT
           (SELECT COUNT(*) FROM workflow_executions WHERE created_at >= ? AND created_at <= ?) as automationExecutions,
           (SELECT COUNT(*) FROM workflow_executions WHERE status = 'FAILED' AND created_at >= ? AND created_at <= ?) as automationFailures`,
        [start, end, start, end],
      ),
    ]);

    return {
      totalUsers: Number(usersCount?.totalUsers || 0),
      activeUsers: Number(usersCount?.activeUsers || 0),
      newUsers: Number(usersCount?.newUsers || 0),
      activeOwners: Number(usersCount?.activeOwners || 0),
      activeTenants: Number(usersCount?.activeTenants || 0),
      totalProperties: Number(propsCount?.totalProperties || 0),
      activeListings: Number(propsCount?.activeListings || 0),
      pendingVerification: Number(propsCount?.pendingVerification || 0),
      suspendedListings: Number(propsCount?.suspendedListings || 0),
      rentedProperties: Number(propsCount?.rentedProperties || 0),
      averageMonthlyRent: Math.round(Number(propsCount?.averageMonthlyRent || 0)),
      enquiriesCount: Number(demandCount?.enquiriesCount || 0),
      leadsCount: Number(demandCount?.leadsCount || 0),
      visitsCount: Number(demandCount?.visitsCount || 0),
      applicationsCount: Number(demandCount?.applicationsCount || 0),
      activeTenancies: Number(tenancyCount?.activeTenancies || 0),
      upcomingMoveIns: Number(tenancyCount?.upcomingMoveIns || 0),
      upcomingMoveOuts: Number(tenancyCount?.upcomingMoveOuts || 0),
      renewalsCount: Number(tenancyCount?.renewalsCount || 0),
      closedTenancies: Number(tenancyCount?.closedTenancies || 0),
      grossTransactionVolume: Number(financeCount?.grossTransactionVolume || 0),
      platformRevenue: Number(financeCount?.platformRevenue || 0),
      pendingReceivables: Number(financeCount?.pendingReceivables || 0),
      overduePayments: Number(financeCount?.overduePayments || 0),
      ownerPayouts: Number(financeCount?.ownerPayouts || 0),
      refundsTotal: Number(financeCount?.refundsTotal || 0),
      openTasks: Number(opsCount?.openTasks || 0),
      criticalTasks: Number(opsCount?.criticalTasks || 0),
      slaBreaches: Number(opsCount?.slaBreaches || 0),
      openDisputes: Number(opsCount?.openDisputes || 0),
      openMaintenance: Number(opsCount?.openMaintenance || 0),
      kycPending: Number(compCount?.kycPending || 0),
      kycVerified: Number(compCount?.kycVerified || 0),
      kycRejected: Number(compCount?.kycRejected || 0),
      expiringDocuments: Number(compCount?.expiringDocuments || 0),
      expiredDocuments: Number(compCount?.expiredDocuments || 0),
      automationExecutions: Number(autoCount?.automationExecutions || 0),
      automationFailures: Number(autoCount?.automationFailures || 0),
    };
  }

  /**
   * 2. Property Funnel & Listing Performance
   */
  async getPropertyAnalytics(dto: AnalyticsQueryDto): Promise<{
    funnel: PropertyFunnelMetrics;
    listings: ListingPerformanceItem[];
  }> {
    const { start, end } = this.resolveDateRange(dto);

    // Funnel aggregates
    const [viewsRow, enquiriesRow, leadsRow, visitsRow, appsRow, agreementsRow, tenanciesRow] =
      await Promise.all([
        this.db.one<any>(
          'SELECT COUNT(*) as count FROM property_views WHERE created_at >= ? AND created_at <= ?',
          [start, end],
        ),
        this.db.one<any>(
          'SELECT COUNT(*) as count FROM enquiries WHERE created_at >= ? AND created_at <= ?',
          [start, end],
        ),
        this.db.one<any>(
          `SELECT COUNT(*) as count FROM enquiries WHERE status != 'SPAM' AND created_at >= ? AND created_at <= ?`,
          [start, end],
        ),
        this.db.one<any>(
          'SELECT COUNT(*) as count FROM property_visits WHERE created_at >= ? AND created_at <= ?',
          [start, end],
        ),
        this.db.one<any>(
          `SELECT
             COUNT(*) as count,
             SUM(CASE WHEN status IN ('ACCEPTED', 'APPROVED') THEN 1 ELSE 0 END) as accepted
           FROM applications WHERE created_at >= ? AND created_at <= ?`,
          [start, end],
        ),
        this.db.one<any>(
          `SELECT COUNT(*) as count FROM agreements WHERE status = 'EXECUTED' AND created_at >= ? AND created_at <= ?`,
          [start, end],
        ),
        this.db.one<any>(
          `SELECT COUNT(*) as count FROM tenancies WHERE created_at >= ? AND created_at <= ?`,
          [start, end],
        ),
      ]);

    const views = Number(viewsRow?.count || 0);
    const enquiries = Number(enquiriesRow?.count || 0);
    const leads = Number(leadsRow?.count || 0);
    const visits = Number(visitsRow?.count || 0);
    const applications = Number(appsRow?.count || 0);
    const acceptedApplications = Number(appsRow?.accepted || 0);
    const executedAgreements = Number(agreementsRow?.count || 0);
    const activeTenancies = Number(tenanciesRow?.count || 0);

    const funnel: PropertyFunnelMetrics = {
      views,
      enquiries,
      leads,
      visits,
      applications,
      acceptedApplications,
      executedAgreements,
      activeTenancies,
      conversionRates: {
        enquiryToLead: this.calcRate(leads, enquiries),
        leadToVisit: this.calcRate(visits, leads),
        visitToApplication: this.calcRate(applications, visits),
        applicationToAgreement: this.calcRate(executedAgreements, applications),
        agreementToTenancy: this.calcRate(activeTenancies, executedAgreements),
        overallFunnel: this.calcRate(activeTenancies, enquiries || views),
      },
    };

    // Listing Performance Table
    const limit = Math.min(Number(dto.limit || 20), 100);
    const listingRows = await this.db.query<any>(
      `SELECT
         p.id as propertyId,
         p.title,
         p.city,
         p.rent_amount as monthlyRent,
         p.status,
         p.created_at as createdAt,
         (SELECT COUNT(*) FROM enquiries e WHERE e.property_id = p.id) as enquiries,
         (SELECT COUNT(*) FROM enquiries e WHERE e.property_id = p.id AND e.status != 'SPAM') as leads,
         (SELECT COUNT(*) FROM property_visits pv WHERE pv.property_id = p.id) as visits,
         (SELECT COUNT(*) FROM applications a WHERE a.property_id = p.id) as applications,
         (SELECT COUNT(*) FROM tenancies t WHERE t.property_id = p.id) as tenancies,
         lp.package_name as promotionPackage,
         COALESCE(lp.price_paid, 0) as promotionSpend,
         (SELECT COALESCE(SUM(pm.total_amount), 0) FROM payments pm WHERE pm.property_id = p.id AND pm.status = 'PAID' AND pm.purpose IN ('COMMISSION', 'SERVICE_FEE', 'MARKETING_PACKAGE')) as attributedRevenue
       FROM properties p
       LEFT JOIN (
         SELECT lp.listing_id, mp.name as package_name, mp.price as price_paid
         FROM listing_promotions lp
         JOIN marketing_packages mp ON mp.id = lp.package_id
         WHERE lp.status = 'ACTIVE'
         ORDER BY lp.id DESC
       ) lp ON lp.listing_id = p.id
       WHERE p.deleted_at IS NULL
       ORDER BY enquiries DESC, leads DESC
       LIMIT ?`,
      [limit],
    );

    const listings: ListingPerformanceItem[] = listingRows.map((r: any) => {
      const enq = Number(r.enquiries || 0);
      const ten = Number(r.tenancies || 0);
      return {
        propertyId: r.propertyId,
        title: r.title,
        city: r.city,
        monthlyRent: Number(r.monthlyRent || 0),
        status: r.status,
        enquiries: enq,
        leads: Number(r.leads || 0),
        visits: Number(r.visits || 0),
        applications: Number(r.applications || 0),
        tenancies: ten,
        conversionRate: this.calcRate(ten, enq),
        promotionPackage: r.promotionPackage || null,
        promotionSpend: Number(r.promotionSpend || 0),
        attributedRevenue: Number(r.attributedRevenue || 0),
        createdAt: r.createdAt,
      };
    });

    return { funnel, listings };
  }

  /**
   * 3. Lead Conversion Analytics
   */
  async getLeadAnalytics(dto: AnalyticsQueryDto): Promise<LeadAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const statusCounts = await this.db.one<any>(
      `SELECT
         COUNT(*) as totalLeads,
         SUM(CASE WHEN status = 'NEW' THEN 1 ELSE 0 END) as status_new,
         SUM(CASE WHEN status = 'CONTACTED' THEN 1 ELSE 0 END) as status_contacted,
         SUM(CASE WHEN status = 'QUALIFIED' THEN 1 ELSE 0 END) as status_qualified,
         SUM(CASE WHEN status = 'VISIT_SCHEDULED' THEN 1 ELSE 0 END) as status_visit,
         SUM(CASE WHEN status = 'ACKNOWLEDGED' THEN 1 ELSE 0 END) as status_app,
         SUM(CASE WHEN status = 'CONVERTED' THEN 1 ELSE 0 END) as status_converted,
         SUM(CASE WHEN status = 'LOST' THEN 1 ELSE 0 END) as status_lost,
         SUM(CASE WHEN source = 'ORGANIC' OR source IS NULL THEN 1 ELSE 0 END) as src_organic,
         SUM(CASE WHEN source = 'PROMOTED' THEN 1 ELSE 0 END) as src_promoted,
         SUM(CASE WHEN source = 'FEATURED' THEN 1 ELSE 0 END) as src_featured,
         SUM(CASE WHEN source = 'DIRECT' THEN 1 ELSE 0 END) as src_direct,
         SUM(CASE WHEN (responded_at IS NULL AND acknowledged_at IS NULL AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) THEN 1 ELSE 0 END) as slaBreachedCount,
         AVG(TIMESTAMPDIFF(DAY, created_at, NOW())) as avgAgingDays
       FROM enquiries
       WHERE status != 'SPAM' AND created_at >= ? AND created_at <= ?`,
      [start, end],
    );

    const total = Number(statusCounts?.totalLeads || 0);
    const converted = Number(statusCounts?.status_converted || 0);

    // Recent daily trends (last 14 data points)
    const trendsRows = await this.db.query<any>(
      `SELECT
         DATE_FORMAT(created_at, '%Y-%m-%d') as date,
         COUNT(*) as leads,
         SUM(CASE WHEN status = 'CONVERTED' THEN 1 ELSE 0 END) as converted
       FROM enquiries
       WHERE status != 'SPAM' AND created_at >= DATE_SUB(NOW(), INTERVAL 14 DAY)
       GROUP BY date
       ORDER BY date ASC`,
    );

    return {
      totalLeads: total,
      byStatus: {
        new: Number(statusCounts?.status_new || 0),
        contacted: Number(statusCounts?.status_contacted || 0),
        qualified: Number(statusCounts?.status_qualified || 0),
        visitScheduled: Number(statusCounts?.status_visit || 0),
        applicationSubmitted: Number(statusCounts?.status_app || 0),
        converted,
        lost: Number(statusCounts?.status_lost || 0),
      },
      bySource: {
        organic: Number(statusCounts?.src_organic || 0),
        promoted: Number(statusCounts?.src_promoted || 0),
        featured: Number(statusCounts?.src_featured || 0),
        direct: Number(statusCounts?.src_direct || 0),
      },
      conversionRate: this.calcRate(converted, total),
      slaBreachedCount: Number(statusCounts?.slaBreachedCount || 0),
      averageAgingDays: Math.round((Number(statusCounts?.avgAgingDays || 0)) * 10) / 10,
      recentTrends: trendsRows.map((t: any) => ({
        date: t.date,
        leads: Number(t.leads || 0),
        converted: Number(t.converted || 0),
      })),
    };
  }

  /**
   * 4. Property Visit Analytics
   */
  async getVisitAnalytics(dto: AnalyticsQueryDto): Promise<VisitAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const visitCounts = await this.db.one<any>(
      `SELECT
         COUNT(*) as totalVisits,
         SUM(CASE WHEN status = 'REQUESTED' THEN 1 ELSE 0 END) as requested,
         SUM(CASE WHEN status = 'CONFIRMED' THEN 1 ELSE 0 END) as confirmed,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completed,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelled,
         SUM(CASE WHEN status = 'RESCHEDULED' THEN 1 ELSE 0 END) as rescheduled,
         SUM(CASE WHEN status = 'NO_SHOW' THEN 1 ELSE 0 END) as noShows
       FROM property_visits
       WHERE created_at >= ? AND created_at <= ?`,
      [start, end],
    );

    const total = Number(visitCounts?.totalVisits || 0);
    const completed = Number(visitCounts?.completed || 0);
    const noShows = Number(visitCounts?.noShows || 0);
    const cancelled = Number(visitCounts?.cancelled || 0);

    // Application conversion count from completed visits
    const appCount = await this.db.one<any>(
      `SELECT COUNT(*) as count
       FROM applications a
       JOIN property_visits pv ON pv.property_id = a.property_id AND pv.customer_user_id = a.tenant_user_id
       WHERE pv.status = 'COMPLETED' AND a.created_at >= ? AND a.created_at <= ?`,
      [start, end],
    );

    // Top Hosts performance
    const hostRows = await this.db.query<any>(
      `SELECT
         u.id as hostId,
         u.full_name as hostName,
         COUNT(pv.id) as totalVisits,
         SUM(CASE WHEN pv.status = 'COMPLETED' THEN 1 ELSE 0 END) as completed
       FROM property_visits pv
       JOIN users u ON u.id = pv.host_user_id
       WHERE pv.created_at >= ? AND pv.created_at <= ?
       GROUP BY u.id, u.full_name
       ORDER BY totalVisits DESC
       LIMIT 5`,
      [start, end],
    );

    return {
      totalVisits: total,
      requested: Number(visitCounts?.requested || 0),
      confirmed: Number(visitCounts?.confirmed || 0),
      completed,
      cancelled,
      rescheduled: Number(visitCounts?.rescheduled || 0),
      noShows,
      completionRate: this.calcRate(completed, total),
      noShowRate: this.calcRate(noShows, total),
      cancellationRate: this.calcRate(cancelled, total),
      visitToApplicationRate: this.calcRate(Number(appCount?.count || 0), completed),
      byHost: hostRows.map((h: any) => ({
        hostId: h.hostId,
        hostName: h.hostName || `Host #${h.hostId}`,
        totalVisits: Number(h.totalVisits || 0),
        completed: Number(h.completed || 0),
      })),
    };
  }

  /**
   * 5. Rental Application Analytics
   */
  async getApplicationAnalytics(dto: AnalyticsQueryDto): Promise<ApplicationAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const counts = await this.db.one<any>(
      `SELECT
         COUNT(*) as totalApplications,
         SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN status IN ('UNDER_REVIEW', 'SCREENING') THEN 1 ELSE 0 END) as underReview,
         SUM(CASE WHEN status IN ('ACCEPTED', 'APPROVED') THEN 1 ELSE 0 END) as accepted,
         SUM(CASE WHEN status IN ('REJECTED', 'DECLINED') THEN 1 ELSE 0 END) as rejected,
         SUM(CASE WHEN status = 'WITHDRAWN' THEN 1 ELSE 0 END) as withdrawn,
         AVG(TIMESTAMPDIFF(HOUR, created_at, COALESCE(updated_at, NOW()))) as avgProcessingHours
       FROM applications
       WHERE created_at >= ? AND created_at <= ?`,
      [start, end],
    );

    const total = Number(counts?.totalApplications || 0);
    const accepted = Number(counts?.accepted || 0);
    const rejected = Number(counts?.rejected || 0);

    const agreementCount = await this.db.one<any>(
      `SELECT COUNT(*) as count FROM agreements WHERE status = 'EXECUTED' AND created_at >= ? AND created_at <= ?`,
      [start, end],
    );

    return {
      totalApplications: total,
      pending: Number(counts?.pending || 0),
      underReview: Number(counts?.underReview || 0),
      accepted,
      rejected,
      withdrawn: Number(counts?.withdrawn || 0),
      acceptanceRate: this.calcRate(accepted, total),
      rejectionRate: this.calcRate(rejected, total),
      averageProcessingHours: Math.round(Number(counts?.avgProcessingHours || 0)),
      applicationToAgreementRate: this.calcRate(Number(agreementCount?.count || 0), accepted),
    };
  }

  /**
   * 6. Tenancy Lifecycle & Bottlenecks
   */
  async getTenancyAnalytics(dto: AnalyticsQueryDto): Promise<TenancyLifecycleMetrics> {
    const [stageRows, durationRow, renewalsRow, disputesRow] = await Promise.all([
      this.db.query<any>(
        `SELECT stage, COUNT(*) as count FROM tenancies GROUP BY stage`,
      ),
      this.db.one<any>(
        `SELECT AVG(TIMESTAMPDIFF(MONTH, start_date, COALESCE(end_date, NOW()))) as avgDurationMonths FROM tenancies WHERE start_date IS NOT NULL`,
      ),
      this.db.one<any>(
        `SELECT
           COUNT(*) as total,
           SUM(CASE WHEN stage = 'RENEWAL' THEN 1 ELSE 0 END) as renewals,
           SUM(CASE WHEN stage = 'MOVE_OUT' THEN 1 ELSE 0 END) as moveOuts,
           SUM(CASE WHEN stage = 'CLOSED' THEN 1 ELSE 0 END) as closed
         FROM tenancies`,
      ),
      this.db.one<any>(
        `SELECT
           (SELECT COUNT(*) FROM disputes) as totalDisputes,
           (SELECT COUNT(*) FROM tenancies) as totalTenancies`,
      ),
    ]);

    const stageMap: Record<string, number> = {};
    stageRows.forEach((r: any) => {
      stageMap[r.stage] = Number(r.count || 0);
    });

    const active = (stageMap['ACTIVE'] || 0) + (stageMap['CHECKED_IN'] || 0);
    const totalTenancies = Number(disputesRow?.totalTenancies || 1);
    const totalDisputes = Number(disputesRow?.totalDisputes || 0);

    return {
      activeTenancies: active,
      upcomingRenewals: stageMap['RENEWAL'] || 0,
      upcomingMoveIns: (stageMap['AGREEMENT_SIGNING'] || 0) + (stageMap['PAYMENT_PENDING'] || 0),
      upcomingMoveOuts: stageMap['MOVE_OUT'] || 0,
      closedTenancies: stageMap['CLOSED'] || 0,
      averageDurationMonths: Math.round((Number(durationRow?.avgDurationMonths || 12)) * 10) / 10,
      renewalRate: this.calcRate(Number(renewalsRow?.renewals || 0), Number(renewalsRow?.total || 1)),
      depositSettlementsPending: stageMap['MOVE_OUT'] || 0,
      disputesPerTenancyRate: this.calcRate(totalDisputes, totalTenancies),
      stageDistribution: stageMap,
    };
  }

  /**
   * 7. Legal & Agreement Workflow Analytics
   */
  async getLegalAnalytics(dto: AnalyticsQueryDto): Promise<LegalAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const [legalCaseCounts, agreementCounts] = await Promise.all([
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalCases,
           SUM(CASE WHEN status = 'QUEUED' THEN 1 ELSE 0 END) as queued,
           SUM(CASE WHEN status = 'ASSIGNED' THEN 1 ELSE 0 END) as assigned,
           SUM(CASE WHEN status = 'IN_REVIEW' THEN 1 ELSE 0 END) as inReview,
           SUM(CASE WHEN status = 'DRAFTING' THEN 1 ELSE 0 END) as drafting,
           SUM(CASE WHEN status = 'PENDING_SIGNATURES' THEN 1 ELSE 0 END) as pendingSignatures,
           SUM(CASE WHEN status NOT IN ('EXECUTED', 'RESOLVED', 'CLOSED') AND opened_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as casesOverdue,
           AVG(TIMESTAMPDIFF(DAY, opened_at, COALESCE(closed_at, NOW()))) as avgResolutionDays
         FROM legal_cases
         WHERE opened_at >= ? AND opened_at <= ?`,
        [start, end],
      ),
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalAgreements,
           SUM(CASE WHEN status = 'EXECUTED' THEN 1 ELSE 0 END) as executedAgreements,
           AVG(TIMESTAMPDIFF(HOUR, created_at, COALESCE(executed_at, NOW()))) as avgExecutionHours
         FROM agreements
         WHERE created_at >= ? AND created_at <= ?`,
        [start, end],
      ),
    ]);

    return {
      totalCases: Number(legalCaseCounts?.totalCases || 0),
      queued: Number(legalCaseCounts?.queued || 0),
      assigned: Number(legalCaseCounts?.assigned || 0),
      inReview: Number(legalCaseCounts?.inReview || 0),
      drafting: Number(legalCaseCounts?.drafting || 0),
      pendingSignatures: Number(legalCaseCounts?.pendingSignatures || 0),
      executed: Number(legalCaseCounts?.executed || 0),
      casesOverdue: Number(legalCaseCounts?.casesOverdue || 0),
      averageResolutionDays: Math.round(Number(legalCaseCounts?.avgResolutionDays || 0)),
      agreementsDrafted: Number(agreementCounts?.totalAgreements || 0),
      agreementsExecuted: Number(agreementCounts?.executedAgreements || 0),
      averageExecutionHours: Math.round(Number(agreementCounts?.avgExecutionHours || 0)),
    };
  }

  /**
   * 8. Central Financial Analytics & Revenue Classification
   */
  async getFinanceAnalytics(dto: AnalyticsQueryDto): Promise<FinancialAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto, 'paid_at');

    const [summary, monthlySeries, payouts, refunds] = await Promise.all([
      // Summary Breakdown
      this.db.one<any>(
        `SELECT
           SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) as gtv,
           SUM(CASE WHEN status = 'PAID' AND purpose IN ('COMMISSION', 'SERVICE_FEE', 'LEGAL_FEE', 'MARKETING_PACKAGE') THEN total_amount ELSE 0 END) as platformRevenue,
           SUM(CASE WHEN status = 'PAID' AND purpose = 'COMMISSION' THEN total_amount ELSE 0 END) as revCommission,
           SUM(CASE WHEN status = 'PAID' AND purpose = 'SERVICE_FEE' THEN total_amount ELSE 0 END) as revServices,
           SUM(CASE WHEN status = 'PAID' AND purpose = 'LEGAL_FEE' THEN total_amount ELSE 0 END) as revLegal,
           SUM(CASE WHEN status = 'PAID' AND purpose = 'MARKETING_PACKAGE' THEN total_amount ELSE 0 END) as revMarketing,
           SUM(CASE WHEN status = 'PAID' AND purpose = 'MONTHLY_RENT' THEN total_amount ELSE 0 END) as p2pRent,
           SUM(CASE WHEN status = 'PAID' AND purpose = 'SECURITY_DEPOSIT' THEN total_amount ELSE 0 END) as p2pDeposit,
           SUM(CASE WHEN status = 'PAID' AND purpose = 'ADVANCE_RENT' THEN total_amount ELSE 0 END) as p2pAdvance,
           SUM(CASE WHEN status = 'PENDING' THEN total_amount ELSE 0 END) as pendingReceivables,
           SUM(CASE WHEN status = 'OVERDUE' OR (status = 'PENDING' AND due_date < CURDATE()) THEN total_amount ELSE 0 END) as overdueReceivables
         FROM payments
         WHERE status != 'CANCELLED'`,
      ),

      // 12-Month Trend Series
      this.db.query<any>(
        `SELECT
           DATE_FORMAT(paid_at, '%Y-%m') as month,
           SUM(CASE WHEN purpose = 'COMMISSION' THEN total_amount ELSE 0 END) as commission,
           SUM(CASE WHEN purpose = 'MARKETING_PACKAGE' THEN total_amount ELSE 0 END) as marketing,
           SUM(CASE WHEN purpose = 'SERVICE_FEE' THEN total_amount ELSE 0 END) as services,
           SUM(CASE WHEN purpose = 'LEGAL_FEE' THEN total_amount ELSE 0 END) as legal,
           SUM(CASE WHEN purpose IN ('COMMISSION', 'SERVICE_FEE', 'LEGAL_FEE', 'MARKETING_PACKAGE') THEN total_amount ELSE 0 END) as totalRevenue,
           SUM(total_amount) as grossVolume
         FROM payments
         WHERE status = 'PAID' AND paid_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
         GROUP BY month
         ORDER BY month ASC`,
      ),

      // Owner Payouts
      this.db.one<any>(
        `SELECT COALESCE(SUM(net_amount), 0) as total FROM owner_payouts WHERE status = 'PROCESSED'`,
      ),

      // Refunds
      this.db.one<any>(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM payments WHERE status = 'PAID' AND purpose = 'REFUND'`,
      ),
    ]);

    return {
      grossTransactionVolume: Number(summary?.gtv || 0),
      platformRevenue: Number(summary?.platformRevenue || 0),
      revenueByCategory: {
        commission: Number(summary?.revCommission || 0),
        serviceFees: Number(summary?.revServices || 0),
        legalFees: Number(summary?.revLegal || 0),
        marketingPackages: Number(summary?.revMarketing || 0),
      },
      directP2PVolume: {
        monthlyRent: Number(summary?.p2pRent || 0),
        securityDeposit: Number(summary?.p2pDeposit || 0),
        advanceRent: Number(summary?.p2pAdvance || 0),
      },
      ownerPayoutsTotal: Number(payouts?.total || 0),
      refundsTotal: Number(refunds?.total || 0),
      pendingReceivables: Number(summary?.pendingReceivables || 0),
      overdueReceivables: Number(summary?.overdueReceivables || 0),
      monthlyRevenueSeries: monthlySeries.map((m: any) => ({
        month: m.month,
        commission: Number(m.commission || 0),
        marketing: Number(m.marketing || 0),
        services: Number(m.services || 0),
        legal: Number(m.legal || 0),
        totalRevenue: Number(m.totalRevenue || 0),
        grossVolume: Number(m.grossVolume || 0),
      })),
    };
  }

  /**
   * 9. Payment Performance & Collection Trends
   */
  async getPaymentAnalytics(dto: AnalyticsQueryDto): Promise<PaymentPerformanceMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const [summary, purposes] = await Promise.all([
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalPayments,
           SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paidCount,
           SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount,
           SUM(CASE WHEN status = 'OVERDUE' OR (status = 'PENDING' AND due_date < CURDATE()) THEN 1 ELSE 0 END) as overdueCount,
           SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failedCount,
           SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as cancelledCount,
           AVG(CASE WHEN due_date < CURDATE() AND status != 'PAID' THEN DATEDIFF(CURDATE(), due_date) ELSE NULL END) as avgDaysOverdue,
           SUM(CASE WHEN (status = 'OVERDUE' OR (status = 'PENDING' AND due_date < DATE_SUB(CURDATE(), INTERVAL 7 DAY))) THEN 1 ELSE 0 END) as escalationCount
         FROM payments
         WHERE created_at >= ? AND created_at <= ?`,
        [start, end],
      ),
      this.db.query<any>(
        `SELECT
           purpose,
           COUNT(*) as count,
           SUM(total_amount) as totalAmount,
           SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) as paidAmount
         FROM payments
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY purpose
         ORDER BY totalAmount DESC`,
        [start, end],
      ),
    ]);

    const total = Number(summary?.totalPayments || 0);
    const paid = Number(summary?.paidCount || 0);
    const overdue = Number(summary?.overdueCount || 0);

    return {
      totalPayments: total,
      paidCount: paid,
      pendingCount: Number(summary?.pendingCount || 0),
      overdueCount: overdue,
      failedCount: Number(summary?.failedCount || 0),
      cancelledCount: Number(summary?.cancelledCount || 0),
      successRate: this.calcRate(paid, total),
      overdueRate: this.calcRate(overdue, total),
      averageDaysOverdue: Math.round(Number(summary?.avgDaysOverdue || 0)),
      escalationCount: Number(summary?.escalationCount || 0),
      purposeBreakdown: purposes.map((p: any) => ({
        purpose: p.purpose,
        count: Number(p.count || 0),
        totalAmount: Number(p.totalAmount || 0),
        paidAmount: Number(p.paidAmount || 0),
      })),
    };
  }

  /**
   * 10. Maintenance Operations Analytics
   */
  async getMaintenanceAnalytics(dto: AnalyticsQueryDto): Promise<MaintenanceAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const summary = await this.db.one<any>(
      `SELECT
         COUNT(*) as totalTickets,
         SUM(CASE WHEN status IN ('SUBMITTED', 'PENDING_APPROVAL') THEN 1 ELSE 0 END) as openTickets,
         SUM(CASE WHEN status IN ('APPROVED', 'IN_PROGRESS', 'QUOTED') THEN 1 ELSE 0 END) as inProgressTickets,
         SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as completedTickets,
         SUM(CASE WHEN status = 'CANCELLED' THEN 1 ELSE 0 END) as closedTickets,
         SUM(CASE WHEN priority = 'EMERGENCY' THEN 1 ELSE 0 END) as emergencyCount,
         SUM(COALESCE(final_cost, estimated_cost, 0)) as totalCost,
         SUM(CASE WHEN cost_bearer = 'OWNER' THEN COALESCE(final_cost, estimated_cost, 0) ELSE 0 END) as ownerCost,
         SUM(CASE WHEN cost_bearer = 'TENANT' THEN COALESCE(final_cost, estimated_cost, 0) ELSE 0 END) as tenantCost,
         SUM(CASE WHEN cost_bearer = 'SPLIT' THEN COALESCE(final_cost, estimated_cost, 0) ELSE 0 END) as sharedCost,
         AVG(TIMESTAMPDIFF(HOUR, created_at, COALESCE(completed_at, NOW()))) as avgResolutionHours,
         SUM(CASE WHEN status NOT IN ('COMPLETED', 'CANCELLED') AND created_at < DATE_SUB(NOW(), INTERVAL 48 HOUR) THEN 1 ELSE 0 END) as overdueCount
       FROM maintenance_requests
       WHERE created_at >= ? AND created_at <= ?`,
      [start, end],
    );

    return {
      totalTickets: Number(summary?.totalTickets || 0),
      open: Number(summary?.openTickets || 0),
      inProgress: Number(summary?.inProgressTickets || 0),
      completed: Number(summary?.completedTickets || 0),
      closed: Number(summary?.closedTickets || 0),
      emergencyCount: Number(summary?.emergencyCount || 0),
      totalCost: Number(summary?.totalCost || 0),
      ownerBorneCost: Number(summary?.ownerCost || 0),
      tenantBorneCost: Number(summary?.tenantCost || 0),
      sharedCost: Number(summary?.sharedCost || 0),
      averageResolutionHours: Math.round(Number(summary?.avgResolutionHours || 0)),
      overdueCount: Number(summary?.overdueCount || 0),
    };
  }

  /**
   * 11. Dispute Resolution Analytics
   */
  async getDisputeAnalytics(dto: AnalyticsQueryDto): Promise<DisputeAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const [summary, categories] = await Promise.all([
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalDisputes,
           SUM(CASE WHEN status IN ('OPEN', 'EVIDENCE_SUBMISSION') THEN 1 ELSE 0 END) as openDisputes,
           SUM(CASE WHEN status = 'UNDER_REVIEW' THEN 1 ELSE 0 END) as underReview,
           SUM(CASE WHEN status = 'ESCALATED_LEGAL' THEN 1 ELSE 0 END) as escalatedToLegal,
           SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolved,
           SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closed,
           SUM(COALESCE(amount_claimed, 0)) as totalDisputedAmount,
           AVG(TIMESTAMPDIFF(DAY, created_at, COALESCE(resolved_at, NOW()))) as avgResolutionDays
         FROM disputes
         WHERE created_at >= ? AND created_at <= ?`,
        [start, end],
      ),
      this.db.query<any>(
        `SELECT
           category,
           COUNT(*) as count,
           SUM(COALESCE(amount_claimed, 0)) as amount
         FROM disputes
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY category
         ORDER BY count DESC`,
        [start, end],
      ),
    ]);

    return {
      totalDisputes: Number(summary?.totalDisputes || 0),
      open: Number(summary?.openDisputes || 0),
      underReview: Number(summary?.underReview || 0),
      escalatedToLegal: Number(summary?.escalatedToLegal || 0),
      resolved: Number(summary?.resolved || 0),
      closed: Number(summary?.closed || 0),
      totalDisputedAmount: Number(summary?.totalDisputedAmount || 0),
      averageResolutionDays: Math.round(Number(summary?.avgResolutionDays || 0)),
      byCategory: categories.map((c: any) => ({
        category: c.category,
        count: Number(c.count || 0),
        amount: Number(c.amount || 0),
      })),
    };
  }

  /**
   * 12. Compliance & KYC Analytics (Privacy-Preserving)
   */
  async getComplianceAnalytics(dto: AnalyticsQueryDto): Promise<ComplianceAnalyticsMetrics> {
    const [kycSummary, docSummary, excSummary] = await Promise.all([
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalKyc,
           SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending,
           SUM(CASE WHEN status = 'SUBMITTED' THEN 1 ELSE 0 END) as submitted,
           SUM(CASE WHEN status = 'VERIFIED' THEN 1 ELSE 0 END) as verified,
           SUM(CASE WHEN status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
         FROM kyc_records`,
      ),
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalDocs,
           SUM(CASE WHEN verification_status = 'VERIFIED' THEN 1 ELSE 0 END) as verifiedDocs,
           SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date > CURDATE() AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) as expiringSoon,
           SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date < CURDATE() THEN 1 ELSE 0 END) as expired
         FROM documents`,
      ),
      this.db.one<any>(
        `SELECT COUNT(*) as openExceptions FROM compliance_exceptions WHERE status = 'OPEN'`,
      ),
    ]);

    const totalKyc = Number(kycSummary?.totalKyc || 0);
    const verifiedKyc = Number(kycSummary?.verified || 0);

    return {
      totalKycRecords: totalKyc,
      kycPending: Number(kycSummary?.pending || 0),
      kycSubmitted: Number(kycSummary?.submitted || 0),
      kycVerified: verifiedKyc,
      kycRejected: Number(kycSummary?.rejected || 0),
      verificationRate: this.calcRate(verifiedKyc, totalKyc),
      totalDocuments: Number(docSummary?.totalDocs || 0),
      documentsVerified: Number(docSummary?.verifiedDocs || 0),
      documentsExpiringSoon: Number(docSummary?.expiringSoon || 0),
      documentsExpired: Number(docSummary?.expired || 0),
      complianceExceptionsOpen: Number(excSummary?.openExceptions || 0),
    };
  }

  /**
   * 13. Operations Control Tower Analytics (Phase 15 Integration)
   */
  async getOperationsAnalytics(dto: AnalyticsQueryDto): Promise<OperationsAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const [summary, teams, domains] = await Promise.all([
      this.db.one<any>(
        `SELECT
           COUNT(*) as totalTasks,
           SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as openTasks,
           SUM(CASE WHEN status = 'ASSIGNED' THEN 1 ELSE 0 END) as assignedTasks,
           SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as inProgressTasks,
           SUM(CASE WHEN status = 'ESCALATED' THEN 1 ELSE 0 END) as escalatedTasks,
           SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) as resolvedTasks,
           SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) as closedTasks,
           SUM(CASE WHEN priority = 'CRITICAL' THEN 1 ELSE 0 END) as criticalTasks,
           SUM(CASE WHEN priority = 'URGENT' THEN 1 ELSE 0 END) as urgentTasks,
           SUM(CASE WHEN sla_status = 'BREACHED' THEN 1 ELSE 0 END) as slaBreaches,
           SUM(CASE WHEN due_at < NOW() AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') THEN 1 ELSE 0 END) as overdueTasks,
           SUM(CASE WHEN assigned_to IS NULL AND status IN ('OPEN', 'ESCALATED') THEN 1 ELSE 0 END) as unassignedTasks,
           AVG(TIMESTAMPDIFF(HOUR, created_at, COALESCE(completed_at, NOW()))) as avgResolutionHours
         FROM operational_tasks
         WHERE created_at >= ? AND created_at <= ?`,
        [start, end],
      ),
      this.db.query<any>(
        `SELECT
           COALESCE(assigned_team, 'GENERAL') as team,
           COUNT(*) as total,
           SUM(CASE WHEN status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') THEN 1 ELSE 0 END) as openCount,
           SUM(CASE WHEN status IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END) as resolvedCount
         FROM operational_tasks
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY team
         ORDER BY total DESC`,
        [start, end],
      ),
      this.db.query<any>(
        `SELECT
           source_domain as domain,
           COUNT(*) as count
         FROM operational_tasks
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY source_domain
         ORDER BY count DESC`,
        [start, end],
      ),
    ]);

    return {
      totalTasks: Number(summary?.totalTasks || 0),
      openTasks: Number(summary?.openTasks || 0),
      assignedTasks: Number(summary?.assignedTasks || 0),
      inProgressTasks: Number(summary?.inProgressTasks || 0),
      escalatedTasks: Number(summary?.escalatedTasks || 0),
      resolvedTasks: Number(summary?.resolvedTasks || 0),
      closedTasks: Number(summary?.closedTasks || 0),
      criticalTasks: Number(summary?.criticalTasks || 0),
      urgentTasks: Number(summary?.urgentTasks || 0),
      slaBreaches: Number(summary?.slaBreaches || 0),
      overdueTasks: Number(summary?.overdueTasks || 0),
      unassignedTasks: Number(summary?.unassignedTasks || 0),
      averageResolutionHours: Math.round(Number(summary?.avgResolutionHours || 0)),
      teamWorkload: teams.map((t: any) => ({
        team: t.team,
        total: Number(t.total || 0),
        open: Number(t.openCount || 0),
        resolved: Number(t.resolvedCount || 0),
      })),
      domainDistribution: domains.map((d: any) => ({
        domain: d.domain,
        count: Number(d.count || 0),
      })),
    };
  }

  /**
   * 14. Automation Engine Analytics (Phase 14 Integration)
   */
  async getAutomationAnalytics(dto: AnalyticsQueryDto): Promise<AutomationAnalyticsMetrics> {
    const { start, end } = this.resolveDateRange(dto);

    const [summary, eventsList] = await Promise.all([
      this.db.one<any>(
        `SELECT
           (SELECT COUNT(*) FROM workflow_events WHERE created_at >= ? AND created_at <= ?) as eventsReceived,
           COUNT(*) as executionsTotal,
           SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) as successfulExecutions,
           SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failedExecutions,
           SUM(CASE WHEN status = 'FAILED' AND retry_count < max_retries AND acknowledged = 0 THEN 1 ELSE 0 END) as pendingRetries,
           SUM(CASE WHEN acknowledged = 1 THEN 1 ELSE 0 END) as acknowledgedFailures
         FROM workflow_executions
         WHERE created_at >= ? AND created_at <= ?`,
        [start, end, start, end],
      ),
      this.db.query<any>(
        `SELECT
           event_type as eventType,
           COUNT(*) as count
         FROM workflow_events
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY event_type
         ORDER BY count DESC`,
        [start, end],
      ),
    ]);

    const totalExecs = Number(summary?.executionsTotal || 0);
    const successful = Number(summary?.successfulExecutions || 0);
    const failed = Number(summary?.failedExecutions || 0);

    return {
      eventsReceived: Number(summary?.eventsReceived || 0),
      workflowsExecuted: totalExecs,
      successfulExecutions: successful,
      failedExecutions: failed,
      pendingRetries: Number(summary?.pendingRetries || 0),
      acknowledgedFailures: Number(summary?.acknowledgedFailures || 0),
      successRate: this.calcRate(successful, totalExecs),
      failureRate: this.calcRate(failed, totalExecs),
      eventsByType: eventsList.map((e: any) => ({
        eventType: e.eventType,
        count: Number(e.count || 0),
      })),
    };
  }

  /**
   * 15. Standard Tabular Business Intelligence Reports
   */
  async getReport(reportType: string, dto: AnalyticsQueryDto): Promise<ReportPayload> {
    const normalizedType = reportType.toLowerCase().replace(/-/g, '_');
    const { start, end, rangeName } = this.resolveDateRange(dto);
    const nowStr = new Date().toISOString();

    switch (normalizedType) {
      case 'property_performance':
      case 'properties': {
        const rows = await this.db.query<any>(
          `SELECT
             p.public_id as propertyCode,
             p.title,
             p.city,
             p.property_type as type,
             p.rent_amount as monthlyRent,
             p.status,
             (SELECT COUNT(*) FROM enquiries e WHERE e.property_id = p.id) as enquiries,
             (SELECT COUNT(*) FROM enquiries e WHERE e.property_id = p.id AND e.status != 'SPAM') as leads,
             (SELECT COUNT(*) FROM property_visits pv WHERE pv.property_id = p.id) as visits,
             (SELECT COUNT(*) FROM applications a WHERE a.property_id = p.id) as applications,
             (SELECT COUNT(*) FROM tenancies t WHERE t.property_id = p.id) as tenancies,
             DATE_FORMAT(p.created_at, '%Y-%m-%d') as listedDate
           FROM properties p
           WHERE p.deleted_at IS NULL
           ORDER BY enquiries DESC, leads DESC
           LIMIT 100`,
        );
        return {
          reportType: 'PROPERTY_PERFORMANCE',
          generatedAt: nowStr,
          dateRange: rangeName,
          summary: { totalListings: rows.length },
          columns: [
            { key: 'propertyCode', header: 'Property Code' },
            { key: 'title', header: 'Title' },
            { key: 'city', header: 'City' },
            { key: 'monthlyRent', header: 'Monthly Rent (INR)' },
            { key: 'status', header: 'Status' },
            { key: 'enquiries', header: 'Enquiries' },
            { key: 'leads', header: 'Leads' },
            { key: 'visits', header: 'Visits' },
            { key: 'applications', header: 'Applications' },
            { key: 'tenancies', header: 'Tenancies' },
            { key: 'listedDate', header: 'Listed Date' },
          ],
          rows,
          totalRows: rows.length,
        };
      }

      case 'lead_funnel':
      case 'leads': {
        const rows = await this.db.query<any>(
          `SELECT
             l.public_id as leadCode,
             l.status,
             COALESCE(l.source, 'ORGANIC') as source,
             COALESCE(p.title, 'General Enquiry') as propertyTitle,
             COALESCE(p.city, 'N/A') as city,
             COALESCE(u_agent.full_name, 'Unassigned') as assignedAgent,
             CASE WHEN (l.responded_at IS NULL AND l.acknowledged_at IS NULL AND l.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) THEN 1 ELSE 0 END as slaBreached,
             DATE_FORMAT(l.created_at, '%Y-%m-%d %H:%i') as createdAt
           FROM enquiries l
           LEFT JOIN properties p ON p.id = l.property_id
           LEFT JOIN users u_agent ON u_agent.id = l.assigned_user_id
           WHERE l.status != 'SPAM' AND l.created_at >= ? AND l.created_at <= ?
           ORDER BY l.id DESC
           LIMIT 100`,
          [start, end],
        );
        return {
          reportType: 'LEAD_FUNNEL',
          generatedAt: nowStr,
          dateRange: rangeName,
          summary: { totalLeads: rows.length },
          columns: [
            { key: 'leadCode', header: 'Lead Code' },
            { key: 'status', header: 'Status' },
            { key: 'source', header: 'Source' },
            { key: 'propertyTitle', header: 'Property' },
            { key: 'city', header: 'City' },
            { key: 'assignedAgent', header: 'Assigned Agent' },
            { key: 'slaBreached', header: 'SLA Breached' },
            { key: 'createdAt', header: 'Created At' },
          ],
          rows,
          totalRows: rows.length,
        };
      }

      case 'financial_revenue':
      case 'finance': {
        const rows = await this.db.query<any>(
          `SELECT
             p.reference_code as referenceCode,
             p.purpose,
             p.total_amount as amount,
             p.status,
             CASE
               WHEN p.purpose IN ('COMMISSION', 'SERVICE_FEE', 'LEGAL_FEE', 'MARKETING_PACKAGE') THEN 'PLATFORM_REVENUE'
               ELSE 'DIRECT_P2P'
             END as classification,
             DATE_FORMAT(COALESCE(p.paid_at, p.created_at), '%Y-%m-%d %H:%i') as transactionDate
           FROM payments p
           WHERE p.status != 'CANCELLED' AND p.created_at >= ? AND p.created_at <= ?
           ORDER BY p.id DESC
           LIMIT 100`,
          [start, end],
        );
        return {
          reportType: 'FINANCIAL_REVENUE',
          generatedAt: nowStr,
          dateRange: rangeName,
          summary: { totalTransactions: rows.length },
          columns: [
            { key: 'referenceCode', header: 'Reference Code' },
            { key: 'purpose', header: 'Purpose' },
            { key: 'amount', header: 'Amount (INR)' },
            { key: 'status', header: 'Status' },
            { key: 'classification', header: 'Classification' },
            { key: 'transactionDate', header: 'Date' },
          ],
          rows,
          totalRows: rows.length,
        };
      }

      case 'operations':
      case 'operational_tasks': {
        const rows = await this.db.query<any>(
          `SELECT
             t.public_id as taskCode,
             t.task_type as taskType,
             t.title,
             t.source_domain as domain,
             t.priority,
             t.status,
             COALESCE(u.full_name, 'Unassigned') as assignee,
             t.assigned_team as team,
             t.sla_status as slaStatus,
             DATE_FORMAT(t.created_at, '%Y-%m-%d %H:%i') as createdAt
           FROM operational_tasks t
           LEFT JOIN users u ON u.id = t.assigned_to
           WHERE t.created_at >= ? AND t.created_at <= ?
           ORDER BY t.id DESC
           LIMIT 100`,
          [start, end],
        );
        return {
          reportType: 'OPERATIONS_TASKS',
          generatedAt: nowStr,
          dateRange: rangeName,
          summary: { totalTasks: rows.length },
          columns: [
            { key: 'taskCode', header: 'Task Code' },
            { key: 'taskType', header: 'Type' },
            { key: 'title', header: 'Title' },
            { key: 'domain', header: 'Domain' },
            { key: 'priority', header: 'Priority' },
            { key: 'status', header: 'Status' },
            { key: 'assignee', header: 'Assignee' },
            { key: 'team', header: 'Team' },
            { key: 'slaStatus', header: 'SLA Status' },
            { key: 'createdAt', header: 'Created At' },
          ],
          rows,
          totalRows: rows.length,
        };
      }

      case 'maintenance': {
        const rows = await this.db.query<any>(
          `SELECT
             m.ticket_number as ticketCode,
             m.category,
             m.title,
             m.priority,
             m.status,
             COALESCE(m.cost_bearer, 'OWNER') as liability,
             COALESCE(m.final_cost, m.estimated_cost, 0) as cost,
             DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i') as createdAt
           FROM maintenance_requests m
           WHERE m.created_at >= ? AND m.created_at <= ?
           ORDER BY m.id DESC
           LIMIT 100`,
          [start, end],
        );
        return {
          reportType: 'MAINTENANCE_TICKETS',
          generatedAt: nowStr,
          dateRange: rangeName,
          summary: { totalTickets: rows.length },
          columns: [
            { key: 'ticketCode', header: 'Ticket Code' },
            { key: 'category', header: 'Category' },
            { key: 'title', header: 'Title' },
            { key: 'priority', header: 'Priority' },
            { key: 'status', header: 'Status' },
            { key: 'liability', header: 'Liability' },
            { key: 'cost', header: 'Cost (INR)' },
            { key: 'createdAt', header: 'Created At' },
          ],
          rows,
          totalRows: rows.length,
        };
      }

      case 'disputes': {
        const rows = await this.db.query<any>(
          `SELECT
             d.case_number as caseNumber,
             d.category,
             d.summary as title,
             d.status,
             COALESCE(d.amount_claimed, 0) as amount,
             DATE_FORMAT(d.created_at, '%Y-%m-%d %H:%i') as createdAt
           FROM disputes d
           WHERE d.created_at >= ? AND d.created_at <= ?
           ORDER BY d.id DESC
           LIMIT 100`,
          [start, end],
        );
        return {
          reportType: 'DISPUTES_OVERVIEW',
          generatedAt: nowStr,
          dateRange: rangeName,
          summary: { totalDisputes: rows.length },
          columns: [
            { key: 'caseNumber', header: 'Case Number' },
            { key: 'category', header: 'Category' },
            { key: 'title', header: 'Title' },
            { key: 'status', header: 'Status' },
            { key: 'amount', header: 'Disputed Amount (INR)' },
            { key: 'createdAt', header: 'Created At' },
          ],
          rows,
          totalRows: rows.length,
        };
      }

      default:
        throw new NotFoundException(`Unknown report type: ${reportType}`);
    }
  }

  /**
   * 16. CSV Export with Audit Trail
   */
  async exportReportCsv(
    user: AuthUser,
    reportType: string,
    dto: AnalyticsQueryDto,
    req?: Request,
  ): Promise<{ filename: string; csv: string; totalRows: number }> {
    const report = await this.getReport(reportType, dto);

    // Build CSV string deterministically
    const headers = report.columns.map((c) => `"${c.header.replace(/"/g, '""')}"`).join(',');
    const dataLines = report.rows.map((row) => {
      return report.columns
        .map((col) => {
          const val = row[col.key] !== undefined && row[col.key] !== null ? String(row[col.key]) : '';
          return `"${val.replace(/"/g, '""')}"`;
        })
        .join(',');
    });

    const csvContent = [headers, ...dataLines].join('\n');
    const filename = `odibrick_${report.reportType.toLowerCase()}_${new Date().toISOString().slice(0, 10)}.csv`;

    // Audit the export action
    await this.audit.record({
      actor: user,
      action: 'report.exported',
      objectType: 'report',
      objectId: 0,
      metadata: {
        reportType: report.reportType,
        dateRange: report.dateRange,
        rowCount: report.totalRows,
        filename,
      },
      req,
    });

    return {
      filename,
      csv: csvContent,
      totalRows: report.totalRows,
    };
  }
}
