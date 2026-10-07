'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { inr } from '@/lib/format';

type Checkout = {
  referenceCode: string;
  amount: number;
  currency: string;
  provider: string;
  custodial: boolean;
  instructions?: string;
};

export function PayButton({ paymentId, reference }: { paymentId: number; reference: string }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      setCheckout(await api<Checkout>(`/payments/${paymentId}/checkout`, { method: 'POST' }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the payment.');
    } finally {
      setBusy(false);
    }
  };

  const confirmPayment = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/payments/${paymentId}/pay`, {
        method: 'POST',
        body: JSON.stringify({ method: 'UPI', reference: `UPI-${reference}` }),
      });
      setSuccess(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Payment settlement failed.');
    } finally {
      setBusy(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-card border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800">
        ✓ Payment Completed
      </div>
    );
  }

  if (checkout) {
    return (
      <div className="w-full max-w-md rounded-card border border-line bg-paper p-4 space-y-3">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          {checkout.referenceCode}
        </p>
        <p className="font-display text-xl font-semibold tabular">{inr(checkout.amount)}</p>
        <p className="text-[13px] leading-relaxed text-muted">
          {checkout.instructions ??
            'Complete the transfer using UPI / NetBanking and confirm settlement below.'}
        </p>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={confirmPayment} disabled={busy} variant="primary">
            {busy ? 'Settling…' : 'Confirm & Complete Transfer'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCheckout(null)} disabled={busy}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Button size="sm" onClick={start} disabled={busy}>
        {busy ? 'Preparing…' : 'Pay now'}
      </Button>
      {error ? <div className="mt-2">{<ErrorNote>{error}</ErrorNote>}</div> : null}
    </div>
  );
}
