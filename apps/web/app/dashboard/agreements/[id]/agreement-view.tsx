'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, CardHeader, DataRow, StatusChip } from '@/components/ui';
import { RecordSpine } from '@/components/record-spine';
import { Seal } from '@/components/verification-seal';
import { api, ApiError } from '@/lib/api';
import { inr, shortDate, dateTime, titleCase } from '@/lib/format';

export type Signatory = {
  id: number;
  party_role: 'OWNER' | 'TENANT';
  status: 'PENDING' | 'SIGNED' | 'DECLINED';
  signed_at?: string;
  sign_order: number;
  full_name: string;
  public_id: string;
};

export type AgreementClause = {
  title: string;
  body: string;
  sort_order: number;
};

export type AgreementVersion = {
  version: number;
  change_summary?: string;
  drafted_with_ai?: boolean;
  reviewed_at?: string;
  created_at: string;
  drafter_name?: string;
};

export type AgreementDetailPayload = {
  agreement: {
    id: number;
    public_id: string;
    agreement_number: string;
    agreement_type: string;
    status: 'DRAFT' | 'LEGAL_REVIEW' | 'AWAITING_SIGNATURES' | 'PARTIALLY_SIGNED' | 'EXECUTED' | 'CANCELLED';
    current_version: number;
    effective_from?: string;
    effective_to?: string;
    stamp_duty_status: string;
    stamp_reference?: string;
    stamp_document_id?: number;
    stamp_verified_by_name?: string;
    stamp_verified_at?: string;
    stamp_amount?: number;
    stamp_state?: string;
    stamp_rejection_reason?: string;
    stamp_document_title?: string;
    approved_at?: string;
    approved_by_name?: string;
    executed_at?: string;
    tenancy_id: number;
    owner_user_id: number;
    tenant_user_id: number;
    rent_amount: number;
    deposit_amount: number;
    property_title: string;
    address_line1?: string;
    locality: string;
    city: string;
    state?: string;
    pincode?: string;
  };
  version?: {
    version: number;
    body_html?: string;
    variables?: any;
    change_summary?: string;
    reviewed_at?: string;
  };
  clauses: AgreementClause[];
  signatories: Signatory[];
  versions: AgreementVersion[];
  feePayment?: {
    id: number;
    reference_code: string;
    purpose: string;
    total_amount: number;
    status: string;
    paid_at?: string;
  } | null;
  legalStatus: string;
};

type CurrentUser = {
  id: number;
  fullName: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export function AgreementView({
  data,
  currentUser,
}: {
  data: AgreementDetailPayload;
  currentUser: CurrentUser;
}) {
  const router = useRouter();
  const { agreement, version, clauses, signatories, legalStatus } = data;

  const [hasConsented, setHasConsented] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Find signatory matching current authenticated user
  const mySignatory = signatories.find((s) => s.id && (s.full_name === currentUser.fullName || s.party_role === (currentUser.id === agreement.owner_user_id ? 'OWNER' : currentUser.id === agreement.tenant_user_id ? 'TENANT' : '')));
  const isOwner = currentUser.id === agreement.owner_user_id;
  const isTenant = currentUser.id === agreement.tenant_user_id;
  const isParty = isOwner || isTenant;

  const mySignRecord = signatories.find(
    (s) => (isOwner && s.party_role === 'OWNER') || (isTenant && s.party_role === 'TENANT'),
  );

  const canSign =
    isParty &&
    mySignRecord &&
    mySignRecord.status === 'PENDING' &&
    ['AWAITING_SIGNATURES', 'PARTIALLY_SIGNED'].includes(agreement.status);

  const isExecuted = agreement.status === 'EXECUTED';
  const allSigned = signatories.length > 0 && signatories.every((s) => s.status === 'SIGNED');
  const feePaid = data.feePayment?.status === 'PAID';
  const stampVerified = ['PAID', 'REGISTERED'].includes(agreement.stamp_duty_status) && Boolean(agreement.stamp_verified_at);
  const stampNotApplicable = agreement.stamp_duty_status === 'NOT_APPLICABLE';
  const isStampingRejected = Boolean(agreement.stamp_rejection_reason);

  const [certInput, setCertInput] = useState(agreement.stamp_reference || '');
  const [stampAmtInput, setStampAmtInput] = useState(agreement.stamp_amount ? String(agreement.stamp_amount) : '');
  const [stampStateInput, setStampStateInput] = useState(agreement.stamp_state || 'Karnataka');
  const [submittingStamp, setSubmittingStamp] = useState(false);
  const [stampMsg, setStampMsg] = useState<string | null>(null);

  const handleStampingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certInput.trim()) return;
    setSubmittingStamp(true);
    setStampMsg(null);
    try {
      await api(`/agreements/${agreement.id}/stamping/submit`, {
        method: 'POST',
        body: JSON.stringify({
          certificateNumber: certInput.trim(),
          state: stampStateInput.trim() || undefined,
          stampAmount: stampAmtInput ? Number(stampAmtInput) : undefined,
        }),
      });
      setStampMsg('E-Stamp certificate reference submitted. Odibrick staff will verify it.');
      router.refresh();
    } catch (err) {
      setStampMsg(err instanceof ApiError ? err.message : 'Failed to submit certificate.');
    } finally {
      setSubmittingStamp(false);
    }
  };

  // Extract variables
  const variables = typeof version?.variables === 'string' ? JSON.parse(version.variables) : (version?.variables || {});

  const handleSign = async () => {
    if (!hasConsented) {
      setErrorMsg('Please confirm that you have read and accepted the agreement terms.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await api<{ status: string; pendingSignatures?: number }>(`/agreements/${agreement.id}/sign`, {
        method: 'POST',
        body: JSON.stringify({
          consent: true,
          consentText: `I, ${currentUser.fullName} (${isOwner ? 'Owner / Licensor' : 'Tenant / Licensee'}), have read and accept all terms of Agreement ${agreement.agreement_number} (v${agreement.current_version}).`,
          version: agreement.current_version,
        }),
      });

      if (res.status === 'EXECUTED') {
        setSuccessMsg('Agreement successfully signed by all parties and executed!');
      } else if (res.status === 'AWAITING_PAYMENT' || res.pendingSignatures === 0) {
        setSuccessMsg('Agreement successfully signed by all parties! Initial payment is now pending confirmation before execution.');
      } else {
        setSuccessMsg('Your signature has been recorded. Waiting for the remaining party to sign.');
      }
      router.refresh();
    } catch (err) {
      setErrorMsg(err instanceof ApiError ? err.message : 'Failed to record signature. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------- HEADER */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={isParty ? `/dashboard/tenancy/${agreement.tenancy_id}` : `/dashboard/legal`}
              className="text-xs font-mono uppercase tracking-wider text-muted hover:text-ink"
            >
              ← Back to {isParty ? 'Tenancy' : 'Legal cases'}
            </Link>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="font-display text-2xl sm:text-3xl font-semibold">
              {agreement.agreement_number}
            </h1>
            <StatusChip status={agreement.status} />
            <Badge>Version {agreement.current_version}</Badge>
            {isExecuted ? <Badge tone="seal">Legally Executed</Badge> : null}
            {allSigned && !isExecuted && feePaid && (stampVerified || stampNotApplicable) ? (
              <Badge tone="seal">Execution Ready</Badge>
            ) : allSigned && !isExecuted && feePaid && !stampVerified && !stampNotApplicable ? (
              <Badge tone="ochre">Fee Paid · Stamping Pending</Badge>
            ) : allSigned && !isExecuted && !feePaid && (stampVerified || stampNotApplicable) ? (
              <Badge tone="info">Stamping Verified · Payment Pending</Badge>
            ) : allSigned && !isExecuted ? (
              <Badge tone="info">Signed · Payment & Stamping Pending</Badge>
            ) : null}
            {isStampingRejected ? <Badge tone="alert">Stamping Rejected</Badge> : null}
          </div>
          <p className="mt-1 text-[14px] text-muted">
            {agreement.property_title} · {agreement.locality}, {agreement.city}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(isExecuted || allSigned) && isTenant ? (
            <Button href="/dashboard/payments" variant="primary">
              Proceed to Payments →
            </Button>
          ) : null}
          {isParty ? (
            <Button href={`/dashboard/tenancy/${agreement.tenancy_id}`} variant="secondary">
              View Tenancy Record
            </Button>
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------- STATUS BANNER */}
      {isExecuted ? (
        <div className="rounded-card border border-seal/30 bg-seal-soft/40 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-seal text-white font-bold text-lg">
              ✓
            </div>
            <div>
              <p className="font-semibold text-seal-deep">Agreement Legally Executed</p>
              <p className="text-xs sm:text-sm text-ink/80">
                All parties have signed, e-stamp duty is verified, and initial platform fee confirmed.
              </p>
            </div>
          </div>
          <Seal label="Executed" sub={agreement.executed_at ? shortDate(agreement.executed_at) : undefined} />
        </div>
      ) : allSigned ? (
        <div className="rounded-card border border-ochre/40 bg-ochre-soft/30 p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ochre text-white font-bold text-lg">
              ℹ
            </div>
            <div>
              <p className="font-semibold text-ink">
                {feePaid && !(stampVerified || stampNotApplicable)
                  ? 'Fee Paid · Awaiting Stamping Verification'
                  : isStampingRejected
                  ? 'Submitted E-Stamp Certificate Rejected'
                  : (stampVerified || stampNotApplicable) && !feePaid
                  ? 'E-Stamp Verified · Awaiting Fee Confirmation'
                  : 'Signed by All Parties · Pending Payment & Stamping'}
              </p>
              <p className="text-xs sm:text-sm text-muted">
                {feePaid && !(stampVerified || stampNotApplicable)
                  ? 'Initial payment is confirmed. Authorized Odibrick staff must verify the e-stamp certificate before formal execution.'
                  : isStampingRejected
                  ? `The e-stamp certificate was rejected: ${agreement.stamp_rejection_reason}. Please submit a corrected certificate.`
                  : (stampVerified || stampNotApplicable) && !feePaid
                  ? 'E-stamp duty is verified. Please complete the initial platform fee payment to execute the agreement.'
                  : 'Both parties have signed. Formal execution requires e-stamp verification and initial payment confirmation.'}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-card border border-ochre/40 bg-ochre-soft/30 p-4 sm:p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ochre text-white font-bold text-lg">
              ℹ
            </div>
            <div>
              <p className="font-semibold text-ink">Approved Agreement · Awaiting Signature</p>
              <p className="text-xs sm:text-sm text-muted">
                {agreement.approved_by_name
                  ? `Approved by legal advocate ${agreement.approved_by_name}.`
                  : 'Approved by Odibrick Legal.'}{' '}
                Please review the terms and record your digital consent below.
              </p>
            </div>
          </div>
          <Badge tone="ochre">Read-only</Badge>
        </div>
      )}

      {/* ------------------------------------------------------- MAIN GRID */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Agreement Document */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader
              title="Leave and License Agreement"
              note="Official verified contract text."
              action={
                <span className="font-mono text-xs uppercase tracking-wider text-muted">
                  Doc Ref: {agreement.public_id}
                </span>
              }
            />
            <div className="p-6 space-y-6 text-[14px] leading-relaxed text-ink">
              {/* Document Preamble */}
              <div className="border-b border-line pb-6 text-center space-y-2">
                <h2 className="font-display text-xl font-bold tracking-wide uppercase text-ink">
                  Leave and License Agreement
                </h2>
                <p className="text-xs font-mono uppercase tracking-widest text-muted">
                  Agreement No: {agreement.agreement_number} · Version {agreement.current_version}
                </p>
                {agreement.effective_from ? (
                  <p className="text-xs text-muted">
                    Effective Period: {shortDate(agreement.effective_from)}{' '}
                    {agreement.effective_to ? `to ${shortDate(agreement.effective_to)}` : ''}
                  </p>
                ) : null}
              </div>

              {/* Recitals / Parties */}
              <div className="space-y-3 bg-paper/40 rounded-card p-4 border border-line/60">
                <p className="font-semibold text-xs uppercase tracking-wider text-muted">Parties</p>
                <div className="grid sm:grid-cols-2 gap-4 text-xs">
                  <div className="border-l-2 border-seal pl-3">
                    <p className="font-bold text-ink">LICENSOR / OWNER</p>
                    <p className="font-medium text-ink mt-0.5">
                      {signatories.find((s) => s.party_role === 'OWNER')?.full_name || 'Tara Verma'}
                    </p>
                    <p className="text-muted">Party Role: Licensor</p>
                  </div>
                  <div className="border-l-2 border-seal pl-3">
                    <p className="font-bold text-ink">LICENSEE / TENANT</p>
                    <p className="font-medium text-ink mt-0.5">
                      {signatories.find((s) => s.party_role === 'TENANT')?.full_name || 'Priya Verma'}
                    </p>
                    <p className="text-muted">Party Role: Licensee</p>
                  </div>
                </div>
              </div>

              {/* Property Schedule */}
              <div className="space-y-1 bg-paper/40 rounded-card p-4 border border-line/60 text-xs">
                <p className="font-semibold uppercase tracking-wider text-muted">Schedule of Licensed Premises</p>
                <p className="font-medium text-ink text-sm">{agreement.property_title}</p>
                <p className="text-muted">
                  {[agreement.address_line1, agreement.locality, agreement.city, agreement.state, agreement.pincode]
                    .filter(Boolean)
                    .join(', ')}
                </p>
              </div>

              {/* Clauses */}
              <div className="space-y-5 pt-2">
                <h3 className="font-display font-semibold text-base border-b border-line pb-2">
                  Agreed Covenants & Clauses
                </h3>
                {clauses.length ? (
                  <ol className="space-y-4 list-decimal list-inside">
                    {clauses.map((clause, idx) => (
                      <li key={idx} className="space-y-1">
                        <span className="font-semibold text-ink">{clause.title}</span>
                        <p className="text-muted text-[13px] pl-5 leading-normal whitespace-pre-wrap">
                          {clause.body}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-muted text-xs italic">Standard statutory covenants apply.</p>
                )}
              </div>

              {/* Document Disclaimer / Legal note */}
              <div className="mt-8 border-t border-line/70 pt-4 text-[11px] text-muted leading-normal">
                <p className="font-medium text-ink">Legal Status:</p>
                <p>{legalStatus}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Col: Commercial Summary, Signatures & Action */}
        <div className="space-y-6">
          {/* Key Terms */}
          <Card>
            <CardHeader title="Commercial Terms" note="Approved financial terms." />
            <div className="p-5 space-y-3 text-xs">
              <DataRow label="Monthly Rent" value={inr(variables.rent_amount ?? agreement.rent_amount)} />
              <DataRow label="Security Deposit" value={inr(variables.deposit_amount ?? agreement.deposit_amount)} />
              <DataRow label="Maintenance Fee" value={inr(variables.maintenance_amount ?? 0)} />
              <DataRow label="Rent Due Day" value={`Day ${variables.rent_due_day ?? 5} of every month`} />
              <DataRow label="Lock-in Period" value={`${variables.lock_in_months ?? 0} Months`} />
              <DataRow label="Notice Period" value={`${variables.notice_period_days ?? 30} Days`} />
              <DataRow label="Deposit Refund" value={`Within ${variables.deposit_refund_days ?? 7} days of handover`} />
            </div>
          </Card>

          {/* Signatories Progress */}
          <Card>
            <CardHeader title="Signatures" note="Official execution status." />
            <div className="p-5 space-y-4">
              {signatories.map((sig) => (
                <div
                  key={sig.id}
                  className="rounded-card border border-line p-3.5 space-y-2 bg-paper/20"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                        {sig.party_role}
                      </span>
                      <p className="font-semibold text-sm text-ink">{sig.full_name}</p>
                    </div>
                    <StatusChip status={sig.status} />
                  </div>
                  {sig.status === 'SIGNED' ? (
                    <div className="text-[11px] text-muted flex items-center justify-between pt-1 border-t border-line/50">
                      <span>✓ Signed via Clickwrap</span>
                      <span>{sig.signed_at ? dateTime(sig.signed_at) : 'Recorded'}</span>
                    </div>
                  ) : (
                    <p className="text-[11px] text-amber-700 font-medium">Pending party review & signature</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Signature Action Box */}
          <Card className="border-seal/40">
            <CardHeader
              title={isExecuted ? 'Agreement Finalized' : allSigned ? 'Signatures Complete' : 'Electronic Signature'}
              note={isExecuted ? 'Executed by all parties' : allSigned ? 'Awaiting initial payment confirmation' : 'Authenticated click-wrap signature'}
            />
            <div className="p-5 space-y-4">
              {successMsg ? (
                <div className="rounded-card border border-seal/40 bg-seal-soft/50 p-3 text-xs text-seal-deep font-medium">
                  {successMsg}
                </div>
              ) : null}

              {errorMsg ? (
                <div className="rounded-card border border-alert/30 bg-alert-soft/50 p-3 text-xs text-alert font-medium">
                  {errorMsg}
                </div>
              ) : null}

              {canSign ? (
                <div className="space-y-4">
                  <div className="bg-paper p-3 rounded-card border border-line text-xs space-y-2">
                    <p className="font-medium text-ink">
                      Signing as: <span className="font-semibold">{currentUser.fullName}</span> ({isOwner ? 'Owner' : 'Tenant'})
                    </p>
                    <p className="text-muted leading-normal">
                      By clicking below, you confirm that you have read and understood the entire agreement text
                      and consent to be legally bound by all terms.
                    </p>
                  </div>

                  <label className="flex items-start gap-2 text-xs text-ink cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hasConsented}
                      onChange={(e) => setHasConsented(e.target.checked)}
                      className="mt-0.5 rounded border-line text-seal focus:ring-seal"
                    />
                    <span>
                      I have read, agree to, and accept all clauses in <strong>Agreement {agreement.agreement_number}</strong>.
                    </span>
                  </label>

                  <Button
                    onClick={handleSign}
                    disabled={submitting || !hasConsented}
                    variant="primary"
                    full
                  >
                    {submitting ? 'Recording Signature...' : 'I Agree & Sign Agreement'}
                  </Button>
                </div>
              ) : isParty && mySignRecord?.status === 'SIGNED' ? (
                <div className="text-center py-3 space-y-2">
                  <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold">
                    ✓
                  </div>
                  <p className="text-sm font-semibold text-ink">You have signed this agreement</p>
                  <p className="text-xs text-muted">
                    {isExecuted
                      ? 'All parties have executed the agreement.'
                      : allSigned
                      ? 'Both parties have signed. Initial payment is pending confirmation before formal execution.'
                      : 'Waiting for the counterparty to complete their signature.'}
                  </p>
                </div>
              ) : !isParty ? (
                <div className="text-xs text-muted py-2">
                  You are viewing this agreement as authorized legal counsel or administrator. Party signatures must be completed by the respective owner and tenant accounts.
                </div>
              ) : null}

              {(isExecuted || allSigned) && isTenant ? (
                <div className="pt-3 border-t border-line">
                  <Button href="/dashboard/payments" variant="primary" full>
                    Go to Payments ({inr(agreement.rent_amount + agreement.deposit_amount)}) →
                  </Button>
                </div>
              ) : null}
            </div>
          </Card>

          {/* E-Stamping Details & Submission Box */}
          <Card className="border-line">
            <CardHeader
              title="E-Stamping Status"
              note={stampVerified ? 'Verified by Odibrick Legal' : 'State stamp duty obligation'}
            />
            <div className="p-5 space-y-3">
              {stampMsg ? (
                <div className="rounded-card border border-seal/30 bg-seal-soft/40 p-2.5 text-xs text-seal-deep">
                  {stampMsg}
                </div>
              ) : null}

              {stampVerified ? (
                <div className="rounded border border-emerald-200 bg-emerald-50/50 p-3 space-y-1">
                  <p className="font-semibold text-emerald-800 text-xs">✓ E-Stamp Duty Verified</p>
                  <p className="text-xs text-ink font-mono">Certificate: {agreement.stamp_reference}</p>
                  {agreement.stamp_verified_by_name ? (
                    <p className="text-[11px] text-muted">
                      Verified by {agreement.stamp_verified_by_name}{' '}
                      {agreement.stamp_verified_at ? `on ${shortDate(agreement.stamp_verified_at)}` : ''}
                    </p>
                  ) : null}
                </div>
              ) : stampNotApplicable ? (
                <div className="rounded border border-line bg-paper p-3 text-xs text-muted">
                  E-Stamp duty is recorded as not applicable for this agreement.
                </div>
              ) : (
                <div className="space-y-3">
                  {isStampingRejected ? (
                    <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs space-y-1">
                      <p className="font-semibold text-amber-900">Certificate Rejected</p>
                      <p className="text-amber-800">{agreement.stamp_rejection_reason}</p>
                      <p className="text-[11px] text-muted pt-1">Please submit a corrected certificate reference below.</p>
                    </div>
                  ) : agreement.stamp_reference ? (
                    <div className="rounded border border-blue-200 bg-blue-50 p-3 text-xs space-y-1">
                      <p className="font-semibold text-blue-900">Certificate Submitted</p>
                      <p className="font-mono text-ink">Ref: {agreement.stamp_reference}</p>
                      <p className="text-[11px] text-muted">Awaiting verification by Odibrick legal staff.</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted">
                      E-stamp duty must be verified by Odibrick staff before agreement execution.
                    </p>
                  )}

                  {isParty && !isExecuted ? (
                    <form onSubmit={handleStampingSubmit} className="space-y-2.5 pt-2 border-t border-line">
                      <div>
                        <label className="block text-[11px] font-medium text-ink mb-1">
                          E-Stamp Certificate / Reference Number
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. IN-KA12345678901234W"
                          value={certInput}
                          onChange={(e) => setCertInput(e.target.value)}
                          className="w-full rounded border border-line px-2.5 py-1.5 text-xs font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-medium text-ink mb-1">State</label>
                          <input
                            type="text"
                            placeholder="Karnataka"
                            value={stampStateInput}
                            onChange={(e) => setStampStateInput(e.target.value)}
                            className="w-full rounded border border-line px-2.5 py-1.5 text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-ink mb-1">Amount (INR)</label>
                          <input
                            type="number"
                            placeholder="500"
                            value={stampAmtInput}
                            onChange={(e) => setStampAmtInput(e.target.value)}
                            className="w-full rounded border border-line px-2.5 py-1.5 text-xs"
                          />
                        </div>
                      </div>
                      <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={submittingStamp}
                        full
                      >
                        {submittingStamp ? 'Submitting...' : 'Submit Certificate Reference'}
                      </Button>
                    </form>
                  ) : null}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
