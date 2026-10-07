'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, StatTile } from '@/components/ui';
import { api } from '@/lib/api';

type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';
type TaskStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'WAITING' | 'ESCALATED' | 'RESOLVED' | 'CLOSED' | 'CANCELLED';
type SlaStatus = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'BREACHED';

type OperationalTask = {
  id: number;
  public_id: string;
  task_type: string;
  title: string;
  description: string | null;
  source_domain: string;
  source_entity_type: string;
  source_entity_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_to: number | null;
  assigned_team: string | null;
  created_by: number | null;
  due_at: string | null;
  sla_due_at: string | null;
  sla_status: SlaStatus;
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

type Overview = {
  totalTasks: number;
  openTasks: number;
  assignedTasks: number;
  inProgressTasks: number;
  escalatedTasks: number;
  criticalTasks: number;
  urgentTasks: number;
  overdueTasks: number;
  unassignedTasks: number;
  slaBreachedTasks: number;
  myAssignedTasks: number;
  resolvedToday: number;
  domainBreakdown: { domain: string; count: number; urgentCount: number }[];
  priorityBreakdown: { priority: TaskPriority; count: number }[];
  statusBreakdown: { status: TaskStatus; count: number }[];
};

type ExceptionsOverview = {
  financialExceptions: number;
  complianceExceptions: number;
  legalEscalations: number;
  disputeReviews: number;
  automationFailures: number;
  items: {
    category: string;
    title: string;
    sourceDomain: string;
    entityId: string;
    severity: string;
    createdAt: string;
    actionUrl: string;
  }[];
};

export function AdminOperationsClient({
  initialOverview,
  initialTasks,
  initialTotal,
  initialExceptions,
}: {
  initialOverview: Overview | null;
  initialTasks: OperationalTask[];
  initialTotal: number;
  initialExceptions: ExceptionsOverview | null;
}) {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(initialOverview);
  const [tasks, setTasks] = useState<OperationalTask[]>(initialTasks);
  const [total, setTotal] = useState(initialTotal);
  const [exceptions, setExceptions] = useState<ExceptionsOverview | null>(initialExceptions);

  const [activeTab, setActiveTab] = useState<'QUEUE' | 'EXCEPTIONS' | 'SLA_BREACHES' | 'WORKLOAD'>('QUEUE');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [domainFilter, setDomainFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    title: '',
    task_type: 'GENERAL_OPERATIONAL_TASK',
    source_domain: 'GENERAL',
    source_entity_type: 'task',
    source_entity_id: '0',
    priority: 'NORMAL',
    assigned_team: 'OPERATIONS',
    description: '',
  });

  const [assignModal, setAssignModal] = useState<{ id: number; title: string; currentAssignee: number | null; currentTeam: string | null } | null>(null);
  const [assignTargetUserId, setAssignTargetUserId] = useState<string>('');
  const [assignTargetTeam, setAssignTargetTeam] = useState<string>('OPERATIONS');

  const [escalateModal, setEscalateModal] = useState<{ id: number; title: string; publicId: string } | null>(null);
  const [escalateReason, setEscalateReason] = useState('');
  const [escalatePriority, setEscalatePriority] = useState<TaskPriority>('URGENT');

  const [resolveModal, setResolveModal] = useState<{ id: number; title: string; publicId: string } | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const refreshData = async () => {
    setLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter !== 'ALL') queryParams.set('status', statusFilter);
      if (priorityFilter !== 'ALL') queryParams.set('priority', priorityFilter);
      if (domainFilter !== 'ALL') queryParams.set('domain', domainFilter);
      if (searchQuery.trim()) queryParams.set('q', searchQuery.trim());
      queryParams.set('limit', '100');

      const [ovRes, tskRes, excRes] = await Promise.all([
        api<Overview>('/admin/operations/overview'),
        api<{ data: OperationalTask[]; total: number }>(`/admin/operations/tasks?${queryParams.toString()}`),
        api<ExceptionsOverview>('/admin/operations/exceptions'),
      ]);

      setOverview(ovRes);
      setTasks(tskRes.data || []);
      setTotal(tskRes.total || 0);
      setExceptions(excRes);
    } catch (err: any) {
      showToast(`Error refreshing data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Handle Create Task
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.title.trim()) return;
    setActionLoading(true);
    try {
      await api('/admin/operations/tasks', {
        method: 'POST',
        body: JSON.stringify({
          ...createForm,
          source_domain: createForm.source_domain,
        }),
      });
      showToast('Operational task created successfully!');
      setCreateModalOpen(false);
      setCreateForm({
        title: '',
        task_type: 'GENERAL_OPERATIONAL_TASK',
        source_domain: 'GENERAL',
        source_entity_type: 'task',
        source_entity_id: '0',
        priority: 'NORMAL',
        assigned_team: 'OPERATIONS',
        description: '',
      });
      await refreshData();
    } catch (err: any) {
      showToast(`Creation failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Assign Task
  const handleAssignTask = async () => {
    if (!assignModal) return;
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${assignModal.id}/assign`, {
        method: 'PATCH',
        body: JSON.stringify({
          assigned_to: assignTargetUserId ? Number(assignTargetUserId) : null,
          assigned_team: assignTargetTeam || null,
        }),
      });
      showToast('Task assignment updated.');
      setAssignModal(null);
      await refreshData();
    } catch (err: any) {
      showToast(`Assignment failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Escalate Task
  const handleEscalateTask = async () => {
    if (!escalateModal || !escalateReason.trim()) return;
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${escalateModal.id}/escalate`, {
        method: 'POST',
        body: JSON.stringify({
          reason: escalateReason,
          target_priority: escalatePriority,
        }),
      });
      showToast('Task escalated to Management.');
      setEscalateModal(null);
      setEscalateReason('');
      await refreshData();
    } catch (err: any) {
      showToast(`Escalation failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Resolve Task
  const handleResolveTask = async () => {
    if (!resolveModal || !resolveNotes.trim()) return;
    setActionLoading(true);
    try {
      await api(`/admin/operations/tasks/${resolveModal.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({
          resolution_notes: resolveNotes,
        }),
      });
      showToast('Task marked as Resolved.');
      setResolveModal(null);
      setResolveNotes('');
      await refreshData();
    } catch (err: any) {
      showToast(`Resolution failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  };

  const getPriorityBadgeClass = (priority: TaskPriority) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-rose-100 text-rose-800 border-rose-300 font-bold';
      case 'URGENT':
        return 'bg-amber-100 text-amber-900 border-amber-300 font-bold';
      case 'HIGH':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'NORMAL':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'LOW':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getSlaBadgeClass = (sla: SlaStatus) => {
    switch (sla) {
      case 'BREACHED':
        return 'bg-red-600 text-white font-bold animate-pulse';
      case 'OVERDUE':
        return 'bg-rose-100 text-rose-800 border border-rose-300 font-bold';
      case 'DUE_SOON':
        return 'bg-amber-100 text-amber-800 border border-amber-300 font-semibold';
      case 'ON_TRACK':
        return 'bg-emerald-50 text-emerald-800 border border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusBadgeClass = (status: TaskStatus) => {
    switch (status) {
      case 'OPEN':
        return 'bg-blue-100 text-blue-800';
      case 'ASSIGNED':
        return 'bg-indigo-100 text-indigo-800';
      case 'IN_PROGRESS':
        return 'bg-purple-100 text-purple-800';
      case 'WAITING':
        return 'bg-amber-100 text-amber-800';
      case 'ESCALATED':
        return 'bg-rose-100 text-rose-900 font-bold';
      case 'RESOLVED':
        return 'bg-emerald-100 text-emerald-800 font-semibold';
      case 'CLOSED':
        return 'bg-slate-200 text-slate-700';
      case 'CANCELLED':
        return 'bg-slate-100 text-slate-500 line-through';
      default:
        return 'bg-slate-100 text-slate-700';
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

      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-seal font-semibold bg-seal-soft px-2 py-0.5 rounded">
              Unified Authority
            </span>
            <span className="text-xs text-muted">• Live Work Queue & SLA Engine</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl mt-1">
            Operations Control Tower
          </h1>
          <p className="text-sm text-muted">
            Centralized work queue, task assignment, escalation dispatch, and cross-domain exception management.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={refreshData} disabled={loading}>
            {loading ? 'Refreshing...' : '↻ Refresh'}
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCreateModalOpen(true)}>
            + Create Task
          </Button>
        </div>
      </div>

      {/* KPI Overview Ribbon */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Open Tasks"
          value={overview?.openTasks ?? 0}
          note={`${overview?.unassignedTasks ?? 0} unassigned`}
        />
        <StatTile
          label="Critical / Urgent"
          value={(overview?.criticalTasks ?? 0) + (overview?.urgentTasks ?? 0)}
          note={`${overview?.escalatedTasks ?? 0} escalated`}
        />
        <StatTile
          label="SLA Breached"
          value={overview?.slaBreachedTasks ?? 0}
          note={`${overview?.overdueTasks ?? 0} overdue deadline`}
        />
        <StatTile
          label="My Assigned Tasks"
          value={overview?.myAssignedTasks ?? 0}
          note={`${overview?.resolvedToday ?? 0} resolved today`}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-border text-sm font-medium">
        <button
          onClick={() => setActiveTab('QUEUE')}
          className={`pb-3 px-3 transition-colors border-b-2 font-semibold ${
            activeTab === 'QUEUE'
              ? 'border-seal text-seal font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Work Queue ({total})
        </button>
        <button
          onClick={() => setActiveTab('EXCEPTIONS')}
          className={`pb-3 px-3 transition-colors border-b-2 font-semibold ${
            activeTab === 'EXCEPTIONS'
              ? 'border-seal text-seal font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Cross-Domain Exceptions ({exceptions?.items?.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('SLA_BREACHES')}
          className={`pb-3 px-3 transition-colors border-b-2 font-semibold ${
            activeTab === 'SLA_BREACHES'
              ? 'border-seal text-seal font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          SLA Escalations ({overview?.slaBreachedTasks || 0})
        </button>
        <button
          onClick={() => setActiveTab('WORKLOAD')}
          className={`pb-3 px-3 transition-colors border-b-2 font-semibold ${
            activeTab === 'WORKLOAD'
              ? 'border-seal text-seal font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Domain Breakdown
        </button>
      </div>

      {/* TAB 1: WORK QUEUE */}
      {activeTab === 'QUEUE' && (
        <div className="space-y-4">
          {/* Filters & Search Toolbar */}
          <div className="flex flex-col gap-3 rounded-card border border-border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search ID, title, entity, user..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && refreshData()}
                className="w-64 rounded-button border border-border bg-white px-3 py-1.5 text-xs text-ink placeholder-muted focus:border-seal focus:outline-none"
              />

              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                }}
                className="rounded-button border border-border bg-white px-3 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value="ALL">All Statuses</option>
                <option value="OPEN">OPEN</option>
                <option value="ASSIGNED">ASSIGNED</option>
                <option value="IN_PROGRESS">IN PROGRESS</option>
                <option value="WAITING">WAITING</option>
                <option value="ESCALATED">ESCALATED</option>
                <option value="RESOLVED">RESOLVED</option>
                <option value="CLOSED">CLOSED</option>
              </select>

              <select
                value={priorityFilter}
                onChange={(e) => {
                  setPriorityFilter(e.target.value);
                }}
                className="rounded-button border border-border bg-white px-3 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value="ALL">All Priorities</option>
                <option value="CRITICAL">CRITICAL</option>
                <option value="URGENT">URGENT</option>
                <option value="HIGH">HIGH</option>
                <option value="NORMAL">NORMAL</option>
                <option value="LOW">LOW</option>
              </select>

              <select
                value={domainFilter}
                onChange={(e) => {
                  setDomainFilter(e.target.value);
                }}
                className="rounded-button border border-border bg-white px-3 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value="ALL">All Domains</option>
                <option value="FINANCE">FINANCE</option>
                <option value="LEGAL">LEGAL</option>
                <option value="COMPLIANCE">COMPLIANCE</option>
                <option value="DISPUTES">DISPUTES</option>
                <option value="MARKETPLACE">MARKETPLACE</option>
                <option value="MAINTENANCE">MAINTENANCE</option>
                <option value="VISITS">VISITS</option>
                <option value="LEADS">LEADS</option>
                <option value="COMMUNICATION">COMMUNICATION</option>
                <option value="AUTOMATION">AUTOMATION</option>
              </select>

              <Button variant="secondary" size="sm" onClick={refreshData}>
                Filter
              </Button>
            </div>

            <p className="text-xs text-muted">{tasks.length} task(s) displayed</p>
          </div>

          {/* Tasks Table */}
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface text-muted uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Task ID</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Domain</th>
                    <th className="px-4 py-3">Title & Summary</th>
                    <th className="px-4 py-3">Assignee</th>
                    <th className="px-4 py-3">SLA Status</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-muted">
                        No operational tasks match your criteria.
                      </td>
                    </tr>
                  ) : (
                    tasks.map((task) => (
                      <tr key={task.id} className="hover:bg-surface/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-ink">
                          <Link
                            href={`/dashboard/admin/operations/${task.id}`}
                            className="text-seal hover:underline"
                          >
                            {task.public_id}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] border ${getPriorityBadgeClass(
                              task.priority,
                            )}`}
                          >
                            {task.priority}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-800 rounded font-semibold">
                            {task.source_domain}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-sm">
                          <Link
                            href={`/dashboard/admin/operations/${task.id}`}
                            className="font-medium text-ink hover:text-seal hover:underline block"
                          >
                            {task.title}
                          </Link>
                          {task.description && (
                            <p className="text-muted text-[11px] truncate mt-0.5">{task.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {task.assignee_name ? (
                            <div className="font-medium text-ink">{task.assignee_name}</div>
                          ) : (
                            <span className="italic text-amber-700 font-medium">Unassigned ({task.assigned_team || 'OP'})</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] ${getSlaBadgeClass(
                              task.sla_status,
                            )}`}
                          >
                            {task.sla_status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] ${getStatusBadgeClass(
                              task.status,
                            )}`}
                          >
                            {task.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setAssignModal({
                                id: task.id,
                                title: task.title,
                                currentAssignee: task.assigned_to,
                                currentTeam: task.assigned_team,
                              })
                            }
                          >
                            Assign
                          </Button>
                          {task.status !== 'RESOLVED' && task.status !== 'CLOSED' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() =>
                                setEscalateModal({
                                  id: task.id,
                                  title: task.title,
                                  publicId: task.public_id,
                                })
                              }
                            >
                              Escalate
                            </Button>
                          )}
                          {task.status !== 'RESOLVED' && (
                            <Button
                              variant="primary"
                              size="sm"
                              onClick={() =>
                                setResolveModal({
                                  id: task.id,
                                  title: task.title,
                                  publicId: task.public_id,
                                })
                              }
                            >
                              Resolve
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: UNIFIED EXCEPTIONS */}
      {activeTab === 'EXCEPTIONS' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Unified Cross-Domain Exception Stream"
              note="Live operational anomalies aggregated from Finance, Legal, Compliance, Disputes, and Automation"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface text-muted uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Domain</th>
                    <th className="px-4 py-3">Exception Title</th>
                    <th className="px-4 py-3">Severity</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 text-right">Drilldown</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {exceptions?.items?.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-muted">
                        <div className="text-emerald-700 font-bold text-sm">✓ All Operational Systems Healthy</div>
                        <div className="text-xs text-muted mt-1">No outstanding unhandled platform exceptions.</div>
                      </td>
                    </tr>
                  ) : (
                    exceptions?.items?.map((item, idx) => (
                      <tr key={idx} className="hover:bg-surface/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-ink">{item.category}</td>
                        <td className="px-4 py-3 font-mono text-muted">{item.sourceDomain}</td>
                        <td className="px-4 py-3 font-medium text-ink">{item.title}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold ${
                              item.severity === 'CRITICAL'
                                ? 'bg-rose-100 text-rose-800'
                                : item.severity === 'URGENT'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-blue-50 text-blue-800'
                            }`}
                          >
                            {item.severity}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted">{new Date(item.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            href={item.actionUrl}
                            className="inline-block rounded-button bg-seal px-3 py-1 text-xs font-medium text-white shadow-soft transition-colors hover:bg-seal-deep"
                          >
                            Investigate →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: SLA ESCALATIONS */}
      {activeTab === 'SLA_BREACHES' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Critical SLA Escalation Queue"
              note="Tasks exceeding automated service level thresholds requiring supervisory resolution"
            />
            <div className="divide-y divide-border">
              {tasks
                .filter((t) => ['BREACHED', 'OVERDUE', 'DUE_SOON'].includes(t.sla_status) && t.status !== 'RESOLVED')
                .map((t) => (
                  <div key={t.id} className="p-4 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink">{t.public_id}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded ${getSlaBadgeClass(t.sla_status)}`}>
                          {t.sla_status}
                        </span>
                        <span className="text-xs font-mono text-muted">{t.source_domain}</span>
                      </div>
                      <h4 className="font-semibold text-ink text-sm mt-1">{t.title}</h4>
                      <p className="text-xs text-muted mt-0.5">
                        Assignee: <span className="font-medium text-ink">{t.assignee_name || 'Unassigned'}</span> • Due:{' '}
                        {t.due_at ? new Date(t.due_at).toLocaleString() : 'Immediate'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href={`/dashboard/admin/operations/${t.id}`}
                        className="inline-block rounded-button bg-seal px-3 py-1.5 text-xs font-medium text-white shadow-soft hover:bg-seal-deep"
                      >
                        Open Workspace →
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: DOMAIN BREAKDOWN */}
      {activeTab === 'WORKLOAD' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {overview?.domainBreakdown?.map((d) => (
            <Card key={d.domain} className="p-5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-seal">{d.domain}</span>
                <span className="font-bold text-xl text-ink">{d.count}</span>
              </div>
              <p className="text-xs text-muted mt-2">Active tasks under management supervision.</p>
              {d.urgentCount > 0 && (
                <div className="mt-3 text-xs font-semibold text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                  ⚠️ {d.urgentCount} High/Urgent priority item(s)
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* MODAL: CREATE TASK */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-ink">Create Operational Task</h3>
              <button onClick={() => setCreateModalOpen(false)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Verify High-Value Deposit Payout"
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-ink block mb-1">Source Domain *</label>
                  <select
                    value={createForm.source_domain}
                    onChange={(e) => setCreateForm({ ...createForm, source_domain: e.target.value })}
                    className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                  >
                    <option value="FINANCE">FINANCE</option>
                    <option value="LEGAL">LEGAL</option>
                    <option value="COMPLIANCE">COMPLIANCE</option>
                    <option value="DISPUTES">DISPUTES</option>
                    <option value="MARKETPLACE">MARKETPLACE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="VISITS">VISITS</option>
                    <option value="LEADS">LEADS</option>
                    <option value="COMMUNICATION">COMMUNICATION</option>
                    <option value="GENERAL">GENERAL</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-ink block mb-1">Priority</label>
                  <select
                    value={createForm.priority}
                    onChange={(e) => setCreateForm({ ...createForm, priority: e.target.value })}
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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-ink block mb-1">Entity Type</label>
                  <input
                    type="text"
                    value={createForm.source_entity_type}
                    onChange={(e) => setCreateForm({ ...createForm, source_entity_type: e.target.value })}
                    className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-ink block mb-1">Entity ID / Ref</label>
                  <input
                    type="text"
                    value={createForm.source_entity_id}
                    onChange={(e) => setCreateForm({ ...createForm, source_entity_id: e.target.value })}
                    className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Description & Context</label>
                <textarea
                  rows={3}
                  placeholder="Context, background, and required staff actions..."
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                <Button variant="ghost" size="sm" type="button" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={actionLoading}>
                  {actionLoading ? 'Creating...' : 'Create Task'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ASSIGN TASK */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <h3 className="text-base font-bold text-ink">Assign Operational Task</h3>
              <button onClick={() => setAssignModal(null)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-muted">{assignModal.title}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Assign to User ID</label>
                <input
                  type="number"
                  placeholder="e.g. 1 for Admin"
                  value={assignTargetUserId}
                  onChange={(e) => setAssignTargetUserId(e.target.value)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Target Department / Team</label>
                <select
                  value={assignTargetTeam}
                  onChange={(e) => setAssignTargetTeam(e.target.value)}
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
              <Button variant="ghost" size="sm" onClick={() => setAssignModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={actionLoading} onClick={handleAssignTask}>
                {actionLoading ? 'Saving...' : 'Update Assignment'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ESCALATE TASK */}
      {escalateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <span className="font-mono text-xs text-rose-700 font-bold">{escalateModal.publicId}</span>
                <h3 className="text-base font-bold text-ink">Escalate Task to Management</h3>
              </div>
              <button onClick={() => setEscalateModal(null)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-muted">{escalateModal.title}</p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Target Escalated Priority</label>
                <select
                  value={escalatePriority}
                  onChange={(e) => setEscalatePriority(e.target.value as TaskPriority)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                >
                  <option value="HIGH">HIGH</option>
                  <option value="URGENT">URGENT</option>
                  <option value="CRITICAL">CRITICAL</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-ink block mb-1">Escalation Reason *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Explain why this requires urgent management supervisory intervention..."
                  value={escalateReason}
                  onChange={(e) => setEscalateReason(e.target.value)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setEscalateModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={actionLoading} onClick={handleEscalateTask}>
                {actionLoading ? 'Escalating...' : 'Confirm Escalation'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RESOLVE TASK */}
      {resolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-center border-b border-border pb-3">
              <div>
                <span className="font-mono text-xs text-emerald-700 font-bold">{resolveModal.publicId}</span>
                <h3 className="text-base font-bold text-ink">Resolve Operational Task</h3>
              </div>
              <button onClick={() => setResolveModal(null)} className="text-muted hover:text-ink text-sm font-bold">
                ✕
              </button>
            </div>

            <p className="text-xs text-muted">
              Record completion notes. Note: This will not mutate sensitive financial or legal ledgers.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-ink block mb-1">Resolution Summary / Notes *</label>
                <textarea
                  rows={3}
                  required
                  placeholder="Detail how this operational task was resolved or verified..."
                  value={resolveNotes}
                  onChange={(e) => setResolveNotes(e.target.value)}
                  className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setResolveModal(null)}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" disabled={actionLoading} onClick={handleResolveTask}>
                {actionLoading ? 'Saving...' : 'Confirm Resolution'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
