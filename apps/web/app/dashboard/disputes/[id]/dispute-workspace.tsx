'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Badge, Button, Card, CardHeader, StatusChip } from '@/components/ui';
import { inr, relative, shortDate } from '@/lib/format';

type DisputeDetail = {
  dispute: {
    id: number;
    public_id: string;
    case_number: string;
    category: string;
    summary: string;
    detail?: string;
    amount_claimed?: number;
    status: string;
    resolution?: string;
    resolved_at?: string;
    created_at: string;
    updated_at: string;
    tenancy_id: number;
    tenancy_stage: string;
    rent_amount: number;
    deposit_amount: number;
    tenancy_start_date?: string;
    tenancy_end_date?: string;
    property_id: number;
    property_title: string;
    locality?: string;
    city?: string;
    address_line1?: string;
    raised_by: number;
    raised_by_name: string;
    raised_by_email?: string;
    against_user_id?: number;
    against_user_name?: string;
    against_user_email?: string;
    assigned_to?: number;
    assigned_to_name?: string;
    assigned_to_email?: string;
    legal_case_id?: number;
    legal_case_number?: string;
    legal_case_status?: string;
    legal_case_type?: string;
  };
  evidence: Array<{
    id: number;
    evidence_type: string;
    description?: string;
    created_at: string;
    document_id?: number;
    inspection_id?: number;
    payment_id?: number;
    submitted_by_name: string;
    document_title?: string;
    document_storage_key?: string;
    inspection_report_number?: string;
    payment_reference?: string;
    payment_amount?: number;
    payment_status?: string;
  }>;
  conversation: {
    id: number;
    messages: Array<{
      id: number;
      body: string;
      document_id?: number;
      created_at: string;
      sender_id: number;
      sender_name: string;
      sender_email?: string;
    }>;
  };
  timeline: Array<{
    id: number;
    event_code: string;
    title: string;
    created_at: string;
    actor_name?: string;
  }>;
  financialPayments: Array<{
    id: number;
    reference_code: string;
    purpose: string;
    amount: number;
    total_amount: number;
    status: string;
    due_date?: string;
    notes?: string;
    created_at: string;
    payer_name: string;
    payee_name?: string;
  }>;
};

type AuthUser = {
  id: number;
  fullName: string;
  roles: string[];
  permissions: string[];
};

export function DisputeWorkspace({
  data,
  currentUser,
}: {
  data: DisputeDetail;
  currentUser: AuthUser;
}) {
  const router = useRouter();
  const { dispute, evidence, conversation, timeline, financialPayments } = data;

  const isStaff =
    currentUser.permissions.includes('dispute.manage') ||
    currentUser.permissions.includes('legal.case.manage') ||
    currentUser.roles.includes('SUPER_ADMIN') ||
    currentUser.roles.includes('ADMIN');

  const isParty = [dispute.raised_by, dispute.against_user_id].includes(currentUser.id);

  // Modals & form state
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [evidenceType, setEvidenceType] = useState('DOCUMENT');
  const [evidenceDesc, setEvidenceDesc] = useState('');
  const [evidenceDocId, setEvidenceDocId] = useState('');
  const [evidenceInspId, setEvidenceInspId] = useState('');
  const [evidencePayId, setEvidencePayId] = useState('');
  const [isSubmittingEvidence, setIsSubmittingEvidence] = useState(false);

  // Message state
  const [messageBody, setMessageBody] = useState('');
  const [isEvidenceRequest, setIsEvidenceRequest] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);

  // Management Action Modals
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigneeId, setAssigneeId] = useState(dispute.assigned_to ? String(dispute.assigned_to) : String(currentUser.id));
  
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [escalatePriority, setEscalatePriority] = useState('HIGH');

  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [includeFinancial, setIncludeFinancial] = useState(Boolean(dispute.amount_claimed && dispute.amount_claimed > 0));
  const [finAmount, setFinAmount] = useState(dispute.amount_claimed ? String(dispute.amount_claimed) : '');
  const [finPayerId, setFinPayerId] = useState(dispute.against_user_id ? String(dispute.against_user_id) : String(dispute.raised_by));
  const [finPayeeId, setFinPayeeId] = useState(dispute.against_user_id ? String(dispute.raised_by) : '');
  const [finPurpose, setFinPurpose] = useState('REFUND');
  const [finDueDate, setFinDueDate] = useState(new Date().toISOString().slice(0, 10));
  const [finNotes, setFinNotes] = useState('');

  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Handlers
  async function handleAddEvidence(e: React.FormEvent) {
    e.preventDefault();
    if (!evidenceDesc.trim()) return;
    setIsSubmittingEvidence(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/disputes/${dispute.id}/evidence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          evidenceType,
          description: evidenceDesc.trim(),
          documentId: evidenceDocId ? Number(evidenceDocId) : undefined,
          inspectionId: evidenceInspId ? Number(evidenceInspId) : undefined,
          paymentId: evidencePayId ? Number(evidencePayId) : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to submit evidence.');
      }
      setShowEvidenceModal(false);
      setEvidenceDesc('');
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSubmittingEvidence(false);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!messageBody.trim()) return;
    setIsSendingMessage(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/disputes/${dispute.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: messageBody.trim(),
          isEvidenceRequest,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to send message.');
      }
      setMessageBody('');
      setIsEvidenceRequest(false);
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setIsSendingMessage(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/disputes/${dispute.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo: Number(assigneeId) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to assign dispute.');
      }
      setShowAssignModal(false);
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleEscalateLegal(e: React.FormEvent) {
    e.preventDefault();
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/disputes/${dispute.id}/escalate-legal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: escalateReason.trim() || undefined,
          priority: escalatePriority,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to escalate to legal.');
      }
      setShowEscalateModal(false);
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    if (!resolutionText.trim()) {
      setActionError('Resolution details and reasoning are required.');
      return;
    }
    setActionLoading(true);
    setActionError(null);

    try {
      const payload: any = {
        resolution: resolutionText.trim(),
        status: 'RESOLVED',
      };

      if (includeFinancial) {
        if (!finAmount || Number(finAmount) <= 0) {
          throw new Error('Financial resolution amount must be greater than zero.');
        }
        payload.financialDecision = {
          amount: Number(finAmount),
          payerUserId: Number(finPayerId),
          payeeUserId: finPayeeId ? Number(finPayeeId) : undefined,
          purpose: finPurpose,
          dueDate: finDueDate || undefined,
          notes: finNotes.trim() || undefined,
        };
      }

      const res = await fetch(`/api/disputes/${dispute.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to record resolution.');
      }
      setShowResolveModal(false);
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleReopen(e: React.FormEvent) {
    e.preventDefault();
    if (!reopenReason.trim()) {
      setActionError('Please specify the reason for reopening.');
      return;
    }
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/disputes/${dispute.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to reopen dispute.');
      }
      setShowReopenModal(false);
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCloseDispute() {
    if (!confirm('Are you sure you want to mark this dispute as CLOSED?')) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/disputes/${dispute.id}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Closed by Odibrick Management' }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to close dispute.');
      }
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleTenancyHoldToggle(action: 'HOLD' | 'RESUME') {
    if (!confirm(`Are you sure you want to ${action} this tenancy?`)) return;
    setActionLoading(true);
    setActionError(null);

    try {
      const res = await fetch(`/api/tenancies/${dispute.tenancy_id}/admin-override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          reason: `Administrative hold management during dispute ${dispute.case_number}`,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || `Failed to ${action} tenancy.`);
      }
      router.refresh();
    } catch (err: any) {
      setActionError(err.message);
    } finally {
      setActionLoading(false);
    }
  }

  const isResolved = ['RESOLVED', 'CLOSED'].includes(dispute.status);

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Link href="/dashboard/disputes" className="hover:text-ink hover:underline">
          Disputes
        </Link>
        <span>/</span>
        <span className="font-mono text-ink font-semibold">{dispute.case_number}</span>
      </div>

      {/* Global Error Banner */}
      {actionError && (
        <div className="rounded-card border border-alert/30 bg-alert/10 p-4 text-[14px] text-alert flex items-center justify-between">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-xs font-mono uppercase underline">
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Header & Primary Case Bar */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-2xl font-bold tracking-tight text-ink">
              {dispute.case_number}
            </h1>
            <StatusChip status={dispute.status} />
            <Badge tone="seal">{dispute.category.replace(/_/g, ' ')}</Badge>
          </div>
          <p className="mt-1 font-display text-lg font-medium text-ink">{dispute.summary}</p>
          <p className="text-xs text-muted mt-0.5">
            Property: <span className="text-ink font-medium">{dispute.property_title}</span> ({dispute.city}) · Raised {relative(dispute.created_at)} ({shortDate(dispute.created_at)})
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          {(isParty || isStaff) && !isResolved && (
            <Button size="sm" variant="secondary" onClick={() => setShowEvidenceModal(true)}>
              📎 Submit Evidence
            </Button>
          )}

          {isStaff && (
            <>
              {!isResolved && (
                <>
                  <Button size="sm" variant="secondary" onClick={() => setShowAssignModal(true)}>
                    👤 {dispute.assigned_to ? 'Reassign' : 'Assign'}
                  </Button>
                  {dispute.status !== 'LEGAL_REVIEW' && (
                    <Button size="sm" variant="secondary" onClick={() => setShowEscalateModal(true)}>
                      ⚖️ Escalate to Legal
                    </Button>
                  )}
                  <Button size="sm" variant="primary" onClick={() => setShowResolveModal(true)}>
                    ✓ Record Resolution
                  </Button>
                </>
              )}

              {isResolved && (
                <Button size="sm" variant="secondary" onClick={() => setShowReopenModal(true)}>
                  🔄 Reopen Dispute
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Top Level Case Metrics */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-card border border-line bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Claimed Amount</p>
          <p className="mt-1 font-display text-xl font-bold text-ink">
            {dispute.amount_claimed ? inr(dispute.amount_claimed) : 'Non-monetary'}
          </p>
          <p className="text-[12px] text-muted mt-0.5">Disputed Claim</p>
        </div>

        <div className="rounded-card border border-line bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Tenancy Stage</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-display text-xl font-bold text-ink">{dispute.tenancy_stage}</span>
            {dispute.tenancy_stage === 'ON_HOLD' && <Badge tone="alert">ADMIN HOLD</Badge>}
          </div>
          <p className="text-[12px] text-muted mt-0.5">Deposit: {inr(dispute.deposit_amount)}</p>
        </div>

        <div className="rounded-card border border-line bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Assigned Reviewer</p>
          <p className="mt-1 font-display text-base font-bold text-ink truncate">
            {dispute.assigned_to_name || 'Odibrick Operations'}
          </p>
          <p className="text-[12px] text-muted mt-0.5">{dispute.assigned_to_email || 'Central Queue'}</p>
        </div>

        <div className="rounded-card border border-line bg-white p-4">
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">Legal Integration</p>
          <p className="mt-1 font-display text-base font-bold text-ink truncate">
            {dispute.legal_case_number || 'None'}
          </p>
          <p className="text-[12px] text-muted mt-0.5">
            {dispute.legal_case_status ? `Status: ${dispute.legal_case_status}` : 'Not escalated'}
          </p>
        </div>
      </div>

      {/* Main 2-Column Content Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Columns: Dispute Detail, Evidence, Resolution, Communications */}
        <div className="lg:col-span-2 space-y-6">

          {/* 6. Current Status & Next Actions Banner */}
          <div className="rounded-card border border-line bg-paper/60 p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-seal-deep font-semibold">
              Current Dispute Governance Stage
            </p>
            <p className="mt-1 text-[14px] text-ink font-medium">
              {dispute.status === 'OPEN' && 'Dispute is OPEN. Initial claim raised; waiting for evidence or assignment.'}
              {dispute.status === 'EVIDENCE_SUBMITTED' && 'Evidence has been submitted. Reviewer is evaluating supporting records.'}
              {dispute.status === 'UNDER_REVIEW' && 'Dispute is UNDER REVIEW by Odibrick Management. Parties may be asked for clarifications.'}
              {dispute.status === 'LEGAL_REVIEW' && `Dispute is in LEGAL REVIEW (${dispute.legal_case_number || 'Legal Case'}). Legal team is analyzing legal provisions and tenancy agreement.`}
              {dispute.status === 'RESOLUTION_PROPOSED' && 'Binding resolution has been proposed by Odibrick Management.'}
              {dispute.status === 'RESOLVED' && 'Dispute has been RESOLVED with formal management ruling and binding obligations.'}
              {dispute.status === 'CLOSED' && 'Dispute is CLOSED.'}
              {dispute.status === 'WITHDRAWN' && 'Dispute was withdrawn by the raising party.'}
            </p>
          </div>

          {/* 5. Statement of Facts & Claim Detail */}
          <Card>
            <CardHeader title="Statement of Facts & Detailed Claim" />
            <div className="p-5 space-y-4">
              <div className="rounded-card border border-line/70 bg-paper/30 p-4">
                <p className="text-[14px] text-ink whitespace-pre-wrap leading-relaxed">
                  {dispute.detail || dispute.summary}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs text-muted pt-2 border-t border-line">
                <div>
                  <span className="font-mono uppercase tracking-wider block">Raised By</span>
                  <span className="text-ink font-medium text-[13px]">{dispute.raised_by_name}</span> ({dispute.raised_by_email})
                </div>
                <div>
                  <span className="font-mono uppercase tracking-wider block">Against Party</span>
                  <span className="text-ink font-medium text-[13px]">{dispute.against_user_name || 'Counterparty'}</span> ({dispute.against_user_email})
                </div>
              </div>
            </div>
          </Card>

          {/* 11 & 12. Management Resolution & Financial Adjustment Card */}
          {dispute.resolution && (
            <Card className="border-seal/40 bg-seal-soft/10">
              <CardHeader
                title="Official Odibrick Resolution"
                note={dispute.resolved_at ? `Determined on ${shortDate(dispute.resolved_at)}` : 'Active Resolution'}
              />
              <div className="p-5 space-y-4">
                <div className="rounded-card border border-seal/30 bg-white p-4">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-seal font-semibold mb-1">
                    Binding Governance Ruling
                  </p>
                  <p className="text-[14px] text-ink whitespace-pre-wrap leading-relaxed">
                    {dispute.resolution}
                  </p>
                </div>

                {/* Financial Resolution Payments */}
                {financialPayments.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <p className="font-mono text-xs uppercase tracking-wider text-muted">
                      Associated Financial Obligations:
                    </p>
                    <div className="space-y-2">
                      {financialPayments.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-3 rounded-card border border-line bg-white p-3 text-[14px]"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-semibold text-ink">{p.reference_code}</span>
                              <Badge tone="ochre">{p.purpose}</Badge>
                              <StatusChip status={p.status} />
                            </div>
                            <p className="text-xs text-muted mt-0.5">
                              Payer: <span className="text-ink font-medium">{p.payer_name}</span>
                              {p.payee_name && <span> → Payee: <span className="text-ink font-medium">{p.payee_name}</span></span>}
                              {p.due_date && <span> · Due: {shortDate(p.due_date)}</span>}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-base font-bold tabular text-ink">
                              {inr(p.amount)}
                            </span>
                            <Link
                              href="/dashboard/payments"
                              className="rounded-card border border-line bg-paper px-3 py-1.5 text-xs font-medium text-ink hover:border-seal"
                            >
                              Payments →
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* 8. Evidence Vault */}
          <Card>
            <CardHeader
              title={`Evidence Vault (${evidence.length})`}
              note="All documents, condition reports, receipts, and media submitted by parties."
              action={
                !isResolved && (
                  <Button size="sm" variant="secondary" onClick={() => setShowEvidenceModal(true)}>
                    + Add Evidence
                  </Button>
                )
              }
            />
            <div className="p-5">
              {evidence.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted">
                  No evidence has been submitted for this dispute yet.
                </div>
              ) : (
                <div className="divide-y divide-line">
                  {evidence.map((item) => (
                    <div key={item.id} className="py-3 flex items-start justify-between gap-4 text-sm">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge tone="seal">{item.evidence_type.replace(/_/g, ' ')}</Badge>
                          <span className="text-xs text-muted">
                            Submitted by <span className="font-medium text-ink">{item.submitted_by_name}</span> · {relative(item.created_at)}
                          </span>
                        </div>
                        <p className="text-ink text-[14px]">{item.description || 'No description provided.'}</p>
                        
                        {/* Linked Records */}
                        {item.document_title && (
                          <p className="text-xs text-muted font-mono">
                            📄 Linked Document: {item.document_title}
                          </p>
                        )}
                        {item.inspection_report_number && (
                          <p className="text-xs text-muted font-mono">
                            🔍 Linked Report: {item.inspection_report_number}
                          </p>
                        )}
                        {item.payment_reference && (
                          <p className="text-xs text-muted font-mono">
                            💳 Linked Payment: {item.payment_reference} ({inr(item.payment_amount || 0)}) [{item.payment_status}]
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* 10. In-Platform Dispute Communications & Counterparty Responses */}
          <Card>
            <CardHeader
              title="Dispute Communications & Responses"
              note="Direct auditable correspondence between tenant, owner, and Odibrick governance."
            />
            <div className="p-5 space-y-4">
              {/* Messages feed */}
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {conversation.messages.length === 0 ? (
                  <p className="text-xs text-muted py-4 text-center">No messages recorded yet.</p>
                ) : (
                  conversation.messages.map((m) => {
                    const isSelf = m.sender_id === currentUser.id;
                    return (
                      <div
                        key={m.id}
                        className={`rounded-card p-3 text-sm space-y-1 ${
                          isSelf ? 'bg-seal-soft/40 border border-seal/20 ml-6' : 'bg-paper/80 border border-line mr-6'
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs text-muted">
                          <span className="font-medium text-ink">{m.sender_name}</span>
                          <span>{relative(m.created_at)}</span>
                        </div>
                        <p className="text-ink text-[14px] whitespace-pre-wrap">{m.body}</p>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Message Composer */}
              <form onSubmit={handleSendMessage} className="space-y-3 pt-3 border-t border-line">
                <textarea
                  rows={3}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Type a message or formal response..."
                  className="w-full rounded-card border border-line bg-white p-3 text-[14px] text-ink focus:border-seal focus:outline-none"
                  required
                />

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {isStaff && (
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-amber-900 font-medium bg-amber-50 px-2.5 py-1.5 rounded border border-amber-200">
                      <input
                        type="checkbox"
                        checked={isEvidenceRequest}
                        onChange={(e) => setIsEvidenceRequest(e.target.checked)}
                      />
                      <span>Flag as Formal Evidence Request</span>
                    </label>
                  )}

                  <div className="ml-auto">
                    <Button type="submit" size="sm" disabled={isSendingMessage}>
                      {isSendingMessage ? 'Sending...' : 'Send Message'}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </Card>
        </div>

        {/* Right 1 Column: Tenancy, Parties, Management Actions, Timeline */}
        <div className="space-y-6">

          {/* 3 & 4. Tenancy & Property Summary */}
          <Card>
            <CardHeader title="Tenancy & Property" />
            <div className="p-5 space-y-3 text-sm">
              <div>
                <p className="text-xs font-mono uppercase text-muted">Property</p>
                <p className="font-medium text-ink">{dispute.property_title}</p>
                <p className="text-xs text-muted">{dispute.address_line1}, {dispute.locality}, {dispute.city}</p>
              </div>

              <div className="pt-2 border-t border-line">
                <p className="text-xs font-mono uppercase text-muted">Tenancy Reference</p>
                <p className="font-medium text-ink">Tenancy #{dispute.tenancy_id}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-muted">Stage:</span>
                  <StatusChip status={dispute.tenancy_stage} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line text-xs">
                <div>
                  <span className="text-muted block">Monthly Rent</span>
                  <span className="font-medium text-ink font-mono">{inr(dispute.rent_amount)}</span>
                </div>
                <div>
                  <span className="text-muted block">Deposit</span>
                  <span className="font-medium text-ink font-mono">{inr(dispute.deposit_amount)}</span>
                </div>
              </div>

              {/* Administrative Tenancy Hold Controls for Management */}
              {isStaff && (
                <div className="pt-3 border-t border-line space-y-2">
                  <p className="text-xs font-mono uppercase tracking-wider text-muted">
                    Administrative Governance Override
                  </p>
                  {dispute.tenancy_stage === 'ON_HOLD' ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      full
                      disabled={actionLoading}
                      onClick={() => handleTenancyHoldToggle('RESUME')}
                    >
                      ▶️ Resume Tenancy from Hold
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="secondary"
                      full
                      disabled={actionLoading}
                      onClick={() => handleTenancyHoldToggle('HOLD')}
                    >
                      ⏸️ Place Tenancy on Administrative Hold
                    </Button>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* 13. Audit & Activity Timeline */}
          <Card>
            <CardHeader title="Activity & Timeline Trace" note="Auditable event stream" />
            <div className="p-5">
              {timeline.length === 0 ? (
                <p className="text-xs text-muted">No timeline events recorded yet.</p>
              ) : (
                <div className="space-y-3">
                  {timeline.map((item) => (
                    <div key={item.id} className="text-xs space-y-0.5 border-l-2 border-seal pl-3 py-0.5">
                      <p className="font-medium text-ink">{item.title}</p>
                      <p className="text-muted">
                        {shortDate(item.created_at)} · {item.actor_name || 'System'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* Management Closure */}
          {isStaff && !isResolved && (
            <div className="pt-2">
              <Button
                variant="ghost"
                size="sm"
                full
                className="text-muted hover:text-alert"
                onClick={handleCloseDispute}
                disabled={actionLoading}
              >
                Close Dispute Directly
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ======================= MODALS ======================= */}

      {/* Modal: Submit Evidence */}
      {showEvidenceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-card bg-white p-6 shadow-card space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">Submit Evidence</h2>
            <form onSubmit={handleAddEvidence} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Evidence Type</label>
                <select
                  value={evidenceType}
                  onChange={(e) => setEvidenceType(e.target.value)}
                  className="w-full rounded-card border border-line p-2 text-sm"
                >
                  <option value="DOCUMENT">Document</option>
                  <option value="INSPECTION_REPORT">Inspection Report</option>
                  <option value="PAYMENT_RECORD">Payment Record</option>
                  <option value="PHOTO">Photo</option>
                  <option value="VIDEO">Video</option>
                  <option value="MESSAGE">Message / Communication</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Description & Context <span className="text-alert">*</span></label>
                <textarea
                  rows={3}
                  value={evidenceDesc}
                  onChange={(e) => setEvidenceDesc(e.target.value)}
                  placeholder="Explain what this evidence shows..."
                  className="w-full rounded-card border border-line p-2 text-sm"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button variant="secondary" size="sm" onClick={() => setShowEvidenceModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={isSubmittingEvidence}>
                  {isSubmittingEvidence ? 'Submitting...' : 'Add Evidence'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Assign / Reassign */}
      {showAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-card space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">Assign Dispute Reviewer</h2>
            <form onSubmit={handleAssign} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Assignee User ID</label>
                <input
                  type="number"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  placeholder="Staff User ID"
                  className="w-full rounded-card border border-line p-2 text-sm"
                  required
                />
                <p className="text-xs text-muted mt-1">
                  Enter staff user ID. Your user ID: <span className="font-mono text-ink font-semibold">{currentUser.id}</span> ({currentUser.fullName})
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button variant="secondary" size="sm" onClick={() => setShowAssignModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={actionLoading}>
                  {actionLoading ? 'Assigning...' : 'Confirm Assignment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Escalate to Legal */}
      {showEscalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-card bg-white p-6 shadow-card space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">Escalate Dispute to Legal Team</h2>
            <p className="text-xs text-muted">
              Creates or links an official legal case record in the Legal Queue with case type DISPUTE.
            </p>
            <form onSubmit={handleEscalateLegal} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Priority</label>
                <select
                  value={escalatePriority}
                  onChange={(e) => setEscalatePriority(e.target.value)}
                  className="w-full rounded-card border border-line p-2 text-sm"
                >
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-muted mb-1">Reason for Legal Escalation</label>
                <textarea
                  rows={3}
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  placeholder="e.g. Legal interpretation of clause 14 regarding deposit forfeit..."
                  className="w-full rounded-card border border-line p-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button variant="secondary" size="sm" onClick={() => setShowEscalateModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={actionLoading}>
                  {actionLoading ? 'Escalating...' : 'Confirm Legal Escalation'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Formal Resolution */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-card bg-white p-6 shadow-card space-y-4 my-8">
            <h2 className="font-display text-xl font-semibold text-ink">Record Binding Management Resolution</h2>
            <form onSubmit={handleResolve} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">
                  Formal Resolution Text & Reasoning <span className="text-alert">*</span>
                </label>
                <textarea
                  rows={4}
                  value={resolutionText}
                  onChange={(e) => setResolutionText(e.target.value)}
                  placeholder="State the final ruling, reasoning, factual findings, and directives for both parties."
                  className="w-full rounded-card border border-line p-3 text-sm"
                  required
                />
              </div>

              {/* Financial Resolution Configuration */}
              <div className="border border-line rounded-card p-4 bg-paper/40 space-y-3">
                <label className="flex items-center gap-2 cursor-pointer text-[14px] font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={includeFinancial}
                    onChange={(e) => setIncludeFinancial(e.target.checked)}
                  />
                  <span>Apply Financial Resolution / Create Settlement Payment</span>
                </label>

                {includeFinancial && (
                  <div className="space-y-3 pt-3 border-t border-line text-xs">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-muted mb-1 font-medium">Payment Purpose</label>
                        <select
                          value={finPurpose}
                          onChange={(e) => setFinPurpose(e.target.value)}
                          className="w-full rounded border border-line p-2 bg-white"
                        >
                          <option value="REFUND">REFUND (Deposit / Rent Refund)</option>
                          <option value="MAINTENANCE">MAINTENANCE (Repair Costs)</option>
                          <option value="SERVICE_FEE">SERVICE_FEE (Administrative Fee)</option>
                          <option value="PENALTY">PENALTY (Damage / Breach Charge)</option>
                          <option value="MONTHLY_RENT">MONTHLY_RENT (Rent Adjustment)</option>
                          <option value="OTHER">OTHER</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-muted mb-1 font-medium">Adjustment Amount (INR)</label>
                        <input
                          type="number"
                          min="1"
                          value={finAmount}
                          onChange={(e) => setFinAmount(e.target.value)}
                          placeholder="Amount in INR"
                          className="w-full rounded border border-line p-2 bg-white font-mono"
                          required={includeFinancial}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-muted mb-1 font-medium">Payer User ID</label>
                        <input
                          type="number"
                          value={finPayerId}
                          onChange={(e) => setFinPayerId(e.target.value)}
                          placeholder="Payer ID"
                          className="w-full rounded border border-line p-2 bg-white font-mono"
                          required={includeFinancial}
                        />
                        <span className="text-[10px] text-muted">
                          Tenant: {dispute.raised_by === dispute.against_user_id ? 'N/A' : dispute.raised_by} · Owner: {dispute.against_user_id}
                        </span>
                      </div>

                      <div>
                        <label className="block text-muted mb-1 font-medium">Payee User ID (Optional)</label>
                        <input
                          type="number"
                          value={finPayeeId}
                          onChange={(e) => setFinPayeeId(e.target.value)}
                          placeholder="Leave blank for platform"
                          className="w-full rounded border border-line p-2 bg-white font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-muted mb-1 font-medium">Due Date</label>
                      <input
                        type="date"
                        value={finDueDate}
                        onChange={(e) => setFinDueDate(e.target.value)}
                        className="w-full rounded border border-line p-2 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button variant="secondary" size="sm" onClick={() => setShowResolveModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={actionLoading}>
                  {actionLoading ? 'Recording...' : 'Finalize Binding Resolution'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reopen Dispute */}
      {showReopenModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-card space-y-4">
            <h2 className="font-display text-xl font-semibold text-ink">Reopen Dispute</h2>
            <form onSubmit={handleReopen} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Reason for Reopening <span className="text-alert">*</span></label>
                <textarea
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="State why this resolved/closed dispute is being reopened..."
                  className="w-full rounded-card border border-line p-2 text-sm"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <Button variant="secondary" size="sm" onClick={() => setShowReopenModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={actionLoading}>
                  {actionLoading ? 'Reopening...' : 'Confirm Reopen'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
