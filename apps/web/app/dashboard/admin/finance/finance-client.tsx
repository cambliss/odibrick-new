'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, CardHeader, EmptyState, StatTile, StatusChip, Badge, Button } from '@/components/ui';
import { inr, shortDate, titleCase } from '@/lib/format';

type OverviewData = {
  period: { from: string; to: string };
  summary: {
    grossPaymentVolume: number;
    totalCollected: number;
    totalOutstanding: number;
    totalOverdue: number;
    totalRefunded: number;
    commissionRevenue: number;
    marketingRevenue: number;
    serviceRevenue: number;
    grossPlatformRevenue: number;
  };
  paymentBreakdown: Array<{
    purpose: string;
    count: number;
    totalAmount: number;
    collectedAmount: number;
    outstandingAmount: number;
  }>;
  revenueSeries: Array<{
    month: string;
    commission: number;
    marketing: number;
    services: number;
    platformRevenue: number;
    grossVolume: number;
  }>;
  overduePayments: Array<{
    id: number;
    public_id: string;
    reference_code: string;
    purpose: string;
    amount: number;
    total_amount: number;
    currency: string;
    status: string;
    settlement_status: string;
    due_date: string;
    days_overdue: number;
    payer_user_id: number;
    payer_name: string;
    payer_email: string;
    payee_user_id: number;
    payee_name?: string;
    tenancy_id?: number;
    tenancy_public_id?: string;
    property_title?: string;
  }>;
  commissionQueue: Array<{
    id: number;
    tenancy_id: number;
    tenancy_public_id?: string;
    property_title?: string;
    cycle_year: number;
    period_start: string;
    period_end: string;
    base_amount: number;
    commission_amount: number;
    tax_amount: number;
    total_amount: number;
    payer: string;
    status: string;
    grace_until?: string;
    payment_id?: number;
    invoice_id?: number;
    owner_name?: string;
    owner_email?: string;
    invoice_number?: string;
    invoice_status?: string;
    rule_name?: string;
    rule_basis?: string;
  }>;
  recentTransactions: Array<{
    id: number;
    payment_id: number;
    txn_reference: string;
    direction: string;
    provider: string;
    method?: string;
    amount: number;
    currency: string;
    status: string;
    occurred_at: string;
    payment_reference: string;
    purpose: string;
    payer_name: string;
  }>;
  financialExceptions: Array<{
    exception_type: string;
    record_id: number;
    reference_code: string;
    purpose: string;
    total_amount: number;
    status: string;
    created_at: string;
    description: string;
  }>;
  activeMoveOutSettlements: Array<{
    tenancy_id: number;
    tenancy_public_id: string;
    stage: string;
    rent_amount: number;
    deposit_amount: number;
    move_out_notice_date?: string;
    intended_move_out_date?: string;
    property_title?: string;
    tenant_name?: string;
    owner_name?: string;
    refund_payment_id?: number;
    refund_reference?: string;
    refund_amount?: number;
    refund_status?: string;
  }>;
  openFinancialDisputes: Array<{
    id: number;
    case_number: string;
    category: string;
    status: string;
    amount_claimed: number;
    summary: string;
    created_at: string;
    tenancy_id?: number;
    tenancy_public_id?: string;
    property_title?: string;
    raised_by_name?: string;
    against_name?: string;
  }>;
  manualReconciliation: Array<{
    id: number;
    reference_code: string;
    purpose: string;
    total_amount: number;
    currency: string;
    status: string;
    settlement_status: string;
    settlement_mode: string;
    paid_at?: string;
    notes?: string;
    payer_name?: string;
    payee_name?: string;
    txn_reference?: string;
    provider?: string;
    method?: string;
  }>;
};

type LedgerItem = {
  id: number;
  public_id: string;
  reference_code: string;
  purpose: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  currency: string;
  status: string;
  settlement_status: string;
  settlement_mode: string;
  due_date?: string;
  paid_at?: string;
  settled_at?: string;
  invoice_id?: number;
  notes?: string;
  created_at: string;
  payer_user_id: number;
  payer_name: string;
  payer_email: string;
  payee_user_id?: number;
  payee_name?: string;
  payee_email?: string;
  tenancy_id?: number;
  tenancy_public_id?: string;
  property_id?: number;
  property_title?: string;
  txn_reference?: string;
  provider?: string;
  payment_method?: string;
};

type LedgerResponse = {
  data: LedgerItem[];
  meta: {
    page: number;
    perPage: number;
    total: number;
    totalPages: number;
  };
};

const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This Month' },
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'last_12_months', label: 'Last 12 Months' },
  { value: 'custom', label: 'Custom Range' },
];

const PURPOSE_OPTIONS = [
  'ALL',
  'MONTHLY_RENT',
  'SECURITY_DEPOSIT',
  'ADVANCE_RENT',
  'COMMISSION',
  'MARKETING_PACKAGE',
  'SERVICE_FEE',
  'LEGAL_FEE',
  'MAINTENANCE',
  'REFUND',
  'PENALTY',
  'INSURANCE_PREMIUM',
  'OTHER',
];

const STATUS_OPTIONS = ['ALL', 'PAID', 'DUE', 'INITIATED', 'PROCESSING', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'CANCELLED'];

export function FinanceControlCentreClient({ initialOverview }: { initialOverview: OverviewData }) {
  const [overview, setOverview] = useState<OverviewData>(initialOverview);
  const [period, setPeriod] = useState<string>('this_month');
  const [customFrom, setCustomFrom] = useState<string>('');
  const [customTo, setCustomTo] = useState<string>('');
  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);

  // Ledger state
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loadingLedger, setLoadingLedger] = useState<boolean>(false);
  const [ledgerPage, setLedgerPage] = useState<number>(1);
  const [ledgerPageSize, setLedgerPageSize] = useState<number>(25);
  const [filterPurpose, setFilterPurpose] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterSettlement, setFilterSettlement] = useState<string>('ALL');
  const [filterQuery, setFilterQuery] = useState<string>('');

  // Escalations & Automation state
  const [escalations, setEscalations] = useState<any[]>([]);
  const [loadingEscalations, setLoadingEscalations] = useState<boolean>(false);
  const [escalationDaysFilter, setEscalationDaysFilter] = useState<number>(0);
  const [triggeringReminders, setTriggeringReminders] = useState<boolean>(false);
  const [reminderRunResult, setReminderRunResult] = useState<any>(null);

  // Maintenance Financials state
  const [maintenanceQueue, setMaintenanceQueue] = useState<any[]>([]);
  const [loadingMaintenance, setLoadingMaintenance] = useState<boolean>(false);

  // Invoices & Tax Documents state
  const [invoices, setInvoices] = useState<{ items: any[]; total: number; page: number; pageSize: number; pageCount: number } | null>(null);
  const [loadingInvoices, setLoadingInvoices] = useState<boolean>(false);
  const [invoicePage, setInvoicePage] = useState<number>(1);
  const [invoicePageSize, setInvoicePageSize] = useState<number>(20);
  const [invoiceFilterStatus, setInvoiceFilterStatus] = useState<string>('ALL');
  const [invoiceFilterPurpose, setInvoiceFilterPurpose] = useState<string>('ALL');
  const [invoiceFilterQuery, setInvoiceFilterQuery] = useState<string>('');

  // Owner Payouts state
  const [payouts, setPayouts] = useState<{ items: any[]; total: number; page: number; pageSize: number; pageCount: number } | null>(null);
  const [loadingPayouts, setLoadingPayouts] = useState<boolean>(false);
  const [payoutPage, setPayoutPage] = useState<number>(1);
  const [payoutPageSize, setPayoutPageSize] = useState<number>(20);
  const [payoutFilterStatus, setPayoutFilterStatus] = useState<string>('ALL');
  const [payoutFilterRecon, setPayoutFilterRecon] = useState<string>('ALL');
  const [payoutFilterQuery, setPayoutFilterQuery] = useState<string>('');

  const fetchOverview = useCallback(async () => {
    setLoadingOverview(true);
    try {
      const query: Record<string, string> = { period };
      if (period === 'custom' && customFrom && customTo) {
        query.from = customFrom;
        query.to = customTo;
      }
      const data = await api<OverviewData>('/admin/finance/overview', { query });
      setOverview(data);
    } catch (err) {
      console.error('Failed to load finance overview:', err);
    } finally {
      setLoadingOverview(false);
    }
  }, [period, customFrom, customTo]);

  const fetchMaintenanceQueue = useCallback(async () => {
    setLoadingMaintenance(true);
    try {
      const data = await api<any>('/admin/finance/maintenance', {
        query: { pageSize: 20 },
      });
      setMaintenanceQueue(data?.data || data?.items || []);
    } catch (err) {
      console.error('Failed to load maintenance financial queue:', err);
    } finally {
      setLoadingMaintenance(false);
    }
  }, []);

  const fetchEscalations = useCallback(async () => {
    setLoadingEscalations(true);
    try {
      const data = await api<any[]>('/admin/finance/payment-escalations', {
        query: { minDaysOverdue: escalationDaysFilter },
      });
      setEscalations(data || []);
    } catch (err) {
      console.error('Failed to load payment escalations:', err);
    } finally {
      setLoadingEscalations(false);
    }
  }, [escalationDaysFilter]);

  const handleRunReminders = async () => {
    setTriggeringReminders(true);
    setReminderRunResult(null);
    try {
      const res = await api<any>('/admin/finance/reminders/run', { method: 'POST' });
      setReminderRunResult(res);
      await Promise.all([fetchOverview(), fetchEscalations(), fetchMaintenanceQueue()]);
    } catch (err: any) {
      console.error('Failed to execute payment reminder run:', err);
    } finally {
      setTriggeringReminders(false);
    }
  };

  const fetchLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const query: Record<string, string | number> = {
        page: ledgerPage,
        pageSize: ledgerPageSize,
      };
      if (filterPurpose !== 'ALL') query.purpose = filterPurpose;
      if (filterStatus !== 'ALL') query.status = filterStatus;
      if (filterSettlement !== 'ALL') query.settlementStatus = filterSettlement;
      if (filterQuery.trim()) query.q = filterQuery.trim();

      const data = await api<LedgerResponse>('/admin/finance/ledger', { query });
      setLedger(data);
    } catch (err) {
      console.error('Failed to load ledger:', err);
    } finally {
      setLoadingLedger(false);
    }
  }, [ledgerPage, ledgerPageSize, filterPurpose, filterStatus, filterSettlement, filterQuery]);

  // Trigger overview refresh when period changes
  useEffect(() => {
    if (period !== 'custom') {
      fetchOverview();
    }
  }, [period, fetchOverview]);

  // Trigger escalations fetch
  useEffect(() => {
    fetchEscalations();
  }, [fetchEscalations]);

  // Trigger maintenance fetch
  useEffect(() => {
    fetchMaintenanceQueue();
  }, [fetchMaintenanceQueue]);

  // Trigger ledger fetch
  useEffect(() => {
    fetchLedger();
  }, [fetchLedger]);

  const fetchInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const query: Record<string, string | number> = {
        page: invoicePage,
        pageSize: invoicePageSize,
      };
      if (invoiceFilterStatus !== 'ALL') query.status = invoiceFilterStatus;
      if (invoiceFilterPurpose !== 'ALL') query.purpose = invoiceFilterPurpose;
      if (invoiceFilterQuery.trim()) query.q = invoiceFilterQuery.trim();

      const data = await api<any>('/invoices', { query });
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setLoadingInvoices(false);
    }
  }, [invoicePage, invoicePageSize, invoiceFilterStatus, invoiceFilterPurpose, invoiceFilterQuery]);

  // Trigger invoices fetch
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  const fetchPayouts = useCallback(async () => {
    setLoadingPayouts(true);
    try {
      const query: Record<string, string | number> = {
        page: payoutPage,
        pageSize: payoutPageSize,
      };
      if (payoutFilterStatus !== 'ALL') query.status = payoutFilterStatus;
      if (payoutFilterRecon !== 'ALL') query.reconciliationStatus = payoutFilterRecon;
      if (payoutFilterQuery.trim()) query.q = payoutFilterQuery.trim();

      const data = await api<any>('/admin/finance/payouts', { query });
      setPayouts(data);
    } catch (err) {
      console.error('Failed to load owner payouts:', err);
    } finally {
      setLoadingPayouts(false);
    }
  }, [payoutPage, payoutPageSize, payoutFilterStatus, payoutFilterRecon, payoutFilterQuery]);

  // Trigger payouts fetch
  useEffect(() => {
    fetchPayouts();
  }, [fetchPayouts]);

  const maxRevenueMonth = Math.max(...(overview.revenueSeries.map((r) => Number(r.grossVolume)) || [1]), 1);

  return (
    <div className="space-y-8">
      {/* Header & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-seal-soft px-2 py-0.5 font-mono text-xs font-semibold uppercase tracking-wider text-seal-deep">
              Platform Governance
            </span>
            <span className="font-mono text-xs text-muted">
              Scope: {shortDate(overview.period.from)} → {shortDate(overview.period.to)}
            </span>
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink mt-1">Finance Control Centre</h1>
          <p className="mt-1 text-[14px] text-muted">
            Platform-wide financial visibility, cross-user payment ledger, overdue queues, and revenue governance.
          </p>
        </div>

        {/* Period Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="rounded-input border border-line bg-paper px-3 py-2 text-sm font-medium text-ink focus:border-seal focus:outline-none"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          {period === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="rounded-input border border-line bg-paper px-2 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              />
              <span className="text-muted text-xs">to</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="rounded-input border border-line bg-paper px-2 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              />
              <button
                type="button"
                onClick={() => fetchOverview()}
                className="rounded-button bg-seal px-3 py-1.5 text-xs font-medium text-white hover:bg-seal-deep"
              >
                Apply
              </button>
            </div>
          )}

          <Link
            href="/dashboard/admin/commercial"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-medium shadow-sm transition-colors"
          >
            <span>📈 Commercial & Revenue →</span>
          </Link>

          <Link
            href="/dashboard/admin/finance/reconciliation"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-input bg-seal hover:bg-seal-deep text-white text-xs font-medium shadow-sm transition-colors"
          >
            <span>⚡ Reconciliation & Control Console →</span>
          </Link>

          <button
            type="button"
            onClick={() => {
              fetchOverview();
              fetchLedger();
            }}
            disabled={loadingOverview || loadingLedger}
            className="flex items-center gap-1.5 rounded-button border border-line bg-surface px-3 py-2 text-sm font-medium text-ink hover:bg-paper disabled:opacity-50 shadow-subtle"
          >
            <span className={loadingOverview || loadingLedger ? 'animate-spin inline-block' : ''}>↻</span>
            Refresh
          </button>
        </div>
      </div>

      {/* Primary KPI Tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile
          label="Gross Payment Volume"
          value={inr(overview.summary.grossPaymentVolume)}
          note="Total value of payment obligations"
        />
        <StatTile
          label="Total Collected"
          value={inr(overview.summary.totalCollected)}
          note="Successfully settled funds"
        />
        <StatTile
          label="Outstanding"
          value={inr(overview.summary.totalOutstanding)}
          note="Unsettled active dues"
        />
        <StatTile
          label="Overdue Unpaid"
          value={inr(overview.summary.totalOverdue)}
          note={`${overview.overduePayments.length} overdue payments`}
        />
        <div className="rounded-card border border-seal/30 bg-gradient-to-br from-seal-soft/80 to-surface p-5 shadow-subtle">
          <div className="flex items-center justify-between">
            <p className="eyebrow text-seal-deep">Platform Revenue</p>
            <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-medium text-seal-deep border border-seal-soft">
              Odibrick Net
            </span>
          </div>
          <p className="tabular mt-2 font-display text-2xl font-semibold text-ink">
            {inr(overview.summary.grossPlatformRevenue)}
          </p>
          <div className="mt-2 space-y-0.5 border-t border-line/60 pt-2 text-[11px] text-muted">
            <div className="flex justify-between">
              <span>Commissions:</span>
              <span className="font-medium text-ink">{inr(overview.summary.commissionRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span>Marketing:</span>
              <span className="font-medium text-ink">{inr(overview.summary.marketingRevenue)}</span>
            </div>
            <div className="flex justify-between">
              <span>Service Fees:</span>
              <span className="font-medium text-ink">{inr(overview.summary.serviceRevenue)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Revenue Series & Platform Breakdown */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly Platform Revenue Trend */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Revenue Trend (Last 12 Months)"
            note="Strict breakdown: Odibrick platform earnings only (P2P rent settlements excluded)."
          />
          <div className="p-5">
            {overview.revenueSeries.length ? (
              <div className="space-y-3">
                <div className="flex h-44 items-end gap-2 border-b border-line pb-2">
                  {overview.revenueSeries.map((r) => {
                    const heightPct = Math.max(Math.round((Number(r.platformRevenue || r.grossVolume) / maxRevenueMonth) * 100), 4);
                    return (
                      <div key={r.month} className="flex-1 flex flex-col items-center gap-1 group relative">
                        <div className="absolute -top-12 opacity-0 group-hover:opacity-100 transition-opacity bg-ink text-paper text-[10px] p-1.5 rounded shadow whitespace-nowrap z-10 pointer-events-none">
                          <p className="font-semibold">{r.month}</p>
                          <p>Platform: {inr(r.platformRevenue)}</p>
                          <p className="text-muted">Gross Vol: {inr(r.grossVolume)}</p>
                        </div>
                        <div className="w-full flex flex-col justify-end items-center h-36">
                          <div
                            style={{ height: `${heightPct}%` }}
                            className="w-full max-w-[28px] rounded-t bg-gradient-to-t from-seal to-seal-deep transition-all group-hover:brightness-110"
                          />
                        </div>
                        <span className="font-mono text-[10px] text-muted truncate w-full text-center">
                          {r.month.split('-')[1]}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between text-xs text-muted pt-1">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-seal" /> Platform Revenue
                    </span>
                    <span>12-Month Total: <strong className="text-ink">{inr(overview.revenueSeries.reduce((s, r) => s + Number(r.platformRevenue), 0))}</strong></span>
                  </div>
                  <span className="font-mono text-[11px]">Monthly intervals</span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No historical payment revenue records found.</p>
            )}
          </div>
        </Card>

        {/* Payment Volume by Purpose */}
        <Card>
          <CardHeader
            title="Volume Breakdown"
            note={`Activity for selected period (${overview.paymentBreakdown.length} categories).`}
          />
          <div className="p-5 max-h-[300px] overflow-y-auto">
            {overview.paymentBreakdown.length ? (
              <ul className="divide-y divide-line">
                {overview.paymentBreakdown.map((item) => (
                  <li key={item.purpose} className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-medium text-ink">{titleCase(item.purpose)}</p>
                      <p className="text-[11px] text-muted font-mono">{item.count} payments</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-ink">{inr(item.totalAmount)}</p>
                      <p className="text-[11px] text-emerald-600 font-mono">Paid: {inr(item.collectedAmount)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No payment records in selected period.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Exceptions & Attention Required */}
      {overview.financialExceptions.length > 0 && (
        <Card>
          <CardHeader
            title="Financial Exceptions & Supervision Alerts"
            note={`${overview.financialExceptions.length} records requiring management review.`}
          />
          <div className="p-5">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                    <th className="pb-2">Type</th>
                    <th className="pb-2">Reference</th>
                    <th className="pb-2">Purpose</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Description</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {overview.financialExceptions.map((ex, idx) => (
                    <tr key={idx} className="hover:bg-paper/60">
                      <td className="py-2.5">
                        <span className="rounded bg-amber-100 text-amber-800 font-mono px-2 py-0.5 text-[11px] font-medium">
                          {ex.exception_type}
                        </span>
                      </td>
                      <td className="py-2.5 font-mono font-medium text-ink">{ex.reference_code}</td>
                      <td className="py-2.5">{titleCase(ex.purpose)}</td>
                      <td className="py-2.5 font-medium">{inr(ex.total_amount)}</td>
                      <td className="py-2.5"><StatusChip status={ex.status} /></td>
                      <td className="py-2.5 text-muted">{ex.description}</td>
                      <td className="py-2.5 text-muted font-mono">{shortDate(ex.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}

      {/* Payment Escalations & Automation Queue */}
      <Card>
        <CardHeader
          title="Payment Escalations & Automation Engine"
          note="Automated reminder stages, management escalation alerts, and overdue tracking."
        />
        <div className="p-5 space-y-4">
          {/* Controls & Filter Pills */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'All Overdue', days: 0 },
                { label: '3+ Days (Low)', days: 3 },
                { label: '7+ Days (Medium)', days: 7 },
                { label: '15+ Days (High)', days: 15 },
                { label: '30+ Days (Critical)', days: 30 },
              ].map((pill) => (
                <button
                  key={pill.days}
                  type="button"
                  onClick={() => setEscalationDaysFilter(pill.days)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    escalationDaysFilter === pill.days
                      ? 'bg-seal text-white'
                      : 'border border-line bg-surface text-muted hover:text-ink'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {reminderRunResult && (
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                  Run: {reminderRunResult.remindersSent} reminders, {reminderRunResult.escalationsSent} escalations, {reminderRunResult.managementAlertsSent} mgmt alerts
                </span>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={handleRunReminders}
                disabled={triggeringReminders}
              >
                {triggeringReminders ? 'Running Automation...' : '⚡ Trigger Reminder Check'}
              </Button>
            </div>
          </div>

          {/* Escalations Table */}
          {loadingEscalations ? (
            <div className="py-6 text-center text-xs text-muted">Loading active payment escalations...</div>
          ) : escalations.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                    <th className="pb-2">Payment Ref</th>
                    <th className="pb-2">Purpose</th>
                    <th className="pb-2">Payer</th>
                    <th className="pb-2">Payee / Tenancy</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Due Date</th>
                    <th className="pb-2">Days Overdue</th>
                    <th className="pb-2">Escalation Level</th>
                    <th className="pb-2">Last Notification</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {escalations.map((esc) => (
                    <tr key={esc.id} className="hover:bg-paper/60">
                      <td className="py-2.5 font-mono font-medium text-ink">{esc.referenceCode}</td>
                      <td className="py-2.5">{titleCase(esc.purpose)}</td>
                      <td className="py-2.5">
                        <p className="font-medium text-ink">{esc.payerName}</p>
                        <p className="text-[10px] text-muted font-mono">{esc.payerEmail}</p>
                      </td>
                      <td className="py-2.5">
                        <p className="text-ink">{esc.payeeName || 'Odibrick'}</p>
                        {esc.tenancyId && (
                          <Link href={`/dashboard/tenancy/${esc.tenancyId}`} className="text-[11px] text-seal hover:underline font-mono">
                            Tenancy #{esc.tenancyId}
                          </Link>
                        )}
                      </td>
                      <td className="py-2.5 font-semibold text-ink">{inr(esc.totalAmount)}</td>
                      <td className="py-2.5 font-mono text-muted">{shortDate(esc.dueDate)}</td>
                      <td className="py-2.5">
                        <span className="font-mono font-bold text-rose-700">{esc.daysOverdue} d</span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`rounded font-mono px-2 py-0.5 text-[11px] font-bold ${
                            esc.escalationLevel === 'CRITICAL'
                              ? 'bg-rose-700 text-white'
                              : esc.escalationLevel === 'HIGH'
                              ? 'bg-rose-100 text-rose-800'
                              : esc.escalationLevel === 'MEDIUM'
                              ? 'bg-amber-100 text-amber-900'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {esc.escalationLevel}
                        </span>
                      </td>
                      <td className="py-2.5 text-muted font-mono">
                        {esc.lastNotificationAt ? shortDate(esc.lastNotificationAt) : 'None'}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/dashboard/payments/${esc.id}`}
                            className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-medium hover:border-seal text-seal-deep"
                          >
                            Payment →
                          </Link>
                          {esc.tenancyId && (
                            <Link
                              href={`/dashboard/tenancy/${esc.tenancyId}`}
                              className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-medium hover:border-seal text-ink"
                            >
                              Tenancy →
                            </Link>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-xs text-muted py-2">No overdue payment escalations in this threshold.</p>
          )}
        </div>
      </Card>

      {/* Overdue Payments Queue */}
      <Card>
        <CardHeader
          title="Overdue Payments Queue"
          note={`${overview.overduePayments.length} unsettled payments past due date.`}
        />
        <div className="p-5">
          {overview.overduePayments.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                    <th className="pb-2">Reference</th>
                    <th className="pb-2">Purpose</th>
                    <th className="pb-2">Payer</th>
                    <th className="pb-2">Payee / Tenancy</th>
                    <th className="pb-2">Amount</th>
                    <th className="pb-2">Due Date</th>
                    <th className="pb-2">Overdue By</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {overview.overduePayments.map((p) => (
                    <tr key={p.id} className="hover:bg-paper/60">
                      <td className="py-2.5 font-mono font-medium text-ink">{p.reference_code}</td>
                      <td className="py-2.5">{titleCase(p.purpose)}</td>
                      <td className="py-2.5">
                        <p className="font-medium text-ink">{p.payer_name}</p>
                        <p className="text-[10px] text-muted font-mono">{p.payer_email}</p>
                      </td>
                      <td className="py-2.5">
                        <p className="text-ink">{p.payee_name || 'Odibrick'}</p>
                        {p.tenancy_id && (
                          <Link href={`/dashboard/tenancy/${p.tenancy_id}`} className="text-[11px] text-seal hover:underline font-mono">
                            Tenancy #{p.tenancy_id}
                          </Link>
                        )}
                      </td>
                      <td className="py-2.5 font-semibold text-ink">{inr(p.total_amount)}</td>
                      <td className="py-2.5 font-mono text-muted">{shortDate(p.due_date)}</td>
                      <td className="py-2.5">
                        <span className="rounded bg-rose-100 text-rose-800 font-mono px-2 py-0.5 font-medium">
                          {p.days_overdue} days
                        </span>
                      </td>
                      <td className="py-2.5"><StatusChip status={p.status} /></td>
                      <td className="py-2.5">
                        <Link
                          href={`/dashboard/payments/${p.id}`}
                          className="rounded border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal text-seal-deep"
                        >
                          Inspect →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">No overdue payments. All platform obligations are current.</p>
          )}
        </div>
      </Card>

      {/* Tax Invoices & Financial Documents */}
      <Card>
        <CardHeader
          title="Tax Invoices & Financial Documents"
          note="Management audit, generation queue, GST document snapshots, and printable PDF records."
        />
        <div className="p-5 space-y-4">
          {/* Invoice Filters */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 bg-paper/60 p-3 rounded-card border border-line">
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Search Invoice</label>
              <input
                type="text"
                placeholder="Invoice #, Customer, Payment Ref..."
                value={invoiceFilterQuery}
                onChange={(e) => setInvoiceFilterQuery(e.target.value)}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Status</label>
              <select
                value={invoiceFilterStatus}
                onChange={(e) => {
                  setInvoiceFilterStatus(e.target.value);
                  setInvoicePage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PAID">PAID</option>
                <option value="ISSUED">ISSUED</option>
                <option value="DRAFT">DRAFT</option>
                <option value="VOID">VOID / Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Revenue Category</label>
              <select
                value={invoiceFilterPurpose}
                onChange={(e) => {
                  setInvoiceFilterPurpose(e.target.value);
                  setInvoicePage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="COMMISSION">Commission</option>
                <option value="SERVICE_FEE">Service Fee</option>
                <option value="LEGAL_FEE">Legal Fee</option>
                <option value="MARKETING_PACKAGE">Marketing Package</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Page Size</label>
              <select
                value={invoicePageSize}
                onChange={(e) => {
                  setInvoicePageSize(Number(e.target.value));
                  setInvoicePage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value={10}>10 invoices / page</option>
                <option value={20}>20 invoices / page</option>
                <option value={50}>50 invoices / page</option>
              </select>
            </div>
          </div>

          {/* Invoices Table */}
          {loadingInvoices ? (
            <div className="py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
              <span className="animate-spin text-seal">↻</span> Loading financial invoices...
            </div>
          ) : invoices && invoices.items.length ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Invoice #</th>
                      <th className="pb-2">Date</th>
                      <th className="pb-2">Customer / Billed To</th>
                      <th className="pb-2">Payment Ref</th>
                      <th className="pb-2">Classification</th>
                      <th className="pb-2 text-right">Taxable</th>
                      <th className="pb-2 text-right">Tax (GST)</th>
                      <th className="pb-2 text-right">Total</th>
                      <th className="pb-2 text-center">Status</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {invoices.items.map((inv) => (
                      <tr key={inv.id} className="hover:bg-paper/60">
                        <td className="py-2.5 font-mono font-semibold text-ink">
                          <Link href={`/dashboard/admin/invoices/${inv.id}`} className="hover:text-seal-deep underline">
                            {inv.invoice_number}
                          </Link>
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-muted">
                          {shortDate(inv.issued_on || inv.created_at)}
                        </td>
                        <td className="py-2.5 font-medium text-ink">
                          {inv.billing_name}
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-muted">
                          {inv.payment_reference || '—'}
                        </td>
                        <td className="py-2.5">
                          <span className="font-mono text-[11px] font-medium text-seal-deep">
                            {inv.payment_purpose ? titleCase(inv.payment_purpose) : 'Service'}
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular font-medium text-ink">
                          {inr(inv.subtotal)}
                        </td>
                        <td className="py-2.5 text-right tabular text-muted font-mono">
                          {inr(Number(inv.cgst) + Number(inv.sgst) + Number(inv.igst))}
                        </td>
                        <td className="py-2.5 text-right tabular font-semibold text-ink">
                          {inr(inv.total)}
                        </td>
                        <td className="py-2.5 text-center">
                          <StatusChip status={inv.status} />
                        </td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/dashboard/admin/invoices/${inv.id}`}
                              className="rounded border border-line bg-paper px-2 py-1 text-[11px] font-medium hover:border-seal text-seal-deep"
                            >
                              View
                            </Link>
                            <a
                              href={`/api/invoices/${inv.id}/pdf`}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded bg-seal/10 text-seal-deep px-2 py-1 text-[11px] font-medium hover:bg-seal hover:text-white transition-colors"
                            >
                              PDF
                            </a>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {invoices.pageCount > 1 && (
                <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                  <span>
                    Showing {(invoices.page - 1) * invoices.pageSize + 1} to{' '}
                    {Math.min(invoices.page * invoices.pageSize, invoices.total)} of {invoices.total} invoices
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={invoices.page <= 1}
                      onClick={() => setInvoicePage((p) => Math.max(1, p - 1))}
                      className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="font-mono text-xs text-ink px-1">
                      {invoices.page} / {invoices.pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={invoices.page >= invoices.pageCount}
                      onClick={() => setInvoicePage((p) => p + 1)}
                      className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">No tax invoices generated yet.</p>
          )}
        </div>
      </Card>

      {/* Owner Payouts & Financial Reconciliation */}
      <Card>
        <CardHeader
          title="Owner Payouts & Financial Reconciliation"
          note="Controlled owner payable balances, approval queues, external settlements, and deterministic reconciliation."
        />
        <div className="p-5 space-y-4">
          {/* Payout Filters */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 bg-paper/60 p-3 rounded-card border border-line">
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Search Payout</label>
              <input
                type="text"
                placeholder="Payout #, Owner, Ref, UTR..."
                value={payoutFilterQuery}
                onChange={(e) => setPayoutFilterQuery(e.target.value)}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Status</label>
              <select
                value={payoutFilterStatus}
                onChange={(e) => {
                  setPayoutFilterStatus(e.target.value);
                  setPayoutPage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="PENDING_REVIEW">Pending Review</option>
                <option value="APPROVED">Approved</option>
                <option value="PROCESSING">Processing</option>
                <option value="PAID">Paid / Settled</option>
                <option value="ON_HOLD">On Hold</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Reconciliation</label>
              <select
                value={payoutFilterRecon}
                onChange={(e) => {
                  setPayoutFilterRecon(e.target.value);
                  setPayoutPage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value="ALL">All Reconciliation States</option>
                <option value="MATCHED">Matched</option>
                <option value="PARTIALLY_MATCHED">Partially Matched</option>
                <option value="MISMATCHED">Mismatched</option>
                <option value="UNRECONCILED">Unreconciled</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Page Size</label>
              <select
                value={payoutPageSize}
                onChange={(e) => {
                  setPayoutPageSize(Number(e.target.value));
                  setPayoutPage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value={10}>10 payouts / page</option>
                <option value={20}>20 payouts / page</option>
                <option value={50}>50 payouts / page</option>
              </select>
            </div>
          </div>

          {/* Payouts Table */}
          {loadingPayouts ? (
            <div className="py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
              <span className="animate-spin text-seal">↻</span> Loading owner payouts...
            </div>
          ) : payouts && payouts.items.length ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Payout #</th>
                      <th className="pb-2">Beneficiary Owner</th>
                      <th className="pb-2">Period</th>
                      <th className="pb-2 text-right">Gross</th>
                      <th className="pb-2 text-right">Deductions</th>
                      <th className="pb-2 text-right">Net Payable</th>
                      <th className="pb-2 text-right">Paid / Settled</th>
                      <th className="pb-2 text-center">Status</th>
                      <th className="pb-2 text-center">Reconciliation</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payouts.items.map((p) => (
                      <tr key={p.id} className="hover:bg-paper/60">
                        <td className="py-2.5 font-mono font-semibold text-ink">
                          <Link href={`/dashboard/admin/finance/payouts/${p.id}`} className="hover:text-seal-deep underline">
                            {p.payout_number}
                          </Link>
                        </td>
                        <td className="py-2.5 font-medium text-ink">
                          <p>{p.owner_name}</p>
                          <p className="text-[10px] text-muted font-mono">{p.account_type || 'BANK'} · {p.accountNumberMasked || '••••'}</p>
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-muted">
                          {shortDate(p.period_start)} → {shortDate(p.period_end)}
                        </td>
                        <td className="py-2.5 text-right tabular font-medium text-ink">
                          {inr(p.gross_amount)}
                        </td>
                        <td className="py-2.5 text-right tabular text-rose-700 font-mono">
                          {Number(p.deduction_amount) > 0 ? `−${inr(p.deduction_amount)}` : '₹0'}
                        </td>
                        <td className="py-2.5 text-right tabular font-bold text-seal-deep">
                          {inr(p.net_amount)}
                        </td>
                        <td className="py-2.5 text-right tabular font-medium text-emerald-700 font-mono">
                          {Number(p.paid_amount) > 0 ? inr(p.paid_amount) : '—'}
                        </td>
                        <td className="py-2.5 text-center">
                          <StatusChip status={p.status} />
                        </td>
                        <td className="py-2.5 text-center">
                          {p.reconciliation_status === 'MATCHED' && (
                            <span className="rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] px-1.5 py-0.5 font-bold">
                              ✓ MATCHED
                            </span>
                          )}
                          {p.reconciliation_status === 'MISMATCHED' && (
                            <span className="rounded bg-rose-100 text-rose-800 font-mono text-[10px] px-1.5 py-0.5 font-bold">
                              ⚠ MISMATCH
                            </span>
                          )}
                          {p.reconciliation_status === 'PARTIALLY_MATCHED' && (
                            <span className="rounded bg-amber-100 text-amber-800 font-mono text-[10px] px-1.5 py-0.5 font-bold">
                              PARTIAL
                            </span>
                          )}
                          {p.reconciliation_status === 'UNRECONCILED' && (
                            <span className="rounded bg-surface text-muted border border-line font-mono text-[10px] px-1.5 py-0.5">
                              UNRECONCILED
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right">
                          <Link
                            href={`/dashboard/admin/finance/payouts/${p.id}`}
                            className="rounded border border-line bg-paper px-2.5 py-1 text-[11px] font-medium hover:border-seal text-seal-deep inline-block"
                          >
                            Manage →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {payouts.pageCount > 1 && (
                <div className="flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                  <span>
                    Showing {(payouts.page - 1) * payouts.pageSize + 1} to{' '}
                    {Math.min(payouts.page * payouts.pageSize, payouts.total)} of {payouts.total} payouts
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={payouts.page <= 1}
                      onClick={() => setPayoutPage((p) => Math.max(1, p - 1))}
                      className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="font-mono text-xs text-ink px-1">
                      {payouts.page} / {payouts.pageCount}
                    </span>
                    <button
                      type="button"
                      disabled={payouts.page >= payouts.pageCount}
                      onClick={() => setPayoutPage((p) => p + 1)}
                      className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-paper disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">No owner payouts created yet.</p>
          )}
        </div>
      </Card>

      {/* Master Financial Ledger */}
      <Card>
        <CardHeader
          title="Master Financial Ledger"
          note="Complete cross-user, cross-tenancy financial movement ledger with multi-variable filters."
        />
        <div className="p-5 space-y-4">
          {/* Ledger Filters */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 bg-paper/60 p-3 rounded-card border border-line">
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Search Keyword</label>
              <input
                type="text"
                placeholder="Ref, Payer, Payee, Notes..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Purpose</label>
              <select
                value={filterPurpose}
                onChange={(e) => {
                  setFilterPurpose(e.target.value);
                  setLedgerPage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                {PURPOSE_OPTIONS.map((p) => (
                  <option key={p} value={p}>{p === 'ALL' ? 'All Purposes' : titleCase(p)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => {
                  setFilterStatus(e.target.value);
                  setLedgerPage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s === 'ALL' ? 'All Statuses' : s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-mono uppercase text-muted mb-1">Page Size</label>
              <select
                value={ledgerPageSize}
                onChange={(e) => {
                  setLedgerPageSize(Number(e.target.value));
                  setLedgerPage(1);
                }}
                className="w-full rounded border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value={25}>25 entries / page</option>
                <option value={50}>50 entries / page</option>
                <option value={100}>100 entries / page</option>
              </select>
            </div>
          </div>

          {/* Ledger Table */}
          {loadingLedger ? (
            <div className="py-12 text-center text-muted text-sm flex items-center justify-center gap-2">
              <span className="animate-spin text-seal">↻</span> Loading ledger records...
            </div>
          ) : ledger && ledger.data.length ? (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Reference</th>
                      <th className="pb-2">Purpose</th>
                      <th className="pb-2">Payer</th>
                      <th className="pb-2">Payee</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Settlement</th>
                      <th className="pb-2">Due / Paid</th>
                      <th className="pb-2">Method</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ledger.data.map((item) => (
                      <tr key={item.id} className="hover:bg-paper/60">
                        <td className="py-2.5">
                          <p className="font-mono font-medium text-ink">{item.reference_code}</p>
                          {item.txn_reference && (
                            <p className="text-[10px] text-muted font-mono">TXN: {item.txn_reference}</p>
                          )}
                        </td>
                        <td className="py-2.5">
                          <p className="font-medium text-ink">{titleCase(item.purpose)}</p>
                          {item.tenancy_id && (
                            <Link href={`/dashboard/tenancy/${item.tenancy_id}`} className="text-[10px] text-seal hover:underline font-mono">
                              Tenancy #{item.tenancy_id}
                            </Link>
                          )}
                        </td>
                        <td className="py-2.5">
                          <p className="font-medium text-ink">{item.payer_name}</p>
                          <p className="text-[10px] text-muted font-mono">{item.payer_email}</p>
                        </td>
                        <td className="py-2.5">
                          <p className="text-ink">{item.payee_name || 'Odibrick'}</p>
                        </td>
                        <td className="py-2.5">
                          <p className="font-semibold text-ink">{inr(item.total_amount)}</p>
                          {Number(item.tax_amount) > 0 && (
                            <p className="text-[10px] text-muted font-mono">GST: {inr(item.tax_amount)}</p>
                          )}
                        </td>
                        <td className="py-2.5"><StatusChip status={item.status} /></td>
                        <td className="py-2.5">
                          <span className="font-mono text-[11px] text-muted">{item.settlement_status}</span>
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-muted">
                          {item.paid_at ? shortDate(item.paid_at) : item.due_date ? `Due ${shortDate(item.due_date)}` : shortDate(item.created_at)}
                        </td>
                        <td className="py-2.5 font-mono text-[11px] text-muted">
                          {item.payment_method || item.provider || item.settlement_mode}
                        </td>
                        <td className="py-2.5">
                          <Link
                            href={`/dashboard/payments/${item.id}`}
                            className="rounded border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal text-seal-deep"
                          >
                            Details →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination bar */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-line pt-3 text-xs text-muted">
                <div>
                  Showing {((ledger.meta.page - 1) * ledger.meta.perPage) + 1} to {Math.min(ledger.meta.page * ledger.meta.perPage, ledger.meta.total)} of {ledger.meta.total} records
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={ledger.meta.page <= 1}
                    onClick={() => setLedgerPage((p) => Math.max(p - 1, 1))}
                    className="rounded border border-line bg-paper px-3 py-1 text-xs font-medium text-ink hover:bg-surface disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-ink font-medium">
                    Page {ledger.meta.page} of {ledger.meta.totalPages || 1}
                  </span>
                  <button
                    type="button"
                    disabled={ledger.meta.page >= ledger.meta.totalPages}
                    onClick={() => setLedgerPage((p) => p + 1)}
                    className="rounded border border-line bg-paper px-3 py-1 text-xs font-medium text-ink hover:bg-surface disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted py-6 text-center">No payment ledger records match the selected filters.</p>
          )}
        </div>
      </Card>

      {/* Commission Queue & Move-Out Settlements */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Commission Queue */}
        <Card>
          <CardHeader
            title="Commission Queue"
            note={`${overview.commissionQueue.length} platform commission billing cycles.`}
          />
          <div className="p-5">
            {overview.commissionQueue.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Tenancy / Owner</th>
                      <th className="pb-2">Cycle</th>
                      <th className="pb-2">Total Amount</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Invoice</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {overview.commissionQueue.map((c) => (
                      <tr key={c.id} className="hover:bg-paper/60">
                        <td className="py-2.5">
                          <p className="font-medium text-ink">{c.owner_name}</p>
                          <Link href={`/dashboard/tenancy/${c.tenancy_id}`} className="text-[10px] text-seal hover:underline font-mono">
                            Tenancy #{c.tenancy_id} {c.property_title ? `· ${c.property_title}` : ''}
                          </Link>
                        </td>
                        <td className="py-2.5 font-mono text-muted">Year {c.cycle_year}</td>
                        <td className="py-2.5">
                          <p className="font-semibold text-ink">{inr(c.total_amount)}</p>
                          <p className="text-[10px] text-muted font-mono">GST: {inr(c.tax_amount)}</p>
                        </td>
                        <td className="py-2.5"><StatusChip status={c.status} /></td>
                        <td className="py-2.5 font-mono text-[11px]">
                          {c.invoice_number ? (
                            <span className="text-emerald-700 font-medium">{c.invoice_number}</span>
                          ) : (
                            <span className="text-amber-700">Scheduled</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No commission records found.</p>
            )}
          </div>
        </Card>

        {/* Maintenance Financial Obligations */}
        <Card>
          <CardHeader
            title="Maintenance Financial Obligations"
            note={`${maintenanceQueue.length} completed maintenance tickets with financial review or payment tracking.`}
          />
          <div className="p-5">
            {loadingMaintenance ? (
              <p className="text-sm text-muted">Loading maintenance obligations...</p>
            ) : maintenanceQueue.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Ticket / Property</th>
                      <th className="pb-2">Cost Bearer</th>
                      <th className="pb-2">Final Cost</th>
                      <th className="pb-2">Financial Status</th>
                      <th className="pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {maintenanceQueue.map((m) => (
                      <tr key={m.id} className="hover:bg-paper/60">
                        <td className="py-2.5">
                          <p className="font-mono font-medium text-ink">{m.ticket_number}</p>
                          <p className="text-[10px] text-muted truncate max-w-[160px]">{m.property_title || m.title}</p>
                        </td>
                        <td className="py-2.5">
                          <span className="rounded bg-paper px-1.5 py-0.5 font-mono text-[10px] font-semibold text-seal-deep border border-line">
                            {m.cost_bearer || 'UNASSIGNED'}
                          </span>
                        </td>
                        <td className="py-2.5 font-semibold text-ink">{inr(m.final_cost || m.actual_cost || m.estimated_cost || 0)}</td>
                        <td className="py-2.5">
                          <StatusChip status={m.financial_status || 'PENDING_REVIEW'} />
                        </td>
                        <td className="py-2.5">
                          <Link
                            href={`/dashboard/maintenance/${m.id}`}
                            className="rounded border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal text-seal-deep"
                          >
                            Review →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No maintenance financial obligations in queue.</p>
            )}
          </div>
        </Card>

        {/* Move-Out Financial Settlements */}
        <Card>
          <CardHeader
            title="Move-Out Financial Settlements"
            note={`${overview.activeMoveOutSettlements.length} active move-out cases awaiting financial completion.`}
          />
          <div className="p-5">
            {overview.activeMoveOutSettlements.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Tenancy</th>
                      <th className="pb-2">Deposit</th>
                      <th className="pb-2">Refund Status</th>
                      <th className="pb-2">Stage</th>
                      <th className="pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {overview.activeMoveOutSettlements.map((s) => (
                      <tr key={s.tenancy_id} className="hover:bg-paper/60">
                        <td className="py-2.5">
                          <p className="font-medium text-ink">{s.property_title || `Tenancy #${s.tenancy_id}`}</p>
                          <p className="text-[10px] text-muted">Tenant: {s.tenant_name} · Owner: {s.owner_name}</p>
                        </td>
                        <td className="py-2.5 font-medium text-ink">{inr(s.deposit_amount)}</td>
                        <td className="py-2.5">
                          {s.refund_amount ? (
                            <div>
                              <p className="font-medium text-ink">{inr(s.refund_amount)}</p>
                              <StatusChip status={s.refund_status || 'DUE'} />
                            </div>
                          ) : (
                            <span className="text-muted text-[11px]">Pending Proposal</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          <span className="font-mono text-[11px] font-medium text-seal-deep">{s.stage}</span>
                        </td>
                        <td className="py-2.5">
                          <Link
                            href={`/dashboard/tenancy/${s.tenancy_id}`}
                            className="rounded border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal text-seal-deep"
                          >
                            Inspect →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No active move-out settlements in queue.</p>
            )}
          </div>
        </Card>
      </div>

      {/* Financial Disputes & Manual Reconciliation */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Open Financial Disputes */}
        <Card>
          <CardHeader
            title="Financial Disputes"
            note={`${overview.openFinancialDisputes.length} disputes with financial claims under active review.`}
          />
          <div className="p-5">
            {overview.openFinancialDisputes.length ? (
              <ul className="divide-y divide-line">
                {overview.openFinancialDisputes.map((d) => (
                  <li key={d.id} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-ink">{d.case_number}</span>
                        <StatusChip status={d.status} />
                      </div>
                      <p className="text-ink font-medium mt-0.5">{d.summary}</p>
                      <p className="text-[10px] text-muted font-mono mt-0.5">
                        {titleCase(d.category)} · Claim: <strong className="text-ink">{inr(d.amount_claimed)}</strong> · Raised by {d.raised_by_name}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/disputes/${d.id}`}
                      className="rounded border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal text-seal-deep shrink-0"
                    >
                      Review →
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No open financial disputes.</p>
            )}
          </div>
        </Card>

        {/* Manual Reconciliation Queue */}
        <Card>
          <CardHeader
            title="Manual Reconciliation & Offline Payments"
            note={`${overview.manualReconciliation.length} offline-settled or reference-recorded transactions.`}
          />
          <div className="p-5">
            {overview.manualReconciliation.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Reference</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Mode / Notes</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {overview.manualReconciliation.map((m) => (
                      <tr key={m.id} className="hover:bg-paper/60">
                        <td className="py-2.5">
                          <p className="font-mono font-medium text-ink">{m.reference_code}</p>
                          <p className="text-[10px] text-muted font-mono">From: {m.payer_name}</p>
                        </td>
                        <td className="py-2.5 font-semibold text-ink">{inr(m.total_amount)}</td>
                        <td className="py-2.5 text-muted">
                          <p className="font-mono text-[11px]">{m.settlement_mode}</p>
                          {m.notes && <p className="text-[10px] truncate max-w-[140px]">{m.notes}</p>}
                        </td>
                        <td className="py-2.5"><StatusChip status={m.status} /></td>
                        <td className="py-2.5">
                          <Link
                            href={`/dashboard/payments/${m.id}`}
                            className="rounded border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal text-seal-deep"
                          >
                            Inspect →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">No offline reconciliation records pending.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
