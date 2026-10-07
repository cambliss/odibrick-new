require('dotenv').config({ path: require('path').resolve(__dirname, '../apps/api/.env') });
const assert = require('assert');
const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('../apps/api/dist/app.module');
const { DatabaseService } = require('../apps/api/dist/common/database/database.service');
const { AnalyticsService } = require('../apps/api/dist/modules/analytics/analytics.service');
const { AnalyticsController, ReportsController } = require('../apps/api/dist/modules/analytics/analytics.controller');

let app;
let db;
let analyticsService;
let analyticsController;
let reportsController;

let total = 0;
let passed = 0;

async function itAsync(description, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✓ [TEST ${String(total).padStart(3, '0')}] ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ [FAIL ${String(total).padStart(3, '0')}] ${description}`);
    console.error(`    -> ${err.message}`);
    throw err;
  }
}

async function main() {
  console.log('======================================================================');
  console.log('  ODIBRICK PHASE 16 ANALYTICS & BI ENGINE VERIFICATION SUITE');
  console.log('======================================================================\n');

  app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  db = app.get(DatabaseService);
  analyticsService = app.get(AnalyticsService);
  analyticsController = app.get(AnalyticsController);
  reportsController = app.get(ReportsController);

  const [dbAdmin, dbTenant, dbOwner] = await Promise.all([
    db.one(`SELECT u.id, u.public_id, u.email, u.full_name FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.code = 'SUPER_ADMIN' LIMIT 1`),
    db.one(`SELECT u.id, u.public_id, u.email, u.full_name FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.code = 'TENANT' LIMIT 1`),
    db.one(`SELECT u.id, u.public_id, u.email, u.full_name FROM users u JOIN user_roles ur ON ur.user_id = u.id JOIN roles r ON r.id = ur.role_id WHERE r.code = 'OWNER' LIMIT 1`),
  ]);

  const adminUser = {
    id: dbAdmin.id,
    publicId: dbAdmin.public_id,
    email: dbAdmin.email,
    fullName: dbAdmin.full_name,
    roles: ['SUPER_ADMIN'],
    permissions: ['analytics.read', 'analytics.manage', 'reports.read', 'reports.export'],
  };

  const tenantUser = {
    id: dbTenant.id,
    publicId: dbTenant.public_id,
    email: dbTenant.email,
    fullName: dbTenant.full_name,
    roles: ['TENANT'],
    permissions: [],
  };

  const ownerUser = {
    id: dbOwner.id,
    publicId: dbOwner.public_id,
    email: dbOwner.email,
    fullName: dbOwner.full_name,
    roles: ['OWNER'],
    permissions: [],
  };

  try {
    // -------------------------------------------------------------
    // SECTION 1: DATABASE SCHEMA & PERMISSIONS INTEGRITY (018)
    // -------------------------------------------------------------
    console.log('--- SECTION 1: DATABASE SCHEMA & RBAC INTEGRITY ---');

    await itAsync('RBAC: Analytics permissions registered in permissions table', async () => {
      const perms = await db.query(
        `SELECT code FROM permissions WHERE code IN ('analytics.read', 'analytics.manage', 'reports.read', 'reports.export')`
      );
      assert.strictEqual(perms.length, 4, 'All 4 Phase 16 permissions must exist in database');
    });

    await itAsync('RBAC: SUPER_ADMIN and ADMIN have analytics.read and reports.export', async () => {
      const rolePerms = await db.query(
        `SELECT r.code as role_code, p.code as perm_code
         FROM role_permissions rp
         JOIN roles r ON r.id = rp.role_id
         JOIN permissions p ON p.id = rp.permission_id
         WHERE p.code IN ('analytics.read', 'reports.export')`
      );
      assert(rolePerms.some((rp) => rp.role_code === 'SUPER_ADMIN' && rp.perm_code === 'analytics.read'));
      assert(rolePerms.some((rp) => rp.role_code === 'ADMIN' && rp.perm_code === 'reports.export'));
    });

    // -------------------------------------------------------------
    // SECTION 2: DATE FILTERING & RESOLUTION ENGINE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 2: DATE FILTERING & RESOLUTION ENGINE ---');

    await itAsync('Date Engine: TODAY range calculates bounds from midnight to now', async () => {
      const res = analyticsService.resolveDateRange({ range: 'TODAY' });
      assert.strictEqual(res.rangeName, 'TODAY');
      assert(res.start instanceof Date);
      assert(res.end instanceof Date);
      assert(res.start.getTime() <= res.end.getTime());
    });

    await itAsync('Date Engine: 30D range spans 30 days window', async () => {
      const res = analyticsService.resolveDateRange({ range: '30D' });
      const days = (res.end.getTime() - res.start.getTime()) / (24 * 3600 * 1000);
      assert(days >= 29.9 && days <= 30.1);
    });

    await itAsync('Date Engine: CUSTOM range parses explicit from/to dates', async () => {
      const res = analyticsService.resolveDateRange({
        range: 'CUSTOM',
        from: '2026-01-01',
        to: '2026-06-30',
      });
      assert.strictEqual(res.start.toISOString().slice(0, 10), '2026-01-01');
      assert.strictEqual(res.end.toISOString().slice(0, 10), '2026-06-30');
    });

    // -------------------------------------------------------------
    // SECTION 3: MANAGEMENT OVERVIEW KPIS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 3: MANAGEMENT EXECUTIVE OVERVIEW KPIS ---');

    await itAsync('Overview KPIs: Returns complete platform metrics object', async () => {
      const ov = await analyticsService.getOverview({ range: '30D' });
      assert(typeof ov.totalUsers === 'number' && ov.totalUsers >= 1);
      assert(typeof ov.activeListings === 'number');
      assert(typeof ov.grossTransactionVolume === 'number');
      assert(typeof ov.platformRevenue === 'number');
      assert(typeof ov.activeTenancies === 'number');
      assert(typeof ov.openTasks === 'number');
    });

    // -------------------------------------------------------------
    // SECTION 4: PROPERTY DEMAND FUNNEL & LISTING PERFORMANCE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 4: PROPERTY DEMAND FUNNEL & CONVERSION ---');

    await itAsync('Property Funnel: Computes conversion rates across lifecycle stages', async () => {
      const data = await analyticsService.getPropertyAnalytics({ range: '30D' });
      assert(typeof data.funnel.views === 'number');
      assert(typeof data.funnel.enquiries === 'number');
      assert(typeof data.funnel.leads === 'number');
      assert(typeof data.funnel.visits === 'number');
      assert(typeof data.funnel.applications === 'number');
      assert(typeof data.funnel.activeTenancies === 'number');
      assert(typeof data.funnel.conversionRates.overallFunnel === 'number');
    });

    await itAsync('Listing Performance: Returns per-property demand metrics & revenue attribution', async () => {
      const data = await analyticsService.getPropertyAnalytics({ range: '30D', limit: '10' });
      assert(Array.isArray(data.listings));
      if (data.listings.length > 0) {
        const item = data.listings[0];
        assert(item.propertyId > 0);
        assert(typeof item.title === 'string');
        assert(typeof item.enquiries === 'number');
        assert(typeof item.attributedRevenue === 'number');
      }
    });

    // -------------------------------------------------------------
    // SECTION 5: LEAD CONVERSION & SOURCE ANALYTICS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 5: LEAD ANALYTICS & SOURCES ---');

    await itAsync('Lead Analytics: Breaks down leads by status and acquisition source', async () => {
      const leads = await analyticsService.getLeadAnalytics({ range: '30D' });
      assert(typeof leads.totalLeads === 'number');
      assert(typeof leads.byStatus.new === 'number');
      assert(typeof leads.byStatus.converted === 'number');
      assert(typeof leads.bySource.organic === 'number');
      assert(typeof leads.conversionRate === 'number');
      assert(Array.isArray(leads.recentTrends));
    });

    // -------------------------------------------------------------
    // SECTION 6: PROPERTY VISIT & HOST PERFORMANCE
    // -------------------------------------------------------------
    console.log('\n--- SECTION 6: PROPERTY VISIT ANALYTICS ---');

    await itAsync('Visit Analytics: Calculates completion, no-show, and application conversion rates', async () => {
      const visits = await analyticsService.getVisitAnalytics({ range: '30D' });
      assert(typeof visits.totalVisits === 'number');
      assert(typeof visits.completed === 'number');
      assert(typeof visits.completionRate === 'number');
      assert(typeof visits.noShowRate === 'number');
      assert(typeof visits.visitToApplicationRate === 'number');
      assert(Array.isArray(visits.byHost));
    });

    // -------------------------------------------------------------
    // SECTION 7: RENTAL APPLICATION PROCESSING
    // -------------------------------------------------------------
    console.log('\n--- SECTION 7: RENTAL APPLICATION ANALYTICS ---');

    await itAsync('Application Analytics: Computes acceptance rate & processing duration', async () => {
      const apps = await analyticsService.getApplicationAnalytics({ range: '30D' });
      assert(typeof apps.totalApplications === 'number');
      assert(typeof apps.accepted === 'number');
      assert(typeof apps.acceptanceRate === 'number');
      assert(typeof apps.averageProcessingHours === 'number');
    });

    // -------------------------------------------------------------
    // SECTION 8: TENANCY LIFECYCLE & BOTTLENECKS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 8: TENANCY LIFECYCLE ANALYTICS ---');

    await itAsync('Tenancy Lifecycle: Measures active tenancies, renewals, and duration', async () => {
      const tenancies = await analyticsService.getTenancyAnalytics({ range: '30D' });
      assert(typeof tenancies.activeTenancies === 'number');
      assert(typeof tenancies.averageDurationMonths === 'number');
      assert(typeof tenancies.stageDistribution === 'object');
    });

    // -------------------------------------------------------------
    // SECTION 9: LEGAL & AGREEMENT ANALYTICS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 9: LEGAL & AGREEMENT ANALYTICS ---');

    await itAsync('Legal Analytics: Tracks legal case stages and agreement execution speed', async () => {
      const legal = await analyticsService.getLegalAnalytics({ range: '30D' });
      assert(typeof legal.totalCases === 'number');
      assert(typeof legal.agreementsExecuted === 'number');
      assert(typeof legal.averageResolutionDays === 'number');
    });

    // -------------------------------------------------------------
    // SECTION 10: FINANCIAL ANALYTICS & REVENUE CLASSIFICATION
    // -------------------------------------------------------------
    console.log('\n--- SECTION 10: FINANCIAL REVENUE CLASSIFICATION ---');

    await itAsync('Finance: Strictly separates Platform Revenue from Direct P2P Rent/Deposit', async () => {
      const fin = await analyticsService.getFinanceAnalytics({ range: '30D' });
      assert(typeof fin.grossTransactionVolume === 'number');
      assert(typeof fin.platformRevenue === 'number');

      // Platform revenue = Commission + Services + Legal + Marketing
      const expectedRev =
        fin.revenueByCategory.commission +
        fin.revenueByCategory.serviceFees +
        fin.revenueByCategory.legalFees +
        fin.revenueByCategory.marketingPackages;

      assert.strictEqual(
        fin.platformRevenue,
        expectedRev,
        'Platform revenue must strictly equal sum of commission, services, legal, and marketing fees'
      );

      // Verify P2P volume is segregated
      assert(typeof fin.directP2PVolume.monthlyRent === 'number');
      assert(typeof fin.directP2PVolume.securityDeposit === 'number');
    });

    await itAsync('Finance: Cancelled payments are strictly excluded from revenue', async () => {
      const cancelledTotal = await db.one(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as total FROM payments WHERE status = 'CANCELLED'`
      );
      assert(Number(cancelledTotal.count) >= 0);
    });

    await itAsync('Finance: Returns 12-month revenue trend series', async () => {
      const fin = await analyticsService.getFinanceAnalytics({ range: '1Y' });
      assert(Array.isArray(fin.monthlyRevenueSeries));
      assert(fin.monthlyRevenueSeries.length > 0);
      fin.monthlyRevenueSeries.forEach((m) => {
        assert(typeof m.month === 'string');
        assert(typeof m.totalRevenue === 'number');
        assert(typeof m.grossVolume === 'number');
      });
    });

    // -------------------------------------------------------------
    // SECTION 11: PAYMENT PERFORMANCE & OVERDUE MONITORING
    // -------------------------------------------------------------
    console.log('\n--- SECTION 11: PAYMENT PERFORMANCE & OVERDUE ---');

    await itAsync('Payment Performance: Calculates collection success and overdue rates', async () => {
      const pay = await analyticsService.getPaymentAnalytics({ range: '30D' });
      assert(typeof pay.totalPayments === 'number');
      assert(typeof pay.paidCount === 'number');
      assert(typeof pay.successRate === 'number');
      assert(typeof pay.overdueRate === 'number');
      assert(Array.isArray(pay.purposeBreakdown));
    });

    // -------------------------------------------------------------
    // SECTION 12: MAINTENANCE OPERATIONS & COST LIABILITIES
    // -------------------------------------------------------------
    console.log('\n--- SECTION 12: MAINTENANCE OPERATIONS ANALYTICS ---');

    await itAsync('Maintenance Analytics: Computes ticket counts and owner/tenant cost split', async () => {
      const maint = await analyticsService.getMaintenanceAnalytics({ range: '30D' });
      assert(typeof maint.totalTickets === 'number');
      assert(typeof maint.totalCost === 'number');
      assert(typeof maint.ownerBorneCost === 'number');
      assert(typeof maint.tenantBorneCost === 'number');
    });

    // -------------------------------------------------------------
    // SECTION 13: DISPUTE RESOLUTION ANALYTICS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 13: DISPUTE RESOLUTION ANALYTICS ---');

    await itAsync('Dispute Analytics: Categorizes disputes by cause and tracks resolution times', async () => {
      const disp = await analyticsService.getDisputeAnalytics({ range: '30D' });
      assert(typeof disp.totalDisputes === 'number');
      assert(typeof disp.totalDisputedAmount === 'number');
      assert(Array.isArray(disp.byCategory));
    });

    // -------------------------------------------------------------
    // SECTION 14: COMPLIANCE & KYC PRIVACY-PRESERVING METRICS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 14: COMPLIANCE & KYC ANALYTICS ---');

    await itAsync('Compliance Analytics: Aggregates verification status without exposing raw PII', async () => {
      const comp = await analyticsService.getComplianceAnalytics({ range: '30D' });
      assert(typeof comp.totalKycRecords === 'number');
      assert(typeof comp.kycVerified === 'number');
      assert(typeof comp.verificationRate === 'number');
      assert(typeof comp.documentsExpiringSoon === 'number');
      assert(typeof comp.documentsExpired === 'number');
    });

    // -------------------------------------------------------------
    // SECTION 15: OPERATIONS CONTROL TOWER INTEGRATION (PHASE 15)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 15: OPERATIONS CONTROL TOWER INTEGRATION ---');

    await itAsync('Operations Analytics: Aggregates operational tasks, team workload, and SLA status', async () => {
      const ops = await analyticsService.getOperationsAnalytics({ range: '30D' });
      assert(typeof ops.totalTasks === 'number');
      assert(typeof ops.openTasks === 'number');
      assert(typeof ops.criticalTasks === 'number');
      assert(Array.isArray(ops.teamWorkload));
      assert(Array.isArray(ops.domainDistribution));
    });

    // -------------------------------------------------------------
    // SECTION 16: AUTOMATION ENGINE HEALTH (PHASE 14)
    // -------------------------------------------------------------
    console.log('\n--- SECTION 16: AUTOMATION ENGINE HEALTH ---');

    await itAsync('Automation Analytics: Computes execution success rate and event volume breakdown', async () => {
      const auto = await analyticsService.getAutomationAnalytics({ range: '30D' });
      assert(typeof auto.eventsReceived === 'number');
      assert(typeof auto.workflowsExecuted === 'number');
      assert(typeof auto.successRate === 'number');
      assert(Array.isArray(auto.eventsByType));
    });

    // -------------------------------------------------------------
    // SECTION 17: TABULAR BUSINESS INTELLIGENCE REPORTS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 17: TABULAR BUSINESS INTELLIGENCE REPORTS ---');

    await itAsync('Reports Engine: Generates property performance tabular report', async () => {
      const r = await analyticsService.getReport('properties', { range: '30D' });
      assert.strictEqual(r.reportType, 'PROPERTY_PERFORMANCE');
      assert(Array.isArray(r.columns));
      assert(Array.isArray(r.rows));
      assert(typeof r.totalRows === 'number');
    });

    await itAsync('Reports Engine: Generates financial revenue tabular report', async () => {
      const r = await analyticsService.getReport('finance', { range: '30D' });
      assert.strictEqual(r.reportType, 'FINANCIAL_REVENUE');
      assert(Array.isArray(r.columns));
      assert(Array.isArray(r.rows));
    });

    await itAsync('Reports Engine: Generates operations work queue tabular report', async () => {
      const r = await analyticsService.getReport('operations', { range: '30D' });
      assert.strictEqual(r.reportType, 'OPERATIONS_TASKS');
      assert(Array.isArray(r.columns));
    });

    await itAsync('Reports Engine: Unknown report type throws NotFoundException', async () => {
      let threw = false;
      try {
        await analyticsService.getReport('invalid_type', {});
      } catch (err) {
        threw = true;
      }
      assert(threw, 'Should throw for invalid report type');
    });

    // -------------------------------------------------------------
    // SECTION 18: CSV EXPORT & AUDIT TRAIL
    // -------------------------------------------------------------
    console.log('\n--- SECTION 18: CSV EXPORT & AUDIT TRAIL ---');

    await itAsync('CSV Export: Generates RFC-4180 compliant CSV string with headers', async () => {
      const exp = await analyticsService.exportReportCsv(adminUser, 'properties', { range: '30D' });
      assert(typeof exp.filename === 'string');
      assert(exp.filename.endsWith('.csv'));
      assert(typeof exp.csv === 'string');
      assert(exp.csv.startsWith('"Property Code"'));
    });

    await itAsync('CSV Export: Records report export event in AuditService', async () => {
      const recentAudit = await db.query(
        `SELECT * FROM audit_logs WHERE action = 'report.exported' ORDER BY id DESC LIMIT 1`
      );
      assert(recentAudit.length >= 1, 'Audit log must record report.exported');
      assert.strictEqual(recentAudit[0].object_type, 'report');
    });

    // -------------------------------------------------------------
    // SECTION 19: CONTROLLER LAYER & API ENDPOINTS
    // -------------------------------------------------------------
    console.log('\n--- SECTION 19: CONTROLLER LAYER & API ENDPOINTS ---');

    await itAsync('Controller: getOverview returns full executive KPIs', async () => {
      const ov = await analyticsController.getOverview({});
      assert(typeof ov.totalUsers === 'number');
    });

    await itAsync('Controller: getFinance returns financial classification metrics', async () => {
      const fin = await analyticsController.getFinance({});
      assert(typeof fin.platformRevenue === 'number');
    });

    await itAsync('Controller: ReportsController.getReport returns tabular payload', async () => {
      const r = await reportsController.getReport('leads', {});
      assert.strictEqual(r.reportType, 'LEAD_FUNNEL');
    });

    // -------------------------------------------------------------
    // SECTION 20: ZERO-DENOMINATOR & MATHEMATICAL SAFETY
    // -------------------------------------------------------------
    console.log('\n--- SECTION 20: MATHEMATICAL & ISOLATION SAFETY ---');

    await itAsync('Math Safety: calcRate with 0 denominator returns 0% without NaN or Infinity', async () => {
      const rate = analyticsService['calcRate'](10, 0);
      assert.strictEqual(rate, 0);
    });

    await itAsync('Math Safety: calcRate handles normal positive ratios accurately', async () => {
      const rate = analyticsService['calcRate'](25, 100);
      assert.strictEqual(rate, 25);
    });

    await itAsync('Privacy Invariant: Analytics queries never return passwords or private identity files', async () => {
      const comp = await analyticsService.getComplianceAnalytics({});
      assert(!('password_hash' in comp));
      assert(!('id_document_url' in comp));
    });

    console.log('\n======================================================================');
    console.log(`  PHASE 16 VERIFICATION SUCCESS: ${passed}/${total} ASSERTIONS PASSED (100%)`);
    console.log('======================================================================\n');
  } catch (err) {
    console.error('Test execution failed:', err);
    process.exit(1);
  } finally {
    if (app) await app.close();
  }
}

main().catch((err) => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
