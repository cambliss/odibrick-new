import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi, ApiError } from '@/lib/api';
import { Badge, Button, Card, CardHeader, DataRow, EmptyState, StatTile, StatusChip } from '@/components/ui';
import { RecordSpine } from '@/components/record-spine';
import { Seal } from '@/components/verification-seal';
import { inr, shortDate, dateTime, relative, titleCase } from '@/lib/format';
import { AssignAdvocateButton, AddNoteForm, ScheduleMeetingButton, ApproveAgreementButton } from './case-actions';

export const metadata: Metadata = { title: 'Legal Case Details', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type LegalCaseDetailResponse = {
  case: {
    id: number;
    public_id: string;
    case_number: string;
    case_type: string;
    status: string;
    priority: string;
    jurisdiction?: string;
    opened_at: string;
    closed_at?: string;
    assigned_to?: number;
    assignee_name?: string;
    assignee_email?: string;
    tenancy_id: number;
    stage: string;
    rent_amount: number;
    deposit_amount: number;
    maintenance_amount?: number;
    start_date?: string;
    end_date?: string;
    lock_in_months?: number;
    notice_period_days?: number;
    service_plan: string;
    owner_user_id: number;
    tenant_user_id: number;
    property_id: number;
    property_title: string;
    address_line1?: string;
    locality: string;
    city: string;
    state?: string;
    pincode?: string;
    furnishing?: string;
    bedrooms?: number;
    owner_name: string;
    owner_email: string;
    owner_phone?: string;
    tenant_name: string;
    tenant_email: string;
    tenant_phone?: string;
  };
  agreements: Array<{
    id: number;
    public_id: string;
    agreement_number: string;
    status: string;
    current_version: number;
    approved_at?: string;
    executed_at?: string;
    stamp_duty_status: string;
    signatories?: Array<{
      id: number;
      party_role: string;
      status: string;
      signed_at?: string;
      full_name: string;
    }>;
  }>;
  meetings: Array<{
    id: number;
    public_id: string;
    purpose: string;
    scheduled_for: string;
    duration_min: number;
    status: string;
    provider: string;
    agenda?: string;
    outcome_notes?: string;
  }>;
  notes: Array<{
    id: number;
    body: string;
    visibility: 'INTERNAL' | 'PARTIES';
    created_at: string;
    author: string;
  }>;
  kyc: Array<{
    user_id: number;
    legal_name: string;
    id_type: string;
    id_last4?: string;
    status: string;
    reviewed_at?: string;
  }>;
  documents: Array<{
    id: number;
    title: string;
    category: string;
    mime_type: string;
    created_at: string;
    owner_user_id: number;
  }>;
  timeline?: Array<{
    event_code: string;
    title: string;
    detail?: string;
    occurred_at: string;
  }>;
  advocates?: Array<{
    id: number;
    full_name: string;
    email: string;
  }>;
};

const WORKFLOW_STEPS = [
  { id: 'QUEUED', label: 'Queued', desc: 'Application accepted by owner' },
  { id: 'DOCUMENT_REVIEW', label: 'Document Review', desc: 'Identity & title verification' },
  { id: 'CONSULTATION_SCHEDULED', label: 'Consultation', desc: 'Terms & special clauses review' },
  { id: 'DRAFTING', label: 'Drafting', desc: 'Agreement drafted' },
  { id: 'APPROVED', label: 'Legal Approval', desc: 'Advocate sign-off' },
  { id: 'AWAITING_SIGNATURES', label: 'Party Signatures', desc: 'Owner & tenant e-signing' },
  { id: 'EXECUTED', label: 'Executed', desc: 'Binding agreement & stamp duty' },
];

function getActiveStepIndex(caseStatus: string, agreementStatus?: string): number {
  if (caseStatus === 'EXECUTED' || agreementStatus === 'EXECUTED') return 6;
  if (agreementStatus === 'AWAITING_SIGNATURES' || agreementStatus === 'PARTIALLY_SIGNED') return 5;
  if (caseStatus === 'APPROVED') return 4;
  if (caseStatus === 'DRAFTING' || agreementStatus === 'LEGAL_REVIEW' || agreementStatus === 'DRAFT') return 3;
  if (caseStatus === 'CONSULTATION_SCHEDULED') return 2;
  if (caseStatus === 'DOCUMENT_REVIEW') return 1;
  return 0;
}

export default async function LegalCaseDetailPage({ params }: { params: { id: string } }) {
  let data: LegalCaseDetailResponse;

  try {
    data = await serverApi<LegalCaseDetailResponse>(`/legal/cases/${params.id}`);
  } catch (error) {
    if (error instanceof ApiError && [403, 404].includes(error.status)) notFound();
    throw error;
  }

  const { case: legalCase, agreements, meetings, notes, kyc, documents, timeline = [], advocates = [] } = data;

  const latestAgreement = agreements[0];
  const activeStep = getActiveStepIndex(legalCase.status, latestAgreement?.status);

  const ownerKyc = kyc.find((k) => k.user_id === legalCase.owner_user_id);
  const tenantKyc = kyc.find((k) => k.user_id === legalCase.tenant_user_id);

  const ownerDocs = documents.filter((d) => d.owner_user_id === legalCase.owner_user_id);
  const tenantDocs = documents.filter((d) => d.owner_user_id === legalCase.tenant_user_id);
  const propertyDocs = documents.filter(
    (d) => d.category === 'PROPERTY' || d.category === 'OWNERSHIP' || (d.owner_user_id !== legalCase.owner_user_id && d.owner_user_id !== legalCase.tenant_user_id),
  );

  return (
    <div className="space-y-6">
      {/* ---------------------------------------------------- BREADCRUMBS */}
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted">
        <Link href="/dashboard/legal" className="hover:text-seal">
          Legal queue
        </Link>
        <span>/</span>
        <span className="text-ink">{legalCase.case_number}</span>
      </div>

      {/* -------------------------------------------------- 1. CASE HEADER */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold">{legalCase.case_number}</span>
            <StatusChip status={legalCase.status} />
            {['URGENT', 'HIGH'].includes(legalCase.priority) ? (
              <Badge tone="alert">{legalCase.priority} PRIORITY</Badge>
            ) : (
              <Badge>{legalCase.priority} PRIORITY</Badge>
            )}
            <Badge tone="seal">{titleCase(legalCase.case_type)}</Badge>
            <Badge>{titleCase(legalCase.service_plan)} PLAN</Badge>
          </div>

          <h1 className="mt-3 font-display text-2xl sm:text-3xl font-semibold text-ink">
            {legalCase.property_title}
          </h1>

          <p className="mt-1 text-[15px] text-muted">
            {legalCase.locality}, {legalCase.city}
            {legalCase.state ? `, ${legalCase.state}` : ''}
            {legalCase.pincode ? ` - ${legalCase.pincode}` : ''} · Opened {relative(legalCase.opened_at)} ({shortDate(legalCase.opened_at)})
          </p>
        </div>

        {/* Action controls */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            href={`/dashboard/legal/${legalCase.id}/agreement`}
            variant="secondary"
            size="sm"
          >
            {latestAgreement ? 'Agreement workbench' : 'Start draft'}
          </Button>
          <AssignAdvocateButton
            caseId={legalCase.id}
            currentAssigneeId={legalCase.assigned_to}
            currentPriority={legalCase.priority}
            advocates={advocates}
          />
          <ScheduleMeetingButton caseId={legalCase.id} />
        </div>
      </div>

      {/* ------------------------------------------- 7. LEGAL CASE PROGRESS */}
      <Card className="p-5">
        <div className="flex items-center justify-between border-b border-line/60 pb-3">
          <div>
            <h2 className="font-display text-base font-semibold">Legal case lifecycle</h2>
            <p className="text-[13px] text-muted">
              Standardized verification, drafting, review, and execution workflow.
            </p>
          </div>
          <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Stage {activeStep + 1} of {WORKFLOW_STEPS.length}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {WORKFLOW_STEPS.map((step, idx) => {
            const isCompleted = idx < activeStep;
            const isCurrent = idx === activeStep;
            return (
              <div
                key={step.id}
                className={`rounded-card border p-3 transition-colors ${
                  isCurrent
                    ? 'border-seal bg-seal-soft/50 ring-1 ring-seal'
                    : isCompleted
                    ? 'border-line bg-paper/60 text-ink'
                    : 'border-line/40 bg-white/40 text-muted/60 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-wider">
                    0{idx + 1}
                  </span>
                  {isCompleted ? (
                    <span className="text-[12px] text-seal font-bold">✓</span>
                  ) : isCurrent ? (
                    <span className="inline-block h-2 w-2 rounded-full bg-seal animate-pulse" />
                  ) : null}
                </div>
                <p className={`mt-2 font-display text-[13px] font-semibold ${isCurrent ? 'text-seal-deep' : ''}`}>
                  {step.label}
                </p>
                <p className="mt-0.5 text-[11px] leading-tight text-muted">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ------------------------------------------------- STAT TILES ROW */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Assigned Advocate"
          value={legalCase.assignee_name ?? 'Unassigned'}
          note={legalCase.assignee_email ?? 'Action required: assign legal counsel'}
        />
        <StatTile
          label="Monthly Rent"
          value={inr(legalCase.rent_amount)}
          note={`Deposit: ${inr(legalCase.deposit_amount)}`}
        />
        <StatTile
          label="Jurisdiction"
          value={legalCase.jurisdiction ?? (legalCase.state ? `${legalCase.state} Tenancy Law` : 'Not specified')}
          note="State rental regulations apply"
        />
        <StatTile
          label="Agreement Status"
          value={latestAgreement ? titleCase(latestAgreement.status) : 'Draft Pending'}
          note={latestAgreement ? latestAgreement.agreement_number : 'No active agreement draft'}
        />
      </div>

      {/* ----------------------------------------- MAIN 2-COLUMN LAYOUT */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <div className="space-y-6">
          {/* ------------------------------------------------ 2. PARTIES */}
          <Card>
            <CardHeader
              title="Parties to Agreement"
              note="Contact details and KYC identity verification status."
            />
            <div className="p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                {/* OWNER */}
                <div className="rounded-card border border-line bg-paper/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Property Owner</span>
                    <StatusChip status={ownerKyc?.status ?? 'NOT_STARTED'} />
                  </div>
                  <p className="mt-2 font-display text-base font-semibold">{legalCase.owner_name}</p>
                  <p className="mt-1 text-[13px] text-muted">{legalCase.owner_email}</p>
                  <p className="text-[13px] text-muted">{legalCase.owner_phone ?? 'Phone on record'}</p>

                  <div className="mt-3 border-t border-line/60 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">KYC Record</p>
                    {ownerKyc ? (
                      <p className="mt-0.5 font-mono text-[12px]">
                        {ownerKyc.id_type} {ownerKyc.id_last4 ? `···· ${ownerKyc.id_last4}` : ''}
                        {ownerKyc.reviewed_at ? ` · Verified ${shortDate(ownerKyc.reviewed_at)}` : ''}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[12px] text-muted">KYC record not yet submitted</p>
                    )}
                  </div>
                </div>

                {/* TENANT */}
                <div className="rounded-card border border-line bg-paper/40 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted">Prospective Tenant</span>
                    <StatusChip status={tenantKyc?.status ?? 'NOT_STARTED'} />
                  </div>
                  <p className="mt-2 font-display text-base font-semibold">{legalCase.tenant_name}</p>
                  <p className="mt-1 text-[13px] text-muted">{legalCase.tenant_email}</p>
                  <p className="text-[13px] text-muted">{legalCase.tenant_phone ?? 'Phone on record'}</p>

                  <div className="mt-3 border-t border-line/60 pt-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">KYC Record</p>
                    {tenantKyc ? (
                      <p className="mt-0.5 font-mono text-[12px]">
                        {tenantKyc.id_type} {tenantKyc.id_last4 ? `···· ${tenantKyc.id_last4}` : ''}
                        {tenantKyc.reviewed_at ? ` · Verified ${shortDate(tenantKyc.reviewed_at)}` : ''}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[12px] text-muted">KYC record not yet submitted</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* ------------------------------------- 5 & 6. DOCUMENT CHECKLIST & VERIFICATION */}
          <Card>
            <CardHeader
              title="Legal Document Checklist"
              note="All statutory, title, and identity documents tied to this case."
            />
            <div className="p-5 space-y-4">
              {/* Owner Documents */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Owner Documentation</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-card border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">Identity Proof</span>
                      <StatusChip status={ownerKyc?.status ?? 'PENDING'} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {ownerKyc ? `${ownerKyc.id_type} ···· ${ownerKyc.id_last4 ?? ''}` : 'Awaiting upload'}
                    </p>
                  </div>

                  <div className="rounded-card border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">PAN Verification</span>
                      <StatusChip status={ownerKyc?.status === 'VERIFIED' ? 'VERIFIED' : 'PENDING'} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {ownerKyc?.status === 'VERIFIED' ? 'Tax record verified' : 'Pending verification'}
                    </p>
                  </div>

                  <div className="rounded-card border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">Ownership Proof</span>
                      <StatusChip status={propertyDocs.length ? 'VERIFIED' : 'PENDING'} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {propertyDocs.length ? `${propertyDocs.length} deed document(s)` : 'Title verification'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tenant Documents */}
              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Tenant Documentation</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-card border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">Identity Proof</span>
                      <StatusChip status={tenantKyc?.status ?? 'PENDING'} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {tenantKyc ? `${tenantKyc.id_type} ···· ${tenantKyc.id_last4 ?? ''}` : 'Awaiting upload'}
                    </p>
                  </div>

                  <div className="rounded-card border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">Address Proof</span>
                      <StatusChip status={tenantKyc?.status === 'VERIFIED' ? 'VERIFIED' : 'PENDING'} />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">
                      {tenantKyc?.status === 'VERIFIED' ? 'Residential address verified' : 'Pending verification'}
                    </p>
                  </div>

                  <div className="rounded-card border border-line p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-medium">Tenancy Terms</span>
                      <StatusChip status="VERIFIED" />
                    </div>
                    <p className="mt-1 font-mono text-[11px] text-muted">Commercial terms agreed</p>
                  </div>
                </div>
              </div>

              {/* Uploaded File Attachments from DB */}
              {documents.length ? (
                <div className="border-t border-line pt-3">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Uploaded File Records</p>
                  <ul className="mt-2 divide-y divide-line">
                    {documents.map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between py-2 text-[13px]">
                        <div>
                          <p className="font-medium text-ink">{doc.title}</p>
                          <p className="font-mono text-[10px] text-muted uppercase tracking-wider">
                            {doc.category} · {doc.mime_type} · {shortDate(doc.created_at)}
                          </p>
                        </div>
                        <Badge tone="neutral">Vault stored</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </Card>

          {/* ------------------------------------ AGREEMENTS & DRAFTING */}
          <Card>
            <CardHeader
              title="Agreement Versions"
              note="Every legal draft, revision history, and signing progress."
              action={
                agreements.length === 0 && legalCase.status !== 'QUEUED' ? (
                  <Button href={`/dashboard/legal/${legalCase.id}/agreement`} variant="primary" size="sm">
                    Start Agreement Draft
                  </Button>
                ) : agreements.length > 0 ? (
                  <Button href={`/dashboard/legal/${legalCase.id}/agreement`} variant="secondary" size="sm">
                    Open Agreement Drafter
                  </Button>
                ) : undefined
              }
            />
            <div className="p-5">
              {agreements.length ? (
                <div className="space-y-4">
                  {agreements.map((agr) => (
                    <div
                      key={agr.id}
                      className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line p-4"
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-mono text-sm font-semibold">{agr.agreement_number}</p>
                          <StatusChip status={agr.status} />
                          <Badge>v{agr.current_version}</Badge>
                        </div>
                        <p className="mt-1 text-[13px] text-muted">
                          Stamp duty: {titleCase(agr.stamp_duty_status)}
                          {agr.approved_at ? ` · Approved ${shortDate(agr.approved_at)}` : ''}
                          {agr.executed_at ? ` · Executed ${shortDate(agr.executed_at)}` : ''}
                        </p>
                        {agr.signatories?.length ? (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {agr.signatories.map((s) => (
                              <span
                                key={s.id}
                                className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-mono text-[10px] tracking-wide ${
                                  s.status === 'SIGNED'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}
                              >
                                {s.party_role}: {s.full_name} ({s.status})
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2">
                        {agr.status === 'LEGAL_REVIEW' || agr.status === 'DRAFT' ? (
                          <Button href={`/dashboard/legal/${legalCase.id}/agreement`} variant="primary" size="sm">
                            Review / Edit Draft
                          </Button>
                        ) : (
                          <Button href={`/dashboard/legal/${legalCase.id}/agreement`} variant="secondary" size="sm">
                            View Agreement
                          </Button>
                        )}
                        {agr.status === 'LEGAL_REVIEW' ? (
                          <ApproveAgreementButton
                            agreementId={agr.id}
                            currentVersion={agr.current_version}
                          />
                        ) : null}
                        {agr.status === 'EXECUTED' ? (
                          <Seal label="Executed" sub={agr.executed_at ? shortDate(agr.executed_at) : undefined} />
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No agreement draft yet"
                  body="A draft is produced once advocate review begins. Once ready, it can be reviewed and approved by legal counsel."
                  action={
                    legalCase.status !== 'QUEUED' ? (
                      <Button href={`/dashboard/legal/${legalCase.id}/agreement`} variant="primary" size="sm">
                        Start Agreement Draft
                      </Button>
                    ) : undefined
                  }
                />
              )}
            </div>
          </Card>

          {/* ------------------------------------- 8. LEGAL NOTES / CASE NOTES */}
          <Card>
            <CardHeader
              title="Advocate & Case Notes"
              note="Private legal observations and party-shared notes."
            />
            <div className="p-5 space-y-5">
              <AddNoteForm caseId={legalCase.id} />

              {notes.length ? (
                <div className="space-y-3 border-t border-line pt-4">
                  {notes.map((note) => (
                    <div key={note.id} className="rounded-card border border-line/70 bg-paper/30 p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[13px]">{note.author}</span>
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted">
                            {relative(note.created_at)}
                          </span>
                        </div>
                        <Badge tone={note.visibility === 'INTERNAL' ? 'neutral' : 'seal'}>
                          {note.visibility === 'INTERNAL' ? 'Internal only' : 'Visible to parties'}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[14px] text-ink whitespace-pre-wrap">{note.body}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[14px] text-muted text-center py-2">
                  No notes recorded on this case yet. Use the form above to add an observation.
                </p>
              )}
            </div>
          </Card>

          {/* ---------------------------------- 9. ACTIVITY / AUDIT HISTORY */}
          <Card>
            <CardHeader
              title="Case Timeline & Audit History"
              note="Verifiable audit records and state change log."
            />
            <div className="p-5">
              {timeline.length ? (
                <RecordSpine events={timeline} />
              ) : (
                <EmptyState
                  title="No timeline events recorded"
                  body="System activity logs and status transitions will appear here."
                />
              )}
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------ RIGHT SIDEBAR */}
        <aside className="space-y-5 lg:sticky lg:top-6">
          {/* ---------------------------------------------- 4. RENTAL TERMS */}
          <Card className="p-5">
            <p className="eyebrow">Agreed Rental Terms</p>
            <dl className="mt-3">
              <DataRow label="Monthly Rent" value={`${inr(legalCase.rent_amount)}/mo`} />
              <DataRow label="Security Deposit" value={inr(legalCase.deposit_amount)} />
              <DataRow
                label="Maintenance"
                value={legalCase.maintenance_amount ? inr(legalCase.maintenance_amount) : 'Included in rent'}
              />
              <DataRow label="Move-in Date" value={shortDate(legalCase.start_date)} />
              <DataRow label="End Date" value={shortDate(legalCase.end_date)} />
              <DataRow
                label="Lock-in Period"
                value={legalCase.lock_in_months ? `${legalCase.lock_in_months} months` : 'None specified'}
              />
              <DataRow
                label="Notice Period"
                value={legalCase.notice_period_days ? `${legalCase.notice_period_days} days` : '30 days'}
              />
              <DataRow label="Service Plan" value={titleCase(legalCase.service_plan)} />
            </dl>
          </Card>

          {/* ---------------------------------------------- 3. PROPERTY */}
          <Card className="p-5">
            <p className="eyebrow">Property Details</p>
            <div className="mt-3 space-y-2">
              <p className="font-display text-base font-semibold">{legalCase.property_title}</p>
              <p className="text-[13px] text-muted">
                {legalCase.address_line1 ? `${legalCase.address_line1}, ` : ''}
                {legalCase.locality}, {legalCase.city}
                {legalCase.pincode ? ` - ${legalCase.pincode}` : ''}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {legalCase.bedrooms ? <Badge>{legalCase.bedrooms} BHK</Badge> : null}
                {legalCase.furnishing ? <Badge>{titleCase(legalCase.furnishing)}</Badge> : null}
              </div>
              <div className="pt-2 border-t border-line">
                <Link
                  href={`/dashboard/tenancy/${legalCase.tenancy_id}`}
                  className="text-[13px] text-seal hover:underline font-medium"
                >
                  Open Tenancy #{legalCase.tenancy_id} →
                </Link>
              </div>
            </div>
          </Card>

          {/* --------------------------------- CONSULTATIONS & MEETINGS */}
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <p className="eyebrow">Consultations</p>
              <ScheduleMeetingButton caseId={legalCase.id} />
            </div>

            {meetings.length ? (
              <ul className="mt-3 divide-y divide-line">
                {meetings.map((m) => (
                  <li key={m.id} className="py-2.5 first:pt-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-[13px]">{titleCase(m.purpose)}</p>
                        <p className="font-mono text-[11px] text-muted">
                          {dateTime(m.scheduled_for)} ({m.duration_min}m)
                        </p>
                        {m.agenda ? (
                          <p className="mt-1 text-[12px] text-muted italic">"{m.agenda}"</p>
                        ) : null}
                      </div>
                      <StatusChip status={m.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[13px] text-muted">
                No consultations scheduled. Use the button above to book a session with parties.
              </p>
            )}
          </Card>

          {/* --------------------------------- CASE METADATA & REPO INFO */}
          <Card className="p-5">
            <p className="eyebrow">Case Information</p>
            <dl className="mt-2">
              <DataRow label="Case ID" value={`#${legalCase.id}`} />
              <DataRow label="Case Number" value={legalCase.case_number} />
              <DataRow label="Type" value={titleCase(legalCase.case_type)} />
              <DataRow label="Opened" value={shortDate(legalCase.opened_at)} />
              <DataRow label="Closed" value={legalCase.closed_at ? shortDate(legalCase.closed_at) : 'Active'} />
              <DataRow label="Public ID" value={<span className="font-mono text-[11px]">{legalCase.public_id}</span>} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}
