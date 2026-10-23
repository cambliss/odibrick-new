import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | Odibrick',
  description: 'Terms and conditions governing the use of the Odibrick property and rental transaction platform.',
};

export default function TermsOfServicePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 py-10 px-4 sm:px-6">
      <div className="border-b border-line pb-6">
        <span className="font-mono text-xs uppercase tracking-widest text-accent">Legal & Compliance</span>
        <h1 className="mt-2 font-display text-4xl font-semibold text-seal">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">
          Last revised: October 2026 | Effective for all registered users, owners, tenants, and brokers.
        </p>
      </div>

      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-xs text-amber-900" role="alert">
        <p className="font-semibold">⚠️ Legal Review Notice</p>
        <p className="mt-1">
          This document represents the operational draft terms for Odibrick. Specific statutory representations,
          state-specific stamp duty workflows, and arbitration clauses remain subject to formal review and ratification
          by Cambliss Pvt. Ltd. executive management and qualified legal counsel before production deployment.
        </p>
      </div>

      <div className="prose prose-slate max-w-none space-y-6 text-sm text-seal/90 leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">1. Platform Scope & Operating Entity</h2>
          <p>
            Odibrick (&quot;the Platform&quot;) is developed and operated by Cambliss Pvt. Ltd. (&quot;the Company&quot;). The Platform facilitates
            end-to-end residential and commercial property rentals, tenant verification (KYC), digital lease agreement drafting,
            automated rent collection, and formal dispute management under applicable Indian property law, including the Model Tenancy Act.
          </p>
          <p>
            By registering, listing a property, submitting an application, executing a digital lease, or making a payment on Odibrick,
            you agree to be bound by these Terms of Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">2. User Verification & Identity (KYC)</h2>
          <p>
            All property owners, listing managers, and prospective tenants must undergo identity verification prior to executing
            legally binding agreements or initiating financial transactions.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted">
            <li>Users must provide accurate, government-issued identification (such as Aadhaar or PAN) and proof of property ownership or authorization.</li>
            <li>Submission of falsified documents constitutes grounds for immediate account suspension, forfeiture of marketing packages, and referral to law enforcement.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">3. Digital Agreements & Legal Review</h2>
          <p>
            Rental agreements generated on Odibrick follow standardized legal templates tailored to state jurisdiction requirements.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted">
            <li>Agreements enter an intake and legal review queue before execution.</li>
            <li>Digital signatures affixed by tenants and owners constitute legally enforceable electronic records under the Information Technology Act, 2000.</li>
            <li>Users are solely responsible for ensuring stamp duty payments comply with their respective state laws.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">4. Payments, Security Deposits & Escrow</h2>
          <p>
            Rent and security deposit payments are processed through RBI-authorized payment aggregators.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted">
            <li>Security deposits are held in designated settlement escrow accounts until tenancy termination or approved deductions.</li>
            <li>Deductions for property damage or unpaid utility balances must follow mandatory move-out condition report inspections.</li>
            <li>Transactions confirmed offline or via bank transfer require verified bank reference numbers and administrative audit trails.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">5. Disputes & Administrative Overrides</h2>
          <p>
            In the event of disagreement regarding deposit refunds, maintenance obligations, or lease breaches, parties agree to
            participate in Odibrick&apos;s Online Dispute Resolution (ODR) process.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted">
            <li>Both parties may upload documentary evidence within specified evidentiary deadlines.</li>
            <li>Authorized Odibrick dispute managers may issue binding financial settlement orders supported by audit logs.</li>
            <li>Administrative overrides are logged with immutable audit references and reason codes.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">6. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, Cambliss Pvt. Ltd. shall not be liable for indirect, incidental,
            or consequential damages arising from physical property defects, tenant defaults, or unauthorized tenant actions beyond
            the verified verification standards outlined on the platform.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">7. Contact & Notices</h2>
          <p>
            For legal inquiries, dispute notices, or terms clarification, contact:
          </p>
          <div className="rounded border border-line bg-surface/50 p-4 text-xs font-mono">
            Cambliss Pvt. Ltd. — Legal & Governance Office<br />
            Email: legal@odibrick.com / support@odibrick.com<br />
            Bengaluru, Karnataka, India
          </div>
        </section>
      </div>

      <div className="border-t border-line pt-6 flex justify-between items-center text-xs text-muted">
        <Link href="/legal/privacy" className="text-accent hover:underline">
          View Privacy Policy →
        </Link>
        <Link href="/support" className="text-accent hover:underline">
          Need Support? Contact us
        </Link>
      </div>
    </div>
  );
}
