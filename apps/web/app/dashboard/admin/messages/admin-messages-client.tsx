'use client';

import React, { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { StatTile } from '@/components/ui';
import { dateTime, shortDate } from '@/lib/format';

interface AdminConversation {
  id: number;
  public_id: string;
  context_type: string;
  context_id: number;
  title: string;
  status: string;
  assigned_to: number | null;
  assignee_name: string | null;
  assignee_email: string | null;
  last_message_body: string | null;
  last_message_time: string | null;
  total_messages: number;
  internal_notes_count: number;
  sla_breached: number;
  sla_escalated_at: string | null;
  created_at: string;
}

interface AnalyticsData {
  overview: {
    totalConversations: number;
    openConversations: number;
    activeConversations: number;
    escalatedConversations: number;
    resolvedConversations: number;
    closedConversations: number;
    slaBreachedCount: number;
    resolutionRate: number;
  };
  contextBreakdown: Array<{ context_type: string; count: number }>;
  messagesStats: {
    totalMessages: number;
    totalInternalNotes: number;
    totalSystemMessages: number;
  };
}

export function AdminMessagesClient() {
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [contextTypeFilter, setContextTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [slaFilter, setSlaFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [assignModalConv, setAssignModalConv] = useState<AdminConversation | null>(null);
  const [assigneeId, setAssigneeId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');

  const [noteModalConv, setNoteModalConv] = useState<AdminConversation | null>(null);
  const [internalNoteText, setInternalNoteText] = useState('');

  const [closeModalConv, setCloseModalConv] = useState<AdminConversation | null>(null);
  const [closeNotes, setCloseNotes] = useState('');

  const [processingSla, setProcessingSla] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (contextTypeFilter) params.set('contextType', contextTypeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (slaFilter) params.set('slaBreached', 'true');
      if (searchQuery) params.set('search', searchQuery);

      const [listRes, analyticsRes] = await Promise.all([
        api<{ data: AdminConversation[] }>(`/admin/conversations?${params.toString()}`),
        api<AnalyticsData>('/admin/conversations/analytics'),
      ]);

      setConversations(listRes.data || []);
      setAnalytics(analyticsRes || null);
    } catch (err) {
      console.error('Failed to load admin conversations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [contextTypeFilter, statusFilter, slaFilter, searchQuery]);

  const handleAssign = async () => {
    if (!assignModalConv || !assigneeId) return;
    try {
      await api(`/conversations/${assignModalConv.id}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          assignedTo: Number(assigneeId),
          notes: assignNotes.trim() || undefined,
        }),
      });
      setAssignModalConv(null);
      setAssigneeId('');
      setAssignNotes('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to assign conversation');
    }
  };

  const handlePostInternalNote = async () => {
    if (!noteModalConv || !internalNoteText.trim()) return;
    try {
      await api(`/conversations/${noteModalConv.id}/internal-note`, {
        method: 'POST',
        body: JSON.stringify({ body: internalNoteText.trim() }),
      });
      setNoteModalConv(null);
      setInternalNoteText('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to post internal note');
    }
  };

  const handleCloseConversation = async () => {
    if (!closeModalConv) return;
    try {
      await api(`/conversations/${closeModalConv.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ notes: closeNotes.trim() || undefined }),
      });
      setCloseModalConv(null);
      setCloseNotes('');
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to close conversation');
    }
  };

  const handleProcessSla = async () => {
    try {
      setProcessingSla(true);
      const res = await api<{ processed: number; escalatedCount: number }>(
        '/admin/conversations/process-sla',
        { method: 'POST' },
      );
      alert(
        `SLA Engine evaluated ${res.processed} active conversations. Escalated ${res.escalatedCount} stale threads.`,
      );
      fetchData();
    } catch (err: any) {
      alert(err.message || 'Failed to process SLA escalations');
    } finally {
      setProcessingSla(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OPEN':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800">Open</span>;
      case 'ACTIVE':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">Active</span>;
      case 'ESCALATED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">Escalated</span>;
      case 'RESOLVED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-800">Resolved</span>;
      case 'CLOSED':
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-200 text-gray-600">Closed</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Communication Control Centre</h1>
          <p className="mt-1 text-sm text-muted">
            Global management supervision, escalation handling, staff assignment, and internal operational records.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleProcessSla}
            disabled={processingSla}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-line bg-white hover:bg-paper transition-colors disabled:opacity-50"
          >
            {processingSla ? 'Evaluating SLA...' : '⚡ Process SLA Escalations'}
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      {analytics && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Total Conversations"
            value={analytics.overview.totalConversations}
            note={`${analytics.messagesStats.totalMessages} total messages`}
          />
          <StatTile
            label="Escalated Threads"
            value={analytics.overview.escalatedConversations}
            note={`${analytics.overview.slaBreachedCount} SLA breaches`}
          />
          <StatTile
            label="Resolution Rate"
            value={`${analytics.overview.resolutionRate}%`}
            note={`${analytics.overview.resolvedConversations + analytics.overview.closedConversations} resolved`}
          />
          <StatTile
            label="Internal Notes"
            value={analytics.messagesStats.totalInternalNotes}
            note="Staff-only intelligence"
          />
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="rounded-card border border-line bg-white p-4 space-y-4 shadow-card">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Search Title or Public ID</label>
            <input
              type="text"
              placeholder="Search conversation..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border border-line p-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-seal"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">Context Type</label>
            <select
              className="w-full rounded-md border border-line p-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-seal"
              value={contextTypeFilter}
              onChange={(e) => setContextTypeFilter(e.target.value)}
            >
              <option value="">All Contexts</option>
              <option value="ENQUIRY">Enquiry</option>
              <option value="VISIT">Property Visit</option>
              <option value="APPLICATION">Application</option>
              <option value="TENANCY">Tenancy</option>
              <option value="MAINTENANCE">Maintenance</option>
              <option value="DISPUTE">Dispute</option>
              <option value="LEGAL_CASE">Legal Case</option>
              <option value="SUPPORT">Support</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1">Status</label>
            <select
              className="w-full rounded-md border border-line p-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-seal"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="ACTIVE">Active</option>
              <option value="ESCALATED">Escalated</option>
              <option value="RESOLVED">Resolved</option>
              <option value="CLOSED">Closed</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm font-medium text-ink cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={slaFilter}
                onChange={(e) => setSlaFilter(e.target.checked)}
                className="rounded border-line text-seal focus:ring-seal"
              />
              <span>SLA Breached Only</span>
            </label>
          </div>
        </div>
      </div>

      {/* Conversations Table */}
      <div className="rounded-card border border-line bg-white shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-paper text-xs font-semibold text-muted border-b border-line">
              <tr>
                <th className="p-3">Public ID</th>
                <th className="p-3">Context</th>
                <th className="p-3">Title / Subject</th>
                <th className="p-3">Status</th>
                <th className="p-3">Assignee</th>
                <th className="p-3">Messages</th>
                <th className="p-3">Last Activity</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {loading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-muted">
                    Loading conversations...
                  </td>
                </tr>
              ) : conversations.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-muted">
                    No conversations match the selected filters.
                  </td>
                </tr>
              ) : (
                conversations.map((c) => (
                  <tr key={c.id} className="hover:bg-paper/50 transition-colors">
                    <td className="p-3 font-mono text-xs font-semibold text-seal-deep">
                      {c.public_id}
                    </td>
                    <td className="p-3">
                      <span className="font-mono text-[11px] font-semibold bg-paper px-2 py-0.5 rounded border border-line text-ink">
                        {c.context_type} #{c.context_id}
                      </span>
                    </td>
                    <td className="p-3 max-w-xs">
                      <div className="font-medium text-ink line-clamp-1">{c.title}</div>
                      {c.last_message_body && (
                        <div className="text-xs text-muted line-clamp-1 mt-0.5">
                          {c.last_message_body}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        {getStatusBadge(c.status)}
                        {c.sla_breached === 1 && (
                          <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded">
                            SLA
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-xs">
                      {c.assignee_name ? (
                        <span className="font-medium">{c.assignee_name}</span>
                      ) : (
                        <span className="text-muted italic">Unassigned</span>
                      )}
                    </td>
                    <td className="p-3 text-xs">
                      <div>{c.total_messages} msgs</div>
                      {c.internal_notes_count > 0 && (
                        <span className="text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded font-medium border border-amber-200">
                          {c.internal_notes_count} notes
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-muted">
                      {c.last_message_time ? dateTime(c.last_message_time) : shortDate(c.created_at)}
                    </td>
                    <td className="p-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          className="px-2.5 py-1 text-xs font-medium rounded border border-line bg-white hover:bg-paper"
                          onClick={() => setAssignModalConv(c)}
                        >
                          Assign
                        </button>
                        <button
                          type="button"
                          className="px-2.5 py-1 text-xs font-medium rounded border border-line bg-white hover:bg-paper"
                          onClick={() => setNoteModalConv(c)}
                        >
                          + Note
                        </button>
                        {c.status !== 'CLOSED' && (
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs font-medium rounded border border-line bg-white hover:bg-paper"
                            onClick={() => setCloseModalConv(c)}
                          >
                            Close
                          </button>
                        )}
                        <a
                          href={`/dashboard/messages?conversationId=${c.id}`}
                          className="inline-flex items-center justify-center rounded border border-seal bg-seal text-white px-2.5 py-1 text-xs font-medium hover:bg-seal-deep"
                        >
                          View Thread
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Assign Handler Modal */}
      {assignModalConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-surface rounded-card border border-line p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-semibold">
              Assign Handler — {assignModalConv.public_id}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Target User ID (Staff / Agent)</label>
                <input
                  type="text"
                  placeholder="e.g. 1 (Super Admin), 2 (Admin), 3 (Legal)"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full rounded-md border border-line p-2 text-sm bg-paper focus:outline-none focus:ring-2 focus:ring-seal"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Assignment Note / Context</label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-line p-2 text-sm focus:outline-none focus:ring-2 focus:ring-seal"
                  placeholder="Specific instructions for the handler..."
                  value={assignNotes}
                  onChange={(e) => setAssignNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-line bg-white hover:bg-paper"
                onClick={() => setAssignModalConv(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-seal text-white hover:bg-seal-deep disabled:opacity-50"
                onClick={handleAssign}
                disabled={!assigneeId}
              >
                Confirm Assignment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post Internal Note Modal */}
      {noteModalConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-surface rounded-card border border-line p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-semibold">
              Add Internal Management Note — {noteModalConv.public_id}
            </h3>
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-300 rounded p-3 text-xs text-amber-900">
                Internal notes are permanently recorded in the audit trail and visible only to Odibrick Management.
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Operational Note</label>
                <textarea
                  rows={4}
                  className="w-full rounded-md border border-amber-300 bg-amber-50/30 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Record compliance, customer intelligence, or investigation findings..."
                  value={internalNoteText}
                  onChange={(e) => setInternalNoteText(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-line bg-white hover:bg-paper"
                onClick={() => setNoteModalConv(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-50"
                onClick={handlePostInternalNote}
                disabled={!internalNoteText.trim()}
              >
                Post Internal Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Close Conversation Modal */}
      {closeModalConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md bg-surface rounded-card border border-line p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-semibold">
              Formally Close Conversation — {closeModalConv.public_id}
            </h3>
            <div className="space-y-3">
              <p className="text-xs text-muted">
                Closing this conversation terminates active messaging. It can be reopened later if required.
              </p>
              <div>
                <label className="block text-xs font-medium mb-1">Closure Notes</label>
                <textarea
                  rows={2}
                  className="w-full rounded-md border border-line p-2 text-sm focus:outline-none focus:ring-2 focus:ring-seal"
                  placeholder="Final summary or resolution notes..."
                  value={closeNotes}
                  onChange={(e) => setCloseNotes(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-md border border-line bg-white hover:bg-paper"
                onClick={() => setCloseModalConv(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="px-3 py-1.5 text-xs font-medium rounded-md bg-alert text-white hover:opacity-90"
                onClick={handleCloseConversation}
              >
                Confirm Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
