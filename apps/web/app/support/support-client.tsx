'use client';

import { useState } from 'react';
import { Button, Card, CardHeader } from '@/components/ui';

export function SupportClient() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [category, setCategory] = useState('ACCOUNT_ACCESS');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !message) {
      setError('Please provide your email address and a description of your issue.');
      return;
    }

    setSubmitting(true);
    setError(null);

    // Simulate reliable support intake
    setTimeout(() => {
      setSubmitting(false);
      setSubmitted(true);
    }, 600);
  }

  if (submitted) {
    return (
      <Card className="p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-xl text-emerald-800">
          ✓
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold text-seal">Support Ticket Received</h2>
        <p className="mt-2 text-sm text-muted">
          Thank you, <span className="font-medium text-seal">{name || email}</span>. A support specialist from
          Cambliss Pvt. Ltd. will review your request and respond to{' '}
          <span className="font-mono text-seal">{email}</span> within 4 business hours.
        </p>
        <p className="mt-4 font-mono text-xs text-muted">
          Ticket Reference: <span className="font-semibold text-seal">ODB-SUP-2026-849201</span>
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="secondary" onClick={() => setSubmitted(false)}>
            Submit another inquiry
          </Button>
          <Button href="/dashboard">Return to Dashboard</Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 md:p-8">
      <CardHeader
        title="Submit a Support Request"
        note="For account recovery, payment verification, lease queries, or platform issues."
      />

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        {error && (
          <div id="support-error" className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-800" role="alert" aria-live="assertive">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="support-name" className="block text-xs font-medium text-seal">
              Your Name
            </label>
            <input
              id="support-name"
              type="text"
              value={name}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
              placeholder="e.g. Shalini Menon"
              className="mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm text-seal focus:border-seal focus:outline-none focus-visible:ring-2 focus-visible:ring-seal/30"
            />
          </div>

          <div>
            <label htmlFor="support-email" className="block text-xs font-medium text-seal">
              Email Address *
            </label>
            <input
              id="support-email"
              type="email"
              required
              aria-invalid={!!error}
              aria-describedby={error ? 'support-error' : undefined}
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm text-seal focus:border-seal focus:outline-none focus-visible:ring-2 focus-visible:ring-seal/30"
            />
          </div>
        </div>

        <div>
          <label htmlFor="support-category" className="block text-xs font-medium text-seal">
            Issue Category
          </label>
          <select
            id="support-category"
            value={category}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCategory(e.target.value)}
            className="mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm text-seal focus:border-seal focus:outline-none focus-visible:ring-2 focus-visible:ring-seal/30"
          >
            <option value="ACCOUNT_ACCESS">Password Reset & Account Access</option>
            <option value="PAYMENT_BILLING">Rent Payment, Deposit or Refund</option>
            <option value="LEGAL_AGREEMENT">Lease Drafting & Digital Signature</option>
            <option value="MAINTENANCE_INSPECTION">Move-in/Move-out Inspection or Maintenance</option>
            <option value="DISPUTE_RESOLUTION">Tenancy Dispute or Settlement</option>
            <option value="OTHER">General Platform Assistance</option>
          </select>
        </div>

        <div>
          <label htmlFor="support-message" className="block text-xs font-medium text-seal">
            Detailed Description *
          </label>
          <textarea
            id="support-message"
            required
            rows={5}
            aria-invalid={!!error}
            aria-describedby={error ? 'support-error' : undefined}
            value={message}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setMessage(e.target.value)}
            placeholder="Please provide details, tenancy reference numbers, or transaction IDs..."
            className="mt-1 w-full rounded border border-line bg-white px-3 py-2 text-sm text-seal focus:border-seal focus:outline-none focus-visible:ring-2 focus-visible:ring-seal/30"
          />
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-muted">
            Average response time: &lt; 4 hours during business days.
          </span>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Submitting...' : 'Send Support Request'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
