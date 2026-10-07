'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Card, CardHeader, StatusChip, Button, Badge } from '@/components/ui';
import { inr, shortDate, titleCase } from '@/lib/format';

export default function PayoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;
  const router = useRouter();

  const [payout, setPayout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action Modals
  const [activeModal, setActiveModal] = useState<'RECORD_PAYMENT' | 'RECONCILE' | 'REJECT' | 'HOLD' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Form states
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [externalRef, setExternalRef] = useState<string>('');
  const [payoutMethod, setPayoutMethod] = useState<string>('NEFT');
  const [settlementDate, setSettlementDate] = useState<string>('');
  const [actionNotes, setActionNotes] = useState<string>('');
  const [rejectReason, setRejectReason] = useState<string>('');
  const [holdReason, setHoldReason] = useState<string>('');

  const loadPayout = async () => {
    setLoading(true);
    try {
      const data = await api<any>(`/admin/finance/payouts/${id}`);
      setPayout(data);
      setPaidAmount(String(data.net_amount));
    } catch (err: any) {
      setError(err.message || 'Failed to load payout details.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayout();
  }, [id]);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      const updated = await api<any>(`/admin/finance/payouts/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Approved via Finance Control Centre' }),
      });
      setPayout(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to approve payout.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleProcess = async () => {
    setActionLoading(true);
    try {
      const updated = await api<any>(`/admin/finance/payouts/${id}/process`, {
        method: 'POST',
        body: JSON.stringify({ payoutMethod }),
      });
      setPayout(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to process payout.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await api<any>(`/admin/finance/payouts/${id}/record-payment`, {
        method: 'POST',
        body: JSON.stringify({
          paidAmount: Number(paidAmount),
          externalReference: externalRef.trim(),
          payoutMethod,
          settlementDate: settlementDate || new Date().toISOString().slice(0, 10),
          notes: actionNotes.trim(),
        }),
      });
      setPayout(updated);
      setActiveModal(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to record payout settlement.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReconcile = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await api<any>(`/admin/finance/payouts/${id}/reconcile`, {
        method: 'POST',
        body: JSON.stringify({
          actualAmount: Number(paidAmount),
          externalReference: externalRef.trim(),
          settlementDate: settlementDate || new Date().toISOString().slice(0, 10),
          notes: actionNotes.trim(),
        }),
      });
      setPayout(updated);
      setActiveModal(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to reconcile payout.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await api<any>(`/admin/finance/payouts/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: rejectReason.trim() }),
      });
      setPayout(updated);
      setActiveModal(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to reject payout.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleHold = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);
    try {
      const updated = await api<any>(`/admin/finance/payouts/${id}/hold`, {
        method: 'POST',
        body: JSON.stringify({ reason: holdReason.trim() }),
      });
      setPayout(updated);
      setActiveModal(null);
    } catch (err: any) {
      setActionError(err.message || 'Failed to place payout on hold.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-seal border-t-transparent"></div>
          <p className="mt-2 text-sm text-muted">Loading owner payout details...</p>
        </div>
      </div>
    );
  }

  if (error || !payout) {
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/admin/finance"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-seal-deep hover:underline"
        >
          ← Back to Finance Control Centre
        </Link>
        <Card className="p-8 text-center">
          <p className="text-rose-600 font-semibold">{error || 'Payout not found.'}</p>
        </Card>
      </div>
    );
  }

  const account = payout.payoutAccount || {};
  const items = payout.items || [];
  const reconciliations = payout.reconciliations || [];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Navigation & Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/dashboard/admin/finance"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-seal-deep hover:underline"
        >
          ← Back to Finance Control Centre
        </Link>

        {/* Governance Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {payout.status === 'PENDING_REVIEW' && (
            <>
              <button
                type="button"
                onClick={handleApprove}
                disabled={actionLoading}
                className="rounded-button bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-subtle hover:bg-emerald-700 transition-colors"
              >
                ✓ Approve Payout
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('REJECT')}
                className="rounded-button border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 transition-colors"
              >
                ✕ Reject
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('HOLD')}
                className="rounded-button border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
              >
                ⏸ Put On Hold
              </button>
            </>
          )}

          {payout.status === 'APPROVED' && (
            <>
              <button
                type="button"
                onClick={handleProcess}
                disabled={actionLoading}
                className="rounded-button bg-seal px-3.5 py-1.5 text-xs font-medium text-white shadow-subtle hover:bg-seal-deep transition-colors"
              >
                ⚡ Start Processing
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('RECORD_PAYMENT')}
                className="rounded-button bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-subtle hover:bg-emerald-700 transition-colors"
              >
                Record Settlement & UTR
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('HOLD')}
                className="rounded-button border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
              >
                Put On Hold
              </button>
            </>
          )}

          {payout.status === 'PROCESSING' && (
            <>
              <button
                type="button"
                onClick={() => setActiveModal('RECORD_PAYMENT')}
                className="rounded-button bg-emerald-600 px-3.5 py-1.5 text-xs font-medium text-white shadow-subtle hover:bg-emerald-700 transition-colors"
              >
                Record Settlement & UTR
              </button>
              <button
                type="button"
                onClick={() => setActiveModal('HOLD')}
                className="rounded-button border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 transition-colors"
              >
                Put On Hold
              </button>
            </>
          )}

          {['PAID', 'ON_HOLD'].includes(payout.status) && (
            <button
              type="button"
              onClick={() => setActiveModal('RECONCILE')}
              className="rounded-button border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface shadow-subtle transition-colors"
            >
              Reconcile External UTR
            </button>
          )}
        </div>
      </div>

      {/* Primary Card */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between border-b border-line pb-6">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-seal-soft px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-seal-deep">
                Owner Financial Payout
              </span>
              <StatusChip status={payout.status} />
              {payout.reconciliation_status === 'MATCHED' && (
                <span className="rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] px-2 py-0.5 font-bold">
                  ✓ RECONCILED MATCHED
                </span>
              )}
              {payout.reconciliation_status === 'MISMATCHED' && (
                <span className="rounded bg-rose-100 text-rose-800 font-mono text-[10px] px-2 py-0.5 font-bold">
                  ⚠ RECONCILIATION MISMATCH
                </span>
              )}
              {payout.reconciliation_status === 'PARTIALLY_MATCHED' && (
                <span className="rounded bg-amber-100 text-amber-800 font-mono text-[10px] px-2 py-0.5 font-bold">
                  PARTIALLY MATCHED
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-ink mt-2">
              {payout.payout_number}
            </h1>
            <p className="font-mono text-xs text-muted mt-1">
              Financial Period: {shortDate(payout.period_start)} → {shortDate(payout.period_end)}
            </p>
          </div>

          <div className="text-right sm:text-right">
            <span className="text-muted text-xs font-mono uppercase">Net Payable Obligation</span>
            <p className="font-display text-3xl font-extrabold text-seal-deep tabular mt-0.5">
              {inr(payout.net_amount)}
            </p>
            {payout.paid_amount > 0 && (
              <p className="text-xs text-muted font-mono mt-0.5">
                Settled: <strong className="text-emerald-700">{inr(payout.paid_amount)}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Owner & Account Grid */}
        <div className="grid gap-6 sm:grid-cols-2 py-6 border-b border-line text-xs">
          <div className="bg-surface/50 p-4 rounded-input border border-line/60 space-y-1.5">
            <p className="eyebrow text-seal-deep font-semibold">Beneficiary Owner</p>
            <p className="font-semibold text-ink text-sm">{payout.owner_name}</p>
            <p className="text-muted font-mono">{payout.owner_email}</p>
            {payout.owner_phone && <p className="text-muted font-mono">{payout.owner_phone}</p>}
          </div>

          <div className="bg-surface/50 p-4 rounded-input border border-line/60 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="eyebrow text-seal-deep font-semibold">Payout Destination Account</p>
              {account.isVerified ? (
                <span className="rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] px-1.5 py-0.5 font-semibold">
                  Verified
                </span>
              ) : (
                <span className="rounded bg-amber-100 text-amber-800 font-mono text-[10px] px-1.5 py-0.5 font-semibold">
                  Unverified
                </span>
              )}
            </div>
            <p className="font-semibold text-ink">{account.holderName || payout.owner_name}</p>
            <p className="font-mono text-muted">
              {account.accountType || 'BANK'} · {account.accountNumberMasked || `••••${account.accountLast4 || ''}`}
            </p>
            {account.ifsc && <p className="font-mono text-muted">IFSC: {account.ifsc}</p>}
            {account.upiHandle && <p className="font-mono text-muted">UPI: {account.upiHandle}</p>}
          </div>
        </div>

        {/* Financial Calculation Breakdown */}
        <div className="py-6 border-b border-line">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted font-mono mb-3">
            Financial Balance Sheet Breakdown
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="bg-paper p-4 rounded-card border border-line">
              <span className="text-muted text-xs">Gross Owner Receivables</span>
              <p className="font-display text-xl font-bold text-ink tabular mt-1">
                {inr(payout.gross_amount)}
              </p>
              <p className="text-[10px] text-muted mt-1">Total collected rent & advance receipts</p>
            </div>

            <div className="bg-paper p-4 rounded-card border border-line">
              <span className="text-muted text-xs">Platform Fees & Deductions</span>
              <p className="font-display text-xl font-bold text-rose-700 tabular mt-1">
                −{inr(payout.deduction_amount)}
              </p>
              <p className="text-[10px] text-muted mt-1">Commissions, service charges & maintenance</p>
            </div>

            <div className="bg-seal-soft/50 p-4 rounded-card border border-seal-soft">
              <span className="text-seal-deep font-semibold text-xs">Net Owner Settlement</span>
              <p className="font-display text-xl font-bold text-seal-deep tabular mt-1">
                {inr(payout.net_amount)}
              </p>
              <p className="text-[10px] text-seal-deep mt-1">Authoritative payable calculation</p>
            </div>
          </div>
        </div>

        {/* Source Financial Transactions */}
        <div className="py-6 border-b border-line overflow-x-auto">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted font-mono mb-3">
            Supporting Underlying Financial Transactions ({items.length})
          </h3>
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                <th className="pb-2">Payment Ref</th>
                <th className="pb-2">Type / Classification</th>
                <th className="pb-2">Description</th>
                <th className="pb-2">Direction</th>
                <th className="pb-2 text-right">Amount</th>
                <th className="pb-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((item: any) => (
                <tr key={item.id} className="hover:bg-surface/30">
                  <td className="py-2.5 font-mono text-ink">
                    {item.payment_reference ? (
                      <Link href={`/dashboard/payments/${item.payment_id}`} className="hover:text-seal underline">
                        {item.payment_reference}
                      </Link>
                    ) : (
                      item.reference_code || '—'
                    )}
                  </td>
                  <td className="py-2.5 font-mono text-[11px] text-muted">
                    {titleCase(item.item_type)}
                  </td>
                  <td className="py-2.5 font-medium text-ink max-w-xs">{item.description}</td>
                  <td className="py-2.5">
                    {item.direction === 'CREDIT' ? (
                      <span className="rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] px-1.5 py-0.5 font-semibold">
                        + CREDIT
                      </span>
                    ) : (
                      <span className="rounded bg-rose-100 text-rose-800 font-mono text-[10px] px-1.5 py-0.5 font-semibold">
                        − DEBIT
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular font-semibold text-ink">
                    {item.direction === 'DEBIT' ? `−${inr(item.amount)}` : inr(item.amount)}
                  </td>
                  <td className="py-2.5 text-right">
                    <StatusChip status={item.payment_status || 'PAID'} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Reconciliation History Trail */}
        {reconciliations.length > 0 && (
          <div className="py-6 border-b border-line">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted font-mono mb-3">
              Reconciliation Audit Trail
            </h3>
            <div className="space-y-3">
              {reconciliations.map((r: any) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 rounded-input border border-line/70 bg-surface/40 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-bold text-ink">UTR: {r.external_reference || 'N/A'}</span>
                      <StatusChip status={r.status} />
                    </div>
                    <p className="text-muted mt-0.5">
                      Reconciled by <strong>{r.reconciled_by_name}</strong> on {shortDate(r.reconciled_at)} · {r.notes}
                    </p>
                  </div>
                  <div className="text-right sm:text-right mt-2 sm:mt-0 font-mono">
                    <p className="text-ink">Actual: <strong>{inr(r.actual_amount)}</strong></p>
                    {r.difference !== 0 && (
                      <p className="text-rose-700 font-bold">Diff: {inr(r.difference)}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Audit & Governance Details */}
        <div className="py-4 text-xs text-muted space-y-1 font-mono">
          {payout.approved_by_name && (
            <p>Approved by: <strong>{payout.approved_by_name}</strong> on {shortDate(payout.approved_at)}</p>
          )}
          {payout.paid_at && (
            <p>Settled on: <strong>{shortDate(payout.paid_at)}</strong> · Reference: {payout.external_reference || '—'}</p>
          )}
          {payout.rejection_reason && (
            <p className="text-rose-700 font-semibold">Rejection reason: {payout.rejection_reason}</p>
          )}
          {payout.hold_reason && (
            <p className="text-amber-800 font-semibold">Hold reason: {payout.hold_reason}</p>
          )}
        </div>
      </Card>

      {/* Record Payment Settlement Modal */}
      {activeModal === 'RECORD_PAYMENT' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card bg-paper p-6 shadow-card border border-line">
            <h3 className="font-display text-lg font-bold text-ink">Record External Settlement</h3>
            <p className="mt-1 text-xs text-muted">
              Record external banking settlement (NEFT/RTGS/UPI) and reconcile against expected payable balance of{' '}
              <strong>{inr(payout.net_amount)}</strong>.
            </p>

            <form onSubmit={handleRecordPayment} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">Settled Amount (INR) *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-seal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">External Transfer Ref / UTR *</label>
                <input
                  type="text"
                  placeholder="e.g. UTR202610019948201"
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-seal focus:outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Payment Method</label>
                <select
                  value={payoutMethod}
                  onChange={(e) => setPayoutMethod(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-seal focus:outline-none"
                >
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                  <option value="IMPS">IMPS</option>
                  <option value="UPI">UPI</option>
                  <option value="MANUAL">Manual / Cheque</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Settlement Date</label>
                <input
                  type="date"
                  value={settlementDate}
                  onChange={(e) => setSettlementDate(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-seal focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Audit Notes</label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Optional notes for financial reconciliation..."
                  rows={2}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-seal focus:outline-none"
                />
              </div>

              {actionError && <p className="font-semibold text-rose-600">{actionError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={actionLoading}
                  className="rounded-button border border-line bg-surface px-3 py-1.5 font-medium text-ink hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-button bg-emerald-600 px-3.5 py-1.5 font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Saving...' : 'Confirm Settlement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Standalone Reconcile Modal */}
      {activeModal === 'RECONCILE' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card bg-paper p-6 shadow-card border border-line">
            <h3 className="font-display text-lg font-bold text-ink">Reconcile External Payout</h3>
            <p className="mt-1 text-xs text-muted">
              Verify external bank transfer against expected payout of <strong>{inr(payout.net_amount)}</strong>.
            </p>

            <form onSubmit={handleReconcile} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">Actual Bank Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-seal focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">External UTR / Reference *</label>
                <input
                  type="text"
                  value={externalRef}
                  onChange={(e) => setExternalRef(e.target.value)}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-seal focus:outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-ink mb-1">Reconciliation Notes</label>
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-seal focus:outline-none"
                />
              </div>

              {actionError && <p className="font-semibold text-rose-600">{actionError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={actionLoading}
                  className="rounded-button border border-line bg-surface px-3 py-1.5 font-medium text-ink hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-button bg-seal px-3.5 py-1.5 font-medium text-white hover:bg-seal-deep disabled:opacity-50"
                >
                  {actionLoading ? 'Reconciling...' : 'Save Reconciliation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {activeModal === 'REJECT' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card bg-paper p-6 shadow-card border border-line">
            <h3 className="font-display text-lg font-bold text-ink">Reject Owner Payout</h3>
            <p className="mt-1 text-xs text-muted">
              Rejecting this payout proposal marks it as REJECTED and releases the source transactions.
            </p>

            <form onSubmit={handleReject} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">Reason for Rejection *</label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="e.g. Account verification required, incorrect deduction allocation..."
                  rows={3}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-rose-500 focus:outline-none"
                  required
                />
              </div>

              {actionError && <p className="font-semibold text-rose-600">{actionError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={actionLoading}
                  className="rounded-button border border-line bg-surface px-3 py-1.5 font-medium text-ink hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-button bg-rose-600 px-3.5 py-1.5 font-medium text-white hover:bg-rose-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Hold Modal */}
      {activeModal === 'HOLD' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card bg-paper p-6 shadow-card border border-line">
            <h3 className="font-display text-lg font-bold text-ink">Place Payout On Hold</h3>
            <p className="mt-1 text-xs text-muted">
              Placing on hold temporarily halts processing pending investigation.
            </p>

            <form onSubmit={handleHold} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-ink mb-1">Reason for Hold *</label>
                <textarea
                  value={holdReason}
                  onChange={(e) => setHoldReason(e.target.value)}
                  placeholder="e.g. Pending bank account re-verification..."
                  rows={3}
                  className="w-full rounded-input border border-line bg-surface p-2 text-ink focus:border-amber-500 focus:outline-none"
                  required
                />
              </div>

              {actionError && <p className="font-semibold text-rose-600">{actionError}</p>}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  disabled={actionLoading}
                  className="rounded-button border border-line bg-surface px-3 py-1.5 font-medium text-ink hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-button bg-amber-600 px-3.5 py-1.5 font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Holding...' : 'Place On Hold'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
