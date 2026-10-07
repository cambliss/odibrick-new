'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Lead {
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

interface Analytics {
  pipeline: {
    totalLeads: number;
    newLeads: number;
    assignedLeads: number;
    acknowledgedLeads: number;
    contactedLeads: number;
    qualifiedLeads: number;
    convertedLeads: number;
    lostLeads: number;
    closedLeads: number;
    spamLeads: number;
    staleLeadsCount: number;
  };
  performance: {
    conversionRate: number;
    avgAckMinutes: number | null;
    avgContactMinutes: number | null;
  };
}

export function LeadsInboxClient() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [staleOnly, setStaleOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLead, setSelectedLead] = useState<any | null>(null);

  // Action modals
  const [activeModal, setActiveModal] = useState<string | null>(null);
  const [modalLeadId, setModalLeadId] = useState<number | null>(null);
  const [modalText, setModalText] = useState('');
  const [modalDate, setModalDate] = useState('');
  const [modalSubmitting, setModalSubmitting] = useState(false);

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const queryParams = new URLSearchParams();
      if (selectedStatus !== 'ALL') queryParams.set('status', selectedStatus);
      if (staleOnly) queryParams.set('staleOnly', 'true');
      if (searchQuery) queryParams.set('q', searchQuery);

      const [leadsRes, analyticsRes] = await Promise.all([
        fetch(`/api/provider/leads?${queryParams.toString()}`, { headers }),
        fetch('/api/provider/leads/analytics', { headers }),
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
      console.error('Failed to fetch provider leads', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, [selectedStatus, staleOnly]);

  const openActionModal = (leadId: number, type: string) => {
    setModalLeadId(leadId);
    setActiveModal(type);
    setModalText('');
    setModalDate('');
  };

  const submitAction = async () => {
    if (!modalLeadId || !activeModal) return;
    setModalSubmitting(true);
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      let url = `/api/provider/leads/${modalLeadId}/${activeModal}`;
      let body: any = {};

      if (activeModal === 'contact') {
        body = { notes: modalText, nextFollowUpAt: modalDate || undefined };
      } else if (activeModal === 'qualify') {
        body = { notes: modalText, nextFollowUpAt: modalDate || undefined };
      } else if (activeModal === 'follow-up') {
        body = { note: modalText, nextFollowUpAt: modalDate || undefined };
      } else if (activeModal === 'lost') {
        body = { reason: modalText };
      } else if (activeModal === 'convert') {
        body = { message: modalText };
      } else if (activeModal === 'acknowledge') {
        body = {};
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        setActiveModal(null);
        setModalLeadId(null);
        fetchLeads();
      } else {
        const err = await res.json();
        alert(err.message || 'Action failed');
      }
    } catch (e: any) {
      alert(e.message || 'Network error');
    } finally {
      setModalSubmitting(false);
    }
  };

  const viewLeadDetail = async (id: number) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const res = await fetch(`/api/provider/leads/${id}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setSelectedLead(data);
      }
    } catch (e) {
      console.error('Failed to load lead details', e);
    }
  };

  return (
    <div className="space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border-subtle pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <p className="eyebrow text-seal-deep">Marketplace Lead Engine</p>
          </div>
          <h1 className="h2 text-ink mt-1">Leads & Enquiries Inbox</h1>
          <p className="text-muted text-sm mt-0.5">
            Real-time pipeline to qualify, follow up, and convert tenant enquiries into active tenancies.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchLeads}
            className="rounded-btn border border-border-subtle bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-subtle"
          >
            ↻ Refresh Inbox
          </button>
        </div>
      </div>

      {/* Analytics KPI Bar */}
      {analytics && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
          <div className="rounded-card border border-border-subtle bg-white p-4 shadow-sm">
            <p className="text-xs text-muted font-medium">Total Pipeline</p>
            <p className="text-2xl font-bold text-ink mt-1">{analytics.pipeline.totalLeads}</p>
            <p className="text-[11px] text-muted mt-1">Enquiries received</p>
          </div>
          <div className="rounded-card border border-blue-200 bg-blue-50/50 p-4 shadow-sm">
            <p className="text-xs text-blue-700 font-medium">New Leads</p>
            <p className="text-2xl font-bold text-blue-900 mt-1">{analytics.pipeline.newLeads}</p>
            <p className="text-[11px] text-blue-600 mt-1">Awaiting review</p>
          </div>
          <div className="rounded-card border border-purple-200 bg-purple-50/50 p-4 shadow-sm">
            <p className="text-xs text-purple-700 font-medium">Qualified</p>
            <p className="text-2xl font-bold text-purple-900 mt-1">{analytics.pipeline.qualifiedLeads}</p>
            <p className="text-[11px] text-purple-600 mt-1">High conversion potential</p>
          </div>
          <div className="rounded-card border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
            <p className="text-xs text-emerald-700 font-medium">Converted</p>
            <p className="text-2xl font-bold text-emerald-900 mt-1">{analytics.pipeline.convertedLeads}</p>
            <p className="text-[11px] text-emerald-600 mt-1">{analytics.performance.conversionRate}% conversion rate</p>
          </div>
          <div className="rounded-card border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
            <p className="text-xs text-amber-700 font-medium">Avg Contact Time</p>
            <p className="text-2xl font-bold text-amber-900 mt-1">
              {analytics.performance.avgContactMinutes ? `${analytics.performance.avgContactMinutes}m` : '—'}
            </p>
            <p className="text-[11px] text-amber-600 mt-1">From enquiry created</p>
          </div>
          <div className={`rounded-card border p-4 shadow-sm ${analytics.pipeline.staleLeadsCount > 0 ? 'border-red-300 bg-red-50/60' : 'border-border-subtle bg-white'}`}>
            <p className={`text-xs font-medium ${analytics.pipeline.staleLeadsCount > 0 ? 'text-red-700 font-semibold' : 'text-muted'}`}>SLA Stale Alerts</p>
            <p className={`text-2xl font-bold mt-1 ${analytics.pipeline.staleLeadsCount > 0 ? 'text-red-800' : 'text-ink'}`}>
              {analytics.pipeline.staleLeadsCount}
            </p>
            <p className={`text-[11px] mt-1 ${analytics.pipeline.staleLeadsCount > 0 ? 'text-red-600 font-medium' : 'text-muted'}`}>
              {analytics.pipeline.staleLeadsCount > 0 ? 'Requires immediate action' : 'All SLAs within limits'}
            </p>
          </div>
        </div>
      )}

      {/* Filter Tabs & Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {['ALL', 'NEW', 'ACKNOWLEDGED', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'].map((status) => (
            <button
              key={status}
              onClick={() => { setSelectedStatus(status); setStaleOnly(false); }}
              className={`rounded-btn px-3 py-1 text-xs font-medium transition-colors ${
                selectedStatus === status && !staleOnly
                  ? 'bg-seal-deep text-white'
                  : 'bg-surface-subtle text-muted hover:bg-white hover:text-ink'
              }`}
            >
              {status}
            </button>
          ))}
          <button
            onClick={() => { setStaleOnly(!staleOnly); setSelectedStatus('ALL'); }}
            className={`rounded-btn px-3 py-1 text-xs font-medium transition-colors ${
              staleOnly
                ? 'bg-red-600 text-white font-semibold'
                : 'bg-red-50 text-red-700 hover:bg-red-100'
            }`}
          >
            ⚠ Stale SLA Alerts
          </button>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search leads, names, properties..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && fetchLeads()}
            className="rounded-input border border-border-subtle bg-white px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:border-seal-deep focus:outline-none w-64"
          />
          <button
            onClick={fetchLeads}
            className="rounded-btn bg-seal-deep px-3 py-1.5 text-xs font-medium text-white hover:bg-seal-light"
          >
            Search
          </button>
        </div>
      </div>

      {/* Leads List Table */}
      <div className="overflow-hidden rounded-card border border-border-subtle bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border-subtle bg-surface-subtle text-muted uppercase font-semibold">
              <tr>
                <th className="px-4 py-3">Lead & Customer</th>
                <th className="px-4 py-3">Property Context</th>
                <th className="px-4 py-3">Source & Promotion</th>
                <th className="px-4 py-3">Status & SLA</th>
                <th className="px-4 py-3">Follow-up State</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted">
                    Loading marketplace leads...
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
                  <tr key={lead.id} className={`hover:bg-surface-subtle/50 transition-colors ${lead.isStale ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-ink text-[13px]">{lead.customer.name}</div>
                      <div className="text-muted text-[11px]">{lead.customer.email} • {lead.customer.phone}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          lead.customer.kycStatus === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          KYC: {lead.customer.kycStatus}
                        </span>
                        {lead.message && (
                          <span className="text-muted text-[11px] truncate max-w-xs" title={lead.message}>
                            💬 &quot;{lead.message}&quot;
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-ink">{lead.property.title}</div>
                      <div className="text-muted text-[11px]">{lead.property.locality}, {lead.property.city}</div>
                      <div className="text-muted text-[11px] mt-0.5">₹{lead.property.rentAmount?.toLocaleString() || '—'}/mo</div>
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
                        <div className="text-[10px] text-muted mt-1 font-mono">{lead.promotionCode}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          lead.status === 'NEW' ? 'bg-blue-100 text-blue-800' :
                          lead.status === 'ACKNOWLEDGED' ? 'bg-indigo-100 text-indigo-800' :
                          lead.status === 'CONTACTED' ? 'bg-cyan-100 text-cyan-800' :
                          lead.status === 'QUALIFIED' ? 'bg-purple-100 text-purple-800' :
                          lead.status === 'CONVERTED' ? 'bg-emerald-100 text-emerald-800' :
                          lead.status === 'LOST' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {lead.status}
                        </span>
                        {lead.isStale && (
                          <span className="text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.2 rounded animate-pulse">
                            ⚠ Stale SLA Breach
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-[11px] text-ink">
                        {lead.nextFollowUpAt ? (
                          <span className={new Date(lead.nextFollowUpAt) < new Date() ? 'text-red-600 font-semibold' : 'text-ink font-medium'}>
                            Due: {new Date(lead.nextFollowUpAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted">No follow-up set</span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted mt-0.5">
                        {lead.followUpCount} note(s) logged
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => viewLeadDetail(lead.id)}
                          className="rounded border border-border-subtle bg-white px-2 py-1 text-[11px] font-medium text-ink hover:bg-surface-subtle"
                        >
                          Inspect
                        </button>
                        {lead.status === 'NEW' && (
                          <button
                            onClick={() => openActionModal(lead.id, 'acknowledge')}
                            className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
                          >
                            Acknowledge
                          </button>
                        )}
                        {['NEW', 'ASSIGNED', 'ACKNOWLEDGED'].includes(lead.status) && (
                          <button
                            onClick={() => openActionModal(lead.id, 'contact')}
                            className="rounded bg-cyan-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-cyan-700"
                          >
                            Contact
                          </button>
                        )}
                        {['CONTACTED', 'ACKNOWLEDGED'].includes(lead.status) && (
                          <button
                            onClick={() => openActionModal(lead.id, 'qualify')}
                            className="rounded bg-purple-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-purple-700"
                          >
                            Qualify
                          </button>
                        )}
                        {lead.status === 'QUALIFIED' && (
                          <button
                            onClick={() => openActionModal(lead.id, 'convert')}
                            className="rounded bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700"
                          >
                            Convert
                          </button>
                        )}
                        {!['CONVERTED', 'LOST', 'CLOSED', 'SPAM'].includes(lead.status) && (
                          <button
                            onClick={() => openActionModal(lead.id, 'follow-up')}
                            className="rounded border border-border-subtle bg-white px-2 py-1 text-[11px] text-muted hover:text-ink"
                          >
                            + Note
                          </button>
                        )}
                        {!['CONVERTED', 'LOST', 'CLOSED'].includes(lead.status) && (
                          <button
                            onClick={() => openActionModal(lead.id, 'lost')}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100"
                          >
                            Lost
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

      {/* Detail Modal */}
      {selectedLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-2xl rounded-card bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-border-subtle pb-4">
              <div>
                <h3 className="h3 text-ink">Lead Details: {selectedLead.customer.name}</h3>
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
                <p className="text-muted font-medium">Customer Information</p>
                <p className="font-semibold text-ink mt-1">{selectedLead.customer.name}</p>
                <p className="text-muted">{selectedLead.customer.email}</p>
                <p className="text-muted">{selectedLead.customer.phone}</p>
                <p className="text-muted mt-1">Occupation: {selectedLead.customer.occupation || 'Not specified'}</p>
                <p className="text-muted">KYC Status: <span className="font-medium text-ink">{selectedLead.customer.kycStatus}</span></p>
              </div>
              <div>
                <p className="text-muted font-medium">Target Property</p>
                <p className="font-semibold text-ink mt-1">{selectedLead.property.title}</p>
                <p className="text-muted">{selectedLead.property.locality}, {selectedLead.property.city}</p>
                <p className="text-muted">Rent: ₹{selectedLead.property.rentAmount?.toLocaleString()}/mo</p>
                <p className="text-muted mt-1">Source: <span className="font-medium text-ink">{selectedLead.lead.source}</span></p>
                {selectedLead.lead.promotionCode && <p className="text-muted">Promo Code: {selectedLead.lead.promotionCode}</p>}
              </div>
            </div>

            {selectedLead.lead.message && (
              <div className="py-3 border-b border-border-subtle">
                <p className="text-xs text-muted font-medium">Initial Message:</p>
                <p className="text-sm text-ink mt-1 bg-surface-subtle p-3 rounded-card">
                  &quot;{selectedLead.lead.message}&quot;
                </p>
              </div>
            )}

            {/* Follow-up Timeline */}
            <div className="py-4">
              <h4 className="text-xs font-semibold text-ink uppercase tracking-wider mb-3">Activity & Follow-up History</h4>
              {selectedLead.followUps.length === 0 ? (
                <p className="text-xs text-muted">No follow-up notes logged yet.</p>
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

      {/* Action Execution Modal */}
      {activeModal && modalLeadId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-card bg-white p-6 shadow-xl space-y-4">
            <h3 className="h3 text-ink capitalize">
              {activeModal === 'acknowledge' ? 'Acknowledge Lead' :
               activeModal === 'contact' ? 'Log Customer Contact' :
               activeModal === 'qualify' ? 'Qualify Customer Lead' :
               activeModal === 'follow-up' ? 'Add Follow-up Note' :
               activeModal === 'convert' ? 'Convert Lead to Application' :
               'Mark Lead as Lost'}
            </h3>

            {activeModal === 'acknowledge' && (
              <p className="text-xs text-muted">
                Confirm receipt of this lead. The customer will receive an in-app notice that you have acknowledged their enquiry.
              </p>
            )}

            {activeModal !== 'acknowledge' && (
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  {activeModal === 'lost' ? 'Reason for lost lead (Mandatory)' : 'Notes / Remarks'}
                </label>
                <textarea
                  rows={3}
                  value={modalText}
                  onChange={(e) => setModalText(e.target.value)}
                  placeholder={
                    activeModal === 'lost' ? 'e.g. Budget mismatch, already rented another flat...' :
                    activeModal === 'qualify' ? 'Tenant looking for immediate move-in, verified company employee...' :
                    'Enter details...'
                  }
                  className="w-full rounded-input border border-border-subtle p-2 text-xs focus:border-seal-deep focus:outline-none"
                />
              </div>
            )}

            {['contact', 'qualify', 'follow-up'].includes(activeModal) && (
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Next Follow-up Due Date (Optional)</label>
                <input
                  type="date"
                  value={modalDate}
                  onChange={(e) => setModalDate(e.target.value)}
                  className="w-full rounded-input border border-border-subtle p-2 text-xs focus:border-seal-deep focus:outline-none"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="rounded-btn border border-border-subtle px-4 py-2 text-xs font-medium text-ink hover:bg-surface-subtle"
              >
                Cancel
              </button>
              <button
                disabled={modalSubmitting || (activeModal === 'lost' && !modalText.trim())}
                onClick={submitAction}
                className="rounded-btn bg-seal-deep px-4 py-2 text-xs font-medium text-white hover:bg-seal-light disabled:opacity-50"
              >
                {modalSubmitting ? 'Submitting...' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
