'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Button, Card, CardHeader, Badge } from '@/components/ui';

interface AdminOverrideCardProps {
  tenancyId: number;
  stage: string;
}

export function AdminOverrideCard({ tenancyId, stage }: AdminOverrideCardProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState<'HOLD' | 'RESUME' | 'CANCEL' | 'FORCE_CLOSE'>('HOLD');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 5) {
      setError('A substantive reason of at least 5 characters is required for administrative actions.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await api(`/tenancies/${tenancyId}/admin-override`, {
        method: 'POST',
        body: JSON.stringify({ action, reason: reason.trim(), notes: notes.trim() || undefined }),
      });
      setIsOpen(false);
      setReason('');
      setNotes('');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Failed to apply administrative action.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-ochre/40 bg-ochre-soft/10">
      <CardHeader
        title="Odibrick Governance & Management Authority"
        note="Administrative intervention controls for authorized platform staff."
        action={
          <Badge tone="ochre">Management Authority</Badge>
        }
      />
      <div className="p-5 space-y-4">
        <p className="text-[14px] text-muted leading-relaxed">
          As platform authority, management may place this tenancy on administrative hold, resume normal operations, or perform emergency closure/cancellation with full audit traceability.
        </p>

        {!isOpen ? (
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAction('HOLD');
                setIsOpen(true);
              }}
            >
              Place on Administrative Hold
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setAction('RESUME');
                setIsOpen(true);
              }}
            >
              Resume Tenancy
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                setAction('FORCE_CLOSE');
                setIsOpen(true);
              }}
            >
              Administrative Final Closure
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4 rounded-card border border-line bg-white p-5 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-display text-base font-semibold text-ink">
                Execute Management Action: <span className="text-seal">{action.replace('_', ' ')}</span>
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs font-mono text-muted hover:text-ink"
              >
                ✕ Cancel
              </button>
            </div>

            {error && (
              <div className="rounded-sm border border-alert/30 bg-alert/10 p-3 text-[13px] text-alert">
                {error}
              </div>
            )}

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1">
                Action Type
              </label>
              <select
                value={action}
                onChange={(e: any) => setAction(e.target.value)}
                className="w-full rounded-card border border-line bg-white px-3 py-2 text-sm focus:border-seal focus:outline-none"
              >
                <option value="HOLD">HOLD — Place on Administrative Hold</option>
                <option value="RESUME">RESUME — Clear Hold and Resume Lifecycle</option>
                <option value="CANCEL">CANCEL — Cancel Tenancy Contract</option>
                <option value="FORCE_CLOSE">FORCE_CLOSE — Final Administrative Closure</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1">
                Mandatory Regulatory / Administrative Reason *
              </label>
              <textarea
                required
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the official justification, regulatory basis, or ticket reference..."
                className="w-full rounded-card border border-line p-3 text-sm focus:border-seal focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-muted mb-1">
                Internal Case Notes (Optional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional internal legal/audit notes"
                className="w-full rounded-card border border-line px-3 py-2 text-sm focus:border-seal focus:outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="secondary" size="sm" type="button" onClick={() => setIsOpen(false)}>
                Cancel
              </Button>
              <Button variant={action === 'FORCE_CLOSE' || action === 'CANCEL' ? 'danger' : 'primary'} size="sm" type="submit" disabled={loading}>
                {loading ? 'Recording Action...' : 'Confirm Management Action'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Card>
  );
}
