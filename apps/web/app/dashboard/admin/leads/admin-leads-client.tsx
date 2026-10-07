'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AdminLead {
  id: number;
  publicId: string;
  status: string;
  source: string;
  promotionCode?: string;
  message?: string;
  contactPref: string;
  isStale: boolean;
  isSpam: boolean;
  isDuplicate: boolean;
  duplicateOfEnquiryId?: number;
  followUpCount: number;
  property: {
    id: number;
    title: string;
    city: string;
    locality: string;
    rentAmount: number | null;
    visibilityTier: string;
    isFeatured: boolean;
  };
  owner: {
    id: number;
    name: string;
    email: string;
  };
  assignee: {
    id: number;
    name: string;
    email: string;
    assignedAt?: string;
  } | null;
  customer: {
    id: number;
    name: string;
    email: string;
    phone: string;
    kycStatus: string;
  };
  application: { id: number; status: string } | null;
  tenancy: { id: number; stage: string } | null;
  createdAt: string;
  acknowledgedAt?: string;
  contactedAt?: string;
  qualifiedAt?: string;
  convertedAt?: string;
  lostAt?: string;
  lostReason?: string;
  lastContactedAt?: string;
  nextFollowUpAt?: string;
  followUpNotes?: string;
}

interface AdminAnalytics {
  funnel: {
    totalEnquiries: number;
    new: number;
    assigned: number;
    acknowledged: number;
    contacted: number;
    qualified: number;
    converted: number;
    lost: number;
    spam: number;
    closed: number;
    duplicates: number;
    stale: number;
  };
  conversionRates: {
    overallConversionRate: number;
    leadToQualified: number;
    qualifiedToConverted: number;
  };
  responseAverages: {
    avgAckMinutes: number | null;
    avgContactMinutes: number | null;
    avgConvertHours: number | null;
  };
  channelAttribution: Array<{ source: string; count: number; converted_count: number }>;
  topProviders: Array<{ user_id: number; full_name: string; total_leads: number; converted_leads: number; avg_ack_mins: number }>;
  topCities: Array<{ city: string; lead_count: number; converted_count: number }>;
}

export function AdminLeadsClient() {
  const [leads, setLeads] = useState<AdminLead[]>([]);
  const [analytics, setAnalytics] = useState<AdminAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [staleOnly, setStaleOnly] = useState(false);
  const [spamOnly, setSpamOnly] = useState(false);
  const [duplicateOnly, setDuplicateOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<any | null>(null);

  // Management modals
  const [assignModalLead, setAssignModalLead] = useState<AdminLead | null>(null);
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [assignNotes, setAssignNotes] = useState('');
  const [assignSubmitting, setAssignSubmitting] = useState(false);
  const [escalating, setEscalating] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fetchAdminLeads = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const queryParams = new URLSearchParams();
      if (selectedStatus !== 'ALL') queryParams.set('status', selectedStatus);
      if (staleOnly) queryParams.set('staleOnly', 'true');
      if (spamOnly) queryParams.set('spamOnly', 'true');
      if (duplicateOnly) queryParams.set('duplicateOnly', 'true');
      if (searchQuery) queryParams.set('q', searchQuery);

      const [leadsRes, analyticsRes] = await Promise.all([
        fetch(`/api/admin/leads?${queryParams.toString()}`, { headers }),
        fetch('/api/admin/leads/analytics', { headers }),
      ]);

      if (leadsRes.ok) {
        const data = await leadsRes.json();
        setLeads(data.data || []);
      }
      if (analyticsRes.ok) {
        const data = await analyticsRes.json();
        setAnalytics(data);
      }
    } catch (e) {
      console.error('Failed to fetch admin leads', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminLeads();
  }, [selectedStatus, staleOnly, spamOnly, duplicateOnly]);

  const triggerSlaEscalations = async () => {
    setEscalating(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch('/api/admin/leads/process-sla-escalations', {
        method: 'POST',
        headers,
      });
      if (res.ok) {
        const result = await res.json();
        alert(`SLA Escalation processed: ${result.escalatedCount} lead alerts dispatched.`);
        fetchAdminLeads();
      }
    } catch (e: any) {
      alert(e.message || 'Escalation trigger failed');
    } finally {
      setEscalating(false);
    }
  };

  const submitAssignment = async () => {
    if (!assignModalLead || !assigneeUserId) return;
    setAssignSubmitting(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const isReassignment = !!assignModalLead.assignee;
      const endpoint = isReassignment ? 'reassign' : 'assign';

      const res = await fetch(`/api/admin/leads/${assignModalLead.id}/${endpoint}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          assignedUserId: Number(assigneeUserId),
          notes: assignNotes || undefined,
        }),
      });

      if (res.ok) {
        setAssignModalLead(null);
        setAssigneeUserId('');
        setAssignNotes('');
        fetchAdminLeads();
      } else {
        const err = await res.json();
        alert(err.message || 'Assignment failed');
      }
    } catch (e: any) {
      alert(e.message || 'Network error');
    } finally {
      setAssignSubmitting(false);
    }
  };

  const markSpamAction = async (id: number) => {
    if (!confirm('Flag this lead as spam? It will be cleared from active provider queues.')) return;
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      await fetch(`/api/admin/leads/${id}/mark-spam`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ reason: 'Flagged via Management Control Centre' }),
      });
      fetchAdminLeads();
    } catch (e) {
      console.error(e);
    }
  };

  const reopenAction = async (id: number) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      await fetch(`/api/admin/leads/${id}/reopen`, {
        method: 'POST',
        headers,
      });
      fetchAdminLeads();
    } catch (e) {
      console.error(e);
    }
  };

  const inspectLead = async (id: number) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/admin/leads/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedLead(data);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
            <p className="eyebrow text-seal-deep">Odibrick Management Authority</p>
          </div>
          <h1 className="h2 text-ink mt-1">Lead Control Centre & Conversion Governance</h1>
          <p className="text-muted text-sm mt-0.5">
            Platform-wide lead pipeline, assignment & reassignment, SLA monitoring, duplicate filtering, and conversion funnel analytics.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={escalating}
            onClick={triggerSlaEscalations}
            className="rounded-btn border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {escalating ? 'Processing...' : '⚡ Process SLA Escalations'}
          </button>
          <button
            onClick={fetchAdminLeads}
            className="rounded-btn border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-subtle"
          >
            ↻ Refresh Leads
          </button>
        </div>
      </div>

      {/* Analytics KPI Bar */}
      {analytics && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded-card border border-border-subtle bg-white p-4 shadow-sm">
            <p className="text-xs text-muted font-medium">Total Inquiries</p>
            <p className="text-2xl font-bold text-ink mt-1">{analytics.funnel.totalEnquiries}</p>
            <p className="text-[11px] text-muted mt-1">Platform-wide</p>
          </div>
          <div className="rounded-card border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
            <p className="text-xs text-blue-700 font-medium">New / Unassigned</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{analytics.funnel.new}</p>
            <p className="text-[11px] text-blue-600 mt-1">Ready for assignment</p>
          </div>
          <div className="rounded-card border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
            <p className="text-xs text-purple-700 font-medium">Qualified Leads</p>
            <p className="text-2xl font-bold text-purple-900 mt-1">{analytics.funnel.qualified}</p>
            <p className="text-[11px] text-purple-600 mt-1">{analytics.conversionRates.leadToQualified}% of total leads</p>
          </div>
          <div className="rounded-card border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
            <p className="text-xs text-emerald-700 font-medium">Converted Tenancies</p>
            <p className="text-2xl font-bold text-emerald-900 mt-1">{analytics.funnel.converted}</p>
            <p className="text-[11px] text-emerald-600 mt-1">{analytics.conversionRates.overallConversionRate}% overall conversion</p>
          </div>
          <div className="rounded-card border border-red-200 bg-red-50/50 p-4 shadow-sm">
            <p className="text-xs text-red-700 font-medium">Stale SLA Breaches</p>
            <p className="text-2xl font-bold text-red-900 mt-1">{analytics.funnel.stale}</p>
            <p className="text-[11px] text-red-600 mt-1">&gt; 24h unacknowledged</p>
          </div>
          <div className="rounded-card border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
            <p className="text-xs text-amber-700 font-medium">Avg Conversion Speed</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">
              {analytics.responseAverages.avgConvertHours ? `${analytics.responseAverages.avgConvertHours}h` : '—'}
            </p>
            <p className="text-[11px] text-amber-600 mt-1">Enquiry to contract</p>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'SPAM'].map((status) => (
            <button
              key={status}
              onClick={() => { setSelectedStatus(status); setStaleOnly(false); setSpamOnly(false); setDuplicateOnly(false); }}
              className={`rounded-btn px-3 py-1 text-xs font-medium transition-colors ${
                selectedStatus === status && !staleOnly && !spamOnly && !duplicateOnly
                  ? 'bg-seal-deep text-white'
                  : 'bg-surface-subtle text-muted hover:bg-white hover:text-ink'
              }`}
            >
              {status}
            </button>
          ))}
          <button
            onClick={() => { setStaleOnly(!staleOnly); setSelectedStatus('ALL'); setSpamOnly(false); setDuplicateOnly(false); }}
            className={`rounded-btn px-3 py-1 text-xs font-medium transition-colors ${
              staleOnly ? 'bg-red-600 text-white font-semibold' : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            ⚠ Stale SLAs
          </button>
          <button
            onClick={() => { setDuplicateOnly(!duplicateOnly); setSelectedStatus('ALL'); setStaleOnly(false); setSpamOnly(false); }}
            className={`rounded-btn px-3 py-1 text-xs font-medium transition-colors ${
              duplicateOnly ? 'bg-amber-600 text-white font-semibold' : 'bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            Duplicates
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search leads, cities, emails..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchAdminLeads()}
            className="rounded-input border border-border-subtle bg-white px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-seal-deep focus:outline-none w-64"
          />
          <button
            onClick={fetchAdminLeads}
            className="rounded-btn bg-seal-deep px-3 py-1.5 text-xs font-medium text-white hover:bg-seal-light"
          >
            Search
          </button>
        </div>
      </div>

      {/* Global Leads Table */}
      <div className="overflow-hidden rounded-card border border-border-subtle bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-subtle text-muted uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Customer & Message</th>
                <th className="px-4 py-3">Property Context</th>
                <th className="px-4 py-3">Owner & Assignee</th>
                <th className="px-4 py-3">Status & Flags</th>
                <th className="px-4 py-3">Attribution</th>
                <th className="px-4 py-3 text-right">Management Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    Loading global lead operations...
                  </td>
                </tr>
              ) : leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    No leads found matching current criteria.
                  </td>
                </tr>
              ) : (
                leads.map((lead) => (
                  <tr key={lead.id} className={`hover:bg-surface-subtle/50 transition-colors ${lead.isStale ? 'bg-red-50/30' : lead.isSpam ? 'bg-gray-100/50' : ''}`}>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-ink text-[13px]">{lead.customer.name}</div>
                      <div className="text-muted text-[11px]">{lead.customer.email} • {lead.customer.phone}</div>
                      <div className="text-muted text-[11px] mt-1 truncate max-w-xs" title={lead.message}>
                        💬 &quot;{lead.message || 'No custom message'}&quot;
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-ink">{lead.property.title}</div>
                      <div className="text-muted text-[11px]">{lead.property.locality}, {lead.property.city}</div>
                      <div className="text-muted text-[11px] mt-0.5">Rent: ₹{lead.property.rentAmount?.toLocaleString() || '—'}/mo</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-ink font-medium">Owner: {lead.owner.name}</div>
                      <div className="text-[11px] mt-0.5">
                        {lead.assignee ? (
                          <span className="text-blue-700 font-semibold">
                            Assigned to: {lead.assignee.name}
                          </span>
                        ) : (
                          <span className="text-amber-700 font-medium">
                            Unassigned
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          lead.status === 'NEW' ? 'bg-blue-100 text-blue-800' :
                          lead.status === 'ASSIGNED' ? 'bg-indigo-100 text-indigo-800' :
                          lead.status === 'ACKNOWLEDGED' ? 'bg-cyan-100 text-cyan-800' :
                          lead.status === 'QUALIFIED' ? 'bg-purple-100 text-purple-800' :
                          lead.status === 'CONVERTED' ? 'bg-emerald-100 text-emerald-800' :
                          lead.status === 'LOST' ? 'bg-red-100 text-red-800' :
                          lead.status === 'SPAM' ? 'bg-gray-200 text-gray-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {lead.status}
                        </span>
                        {lead.isStale && (
                          <span className="text-[10px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded">
                            ⚠ Stale SLA
                          </span>
                        )}
                        {lead.isDuplicate && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                            Duplicate #{lead.duplicateOfEnquiryId}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        lead.source.includes('PREMIUM') ? 'bg-amber-100 text-amber-900 border border-amber-300' :
                        lead.source.includes('FEATURED') ? 'bg-purple-100 text-purple-900' :
                        lead.source.includes('PROMOTED') ? 'bg-blue-100 text-blue-900' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {lead.source}
                      </span>
                      {lead.promotionCode && (
                        <div className="text-[10px] text-muted font-mono mt-1">{lead.promotionCode}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => inspectLead(lead.id)}
                          className="rounded border border-border-subtle bg-white px-2 py-1 text-[11px] font-medium text-ink hover:bg-surface-subtle"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={() => {
                            setAssignModalLead(lead);
                            setAssigneeUserId(lead.assignee ? String(lead.assignee.id) : '');
                            setAssignNotes('');
                          }}
                          className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                        >
                          {lead.assignee ? 'Reassign' : 'Assign'}
                        </button>
                        {!lead.isSpam && lead.status !== 'SPAM' && (
                          <button
                            onClick={() => markSpamAction(lead.id)}
                            className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] text-gray-700 hover:bg-gray-200"
                          >
                            Spam
                          </button>
                        )}
                        {['SPAM', 'LOST', 'CLOSED'].includes(lead.status) && (
                          <button
                            onClick={() => reopenAction(lead.id)}
                            className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100"
                          >
                            Reopen
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Management Assignment Modal */}
      {assignModalLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-xl space-y-4">
            <h3 className="h3 text-ink">
              {assignModalLead.assignee ? 'Reassign Lead' : 'Assign Marketplace Lead'}
            </h3>
            <p className="text-xs text-muted">
              Assign lead #{assignModalLead.id} for property &quot;{assignModalLead.property.title}&quot; to a dedicated agent or provider.
            </p>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Target User ID (Agent / Provider)</label>
              <input
                type="number"
                placeholder="Enter User ID (e.g. 2)"
                value={assigneeUserId}
                onChange={(e) => setAssigneeUserId(e.target.value)}
                className="w-full rounded-input border border-border-subtle p-2 text-xs focus:border-seal-deep focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-ink mb-1">Management Assignment Notes</label>
              <textarea
                rows={3}
                placeholder="Instructions for the assigned agent..."
                value={assignNotes}
                onChange={(e) => setAssignNotes(e.target.value)}
                className="w-full rounded-input border border-border-subtle p-2 text-xs focus:border-seal-deep focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssignModalLead(null)}
                className="rounded-btn border border-border-subtle px-4 py-2 text-xs font-medium text-ink hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                disabled={assignSubmitting || !assigneeUserId}
                onClick={submitAssignment}
                className="rounded-btn bg-seal-deep px-4 py-2 text-xs font-medium text-white hover:bg-seal-light disabled:opacity-50"
              >
                {assignSubmitting ? 'Saving...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lead Detail Modal */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-card bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <h3 className="h3 text-ink">Lead Trace: {selectedLead.customer.name}</h3>
                <p className="text-xs text-muted font-mono mt-0.5">Enquiry ID #{selectedLead.lead.id} • {selectedLead.lead.publicId}</p>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-muted hover:text-ink text-xl font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 py-4 border-b border-border-subtle text-xs">
              <div>
                <p className="text-muted font-medium">Customer Details</p>
                <p className="font-semibold text-ink mt-1">{selectedLead.customer.name}</p>
                <p className="text-muted">{selectedLead.customer.email}</p>
                <p className="text-muted">{selectedLead.customer.phone}</p>
                <p className="text-muted mt-1">KYC Status: <span className="font-medium text-ink">{selectedLead.customer.kycStatus}</span></p>
              </div>
              <div>
                <p className="text-muted font-medium">Property & Attribution</p>
                <p className="font-semibold text-ink mt-1">{selectedLead.property.title}</p>
                <p className="text-muted">{selectedLead.property.locality}, {selectedLead.property.city}</p>
                <p className="text-muted">Source: <span className="font-medium text-ink">{selectedLead.lead.source}</span></p>
                {selectedLead.lead.promotionCode && <p className="text-muted">Promotion Code: {selectedLead.lead.promotionCode}</p>}
              </div>
            </div>

            {/* Funnel Conversion State */}
            <div className="py-4 border-b border-border-subtle">
              <h4 className="text-xs font-semibold text-ink uppercase tracking-wider mb-2">Funnel Traceability</h4>
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="rounded border border-border-subtle bg-surface-subtle p-2.5">
                  <p className="text-muted text-[11px]">Application</p>
                  <p className="font-semibold text-ink mt-0.5">
                    {selectedLead.application ? `App #${selectedLead.application.id} (${selectedLead.application.status})` : 'Not Created'}
                  </p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-subtle p-2.5">
                  <p className="text-muted text-[11px]">Tenancy</p>
                  <p className="font-semibold text-ink mt-0.5">
                    {selectedLead.tenancy ? `Tenancy #${selectedLead.tenancy.id} (${selectedLead.tenancy.stage})` : 'No Active Tenancy'}
                  </p>
                </div>
                <div className="rounded border border-border-subtle bg-surface-subtle p-2.5">
                  <p className="text-muted text-[11px]">Status</p>
                  <p className="font-semibold text-ink mt-0.5">{selectedLead.lead.status}</p>
                </div>
              </div>
            </div>

            {/* Follow-up Timeline */}
            <div className="py-4">
              <h4 className="text-xs font-semibold text-ink uppercase tracking-wider mb-3">CRM Follow-up Notes</h4>
              {selectedLead.followUps.length === 0 ? (
                <p className="text-xs text-muted">No follow-up notes logged.</p>
              ) : (
                <div className="space-y-3">
                  {selectedLead.followUps.map((fu: any) => (
                    <div key={fu.id} className="rounded border border-border-subtle bg-surface-subtle p-3 text-xs">
                      <div className="flex items-center justify-between text-muted text-[11px] mb-1">
                        <span className="font-semibold text-ink">{fu.author_name} ({fu.contact_channel})</span>
                        <span>{new Date(fu.created_at).toLocaleString()}</span>
                      </div>
                      <p className="text-ink">{fu.note}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end pt-4 border-t border-border-subtle">
              <button
                onClick={() => setSelectedLead(null)}
                className="rounded-btn border border-border-subtle bg-white px-4 py-2 text-xs font-medium text-ink hover:bg-surface-subtle"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
