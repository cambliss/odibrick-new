'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, Card, CardHeader, DataRow, ErrorNote, StatusChip } from '@/components/ui';
import { inr, shortDate } from '@/lib/format';

type RenewalCardProps = {
  tenancy: {
    id: number;
    stage: string;
    rent_amount: number;
    start_date?: string;
    end_date?: string;
    renewal_due_on?: string;
    is_owner: boolean;
    owner_name: string;
    tenant_name: string;
  };
  agreement?: {
    id: number;
    agreement_number: string;
    agreement_type?: string;
    status: string;
    effective_from?: string;
    effective_to?: string;
  } | null;
  agreements?: Array<{
    id: number;
    agreement_number: string;
    agreement_type?: string;
    status: string;
    effective_from?: string;
    effective_to?: string;
  }>;
  legalCase?: {
    id: number;
    case_number: string;
    case_type?: string;
    status: string;
  } | null;
  legalCases?: Array<{
    id: number;
    case_number: string;
    case_type?: string;
    status: string;
  }>;
  renewalProposal?: {
    proposedRent?: number;
    proposedStartDate?: string;
    proposedEndDate?: string;
    tenureMonths?: number;
    proposedBy?: number;
    proposerRole?: string;
    notes?: string;
    proposedAt?: string;
  } | null;
};

export function RenewalCard({
  tenancy,
  agreement,
  agreements = [],
  legalCase,
  legalCases = [],
  renewalProposal,
}: RenewalCardProps) {
  const router = useRouter();
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [proposedRent, setProposedRent] = useState<number>(Number(tenancy.rent_amount));
  const [tenureMonths, setTenureMonths] = useState<number>(11);
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const renewalCase = legalCases.find((lc) => lc.case_type === 'RENEWAL') ?? (legalCase?.case_type === 'RENEWAL' ? legalCase : null);
  const renewalAgreement = agreements.find((a) => a.agreement_type === 'RENEWAL') ?? (agreement?.agreement_type === 'RENEWAL' ? agreement : null);

  const isEligibleStage = ['ACTIVE', 'RENEWAL_DUE'].includes(tenancy.stage);
  const isPreActive = !isEligibleStage && !['MOVE_OUT', 'CLOSED'].includes(tenancy.stage);
  const isTerminated = ['MOVE_OUT', 'CLOSED'].includes(tenancy.stage);

  const isProposer = (tenancy.is_owner && renewalProposal?.proposerRole === 'OWNER') ||
    (!tenancy.is_owner && renewalProposal?.proposerRole === 'TENANT');

  const canPropose = isEligibleStage && !renewalCase && !renewalProposal;
  const canConfirm = isEligibleStage && !renewalCase && renewalProposal && !isProposer;

  async function handlePropose(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api(`/tenancies/${tenancy.id}/renew`, {
        method: 'POST',
        body: JSON.stringify({
          proposedRent,
          tenureMonths,
          notes: notes.trim() || undefined,
        }),
      });
      setShowProposeModal(false);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to submit renewal proposal.');
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    try {
      await api(`/tenancies/${tenancy.id}/renew/confirm`, {
        method: 'POST',
        body: JSON.stringify({ notes: 'Renewal terms confirmed by ' + (tenancy.is_owner ? 'Owner' : 'Tenant') }),
      });
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError(err.message);
      else setError('Failed to confirm renewal terms.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <div>
          <p className="eyebrow">Lease Renewal</p>
          <h3 className="font-display text-lg font-semibold mt-0.5">
            {renewalAgreement
              ? 'Renewal Status'
              : renewalCase
              ? 'Renewal in Progress'
              : isEligibleStage
              ? 'Renewal Status'
              : isTerminated
              ? 'Not Available'
              : 'Not Available Yet'}
          </h3>
        </div>
        {renewalAgreement ? (
          <StatusChip status={renewalAgreement.status} />
        ) : renewalCase ? (
          <StatusChip status={renewalCase.status} />
        ) : tenancy.stage === 'RENEWAL_DUE' ? (
          <StatusChip status="RENEWAL_DUE" />
        ) : isEligibleStage ? (
          <StatusChip status="ACTIVE" />
        ) : (
          <StatusChip status="NOT_AVAILABLE" />
        )}
      </div>

      <div className="mt-4 space-y-3 text-sm">
        {isPreActive ? (
          <div className="rounded-card border border-line bg-paper/50 p-4 space-y-1">
            <p className="text-[13px] text-ink">
              Renewal becomes available after the tenancy is active.
            </p>
          </div>
        ) : isTerminated ? (
          <div className="rounded-card border border-line bg-paper/50 p-4 space-y-1">
            <p className="text-[13px] text-muted">
              Renewal is not available for tenancies in move-out or closed stage.
            </p>
          </div>
        ) : (
          <>
            <DataRow label="Current Rent" value={`${inr(tenancy.rent_amount)}/month`} />
            <DataRow label="Current Term End" value={shortDate(tenancy.end_date || tenancy.renewal_due_on)} />
          </>
        )}

        {renewalProposal ? (
          <div className="mt-4 rounded-card border border-line bg-paper/50 p-4 space-y-2">
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted font-semibold">
              Proposed Renewal Terms
            </p>
            <div className="grid grid-cols-2 gap-2 text-[13px]">
              <div>
                <span className="text-muted">Proposed Rent: </span>
                <span className="font-semibold text-ink">{inr(renewalProposal.proposedRent ?? tenancy.rent_amount)}/mo</span>
              </div>
              <div>
                <span className="text-muted">Proposed By: </span>
                <span className="font-semibold text-ink">{renewalProposal.proposerRole}</span>
              </div>
              <div>
                <span className="text-muted">Start Date: </span>
                <span className="font-medium text-ink">{shortDate(renewalProposal.proposedStartDate)}</span>
              </div>
              <div>
                <span className="text-muted">End Date: </span>
                <span className="font-medium text-ink">{shortDate(renewalProposal.proposedEndDate)}</span>
              </div>
            </div>
            {renewalProposal.notes ? (
              <p className="text-[12px] text-muted italic mt-1">Note: {renewalProposal.notes}</p>
            ) : null}
          </div>
        ) : null}

        {renewalCase ? (
          <div className="mt-4 rounded-card border border-ochre/30 bg-ochre-soft p-4 space-y-1">
            <p className="font-mono text-[11px] uppercase tracking-wider text-ochre font-semibold">
              Legal Case: {renewalCase.case_number}
            </p>
            <p className="text-[13px] text-ink">
              Renewal legal case is <strong>{renewalCase.status.replace(/_/g, ' ')}</strong>. Our legal team is preparing the renewal agreement.
            </p>
          </div>
        ) : null}

        {renewalAgreement ? (
          <div className="mt-4 rounded-card border border-seal/30 bg-seal-soft p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-wider text-seal font-semibold">
                Renewal Agreement: {renewalAgreement.agreement_number}
              </p>
              <StatusChip status={renewalAgreement.status} />
            </div>
            <p className="text-[13px] text-ink">
              {renewalAgreement.status === 'EXECUTED'
                ? 'Renewal agreement has been executed by both parties. Tenancy continues seamlessly.'
                : 'Renewal agreement drafted. Review and sign to complete renewal.'}
            </p>
            {renewalAgreement.status === 'AWAITING_SIGNATURES' ? (
              <Button href={`/dashboard/agreements/${renewalAgreement.id}`} size="sm" full className="mt-2">
                Review & Sign Renewal Agreement
              </Button>
            ) : (
              <Button href={`/dashboard/agreements/${renewalAgreement.id}`} variant="secondary" size="sm" full className="mt-2">
                Open Renewal Agreement
              </Button>
            )}
          </div>
        ) : null}

        {error ? <ErrorNote>{error}</ErrorNote> : null}

        {canPropose ? (
          <div className="pt-2">
            <Button
              onClick={() => setShowProposeModal(true)}
              variant="secondary"
              size="sm"
              full
            >
              Propose Lease Renewal
            </Button>
          </div>
        ) : null}

        {canConfirm ? (
          <div className="pt-2 space-y-2">
            <Button
              onClick={handleConfirm}
              size="sm"
              full
              disabled={loading}
            >
              {loading ? 'Confirming...' : 'Confirm Renewal Terms'}
            </Button>
            <p className="text-[11px] text-muted text-center">
              Confirming terms will open a Legal Case to draft the renewal agreement.
            </p>
          </div>
        ) : null}

        {renewalProposal && isProposer && !renewalCase ? (
          <p className="text-[12px] text-muted text-center italic pt-2">
            Awaiting confirmation from the other party.
          </p>
        ) : null}
      </div>

      {showProposeModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card border border-line bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-display text-lg font-semibold">Propose Lease Renewal</h3>
              <button
                type="button"
                onClick={() => setShowProposeModal(false)}
                className="text-muted hover:text-ink text-xl leading-none"
              >
                ×
              </button>
            </div>

            <form onSubmit={handlePropose} className="space-y-4 text-sm">
              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Current Rent
                </label>
                <input
                  type="text"
                  disabled
                  value={`${inr(tenancy.rent_amount)} / month`}
                  className="w-full rounded-card border border-line bg-paper px-3 py-2 text-ink"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Proposed Monthly Rent (INR) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  step="100"
                  value={proposedRent}
                  onChange={(e) => setProposedRent(Number(e.target.value))}
                  className="w-full rounded-card border border-line px-3 py-2 text-ink focus:border-seal focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Renewal Tenure (Months) *
                </label>
                <select
                  value={tenureMonths}
                  onChange={(e) => setTenureMonths(Number(e.target.value))}
                  className="w-full rounded-card border border-line px-3 py-2 text-ink focus:border-seal focus:outline-none"
                >
                  <option value={11}>11 Months (Standard)</option>
                  <option value={12}>12 Months (1 Year)</option>
                  <option value={24}>24 Months (2 Years)</option>
                  <option value={36}>36 Months (3 Years)</option>
                  <option value={6}>6 Months</option>
                </select>
              </div>

              <div>
                <label className="block font-mono text-[11px] uppercase tracking-wider text-muted mb-1">
                  Special Notes / Proposed Changes
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. standard renewal with updated rent"
                  className="w-full rounded-card border border-line px-3 py-2 text-ink focus:border-seal focus:outline-none text-[13px]"
                />
              </div>

              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <div className="flex gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  full
                  onClick={() => setShowProposeModal(false)}
                  disabled={loading}
                >
                  Cancel
                </Button>
                <Button type="submit" full disabled={loading}>
                  {loading ? 'Submitting...' : 'Send Proposal'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
