'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export function AcknowledgeReport({ inspectionId }: { inspectionId: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<'idle' | 'dispute'>('idle');
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const decide = async (decision: 'ACKNOWLEDGE' | 'DISPUTE') => {
    setBusy(true);
    setError(null);
    try {
      await api(`/inspections/${inspectionId}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ decision, comments: comments || undefined }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record your response.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-card border border-ochre/40 bg-ochre-soft p-5">
      <p className="font-display text-lg font-semibold">This report is waiting for your response</p>
      <p className="mt-1 max-w-2xl text-[15px] text-muted">
        Read through it carefully. Once both parties acknowledge, it becomes the agreed record of the
        property&rsquo;s condition. If something is wrong or missing, say so now rather than later.
      </p>

      {mode === 'dispute' ? (
        <div className="mt-4 max-w-xl">
          <label className="label" htmlFor="comments">
            What do you disagree with?
          </label>
          <textarea
            id="comments"
            rows={3}
            className="field"
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            placeholder="The bathroom tiles were already cracked when the tenant moved in — see photo 4."
          />
        </div>
      ) : null}

      {error ? <div className="mt-4">{<ErrorNote>{error}</ErrorNote>}</div> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {mode === 'idle' ? (
          <>
            <Button onClick={() => decide('ACKNOWLEDGE')} disabled={busy}>
              {busy ? 'Recording…' : 'I agree with this record'}
            </Button>
            <Button variant="secondary" onClick={() => setMode('dispute')}>
              Something is wrong
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" onClick={() => decide('DISPUTE')} disabled={busy || !comments}>
              {busy ? 'Recording…' : 'Flag a disagreement'}
            </Button>
            <Button variant="secondary" onClick={() => setMode('idle')}>
              Cancel
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
