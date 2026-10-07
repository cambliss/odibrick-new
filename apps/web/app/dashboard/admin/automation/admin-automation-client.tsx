'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, Button, StatusChip, Badge, EmptyState, ErrorNote, StatTile } from '@/components/ui';
import { shortDate } from '@/lib/format';

interface AutomationAnalytics {
  eventsToday: number;
  totalEvents: number;
  executionsToday: number;
  totalExecutions: number;
  failedExecutions: number;
  pendingRetries: number;
  escalatedExecutions: number;
  notificationsSent: number;
  activeRules: number;
  totalRules: number;
}

interface WorkflowEvent {
  id: number;
  public_id: string;
  event_type: string;
  entity_type: string;
  entity_id: number;
  actor_id?: number;
  actor_role?: string;
  correlation_id?: string;
  idempotency_key?: string;
  payload: Record<string, any>;
  occurred_at: string;
  created_at: string;
}

interface WorkflowRule {
  id: number;
  rule_code: string;
  name: string;
  description?: string;
  event_type: string;
  is_enabled: boolean;
  priority: number;
  conditions: Record<string, any>;
  actions: Array<{
    type: string;
    recipient?: string;
    eventCode?: string;
    title?: string;
    body?: string;
    severity?: string;
    notes?: string;
    category?: string;
    actionUrl?: string;
  }>;
  created_at: string;
  updated_at: string;
}

interface WorkflowExecution {
  id: number;
  event_id: number;
  rule_id: number;
  event_public_id: string;
  event_type: string;
  entity_type: string;
  entity_id: number;
  rule_code: string;
  rule_name: string;
  action_type: string;
  recipient_type?: string;
  recipient_id?: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  idempotency_key: string;
  retry_count: number;
  max_retries: number;
  error_message?: string;
  executed_at?: string;
  created_at: string;
}

export function AdminAutomationClient() {
  const [analytics, setAnalytics] = useState<AutomationAnalytics | null>(null);
  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [events, setEvents] = useState<WorkflowEvent[]>([]);
  const [executions, setExecutions] = useState<WorkflowExecution[]>([]);
  const [failures, setFailures] = useState<WorkflowExecution[]>([]);
  const [activeTab, setActiveTab] = useState<'OVERVIEW' | 'RULES' | 'EVENTS' | 'EXECUTIONS' | 'FAILURES'>('OVERVIEW');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Search and filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEventType, setSelectedEventType] = useState<string>('ALL');

  // Modal inspection states
  const [selectedEvent, setSelectedEvent] = useState<WorkflowEvent | null>(null);
  const [selectedExecution, setSelectedExecution] = useState<WorkflowExecution | null>(null);
  const [selectedRule, setSelectedRule] = useState<WorkflowRule | null>(null);
  const [ackModal, setAckModal] = useState<{ id: number; ruleCode: string } | null>(null);
  const [ackNotes, setAckNotes] = useState('');

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [analyticsRes, rulesRes, eventsRes, executionsRes, failuresRes] = await Promise.all([
        api<AutomationAnalytics>('/admin/automation/analytics'),
        api<WorkflowRule[]>('/admin/automation/rules'),
        api<{ items: WorkflowEvent[]; total: number }>('/admin/automation/events?page=1&limit=50'),
        api<{ items: WorkflowExecution[]; total: number }>('/admin/automation/executions?page=1&limit=50'),
        api<WorkflowExecution[]>('/admin/automation/failures'),
      ]);

      setAnalytics(analyticsRes);
      setRules(Array.isArray(rulesRes) ? rulesRes : (rulesRes as any)?.data || []);
      setEvents((eventsRes as any)?.data || (eventsRes as any)?.items || (Array.isArray(eventsRes) ? eventsRes : []));
      setExecutions((executionsRes as any)?.data || (executionsRes as any)?.items || (Array.isArray(executionsRes) ? executionsRes : []));
      setFailures((failuresRes as any)?.data || (failuresRes as any)?.items || (Array.isArray(failuresRes) ? failuresRes : []));
    } catch (err: any) {
      setError(err?.message || 'Failed to load automation engine state.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleToggleRule = async (ruleId: number, currentStatus: boolean) => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api(`/admin/automation/rules/${ruleId}/toggle`, {
        method: 'POST',
        body: JSON.stringify({ isEnabled: !currentStatus }),
      });
      setSuccessMsg(`Rule ${!currentStatus ? 'enabled' : 'disabled'} successfully.`);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to toggle rule.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRetryExecution = async (executionId: number) => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api<{ message: string; execution: WorkflowExecution }>(
        `/admin/automation/executions/${executionId}/retry`,
        { method: 'POST' }
      );
      setSuccessMsg(res?.message || 'Execution retried.');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to retry execution.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleAcknowledgeFailure = async () => {
    if (!ackModal) return;
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await api(`/admin/automation/executions/${ackModal.id}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ notes: ackNotes }),
      });
      setSuccessMsg(`Failure acknowledged and marked as resolved.`);
      setAckModal(null);
      setAckNotes('');
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to acknowledge failure.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRunScheduler = async () => {
    setActionLoading(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api<{ message: string; summary: any }>('/admin/automation/run-scheduler', {
        method: 'POST',
      });
      const s = res?.summary || {};
      setSuccessMsg(
        `Scheduler run complete! Processed ${s.paymentsOverdue || 0} overdue payments, ${
          s.visitsReminded || 0
        } visit reminders, ${s.documentsExpiring || 0} expiring documents, ${s.staleLeads || 0} stale leads.`
      );
      await loadAll();
    } catch (err: any) {
      setError(err?.message || 'Failed to trigger scheduled automation.');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredRules = rules.filter((r) => {
    const matchesSearch =
      r.rule_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.event_type.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = selectedEventType === 'ALL' || r.event_type === selectedEventType;
    return matchesSearch && matchesType;
  });

  const filteredExecutions = executions.filter((ex) => {
    return (
      ex.rule_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.event_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ex.action_type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const distinctEventTypes = Array.from(new Set(rules.map((r) => r.event_type)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-seal-deep font-semibold bg-seal-soft px-2.5 py-0.5 rounded-full border border-seal/20">
              Phase 14 Engine
            </span>
            <span className="text-xs text-muted">Orchestration & Governance</span>
          </div>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            Automation & Workflow Engine
          </h1>
          <p className="mt-1 text-sm text-muted">
            Central event bus, deterministic workflow rules, notification orchestration, SLA escalation, and failure recovery.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="secondary"
            size="sm"
            onClick={loadAll}
            disabled={loading || actionLoading}
          >
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleRunScheduler}
            disabled={actionLoading || loading}
            className="shadow-soft"
          >
            {actionLoading ? 'Evaluating...' : '⚡ Run Scheduled Rules'}
          </Button>
        </div>
      </div>

      {/* Notifications */}
      {error && <ErrorNote>{error}</ErrorNote>}
      {successMsg && (
        <div className="rounded-card border border-emerald-200 bg-emerald-50/90 p-4 text-sm text-emerald-900 shadow-subtle flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="font-bold text-emerald-700">✓</span>
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-xs font-semibold text-emerald-700 hover:text-emerald-900"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Analytics KPI Tiles */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatTile
          label="Events Today"
          value={analytics?.eventsToday ?? 0}
          note={`${analytics?.totalEvents ?? 0} all-time`}
        />
        <StatTile
          label="Executions Today"
          value={analytics?.executionsToday ?? 0}
          note={`${analytics?.totalExecutions ?? 0} total actions`}
        />
        <StatTile
          label="Notifications Sent"
          value={analytics?.notificationsSent ?? 0}
          note="Orchestrated across roles"
        />
        <StatTile
          label="SLA Escalations"
          value={analytics?.escalatedExecutions ?? 0}
          note="Management alerts"
        />
        <StatTile
          label="Active Rules"
          value={`${analytics?.activeRules ?? 0} / ${analytics?.totalRules ?? 0}`}
          note="Predefined & governed"
        />
        <StatTile
          label="Failures / Retries"
          value={analytics?.failedExecutions ?? 0}
          note={`${analytics?.pendingRetries ?? 0} pending retry`}
        />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-border">
        <nav className="flex space-x-6 overflow-x-auto" aria-label="Tabs">
          {[
            { id: 'OVERVIEW', label: 'Overview & Queues', count: failures.length > 0 ? failures.length : undefined },
            { id: 'RULES', label: 'Workflow Rules', count: rules.length },
            { id: 'EVENTS', label: 'Event Stream', count: events.length },
            { id: 'EXECUTIONS', label: 'Execution History', count: executions.length },
            { id: 'FAILURES', label: 'Failure Recovery', count: failures.length, badgeColor: 'bg-rose-100 text-rose-800' },
          ].map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 whitespace-nowrap border-b-2 py-3 text-sm font-medium transition-colors ${
                  active
                    ? 'border-seal-deep font-semibold text-seal-deep'
                    : 'border-transparent text-muted hover:border-border hover:text-ink'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      tab.badgeColor ? tab.badgeColor : active ? 'bg-seal-soft text-seal-deep' : 'bg-surface text-muted'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* TAB 1: OVERVIEW & QUEUES */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Failure Alert Banner if any failures exist */}
          {failures.length > 0 && (
            <div className="rounded-card border border-rose-300 bg-rose-50/80 p-5 shadow-subtle">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                  <h3 className="font-display text-base font-bold text-rose-900 flex items-center gap-2">
                    <span>⚠️</span> {failures.length} Workflow Action Failure(s) Requiring Attention
                  </h3>
                  <p className="text-xs text-rose-700 mt-1">
                    Failed automated actions have exceeded initial retries. Review error payloads or execute a manual retry below.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setActiveTab('FAILURES')}
                  className="bg-white text-rose-900 border-rose-200 hover:bg-rose-100"
                >
                  View Failure Queue →
                </Button>
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Quick Rules Summary */}
            <Card>
              <CardHeader
                title="Active Workflow Rules"
                note="Governed deterministic business automation triggers"
              />
              <div className="divide-y divide-border">
                {rules.slice(0, 6).map((r) => (
                  <div key={r.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink">{r.rule_code}</span>
                        <Badge tone={r.is_enabled ? 'seal' : 'neutral'}>
                          {r.is_enabled ? 'ENABLED' : 'DISABLED'}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium text-ink mt-0.5">{r.name}</p>
                      <p className="text-xs text-muted">
                        Event: <span className="font-mono">{r.event_type}</span> • {r.actions?.length || 0} Action(s)
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedRule(r)}
                    >
                      Inspect
                    </Button>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-surface/50 text-center border-t border-border">
                <button
                  onClick={() => setActiveTab('RULES')}
                  className="text-xs font-semibold text-seal hover:underline"
                >
                  View all {rules.length} workflow rules →
                </button>
              </div>
            </Card>

            {/* Recent Executions Stream */}
            <Card>
              <CardHeader
                title="Recent Workflow Executions"
                note="Live stream of automated rule evaluations and dispatched actions"
              />
              <div className="divide-y divide-border">
                {executions.slice(0, 6).map((ex) => (
                  <div key={ex.id} className="p-4 flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-xs px-2 py-0.5 rounded font-bold ${
                            ex.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : ex.status === 'FAILED'
                              ? 'bg-rose-100 text-rose-800'
                              : ex.status === 'SKIPPED'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {ex.status}
                        </span>
                        <span className="text-xs font-mono text-muted">{ex.rule_code}</span>
                      </div>
                      <p className="text-sm font-medium text-ink mt-0.5">
                        {ex.action_type} → {ex.recipient_type || 'TARGET'}
                      </p>
                      <p className="text-xs text-muted">
                        Entity: <span className="font-mono">{ex.entity_type}#{ex.entity_id}</span> •{' '}
                        {shortDate(ex.created_at)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedExecution(ex)}
                    >
                      Details
                    </Button>
                  </div>
                ))}
              </div>
              <div className="p-3 bg-surface/50 text-center border-t border-border">
                <button
                  onClick={() => setActiveTab('EXECUTIONS')}
                  className="text-xs font-semibold text-seal hover:underline"
                >
                  View full execution stream →
                </button>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 2: WORKFLOW RULES */}
      {activeTab === 'RULES' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                placeholder="Search rule code, name, event..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-72 rounded-button border border-border bg-white px-3 py-1.5 text-xs text-ink placeholder-muted focus:border-seal focus:outline-none"
              />
              <select
                value={selectedEventType}
                onChange={(e) => setSelectedEventType(e.target.value)}
                className="rounded-button border border-border bg-white px-3 py-1.5 text-xs text-ink focus:border-seal focus:outline-none"
              >
                <option value="ALL">All Event Types ({rules.length})</option>
                {distinctEventTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted">{filteredRules.length} rule(s) match filters</p>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface text-muted uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Rule Code</th>
                    <th className="px-4 py-3">Name & Description</th>
                    <th className="px-4 py-3">Event Type</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Actions</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Governance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredRules.map((r) => (
                    <tr key={r.id} className="hover:bg-surface/40 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-ink">{r.rule_code}</td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="font-semibold text-ink">{r.name}</div>
                        <div className="text-muted text-[11px] truncate">{r.description || 'No description'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-mono px-2 py-0.5 bg-slate-100 text-slate-800 rounded font-medium">
                          {r.event_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono">{r.priority}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-ink">{r.actions?.length || 0} Action(s)</span>
                        <div className="text-[11px] text-muted">
                          {r.actions?.map((a) => a.type.replace('CREATE_', '').replace('SEND_', '')).join(', ')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded font-bold text-[10px] ${
                            r.is_enabled
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {r.is_enabled ? 'ENABLED' : 'DISABLED'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedRule(r)}
                        >
                          Inspect
                        </Button>
                        <Button
                          variant={r.is_enabled ? 'secondary' : 'primary'}
                          size="sm"
                          disabled={actionLoading}
                          onClick={() => handleToggleRule(r.id, r.is_enabled)}
                        >
                          {r.is_enabled ? 'Disable' : 'Enable'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 3: EVENT STREAM */}
      {activeTab === 'EVENTS' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Durable Workflow Event Store"
              note="Auditable log of business domain events dispatched across all platform modules"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface text-muted uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Event ID</th>
                    <th className="px-4 py-3">Event Type</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Correlation / Idempotency</th>
                    <th className="px-4 py-3">Occurred At</th>
                    <th className="px-4 py-3 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-muted">
                        No events recorded yet.
                      </td>
                    </tr>
                  ) : (
                    events.map((e) => (
                      <tr key={e.id} className="hover:bg-surface/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-ink">{e.public_id}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono px-2 py-0.5 bg-blue-50 text-blue-800 rounded font-semibold border border-blue-200">
                            {e.event_type}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-ink">
                          {e.entity_type}#{e.entity_id}
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {e.actor_id ? `User #${e.actor_id} (${e.actor_role || 'USER'})` : 'SYSTEM'}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted text-[11px]">
                          {e.correlation_id || '-'}
                        </td>
                        <td className="px-4 py-3 text-muted">{shortDate(e.occurred_at || e.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEvent(e)}
                          >
                            View Payload
                          </Button>
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

      {/* TAB 4: EXECUTION HISTORY */}
      {activeTab === 'EXECUTIONS' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter by rule code, event type, action..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-72 rounded-button border border-border bg-white px-3 py-1.5 text-xs text-ink placeholder-muted focus:border-seal focus:outline-none"
            />
            <p className="text-xs text-muted">{filteredExecutions.length} execution(s)</p>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface text-muted uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">ID</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Rule</th>
                    <th className="px-4 py-3">Action Type</th>
                    <th className="px-4 py-3">Recipient</th>
                    <th className="px-4 py-3">Entity</th>
                    <th className="px-4 py-3">Retries</th>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredExecutions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-6 text-center text-muted">
                        No executions match the filter.
                      </td>
                    </tr>
                  ) : (
                    filteredExecutions.map((ex) => (
                      <tr key={ex.id} className="hover:bg-surface/40 transition-colors">
                        <td className="px-4 py-3 font-mono font-semibold text-muted">#{ex.id}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold ${
                              ex.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : ex.status === 'FAILED'
                                ? 'bg-rose-100 text-rose-800'
                                : ex.status === 'SKIPPED'
                                ? 'bg-slate-100 text-slate-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {ex.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-ink">{ex.rule_code}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{ex.action_type}</td>
                        <td className="px-4 py-3 text-muted">
                          {ex.recipient_type || 'SYSTEM'} {ex.recipient_id ? `(#${ex.recipient_id})` : ''}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted">
                          {ex.entity_type}#{ex.entity_id}
                        </td>
                        <td className="px-4 py-3 font-mono">
                          {ex.retry_count} / {ex.max_retries}
                        </td>
                        <td className="px-4 py-3 text-muted">{shortDate(ex.created_at)}</td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedExecution(ex)}
                          >
                            Inspect
                          </Button>
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

      {/* TAB 5: FAILURE RECOVERY QUEUE */}
      {activeTab === 'FAILURES' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Failed Workflow Action Queue"
              note="Actions that encountered errors or exceeded automatic retry thresholds"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-border bg-surface text-muted uppercase tracking-wider font-semibold">
                  <tr>
                    <th className="px-4 py-3">Execution ID</th>
                    <th className="px-4 py-3">Rule Code</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Target Entity</th>
                    <th className="px-4 py-3">Error Message</th>
                    <th className="px-4 py-3">Retries</th>
                    <th className="px-4 py-3 text-right">Manual Recovery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {failures.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted">
                        <div className="font-bold text-emerald-700 text-sm">✓ All Workflow Actions Healthy</div>
                        <div className="text-xs text-muted mt-1">No pending failure exceptions in the queue.</div>
                      </td>
                    </tr>
                  ) : (
                    failures.map((f) => (
                      <tr key={f.id} className="hover:bg-rose-50/30 transition-colors">
                        <td className="px-4 py-3 font-mono font-bold text-rose-900">#{f.id}</td>
                        <td className="px-4 py-3 font-mono font-bold text-ink">{f.rule_code}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{f.action_type}</td>
                        <td className="px-4 py-3 font-mono text-muted">
                          {f.entity_type}#{f.entity_id}
                        </td>
                        <td className="px-4 py-3 text-rose-700 max-w-sm break-words font-mono text-[11px]">
                          {f.error_message || 'Unknown execution failure'}
                        </td>
                        <td className="px-4 py-3 font-mono font-bold text-rose-800">
                          {f.retry_count} / {f.max_retries}
                        </td>
                        <td className="px-4 py-3 text-right space-x-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => handleRetryExecution(f.id)}
                          >
                            Retry Now
                          </Button>
                          <Button
                            variant="primary"
                            size="sm"
                            disabled={actionLoading}
                            onClick={() => setAckModal({ id: f.id, ruleCode: f.rule_code })}
                          >
                            Acknowledge
                          </Button>
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

      {/* MODAL: EVENT INSPECTOR */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-card bg-white p-6 shadow-float space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <span className="font-mono text-xs text-seal font-bold">{selectedEvent.public_id}</span>
                <h3 className="text-lg font-bold text-ink">{selectedEvent.event_type}</h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted">Entity Target:</span>
                <p className="font-mono font-bold text-ink">
                  {selectedEvent.entity_type} #{selectedEvent.entity_id}
                </p>
              </div>
              <div>
                <span className="text-muted">Actor:</span>
                <p className="font-medium text-ink">
                  {selectedEvent.actor_id
                    ? `User #${selectedEvent.actor_id} (${selectedEvent.actor_role || 'USER'})`
                    : 'SYSTEM'}
                </p>
              </div>
              <div>
                <span className="text-muted">Correlation ID:</span>
                <p className="font-mono text-ink">{selectedEvent.correlation_id || 'None'}</p>
              </div>
              <div>
                <span className="text-muted">Occurred At:</span>
                <p className="text-ink">{shortDate(selectedEvent.occurred_at || selectedEvent.created_at)}</p>
              </div>
            </div>

            <div>
              <span className="text-xs font-semibold text-muted block mb-1">Raw Event Payload:</span>
              <pre className="bg-slate-900 text-emerald-400 p-4 rounded text-xs font-mono overflow-x-auto max-h-60">
                {JSON.stringify(selectedEvent.payload, null, 2)}
              </pre>
            </div>

            <div className="text-right pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setSelectedEvent(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RULE INSPECTOR */}
      {selectedRule && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-card bg-white p-6 shadow-float space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <span className="font-mono text-xs text-seal font-bold">{selectedRule.rule_code}</span>
                <h3 className="text-lg font-bold text-ink">{selectedRule.name}</h3>
              </div>
              <button
                onClick={() => setSelectedRule(null)}
                className="text-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="text-muted font-semibold">Description:</span>
                <p className="text-ink mt-0.5">{selectedRule.description || 'No description provided.'}</p>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <span className="text-muted">Trigger Event:</span>
                  <p className="font-mono font-bold text-ink">{selectedRule.event_type}</p>
                </div>
                <div>
                  <span className="text-muted">Priority:</span>
                  <p className="font-bold text-ink">{selectedRule.priority}</p>
                </div>
                <div>
                  <span className="text-muted">Status:</span>
                  <p className="font-bold text-ink">{selectedRule.is_enabled ? 'ENABLED' : 'DISABLED'}</p>
                </div>
              </div>

              <div>
                <span className="text-muted font-semibold block mb-1">Deterministic Conditions:</span>
                <pre className="bg-slate-900 text-amber-300 p-3 rounded font-mono text-[11px] overflow-x-auto">
                  {JSON.stringify(selectedRule.conditions, null, 2)}
                </pre>
              </div>

              <div>
                <span className="text-muted font-semibold block mb-1">Dispatched Actions:</span>
                <pre className="bg-slate-900 text-cyan-300 p-3 rounded font-mono text-[11px] overflow-x-auto">
                  {JSON.stringify(selectedRule.actions, null, 2)}
                </pre>
              </div>
            </div>

            <div className="text-right pt-2 border-t border-border space-x-2">
              <Button
                variant={selectedRule.is_enabled ? 'secondary' : 'primary'}
                size="sm"
                disabled={actionLoading}
                onClick={async () => {
                  await handleToggleRule(selectedRule.id, selectedRule.is_enabled);
                  setSelectedRule(null);
                }}
              >
                {selectedRule.is_enabled ? 'Disable Rule' : 'Enable Rule'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRule(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: EXECUTION INSPECTOR */}
      {selectedExecution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-card bg-white p-6 shadow-float space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <span className="font-mono text-xs text-muted font-bold">Execution #{selectedExecution.id}</span>
                <h3 className="text-lg font-bold text-ink">{selectedExecution.rule_code}</h3>
              </div>
              <button
                onClick={() => setSelectedExecution(null)}
                className="text-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted">Status:</span>
                <p className="font-bold text-ink">{selectedExecution.status}</p>
              </div>
              <div>
                <span className="text-muted">Action Type:</span>
                <p className="font-bold text-ink">{selectedExecution.action_type}</p>
              </div>
              <div>
                <span className="text-muted">Target Entity:</span>
                <p className="font-mono text-ink">
                  {selectedExecution.entity_type}#{selectedExecution.entity_id}
                </p>
              </div>
              <div>
                <span className="text-muted">Recipient:</span>
                <p className="text-ink">
                  {selectedExecution.recipient_type || 'SYSTEM'}{' '}
                  {selectedExecution.recipient_id ? `(#${selectedExecution.recipient_id})` : ''}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-muted">Idempotency Key:</span>
                <p className="font-mono text-ink break-all text-[11px] bg-surface p-2 rounded">
                  {selectedExecution.idempotency_key}
                </p>
              </div>
              {selectedExecution.error_message && (
                <div className="col-span-2">
                  <span className="text-rose-700 font-semibold">Error Details:</span>
                  <p className="font-mono text-rose-800 break-words text-[11px] bg-rose-50 p-2 rounded border border-rose-200">
                    {selectedExecution.error_message}
                  </p>
                </div>
              )}
            </div>

            <div className="text-right pt-2 border-t border-border space-x-2">
              {selectedExecution.status === 'FAILED' && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={actionLoading}
                  onClick={async () => {
                    await handleRetryExecution(selectedExecution.id);
                    setSelectedExecution(null);
                  }}
                >
                  Retry Action
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setSelectedExecution(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ACKNOWLEDGE FAILURE */}
      {ackModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-float space-y-4">
            <div className="flex justify-between items-start border-b border-border pb-3">
              <div>
                <span className="font-mono text-xs text-rose-700 font-bold">Execution #{ackModal.id}</span>
                <h3 className="text-base font-bold text-ink">Acknowledge Failure</h3>
              </div>
              <button
                onClick={() => setAckModal(null)}
                className="text-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-muted">
              Acknowledging will mark this failure as reviewed and resolved by Management governance.
            </p>

            <div>
              <label className="text-xs font-semibold text-ink block mb-1">Resolution / Audit Notes:</label>
              <textarea
                value={ackNotes}
                onChange={(e) => setAckNotes(e.target.value)}
                placeholder="e.g. Manually resolved with tenant, exception overridden..."
                rows={3}
                className="w-full rounded-button border border-border p-2 text-xs text-ink focus:border-seal focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setAckModal(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={actionLoading}
                onClick={handleAcknowledgeFailure}
              >
                {actionLoading ? 'Saving...' : 'Confirm Acknowledgment'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
