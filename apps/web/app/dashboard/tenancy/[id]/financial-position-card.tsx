'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Card, CardHeader, StatusChip, Badge, Button } from '@/components/ui';
import { inr, shortDate, titleCase } from '@/lib/format';

export type TenancyFinancialSummary = {
  tenancyId: number;
  publicId: string;
  stage: string;
  currency: string;
  rentAmount: number;
  depositAmount: number;
  maintenanceAmount?: number;
  rentDueDay: number;
  startDate?: string;
  endDate?: string;
  renewalDueOn?: string;
  closedAt?: string;

  parties: {
    owner: { id: number; fullName: string; email: string };
    tenant: { id: number; fullName: string; email: string };
  };

  property: {
    id: number;
    title: string;
    slug: string;
    locality?: string;
    city?: string;
  };

  summary: {
    totalRentAccrued: number;
    totalRentPaid: number;
    outstandingRent: number;
    overdueRent: number;
    overdueRentCount: number;

    securityDepositRequired: number;
    securityDepositPaid: number;
    securityDepositHeld: number;

    depositDeductions: number;
    depositRefundDue: number;
    depositRefundPaid: number;
    refundStatus: string;

    advanceRentPaid: number;
    advanceRentOutstanding: number;

    maintenanceCharges: number;
    maintenancePaid: number;
    maintenanceOutstanding: number;

    otherCharges: number;
    otherPayments: number;
    otherOutstanding: number;

    totalOutstanding: number;
    netTenantLiability: number;
    netOwnerReceivable: number;
  };

  rent: {
    monthlyRent: number;
    rentDueDay: number;
    totalAccrued: number;
    totalPaid: number;
    outstanding: number;
    overdue: number;
    overdueCount: number;
    schedule: Array<{
      id: number;
      referenceCode: string;
      periodName: string;
      amount: number;
      totalAmount: number;
      status: string;
      settlementStatus: string;
      dueDate?: string;
      paidAt?: string;
      daysOverdue: number;
      isOverdue: boolean;
      notes?: string;
    }>;
  };

  deposit: {
    required: number;
    paid: number;
    held: number;
    deductionsTotal: number;
    deductions: Array<{
      category: string;
      description: string;
      amount: number;
      evidenceUrl?: string;
    }>;
    refundDue: number;
    refundPaid: number;
    refundStatus: string;
    refundPaymentId?: number;
    refundReferenceCode?: string;
  };

  maintenance: {
    ownerBorne: number;
    tenantBorne: number;
    shared: number;
    obligationsTotal: number;
    obligationsPaid: number;
    obligationsOutstanding: number;
    tickets: Array<{
      id: number;
      ticketNumber: string;
      title: string;
      status: string;
      costBearer?: string;
      estimatedCost?: number;
      finalCost?: number;
      createdAt: string;
    }>;
  };

  adjustments: Array<{
    id: number;
    referenceCode: string;
    purpose: string;
    amount: number;
    totalAmount: number;
    status: string;
    settlementStatus: string;
    payerName: string;
    payeeName: string;
    dueDate?: string;
    paidAt?: string;
    notes?: string;
    disputeId?: number;
    disputeCaseNumber?: string;
  }>;

  payments: Array<{
    id: number;
    publicId: string;
    referenceCode: string;
    purpose: string;
    amount: number;
    taxAmount: number;
    totalAmount: number;
    currency: string;
    status: string;
    settlementStatus: string;
    settlementMode: string;
    dueDate?: string;
    paidAt?: string;
    notes?: string;
    payerId: number;
    payerName: string;
    payeeId?: number;
    payeeName?: string;
    txnReference?: string;
    method?: string;
    provider?: string;
  }>;

  transactions: Array<{
    id: number;
    paymentId: number;
    paymentReference: string;
    purpose: string;
    txnReference: string;
    direction: string;
    provider: string;
    method?: string;
    amount: number;
    currency: string;
    status: string;
    occurredAt: string;
  }>;
};

export function FinancialPositionCard({ financials }: { financials: TenancyFinancialSummary }) {
  const [activeTab, setActiveTab] = useState<'rent' | 'deposit' | 'maintenance' | 'adjustments' | 'ledger'>('rent');

  const { summary, rent, deposit, maintenance, adjustments, payments } = financials;

  return (
    <Card className="overflow-hidden border-seal-soft shadow-subtle">
      <CardHeader
        title="Financial Position & Balance Sheet"
        note="Real-time dynamic financial standing derived from actual payment records, agreements, and settlements."
        action={
          <div className="flex items-center gap-2">
            <span className="rounded bg-seal-soft px-2.5 py-1 font-mono text-xs font-semibold text-seal-deep">
              INR Standard
            </span>
          </div>
        }
      />

      <div className="p-5 space-y-6">
        {/* KPI Balance Sheet Summary Tiles */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-card border border-line bg-paper/60 p-3.5">
            <p className="eyebrow text-muted">Tenant Liability</p>
            <p className="tabular mt-1.5 font-display text-2xl font-semibold text-ink">
              {inr(summary.netTenantLiability)}
            </p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              {summary.totalOutstanding > 0 ? `${inr(summary.totalOutstanding)} total unpaid` : 'All dues settled'}
            </p>
          </div>

          <div className="rounded-card border border-line bg-paper/60 p-3.5">
            <p className="eyebrow text-muted">Owner Receivable</p>
            <p className="tabular mt-1.5 font-display text-2xl font-semibold text-ink">
              {inr(summary.netOwnerReceivable)}
            </p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              Rent + dues pending receipt
            </p>
          </div>

          <div className="rounded-card border border-line bg-paper/60 p-3.5">
            <p className="eyebrow text-muted">Rent Paid / Accrued</p>
            <p className="tabular mt-1.5 font-display text-2xl font-semibold text-ink">
              {inr(summary.totalRentPaid)}
            </p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              of {inr(summary.totalRentAccrued)} accrued
            </p>
          </div>

          <div className="rounded-card border border-line bg-paper/60 p-3.5">
            <p className="eyebrow text-muted">Deposit Held</p>
            <p className="tabular mt-1.5 font-display text-2xl font-semibold text-ink">
              {inr(summary.securityDepositHeld)}
            </p>
            <p className="text-[11px] text-muted font-mono mt-0.5">
              {summary.depositRefundDue > 0 ? `Refund due: ${inr(summary.depositRefundDue)}` : `Required: ${inr(summary.securityDepositRequired)}`}
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-line overflow-x-auto gap-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setActiveTab('rent')}
            className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'rent'
                ? 'border-seal text-seal-deep font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Rent Schedule ({rent.schedule.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('deposit')}
            className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'deposit'
                ? 'border-seal text-seal-deep font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Security Deposit
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('maintenance')}
            className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'maintenance'
                ? 'border-seal text-seal-deep font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Maintenance ({maintenance.tickets.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('adjustments')}
            className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'adjustments'
                ? 'border-seal text-seal-deep font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Adjustments ({adjustments.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-2 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === 'ledger'
                ? 'border-seal text-seal-deep font-semibold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            Tenancy Ledger ({payments.length})
          </button>
        </div>

        {/* Tab 1: Rent Schedule */}
        {activeTab === 'rent' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-xs bg-paper/40 p-3 rounded-card border border-line">
              <div>
                <span className="text-muted">Current Monthly Rent: </span>
                <strong className="text-ink font-semibold">{inr(rent.monthlyRent)}</strong>
                <span className="text-muted"> (Due on day {rent.rentDueDay} of month)</span>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span>Accrued: <strong className="text-ink">{inr(rent.totalAccrued)}</strong></span>
                <span>Paid: <strong className="text-emerald-700">{inr(rent.totalPaid)}</strong></span>
                {rent.overdue > 0 && (
                  <span className="text-rose-700 font-semibold">Overdue: {inr(rent.overdue)} ({rent.overdueCount})</span>
                )}
              </div>
            </div>

            {rent.schedule.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Period / Note</th>
                      <th className="pb-2">Reference</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Due Date</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rent.schedule.map((row) => (
                      <tr key={row.id} className="hover:bg-paper/50">
                        <td className="py-2.5 font-medium text-ink">{row.periodName}</td>
                        <td className="py-2.5 font-mono text-muted">{row.referenceCode}</td>
                        <td className="py-2.5 font-semibold text-ink">{inr(row.totalAmount)}</td>
                        <td className="py-2.5 font-mono text-muted">
                          {row.dueDate ? shortDate(row.dueDate) : '—'}
                          {row.isOverdue && (
                            <span className="ml-1.5 rounded bg-rose-100 text-rose-800 font-mono px-1.5 py-0.5 text-[10px] font-medium">
                              {row.daysOverdue}d overdue
                            </span>
                          )}
                        </td>
                        <td className="py-2.5"><StatusChip status={row.status} /></td>
                        <td className="py-2.5">
                          <Link
                            href={`/dashboard/payments/${row.id}`}
                            className="rounded border border-line bg-paper px-2 py-0.5 text-xs font-medium hover:border-seal text-seal-deep"
                          >
                            Details →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted py-4">No monthly rent obligations generated yet.</p>
            )}
          </div>
        )}

        {/* Tab 2: Security Deposit */}
        {activeTab === 'deposit' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 bg-paper/40 p-4 rounded-card border border-line text-xs">
              <div>
                <p className="text-muted uppercase font-mono text-[10px]">Required Deposit</p>
                <p className="text-lg font-semibold text-ink mt-1">{inr(deposit.required)}</p>
              </div>
              <div>
                <p className="text-muted uppercase font-mono text-[10px]">Deposit Settled</p>
                <p className="text-lg font-semibold text-emerald-700 mt-1">{inr(deposit.paid)}</p>
              </div>
              <div>
                <p className="text-muted uppercase font-mono text-[10px]">Currently Held</p>
                <p className="text-lg font-semibold text-ink mt-1">{inr(deposit.held)}</p>
              </div>
            </div>

            {/* Deductions & Refund Section */}
            <div className="space-y-3">
              <h4 className="font-display text-sm font-semibold text-ink">Move-Out Deductions & Settlement</h4>
              {deposit.deductions.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                        <th className="pb-2">Category</th>
                        <th className="pb-2">Description</th>
                        <th className="pb-2">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {deposit.deductions.map((d, idx) => (
                        <tr key={idx} className="hover:bg-paper/50">
                          <td className="py-2 font-mono text-muted">{titleCase(d.category)}</td>
                          <td className="py-2 text-ink">{d.description}</td>
                          <td className="py-2 font-semibold text-ink">{inr(d.amount)}</td>
                        </tr>
                      ))}
                      <tr className="font-semibold text-ink bg-paper/60">
                        <td colSpan={2} className="py-2">Total Itemized Deductions</td>
                        <td className="py-2">{inr(deposit.deductionsTotal)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-muted">No move-out deductions recorded.</p>
              )}

              {deposit.refundDue > 0 || deposit.refundPaid > 0 ? (
                <div className="flex items-center justify-between p-3 rounded-card bg-seal-soft/40 border border-seal-soft text-xs">
                  <div>
                    <p className="font-semibold text-ink">Security Deposit Refund: {inr(deposit.refundDue || deposit.refundPaid)}</p>
                    <p className="text-muted text-[11px] mt-0.5">
                      {deposit.refundPaid > 0 ? 'Settled and refunded to tenant.' : 'Agreed refund obligation pending settlement.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={deposit.refundStatus} />
                    {deposit.refundPaymentId && (
                      <Link
                        href={`/dashboard/payments/${deposit.refundPaymentId}`}
                        className="rounded border border-line bg-white px-2 py-0.5 text-xs font-medium hover:border-seal text-seal-deep"
                      >
                        Refund Payment →
                      </Link>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Tab 3: Maintenance Financials */}
        {activeTab === 'maintenance' && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3 bg-paper/40 p-4 rounded-card border border-line text-xs">
              <div>
                <p className="text-muted uppercase font-mono text-[10px]">Owner-Borne Completed</p>
                <p className="text-lg font-semibold text-ink mt-1">{inr(maintenance.ownerBorne)}</p>
              </div>
              <div>
                <p className="text-muted uppercase font-mono text-[10px]">Tenant-Borne Completed</p>
                <p className="text-lg font-semibold text-ink mt-1">{inr(maintenance.tenantBorne)}</p>
              </div>
              <div>
                <p className="text-muted uppercase font-mono text-[10px]">Billed Obligations</p>
                <p className="text-lg font-semibold text-ink mt-1">{inr(maintenance.obligationsTotal)}</p>
              </div>
            </div>

            {maintenance.tickets.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Ticket</th>
                      <th className="pb-2">Title</th>
                      <th className="pb-2">Cost Bearer</th>
                      <th className="pb-2">Final Cost</th>
                      <th className="pb-2">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {maintenance.tickets.map((t) => (
                      <tr key={t.id} className="hover:bg-paper/50">
                        <td className="py-2.5 font-mono text-muted">{t.ticketNumber}</td>
                        <td className="py-2.5 font-medium text-ink">{t.title}</td>
                        <td className="py-2.5 font-mono text-muted">{t.costBearer || '—'}</td>
                        <td className="py-2.5 font-semibold text-ink">{t.finalCost ? inr(t.finalCost) : '—'}</td>
                        <td className="py-2.5"><StatusChip status={t.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted py-4">No maintenance tickets recorded on this tenancy.</p>
            )}
          </div>
        )}

        {/* Tab 4: Other Financial Adjustments */}
        {activeTab === 'adjustments' && (
          <div className="space-y-4">
            {adjustments.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Purpose</th>
                      <th className="pb-2">Reference</th>
                      <th className="pb-2">Payer → Payee</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Dispute Link</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {adjustments.map((a) => (
                      <tr key={a.id} className="hover:bg-paper/50">
                        <td className="py-2.5 font-medium text-ink">{titleCase(a.purpose)}</td>
                        <td className="py-2.5 font-mono text-muted">{a.referenceCode}</td>
                        <td className="py-2.5 text-muted">{a.payerName} → {a.payeeName}</td>
                        <td className="py-2.5 font-semibold text-ink">{inr(a.totalAmount)}</td>
                        <td className="py-2.5"><StatusChip status={a.status} /></td>
                        <td className="py-2.5">
                          {a.disputeId ? (
                            <Link href={`/dashboard/disputes/${a.disputeId}`} className="text-seal hover:underline font-mono">
                              {a.disputeCaseNumber || `Dispute #${a.disputeId}`} →
                            </Link>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted py-4">No ancillary adjustments or dispute fees on this tenancy.</p>
            )}
          </div>
        )}

        {/* Tab 5: Complete Tenancy Ledger */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            {payments.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                      <th className="pb-2">Reference</th>
                      <th className="pb-2">Purpose</th>
                      <th className="pb-2">Payer</th>
                      <th className="pb-2">Amount</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Due / Paid</th>
                      <th className="pb-2">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payments.map((p) => (
                      <tr key={p.id} className="hover:bg-paper/50">
                        <td className="py-2.5 font-mono font-medium text-ink">{p.referenceCode}</td>
                        <td className="py-2.5">{titleCase(p.purpose)}</td>
                        <td className="py-2.5 text-muted">{p.payerName}</td>
                        <td className="py-2.5 font-semibold text-ink">{inr(p.totalAmount)}</td>
                        <td className="py-2.5"><StatusChip status={p.status} /></td>
                        <td className="py-2.5 font-mono text-muted">
                          {p.paidAt ? shortDate(p.paidAt) : p.dueDate ? `Due ${shortDate(p.dueDate)}` : '—'}
                        </td>
                        <td className="py-2.5">
                          <Link
                            href={`/dashboard/payments/${p.id}`}
                            className="rounded border border-line bg-paper px-2 py-0.5 text-xs font-medium hover:border-seal text-seal-deep"
                          >
                            View →
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted py-4">No payment entries in ledger.</p>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
