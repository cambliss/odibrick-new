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
  { value: 'PLUMBING', label: 'Plumbing (leaks, pipes, faucets, drainage)' },
  { value: 'ELECTRICAL', label: 'Electrical (wiring, fixtures, switches, power)' },
  { value: 'APPLIANCE', label: 'Appliance (geyser, refrigerator, washing machine)' },
  { value: 'LEAKAGE', label: 'Seepage & Water Leakage' },
  { value: 'AC', label: 'Air Conditioning / HVAC' },
  { value: 'STRUCTURAL', label: 'Structural (doors, windows, ceiling, flooring)' },
  { value: 'CARPENTRY', label: 'Carpentry & Furniture' },
  { value: 'PEST', label: 'Pest Control' },
  { value: 'PAINTING', label: 'Painting & Touch-up' },
  { value: 'OTHER', label: 'Other Repair / General Maintenance' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low — minor inconvenience, non-urgent' },
  { value: 'NORMAL', label: 'Normal — standard repair request' },
  { value: 'HIGH', label: 'High — impacting daily living or potential damage' },
  { value: 'EMERGENCY', label: 'Emergency — urgent safety hazard or active flooding' },
];

export function ReportIssueForm({
  tenancies,
  initialTenancyId,
}: {
  tenancies: TenancyOption[];
  initialTenancyId?: number;
}) {
  const router = useRouter();

  const activeTenancies = tenancies.filter((t) => t.stage === 'ACTIVE');
  const defaultTenancyId = initialTenancyId || (activeTenancies.length > 0 ? activeTenancies[0].id : undefined);

  const [tenancyId, setTenancyId] = useState<number | undefined>(defaultTenancyId);
  const [category, setCategory] = useState<string>('PLUMBING');
  const [priority, setPriority] = useState<string>('NORMAL');
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenancyId) {
      setError('Please select an active tenancy for this maintenance request.');
      return;
    }
    if (!title.trim()) {
      setError('Please provide a brief title describing the issue.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenancyId: Number(tenancyId),
          category,
          priority,
          title: title.trim(),
          description: description.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to submit maintenance request.');
      }

      router.push(`/dashboard/maintenance/${data.id}`);
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Something went wrong while submitting.');
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-card border border-crimson/30 bg-crimson-soft/40 p-4 text-[14px] text-crimson-deep">
          {error}
        </div>
      )}

      {/* Tenancy selection */}
      <div>
        <label htmlFor="tenancy-select" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
          Property / Tenancy <span className="text-crimson">*</span>
        </label>
        {activeTenancies.length > 1 ? (
          <select
            id="tenancy-select"
            value={tenancyId ?? ''}
            onChange={(e) => setTenancyId(Number(e.target.value))}
            className="w-full rounded-card border border-line bg-white px-3 py-2 text-[14px] text-ink focus:border-seal focus:outline-none"
            required
          >
            {activeTenancies.map((t) => (
              <option key={t.id} value={t.id}>
                {t.property_title} {t.locality ? `(${t.locality}, ${t.city})` : ''}
              </option>
            ))}
          </select>
        ) : activeTenancies.length === 1 ? (
          <div className="rounded-card border border-line bg-sand-light/50 px-3 py-2 text-[14px] text-ink font-medium">
            {activeTenancies[0].property_title} {activeTenancies[0].locality ? `(${activeTenancies[0].locality}, ${activeTenancies[0].city})` : ''}
          </div>
        ) : (
          <div className="rounded-card border border-ochre/30 bg-ochre-soft/30 p-3 text-[13px] text-ochre-deep">
            No active tenancies found. Maintenance requests can only be raised for active rental tenancies.
          </div>
        )}
      </div>

      {/* Category */}
      <div>
        <label htmlFor="category-select" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
          Issue Category <span className="text-crimson">*</span>
        </label>
        <select
          id="category-select"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full rounded-card border border-line bg-white px-3 py-2 text-[14px] text-ink focus:border-seal focus:outline-none"
          required
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div>
        <label htmlFor="priority-select" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
          Urgency / Priority <span className="text-crimson">*</span>
        </label>
        <select
          id="priority-select"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          className="w-full rounded-card border border-line bg-white px-3 py-2 text-[14px] text-ink focus:border-seal focus:outline-none"
          required
        >
          {PRIORITIES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Title */}
      <div>
        <label htmlFor="title-input" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
          Summary / Title <span className="text-crimson">*</span>
        </label>
        <input
          id="title-input"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Kitchen sink leaking continuously from pipe connection"
          className="w-full rounded-card border border-line bg-white px-3 py-2 text-[14px] text-ink focus:border-seal focus:outline-none"
          required
          maxLength={190}
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description-input" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
          Detailed Description
        </label>
        <textarea
          id="description-input"
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe the issue in detail, including specific location in the property, when it started, and any immediate impact..."
          className="w-full rounded-card border border-line bg-white px-3 py-2 text-[14px] text-ink focus:border-seal focus:outline-none"
          maxLength={4000}
        />
        <p className="mt-1 text-[12px] text-muted">
          Describe the issue as accurately as possible. The property owner will be notified to review and coordinate the repair.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
        <Button href="/dashboard/maintenance" variant="ghost" type="button">
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !activeTenancies.length}>
          {isSubmitting ? 'Submitting request...' : 'Submit maintenance request'}
        </Button>
      </div>
    </form>
  );
}
