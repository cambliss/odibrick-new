'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';

type TenancyOption = {
  id: number;
  property_title: string;
  locality?: string;
  city?: string;
  stage: string;
  counterparty_name?: string;
};

const CATEGORIES = [
  { value: 'DEPOSIT', label: 'Security Deposit (Deductions, delay, refund dispute)' },
  { value: 'PROPERTY_DAMAGE', label: 'Property Damage (Fixtures, structural, wall damage)' },
  { value: 'MAINTENANCE', label: 'Maintenance & Repairs (Unresolved issues, cost sharing)' },
  { value: 'PAYMENT', label: 'Rent / Dues Payment (Late payments, incorrect amount)' },
  { value: 'AGREEMENT', label: 'Agreement & Terms (Clause interpretation, breach of terms)' },
  { value: 'NOTICE_PERIOD', label: 'Notice Period & Move-Out (Premature termination, notice disputes)' },
  { value: 'ACCESS', label: 'Property Access & Inspection (Unauthorized entry, refusal of access)' },
  { value: 'OTHER', label: 'Other Conflict / Operational Dispute' },
];

const EVIDENCE_TYPES = [
  { value: 'DOCUMENT', label: 'Document / Agreement File' },
  { value: 'INSPECTION_REPORT', label: 'Inspection / Condition Report' },
  { value: 'PAYMENT_RECORD', label: 'Payment Receipt / Bank Record' },
  { value: 'PHOTO', label: 'Photograph' },
  { value: 'VIDEO', label: 'Video Recording' },
  { value: 'MESSAGE', label: 'Written Communication / Message' },
  { value: 'OTHER', label: 'Other Supporting Evidence' },
];

export function CreateDisputeForm({
  tenancies,
  initialTenancyId,
}: {
  tenancies: TenancyOption[];
  initialTenancyId?: number;
}) {
  const router = useRouter();

  const defaultTenancyId = initialTenancyId || (tenancies.length > 0 ? tenancies[0].id : undefined);

  const [tenancyId, setTenancyId] = useState<number | undefined>(defaultTenancyId);
  const [category, setCategory] = useState<string>('DEPOSIT');
  const [amountClaimed, setAmountClaimed] = useState<string>('');
  const [summary, setSummary] = useState<string>('');
  const [detail, setDetail] = useState<string>('');
  
  // Optional initial evidence
  const [includeEvidence, setIncludeEvidence] = useState<boolean>(false);
  const [evidenceType, setEvidenceType] = useState<string>('DOCUMENT');
  const [evidenceDesc, setEvidenceDesc] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const selectedTenancy = tenancies.find((t) => t.id === Number(tenancyId));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenancyId) {
      setError('Please select a tenancy for this dispute.');
      return;
    }
    if (!summary.trim()) {
      setError('Please provide a concise dispute summary.');
      return;
    }
    if (!detail.trim()) {
      setError('Please provide a detailed description of the dispute facts and context.');
      return;
    }
    if (amountClaimed && (isNaN(Number(amountClaimed)) || Number(amountClaimed) < 0)) {
      setError('Claim amount must be a valid non-negative number.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const payload: any = {
        tenancyId: Number(tenancyId),
        category,
        amountClaimed: amountClaimed ? Number(amountClaimed) : undefined,
        summary: summary.trim(),
        detail: detail.trim(),
      };

      if (includeEvidence && evidenceDesc.trim()) {
        payload.initialEvidence = {
          evidenceType,
          description: evidenceDesc.trim(),
        };
      }

      const res = await fetch('/api/disputes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit dispute.');
      }

      router.push(`/dashboard/disputes/${data.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Something went wrong while submitting.');
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-card border border-alert/30 bg-alert/10 p-4 text-[14px] text-alert">
          {error}
        </div>
      )}

      {/* Tenancy Selector */}
      <div className="space-y-2">
        <label htmlFor="tenancyId" className="block text-[13px] font-medium text-ink">
          Associated Tenancy <span className="text-alert">*</span>
        </label>
        {tenancies.length > 0 ? (
          <select
            id="tenancyId"
            value={tenancyId || ''}
            onChange={(e) => setTenancyId(Number(e.target.value))}
            className="w-full rounded-card border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink focus:border-seal focus:outline-none"
            required
          >
            {tenancies.map((t) => (
              <option key={t.id} value={t.id}>
                #{t.id} — {t.property_title} ({t.city || 'Property'}) [{t.stage}]
              </option>
            ))}
          </select>
        ) : (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-card text-xs text-amber-800">
            No active tenancies found. If you have a specific tenancy ID, please provide it below:
            <input
              type="number"
              value={tenancyId || ''}
              onChange={(e) => setTenancyId(Number(e.target.value))}
              placeholder="Tenancy ID"
              className="mt-2 w-full rounded-card border border-line bg-white px-3 py-1.5 text-xs text-ink"
            />
          </div>
        )}
        {selectedTenancy && (
          <p className="text-xs text-muted">
            Property: <span className="text-ink font-medium">{selectedTenancy.property_title}</span>
            {selectedTenancy.counterparty_name && (
              <span> · Counterparty: <span className="text-ink font-medium">{selectedTenancy.counterparty_name}</span></span>
            )}
            <span> · Stage: <span className="font-mono">{selectedTenancy.stage}</span></span>
          </p>
        )}
      </div>

      {/* Category */}
      <div className="space-y-2">
        <label htmlFor="category" className="block text-[13px] font-medium text-ink">
          Dispute Category <span className="text-alert">*</span>
        </label>
        <select
          id="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-card border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink focus:border-seal focus:outline-none"
          required
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Financial Claim Amount */}
      <div className="space-y-2">
        <label htmlFor="amountClaimed" className="block text-[13px] font-medium text-ink">
          Claimed Financial Amount (INR) <span className="text-xs text-muted font-normal">(Optional)</span>
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-2.5 text-[14px] text-muted font-mono">₹</span>
          <input
            id="amountClaimed"
            type="number"
            min="0"
            step="1"
            value={amountClaimed}
            onChange={(e) => setAmountClaimed(e.target.value)}
            placeholder="e.g. 25000 (leave blank if non-monetary dispute)"
            className="w-full rounded-card border border-line bg-white pl-8 pr-3.5 py-2.5 text-[14px] text-ink focus:border-seal focus:outline-none"
          />
        </div>
        <p className="text-xs text-muted">
          Specify the total monetary compensation, disputed deduction, or refund amount being claimed.
        </p>
      </div>

      {/* Summary */}
      <div className="space-y-2">
        <label htmlFor="summary" className="block text-[13px] font-medium text-ink">
          Dispute Summary <span className="text-alert">*</span>
        </label>
        <input
          id="summary"
          type="text"
          maxLength={500}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Brief summary of the issue (e.g. Security deposit deduction of ₹15,000 for pre-existing wall paint wear)"
          className="w-full rounded-card border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink focus:border-seal focus:outline-none"
          required
        />
        <div className="flex justify-between text-xs text-muted">
          <span>Be clear, concise, and objective.</span>
          <span>{summary.length}/500</span>
        </div>
      </div>

      {/* Detail */}
      <div className="space-y-2">
        <label htmlFor="detail" className="block text-[13px] font-medium text-ink">
          Detailed Statement of Facts & Context <span className="text-alert">*</span>
        </label>
        <textarea
          id="detail"
          rows={5}
          maxLength={6000}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Provide complete chronology: dates, previous communications, key events, and the specific resolution or remedy you are requesting from Odibrick Management."
          className="w-full rounded-card border border-line bg-white px-3.5 py-2.5 text-[14px] text-ink focus:border-seal focus:outline-none"
          required
        />
        <div className="flex justify-between text-xs text-muted">
          <span>Include all relevant context for the reviewer.</span>
          <span>{detail.length}/6000</span>
        </div>
      </div>

      {/* Initial Evidence Toggle */}
      <div className="border border-line rounded-card p-4 bg-paper/30 space-y-3">
        <label className="flex items-center gap-2 cursor-pointer text-[14px] font-medium text-ink">
          <input
            type="checkbox"
            checked={includeEvidence}
            onChange={(e) => setIncludeEvidence(e.target.checked)}
            className="rounded text-seal focus:ring-seal"
          />
          <span>Attach Initial Supporting Evidence</span>
        </label>
        
        {includeEvidence && (
          <div className="space-y-3 pt-2 border-t border-line">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Evidence Type</label>
              <select
                value={evidenceType}
                onChange={(e) => setEvidenceType(e.target.value)}
                className="w-full rounded-card border border-line bg-white px-3 py-2 text-xs text-ink focus:border-seal focus:outline-none"
              >
                {EVIDENCE_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Evidence Description & Reference</label>
              <textarea
                rows={2}
                maxLength={500}
                value={evidenceDesc}
                onChange={(e) => setEvidenceDesc(e.target.value)}
                placeholder="Describe this evidence item (e.g. Move-in condition report page 3 showing pre-existing paint scuffs)"
                className="w-full rounded-card border border-line bg-white px-3 py-2 text-xs text-ink focus:border-seal focus:outline-none"
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.back()}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Raising Dispute...' : 'Submit Dispute'}
        </Button>
      </div>
    </form>
  );
}
