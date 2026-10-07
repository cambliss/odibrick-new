'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

interface AdminRiskDetailClientProps {
  initialCase: any;
}

export function AdminRiskDetailClient({ initialCase }: AdminRiskDetailClientProps) {
  const router = useRouter();
  const [caseRecord, setCaseRecord] = useState<any>(initialCase);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionModal, setActionModal] = useState<string | null>(null);

  // Form states for actions
  const [assignedToInput, setAssignedToInput] = useState<string>('1');
  const [escalateReason, setEscalateReason] = useState<string>('');
  const [evidenceRequested, setEvidenceRequested] = useState<string>('');
  const [resolutionNotes, setResolutionNotes] = useState<string>('');
  const [falsePositiveReason, setFalsePositiveReason] = useState<string>('');
  const [reopenReason, setReopenReason] = useState<string>('');

  const refreshData = async () => {
    try {
      const updated = await api<any>(`/admin/risk/cases/${caseRecord.id}`);
      if (updated) setCaseRecord(updated);
    } catch {
      // Fallback
    }
  };

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api(`/admin/risk/cases/${caseRecord.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({ assignedTo: Number(assignedToInput) }),
      });
      setActionModal(null);
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to assign case');
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api(`/admin/risk/cases/${caseRecord.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({ reason: escalateReason || 'Management priority escalation', elevatedRiskLevel: 'CRITICAL' }),
      });
      setActionModal(null);
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to escalate case');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api(`/admin/risk/cases/${caseRecord.id}/evidence`, {
        method: 'POST',
        body: JSON.stringify({ requestedItems: evidenceRequested }),
      });
      setActionModal(null);
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to request evidence');
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api(`/admin/risk/cases/${caseRecord.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolutionNotes: resolutionNotes || 'Investigated and resolved by management.' }),
      });
      setActionModal(null);
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to resolve case');
    } finally {
      setActionLoading(false);
    }
  };

  const handleFalsePositive = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api(`/admin/risk/cases/${caseRecord.id}/false-positive`, {
        method: 'POST',
        body: JSON.stringify({ reason: falsePositiveReason || 'Reviewed: legitimate customer activity verified.' }),
      });
      setActionModal(null);
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to mark false positive');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      await api(`/admin/risk/cases/${caseRecord.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: reopenReason || 'New suspicious signals surfaced.' }),
      });
      setActionModal(null);
      await refreshData();
    } catch (err: any) {
      alert(err.message || 'Failed to reopen case');
    } finally {
      setActionLoading(false);
    }
  };

  const getRiskBadge = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'bg-red-500/10 text-red-400 border border-red-500/30';
      case 'HIGH':
        return 'bg-orange-500/10 text-orange-400 border border-orange-500/30';
      case 'MEDIUM':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
      default:
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'UNDER_REVIEW':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'EVIDENCE_REQUESTED':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20';
      case 'ESCALATED':
        return 'bg-red-500/20 text-red-300 font-semibold border border-red-500/40';
      case 'RESOLVED':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'FALSE_POSITIVE':
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
      default:
        return 'bg-slate-500/10 text-slate-300 border border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/dashboard/admin/risk" className="hover:text-white transition">
            ← Trust & Risk Control Centre
          </Link>
          <span>/</span>
          <span className="font-mono text-slate-200">{caseRecord.case_number}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {caseRecord.status !== 'RESOLVED' && caseRecord.status !== 'CLOSED' && caseRecord.status !== 'FALSE_POSITIVE' && (
            <>
              <button
                onClick={() => setActionModal('assign')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-200 hover:bg-slate-700 border border-slate-700 transition"
              >
                Assign Staff
              </button>

              <button
                onClick={() => setActionModal('evidence')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 transition"
              >
                Request Evidence
              </button>

              <button
                onClick={() => setActionModal('escalate')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-red-600/20 text-red-300 hover:bg-red-600/30 border border-red-500/30 transition"
              >
                Escalate
              </button>

              <button
                onClick={() => setActionModal('false_positive')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition"
              >
                Mark False Positive
              </button>

              <button
                onClick={() => setActionModal('resolve')}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-500 transition"
              >
                Resolve Case
              </button>
            </>
          )}

          {(caseRecord.status === 'RESOLVED' || caseRecord.status === 'FALSE_POSITIVE' || caseRecord.status === 'CLOSED') && (
            <button
              onClick={() => setActionModal('reopen')}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition"
            >
              Reopen Investigation
            </button>
          )}
        </div>
      </div>

      {/* Main Header Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-white font-mono">{caseRecord.case_number}</h1>
            <span className={`inline-flex px-2.5 py-0.5 rounded text-xs font-bold ${getRiskBadge(caseRecord.risk_level)}`}>
              {caseRecord.risk_level} RISK
            </span>
            <span className={`inline-flex px-2.5 py-0.5 rounded text-xs ${getStatusBadge(caseRecord.status)}`}>
              {caseRecord.status}
            </span>
          </div>

          <div className="text-xs text-slate-400 font-mono">
            Created: {new Date(caseRecord.created_at).toLocaleString('en-IN')}
          </div>
        </div>

        <p className="text-sm font-medium text-slate-200">{caseRecord.summary}</p>

        {caseRecord.resolution_notes && (
          <div className="bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs space-y-1">
            <span className="text-slate-400 font-medium">Resolution Notes:</span>
            <p className="text-emerald-300">{caseRecord.resolution_notes}</p>
          </div>
        )}
      </div>

      {/* Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Evidence, Signals & Entities */}
        <div className="lg:col-span-2 space-y-5">
          {/* Linked Operational Task */}
          {caseRecord.operationalTask && (
            <div className="bg-slate-900/80 border border-blue-500/30 rounded-xl p-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-semibold text-blue-400 uppercase tracking-wider">
                  Phase 15 Operational Task Linked
                </span>
                <h4 className="text-sm font-medium text-white mt-0.5">{caseRecord.operationalTask.title}</h4>
                <div className="text-xs text-slate-400 mt-1">
                  Task #{caseRecord.operationalTask.public_id} · Priority: {caseRecord.operationalTask.priority} · Status: {caseRecord.operationalTask.status}
                </div>
              </div>
              <Link
                href={`/dashboard/admin/operations/${caseRecord.operationalTask.id}`}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600/20 text-blue-300 hover:bg-blue-600/30 border border-blue-500/30 transition"
              >
                Control Tower →
              </Link>
            </div>
          )}

          {/* Linked Risk Signals */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold text-white">Detected Risk Signals ({caseRecord.signals?.length || 0})</h3>

            {(!caseRecord.signals || caseRecord.signals.length === 0) ? (
              <p className="text-xs text-slate-500">No active signals directly attached.</p>
            ) : (
              <div className="space-y-3">
                {caseRecord.signals.map((sig: any) => (
                  <div key={sig.id} className="bg-slate-950/40 border border-slate-800 rounded-lg p-3 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{sig.signal_type}</span>
                      <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${getRiskBadge(sig.severity)}`}>
                        {sig.severity}
                      </span>
                    </div>

                    <p className="text-slate-300">{sig.explanation}</p>

                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-900/60 rounded p-2 font-mono">
                      <div>
                        <span className="text-slate-400">Observed:</span>{' '}
                        <span className="text-red-400">{sig.detected_value}</span>
                      </div>
                      <div>
                        <span className="text-slate-400">Threshold:</span>{' '}
                        <span className="text-slate-300">{sig.threshold_value}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subject & Entity Snapshot */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Subject User */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Subject Profile</h4>
              <div className="text-sm font-medium text-white">{caseRecord.subject_name || 'System / Platform Direct'}</div>
              {caseRecord.subject_email && (
                <div className="text-xs text-slate-400 font-mono">{caseRecord.subject_email}</div>
              )}
            </div>

            {/* Subject Property / Payment */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Linked Entity</h4>
              {caseRecord.property_title && (
                <div className="text-xs text-slate-200">
                  <span className="text-slate-400">Property:</span> {caseRecord.property_title} ({caseRecord.property_code})
                </div>
              )}
              {caseRecord.payment_reference && (
                <div className="text-xs text-slate-200">
                  <span className="text-slate-400">Payment:</span> {caseRecord.payment_reference} (INR {caseRecord.payment_amount?.toLocaleString('en-IN')})
                </div>
              )}
              {!caseRecord.property_title && !caseRecord.payment_reference && (
                <div className="text-xs text-slate-500">No external property or payment reference linked.</div>
              )}
            </div>
          </div>

          {/* Evidence Details */}
          {caseRecord.evidence && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-2">
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Evidence Snapshot (JSON)</h4>
              <pre className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 text-xs text-emerald-400 font-mono overflow-x-auto">
                {JSON.stringify(caseRecord.evidence, null, 2)}
              </pre>
            </div>
          )}
        </div>

        {/* Right Column: Timeline & Staff History */}
        <div className="space-y-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-white">Investigation Timeline</h3>

            {(!caseRecord.timeline || caseRecord.timeline.length === 0) ? (
              <p className="text-xs text-slate-500">No history events logged.</p>
            ) : (
              <div className="space-y-3 relative before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                {caseRecord.timeline.map((evt: any) => (
                  <div key={evt.id} className="relative pl-6 text-xs space-y-1">
                    <div className="absolute left-1 top-1 w-2.5 h-2.5 rounded-full bg-red-500/60 border border-slate-900" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-white">{evt.event_type}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(evt.created_at).toLocaleTimeString('en-IN')}
                      </span>
                    </div>
                    <div className="text-slate-400">{evt.notes || 'Status updated'}</div>
                    <div className="text-[10px] text-slate-500">By {evt.actor_name || 'System'}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ACTION MODALS */}
      {actionModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                {actionModal === 'assign' && 'Assign Staff Member'}
                {actionModal === 'escalate' && 'Escalate Risk Case to Management'}
                {actionModal === 'evidence' && 'Request Supporting Evidence'}
                {actionModal === 'resolve' && 'Resolve Fraud / Risk Case'}
                {actionModal === 'false_positive' && 'Mark Case as False Positive'}
                {actionModal === 'reopen' && 'Reopen Risk Case'}
              </h3>
              <button onClick={() => setActionModal(null)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            {actionModal === 'assign' && (
              <form onSubmit={handleAssign} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400">Staff User ID</label>
                  <input
                    type="number"
                    value={assignedToInput}
                    onChange={(e) => setAssignedToInput(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg p-2 mt-1"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setActionModal(null)} className="px-3 py-1.5 text-xs text-slate-400">
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500">
                    {actionLoading ? 'Assigning...' : 'Confirm Assign'}
                  </button>
                </div>
              </form>
            )}

            {actionModal === 'escalate' && (
              <form onSubmit={handleEscalate} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400">Escalation Reason</label>
                  <textarea
                    value={escalateReason}
                    onChange={(e) => setEscalateReason(e.target.value)}
                    placeholder="Provide details on why this requires immediate management intervention..."
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg p-2 mt-1 h-24"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setActionModal(null)} className="px-3 py-1.5 text-xs text-slate-400">
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-1.5 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-500">
                    {actionLoading ? 'Escalating...' : 'Confirm Escalation'}
                  </button>
                </div>
              </form>
            )}

            {actionModal === 'evidence' && (
              <form onSubmit={handleRequestEvidence} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400">Requested Information / Documents</label>
                  <textarea
                    value={evidenceRequested}
                    onChange={(e) => setEvidenceRequested(e.target.value)}
                    placeholder="Specify bank statement, lease copy, or photo proof required..."
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg p-2 mt-1 h-24"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setActionModal(null)} className="px-3 py-1.5 text-xs text-slate-400">
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-1.5 text-xs font-semibold rounded bg-amber-600 text-white hover:bg-amber-500">
                    {actionLoading ? 'Submitting...' : 'Send Request'}
                  </button>
                </div>
              </form>
            )}

            {actionModal === 'resolve' && (
              <form onSubmit={handleResolve} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400">Resolution Summary & Governance Notes</label>
                  <textarea
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    placeholder="Explain what actions were taken and why the risk is resolved..."
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg p-2 mt-1 h-24"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setActionModal(null)} className="px-3 py-1.5 text-xs text-slate-400">
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-1.5 text-xs font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-500">
                    {actionLoading ? 'Resolving...' : 'Confirm Resolution'}
                  </button>
                </div>
              </form>
            )}

            {actionModal === 'false_positive' && (
              <form onSubmit={handleFalsePositive} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400">Reason for False Positive</label>
                  <textarea
                    value={falsePositiveReason}
                    onChange={(e) => setFalsePositiveReason(e.target.value)}
                    placeholder="Explain why the flagged signals are legitimate user activity..."
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg p-2 mt-1 h-24"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setActionModal(null)} className="px-3 py-1.5 text-xs text-slate-400">
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-1.5 text-xs font-semibold rounded bg-slate-700 text-white hover:bg-slate-600">
                    {actionLoading ? 'Submitting...' : 'Mark False Positive'}
                  </button>
                </div>
              </form>
            )}

            {actionModal === 'reopen' && (
              <form onSubmit={handleReopen} className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400">Reopen Reason</label>
                  <textarea
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Specify why new investigation is required..."
                    className="w-full bg-slate-800 border border-slate-700 text-xs text-white rounded-lg p-2 mt-1 h-24"
                    required
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setActionModal(null)} className="px-3 py-1.5 text-xs text-slate-400">
                    Cancel
                  </button>
                  <button type="submit" disabled={actionLoading} className="px-4 py-1.5 text-xs font-semibold rounded bg-blue-600 text-white hover:bg-blue-500">
                    {actionLoading ? 'Reopening...' : 'Confirm Reopen'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
