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
  property: {
    id: number;
    title: string;
    city: string;
    locality: string;
    rentAmount: number | null;
    visibilityTier: string;
    isFeatured: boolean;
  };
  customer?: {
    id: number;
    name: string;
    email: string;
    phone: string;
    kycStatus: string;
  };
  host?: {
    id: number;
    name: string;
    email: string;
    phone: string;
  };
  enquiryId?: number;
  application?: {
    id: number;
    status: string;
  } | null;
  createdAt: string;
}

export function VisitsClient() {
  const [visits, setVisits] = useState<VisitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'REQUESTS' | 'COMPLETED' | 'ALL'>('UPCOMING');
  const [searchQuery, setSearchQuery] = useState('');

  // Action modals
  const [selectedVisit, setSelectedVisit] = useState<VisitItem | null>(null);
  const [modalType, setModalType] = useState<'CONFIRM' | 'RESCHEDULE' | 'CANCEL' | 'COMPLETE' | 'NO_SHOW' | 'CONVERT' | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionOutcome, setActionOutcome] = useState('INTERESTED');
  const [actionDate, setActionDate] = useState('');
  const [noShowParty, setNoShowParty] = useState<'CUSTOMER' | 'PROVIDER'>('CUSTOMER');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const fetchVisits = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      // Try provider visits first; fall back to customer visits
      let res = await fetch('/api/provider/visits');
      if (!res.ok && res.status === 403) {
        res = await fetch('/api/marketplace/my-visits');
      }
      if (!res.ok) {
        throw new Error('Failed to load property visits.');
      }
      const data = await res.json();
      setVisits(data.data || []);
    } catch (err: any) {
      setError(err.message || 'Error fetching visits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVisits();
  }, [fetchVisits]);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVisit || !modalType) return;
    setSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      let endpoint = '';
      let body: any = {};

      if (modalType === 'CONFIRM') {
        endpoint = `/api/provider/visits/${selectedVisit.id}/confirm`;
        body = { notes: actionNotes };
      } else if (modalType === 'RESCHEDULE') {
        endpoint = `/api/provider/visits/${selectedVisit.id}/reschedule`;
        body = { scheduledStart: actionDate, reason: actionReason, notes: actionNotes };
      } else if (modalType === 'CANCEL') {
        endpoint = `/api/provider/visits/${selectedVisit.id}/cancel`;
        body = { reason: actionReason };
      } else if (modalType === 'COMPLETE') {
        endpoint = `/api/provider/visits/${selectedVisit.id}/complete`;
        body = { outcome: actionOutcome, outcomeNotes: actionNotes };
      } else if (modalType === 'NO_SHOW') {
        endpoint = `/api/provider/visits/${selectedVisit.id}/no-show`;
        body = { noShowParty, reason: actionReason };
      } else if (modalType === 'CONVERT') {
        endpoint = `/api/provider/visits/${selectedVisit.id}/convert`;
        body = { message: actionNotes || 'Converted from property walkthrough.' };
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to complete visit action.');
      }

      setSuccessMsg('Visit status updated successfully.');
      setModalType(null);
      setSelectedVisit(null);
      setActionNotes('');
      setActionReason('');
      setActionDate('');
      await fetchVisits();
    } catch (err: any) {
      setError(err.message || 'Action failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredVisits = visits.filter((v) => {
    if (activeTab === 'UPCOMING') {
      return ['CONFIRMED', 'PROPOSED'].includes(v.status);
    }
    if (activeTab === 'REQUESTS') {
      return v.status === 'REQUESTED';
    }
    if (activeTab === 'COMPLETED') {
      return ['COMPLETED', 'NO_SHOW_CUSTOMER', 'NO_SHOW_PROVIDER'].includes(v.status);
    }
    return true;
  }).filter((v) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      v.property.title.toLowerCase().includes(q) ||
      (v.customer?.name && v.customer.name.toLowerCase().includes(q)) ||
      (v.host?.name && v.host.name.toLowerCase().includes(q)) ||
      v.status.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Property Visits & Walkthroughs</h1>
          <p className="text-sm text-muted">
            Manage scheduled site visits, coordinate timings with customers, track walkthrough outcomes, and advance leads to lease applications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchVisits}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-slate-50 transition-colors shadow-sm"
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

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-line pb-3">
        <div className="flex gap-2">
          {[
            { key: 'UPCOMING', label: 'Upcoming Visits' },
            { key: 'REQUESTS', label: 'Visit Requests' },
            { key: 'COMPLETED', label: 'Completed & History' },
            { key: 'ALL', label: 'All' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                activeTab === tab.key
                  ? 'bg-ink text-white shadow-sm'
                  : 'text-muted hover:bg-slate-100 hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Search by property, customer, or host..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full sm:w-64 rounded-lg border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-ink"
        />
      </div>

      {/* Visit List */}
      {loading ? (
        <div className="rounded-xl border border-line bg-white p-12 text-center text-sm text-muted">
          Loading property visits...
        </div>
      ) : filteredVisits.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-slate-50 p-12 text-center">
          <p className="text-sm font-medium text-ink">No property visits found</p>
          <p className="mt-1 text-xs text-muted">
            {activeTab === 'UPCOMING' ? 'You have no upcoming confirmed or proposed visits.' : 'No visits match the selected filter.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredVisits.map((v) => {
            const startDate = new Date(v.scheduledStart);
            const isConfirmed = v.status === 'CONFIRMED';
            const isRequested = v.status === 'REQUESTED';
            const isCompleted = v.status === 'COMPLETED';

            return (
              <div
                key={v.id}
                className="flex flex-col justify-between rounded-xl border border-line bg-white p-5 shadow-sm transition-all hover:border-slate-300"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-mono font-medium text-muted">#{v.id} · {v.publicId}</span>
                      <h3 className="text-base font-semibold text-ink line-clamp-1">{v.property.title}</h3>
                      <p className="text-xs text-muted">{v.property.locality}, {v.property.city} · {v.property.rentAmount ? `₹${v.property.rentAmount.toLocaleString('en-IN')}/mo` : ''}</p>
                    </div>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                        isConfirmed
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : isRequested
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : isCompleted
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {v.status}
                    </span>
                  </div>

                  {/* Scheduled Timeslot */}
                  <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-muted block text-[10px] uppercase font-semibold">Scheduled Date & Time</span>
                      <span className="font-semibold text-ink">
                        {startDate.toDateString()} at {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <span className="rounded bg-white px-2 py-0.5 text-[10px] font-medium border border-line text-muted">
                      {v.visitType === 'VIDEO_TOUR' ? '📹 Video Tour' : '🚶 In-Person Walkthrough'}
                    </span>
                  </div>

                  {/* Contact details */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {v.customer && (
                      <div className="rounded-md border border-line p-2">
                        <span className="text-[10px] uppercase text-muted font-semibold block">Visitor / Lead</span>
                        <p className="font-medium text-ink truncate">{v.customer.name}</p>
                        <p className="text-muted text-[11px] truncate">{v.customer.email}</p>
                      </div>
                    )}
                    {v.host && (
                      <div className="rounded-md border border-line p-2">
                        <span className="text-[10px] uppercase text-muted font-semibold block">Assigned Host</span>
                        <p className="font-medium text-ink truncate">{v.host.name}</p>
                        <p className="text-muted text-[11px] truncate">{v.host.email}</p>
                      </div>
                    )}
                  </div>

                  {/* Outcome or Notes */}
                  {v.outcome && (
                    <div className="rounded-md bg-emerald-50 border border-emerald-100 p-2 text-xs">
                      <span className="font-semibold text-emerald-900 block text-[11px]">Walkthrough Outcome: {v.outcome}</span>
                      {v.outcomeNotes && <p className="text-emerald-700 text-[11px] mt-0.5">{v.outcomeNotes}</p>}
                    </div>
                  )}

                  {v.application && (
                    <div className="rounded-md bg-indigo-50 border border-indigo-100 p-2 text-xs flex items-center justify-between">
                      <span className="text-indigo-900 font-medium">Application #{v.application.id} ({v.application.status})</span>
                      <Link href={`/dashboard/applications`} className="text-indigo-600 hover:underline font-semibold text-[11px]">
                        View Application →
                      </Link>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 pt-3 border-t border-line flex flex-wrap items-center justify-end gap-2">
                  {isRequested && (
                    <button
                      onClick={() => { setSelectedVisit(v); setModalType('CONFIRM'); }}
                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors shadow-sm"
                    >
                      Confirm Visit
                    </button>
                  )}

                  {isConfirmed && (
                    <>
                      <button
                        onClick={() => { setSelectedVisit(v); setModalType('COMPLETE'); }}
                        className="rounded-lg bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 transition-colors shadow-sm"
                      >
                        Complete & Outcome
                      </button>
                      <button
                        onClick={() => { setSelectedVisit(v); setModalType('NO_SHOW'); }}
                        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        No-Show
                      </button>
                    </>
                  )}

                  {isCompleted && !v.application && (
                    <button
                      onClick={() => { setSelectedVisit(v); setModalType('CONVERT'); }}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors shadow-sm"
                    >
                      Proceed to Application
                    </button>
                  )}

                  {['REQUESTED', 'PROPOSED', 'CONFIRMED'].includes(v.status) && (
                    <>
                      <button
                        onClick={() => { setSelectedVisit(v); setModalType('RESCHEDULE'); }}
                        className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => { setSelectedVisit(v); setModalType('CANCEL'); }}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100 transition-colors"
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Action Modal */}
      {modalType && selectedVisit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-xl">
            <h2 className="text-lg font-bold text-ink">
              {modalType === 'CONFIRM' && 'Confirm Property Visit'}
              {modalType === 'RESCHEDULE' && 'Reschedule Property Visit'}
              {modalType === 'CANCEL' && 'Cancel Property Visit'}
              {modalType === 'COMPLETE' && 'Complete Visit & Record Outcome'}
              {modalType === 'NO_SHOW' && 'Record Visit No-Show'}
              {modalType === 'CONVERT' && 'Convert Visit to Lease Application'}
            </h2>
            <p className="mt-1 text-xs text-muted">
              Visit #{selectedVisit.id} · {selectedVisit.property.title}
            </p>

            <form onSubmit={handleAction} className="mt-4 space-y-4">
              {modalType === 'RESCHEDULE' && (
                <div>
                  <label className="block text-xs font-medium text-ink">New Scheduled Date & Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={actionDate}
                    onChange={(e) => setActionDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                  />
                </div>
              )}

              {modalType === 'COMPLETE' && (
                <div>
                  <label className="block text-xs font-medium text-ink">Walkthrough Outcome *</label>
                  <select
                    value={actionOutcome}
                    onChange={(e) => setActionOutcome(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                  >
                    <option value="INTERESTED">Interested in Property</option>
                    <option value="VERY_INTERESTED">Very Interested (Ready to Apply)</option>
                    <option value="APPLICATION_EXPECTED">Application Expected Soon</option>
                    <option value="NEEDS_MORE_INFORMATION">Needs More Information</option>
                    <option value="NOT_INTERESTED">Not Interested</option>
                    <option value="PROPERTY_NOT_SUITABLE">Property Not Suitable</option>
                    <option value="OTHER">Other / Undecided</option>
                  </select>
                </div>
              )}

              {modalType === 'NO_SHOW' && (
                <div>
                  <label className="block text-xs font-medium text-ink">No-Show Party *</label>
                  <select
                    value={noShowParty}
                    onChange={(e) => setNoShowParty(e.target.value as any)}
                    className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                  >
                    <option value="CUSTOMER">Customer did not show up</option>
                    <option value="PROVIDER">Host/Provider was unavailable</option>
                  </select>
                </div>
              )}

              {['CANCEL', 'RESCHEDULE', 'NO_SHOW'].includes(modalType) && (
                <div>
                  <label className="block text-xs font-medium text-ink">Reason *</label>
                  <input
                    type="text"
                    required
                    placeholder="Enter explicit reason..."
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-ink">
                  {modalType === 'COMPLETE' ? 'Outcome Notes / Follow-up Details' : 'Additional Notes (Optional)'}
                </label>
                <textarea
                  rows={3}
                  placeholder="Add notes..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-line p-2 text-xs focus:ring-1 focus:ring-ink"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-ink px-4 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {submitting ? 'Saving...' : 'Submit Action'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
