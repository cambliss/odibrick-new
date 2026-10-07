import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { ulid } from 'ulid';
import {
  StartReconciliationRunDto,
  QueryReconciliationRunsDto,
  QueryExceptionsDto,
  AcknowledgeExceptionDto,
  AssignExceptionDto,
  ResolveExceptionDto,
  ReopenExceptionDto,
  CreatePeriodDto,
  ReviewPeriodDto,
  ClosePeriodDto,
  QueryPeriodsDto,
  QuerySourceCoverageDto,
} from './financial-operations.dto';

const PLATFORM_REVENUE_PURPOSES = new Set([
  'COMMISSION',
  'SERVICE_FEE',
  'LEGAL_FEE',
  'MARKETING_PACKAGE',
]);

@Injectable()
export class FinancialOperationsService {
  private readonly logger = new Logger(FinancialOperationsService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  private isManagement(user: AuthUser): boolean {
    if (!user || !user.roles) return false;
    return (
      user.roles.includes('SUPER_ADMIN') ||
      user.roles.includes('ADMIN') ||
      (user.permissions && user.permissions.includes('payment.manage')) ||
      (user.permissions && user.permissions.includes('finance.manage'))
    );
  }

  private async generateNextRunNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const maxRow = await this.db.one<any>(
      'SELECT COALESCE(MAX(id), 0) AS max_id FROM financial_reconciliation_runs',
    );
    const nextSeq = (maxRow?.max_id || 0) + 1;
    return `ODB-RECON-${year}-${String(nextSeq).padStart(6, '0')}`;
  }

  private async generateNextExceptionNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const maxRow = await this.db.one<any>(
      'SELECT COALESCE(MAX(id), 0) AS max_id FROM financial_exceptions',
    );
    const nextSeq = (maxRow?.max_id || 0) + 1;
    return `ODB-EXC-${year}-${String(nextSeq).padStart(6, '0')}`;
  }

  /**
   * 1. Central Financial Operations & Accounting Control Overview
   */
  async getControlOverview(user: AuthUser, periodStart?: string, periodEnd?: string) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access the Financial Control Overview.');
    }

    const start = periodStart || '2020-01-01 00:00:00';
    const end = periodEnd ? `${periodEnd} 23:59:59` : '2099-12-31 23:59:59';

    // A. Gross Payment Volume & Collections
    const paymentMetrics = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(total_amount), 0) AS gross_volume,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS total_collected,
         COALESCE(SUM(CASE WHEN status = 'DUE' THEN total_amount ELSE 0 END), 0) AS total_outstanding,
         COALESCE(SUM(CASE WHEN status = 'DUE' AND due_date < CURRENT_DATE() THEN total_amount ELSE 0 END), 0) AS total_overdue,
         COALESCE(SUM(CASE WHEN status = 'REFUNDED' THEN total_amount ELSE 0 END), 0) AS total_refunded,
         COUNT(*) AS total_payments_count,
         SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) AS paid_count,
         SUM(CASE WHEN status = 'DUE' THEN 1 ELSE 0 END) AS due_count
       FROM payments
       WHERE created_at BETWEEN ? AND ?`,
      [start, end],
    );

    // B. Platform Revenue (Commission, Service Fee, Legal Fee, Marketing Package)
    const revenueMetrics = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN amount ELSE 0 END), 0) AS net_platform_revenue,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN tax_amount ELSE 0 END), 0) AS platform_gst_collected,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS gross_platform_revenue,
         COALESCE(SUM(CASE WHEN status = 'PAID' AND purpose = 'COMMISSION' THEN total_amount ELSE 0 END), 0) AS commission_revenue,
         COALESCE(SUM(CASE WHEN status = 'PAID' AND purpose = 'SERVICE_FEE' THEN total_amount ELSE 0 END), 0) AS service_fee_revenue,
         COALESCE(SUM(CASE WHEN status = 'PAID' AND purpose = 'LEGAL_FEE' THEN total_amount ELSE 0 END), 0) AS legal_fee_revenue,
         COALESCE(SUM(CASE WHEN status = 'PAID' AND purpose = 'MARKETING_PACKAGE' THEN total_amount ELSE 0 END), 0) AS marketing_revenue,
         COALESCE(SUM(CASE WHEN status = 'DUE' THEN total_amount ELSE 0 END), 0) AS outstanding_platform_receivable
       FROM payments
       WHERE purpose IN ('COMMISSION', 'SERVICE_FEE', 'LEGAL_FEE', 'MARKETING_PACKAGE')
         AND created_at BETWEEN ? AND ?`,
      [start, end],
    );

    // C. Invoice-Backed Revenue vs Uninvoiced Revenue
    const invoiceMetrics = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(total), 0) AS total_invoiced,
         COALESCE(SUM(subtotal), 0) AS invoiced_taxable_subtotal,
         COALESCE(SUM(cgst + sgst + igst), 0) AS invoiced_tax_total,
         COUNT(*) AS total_invoices_issued,
         SUM(CASE WHEN status = 'ISSUED' THEN 1 ELSE 0 END) AS active_invoices_count,
         SUM(CASE WHEN status = 'VOID' THEN 1 ELSE 0 END) AS void_invoices_count
       FROM invoices
       WHERE created_at BETWEEN ? AND ?`,
      [start, end],
    );

    // D. Owner Payouts Status
    const payoutMetrics = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(net_amount), 0) AS total_payout_volume,
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN paid_amount ELSE 0 END), 0) AS total_payouts_settled,
         COALESCE(SUM(CASE WHEN status IN ('PENDING_REVIEW', 'APPROVED', 'PROCESSING') THEN net_amount ELSE 0 END), 0) AS payouts_in_pipeline,
         COALESCE(SUM(CASE WHEN status = 'ON_HOLD' THEN net_amount ELSE 0 END), 0) AS payouts_on_hold,
         COUNT(*) AS total_payouts_count,
         SUM(CASE WHEN reconciliation_status = 'MATCHED' THEN 1 ELSE 0 END) AS reconciled_matched_count,
         SUM(CASE WHEN reconciliation_status IN ('PARTIALLY_MATCHED', 'MISMATCHED') THEN 1 ELSE 0 END) AS reconciliation_mismatch_count,
         SUM(CASE WHEN reconciliation_status = 'UNRECONCILED' AND status = 'PAID' THEN 1 ELSE 0 END) AS unreconciled_paid_payouts_count
       FROM owner_payouts
       WHERE created_at BETWEEN ? AND ?`,
      [start, end],
    );

    // E. Refund & Maintenance Obligations
    const refundMetrics = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END), 0) AS refunds_settled,
         COALESCE(SUM(CASE WHEN status = 'DUE' THEN total_amount ELSE 0 END), 0) AS refunds_pending,
         COUNT(*) AS total_refund_obligations
       FROM payments
       WHERE purpose = 'REFUND'
         AND created_at BETWEEN ? AND ?`,
      [start, end],
    );

    const maintenanceMetrics = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN p.status = 'PAID' THEN p.total_amount ELSE 0 END), 0) AS maintenance_paid,
         COALESCE(SUM(CASE WHEN p.status = 'DUE' THEN p.total_amount ELSE 0 END), 0) AS maintenance_outstanding,
         COUNT(*) AS total_maintenance_obligations
       FROM payments p
       WHERE p.purpose = 'MAINTENANCE'
         AND p.created_at BETWEEN ? AND ?`,
      [start, end],
    );

    // F. Open Financial Disputes & Held Amounts
    const disputeMetrics = await this.db.one<any>(
      `SELECT
         COALESCE(SUM(amount_claimed), 0) AS total_disputed_amount,
         COUNT(*) AS active_financial_disputes
       FROM disputes
       WHERE status NOT IN ('RESOLVED', 'CLOSED', 'WITHDRAWN')`,
    );

    // G. Open Exceptions in System
    const exceptionMetrics = await this.db.one<any>(
      `SELECT
         COUNT(*) AS total_exceptions,
         SUM(CASE WHEN status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING') THEN 1 ELSE 0 END) AS open_exceptions,
         SUM(CASE WHEN severity = 'CRITICAL' AND status != 'RESOLVED' THEN 1 ELSE 0 END) AS critical_open_exceptions,
         SUM(CASE WHEN severity = 'WARNING' AND status != 'RESOLVED' THEN 1 ELSE 0 END) AS warning_open_exceptions
       FROM financial_exceptions`,
    );

    // H. Latest Reconciliation Run
    const latestRun = await this.db.one<any>(
      `SELECT * FROM financial_reconciliation_runs ORDER BY id DESC LIMIT 1`,
    );

    // I. Current Active Period
    const currentPeriod = await this.db.one<any>(
      `SELECT * FROM financial_periods WHERE status = 'OPEN' ORDER BY id DESC LIMIT 1`,
    );

    return {
      period: {
        start: periodStart || 'ALL_TIME',
        end: periodEnd || 'ALL_TIME',
        currentActivePeriod: currentPeriod || null,
      },
      volume: {
        grossVolume: Number(paymentMetrics?.gross_volume || 0),
        totalCollected: Number(paymentMetrics?.total_collected || 0),
        totalOutstanding: Number(paymentMetrics?.total_outstanding || 0),
        totalOverdue: Number(paymentMetrics?.total_overdue || 0),
        totalRefunded: Number(paymentMetrics?.total_refunded || 0),
        totalPaymentsCount: Number(paymentMetrics?.total_payments_count || 0),
        paidCount: Number(paymentMetrics?.paid_count || 0),
        dueCount: Number(paymentMetrics?.due_count || 0),
      },
      platformRevenue: {
        grossRevenue: Number(revenueMetrics?.gross_platform_revenue || 0),
        netRevenue: Number(revenueMetrics?.net_platform_revenue || 0),
        gstCollected: Number(revenueMetrics?.platform_gst_collected || 0),
        breakdown: {
          commission: Number(revenueMetrics?.commission_revenue || 0),
          serviceFee: Number(revenueMetrics?.service_fee_revenue || 0),
          legalFee: Number(revenueMetrics?.legal_fee_revenue || 0),
          marketingPackage: Number(revenueMetrics?.marketing_revenue || 0),
        },
        outstandingReceivable: Number(revenueMetrics?.outstanding_platform_receivable || 0),
        invoicedGrossRevenue: Number(invoiceMetrics?.total_invoiced || 0),
        uninvoicedEligibleRevenue: Math.max(
          0,
          Number(revenueMetrics?.gross_platform_revenue || 0) - Number(invoiceMetrics?.total_invoiced || 0),
        ),
      },
      ownerPayouts: {
        totalPayoutVolume: Number(payoutMetrics?.total_payout_volume || 0),
        totalSettled: Number(payoutMetrics?.total_payouts_settled || 0),
        inPipeline: Number(payoutMetrics?.payouts_in_pipeline || 0),
        onHold: Number(payoutMetrics?.payouts_on_hold || 0),
        reconciledMatched: Number(payoutMetrics?.reconciled_matched_count || 0),
        reconciliationMismatches: Number(payoutMetrics?.reconciliation_mismatch_count || 0),
        unreconciledPaid: Number(payoutMetrics?.unreconciled_paid_payouts_count || 0),
      },
      obligations: {
        refundsSettled: Number(refundMetrics?.refunds_settled || 0),
        refundsPending: Number(refundMetrics?.refunds_pending || 0),
        maintenancePaid: Number(maintenanceMetrics?.maintenance_paid || 0),
        maintenanceOutstanding: Number(maintenanceMetrics?.maintenance_outstanding || 0),
        disputedHeldAmount: Number(disputeMetrics?.total_disputed_amount || 0),
        activeDisputesCount: Number(disputeMetrics?.active_financial_disputes || 0),
      },
      exceptions: {
        total: Number(exceptionMetrics?.total_exceptions || 0),
        open: Number(exceptionMetrics?.open_exceptions || 0),
        critical: Number(exceptionMetrics?.critical_open_exceptions || 0),
        warnings: Number(exceptionMetrics?.warning_open_exceptions || 0),
      },
      latestReconciliationRun: latestRun || null,
    };
  }

  /**
   * 2. Execute Financial Reconciliation Run
   */
  async runReconciliation(user: AuthUser, dto: StartReconciliationRunDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can execute reconciliation runs.');
    }

    const runNumber = await this.generateNextRunNumber();
    const publicId = ulid().toLowerCase();
    const startedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    const periodStart = dto.periodStart || '2020-01-01';
    const periodEnd = dto.periodEnd || '2099-12-31';

    // Insert RUNNING record
    const runId = await this.db.insert('financial_reconciliation_runs', {
      public_id: publicId,
      run_number: runNumber,
      period_start: dto.periodStart ? periodStart : null,
      period_end: dto.periodEnd ? periodEnd : null,
      status: 'RUNNING',
      operator_id: user.id,
      records_scanned: 0,
      issues_found: 0,
      critical_issues: 0,
      warnings: 0,
      matched_records: 0,
      unmatched_records: 0,
      started_at: startedAt,
    });

    const issues: Array<{
      category: string;
      severity: 'INFO' | 'WARNING' | 'CRITICAL';
      title: string;
      description: string;
      fingerprint: string;
      expectedValue?: string;
      actualValue?: string;
      paymentId?: number;
      paymentTransactionId?: number;
      payoutId?: number;
      invoiceId?: number;
      tenancyId?: number;
      propertyId?: number;
      disputeId?: number;
    }> = [];

    let recordsScanned = 0;
    let matchedRecords = 0;

    // Rule 1: Payments marked PAID but missing payment_transactions or settlement
    const paidPayments = await this.db.query<any>(
      `SELECT p.*, pt.id AS txn_id, pt.status AS txn_status
         FROM payments p
         LEFT JOIN payment_transactions pt ON pt.payment_id = p.id
        WHERE p.created_at BETWEEN ? AND ?`,
      [`${periodStart} 00:00:00`, `${periodEnd} 23:59:59`],
    );
    recordsScanned += paidPayments.length;

    for (const p of paidPayments) {
      if (p.status === 'PAID' && !p.txn_id && p.settlement_mode !== 'OFFLINE_RECORDED' && p.settlement_mode !== 'DIRECT_TO_PAYEE') {
        issues.push({
          category: 'TRANSACTION',
          severity: 'WARNING',
          title: `Settled payment #${p.reference_code} is missing ledger transaction`,
          description: `Payment #${p.id} (${p.reference_code}) has status PAID but no associated record in payment_transactions table.`,
          fingerprint: `PAY_MISSING_TXN:${p.id}`,
          expectedValue: 'PAYMENT_TRANSACTION record exists',
          actualValue: 'No transaction record found',
          paymentId: p.id,
          tenancyId: p.tenancy_id,
          propertyId: p.property_id,
        });
      } else {
        matchedRecords++;
      }
    }

    // Rule 2: Platform revenue payment is PAID but invoice is missing
    const uninvoicedRev = await this.db.query<any>(
      `SELECT p.*, inv.id AS existing_invoice_id, inv.status AS inv_status
         FROM payments p
         LEFT JOIN invoices inv ON (inv.payment_id = p.id OR p.invoice_id = inv.id)
        WHERE p.status = 'PAID'
          AND p.purpose IN ('COMMISSION', 'SERVICE_FEE', 'LEGAL_FEE', 'MARKETING_PACKAGE')
          AND p.created_at BETWEEN ? AND ?`,
      [`${periodStart} 00:00:00`, `${periodEnd} 23:59:59`],
    );
    recordsScanned += uninvoicedRev.length;

    for (const r of uninvoicedRev) {
      if (!r.existing_invoice_id && !r.invoice_id) {
        issues.push({
          category: 'INVOICE',
          severity: 'INFO',
          title: `Eligible revenue payment #${r.reference_code} has no tax invoice`,
          description: `Platform revenue payment #${r.id} (${r.purpose} - ₹${r.total_amount}) is settled but does not have an issued GST invoice.`,
          fingerprint: `REV_MISSING_INV:${r.id}`,
          expectedValue: 'Tax invoice issued',
          actualValue: 'Uninvoiced revenue',
          paymentId: r.id,
          tenancyId: r.tenancy_id,
          propertyId: r.property_id,
        });
      } else {
        matchedRecords++;
      }
    }

    // Rule 3: Invoice exists with amount mismatch against underlying payment
    const invoices = await this.db.query<any>(
      `SELECT inv.*, p.total_amount AS payment_total, p.status AS payment_status
         FROM invoices inv
         JOIN payments p ON p.id = inv.payment_id
        WHERE inv.created_at BETWEEN ? AND ?`,
      [`${periodStart} 00:00:00`, `${periodEnd} 23:59:59`],
    );
    recordsScanned += invoices.length;

    for (const inv of invoices) {
      if (Math.abs(Number(inv.total) - Number(inv.payment_total)) > 0.01) {
        issues.push({
          category: 'INVOICE',
          severity: 'CRITICAL',
          title: `Invoice amount mismatch on #${inv.invoice_number}`,
          description: `Invoice #${inv.invoice_number} total (₹${inv.total}) does not match underlying payment #${inv.payment_id} total (₹${inv.payment_total}).`,
          fingerprint: `INV_AMOUNT_MISMATCH:${inv.id}`,
          expectedValue: `₹${inv.payment_total}`,
          actualValue: `₹${inv.total}`,
          invoiceId: inv.id,
          paymentId: inv.payment_id,
        });
      } else {
        matchedRecords++;
      }
    }

    // Rule 4: Payout marked PAID but missing external reference or reconciliation mismatch
    const payouts = await this.db.query<any>(
      `SELECT op.*,
              (SELECT COALESCE(SUM(CASE WHEN item_type = 'RECEIVABLE' THEN amount ELSE -amount END), 0)
                 FROM owner_payout_items WHERE payout_id = op.id) AS calculated_net
         FROM owner_payouts op
        WHERE op.created_at BETWEEN ? AND ?`,
      [`${periodStart} 00:00:00`, `${periodEnd} 23:59:59`],
    );
    recordsScanned += payouts.length;

    for (const op of payouts) {
      if (op.status === 'PAID' && !op.external_reference) {
        issues.push({
          category: 'PAYOUT',
          severity: 'CRITICAL',
          title: `Settled payout #${op.payout_number} missing external bank reference / UTR`,
          description: `Payout #${op.payout_number} is marked PAID but has no recorded external UTR or bank transaction reference.`,
          fingerprint: `PAYOUT_MISSING_UTR:${op.id}`,
          expectedValue: 'Valid external reference string',
          actualValue: 'NULL / Empty',
          payoutId: op.id,
        });
      } else if (op.reconciliation_status === 'MISMATCHED' || op.reconciliation_status === 'PARTIALLY_MATCHED') {
        issues.push({
          category: 'RECONCILIATION',
          severity: 'WARNING',
          title: `Payout #${op.payout_number} reconciliation variance (${op.reconciliation_status})`,
          description: `Payout #${op.payout_number} expected ₹${op.net_amount}, actual settled ₹${op.paid_amount || 0}.`,
          fingerprint: `PAYOUT_RECON_VARIANCE:${op.id}`,
          expectedValue: `₹${op.net_amount}`,
          actualValue: `₹${op.paid_amount || 0}`,
          payoutId: op.id,
        });
      } else {
        matchedRecords++;
      }
    }

    // Rule 5: Duplicate active payouts containing the same source payment
    const duplicatePayoutItems = await this.db.query<any>(
      `SELECT opi.payment_id, GROUP_CONCAT(op.payout_number) AS payout_numbers, COUNT(*) as c
         FROM owner_payout_items opi
         JOIN owner_payouts op ON op.id = opi.payout_id
        WHERE op.status NOT IN ('REJECTED', 'CANCELLED')
        GROUP BY opi.payment_id
       HAVING c > 1`,
    );

    for (const dup of duplicatePayoutItems) {
      issues.push({
        category: 'DUPLICATE',
        severity: 'CRITICAL',
        title: `Payment #${dup.payment_id} included across multiple active payouts`,
        description: `Source payment #${dup.payment_id} is duplicated across active payouts: ${dup.payout_numbers}.`,
        fingerprint: `PAYMENT_DUPLICATE_PAYOUT:${dup.payment_id}`,
        expectedValue: 'Single active payout mapping',
        actualValue: `${dup.c} payouts (${dup.payout_numbers})`,
        paymentId: dup.payment_id,
      });
    }

    // Rule 6: Maintenance records with completed cost but no corresponding payment
    const unbilledMaint = await this.db.query<any>(
      `SELECT mr.*, p.id AS payment_id
         FROM maintenance_requests mr
         LEFT JOIN payments p ON (p.notes LIKE CONCAT('%', mr.ticket_number, '%') AND p.purpose = 'MAINTENANCE')
        WHERE mr.status = 'COMPLETED'
          AND mr.final_cost > 0
          AND mr.created_at BETWEEN ? AND ?`,
      [`${periodStart} 00:00:00`, `${periodEnd} 23:59:59`],
    );
    recordsScanned += unbilledMaint.length;

    for (const m of unbilledMaint) {
      if (!m.payment_id && (m.cost_bearer === 'TENANT' || m.cost_bearer === 'OWNER')) {
        issues.push({
          category: 'MAINTENANCE',
          severity: 'WARNING',
          title: `Approved maintenance #${m.ticket_number} missing financial payment obligation`,
          description: `Maintenance ticket #${m.ticket_number} (₹${m.final_cost}) is completed for ${m.cost_bearer} but no corresponding payment record exists.`,
          fingerprint: `MAINT_MISSING_PAYMENT:${m.id}`,
          expectedValue: 'MAINTENANCE payment created',
          actualValue: 'No payment record',
          tenancyId: m.tenancy_id,
          propertyId: m.property_id,
        });
      } else {
        matchedRecords++;
      }
    }

    // Rule 7: Active disputes on tenancies where payouts or settlements are proceeding unchecked
    const disputedTenancies = await this.db.query<any>(
      `SELECT d.id AS dispute_id, d.case_number, d.amount_claimed, d.tenancy_id,
              op.id AS payout_id, op.payout_number
         FROM disputes d
         JOIN owner_payout_items opi ON 1=1
         JOIN payments p ON p.id = opi.payment_id AND p.tenancy_id = d.tenancy_id
         JOIN owner_payouts op ON op.id = opi.payout_id
        WHERE d.status NOT IN ('RESOLVED', 'CLOSED', 'WITHDRAWN')
          AND op.status IN ('APPROVED', 'PROCESSING', 'PAID')`,
    );

    for (const dt of disputedTenancies) {
      issues.push({
        category: 'DISPUTE',
        severity: 'CRITICAL',
        title: `Active dispute #${dt.case_number} on tenancy in payout #${dt.payout_number}`,
        description: `Tenancy #${dt.tenancy_id} has an open dispute #${dt.case_number} (₹${dt.amount_claimed}) but was included in approved/paid payout #${dt.payout_number}.`,
        fingerprint: `DISPUTE_PAYOUT_COLLISION:${dt.dispute_id}:${dt.payout_id}`,
        expectedValue: 'Disputed tenancy obligations held',
        actualValue: `Included in payout ${dt.payout_number}`,
        disputeId: dt.dispute_id,
        payoutId: dt.payout_id,
        tenancyId: dt.tenancy_id,
      });
    }

    // Rule 8: Commercial Obligations consistency checks
    const commercialInconsistencies = await this.db.query<any>(
      `SELECT co.*, p.status AS actual_payment_status, p.total_amount AS actual_payment_amount
         FROM commercial_obligations co
         LEFT JOIN payments p ON p.id = co.payment_id
        WHERE co.created_at BETWEEN ? AND ?`,
      [`${periodStart} 00:00:00`, `${periodEnd} 23:59:59`],
    );
    recordsScanned += commercialInconsistencies.length;

    for (const co of commercialInconsistencies) {
      if (co.status === 'PAYMENT_DUE' && !co.payment_id) {
        issues.push({
          category: 'PAYMENT',
          severity: 'CRITICAL',
          title: `Approved commercial obligation #${co.obligation_number} has no linked payment`,
          description: `Commercial obligation #${co.obligation_number} is in PAYMENT_DUE status but has no payment_id recorded.`,
          fingerprint: `COMMERCIAL_MISSING_PAYMENT:${co.id}`,
          expectedValue: 'Valid payment_id linked',
          actualValue: 'payment_id is NULL',
          tenancyId: co.tenancy_id,
          propertyId: co.property_id,
        });
      } else if (co.status === 'PAID' && co.actual_payment_status !== 'PAID') {
        issues.push({
          category: 'PAYMENT',
          severity: 'CRITICAL',
          title: `Commercial obligation #${co.obligation_number} marked PAID but payment is ${co.actual_payment_status || 'MISSING'}`,
          description: `Commercial obligation #${co.obligation_number} indicates PAID but underlying payment #${co.payment_id} status is ${co.actual_payment_status || 'MISSING'}.`,
          fingerprint: `COMMERCIAL_STATUS_MISMATCH:${co.id}:${co.payment_id}`,
          expectedValue: 'Payment status PAID',
          actualValue: `Payment status ${co.actual_payment_status || 'MISSING'}`,
          paymentId: co.payment_id,
          tenancyId: co.tenancy_id,
          propertyId: co.property_id,
        });
      } else {
        matchedRecords++;
      }
    }

    // Rule 9: Marketplace & Promotion consistency checks
    const marketplacePromotions = await this.db.query<any>(
      `SELECT lp.*,
              p.status AS actual_payment_status,
              prop.status AS property_status,
              prop.is_featured AS property_is_featured,
              prop.visibility_tier AS property_visibility_tier
         FROM listing_promotions lp
         LEFT JOIN payments p ON p.id = lp.payment_id
         JOIN properties prop ON prop.id = lp.listing_id
        WHERE lp.created_at BETWEEN ? AND ?`,
      [`${periodStart} 00:00:00`, `${periodEnd} 23:59:59`],
    );
    recordsScanned += marketplacePromotions.length;

    for (const lp of marketplacePromotions) {
      if (lp.status === 'ACTIVE' && lp.activation_source === 'PAID_PACKAGE' && lp.actual_payment_status !== 'PAID') {
        issues.push({
          category: 'PAYMENT',
          severity: 'CRITICAL',
          title: `Active promotion #${lp.promotion_code} on property #${lp.listing_id} has unpaid payment (${lp.actual_payment_status || 'MISSING'})`,
          description: `Listing promotion #${lp.promotion_code} is ACTIVE but linked payment #${lp.payment_id || 'NULL'} status is ${lp.actual_payment_status || 'MISSING'}.`,
          fingerprint: `MARKETPLACE_UNPAID_PROMOTION:${lp.id}:${lp.payment_id}`,
          expectedValue: 'Payment status PAID',
          actualValue: `Payment status ${lp.actual_payment_status || 'MISSING'}`,
          paymentId: lp.payment_id,
          propertyId: lp.listing_id,
        });
      } else if (lp.property_status === 'SUSPENDED' && lp.status === 'ACTIVE') {
        issues.push({
          category: 'COMPLIANCE',
          severity: 'WARNING',
          title: `Suspended property #${lp.listing_id} has active promotion #${lp.promotion_code}`,
          description: `Property #${lp.listing_id} is SUSPENDED but promotion #${lp.promotion_code} remains ACTIVE.`,
          fingerprint: `SUSPENDED_PROPERTY_PROMOTION:${lp.id}:${lp.listing_id}`,
          expectedValue: 'Promotion suspended / visibility revoked',
          actualValue: 'Promotion ACTIVE on suspended property',
          propertyId: lp.listing_id,
        });
      } else {
        matchedRecords++;
      }
    }

    // Persist or Update Exceptions into database idempotently
    let criticalCount = 0;
    let warningCount = 0;

    for (const issue of issues) {
      if (issue.severity === 'CRITICAL') criticalCount++;
      if (issue.severity === 'WARNING') warningCount++;

      const existingExc = await this.db.one<any>(
        'SELECT id, status FROM financial_exceptions WHERE fingerprint = ?',
        [issue.fingerprint],
      );

      if (!existingExc) {
        const excNumber = await this.generateNextExceptionNumber();
        const excPublicId = ulid().toLowerCase();

        await this.db.insert('financial_exceptions', {
          public_id: excPublicId,
          exception_number: excNumber,
          fingerprint: issue.fingerprint,
          run_id: runId,
          category: issue.category,
          severity: issue.severity,
          status: 'OPEN',
          payment_id: issue.paymentId || null,
          payment_transaction_id: issue.paymentTransactionId || null,
          payout_id: issue.payoutId || null,
          invoice_id: issue.invoiceId || null,
          tenancy_id: issue.tenancyId || null,
          property_id: issue.propertyId || null,
          dispute_id: issue.disputeId || null,
          title: issue.title,
          description: issue.description,
          expected_value: issue.expectedValue || null,
          actual_value: issue.actualValue || null,
        });
      } else if (existingExc.status !== 'RESOLVED' && existingExc.status !== 'IGNORED') {
        // Update run_id linkage
        await this.db.update('financial_exceptions', existingExc.id, {
          run_id: runId,
          updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
        });
      }
    }

    const finalStatus =
      issues.length === 0 ? 'COMPLETED' : 'COMPLETED_WITH_EXCEPTIONS';
    const completedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.update('financial_reconciliation_runs', runId, {
      status: finalStatus,
      records_scanned: recordsScanned,
      issues_found: issues.length,
      critical_issues: criticalCount,
      warnings: warningCount,
      matched_records: matchedRecords,
      unmatched_records: issues.length,
      summary_json: JSON.stringify({
        issuesByCategory: issues.reduce((acc: any, i) => {
          acc[i.category] = (acc[i.category] || 0) + 1;
          return acc;
        }, {}),
        executedBy: user.email,
      }),
      completed_at: completedAt,
    });

    await this.audit.record({
      actor: user,
      action: 'financial.reconciliation_completed',
      objectType: 'financial_reconciliation_run',
      objectId: runId,
      metadata: {
        runNumber,
        status: finalStatus,
        recordsScanned,
        issuesFound: issues.length,
        criticalIssues: criticalCount,
        warnings: warningCount,
      },
      req,
    });

    return this.getReconciliationRun(user, runId);
  }

  /**
   * 3. Reconciliation Runs Queries
   */
  async listReconciliationRuns(user: AuthUser, dto: QueryReconciliationRunsDto) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access reconciliation runs.');
    }

    const page = Number(dto.page) || 1;
    const pageSize = Number(dto.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (dto.status) {
      whereClauses.push('r.status = ?');
      params.push(dto.status);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM financial_reconciliation_runs r WHERE ${whereSql}`,
      params,
    );
    const total = countRow?.total || 0;

    const items = await this.db.query<any>(
      `SELECT r.*, u.full_name AS operator_name, u.email AS operator_email
         FROM financial_reconciliation_runs r
         JOIN users u ON u.id = r.operator_id
        WHERE ${whereSql}
        ORDER BY r.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getReconciliationRun(user: AuthUser, id: number) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can inspect reconciliation runs.');
    }

    const run = await this.db.one<any>(
      `SELECT r.*, u.full_name AS operator_name, u.email AS operator_email
         FROM financial_reconciliation_runs r
         JOIN users u ON u.id = r.operator_id
        WHERE r.id = ?`,
      [id],
    );
    if (!run) throw new NotFoundException(`Reconciliation run #${id} not found.`);

    const exceptions = await this.db.query<any>(
      `SELECT fe.*,
              assignee.full_name AS assignee_name,
              resolver.full_name AS resolver_name
         FROM financial_exceptions fe
         LEFT JOIN users assignee ON assignee.id = fe.assigned_to
         LEFT JOIN users resolver ON resolver.id = fe.resolved_by
        WHERE fe.run_id = ?
        ORDER BY fe.severity = 'CRITICAL' DESC, fe.id DESC`,
      [id],
    );

    return {
      ...run,
      summaryJson: typeof run.summary_json === 'string' ? JSON.parse(run.summary_json) : run.summary_json,
      exceptions,
    };
  }

  /**
   * 4. Financial Exceptions Management
   */
  async listExceptions(user: AuthUser, dto: QueryExceptionsDto) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access financial exceptions.');
    }

    const page = Number(dto.page) || 1;
    const pageSize = Number(dto.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (dto.status) {
      whereClauses.push('fe.status = ?');
      params.push(dto.status);
    }
    if (dto.category) {
      whereClauses.push('fe.category = ?');
      params.push(dto.category);
    }
    if (dto.severity) {
      whereClauses.push('fe.severity = ?');
      params.push(dto.severity);
    }
    if (dto.runId) {
      whereClauses.push('fe.run_id = ?');
      params.push(dto.runId);
    }
    if (dto.search) {
      whereClauses.push('(fe.exception_number LIKE ? OR fe.title LIKE ? OR fe.description LIKE ?)');
      params.push(`%${dto.search}%`, `%${dto.search}%`, `%${dto.search}%`);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM financial_exceptions fe WHERE ${whereSql}`,
      params,
    );
    const total = countRow?.total || 0;

    const items = await this.db.query<any>(
      `SELECT fe.*,
              r.run_number,
              p.reference_code AS payment_reference,
              op.payout_number,
              inv.invoice_number,
              assignee.full_name AS assignee_name,
              resolver.full_name AS resolver_name
         FROM financial_exceptions fe
         LEFT JOIN financial_reconciliation_runs r ON r.id = fe.run_id
         LEFT JOIN payments p ON p.id = fe.payment_id
         LEFT JOIN owner_payouts op ON op.id = fe.payout_id
         LEFT JOIN invoices inv ON inv.id = fe.invoice_id
         LEFT JOIN users assignee ON assignee.id = fe.assigned_to
         LEFT JOIN users resolver ON resolver.id = fe.resolved_by
        WHERE ${whereSql}
        ORDER BY fe.status = 'OPEN' DESC, fe.severity = 'CRITICAL' DESC, fe.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getException(user: AuthUser, id: number) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can inspect financial exceptions.');
    }

    const exc = await this.db.one<any>(
      `SELECT fe.*,
              r.run_number,
              p.reference_code AS payment_reference, p.amount AS payment_amount, p.status AS payment_status,
              op.payout_number, op.net_amount AS payout_net_amount, op.status AS payout_status,
              inv.invoice_number, inv.total AS invoice_total, inv.status AS invoice_status,
              d.case_number AS dispute_case_number, d.amount_claimed AS dispute_amount,
              assignee.full_name AS assignee_name, assignee.email AS assignee_email,
              resolver.full_name AS resolver_name, resolver.email AS resolver_email
         FROM financial_exceptions fe
         LEFT JOIN financial_reconciliation_runs r ON r.id = fe.run_id
         LEFT JOIN payments p ON p.id = fe.payment_id
         LEFT JOIN owner_payouts op ON op.id = fe.payout_id
         LEFT JOIN invoices inv ON inv.id = fe.invoice_id
         LEFT JOIN disputes d ON d.id = fe.dispute_id
         LEFT JOIN users assignee ON assignee.id = fe.assigned_to
         LEFT JOIN users resolver ON resolver.id = fe.resolved_by
        WHERE fe.id = ?`,
      [id],
    );
    if (!exc) throw new NotFoundException(`Financial exception #${id} not found.`);

    return exc;
  }

  async acknowledgeException(user: AuthUser, id: number, dto: AcknowledgeExceptionDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can acknowledge financial exceptions.');
    }

    const exc = await this.getException(user, id);
    if (exc.status === 'RESOLVED') {
      throw new BadRequestException('Cannot acknowledge an already resolved exception.');
    }

    await this.db.update('financial_exceptions', id, {
      status: 'ACKNOWLEDGED',
      assigned_to: exc.assigned_to || user.id,
      resolution_notes: dto.notes ? `[Acknowledged] ${dto.notes}` : exc.resolution_notes,
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    await this.audit.record({
      actor: user,
      action: 'financial.exception_acknowledged',
      objectType: 'financial_exception',
      objectId: id,
      metadata: { exceptionNumber: exc.exception_number, notes: dto.notes },
      req,
    });

    return this.getException(user, id);
  }

  async assignException(user: AuthUser, id: number, dto: AssignExceptionDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can assign financial exceptions.');
    }

    const exc = await this.getException(user, id);
    const targetUser = await this.db.one<any>(
      'SELECT id, full_name, email FROM users WHERE id = ?',
      [dto.assignedTo],
    );
    if (!targetUser) throw new NotFoundException(`User #${dto.assignedTo} not found.`);

    await this.db.update('financial_exceptions', id, {
      assigned_to: dto.assignedTo,
      status: exc.status === 'OPEN' ? 'INVESTIGATING' : exc.status,
      resolution_notes: dto.notes
        ? `${exc.resolution_notes || ''}\n[Assigned to ${targetUser.full_name}] ${dto.notes}`.trim()
        : exc.resolution_notes,
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    await this.audit.record({
      actor: user,
      action: 'financial.exception_assigned',
      objectType: 'financial_exception',
      objectId: id,
      metadata: {
        exceptionNumber: exc.exception_number,
        assignedTo: dto.assignedTo,
        assigneeName: targetUser.full_name,
        notes: dto.notes,
      },
      req,
    });

    return this.getException(user, id);
  }

  async resolveException(user: AuthUser, id: number, dto: ResolveExceptionDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can resolve financial exceptions.');
    }

    const exc = await this.getException(user, id);
    if (exc.status === 'RESOLVED') {
      throw new BadRequestException('Exception is already resolved.');
    }

    const resolvedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.update('financial_exceptions', id, {
      status: 'RESOLVED',
      resolution_notes: `${exc.resolution_notes || ''}\n[Resolved by ${user.fullName || user.email}] ${dto.resolutionNotes}`.trim(),
      resolved_by: user.id,
      resolved_at: resolvedAt,
      updated_at: resolvedAt,
    });

    await this.audit.record({
      actor: user,
      action: 'financial.exception_resolved',
      objectType: 'financial_exception',
      objectId: id,
      metadata: {
        exceptionNumber: exc.exception_number,
        resolutionNotes: dto.resolutionNotes,
        resolutionType: dto.resolutionType,
      },
      req,
    });

    return this.getException(user, id);
  }

  async reopenException(user: AuthUser, id: number, dto: ReopenExceptionDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can reopen financial exceptions.');
    }

    const exc = await this.getException(user, id);
    if (exc.status !== 'RESOLVED' && exc.status !== 'IGNORED') {
      throw new BadRequestException('Only resolved or ignored exceptions can be reopened.');
    }

    await this.db.update('financial_exceptions', id, {
      status: 'INVESTIGATING',
      resolution_notes: `${exc.resolution_notes || ''}\n[Reopened by ${user.fullName || user.email}] ${dto.notes}`.trim(),
      resolved_by: null,
      resolved_at: null,
      updated_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
    });

    await this.audit.record({
      actor: user,
      action: 'financial.exception_reopened',
      objectType: 'financial_exception',
      objectId: id,
      metadata: { exceptionNumber: exc.exception_number, reason: dto.notes },
      req,
    });

    return this.getException(user, id);
  }

  /**
   * 5. Financial Periods & Accounting Close
   */
  async listPeriods(user: AuthUser, dto: QueryPeriodsDto) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access financial periods.');
    }

    const page = Number(dto.page) || 1;
    const pageSize = Number(dto.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (dto.status) {
      whereClauses.push('fp.status = ?');
      params.push(dto.status);
    }

    const whereSql = whereClauses.join(' AND ');

    const countRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM financial_periods fp WHERE ${whereSql}`,
      params,
    );
    const total = countRow?.total || 0;

    const items = await this.db.query<any>(
      `SELECT fp.*,
              opened.full_name AS opener_name,
              reviewed.full_name AS reviewer_name,
              closed.full_name AS closer_name
         FROM financial_periods fp
         LEFT JOIN users opened ON opened.id = fp.opened_by
         LEFT JOIN users reviewed ON reviewed.id = fp.reviewed_by
         LEFT JOIN users closed ON closed.id = fp.closed_by
        WHERE ${whereSql}
        ORDER BY fp.period_start DESC
        LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getPeriod(user: AuthUser, id: number) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can inspect financial periods.');
    }

    const period = await this.db.one<any>(
      `SELECT fp.*,
              opened.full_name AS opener_name,
              reviewed.full_name AS reviewer_name,
              closed.full_name AS closer_name
         FROM financial_periods fp
         LEFT JOIN users opened ON opened.id = fp.opened_by
         LEFT JOIN users reviewed ON reviewed.id = fp.reviewed_by
         LEFT JOIN users closed ON closed.id = fp.closed_by
        WHERE fp.id = ?`,
      [id],
    );
    if (!period) throw new NotFoundException(`Financial period #${id} not found.`);

    // Attach current metrics snapshot for this period
    const snapshot = await this.getControlOverview(user, period.period_start, period.period_end);

    return {
      ...period,
      summarySnapshot: typeof period.summary_snapshot === 'string' ? JSON.parse(period.summary_snapshot) : period.summary_snapshot || snapshot,
      liveSnapshot: snapshot,
    };
  }

  async createPeriod(user: AuthUser, dto: CreatePeriodDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can create financial periods.');
    }

    const existingCode = await this.db.one<any>(
      'SELECT id FROM financial_periods WHERE period_code = ?',
      [dto.periodCode],
    );
    if (existingCode) {
      throw new ConflictException(`Financial period code "${dto.periodCode}" already exists.`);
    }

    const publicId = ulid().toLowerCase();
    const periodId = await this.db.insert('financial_periods', {
      public_id: publicId,
      period_code: dto.periodCode,
      period_start: dto.periodStart,
      period_end: dto.periodEnd,
      status: 'OPEN',
      opened_by: user.id,
      notes: dto.notes || null,
    });

    await this.audit.record({
      actor: user,
      action: 'financial.period_opened',
      objectType: 'financial_period',
      objectId: periodId,
      metadata: { periodCode: dto.periodCode, start: dto.periodStart, end: dto.periodEnd },
      req,
    });

    return this.getPeriod(user, periodId);
  }

  async reviewPeriod(user: AuthUser, id: number, dto: ReviewPeriodDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can place financial periods into review.');
    }

    const period = await this.getPeriod(user, id);
    if (period.status === 'CLOSED') {
      throw new BadRequestException('Cannot review an already CLOSED financial period.');
    }

    const snapshot = await this.getControlOverview(user, period.period_start, period.period_end);
    const reviewedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.update('financial_periods', id, {
      status: 'REVIEWING',
      reviewed_by: user.id,
      reviewed_at: reviewedAt,
      summary_snapshot: JSON.stringify(snapshot),
      notes: dto.notes ? `${period.notes || ''}\n[Review] ${dto.notes}`.trim() : period.notes,
      updated_at: reviewedAt,
    });

    await this.audit.record({
      actor: user,
      action: 'financial.period_reviewing',
      objectType: 'financial_period',
      objectId: id,
      metadata: { periodCode: period.period_code, notes: dto.notes },
      req,
    });

    return this.getPeriod(user, id);
  }

  async closePeriod(user: AuthUser, id: number, dto: ClosePeriodDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can close financial periods.');
    }

    const period = await this.getPeriod(user, id);
    if (period.status === 'CLOSED') {
      throw new BadRequestException('Financial period is already closed.');
    }

    // Ensure all critical exceptions in this period are resolved or acknowledged
    const criticalOpenRow = await this.db.one<any>(
      `SELECT COUNT(*) AS c
         FROM financial_exceptions fe
         JOIN payments p ON p.id = fe.payment_id
        WHERE fe.severity = 'CRITICAL'
          AND fe.status = 'OPEN'
          AND p.created_at BETWEEN ? AND ?`,
      [`${period.period_start} 00:00:00`, `${period.period_end} 23:59:59`],
    );
    if (criticalOpenRow && Number(criticalOpenRow.c) > 0) {
      throw new BadRequestException(
        `Cannot close financial period. There are ${criticalOpenRow.c} open critical financial exceptions.`,
      );
    }

    const finalSnapshot = await this.getControlOverview(user, period.period_start, period.period_end);
    const closedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');

    await this.db.update('financial_periods', id, {
      status: 'CLOSED',
      closed_by: user.id,
      closed_at: closedAt,
      summary_snapshot: JSON.stringify(finalSnapshot),
      notes: dto.notes ? `${period.notes || ''}\n[Closed] ${dto.notes}`.trim() : period.notes,
      updated_at: closedAt,
    });

    await this.audit.record({
      actor: user,
      action: 'financial.period_closed',
      objectType: 'financial_period',
      objectId: id,
      metadata: { periodCode: period.period_code, notes: dto.notes },
      req,
    });

    return this.getPeriod(user, id);
  }

  /**
   * 6. Source Coverage Classification
   */
  async getSourceCoverage(user: AuthUser, dto: QuerySourceCoverageDto) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access financial source coverage.');
    }

    const start = dto.periodStart || '2020-01-01 00:00:00';
    const end = dto.periodEnd ? `${dto.periodEnd} 23:59:59` : '2099-12-31 23:59:59';

    // Fetch active payouts item map
    const activePayoutItems = await this.db.query<any>(
      `SELECT opi.payment_id, op.id AS payout_id, op.payout_number, op.status AS payout_status
         FROM owner_payout_items opi
         JOIN owner_payouts op ON op.id = opi.payout_id
        WHERE op.status NOT IN ('REJECTED', 'CANCELLED')`,
    );
    const payoutMap = new Map<number, { payoutId: number; payoutNumber: string; status: string }>();
    activePayoutItems.forEach((r) => {
      payoutMap.set(Number(r.payment_id), {
        payoutId: r.payout_id,
        payoutNumber: r.payout_number,
        status: r.payout_status,
      });
    });

    // Fetch active disputes
    const activeDisputes = await this.db.query<any>(
      `SELECT id, case_number, tenancy_id, amount_claimed FROM disputes WHERE status NOT IN ('RESOLVED', 'CLOSED', 'WITHDRAWN')`,
    );
    const disputedTenancySet = new Set(activeDisputes.map((d) => d.tenancy_id).filter(Boolean));

    // Fetch candidate payments
    const whereClauses: string[] = ['p.created_at BETWEEN ? AND ?'];
    const params: any[] = [start, end];

    if (dto.ownerUserId) {
      whereClauses.push('(p.payee_user_id = ? OR p.payer_user_id = ?)');
      params.push(dto.ownerUserId, dto.ownerUserId);
    }

    const payments = await this.db.query<any>(
      `SELECT p.*,
              prop.title AS property_title,
              payer.full_name AS payer_name,
              payee.full_name AS payee_name
         FROM payments p
         LEFT JOIN properties prop ON prop.id = p.property_id
         LEFT JOIN users payer ON payer.id = p.payer_user_id
         LEFT JOIN users payee ON payee.id = p.payee_user_id
        WHERE ${whereClauses.join(' AND ')}
        ORDER BY p.paid_at DESC, p.created_at DESC`,
      params,
    );

    const items = payments.map((p) => {
      const pId = Number(p.id);
      let coverageStatus = 'EXCLUDED';
      let coverageDetails: any = null;

      if (payoutMap.has(pId)) {
        const pInfo = payoutMap.get(pId)!;
        if (pInfo.status === 'PAID') {
          coverageStatus = 'PAID_OUT';
        } else {
          coverageStatus = 'IN_ACTIVE_PAYOUT';
        }
        coverageDetails = pInfo;
      } else if (p.tenancy_id && disputedTenancySet.has(p.tenancy_id)) {
        coverageStatus = 'DISPUTED';
        coverageDetails = { reason: 'Active dispute on tenancy' };
      } else if (p.status === 'PAID') {
        coverageStatus = 'ELIGIBLE_NOT_PAID_OUT';
      } else {
        coverageStatus = 'EXCLUDED';
        coverageDetails = { reason: `Payment status is ${p.status}` };
      }

      return {
        paymentId: p.id,
        referenceCode: p.reference_code,
        purpose: p.purpose,
        amount: Number(p.total_amount),
        status: p.status,
        payerName: p.payer_name,
        payeeName: p.payee_name,
        propertyTitle: p.property_title,
        paidAt: p.paid_at,
        coverageStatus,
        coverageDetails,
      };
    });

    const filtered = dto.coverageStatus
      ? items.filter((i) => i.coverageStatus === dto.coverageStatus)
      : items;

    const summary = items.reduce((acc: any, i) => {
      acc[i.coverageStatus] = (acc[i.coverageStatus] || 0) + 1;
      return acc;
    }, {});

    return {
      summary,
      totalCount: items.length,
      filteredCount: filtered.length,
      items: filtered,
    };
  }

  /**
   * 7. Detailed Platform Revenue Breakdown
   */
  async getPlatformRevenueBreakdown(user: AuthUser, periodStart?: string, periodEnd?: string) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can inspect platform revenue breakdown.');
    }

    const start = periodStart || '2020-01-01 00:00:00';
    const end = periodEnd ? `${periodEnd} 23:59:59` : '2099-12-31 23:59:59';

    const revenuePayments = await this.db.query<any>(
      `SELECT p.*,
              inv.id AS invoice_id, inv.invoice_number, inv.status AS invoice_status,
              payer.full_name AS payer_name,
              prop.title AS property_title
         FROM payments p
         LEFT JOIN invoices inv ON (inv.payment_id = p.id OR p.invoice_id = inv.id)
         LEFT JOIN users payer ON payer.id = p.payer_user_id
         LEFT JOIN properties prop ON prop.id = p.property_id
        WHERE p.purpose IN ('COMMISSION', 'SERVICE_FEE', 'LEGAL_FEE', 'MARKETING_PACKAGE')
          AND p.created_at BETWEEN ? AND ?
        ORDER BY p.paid_at DESC, p.created_at DESC`,
      [start, end],
    );

    let grossRevenue = 0;
    let taxableSubtotal = 0;
    let gstCollected = 0;
    let invoicedRevenue = 0;
    let uninvoicedRevenue = 0;

    const categorized: Record<string, { count: number; total: number; paid: number; due: number }> = {
      COMMISSION: { count: 0, total: 0, paid: 0, due: 0 },
      SERVICE_FEE: { count: 0, total: 0, paid: 0, due: 0 },
      LEGAL_FEE: { count: 0, total: 0, paid: 0, due: 0 },
      MARKETING_PACKAGE: { count: 0, total: 0, paid: 0, due: 0 },
    };

    revenuePayments.forEach((p) => {
      const amt = Number(p.total_amount);
      const isPaid = p.status === 'PAID';

      if (isPaid) {
        grossRevenue += amt;
        taxableSubtotal += Number(p.amount);
        gstCollected += Number(p.tax_amount);

        if (p.invoice_id) {
          invoicedRevenue += amt;
        } else {
          uninvoicedRevenue += amt;
        }
      }

      if (categorized[p.purpose]) {
        categorized[p.purpose].count++;
        categorized[p.purpose].total += amt;
        if (isPaid) categorized[p.purpose].paid += amt;
        else categorized[p.purpose].due += amt;
      }
    });

    return {
      period: { start, end },
      totals: {
        grossRevenue: Math.round(grossRevenue * 100) / 100,
        taxableSubtotal: Math.round(taxableSubtotal * 100) / 100,
        gstCollected: Math.round(gstCollected * 100) / 100,
        invoicedRevenue: Math.round(invoicedRevenue * 100) / 100,
        uninvoicedRevenue: Math.round(uninvoicedRevenue * 100) / 100,
      },
      byCategory: categorized,
      transactions: revenuePayments,
    };
  }
}
