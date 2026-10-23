import type { Metadata } from 'next';
import Link from 'next/link';
import { Button, Card } from '@/components/ui';

export const metadata: Metadata = {
  title: 'For Real Estate Agents & Brokers | Odibrick',
  description: 'Empower your real estate practice with Odibrick digital lease infrastructure, guaranteed commissions, and verified inventory.',
};

export default function ForAgentsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-12 py-10 px-4 sm:px-6">
      <div className="text-center space-y-4">
        <span className="font-mono text-xs uppercase tracking-widest text-accent">Brokerage Infrastructure</span>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold text-seal">
          Close Leases Faster with Odibrick
        </h1>
        <p className="mx-auto max-w-2xl text-[16px] text-muted">
          Transform your real estate brokerage with digital KYC, automated lease drafting, instant e-stamping,
          and transparent commission splits.
        </p>
        <div className="flex justify-center gap-3 pt-2">
          <Button href="/register?role=AGENT">Join as an Agent Partner</Button>
          <Button variant="secondary" href="/properties">
            Explore Verified Inventory
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6 space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface font-mono font-bold text-seal">
            01
          </div>
          <h2 className="font-display text-xl font-semibold text-seal">Verified Inventory</h2>
          <p className="text-xs text-muted leading-relaxed">
            Never waste time with phantom or out-of-date listings. Every home on Odibrick undergoes ownership
            verification and condition vetting before going live.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface font-mono font-bold text-seal">
            02
          </div>
          <h2 className="font-display text-xl font-semibold text-seal">Instant Digital Contracts</h2>
          <p className="text-xs text-muted leading-relaxed">
            Eliminate days spent queuing for stamp paper. Draft, review, and digitally execute Model Tenancy Act
            compliant rental agreements in minutes.
          </p>
        </Card>

        <Card className="p-6 space-y-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface font-mono font-bold text-seal">
            03
          </div>
          <h2 className="font-display text-xl font-semibold text-seal">Protected Commissions</h2>
          <p className="text-xs text-muted leading-relaxed">
            Automatic commission reconciliation and split settlements. Your brokerage fees are accounted for
            in the transaction ledger and disbursed directly upon lease signing.
          </p>
        </Card>
      </div>

      <div className="rounded-xl border border-line bg-surface p-8 space-y-6">
        <h2 className="font-display text-2xl font-semibold text-seal text-center">
          What Agent Partners Get on Odibrick
        </h2>

        <div className="grid gap-6 md:grid-cols-2 text-xs text-seal">
          <div className="space-y-2 rounded border border-line bg-white p-4">
            <h3 className="font-semibold text-sm">Action Centre & Lead Inbox</h3>
            <p className="text-muted leading-relaxed">
              Real-time notifications for incoming enquiries, showing requests, and offer submissions. Direct messaging
              with verified prospective tenants.
            </p>
          </div>

          <div className="space-y-2 rounded border border-line bg-white p-4">
            <h3 className="font-semibold text-sm">Automated Applicant Screening</h3>
            <p className="text-muted leading-relaxed">
              Instant KYC status checks, employment verification badges, and rental history references—giving owners
              confidence in your shortlisted applicants.
            </p>
          </div>

          <div className="space-y-2 rounded border border-line bg-white p-4">
            <h3 className="font-semibold text-sm">Digital Move-In Inspections</h3>
            <p className="text-muted leading-relaxed">
              App-based move-in condition reports with timestamped photos. Protect both owner and tenant, eliminating
              move-out deposit disputes.
            </p>
          </div>

          <div className="space-y-2 rounded border border-line bg-white p-4">
            <h3 className="font-semibold text-sm">Marketing Boost Packages</h3>
            <p className="text-muted leading-relaxed">
              Amplify premium exclusive listings across Odibrick partner networks and localized search hubs for maximum
              buyer and tenant exposure.
            </p>
          </div>
        </div>
      </div>

      <div className="text-center space-y-4 border-t border-line pt-8">
        <h2 className="font-display text-2xl font-semibold text-seal">Ready to modernize your brokerage?</h2>
        <p className="text-xs text-muted">
          Create an agent account in seconds or contact our partner success team for corporate brokerage onboarding.
        </p>
        <div className="flex justify-center gap-3">
          <Button href="/register?role=AGENT">Sign up as Agent Partner</Button>
          <Button variant="ghost" href="/support">
            Contact Partner Desk
          </Button>
        </div>
      </div>
    </div>
  );
}
