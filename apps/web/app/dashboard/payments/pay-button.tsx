'use client';

import { useState } from 'react';
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
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  if (checkout) {
    return (
      <div className="w-full max-w-md rounded-card border border-line bg-paper p-4">
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
          {checkout.referenceCode}
        </p>
        <p className="mt-1 font-display text-xl font-semibold tabular">{inr(checkout.amount)}</p>
        {/* When no gateway is configured the honest answer is instructions, not
            a fake success screen. */}
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          {checkout.instructions ??
            'Complete the payment in the provider window. This page updates once the provider confirms it.'}
        </p>
        <p className="mt-3 text-[13px] text-muted">
          Odibrick marks this paid only when the credit is confirmed — never on your say-so alone.
        </p>
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
