import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'How It Works | Odibrick',
  description: 'Learn how Odibrick simplifies renting with verified properties, digital leases, automated rent payments, and deposit protection.',
};

export default function HowItWorksPage() {
  const steps = [
    {
      num: '01',
      title: 'Find or List a Verified Property',
      desc: 'Browse thoroughly vetted homes with transparent pricing, accurate photography, and verified ownership records. Owners can list in minutes with zero upfront fees.',
    },
    {
      num: '02',
      title: 'Digital Identity & KYC Verification',
      desc: 'Owners and tenants complete fast, government-ID verification. Transparent trust badges ensure you always know who you are entering into a lease with.',
    },
    {
      num: '03',
      title: 'Automated Legal Agreement & E-Stamping',
      desc: 'State-compliant lease agreements are drafted, reviewed by our legal queue, stamped, and digitally executed under the Information Technology Act.',
    },
    {
      num: '04',
      title: 'Move-In Condition Inspection',
      desc: 'Complete an itemized digital room-by-room condition report with timestamped photos at move-in. Sets an objective benchmark for move-out.',
    },
    {
      num: '05',
      title: 'Automated Rent & Escrow Deposit Protection',
      desc: 'Pay rent smoothly via UPI, net banking, or debit/credit cards with automated receipts. Security deposits are safeguarded in designated accounts.',
    },
    {
      num: '06',
      title: 'Structured Move-Out & Fast Dispute Settlement',
      desc: 'When a lease concludes, move-out inspections reconcile automatically. Any disputed deductions are resolved fairly through our Online Dispute Resolution (ODR) process.',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-12 py-10 px-4 sm:px-6">
      <div className="text-center space-y-4">
        <span className="font-mono text-xs uppercase tracking-widest text-accent">Transparent Rental Infrastructure</span>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-seal">
          Renting Done Right, From Search to Settlement
        </h1>
        <p className="mx-auto max-w-2xl text-[16px] text-muted">
          Odibrick replaces outdated paperwork, untraceable cash deposits, and endless broker disputes with a secure,
          audited digital workflow.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Button href="/properties">Browse Verified Homes</Button>
          <Button variant="secondary" href="/dashboard/properties/new">
            List Your Property
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <Card key={s.num} className="p-6 space-y-3">
            <span className="font-mono text-xs font-bold text-accent">{s.num}</span>
            <h2 className="font-display text-xl font-semibold text-seal">{s.title}</h2>
            <p className="text-xs text-muted leading-relaxed">{s.desc}</p>
          </Card>
        ))}
      </div>

      <div className="rounded-xl border border-line bg-surface p-8 space-y-6">
        <h2 className="font-display text-2xl font-semibold text-seal text-center">
          Traditional Renting vs. Odibrick
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="pb-3 font-medium">Rental Process Feature</th>
                <th className="pb-3 font-medium text-rose-800">Traditional Brokerage</th>
                <th className="pb-3 font-semibold text-emerald-800">The Odibrick Way</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line text-seal">
              <tr>
                <td className="py-3 font-medium">Listing Authenticity</td>
                <td className="py-3 text-muted">Frequent duplicate & fake listings</td>
                <td className="py-3 font-medium text-emerald-800">100% verified ownership & physical checks</td>
              </tr>
              <tr>
                <td className="py-3 font-medium">Lease Execution</td>
                <td className="py-3 text-muted">Days waiting for stamp vendors & couriers</td>
                <td className="py-3 font-medium text-emerald-800">Instant digital e-sign & e-stamp</td>
              </tr>
              <tr>
                <td className="py-3 font-medium">Deposit Security</td>
                <td className="py-3 text-muted">Held informally, arbitrary move-out deductions</td>
                <td className="py-3 font-medium text-emerald-800">Protected settlement escrow & condition reports</td>
              </tr>
              <tr>
                <td className="py-3 font-medium">Rent Invoicing</td>
                <td className="py-3 text-muted">Manual transfers with no tax receipts</td>
                <td className="py-3 font-medium text-emerald-800">Automated HRA-compliant invoices & reminders</td>
              </tr>
              <tr>
                <td className="py-3 font-medium">Dispute Resolution</td>
                <td className="py-3 text-muted">Protracted civil litigation or unaddressed losses</td>
                <td className="py-3 font-medium text-emerald-800">Binding online mediation with evidence trails</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="text-center space-y-4 border-t border-line pt-8">
        <h2 className="font-display text-2xl font-semibold text-seal">Experience modern renting today</h2>
        <div className="flex justify-center gap-3">
          <Button href="/register">Create Free Account</Button>
          <Button variant="ghost" href="/support">
            Have Questions? Talk to Support
          </Button>
        </div>
      </div>
    </div>
  );
}
