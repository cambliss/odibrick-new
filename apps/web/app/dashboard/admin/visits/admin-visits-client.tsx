'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface VisitItem {
  id: number;
  publicId: string;
  status: string;
  visitType: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  customerNotes?: string;
  providerNotes?: string;
  cancellationReason?: string;
  rescheduleReason?: string;
  confirmedAt?: string;
  completedAt?: string;
  noShowAt?: string;
  outcome?: string;
  outcomeNotes?: string;
  slaEscalated?: boolean;
  property: {
    id: number;
    title: string;
    city: string;
    locality: string;
    rentAmount: number | null;
    visibilityTier: string;
    isFeatured: boolean;
  };
  customer: {
    id: number;
    name: string;
    email: string;
    phone: string;
  };
  host: {
    id: number;
    name: string;
    email: string;
    phone: string;
  };
  enquiry?: {
    id: number;
    source: string;
    promotionId: number | null;
  };
  application?: {
    id: number;
    status: string;
  } | null;
  createdAt: string;
}

interface AnalyticsData {
  pipeline: {
    totalVisits: number;
    requested: number;
    proposed: number;
    confirmed: number;
    completed: number;
    cancelled: number;
    noShowCustomer: number;
    noShowProvider: number;
    staleVisits: number;
  };
  rates: {
    completionRate: number;
    cancellationRate: number;
    noShowRate: number;
    visitToApplicationRate: number;
  };
  timings: {
    avgEnquiryToVisitHours: number | null;
    avgVisitToAppHours: number | null;
  };
}

export function AdminVisitsClient() {
  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [cityFilter, setCityFilter] = useState('');
  const [staleFilter, setStaleFilter] = useState(false);
  const [noShowFilter, setNoShowFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [selectedVisit, setSelectedVisit] = useState<VisitItem | null>(null);
  const [modalMode, setModalMode] = useState<'ASSIGN' | 'OVERRIDE' | null>(null);
  const [assignHostId, setAssignHostId] = useState('');
  const [overrideAction, setOverrideAction] = useState('CONFIRM');
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideDate, setOverrideDate] = useState('');
  const [actionNotes, setActionNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (cityFilter) params.append('city', cityFilter);
      if (staleFilter) params.append('staleOnly', 'true');
      if (noShowFilter) params.append('noShowOnly', 'true');
      if (searchQuery) params.append('q', searchQuery);

      const [visitsRes, analyticsRes] = await Promise.all([
        fetch(`/api/admin/visits?${params.toString()}`),
        fetch('/api/admin/visits/analytics'),
      ]);

      if (!visitsRes.ok || !analyticsRes.ok) {
        throw new Error('Failed to load management visit operations.');
      }

      const visitsJson = await visitsRes.json();
      const analyticsJson = await analyticsRes.json();
      setVisits(visitsJson.data || []);
      setAnalytics(analyticsJson);
    } catch (err: any) {
      setError(err.message || 'Error loading visit control centre.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, cityFilter, staleFilter, noShowFilter, searchQuery]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleReminders = async () => {
    try {
      setSubmitting(true);
      const res = await fetch('/api/admin/visits/process-reminders', { method: 'POST' });
      const data = await res.json();
      setSuccessMsg(`Processed ${data.totalProcessed} automated visit reminders (${data.reminders24hSent} 24h, ${data.reminders2hSent} 2h).`);
    } catch (err: any) {
      setError('Failed to process reminders.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSlaEscalate = async () => {
    try {
      setSubmitting(true);
      const res = await fetch('/api/admin/visits/sla-escalate', { method: 'POST' });
      const data = await res.json();
      setSuccessMsg(`SLA Escalation processed: ${data.escalatedCount} stale visits flagged.`);
      await loadData();
    } catch (err: any) {
      setError('Failed to process SLA escalations.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit || !modalMode) return;
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let endpoint = '';
      let body: any = {};

      if (modalMode === 'ASSIGN') {
        endpoint = `/api/admin/visits/${selectedVisit.id}/assign`;
        body = { hostUserId: Number(assignHostId), notes: actionNotes };
      } else if (modalMode === 'OVERRIDE') {
        endpoint = `/api/admin/visits/${selectedVisit.id}/override`;
        body = {
          action: overrideAction,
          reason: overrideReason,
          scheduledStart: overrideAction === 'RESCHEDULE' ? overrideDate : undefined,
          notes: actionNotes,
        };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Action failed.');
      }

      setSuccessMsg('Management override applied successfully.');
      setModalMode(null);
      setSelectedVisit(null);
      setAssignHostId('');
      setOverrideReason('');
      setActionNotes('');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-ink">Visit Control Centre</h1>
            <span className="rounded-md bg-seal-soft px-2 py-0.5 text-xs font-semibold text-seal-deep border border-seal-deep/20">
              Management Authority
            </span>
          </div>
          <p className="text-sm text-muted">
            Platform-wide visit oversight, host reassignments, SLA escalations, conflict overrides, and conversion analytics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleReminders}
            disabled={submitting}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-slate-50 transition-colors shadow-sm"
          >
            Dispatch Reminders
          </button>
          <button
            onClick={handleSlaEscalate}
            disabled={submitting}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700 transition-colors shadow-sm"
          >
            Trigger SLA Escalations
          </button>
          <button
            onClick={loadData}
            className="rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-slate-50 transition-colors shadow-sm"
          >
            Refresh
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          ✓ {successMsg}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          ⚠ {error}
        </div>
      )}

      {/* Analytics Metric Cards */}
      {analytics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-muted">Total Visits</span>
            <p className="text-xl font-bold text-ink">{analytics.pipeline.totalVisits}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-amber-700">Requested</span>
            <p className="text-xl font-bold text-amber-700">{analytics.pipeline.requested}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-emerald-700">Confirmed</span>
            <p className="text-xl font-bold text-emerald-700">{analytics.pipeline.confirmed}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-indigo-700">Completed</span>
            <p className="text-xl font-bold text-indigo-700">{analytics.pipeline.completed}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-slate-700">No-Shows</span>
            <p className="text-xl font-bold text-slate-800">
              {analytics.pipeline.noShowCustomer + analytics.pipeline.noShowProvider}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-rose-700">Stale Visits</span>
            <p className="text-xl font-bold text-rose-700">{analytics.pipeline.staleVisits}</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-muted">Completion Rate</span>
            <p className="text-xl font-bold text-emerald-700">{analytics.rates.completionRate}%</p>
          </div>
          <div className="rounded-xl border border-line bg-white p-3 shadow-sm">
            <span className="text-[10px] uppercase font-semibold text-muted">Visit $\rightarrow$ App</span>
            <p className="text-xl font-bold text-indigo-700">{analytics.rates.visitToApplicationRate}%</p>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3.5 shadow-sm">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink focus:ring-1 focus:ring-ink"
        >
          <option value="ALL">All Statuses</option>
          <option value="REQUESTED">Requested</option>
          <option value="PROPOSED">Proposed</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="NO_SHOW_CUSTOMER">No-Show (Customer)</option>
          <option value="NO_SHOW_PROVIDER">No-Show (Provider)</option>
          <option value="CANCELLED">Cancelled</option>
        </select>

        <input
          type="text"
          placeholder="Filter city..."
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="w-28 rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:ring-1 focus:ring-ink"
        />

        <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={staleFilter}
            onChange={(e) => setStaleFilter(e.target.checked)}
            className="rounded border-line text-ink focus:ring-ink"
          />
          Stale Only (&gt;24h)
        </label>

        <label className="flex items-center gap-1.5 text-xs text-ink cursor-pointer">
          <input
            type="checkbox"
            checked={noShowFilter}
            onChange={(e) => setNoShowFilter(e.target.checked)}
            className="rounded border-line text-ink focus:ring-ink"
          />
          No-Shows Only
        </label>

        <input
          type="text"
          placeholder="Search property, customer, host..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 min-w-[200px] rounded-lg border border-line px-2.5 py-1.5 text-xs text-ink placeholder:text-muted focus:ring-1 focus:ring-ink"
        />
      </div>

      {/* Visits Table */}
      <div className="overflow-x-auto rounded-xl border border-line bg-white shadow-sm">
        <table className="w-full text-left text-xs text-ink">
          <thead className="border-b border-line bg-slate-50 text-[11px] font-semibold uppercase text-muted">
            <tr>
              <th className="p-3">Visit ID</th>
              <th className="p-3">Property</th>
              <th className="p-3">Customer / Lead</th>
              <th className="p-3">Assigned Host</th>
              <th className="p-3">Scheduled Time</th>
              <th className="p-3">Status</th>
              <th className="p-3">Outcome</th>
              <th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted">
                  Loading visit records...
                </td>
              </tr>
            ) : visits.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-8 text-center text-muted">
                  No visits match current query filters.
                </td>
              </tr>
            ) : (
              visits.map((v) => (
                <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3 font-mono text-[11px]">#{v.id}</td>
                  <td className="p-3">
                    <p className="font-medium text-ink max-w-[180px] truncate">{v.property.title}</p>
                    <p className="text-[11px] text-muted">{v.property.city} · {v.property.visibilityTier}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium text-ink">{v.customer.name}</p>
                    <p className="text-[11px] text-muted">{v.customer.email}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium text-ink">{v.host.name}</p>
                    <p className="text-[11px] text-muted">{v.host.email}</p>
                  </td>
                  <td className="p-3">
                    <p className="font-medium text-ink">{new Date(v.scheduledStart).toLocaleDateString()}</p>
                    <p className="text-[11px] text-muted">{new Date(v.scheduledStart).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </td>
                  <td className="p-3">
                    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border bg-slate-100 text-slate-700">
                      {v.status}
                    </span>
                    {v.slaEscalated && (
                      <span className="ml-1 inline-flex items-center rounded-full bg-rose-100 px-1.5 py-0.2 text-[9px] font-bold text-rose-700">
                        SLA
                      </span>
                    )}
                  </td>
                  <td className="p-3">
                    {v.outcome ? (
                      <span className="font-semibold text-emerald-800 text-[11px]">{v.outcome}</span>
                    ) : (
                      <span className="text-muted text-[11px]">—</span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => { setSelectedVisit(v); setModalMode('ASSIGN'); }}
                        className="rounded border border-line px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                      >
                        Assign
                      </button>
                      <button
                        onClick={() => { setSelectedVisit(v); setModalMode('OVERRIDE'); }}
                        className="rounded bg-ink px-2 py-1 text-[11px] font-medium text-white hover:bg-slate-800"
                      >
                        Override
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Admin Action Modal */}
      {modalMode && selectedVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-ink">
              {modalMode === 'ASSIGN' ? 'Assign Visit Host' : 'Management Visit Override'}
            </h2>
            <p className="mt-1 text-xs text-muted">
              Visit #{selectedVisit.id} · {selectedVisit.property.title}
            </p>

            <form onSubmit={handleModalSubmit} className="mt-4 space-y-4">
              {modalMode === 'ASSIGN' ? (
                <div>
                  <label className="block text-xs font-medium text-ink">Assigned Host User ID *</label>
                  <input
                    type="number"
                    required
                    placeholder="Enter Host User ID..."
                    value={assignHostId}
                    onChange={(e) => setAssignHostId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-medium text-ink">Override Action *</label>
                    <select
                      value={overrideAction}
                      onChange={(e) => setOverrideAction(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                    >
                      <option value="CONFIRM">Force Confirm Visit</option>
                      <option value="COMPLETE">Force Complete Visit</option>
                      <option value="RESCHEDULE">Reschedule Visit</option>
                      <option value="REOPEN">Reopen to Proposed</option>
                      <option value="CANCEL">Cancel Visit</option>
                    </select>
                  </div>

                  {overrideAction === 'RESCHEDULE' && (
                    <div>
                      <label className="block text-xs font-medium text-ink">New Scheduled Date & Time *</label>
                      <input
                        type="datetime-local"
                        required
                        value={overrideDate}
                        onChange={(e) => setOverrideDate(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-ink">Management Reason *</label>
                    <input
                      type="text"
                      required
                      placeholder="Mandatory audit explanation..."
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-medium text-ink">Notes (Optional)</label>
                <textarea
                  rows={2}
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-ink px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? 'Applying...' : 'Apply Override'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
