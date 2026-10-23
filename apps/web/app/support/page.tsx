import type { Metadata } from 'next';
import Link from 'next/link';
import { Card } from '@/components/ui';
import { SupportClient } from './support-client';

export const metadata: Metadata = {
  title: 'Customer Support & Help Desk | Odibrick',
  description: 'Get help with account access, rent payments, lease agreements, disputes, and property verification.',
};

export default function SupportPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-10 py-8 px-4 sm:px-6">
      <div className="text-center">
        <span className="font-mono text-xs uppercase tracking-widest text-accent">Help Desk & Operations</span>
        <h1 className="mt-2 font-display text-4xl font-semibold text-seal">Odibrick Support Center</h1>
        <p className="mx-auto mt-3 max-w-2xl text-[16px] text-muted">
          Need help resetting your password, verifying your KYC, executing a rental agreement, or resolving a transaction?
          Our dedicated operations team is here to assist.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-5">
          <span className="font-mono text-xs text-accent">Direct Contact</span>
          <h2 className="mt-2 font-display text-lg font-semibold text-seal">Operations Desk</h2>
          <p className="mt-1 text-xs text-muted">Direct operational and escalation queries.</p>
          <div className="mt-4 space-y-2 text-xs">
            <p>
              <strong className="text-seal">Email:</strong>{' '}
              <a href="mailto:support@odibrick.com" className="text-accent underline">
                support@odibrick.com
              </a>
            </p>
            <p>
              <strong className="text-seal">Hotline:</strong>{' '}
              <span className="font-mono text-seal">+91 (80) 4920-8000</span>
            </p>
            <p className="text-[11px] text-muted">Mon – Sat, 9:00 AM – 8:00 PM IST</p>
          </div>
        </Card>

        <Card className="p-5">
          <span className="font-mono text-xs text-accent">Self-Service</span>
          <h2 className="mt-2 font-display text-lg font-semibold text-seal">Account Recovery</h2>
          <p className="mt-1 text-xs text-muted">Regain access to your account quickly.</p>
          <ul className="mt-4 space-y-1.5 text-xs text-muted">
            <li>• Password resets via support verification</li>
            <li>• Dual-factor phone/email updates</li>
            <li>• Corporate landlord and agent onboarding</li>
            <li>
              •{' '}
              <Link href="/login" className="text-accent hover:underline">
                Return to Sign in
              </Link>
            </li>
          </ul>
        </Card>

        <Card className="p-5">
          <span className="font-mono text-xs text-accent">Governance</span>
          <h2 className="mt-2 font-display text-lg font-semibold text-seal">Legal & Disputes</h2>
          <p className="mt-1 text-xs text-muted">Formal mediation and lease execution.</p>
          <ul className="mt-4 space-y-1.5 text-xs text-muted">
            <li>• Model Tenancy Act compliant agreements</li>
            <li>• Escrow security deposit refunds</li>
            <li>• Binding online dispute resolution</li>
            <li>
              •{' '}
              <Link href="/legal/terms" className="text-accent hover:underline">
                Terms of Service & Rules
              </Link>
            </li>
          </ul>
        </Card>
      </div>

      <SupportClient />

      <div className="rounded border border-line bg-surface/50 p-6 text-xs text-muted">
        <p className="font-medium text-seal">Operational Notice</p>
        <p className="mt-1">
          Odibrick is a digital rental and property transaction platform operated by Cambliss Pvt. Ltd.
          For immediate escalations regarding active eviction proceedings, disputed financial deductions, or security deposit
          locks, please ensure you include your unique Tenancy Reference ID (<span className="font-mono">ODB-TNC-...</span>)
          or Payment Reference ID (<span className="font-mono">ODB-PAY-...</span>) in your ticket.
        </p>
      </div>
    </div>
  );
}
