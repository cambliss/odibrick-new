'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

/**
 * Accepting is consequential: it creates the tenancy, opens a legal case and
 * pauses the listing. The confirmation step spells that out rather than hiding
 * it behind a one-click button.
 */
export function ApplicationDecision({
  applicationId,
  status,
  tenancyId,
}: {
  applicationId: number;
  status: string;
  tenancyId?: number;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState<'ACCEPT' | 'REJECT' | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (tenancyId) {
    return (
      <Button href={`/dashboard/tenancy/${tenancyId}`} variant="secondary" size="sm">
        Open tenancy
      </Button>
    );
  }

  if (!['SUBMITTED', 'UNDER_REVIEW', 'SHORTLISTED'].includes(status)) return null;

  const decide = async (decision: 'ACCEPT' | 'REJECT' | 'SHORTLIST') => {
    setBusy(true);
    setError(null);
    try {
      await api(`/applications/${applicationId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision, reason: reason || undefined }),
      });
      router.refresh();
      setConfirming(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record the decision.');
    } finally {
      setBusy(false);
    }
  };

  if (confirming === 'ACCEPT') {
    return (
      <div className="w-full max-w-sm rounded-card border border-seal/30 bg-seal-soft/50 p-4">
        <p className="font-medium">Accept this application?</p>
        <p className="mt-1.5 text-[14px] text-muted">
          This creates the tenancy, opens a legal case for the agreement and pauses the listing so no one
          else applies. The other applicants are not rejected automatically.
        </p>
        {error ? <div className="mt-3">{<ErrorNote>{error}</ErrorNote>}</div> : null}
        <div className="mt-4 flex gap-2">
          <Button onClick={() => decide('ACCEPT')} disabled={busy} size="sm">
            {busy ? 'Working…' : 'Yes, accept'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (confirming === 'REJECT') {
    return (
      <div className="w-full max-w-sm rounded-card border border-line p-4">
        <label className="label" htmlFor={`reason-${applicationId}`}>
          Reason (shared with the applicant)
        </label>
        <textarea
          id={`reason-${applicationId}`}
          rows={2}
          className="field"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Already committed to another applicant."
        />
        {error ? <div className="mt-3">{<ErrorNote>{error}</ErrorNote>}</div> : null}
        <div className="mt-3 flex gap-2">
          <Button onClick={() => decide('REJECT')} disabled={busy} size="sm" variant="danger">
            {busy ? 'Working…' : 'Decline'}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setConfirming(null)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setConfirming('ACCEPT')}>
        Accept
      </Button>
      {status !== 'SHORTLISTED' ? (
        <Button size="sm" variant="secondary" onClick={() => decide('SHORTLIST')} disabled={busy}>
          Shortlist
        </Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => setConfirming('REJECT')}>
        Decline
      </Button>
    </div>
  );
}
