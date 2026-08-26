'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

type Props = {
  propertyId: number;
  slug: string;
  signedIn: boolean;
  isOwnListing: boolean;
  listingActive: boolean;
};

export function PropertyActions({ propertyId, slug, signedIn, listingActive }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'enquiry' | 'apply'>('idle');
  const [message, setMessage] = useState('');
  const [moveIn, setMoveIn] = useState('');
  const [occupants, setOccupants] = useState('2');
  const [tenure, setTenure] = useState('11');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (!listingActive) {
    return (
      <p className="rounded-card border border-line bg-paper px-3 py-3 text-[14px] text-muted">
        This listing is not accepting enquiries right now.
      </p>
    );
  }

  if (!signedIn) {
    return (
      <div className="space-y-2">
        <Button href={`/login?next=/${slug}`} full>
          Sign in to start
        </Button>
        <Button href={`/register?role=TENANT&next=/${slug}`} variant="secondary" full>
          Create a tenant account
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-card border border-seal/25 bg-seal-soft px-4 py-4">
        <p className="font-medium text-seal-deep">{done}</p>
        <Button href="/dashboard/applications" variant="ghost" size="sm" className="mt-2 px-0">
          Track it in your dashboard →
        </Button>
      </div>
    );
  }

  const submitEnquiry = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/enquiries', {
        method: 'POST',
        body: JSON.stringify({ propertyId, message: message || undefined, source: 'PROPERTY_PAGE' }),
      });
      setDone('Enquiry sent. The lister has been notified.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the enquiry. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const submitApplication = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/applications', {
        method: 'POST',
        body: JSON.stringify({
          propertyId,
          occupants: Number(occupants) || undefined,
          moveInDate: moveIn || undefined,
          tenureMonths: Number(tenure) || undefined,
          message: message || undefined,
        }),
      });
      setDone('Application submitted. You will hear back from the owner.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the application. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'idle') {
    return (
      <div className="space-y-2">
        <Button onClick={() => setMode('apply')} full>
          Start rental process
        </Button>
        <Button onClick={() => setMode('enquiry')} variant="secondary" full>
          Ask a question first
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mode === 'apply' ? (
        <>
          <div>
            <label className="label" htmlFor="moveIn">
              Preferred move-in date
            </label>
            <input
              id="moveIn"
              type="date"
              value={moveIn}
              onChange={(event) => setMoveIn(event.target.value)}
              className="field"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="occupants">
                Occupants
              </label>
              <input
                id="occupants"
                type="number"
                min={1}
                value={occupants}
                onChange={(event) => setOccupants(event.target.value)}
                className="field"
              />
            </div>
            <div>
              <label className="label" htmlFor="tenure">
                Months
              </label>
              <input
                id="tenure"
                type="number"
                min={1}
                value={tenure}
                onChange={(event) => setTenure(event.target.value)}
                className="field"
              />
            </div>
          </div>
        </>
      ) : null}

      <div>
        <label className="label" htmlFor="message">
          {mode === 'apply' ? 'Anything the owner should know' : 'Your question'}
        </label>
        <textarea
          id="message"
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="field"
          placeholder={mode === 'apply' ? 'Working couple, no pets, looking for a long stay.' : 'Is the deposit negotiable?'}
        />
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <div className="flex gap-2">
        <Button
          onClick={mode === 'apply' ? submitApplication : submitEnquiry}
          disabled={busy}
          full
        >
          {busy ? 'Sending…' : mode === 'apply' ? 'Submit application' : 'Send enquiry'}
        </Button>
        <Button variant="secondary" onClick={() => setMode('idle')}>
          Cancel
        </Button>
      </div>

      {mode === 'apply' ? (
        <p className="text-[13px] text-muted">
          Applying needs a verified identity. If yours is not verified yet we will take you there first.
        </p>
      ) : null}
    </div>
  );
}
