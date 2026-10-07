'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader } from '@/components/ui';
import { api } from '@/lib/api';

type OperationalTask = {
  id: number;
  public_id: string;
  task_type: string;
  title: string;
  description: string | null;
  source_domain: string;
  source_entity_type: string;
  source_entity_id: string;
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';
  status: 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING' | 'ESCALATED' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
  assigned_to: number | null;
  assigned_team: string | null;
  created_by: number | null;
  due_at: string | null;
  sla_due_at: string | null;
  sla_status: 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'BREACHED';
  completed_at: string | null;
  resolution_notes: string | null;
  metadata: Record<string, any> | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  assignee_name?: string | null;
  assignee_email?: string | null;
  creator_name?: string | null;
  entity_url?: string | null;
};

type OperationalTaskEvent = {
  id: number;
  task_id: number;
  actor_id: number | null;
  event_type: string;
  previous_state: Record<string, any> | null;
  new_state: Record<string, any> | null;
  notes: string | null;
  created_at: string;
  actor_name?: string | null;
  actor_role?: string | null;
};

export function TaskDetailClient({
  initialDetail,
}: {
  initialDetail: {
    task: OperationalTask;
    events: OperationalTaskEvent[];
    domainContext: Record<string, any>;
  };
}) {
  const router = useRouter();
  const [task, setTask] = useState<OperationalTask>(initialDetail.task);
  const [events, setEvents] = useState<OperationalTaskEvent[]>(initialDetail.events);
  const [domainContext] = useState<Record<string, any>>(initialDetail.domainContext);

  const [commentText, setCommentText] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals / Action states
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigned_to ? String(task.assigned_to) : '');
  const [assigneeTeam, setAssigneeTeam] = useState<string>(task.assigned_team || 'OPERATIONS');

  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState(task.priority);

  const [escalateModalOpen, setEscalateModalOpen] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');

  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveNotes, setResolveNotes] = useState('');

  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const refreshTask = async () => {
    try {
      const res = await api<any>(`/admin/operations/tasks/${task.id}`);
      if (res && res.task) {
        setTask(res.task);
        setEvents(res.events || []);
      }
    } catch (err: any) {
      showToast(`Error refreshing task: ${err.message}`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${task.id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ comment: commentText.trim() }),
      });
      setCommentText('');
      showToast('Comment added to timeline.');
      await refreshTask();
    } catch (err: any) {
      showToast(`Comment failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleAssign = async () => {
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${task.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({
          assigned_to: assigneeId ? Number(assigneeId) : null,
          assigned_team: assigneeTeam || null,
        }),
      });
      setAssignModalOpen(false);
      showToast('Assignment updated.');
      await refreshTask();
    } catch (err: any) {
      showToast(`Assignment failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handlePriorityUpdate = async () => {
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${task.id}/priority`, {
        method: 'PATCH',
        body: JSON.stringify({ priority: selectedPriority }),
      });
      setPriorityModalOpen(false);
      showToast('Priority updated.');
      await refreshTask();
    } catch (err: any) {
      showToast(`Priority update failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${task.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      showToast(`Status transitioned to ${newStatus}.`);
      await refreshTask();
    } catch (err: any) {
      showToast(`Status update failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleEscalate = async () => {
    if (!escalateReason.trim()) return;
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${task.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({
          reason: escalateReason,
          target_priority: 'CRITICAL',
        }),
      });
      setEscalateModalOpen(false);
      setEscalateReason('');
      showToast('Task escalated to Management authority.');
      await refreshTask();
    } catch (err: any) {
      showToast(`Escalation failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleResolve = async () => {
    if (!resolveNotes.trim()) return;
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${task.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution_notes: resolveNotes }),
      });
      setResolveModalOpen(false);
      setResolveNotes('');
      showToast('Task marked as Resolved.');
      await refreshTask();
    } catch (err: any) {
      showToast(`Resolution failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenReason.trim()) return;
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${task.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reopen_reason: reopenReason }),
      });
      setReopenModalOpen(false);
      setReopenReason('');
      showToast('Task reopened.');
      await refreshTask();
    } catch (err: any) {
      showToast(`Reopen failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 rounded-card bg-seal px-4 py-2.5 text-xs font-semibold text-white shadow-float animate-fadeIn">
          {toastMessage}
        </div>
      )}

      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between text-xs text-muted">
        <div className="flex items-center gap-2">
          <Link href="/dashboard/admin/operations" className="text-seal hover:underline">
            ← Operations Control Tower
          </Link>
          <span>/</span>
          <span className="font-mono text-ink font-semibold">{task.public_id}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={refreshTask}>
          ↻ Refresh
        </Button>
      </div>

      {/* Task Header Card */}
      <div className="rounded-card border border-border bg-white p-6 shadow-subtle space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold text-seal bg-seal-soft px-2 py-0.5 rounded">
                {task.public_id}
              </span>
              <span className="font-mono text-xs px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-semibold">
                {task.source_domain}
              </span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded font-bold ${
                  task.priority === 'CRITICAL'
                    ? 'bg-rose-100 text-rose-800'
                    : task.priority === 'URGENT'
                    ? 'bg-amber-100 text-amber-900'
                    : 'bg-blue-50 text-blue-800'
                }`}
              >
                {task.priority}
              </span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded font-bold ${
                  task.status === 'RESOLVED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : task.status === 'ESCALATED'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-indigo-100 text-indigo-800'
                }`}
              >
                {task.status}
              </span>
              <span
                className={`font-mono text-xs px-2 py-0.5 rounded ${
                  task.sla_status === 'BREACHED'
                    ? 'bg-red-600 text-white font-bold animate-pulse'
                    : task.sla_status === 'DUE_SOON'
                    ? 'bg-amber-100 text-amber-800 font-semibold'
                    : 'bg-emerald-50 text-emerald-800'
                }`}
              >
                SLA: {task.sla_status}
              </span>
            </div>

            <h1 className="font-display text-2xl font-bold text-ink mt-2">{task.title}</h1>
            {task.description && <p className="text-sm text-muted mt-1">{task.description}</p>}
          </div>

          {/* Quick Management Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setAssignModalOpen(true)}>
              {task.assigned_to ? 'Reassign' : 'Assign Staff'}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setPriorityModalOpen(true)}>
              Change Priority
            </Button>
            {task.status !== 'RESOLVED' && task.status !== 'CLOSED' && (
              <Button variant="danger" size="sm" onClick={() => setEscalateModalOpen(true)}>
                Escalate
              </Button>
            )}
            {task.status !== 'RESOLVED' ? (
              <Button variant="primary" size="sm" onClick={() => setResolveModalOpen(true)}>
                Resolve Task
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => setReopenModalOpen(true)}>
                Reopen Task
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 2-Column Workspace Body */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* LEFT COLUMN: CONTEXT & TIMELINE (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Domain Linking & Context */}
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-display text-base font-semibold text-ink">Originating Domain Entity</h3>
              <Link
                href={task.entity_url || '/dashboard/admin'}
                className="inline-block rounded-button bg-seal px-3 py-1 text-xs font-medium text-white shadow-soft hover:bg-seal-deep"
              >
                Open Source Domain Record →
              </Link>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted">Source Domain:</span>
                <p className="font-mono font-bold text-ink">{task.source_domain}</p>
              </div>
              <div>
                <span className="text-muted">Entity Type:</span>
                <p className="font-mono text-ink">{task.source_entity_type}</p>
              </div>
              <div>
                <span className="text-muted">Entity ID / Ref:</span>
                <p className="font-mono font-bold text-ink">{task.source_entity_id}</p>
              </div>
              <div>
                <span className="text-muted">Task Type:</span>
                <p className="font-mono text-ink">{task.task_type}</p>
              </div>
            </div>

            {task.metadata && Object.keys(task.metadata).length > 0 && (
              <div>
                <span className="text-xs font-semibold text-muted block mb-1">Operational Context Metadata:</span>
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded text-xs font-mono overflow-x-auto max-h-48">
                  {JSON.stringify(task.metadata, null, 2)}
                </pre>
              </div>
            )}
          </Card>

          {/* Resolution Snapshot if Resolved */}
          {task.resolution_notes && (
            <Card className="p-5 bg-emerald-50/50 border-emerald-200">
              <h3 className="font-display text-base font-semibold text-emerald-900 mb-1">
                ✓ Governance Resolution Notes
              </h3>
              <p className="text-xs text-emerald-800 whitespace-pre-wrap">{task.resolution_notes}</p>
              {task.completed_at && (
                <p className="text-[11px] text-emerald-700 mt-2">
                  Completed on: {new Date(task.completed_at).toLocaleString()}
                </p>
              )}
            </Card>
          )}

          {/* Activity Timeline */}
          <Card className="p-5 space-y-4">
            <h3 className="font-display text-base font-semibold text-ink">Operational Audit Timeline</h3>

            <div className="space-y-4">
              {events.length === 0 ? (
                <p className="text-xs text-muted">No timeline events recorded yet.</p>
              ) : (
                events.map((evt) => (
                  <div key={evt.id} className="border-l-2 border-seal pl-4 pb-2 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono font-bold text-seal">{evt.event_type}</span>
                      <span className="text-muted">{new Date(evt.created_at).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-ink">{evt.notes || 'Action logged.'}</p>
                    <div className="text-[11px] text-muted">
                      By: <span className="font-medium text-ink">{evt.actor_name}</span> ({evt.actor_role})
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Comment Box */}
            <form onSubmit={handleAddComment} className="pt-4 border-t border-border space-y-2">
              <label className="text-xs font-semibold text-ink block">Add Operational Note / Comment:</label>
              <textarea
                rows={2}
                placeholder="Log internal update, progress note, or escalation review..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
              />
              <div className="text-right">
                <Button variant="primary" size="sm" type="submit" disabled={actionLoading || !commentText.trim()}>
                  Post Note
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* RIGHT COLUMN: ASSIGNMENT & SLA CONTROLS (1 col) */}
        <div className="space-y-6">
          {/* Assignment & Team Card */}
          <Card className="p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-ink border-b border-border pb-2">
              Assignment & Ownership
            </h3>
            <div className="text-xs space-y-2">
              <div>
                <span className="text-muted">Assigned Staff:</span>
                <p className="font-semibold text-ink">
                  {task.assignee_name ? `${task.assignee_name} (#${task.assigned_to})` : 'Unassigned'}
                </p>
                {task.assignee_email && <p className="text-muted text-[11px]">{task.assignee_email}</p>}
              </div>

              <div>
                <span className="text-muted">Operational Team:</span>
                <p className="font-semibold text-ink">{task.assigned_team || 'General Operations'}</p>
              </div>

              <div>
                <span className="text-muted">Created By:</span>
                <p className="font-medium text-ink">{task.creator_name || 'SYSTEM'}</p>
              </div>

              <div>
                <span className="text-muted">Created Date:</span>
                <p className="text-ink">{new Date(task.created_at).toLocaleString()}</p>
              </div>
            </div>
          </Card>

          {/* SLA Deadlines */}
          <Card className="p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-ink border-b border-border pb-2">
              SLA & Execution Deadlines
            </h3>
            <div className="text-xs space-y-2">
              <div>
                <span className="text-muted">SLA Target Due:</span>
                <p className="font-mono font-bold text-ink">
                  {task.sla_due_at ? new Date(task.sla_due_at).toLocaleString() : 'Standard 48h'}
                </p>
              </div>

              <div>
                <span className="text-muted">Hard Deadline:</span>
                <p className="font-mono text-ink">
                  {task.due_at ? new Date(task.due_at).toLocaleString() : 'Standard 96h'}
                </p>
              </div>

              <div>
                <span className="text-muted">SLA Health:</span>
                <p
                  className={`font-mono font-bold ${
                    task.sla_status === 'BREACHED'
                      ? 'text-rose-700'
                      : task.sla_status === 'DUE_SOON'
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {task.sla_status}
                </p>
              </div>
            </div>
          </Card>

          {/* Quick Status Workflow Transitions */}
          <Card className="p-5 space-y-3">
            <h3 className="font-display text-sm font-semibold text-ink border-b border-border pb-2">
              Quick Status Transitions
            </h3>
            <div className="grid grid-cols-2 gap-2">
              {task.status !== 'IN_PROGRESS' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusChange('IN_PROGRESS')}>
                  In Progress
                </Button>
              )}
              {task.status !== 'WAITING' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusChange('WAITING')}>
                  Waiting
                </Button>
              )}
              {task.status !== 'OPEN' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusChange('OPEN')}>
                  Open
                </Button>
              )}
              {task.status !== 'CLOSED' && (
                <Button variant="secondary" size="sm" onClick={() => handleStatusChange('CLOSED')}>
                  Close
                </Button>
              )}
            </div>
          </Card>
        </div>
      </div>

      {/* MODAL: ASSIGN */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-ink">Assign / Reassign Task</h3>
              <button onClick={() => setAssignModalOpen(false)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Assign to Staff User ID</label>
                <input
                  type="number"
                  placeholder="e.g. 1 for Super Admin"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Assigned Team / Department</label>
                <select
                  value={assigneeTeam}
                  onChange={(e) => setAssigneeTeam(e.target.value)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                >
                  <option value="OPERATIONS">OPERATIONS</option>
                  <option value="FINANCE">FINANCE</option>
                  <option value="LEGAL">LEGAL</option>
                  <option value="COMPLIANCE">COMPLIANCE</option>
                  <option value="MARKETPLACE">MARKETPLACE</option>
                  <option value="SUPPORT">SUPPORT</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setAssignModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={actionLoading} onClick={handleAssign}>
                {actionLoading ? 'Saving...' : 'Save Assignment'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PRIORITY */}
      {priorityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-ink">Change Task Priority</h3>
              <button onClick={() => setPriorityModalOpen(false)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Operational Priority Level</label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value as any)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                >
                  <option value="LOW">LOW</option>
                  <option value="NORMAL">NORMAL</option>
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setPriorityModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={actionLoading} onClick={handlePriorityUpdate}>
                {actionLoading ? 'Saving...' : 'Update Priority'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ESCALATE */}
      {escalateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-ink">Escalate Task to Management</h3>
              <button onClick={() => setEscalateModalOpen(false)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Escalation Reason *</label>
                <textarea
                  rows={3}
                  placeholder="Explain why this requires urgent management intervention..."
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setEscalateModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={actionLoading} onClick={handleEscalate}>
                {actionLoading ? 'Escalating...' : 'Confirm Escalation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESOLVE */}
      {resolveModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-ink">Resolve Operational Task</h3>
              <button onClick={() => setResolveModalOpen(false)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Resolution Summary / Governance Notes *</label>
                <textarea
                  rows={3}
                  placeholder="Detail how this operational task was verified and completed..."
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setResolveModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={actionLoading} onClick={handleResolve}>
                {actionLoading ? 'Saving...' : 'Confirm Resolution'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REOPEN */}
      {reopenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-ink">Reopen Task</h3>
              <button onClick={() => setReopenModalOpen(false)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Reopen Reason *</label>
                <textarea
                  rows={3}
                  placeholder="Detail why this task is being reopened for operational review..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setReopenModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={actionLoading} onClick={handleReopen}>
                {actionLoading ? 'Reopening...' : 'Confirm Reopen'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
