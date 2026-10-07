'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, CardHeader, DataRow, ErrorNote, StatusChip } from '@/components/ui';
import { inr, shortDate, titleCase } from '@/lib/format';

type MoveOutCardProps = {
  tenancy: {
    id: number;
    stage: string;
    rent_amount: number;
    deposit_amount: number;
    start_date?: string;
    end_date?: string;
    lock_in_months?: number;
    notice_period_days?: number;
    is_owner: boolean;
    owner_name: string;
    tenant_name: string;
  };
  agreement?: {
    id: number;
    agreement_number: string;
    status: string;
    effective_from?: string;
    effective_to?: string;
  } | null;
  moveOutNotice?: {
    requestedBy?: number;
    requesterRole?: 'TENANT' | 'OWNER';
    requestedMoveOutDate?: string;
    reason?: string;
    noticePeriodDays?: number;
    status?: 'REQUESTED' | 'CONFIRMED';
    confirmedBy?: number;
    confirmedAt?: string;
    requestedAt?: string;
  } | null;
  settlementProposal?: {
    depositAmount: number;
    deductions: Array<{
      category: 'DAMAGE' | 'UNPAID_RENT' | 'MAINTENANCE' | 'OTHER';
      description: string;
      amount: number;
      evidenceUrl?: string;
    }>;
    totalDeductions: number;
    refundAmount: number;
    notes?: string;
    proposedBy: number;
    proposerRole: string;
    proposedAt: string;
    status: 'PROPOSED' | 'ACCEPTED' | 'DISPUTED';
    acceptedBy?: number;
    acceptedAt?: string;
  } | null;
  inspections?: Array<{
    id: number;
    report_number: string;
    kind: string;
    status: string;
    submitted_at?: string;
    media_count: number;
  }>;
  payments?: Array<{
    id: number;
    reference_code: string;
    purpose: string;
    total_amount: number;
    status: string;
  }>;
};

export function MoveOutCard({
  tenancy,
  agreement,
  moveOutNotice,
  settlementProposal,
  inspections = [],
  payments = [],
}: MoveOutCardProps) {
  const router = useRouter();
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [showDisputeModal, setShowDisputeModal] = useState(false);

  // Form states - Notice
  const defaultNoticeDays = tenancy.notice_period_days || 30;
  const minNoticeDate = new Date();
  minNoticeDate.setDate(minNoticeDate.getDate() + defaultNoticeDays);
  const minDateStr = minNoticeDate.toISOString().split('T')[0];

  const [requestedDate, setRequestedDate] = useState<string>(minDateStr);
  const [reason, setReason] = useState<string>('');

  // Form states - Settlement
  const [deductions, setDeductions] = useState<
    Array<{ category: 'DAMAGE' | 'UNPAID_RENT' | 'MAINTENANCE' | 'OTHER'; description: string; amount: number }>
  >([]);
  const [newCategory, setNewCategory] = useState<'DAMAGE' | 'UNPAID_RENT' | 'MAINTENANCE' | 'OTHER'>('DAMAGE');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newAmount, setNewAmount] = useState<number>(0);
  const [settlementNotes, setSettlementNotes] = useState<string>('');

  // Form states - Dispute
  const [disputeReason, setDisputeReason] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isMoveOutStage = tenancy.stage === 'MOVE_OUT';
  const isClosed = tenancy.stage === 'CLOSED';
  const isActive = tenancy.stage === 'ACTIVE' || tenancy.stage === 'RENEWAL_DUE';

  const moveOutInspection = inspections.find((i) => i.kind === 'MOVE_OUT');
  const refundPayment = payments.find((p) => p.purpose === 'REFUND');

  const totalDeductions = deductions.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
  const calculatedRefund = Math.max(0, Number(tenancy.deposit_amount) - totalDeductions);

  const isRequester =
    (tenancy.is_owner && moveOutNotice?.requesterRole === 'OWNER') ||
    (!tenancy.is_owner && moveOutNotice?.requesterRole === 'TENANT');

  const canRequestMoveOut = isActive && !moveOutNotice;
  const canConfirmNotice = isMoveOutStage && moveOutNotice?.status === 'REQUESTED' && !isRequester;
  const canPerformInspection = isMoveOutStage && moveOutNotice?.status === 'CONFIRMED' && !moveOutInspection;
  const canProposeSettlement = isMoveOutStage && moveOutInspection && (!settlementProposal || settlementProposal.status === 'DISPUTED');
  const canAcceptSettlement =
    isMoveOutStage &&
    settlementProposal &&
    settlementProposal.status === 'PROPOSED' &&
    ((tenancy.is_owner && settlementProposal.proposerRole === 'TENANT') ||
      (!tenancy.is_owner && settlementProposal.proposerRole === 'OWNER'));

  function handleAddDeduction() {
    if (!newDescription.trim() || newAmount <= 0) return;
    if (totalDeductions + newAmount > Number(tenancy.deposit_amount)) {
      setError(`Total deductions cannot exceed security deposit of ${inr(tenancy.deposit_amount)}`);
      return;
    }
    setError(null);
    setDeductions([...deductions, { category: newCategory, description: newDescription.trim(), amount: newAmount }]);
    setNewDescription('');
    setNewAmount(0);
  }

  function handleRemoveDeduction(index: number) {
    setDeductions(deductions.filter((_, i) => i !== index));
  }

  async function handleRequestNotice(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api(`/tenancies/${tenancy.id}/move-out`, {
        method: 'POST',
        body: JSON.stringify({
          requestedMoveOutDate: requestedDate,
          reason: reason.trim() || undefined,
        }),
      });
      setShowNoticeModal(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to submit move-out notice.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmNotice() {
    setLoading(true);
    setError(null);
    try {
      await api(`/tenancies/${tenancy.id}/move-out/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          notes: `Move-out notice confirmed by ${tenancy.is_owner ? 'Owner' : 'Tenant'}`,
        }),
      });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to confirm move-out notice.');
    } finally {
      setLoading(false);
    }
  }

  async function handleProposeSettlement(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api(`/tenancies/${tenancy.id}/settlement`, {
        method: 'POST',
        body: JSON.stringify({
          deductions,
          notes: settlementNotes.trim() || undefined,
        }),
      });
      setShowSettlementModal(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to propose deposit settlement.');
    } finally {
      setLoading(false);
    }
  }

  async function handleAcceptSettlement() {
    setLoading(true);
    setError(null);
    try {
      await api(`/tenancies/${tenancy.id}/settlement/accept`, {
        method: 'POST',
        body: JSON.stringify({
          notes: `Settlement accepted by ${tenancy.is_owner ? 'Owner' : 'Tenant'}.`,
        }),
      });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to accept settlement.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSettleRefund() {
    if (!refundPayment) return;
    setLoading(true);
    setError(null);
    try {
      await api(`/payments/${refundPayment.id}/pay`, {
        method: 'POST',
        body: JSON.stringify({
          method: 'UPI',
        }),
      });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to settle deposit refund.');
    } finally {
      setLoading(false);
    }
  }

  async function handleDisputeSettlement(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api(`/tenancies/${tenancy.id}/settlement/dispute`, {
        method: 'POST',
        body: JSON.stringify({
          reason: disputeReason.trim(),
        }),
      });
      setShowDisputeModal(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to record dispute.');
    } finally {
      setLoading(false);
    }
  }

  if (!isActive && !isMoveOutStage && !isClosed) {
    return null;
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <p className="eyebrow">Move-out & Settlement</p>
          <h3 className="font-display text-lg font-semibold mt-0.5">
            {isClosed ? 'Tenancy Closed' : isMoveOutStage ? 'Move-Out in Progress' : 'Move-Out'}
          </h3>
        </div>
        <StatusChip status={isClosed ? 'CLOSED' : isMoveOutStage ? 'MOVE_OUT' : 'ACTIVE'} />
      </div>

      <div className="mt-4 space-y-3 text-sm">
        <DataRow label="Security Deposit" value={inr(tenancy.deposit_amount)} />
        <DataRow
          label="Contractual Notice"
          value={tenancy.notice_period_days ? `${tenancy.notice_period_days} days` : '30 days'}
        />

        {moveOutNotice ? (
          <div className="mt-4 rounded-card border border-line bg-paper/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted font-semibold">
                Move-Out Notice
              </p>
              <StatusChip status={moveOutNotice.status || 'REQUESTED'} />
            </div>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <span className="text-muted">Requested Date: </span>
                <span className="font-semibold text-ink">{shortDate(moveOutNotice.requestedMoveOutDate)}</span>
              </div>
              <div>
                <span className="text-muted">Initiated By: </span>
                <span className="font-semibold text-ink">{moveOutNotice.requesterRole}</span>
              </div>
            </div>
            {moveOutNotice.reason ? (
              <p className="text-[12px] text-muted italic mt-1">Reason: {moveOutNotice.reason}</p>
            ) : null}
            {moveOutNotice.confirmedAt ? (
              <p className="text-[11px] text-seal font-medium mt-1">
                ✓ Confirmed on {shortDate(moveOutNotice.confirmedAt)}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Move-out inspection status */}
        {moveOutInspection ? (
          <div className="mt-4 rounded-card border border-seal/30 bg-seal-soft p-4 space-y-1">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-wider text-seal font-semibold">
                Move-Out Inspection: {moveOutInspection.report_number}
              </p>
              <StatusChip status={moveOutInspection.status} />
            </div>
            <p className="text-[13px] text-ink">
              Inspection completed on {shortDate(moveOutInspection.submitted_at)}. Room & item condition documented vs Day 1.
            </p>
          </div>
        ) : isMoveOutStage && moveOutNotice?.status === 'CONFIRMED' ? (
          <div className="mt-4 rounded-card border border-ochre/30 bg-ochre-soft p-4 space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-wider text-ochre font-semibold">
              Move-Out Inspection Pending
            </p>
            <p className="text-[13px] text-ink">
              Conduct move-out condition report to compare against Day 1 check-in before finalizing deposit settlement.
            </p>
            <Button href={`/dashboard/condition-report/new?tenancyId=${tenancy.id}`} size="sm" full>
              Start Move-Out Condition Report
            </Button>
          </div>
        ) : null}

        {/* Settlement proposal */}
        {settlementProposal ? (
          <div className="mt-4 rounded-card border border-line bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted font-semibold">
                Deposit Settlement
              </p>
              <StatusChip status={settlementProposal.status} />
            </div>

            <div className="space-y-1.5 text-[13px]">
              <div className="flex justify-between">
                <span className="text-muted">Original Deposit</span>
                <span className="font-semibold">{inr(settlementProposal.depositAmount)}</span>
              </div>

              {settlementProposal.deductions?.length ? (
                <div className="space-y-1 border-t border-dashed border-line pt-2">
                  <p className="text-[11px] font-mono uppercase text-muted">Itemized Deductions:</p>
                  {settlementProposal.deductions.map((d, i) => (
                    <div key={i} className="flex justify-between text-[12px] text-ink pl-2">
                      <span>• {d.description} ({titleCase(d.category)})</span>
                      <span className="text-crimson font-medium">- {inr(d.amount)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-seal italic">No deductions proposed. Full refund.</div>
              )}

              <div className="flex justify-between border-t border-line pt-2">
                <span className="text-muted">Total Deductions</span>
                <span className="font-semibold text-crimson">- {inr(settlementProposal.totalDeductions)}</span>
              </div>
              <div className="flex justify-between font-display text-[15px] font-bold text-seal">
                <span>Final Refund Due</span>
                <span>{inr(settlementProposal.refundAmount)}</span>
              </div>
            </div>

            {settlementProposal.notes ? (
              <p className="text-[12px] text-muted italic">Note: {settlementProposal.notes}</p>
            ) : null}

            {settlementProposal.status === 'PROPOSED' && canAcceptSettlement ? (
              <div className="flex gap-2 pt-2">
                <Button onClick={handleAcceptSettlement} size="sm" full disabled={loading}>
                  {loading ? 'Processing...' : 'Accept Settlement'}
                </Button>
                <Button
                  onClick={() => setShowDisputeModal(true)}
                  variant="secondary"
                  size="sm"
                  full
                  disabled={loading}
                >
                  Dispute
                </Button>
              </div>
            ) : settlementProposal.status === 'PROPOSED' && !canAcceptSettlement ? (
              <p className="text-[12px] text-muted text-center italic pt-1">
                Awaiting review & acceptance from the counterparty.
              </p>
            ) : null}

            {settlementProposal.status === 'ACCEPTED' ? (
              <div className="rounded border border-seal/30 bg-seal-soft p-2.5 text-[12px] text-seal">
                ✓ Settlement terms accepted. {refundPayment?.status === 'DUE' ? 'Security deposit refund is pending payment.' : 'Final settlement completed.'}
              </div>
            ) : null}

            {settlementProposal.status === 'DISPUTED' ? (
              <div className="rounded border border-crimson/30 bg-crimson-soft p-2.5 text-[12px] text-crimson">
                Settlement proposal is disputed. You can propose revised terms or contact support.
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Refund payment record: DUE or PAID */}
        {refundPayment ? (
          <div
            className={`mt-4 rounded-card border p-4 space-y-2 ${
              refundPayment.status === 'PAID'
                ? 'border-seal/40 bg-seal-soft'
                : 'border-ochre/40 bg-ochre-soft'
            }`}
          >
            <div className="flex items-center justify-between">
              <p
                className={`font-mono text-[11px] uppercase tracking-wider font-semibold ${
                  refundPayment.status === 'PAID' ? 'text-seal' : 'text-ochre'
                }`}
              >
                Deposit Refund: {refundPayment.reference_code}
              </p>
              <StatusChip status={refundPayment.status} />
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted">Refund Amount</span>
              <span className="font-bold text-ink">{inr(refundPayment.total_amount)}</span>
            </div>

            {refundPayment.status === 'DUE' && tenancy.is_owner ? (
              <div className="pt-2">
                <Button onClick={handleSettleRefund} size="sm" full disabled={loading}>
                  {loading ? 'Processing...' : 'Settle & Record Refund Payment'}
                </Button>
                <p className="text-[11px] text-muted text-center mt-1">
                  Settling refund completes the final lifecycle and closes the tenancy.
                </p>
              </div>
            ) : refundPayment.status === 'DUE' && !tenancy.is_owner ? (
              <p className="text-[12px] text-muted italic text-center pt-1">
                Awaiting deposit refund settlement from owner.
              </p>
            ) : (
              <p className="text-[12px] text-seal font-medium">
                ✓ Deposit refund of {inr(refundPayment.total_amount)} settled. Tenancy is closed.
              </p>
            )}
          </div>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {/* Action buttons */}
        {canRequestMoveOut ? (
          <div className="pt-2">
            <Button
              onClick={() => setShowNoticeModal(true)}
              variant="secondary"
              size="sm"
              full
            >
              Initiate Move-Out Notice
            </Button>
          </div>
        ) : null}

        {canConfirmNotice ? (
          <div className="pt-2 space-y-2">
            <Button onClick={handleConfirmNotice} size="sm" full disabled={loading}>
              {loading ? 'Confirming...' : 'Confirm Move-Out Notice'}
            </Button>
            <p className="text-[11px] text-muted text-center">
              Confirming notice schedules move-out inspection and locks tenancy term.
            </p>
          </div>
        ) : null}

        {canProposeSettlement ? (
          <div className="pt-2">
            <Button onClick={() => setShowSettlementModal(true)} size="sm" full>
              Propose Deposit Settlement
            </Button>
          </div>
        ) : null}
      </div>

      {/* -------------------- Notice Modal -------------------- */}
      {showNoticeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card border border-line bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-display text-lg font-semibold">Initiate Move-Out Notice</h3>
              <button
                type="button"
                onClick={() => setShowNoticeModal(false)}
                className="text-muted hover:text-ink text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleRequestNotice} className="space-y-4 text-sm">
              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Contractual Notice Period
                </label>
                <input
                  type="text"
                  disabled
                  value={`${defaultNoticeDays} days required by executed agreement`}
                  className="w-full rounded-card border border-line bg-paper px-3 py-2 text-ink text-[13px]"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Requested Move-Out Date *
                </label>
                <input
                  type="date"
                  required
                  min={minDateStr}
                  value={requestedDate}
                  onChange={(e) => setRequestedDate(e.target.value)}
                  className="w-full rounded-card border border-line px-3 py-2 text-ink focus:border-seal focus:outline-none"
                />
                <p className="text-[11px] text-muted mt-1">
                  Must satisfy minimum {defaultNoticeDays}-day contractual notice.
                </p>
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Reason for Move-Out (Optional)
                </label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. relocation, end of lease, job change"
                  className="w-full rounded-card border border-line px-3 py-2 text-ink focus:border-seal focus:outline-none text-[13px]"
                />
              </div>

              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  full
                  onClick={() => setShowNoticeModal(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" full disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Notice'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* -------------------- Settlement Modal -------------------- */}
      {showSettlementModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-card border border-line bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-display text-lg font-semibold">Propose Deposit Settlement</h3>
              <button
                type="button"
                onClick={() => setShowSettlementModal(false)}
                className="text-muted hover:text-ink text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleProposeSettlement} className="space-y-4 text-sm">
              <div className="rounded-card border border-line bg-paper/60 p-3 space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted text-[13px]">Original Deposit:</span>
                  <span className="font-bold text-ink">{inr(tenancy.deposit_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted text-[13px]">Total Deductions:</span>
                  <span className="font-bold text-crimson">- {inr(totalDeductions)}</span>
                </div>
                <div className="flex justify-between border-t border-line pt-1 text-[14px]">
                  <span className="font-semibold text-ink">Final Refund:</span>
                  <span className="font-bold text-seal">{inr(calculatedRefund)}</span>
                </div>
              </div>

              {/* Deductions list */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted mb-2 font-semibold">
                  Itemized Deductions
                </p>
                {deductions.length > 0 ? (
                  <ul className="divide-y divide-line border border-line rounded-card mb-3">
                    {deductions.map((d, idx) => (
                      <li key={idx} className="flex items-center justify-between p-2.5 text-[13px]">
                        <div>
                          <p className="font-medium">{d.description}</p>
                          <p className="text-[11px] text-muted">{titleCase(d.category)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-crimson">- {inr(d.amount)}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveDeduction(idx)}
                            className="text-muted hover:text-crimson text-sm"
                          >
                            ×
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[12px] text-muted italic mb-3">
                    No deductions added. (Leave empty for full refund of {inr(tenancy.deposit_amount)})
                  </p>
                )}

                {/* Add deduction box */}
                <div className="rounded-card border border-line bg-paper/40 p-3 space-y-2">
                  <p className="text-[11px] font-mono uppercase text-muted font-semibold">Add Deduction Item</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-muted mb-1">Category</label>
                      <select
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as any)}
                        className="w-full rounded border border-line px-2 py-1.5 text-[13px]"
                      >
                        <option value="DAMAGE">Property Damage</option>
                        <option value="UNPAID_RENT">Unpaid Rent</option>
                        <option value="MAINTENANCE">Maintenance / Utility</option>
                        <option value="OTHER">Other Agreed Charge</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] text-muted mb-1">Amount (INR)</label>
                      <input
                        type="number"
                        min="0"
                        step="100"
                        value={newAmount || ''}
                        onChange={(e) => setNewAmount(Number(e.target.value))}
                        placeholder="0"
                        className="w-full rounded border border-line px-2 py-1.5 text-[13px]"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-muted mb-1">Description</label>
                    <input
                      type="text"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      placeholder="e.g. Broken bedroom window glass replacement"
                      className="w-full rounded border border-line px-2 py-1.5 text-[13px]"
                    />
                  </div>
                  <Button type="button" variant="secondary" size="sm" onClick={handleAddDeduction} full>
                    + Add Item
                  </Button>
                </div>
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Settlement Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={settlementNotes}
                  onChange={(e) => setSettlementNotes(e.target.value)}
                  placeholder="e.g. Deductions assessed following move-out condition report."
                  className="w-full rounded-card border border-line px-3 py-2 text-ink focus:border-seal focus:outline-none text-[13px]"
                />
              </div>

              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  full
                  onClick={() => setShowSettlementModal(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" full disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Settlement Proposal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* -------------------- Dispute Modal -------------------- */}
      {showDisputeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card border border-line bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-display text-lg font-semibold">Dispute Settlement Proposal</h3>
              <button
                type="button"
                onClick={() => setShowDisputeModal(false)}
                className="text-muted hover:text-ink text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleDisputeSettlement} className="space-y-4 text-sm">
              <p className="text-[13px] text-muted">
                Opening a dispute will pause the settlement and notify the other party and Odibrick operations team to assist with mutual resolution.
              </p>

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Reason for Dispute *
                </label>
                <textarea
                  rows={3}
                  required
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="Explain why you disagree with the proposed deductions or assessment..."
                  className="w-full rounded-card border border-line px-3 py-2 text-ink focus:border-seal focus:outline-none text-[13px]"
                />
              </div>

              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  full
                  onClick={() => setShowDisputeModal(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" full disabled={loading}>
                  {loading ? 'Submitting...' : 'Submit Dispute'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
