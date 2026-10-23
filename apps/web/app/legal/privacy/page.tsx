import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | Odibrick',
  description: 'How Odibrick and Cambliss Pvt. Ltd. collect, protect, and process your personal and financial data.',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 py-10 px-4 sm:px-6">
      <div className="border-b border-line pb-6">
        <span className="font-mono text-xs uppercase tracking-widest text-accent">Data Protection & Privacy</span>
        <h1 className="mt-2 font-display text-4xl font-semibold text-seal">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">
          Last revised: October 2026 | Governing customer data protection, KYC verification, and financial processing.
        </p>
      </div>

      <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-4 text-xs text-amber-900" role="alert">
        <p className="font-semibold">⚠️ Legal Review Notice</p>
        <p className="mt-1">
          This document represents the operational draft privacy policy under the Digital Personal Data Protection (DPDP) Act, 2023.
          Mandatory consent frameworks, data fiduciary appointments, and data retention schedules remain subject to formal review
          by Cambliss Pvt. Ltd. legal counsel prior to commercial launch.
        </p>
      </div>

      <div className="prose prose-slate max-w-none space-y-6 text-sm text-seal/90 leading-relaxed">
        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">1. Information We Collect</h2>
          <p>
            Cambliss Pvt. Ltd. collects information necessary to execute property rental transactions, verify user credentials,
            draft enforceable legal agreements, and prevent fraud:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted">
            <li><strong>Identity & KYC Data:</strong> Full legal name, government ID numbers (PAN, masked Aadhaar), contact phone numbers, and email addresses.</li>
            <li><strong>Property Information:</strong> Address, ownership documentation, tax receipts, layout plans, and photography.</li>
            <li><strong>Financial & Payment Records:</strong> Bank account details for payouts, transaction identifiers, payment timestamps, and invoicing data (we do not store raw card numbers or CVVs).</li>
            <li><strong>Usage & Device Metrics:</strong> IP addresses, browser user-agent strings, session authentication cookies (<span className="font-mono text-seal">odb_at</span>), and interaction logs.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">2. Purpose of Data Processing</h2>
          <p>We process your data exclusively for lawful purposes:</p>
          <ul className="list-disc pl-5 space-y-1 text-muted">
            <li>Verifying the identity of owners and tenants to maintain platform trust.</li>
            <li>Drafting, stamping, and archiving residential and commercial lease agreements.</li>
            <li>Processing rent payments, automated security deposit holding, and financial reconciliations.</li>
            <li>Investigating fraud signals and facilitating online dispute resolution.</li>
            <li>Delivering operational notifications and transaction confirmations via in-app alerts, SMS, or email.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">3. Data Storage & Security Standards</h2>
          <p>
            Personal data and document assets are stored in secure cloud infrastructure within India.
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted">
            <li>Documents uploaded for KYC and legal evidence are stored in Cloudflare R2 object storage with encrypted rest state.</li>
            <li>Database transactions utilize encrypted communication channels (TLS 1.3) and strict role-based access control (RBAC).</li>
            <li>Administrative access to sensitive user data is restricted to authorized operations personnel and logged with immutable audit trails.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">4. Disclosure to Third Parties</h2>
          <p>
            We do not sell user data. Information is disclosed only to verified ecosystem participants strictly as required to fulfill services:
          </p>
          <ul className="list-disc pl-5 space-y-1 text-muted">
            <li>Counterparties in an active rental application or agreement (e.g., owner receiving verified applicant KYC details).</li>
            <li>RBI-licensed payment gateways and escrow banking partners.</li>
            <li>Legal counsel and dispute adjudicators assigned to your tenancy file.</li>
            <li>Judicial, regulatory, or tax authorities when mandated under applicable Indian law.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">5. Your Data Rights</h2>
          <p>
            Subject to statutory record retention requirements under financial and property laws, you have the right to request
            access to your stored personal data, request correction of erroneous records, and request account deletion upon the
            closure of all active tenancies and financial obligations.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="font-display text-xl font-semibold text-seal">6. Data Protection Officer</h2>
          <p>For data privacy queries, grievance redressal, or deletion requests, contact:</p>
          <div className="rounded border border-line bg-surface/50 p-4 text-xs font-mono">
            Grievance Officer — Cambliss Pvt. Ltd.<br />
            Email: privacy@odibrick.com / support@odibrick.com<br />
            Subject: DPDP Data Protection Inquiry
          </div>
        </section>
      </div>

      <div className="border-t border-line pt-6 flex justify-between items-center text-xs text-muted">
        <Link href="/legal/terms" className="text-accent hover:underline">
          ← View Terms of Service
        </Link>
        <Link href="/support" className="text-accent hover:underline">
          Contact Support Desk
        </Link>
      </div>
    </div>
  );
}
