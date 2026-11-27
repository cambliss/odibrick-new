'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { inr } from '@/lib/format';
import { loadRazorpayScript, type RazorpayCheckoutOptions } from '@/lib/razorpay';

type Checkout = {
  referenceCode: string;
  amount: number;
  currency: string;
  provider: string;
  custodial: boolean;
  instructions?: string;
  checkout?: {
    key?: string;
    orderId?: string;
    amount?: number;
    currency?: string;
    name?: string;
    description?: string;
    prefill?: {
      email?: string;
      contact?: string;
    };
    theme?: {
      color?: string;
    };
  };
};

export function PayButton({ paymentId, reference }: { paymentId: number; reference: string }) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [mode, setMode] = useState<'razorpay' | 'manual'>('razorpay');

  const openRazorpayModal = async (checkoutData: Checkout) => {
    const isLoaded = await loadRazorpayScript();
    if (!isLoaded || !window.Razorpay) {
      setError('Could not load Razorpay payment gateway. Please use manual bank transfer or try again.');
      setMode('manual');
      return;
    }

    const payload = checkoutData.checkout;
    const razorpayKey = payload?.key || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    const orderId = payload?.orderId;

    if (!orderId) {
      setError('Payment order creation did not return a valid order ID. Switched to manual transfer.');
      setMode('manual');
      return;
    }

    const options: RazorpayCheckoutOptions = {
      key: razorpayKey,
      amount: payload?.amount || Math.round(checkoutData.amount * 100),
      currency: payload?.currency || checkoutData.currency || 'INR',
      name: payload?.name || 'Odibrick Property',
      description: payload?.description || `Payment for ${reference}`,
      order_id: orderId,
      prefill: payload?.prefill,
      theme: payload?.theme || { color: '#1F5D4C' },
      modal: {
        ondismiss: () => {
          setBusy(false);
        },
      },
      handler: async (response) => {
        setBusy(true);
        setError(null);
        try {
          await api(`/payments/${paymentId}/verify-razorpay`, {
            method: 'POST',
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            }),
          });
          setSuccess(true);
          setCheckout(null);
          router.refresh();
        } catch (err) {
          setError(
            err instanceof ApiError
              ? err.message
              : 'Payment verification failed. If money was debited, our ledger will reconcile it shortly.',
          );
        } finally {
          setBusy(false);
        }
      },
    };

    try {
      const rzp = new window.Razorpay(options);
      rzp.on('payment.failed', (resp: any) => {
        setError(resp.error?.description || 'Razorpay payment failed or cancelled by user.');
        setBusy(false);
      });
      rzp.open();
    } catch (err: any) {
      setError(err?.message || 'Failed to open Razorpay checkout.');
      setBusy(false);
    }
  };

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await api<Checkout>(`/payments/${paymentId}/checkout`, { method: 'POST' });
      setCheckout(data);

      // If Razorpay checkout payload is present, trigger modal immediately
      if (data.checkout?.orderId) {
        setMode('razorpay');
        await openRazorpayModal(data);
      } else {
        setMode('manual');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start the payment.');
    } finally {
      setBusy(false);
    }
  };

  const confirmManualPayment = async () => {
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
      <div className="rounded-card border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        Payment Completed
      </div>
    );
  }

  if (checkout) {
    return (
      <div className="w-full max-w-md rounded-card border border-line bg-paper p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            {checkout.referenceCode}
          </p>
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-seal">
            Razorpay Secure
          </span>
        </div>
        <p className="font-display text-xl font-semibold tabular">{inr(checkout.amount)}</p>

        {mode === 'razorpay' ? (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted">
              Pay securely via UPI (Google Pay, PhonePe, Paytm), Cards, NetBanking, or Wallets powered by Razorpay.
            </p>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={() => openRazorpayModal(checkout)} disabled={busy} variant="primary">
                {busy ? 'Opening Razorpay…' : 'Open Razorpay Checkout'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setMode('manual');
                  setError(null);
                }}
                disabled={busy}
              >
                Pay Offline / Manual
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setCheckout(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[13px] leading-relaxed text-muted">
              {checkout.instructions ??
                'Complete the transfer using direct UPI / NetBanking and submit confirmation for operator review.'}
            </p>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
            <div className="flex items-center gap-2 pt-1">
              <Button size="sm" onClick={confirmManualPayment} disabled={busy} variant="primary">
                {busy ? 'Settling…' : 'Confirm Offline Transfer'}
              </Button>
              {checkout.checkout?.orderId ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setMode('razorpay');
                    setError(null);
                  }}
                  disabled={busy}
                >
                  Pay via Razorpay
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" onClick={() => setCheckout(null)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <Button size="sm" onClick={start} disabled={busy} variant="primary" className="flex items-center gap-1.5">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H3V8h18v10zm-10-7H5v2h6v-2z" />
        </svg>
        {busy ? 'Preparing…' : 'Pay with Razorpay'}
      </Button>
      {error ? <div className="mt-2">{<ErrorNote>{error}</ErrorNote>}</div> : null}
    </div>
  );
}
