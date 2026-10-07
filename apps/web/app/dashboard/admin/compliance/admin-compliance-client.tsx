'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, Button, StatusChip, Badge, EmptyState, ErrorNote, StatTile } from '@/components/ui';
import { shortDate } from '@/lib/format';

interface ComplianceAnalytics {
  pendingKyc: number;
  pendingDocuments: number;
  rejectedDocuments: number;
  expiringSoon: number;
  expiredDocuments: number;
  complianceExceptions: number;
  verifiedToday: number;
}

interface KycQueueItem {
  id: number;
  user_id: number;
  legal_name: string;
  subject_type: string;
  id_type: string;
  id_last4?: string;
  status: string;
  submitted_at: string;
  reviewed_at?: string;
  expires_at?: string;
  rejection_reason?: string;
  internal_notes?: string;
  user_name: string;
  email: string;
  roles?: string;
  document_count: number;
  assigned_verifier_name?: string;
}

interface DocumentQueueItem {
  id: number;
  public_id: string;
  title: string;
  category: string;
  document_type: string;
  context_type?: string;
  context_id?: number;
  mime_type: string;
  size_bytes: number;
  version: number;
  verification_status: string;
  expiry_date?: string;
  rejection_reason?: string;
  internal_notes?: string;
  created_at: string;
  owner_user_id: number;
  owner_name?: string;
  owner_email?: string;
}

interface ExceptionItem {
  id: number;
  public_id: string;
  category: string;
  context_type: string;
  context_id: number;
  user_id?: number;
  title: string;
  description?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: string;
  assigned_to?: number;
  assignee_name?: string;
  resolution_notes?: string;
  override_reason?: string;
  resolver_name?: string;
  created_at: string;
}

export function AdminComplianceClient() {
  const [analytics, setAnalytics] = useState<ComplianceAnalytics | null>(null);
  const [kycQueue, setKycQueue] = useState<KycQueueItem[]>([]);
  const [docQueue, setDocQueue] = useState<DocumentQueueItem[]>([]);
  const [exceptions, setExceptions] = useState<ExceptionItem[]>([]);
  const [allDocs, setAllDocs] = useState<DocumentQueueItem[]>([]);
  const [activeTab, setActiveTab] = useState<'KYC_QUEUE' | 'DOC_QUEUE' | 'EXPIRY' | 'EXCEPTIONS' | 'ALL_DOCS'>('KYC_QUEUE');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');

  // Decision Modal State
  const [decisionModal, setDecisionModal] = useState<{
    type: 'VERIFY_KYC' | 'REJECT_KYC' | 'REQUEST_DOCS_KYC' | 'SUSPEND_KYC' | 'VERIFY_DOC' | 'REJECT_DOC' | 'REPLACE_DOC' | 'RESOLVE_EXC' | 'OVERRIDE_EXC';
    id: number;
    title: string;
  } | null>(null);

  const [modalReason, setModalReason] = useState('');
  const [modalInternalNotes, setModalInternalNotes] = useState('');
  const [modalExpiry, setModalExpiry] = useState('');

  async function loadAllData() {
    try {
      setLoading(true);
      setError(null);
      const [analyticsRes, kycRes, docsUnderReviewRes, excRes, allDocsRes] = await Promise.all([
        api<ComplianceAnalytics>('admin/compliance/analytics').catch(() => null),
        api<{ items: KycQueueItem[] }>('kyc/queue?status=ALL').catch(() => ({ items: [] })),
        api<{ items: DocumentQueueItem[] }>('documents?verificationStatus=UNDER_REVIEW').catch(() => ({ items: [] })),
        api<{ items: ExceptionItem[] }>('compliance/exceptions').catch(() => ({ items: [] })),
        api<{ items: DocumentQueueItem[] }>('documents').catch(() => ({ items: [] })),
      ]);

      if (analyticsRes) setAnalytics(analyticsRes);
      setKycQueue(kycRes.items || []);
      setDocQueue(docsUnderReviewRes.items || []);
      setExceptions(excRes.items || []);
      setAllDocs(allDocsRes.items || []);
    } catch (err: any) {
      setError(err?.message || 'Failed to load compliance queues.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllData();
  }, []);

  async function handleProcessExpiry() {
    try {
      setActionLoading(true);
      setError(null);
      const res = await api<any>('admin/compliance/process-expiry', { method: 'POST' });
      setSuccessMsg(
        `Expiry scan complete: ${res.documentsNotified30d} 30-day notices, ${res.documentsNotified7d} 7-day notices, ${res.documentsExpired} expired documents flagged.`,
      );
      await loadAllData();
    } catch (err: any) {
      setError(err?.message || 'Failed to process expiry.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleExecuteDecision(e: React.FormEvent) {
    e.preventDefault();
    if (!decisionModal) return;

    try {
      setActionLoading(true);
      setError(null);

      const { type, id } = decisionModal;

      if (type === 'VERIFY_KYC') {
        await api(`kyc/${id}/verify`, {
          method: 'POST',
          body: JSON.stringify({
            expiresAt: modalExpiry || undefined,
            internalNotes: modalInternalNotes || undefined,
          }),
        });
        setSuccessMsg('KYC record approved and verified.');
      } else if (type === 'REJECT_KYC') {
        if (!modalReason.trim()) throw new Error('Rejection reason is mandatory.');
        await api(`kyc/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify({
            reason: modalReason.trim(),
            internalNotes: modalInternalNotes || undefined,
          }),
        });
        setSuccessMsg('KYC rejected with correction feedback sent to user.');
      } else if (type === 'REQUEST_DOCS_KYC') {
        if (!modalReason.trim()) throw new Error('Reason for requesting documents is mandatory.');
        await api(`kyc/${id}/request-documents`, {
          method: 'POST',
          body: JSON.stringify({
            reason: modalReason.trim(),
            internalNotes: modalInternalNotes || undefined,
          }),
        });
        setSuccessMsg('Additional documents requested from applicant.');
      } else if (type === 'SUSPEND_KYC') {
        if (!modalReason.trim()) throw new Error('Suspension reason is mandatory.');
        await api(`kyc/${id}/suspend`, {
          method: 'POST',
          body: JSON.stringify({
            reason: modalReason.trim(),
            internalNotes: modalInternalNotes || undefined,
          }),
        });
        setSuccessMsg('KYC status suspended.');
      } else if (type === 'VERIFY_DOC') {
        await api(`documents/${id}/verify`, {
          method: 'POST',
          body: JSON.stringify({ internalNotes: modalInternalNotes || undefined }),
        });
        setSuccessMsg('Document verified and approved.');
      } else if (type === 'REJECT_DOC') {
        if (!modalReason.trim()) throw new Error('Rejection reason is mandatory.');
        await api(`documents/${id}/reject`, {
          method: 'POST',
          body: JSON.stringify({
            reason: modalReason.trim(),
            internalNotes: modalInternalNotes || undefined,
          }),
        });
        setSuccessMsg('Document rejected and applicant notified.');
      } else if (type === 'REPLACE_DOC') {
        if (!modalReason.trim()) throw new Error('Replacement reason is mandatory.');
        await api(`documents/${id}/request-replacement`, {
          method: 'POST',
          body: JSON.stringify({
            reason: modalReason.trim(),
            internalNotes: modalInternalNotes || undefined,
          }),
        });
        setSuccessMsg('Document replacement requested.');
      } else if (type === 'RESOLVE_EXC') {
        if (!modalReason.trim()) throw new Error('Resolution notes are mandatory.');
        await api(`compliance/exceptions/${id}/resolve`, {
          method: 'POST',
          body: JSON.stringify({ resolutionNotes: modalReason.trim() }),
        });
        setSuccessMsg('Compliance exception marked resolved.');
      } else if (type === 'OVERRIDE_EXC') {
        if (!modalReason.trim()) throw new Error('Mandatory override governance reason is required.');
        await api(`compliance/exceptions/${id}/override`, {
          method: 'POST',
          body: JSON.stringify({
            overrideReason: modalReason.trim(),
            resolutionNotes: modalInternalNotes || undefined,
          }),
        });
        setSuccessMsg('Management compliance override executed and logged in audit.');
      }

      setDecisionModal(null);
      setModalReason('');
      setModalInternalNotes('');
      setModalExpiry('');
      await loadAllData();
    } catch (err: any) {
      setError(err?.message || 'Action failed.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleViewDoc(docId: number) {
    try {
      const res = await api<{ url: string }>(`documents/${docId}/link`);
      if (res?.url) window.open(res.url, '_blank');
    } catch (err: any) {
      setError(err?.message || 'Failed to open document.');
    }
  }

  const expiringDocs = allDocs.filter((d) => {
    if (!d.expiry_date) return false;
    const exp = new Date(d.expiry_date);
    const in30 = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    return exp <= in30 || d.verification_status === 'EXPIRED';
  });

  return (
    <div className="space-y-6">
      {/* Control Centre Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-semibold">Compliance & KYC Control Centre</h1>
            <Badge tone="seal">GOVERNED AUTHORITY</Badge>
          </div>
          <p className="mt-1 text-[15px] text-muted">
            Management governance hub for KYC reviews, document verification queues, expiry monitoring, and compliance overrides.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => loadAllData()} disabled={loading}>
            Refresh
          </Button>
          <Button variant="primary" onClick={() => handleProcessExpiry()} disabled={actionLoading}>
            ⚡ Run Expiry Scan
          </Button>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {successMsg ? (
        <div className="rounded-card border border-seal/30 bg-seal-soft px-4 py-3 text-[14px] text-seal-deep flex justify-between items-center">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="font-bold text-seal hover:underline">Dismiss</button>
        </div>
      ) : null}

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <StatTile label="Pending KYC" value={analytics?.pendingKyc ?? kycQueue.filter(k => k.status === 'UNDER_REVIEW' || k.status === 'SUBMITTED').length} />
        <StatTile label="Pending Docs" value={analytics?.pendingDocuments ?? docQueue.length} />
        <StatTile label="Rejected" value={analytics?.rejectedDocuments ?? allDocs.filter(d => d.verification_status === 'REJECTED').length} />
        <StatTile label="Expiring Soon" value={analytics?.expiringSoon ?? 0} />
        <StatTile label="Expired" value={analytics?.expiredDocuments ?? 0} />
        <StatTile label="Exceptions" value={analytics?.complianceExceptions ?? exceptions.filter(e => e.status === 'OPEN').length} />
        <StatTile label="Verified Today" value={analytics?.verifiedToday ?? 0} />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 overflow-x-auto border-b border-line pb-2">
        {(
          [
            { key: 'KYC_QUEUE', label: `KYC Review Queue (${kycQueue.filter(k => k.status === 'UNDER_REVIEW' || k.status === 'SUBMITTED').length})` },
            { key: 'DOC_QUEUE', label: `Document Queue (${docQueue.length})` },
            { key: 'EXPIRY', label: `Expiring & Expired (${expiringDocs.length})` },
            { key: 'EXCEPTIONS', label: `Compliance Exceptions (${exceptions.length})` },
            { key: 'ALL_DOCS', label: `All Vault Documents (${allDocs.length})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`whitespace-nowrap rounded-card px-4 py-2.5 text-[14px] font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-seal text-white'
                : 'bg-white text-muted hover:bg-paper hover:text-ink border border-line'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 1: KYC Review Queue */}
      {activeTab === 'KYC_QUEUE' ? (
        <Card>
          <CardHeader
            title="KYC Submissions Queue"
            note="Verify identity documents against government records"
            action={
              <input
                type="text"
                placeholder="Search applicants..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-card border border-line px-3 py-1.5 text-[13px]"
              />
            }
          />
          {kycQueue.length === 0 ? (
            <div className="p-8 text-center text-muted">No KYC submissions in queue.</div>
          ) : (
            <div className="divide-y divide-line/70">
              {kycQueue
                .filter((k) =>
                  searchQuery ? k.legal_name?.toLowerCase().includes(searchQuery.toLowerCase()) || k.email?.toLowerCase().includes(searchQuery.toLowerCase()) : true,
                )
                .map((kyc) => (
                  <div key={kyc.id} className="flex flex-wrap items-center justify-between gap-4 p-5 text-[14px]">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-base font-semibold text-ink">{kyc.legal_name}</span>
                        <StatusChip status={kyc.status} />
                        <Badge tone="info">{kyc.id_type}</Badge>
                        {kyc.id_last4 ? <span className="font-mono text-[12px] text-muted">•••{kyc.id_last4}</span> : null}
                      </div>
                      <p className="text-[13px] text-muted">
                        User ID: {kyc.user_id} · Email: {kyc.email} · Roles: {kyc.roles || 'USER'} · Submitted: {shortDate(kyc.submitted_at)}
                      </p>
                      {kyc.internal_notes ? (
                        <p className="font-mono text-[12px] text-muted bg-paper p-1.5 rounded border border-line">
                          Internal Note: {kyc.internal_notes}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setDecisionModal({
                            type: 'VERIFY_KYC',
                            id: kyc.id,
                            title: `Approve & Verify KYC: ${kyc.legal_name}`,
                          });
                        }}
                      >
                        ✓ Approve KYC
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setDecisionModal({
                            type: 'REJECT_KYC',
                            id: kyc.id,
                            title: `Reject KYC: ${kyc.legal_name}`,
                          });
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setDecisionModal({
                            type: 'REQUEST_DOCS_KYC',
                            id: kyc.id,
                            title: `Request Additional Documents: ${kyc.legal_name}`,
                          });
                        }}
                      >
                        Request Docs
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setDecisionModal({
                            type: 'SUSPEND_KYC',
                            id: kyc.id,
                            title: `Suspend KYC Verification: ${kyc.legal_name}`,
                          });
                        }}
                      >
                        Suspend
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </Card>
      ) : null}

      {/* Tab 2: Document Verification Queue */}
      {activeTab === 'DOC_QUEUE' ? (
        <Card>
          <CardHeader
            title="Document Verification Queue"
            note="Review vault documents pending compliance verification"
          />
          {docQueue.length === 0 ? (
            <div className="p-8 text-center text-muted">All documents are reviewed and verified!</div>
          ) : (
            <div className="divide-y divide-line/70">
              {docQueue.map((doc) => (
                <div key={doc.id} className="flex flex-wrap items-center justify-between gap-4 p-5 text-[14px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-semibold text-ink">{doc.title}</span>
                      <Badge tone="seal">v{doc.version}</Badge>
                      <Badge tone="info">{doc.document_type || doc.category}</Badge>
                      <StatusChip status={doc.verification_status} />
                    </div>
                    <p className="text-[13px] text-muted">
                      Owner: {doc.owner_name || `User #${doc.owner_user_id}`} ({doc.owner_email}) · Context: {doc.context_type || 'GENERAL'} #{doc.context_id || '—'} · Uploaded: {shortDate(doc.created_at)}
                    </p>
                    {doc.internal_notes ? (
                      <p className="font-mono text-[12px] text-muted bg-paper p-1.5 rounded border border-line">
                        Internal Note: {doc.internal_notes}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleViewDoc(doc.id)}>
                      View File
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        setDecisionModal({
                          type: 'VERIFY_DOC',
                          id: doc.id,
                          title: `Verify & Approve: ${doc.title}`,
                        });
                      }}
                    >
                      ✓ Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setDecisionModal({
                          type: 'REJECT_DOC',
                          id: doc.id,
                          title: `Reject Document: ${doc.title}`,
                        });
                      }}
                    >
                      Reject
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setDecisionModal({
                          type: 'REPLACE_DOC',
                          id: doc.id,
                          title: `Request Replacement: ${doc.title}`,
                        });
                      }}
                    >
                      Request Replacement
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {/* Tab 3: Expired & Expiring Documents */}
      {activeTab === 'EXPIRY' ? (
        <Card>
          <CardHeader
            title="Expiry Monitor"
            note="Documents expiring within 30 days or already expired"
          />
          {expiringDocs.length === 0 ? (
            <div className="p-8 text-center text-muted">No documents expiring soon.</div>
          ) : (
            <div className="divide-y divide-line/70">
              {expiringDocs.map((doc) => (
                <div key={doc.id} className="flex flex-wrap items-center justify-between gap-4 p-5 text-[14px]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{doc.title}</span>
                      <Badge tone={doc.verification_status === 'EXPIRED' ? 'alert' : 'ochre'}>
                        {doc.verification_status === 'EXPIRED' ? 'EXPIRED' : 'EXPIRING SOON'}
                      </Badge>
                      <span className="font-mono text-[12px] text-muted">v{doc.version}</span>
                    </div>
                    <p className="text-[13px] text-muted">
                      Owner: {doc.owner_name || `User #${doc.owner_user_id}`} · Expiry Date: <span className="font-bold text-alert">{shortDate(doc.expiry_date)}</span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => handleViewDoc(doc.id)}>
                      Inspect
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => {
                        setDecisionModal({
                          type: 'REPLACE_DOC',
                          id: doc.id,
                          title: `Request Renewed Replacement for: ${doc.title}`,
                        });
                      }}
                    >
                      Request Renewal
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {/* Tab 4: Compliance Exceptions */}
      {activeTab === 'EXCEPTIONS' ? (
        <Card>
          <CardHeader
            title="Compliance Exceptions Governance"
            note="Manage missing required documents, compliance anomalies, and recorded overrides"
          />
          {exceptions.length === 0 ? (
            <div className="p-8 text-center text-muted">No active compliance exceptions.</div>
          ) : (
            <div className="divide-y divide-line/70">
              {exceptions.map((exc) => (
                <div key={exc.id} className="flex flex-wrap items-center justify-between gap-4 p-5 text-[14px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink">{exc.title}</span>
                      <Badge tone={exc.severity === 'CRITICAL' ? 'alert' : exc.severity === 'HIGH' ? 'ochre' : 'neutral'}>
                        {exc.severity}
                      </Badge>
                      <StatusChip status={exc.status} />
                    </div>
                    <p className="text-[13px] text-muted">
                      Category: {exc.category} · Context: {exc.context_type} #{exc.context_id} · Created: {shortDate(exc.created_at)}
                    </p>
                    {exc.override_reason ? (
                      <p className="font-mono text-[12px] text-ochre bg-ochre-soft p-2 rounded border border-ochre/30">
                        Governance Override Reason: {exc.override_reason} (By {exc.resolver_name || 'Management'})
                      </p>
                    ) : null}
                    {exc.resolution_notes ? (
                      <p className="text-[12px] text-muted bg-paper p-1.5 rounded border border-line">
                        Resolution Notes: {exc.resolution_notes}
                      </p>
                    ) : null}
                  </div>

                  {exc.status === 'OPEN' || exc.status === 'IN_REVIEW' ? (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          setDecisionModal({
                            type: 'RESOLVE_EXC',
                            id: exc.id,
                            title: `Resolve Exception: ${exc.title}`,
                          });
                        }}
                      >
                        ✓ Mark Resolved
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => {
                          setDecisionModal({
                            type: 'OVERRIDE_EXC',
                            id: exc.id,
                            title: `Execute Management Override: ${exc.title}`,
                          });
                        }}
                      >
                        Governance Override
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {/* Tab 5: All Vault Documents */}
      {activeTab === 'ALL_DOCS' ? (
        <Card>
          <CardHeader
            title="Central Governance Document Vault"
            note={`${allDocs.length} total encrypted documents in registry`}
            action={
              <input
                type="text"
                placeholder="Search vault..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-card border border-line px-3 py-1.5 text-[13px]"
              />
            }
          />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead className="border-b border-line bg-paper/50 text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="p-3">Doc ID</th>
                  <th className="p-3">Title / Label</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Context</th>
                  <th className="p-3">Owner</th>
                  <th className="p-3">Version</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Uploaded</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/70">
                {allDocs
                  .filter((d) =>
                    searchQuery
                      ? d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        d.public_id?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        d.owner_name?.toLowerCase().includes(searchQuery.toLowerCase())
                      : true,
                  )
                  .map((doc) => (
                    <tr key={doc.id} className="hover:bg-paper/30">
                      <td className="p-3 font-mono text-[11px]">{doc.public_id}</td>
                      <td className="p-3 font-medium text-ink">{doc.title}</td>
                      <td className="p-3">{doc.document_type || doc.category}</td>
                      <td className="p-3">{doc.context_type ? `${doc.context_type} #${doc.context_id}` : '—'}</td>
                      <td className="p-3">{doc.owner_name || `User #${doc.owner_user_id}`}</td>
                      <td className="p-3 font-mono">v{doc.version}</td>
                      <td className="p-3"><StatusChip status={doc.verification_status} /></td>
                      <td className="p-3">{shortDate(doc.created_at)}</td>
                      <td className="p-3">
                        <button
                          type="button"
                          onClick={() => handleViewDoc(doc.id)}
                          className="font-semibold text-seal hover:underline"
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {/* Decision / Action Modal */}
      {decisionModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
          <div className="w-full max-w-lg rounded-card border border-line bg-white p-6 shadow-card">
            <h2 className="font-display text-xl font-semibold">{decisionModal.title}</h2>
            <p className="mt-1 text-[13px] text-muted">
              {decisionModal.type.startsWith('OVERRIDE')
                ? 'Management overrides require a mandatory audit-logged justification.'
                : decisionModal.type.startsWith('REJECT')
                ? 'Rejections require a clear explanation so the user can correct their submission.'
                : 'Confirm compliance verification decision.'}
            </p>

            <form onSubmit={handleExecuteDecision} className="mt-5 space-y-4">
              {decisionModal.type.includes('VERIFY') ? (
                <div>
                  <label className="block text-[13px] font-medium text-ink">Verification Expiry Date (Optional)</label>
                  <input
                    type="date"
                    value={modalExpiry}
                    onChange={(e) => setModalExpiry(e.target.value)}
                    className="mt-1 w-full rounded-card border border-line px-3 py-2 text-[14px]"
                  />
                </div>
              ) : null}

              {decisionModal.type.includes('REJECT') ||
              decisionModal.type.includes('REPLACE') ||
              decisionModal.type.includes('REQUEST') ||
              decisionModal.type.includes('SUSPEND') ||
              decisionModal.type.includes('OVERRIDE') ||
              decisionModal.type.includes('RESOLVE') ? (
                <div>
                  <label className="block text-[13px] font-medium text-ink">
                    {decisionModal.type.includes('OVERRIDE')
                      ? 'Override Governance Reason (Mandatory)'
                      : decisionModal.type.includes('RESOLVE')
                      ? 'Resolution Notes (Mandatory)'
                      : 'Reason / Instructions to Applicant (Mandatory)'}
                  </label>
                  <textarea
                    rows={3}
                    value={modalReason}
                    onChange={(e) => setModalReason(e.target.value)}
                    placeholder="Provide specific, actionable justification..."
                    className="mt-1 w-full rounded-card border border-line p-3 text-[14px]"
                    required
                  />
                </div>
              ) : null}

              <div>
                <label className="block text-[13px] font-medium text-ink">Internal Staff Notes (Never shown to customer)</label>
                <textarea
                  rows={2}
                  value={modalInternalNotes}
                  onChange={(e) => setModalInternalNotes(e.target.value)}
                  placeholder="Optional notes for verifier records..."
                  className="mt-1 w-full rounded-card border border-line p-3 text-[13px]"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-2">
                <Button variant="ghost" onClick={() => setDecisionModal(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant={decisionModal.type.includes('REJECT') || decisionModal.type.includes('OVERRIDE') ? 'danger' : 'primary'}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : 'Confirm Decision'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
