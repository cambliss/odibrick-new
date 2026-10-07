'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type Tab = 'overview' | 'listings' | 'promotions' | 'attribution' | 'packages';

export function MarketplaceClient() {
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [listingsMeta, setListingsMeta] = useState<any>(null);
  const [promotions, setPromotions] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [funnelData, setFunnelData] = useState<any>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  // Modals state
  const [moderateModal, setModerateModal] = useState<{
    isOpen: boolean;
    property?: any;
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTION' | 'SUSPEND' | 'RESTORE' | 'FORCE_PUBLISH';
    reason: string;
  }>({
    isOpen: false,
    decision: 'APPROVE',
    reason: '',
  });

  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean;
    property?: any;
    action: 'FEATURE' | 'BOOST' | 'PREMIUM' | 'REMOVE_PROMOTION';
    durationDays: number;
    reason: string;
  }>({
    isOpen: false,
    action: 'FEATURE',
    durationDays: 30,
    reason: '',
  });

  const [detailModal, setDetailModal] = useState<{
    isOpen: boolean;
    propertyDetail?: any;
  }>({
    isOpen: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [ovRes, pkgsRes, funRes] = await Promise.all([
        fetch('/api/admin/marketplace/overview'),
        fetch('/api/marketplace/packages'),
        fetch('/api/admin/marketplace/attribution'),
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (pkgsRes.ok) setPackages(await pkgsRes.json());
      if (funRes.ok) setFunnelData(await funRes.json());

      await loadListings();
      await loadPromotions();
      await loadLeads();
    } catch (err) {
      console.error('Failed to load marketplace data', err);
    } finally {
      setLoading(false);
    }
  };

  const loadListings = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter && statusFilter !== 'ALL') queryParams.append('status', statusFilter);
      if (tierFilter) queryParams.append('visibilityTier', tierFilter);
      if (cityFilter) queryParams.append('city', cityFilter);
      if (searchQuery) queryParams.append('q', searchQuery);
      queryParams.append('page', page.toString());
      queryParams.append('perPage', '25');

      const res = await fetch(`/api/admin/marketplace/listings?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setListings(data.items || []);
        setListingsMeta(data.meta || null);
      }
    } catch (err) {
      console.error('Failed to fetch listings', err);
    }
  };

  const loadPromotions = async () => {
    try {
      const res = await fetch('/api/admin/marketplace/promotions');
      if (res.ok) {
        setPromotions(await res.json());
      }
    } catch (err) {
      console.error('Failed to load promotions', err);
    }
  };

  const loadLeads = async () => {
    try {
      const res = await fetch('/api/admin/marketplace/leads');
      if (res.ok) {
        const data = await res.json();
        setLeads(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load leads', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadListings();
  }, [statusFilter, tierFilter, cityFilter, searchQuery, page]);

  const handleModerateSubmit = async () => {
    if (!moderateModal.property) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/marketplace/listings/${moderateModal.property.id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: moderateModal.decision,
          reason: moderateModal.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Moderation failed');

      showToast(`Listing #${moderateModal.property.id} updated: ${moderateModal.decision}`);
      setModerateModal({ isOpen: false, decision: 'APPROVE', reason: '' });
      await loadListings();
      const ovRes = await fetch('/api/admin/marketplace/overview');
      if (ovRes.ok) setOverview(await ovRes.json());
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOverrideSubmit = async () => {
    if (!overrideModal.property) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/marketplace/listings/${overrideModal.property.id}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: overrideModal.action,
          durationDays: overrideModal.durationDays,
          reason: overrideModal.reason,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Override failed');

      showToast(`Visibility override applied for #${overrideModal.property.id}`);
      setOverrideModal({ isOpen: false, action: 'FEATURE', durationDays: 30, reason: '' });
      await loadListings();
      await loadPromotions();
    } catch (err: any) {
      alert(err.message || 'Action failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleProcessExpiries = async () => {
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/marketplace/promotions/process-expiries', { method: 'POST' });
      const data = await res.json();
      showToast(`Processed ${data.processedCount} expired promotions.`);
      await loadListings();
      await loadPromotions();
    } catch (err) {
      alert('Failed to process expiries');
    } finally {
      setSubmitting(false);
    }
  };

  const openPropertyDetail = async (propId: number) => {
    try {
      const res = await fetch(`/api/admin/marketplace/listings/${propId}`);
      if (res.ok) {
        const detail = await res.json();
        setDetailModal({ isOpen: true, propertyDetail: detail });
      }
    } catch (err) {
      alert('Failed to load listing details');
    }
  };

  const formatInr = (val: number | null | undefined) => {
    if (val === null || val === undefined) return '—';
    return `₹${Number(val).toLocaleString('en-IN')}`;
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 rounded-md bg-seal-deep px-4 py-3 text-sm font-medium text-white shadow-xl transition-all">
          {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-seal bg-seal-soft/50 px-2 py-0.5 rounded border border-seal-soft">
              Phase 9 Operations
            </span>
            <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              Marketplace Operations & Monetization
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted">
            Central management over listing verification, quality controls, visibility tiers, monetization packages, and leads attribution.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/admin/commercial"
            className="rounded-button border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-surface-raised transition-colors"
          >
            Commercial Rules →
          </Link>
          <Link
            href="/dashboard/admin/finance"
            className="rounded-button border border-line bg-surface px-3 py-2 text-xs font-medium text-ink hover:bg-surface-raised transition-colors"
          >
            Finance Centre →
          </Link>
          <button
            onClick={loadData}
            disabled={loading}
            className="rounded-button bg-seal px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-seal-deep transition-colors disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-surface p-4 shadow-subtle">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Active Published</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {overview?.totals?.activeListings ?? 0}
            <span className="text-xs font-normal text-muted ml-2">/ {overview?.totals?.totalProperties ?? 0} total</span>
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>{overview?.totals?.totalPromotedActive ?? 0} with visibility boost</span>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-subtle">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Awaiting Verification</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">
            {overview?.totals?.pendingVerification ?? 0}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
            <span>{overview?.totals?.suspendedListings ?? 0} suspended</span>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-subtle">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Active Promotions</p>
          <p className="mt-1 text-2xl font-bold text-indigo-600">
            {overview?.promotions?.activePromotions ?? 0}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted">
            <span>{overview?.promotions?.activePremium ?? 0} Premium</span>
            <span>•</span>
            <span>{overview?.promotions?.activeFeatured ?? 0} Featured</span>
          </div>
        </div>

        <div className="rounded-card border border-line bg-surface p-4 shadow-subtle">
          <p className="text-xs font-medium text-muted uppercase tracking-wider">Marketplace Revenue</p>
          <p className="mt-1 text-2xl font-bold text-ink">
            {formatInr(overview?.revenue?.totalCollected ?? 0)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-muted">
            <span>Due: {formatInr(overview?.revenue?.totalDue ?? 0)}</span>
            <span className="text-emerald-600 font-medium">Conv: {overview?.attribution?.conversionRate ?? 0}%</span>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-line">
        <button
          onClick={() => setTab('overview')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'overview'
              ? 'border-seal text-seal-deep font-semibold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Marketplace Overview
        </button>
        <button
          onClick={() => setTab('listings')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'listings'
              ? 'border-seal text-seal-deep font-semibold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Listings & Moderation ({listingsMeta?.total ?? listings.length})
        </button>
        <button
          onClick={() => setTab('promotions')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'promotions'
              ? 'border-seal text-seal-deep font-semibold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Promotions & Visibility ({promotions.length})
        </button>
        <button
          onClick={() => setTab('packages')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'packages'
              ? 'border-seal text-seal-deep font-semibold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Monetization Packages ({packages.length})
        </button>
        <button
          onClick={() => setTab('attribution')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === 'attribution'
              ? 'border-seal text-seal-deep font-semibold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          Leads & Funnel Attribution
        </button>
      </div>

      {/* TAB 1: OVERVIEW & FUNNEL SUMMARY */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Conversion Funnel Box */}
            <div className="lg:col-span-2 rounded-card border border-line bg-surface p-5 shadow-subtle space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold text-ink">Marketplace Conversion Funnel</h3>
                <span className="text-xs text-muted">Views → Enquiries → Applications → Tenancies</span>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 text-center">
                <div className="rounded-card bg-surface-raised p-3 border border-line">
                  <p className="text-xs text-muted uppercase font-mono">Views</p>
                  <p className="text-xl font-bold text-ink mt-1">{funnelData?.funnel?.views ?? 0}</p>
                </div>
                <div className="rounded-card bg-surface-raised p-3 border border-line">
                  <p className="text-xs text-muted uppercase font-mono">Enquiries / Leads</p>
                  <p className="text-xl font-bold text-indigo-600 mt-1">{funnelData?.funnel?.enquiries ?? 0}</p>
                  <p className="text-[11px] text-muted mt-0.5">{funnelData?.conversionRates?.viewToEnquiry ?? 0}% from views</p>
                </div>
                <div className="rounded-card bg-surface-raised p-3 border border-line">
                  <p className="text-xs text-muted uppercase font-mono">Applications</p>
                  <p className="text-xl font-bold text-amber-600 mt-1">{funnelData?.funnel?.applications ?? 0}</p>
                  <p className="text-[11px] text-muted mt-0.5">{funnelData?.conversionRates?.enquiryToApp ?? 0}% from leads</p>
                </div>
                <div className="rounded-card bg-surface-raised p-3 border border-line">
                  <p className="text-xs text-muted uppercase font-mono">Tenancies</p>
                  <p className="text-xl font-bold text-emerald-600 mt-1">{funnelData?.funnel?.tenancies ?? 0}</p>
                  <p className="text-[11px] text-muted mt-0.5">{funnelData?.conversionRates?.appToTenancy ?? 0}% from apps</p>
                </div>
              </div>

              <div className="rounded-card bg-surface-subtle p-3 border border-line/60 flex items-center justify-between text-xs text-muted">
                <span>Total Commercial & Monetization Revenue Generated:</span>
                <span className="font-bold text-ink text-sm">{formatInr(funnelData?.commercialRevenueGenerated ?? 0)}</span>
              </div>
            </div>

            {/* Top Market Cities */}
            <div className="rounded-card border border-line bg-surface p-5 shadow-subtle space-y-4">
              <h3 className="font-display text-lg font-semibold text-ink">Top Active Cities</h3>
              <div className="space-y-2.5">
                {overview?.topCities?.map((c: any) => (
                  <div key={c.city} className="flex items-center justify-between text-sm py-1 border-b border-line/40 last:border-0">
                    <span className="font-medium text-ink">{c.city}</span>
                    <span className="text-muted">{c.active_count} active / {c.count} total</span>
                  </div>
                )) || <p className="text-sm text-muted">No city data available.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LISTINGS & MODERATION CONSOLE */}
      {tab === 'listings' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 shadow-subtle">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="text"
                placeholder="Search title, city, locality..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-input border border-line bg-white px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-seal w-64"
              />

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-input border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
              >
                <option value="ALL">All Statuses</option>
                <option value="ACTIVE">ACTIVE (Live)</option>
                <option value="PENDING_VERIFICATION">PENDING VERIFICATION</option>
                <option value="SUSPENDED">SUSPENDED</option>
                <option value="REJECTED">REJECTED</option>
                <option value="DRAFT">DRAFT</option>
                <option value="RENTED">RENTED</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </select>

              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="rounded-input border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
              >
                <option value="">All Visibility Tiers</option>
                <option value="PREMIUM">PREMIUM</option>
                <option value="FEATURED">FEATURED</option>
                <option value="PROMOTED">PROMOTED</option>
                <option value="STANDARD">STANDARD</option>
              </select>
            </div>

            <div className="text-xs text-muted">
              Showing {listings.length} properties
            </div>
          </div>

          {/* Listings Table */}
          <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-subtle">
            <table className="min-w-full divide-y divide-line text-left text-xs">
              <thead className="bg-surface-raised font-mono text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Property / Lister</th>
                  <th className="px-4 py-3">Location & Type</th>
                  <th className="px-4 py-3">Rent / Price</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Visibility Tier</th>
                  <th className="px-4 py-3">Quality & Checks</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {listings.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                      No listings found matching criteria.
                    </td>
                  </tr>
                ) : (
                  listings.map((prop) => (
                    <tr key={prop.id} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink max-w-xs truncate">{prop.title}</div>
                        <div className="text-[11px] text-muted mt-0.5">
                          #{prop.id} • Listed by {prop.lister?.name} ({prop.lister?.role})
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <div className="text-ink">{prop.locality}, {prop.city}</div>
                        <div className="text-[11px] text-muted">{prop.bedrooms ? `${prop.bedrooms} BHK ` : ''}{prop.propertyType}</div>
                      </td>

                      <td className="px-4 py-3 font-medium text-ink">
                        {prop.rentAmount ? formatInr(prop.rentAmount) + '/mo' : formatInr(prop.salePrice)}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            prop.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : prop.status === 'PENDING_VERIFICATION'
                              ? 'bg-amber-100 text-amber-800'
                              : prop.status === 'SUSPENDED'
                              ? 'bg-rose-100 text-rose-800'
                              : prop.status === 'REJECTED'
                              ? 'bg-rose-50 text-rose-700'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {prop.status}
                        </span>
                        {prop.rejectionReason && (
                          <p className="text-[10px] text-rose-600 mt-0.5 max-w-xs truncate" title={prop.rejectionReason}>
                            {prop.rejectionReason}
                          </p>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                            prop.visibilityTier === 'PREMIUM'
                              ? 'bg-amber-500 text-white font-bold'
                              : prop.visibilityTier === 'FEATURED'
                              ? 'bg-indigo-600 text-white'
                              : prop.visibilityTier === 'PROMOTED'
                              ? 'bg-sky-500 text-white'
                              : 'bg-surface-raised text-muted'
                          }`}
                        >
                          {prop.visibilityTier}
                        </span>
                        {prop.activePromotionCode && (
                          <div className="text-[10px] text-muted mt-0.5 font-mono">
                            {prop.activePromotionCode}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              prop.qualityStatus === 'COMPLETE'
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            Score: {prop.qualityScore}/100
                          </span>
                          {prop.duplicateFlagged && (
                            <span className="bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded text-[10px] font-bold">
                              DUPLICATE?
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-right space-x-1.5">
                        <Link
                          href={`/dashboard/properties/${prop.id}/edit`}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-line bg-surface hover:bg-surface-raised text-ink inline-block"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => openPropertyDetail(prop.id)}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-line bg-surface hover:bg-surface-raised text-ink"
                        >
                          Inspect
                        </button>
                        <button
                          onClick={() => setModerateModal({ isOpen: true, property: prop, decision: 'APPROVE', reason: '' })}
                          className="px-2 py-1 text-[11px] font-medium rounded bg-seal-soft text-seal-deep hover:bg-seal hover:text-white transition-colors"
                        >
                          Moderate
                        </button>
                        <button
                          onClick={() => setOverrideModal({ isOpen: true, property: prop, action: 'FEATURE', durationDays: 30, reason: '' })}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-line bg-surface hover:bg-surface-raised text-ink"
                        >
                          Boost / Tier
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: PROMOTIONS & VISIBILITY */}
      {tab === 'promotions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-card border border-line bg-surface p-4 shadow-subtle">
            <div>
              <h3 className="font-display text-base font-semibold text-ink">Active & Historical Listing Promotions</h3>
              <p className="text-xs text-muted mt-0.5">Traceable linkage across Package → Commercial Obligation → Payment → Invoice → Promotion</p>
            </div>
            <button
              onClick={handleProcessExpiries}
              disabled={submitting}
              className="rounded-button border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink hover:bg-surface-raised transition-colors"
            >
              Run Expiry Cleaner
            </button>
          </div>

          <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-subtle">
            <table className="min-w-full divide-y divide-line text-left text-xs">
              <thead className="bg-surface-raised font-mono text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Code / Package</th>
                  <th className="px-4 py-3">Listing Title</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3">Validity Window</th>
                  <th className="px-4 py-3">Payment / Invoice</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {promotions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                      No promotion orders found.
                    </td>
                  </tr>
                ) : (
                  promotions.map((p) => (
                    <tr key={p.id} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono font-semibold text-ink">{p.promotion_code}</div>
                        <div className="text-[11px] text-muted">{p.package_name || p.activation_source}</div>
                      </td>
                      <td className="px-4 py-3 font-medium text-ink max-w-xs truncate">
                        {p.property_title} (#{p.listing_id})
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ink">{p.buyer_name}</div>
                        <div className="text-[11px] text-muted">{p.buyer_email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700">
                          {p.visibility_tier}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[11px] text-muted">
                        <div>Starts: {new Date(p.starts_at).toLocaleDateString()}</div>
                        <div>Ends: {new Date(p.ends_at).toLocaleDateString()}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-ink font-medium">{formatInr(p.payment_amount)}</div>
                        <div className="text-[10px] text-muted">Pay: {p.payment_status || 'N/A'} {p.invoice_number ? `• ${p.invoice_number}` : ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            p.status === 'ACTIVE'
                              ? 'bg-emerald-100 text-emerald-800'
                              : p.status === 'EXPIRED'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {p.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: MONETIZATION PACKAGES */}
      {tab === 'packages' && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {packages.map((pkg) => (
              <div key={pkg.id} className="rounded-card border border-line bg-surface p-5 shadow-subtle flex flex-col justify-between space-y-4">
                <div>
                  <span className="text-[10px] font-mono uppercase bg-seal-soft text-seal-deep font-bold px-2 py-0.5 rounded">
                    {pkg.code}
                  </span>
                  <h4 className="font-display text-lg font-bold text-ink mt-2">{pkg.name}</h4>
                  <p className="text-xs text-muted mt-1">{pkg.tagline}</p>
                  <p className="mt-3 text-2xl font-bold text-ink">
                    {formatInr(pkg.price)}
                    <span className="text-xs font-normal text-muted"> + {pkg.taxRate}% GST</span>
                  </p>
                  <p className="text-xs font-medium text-emerald-700 mt-0.5">Total: {formatInr(pkg.totalWithTax)}</p>

                  <div className="mt-4 border-t border-line/60 pt-3 space-y-1.5">
                    <p className="text-xs font-semibold text-ink">Duration: {pkg.durationDays} days</p>
                    <ul className="text-xs text-muted space-y-1">
                      {pkg.features?.map((f: string, i: number) => (
                        <li key={i} className="flex items-center gap-1.5">
                          <span className="text-emerald-600">✓</span> {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-2 border-t border-line/40">
                  <span className="text-[11px] text-muted uppercase tracking-wider font-mono">
                    Audience: {pkg.audience}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: LEADS & ATTRIBUTION */}
      {tab === 'attribution' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-card border border-line bg-surface shadow-subtle">
            <table className="min-w-full divide-y divide-line text-left text-xs">
              <thead className="bg-surface-raised font-mono text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-4 py-3">Lead / Customer</th>
                  <th className="px-4 py-3">Property Listing</th>
                  <th className="px-4 py-3">Attribution Source</th>
                  <th className="px-4 py-3">Enquiry Status</th>
                  <th className="px-4 py-3">Application Link</th>
                  <th className="px-4 py-3">Tenancy Link</th>
                  <th className="px-4 py-3">Received At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {leads.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted">
                      No marketplace leads recorded.
                    </td>
                  </tr>
                ) : (
                  leads.map((l) => (
                    <tr key={l.id} className="hover:bg-surface-raised/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-ink">{l.customer?.name}</div>
                        <div className="text-[11px] text-muted">{l.customer?.email} • {l.customer?.phone || 'No phone'}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink max-w-xs truncate">{l.property?.title}</div>
                        <div className="text-[11px] text-muted">{l.property?.locality}, {l.property?.city}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            l.source === 'PREMIUM' || l.source === 'FEATURED' || l.source === 'PROMOTED'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-surface-raised text-muted'
                          }`}
                        >
                          {l.source}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{l.status}</span>
                      </td>
                      <td className="px-4 py-3">
                        {l.application ? (
                          <span className="text-emerald-600 font-medium">App #{l.application.id} ({l.application.status})</span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {l.tenancy ? (
                          <span className="text-indigo-600 font-medium">Tenancy #{l.tenancy.id} ({l.tenancy.stage})</span>
                        ) : (
                          <span className="text-muted">None</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {new Date(l.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: MODERATE LISTING */}
      {moderateModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-bold text-ink">
              Moderate Listing #{moderateModal.property?.id}
            </h3>
            <p className="text-xs text-muted">
              {moderateModal.property?.title} ({moderateModal.property?.city})
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Decision</label>
                <select
                  value={moderateModal.decision}
                  onChange={(e: any) => setModerateModal({ ...moderateModal, decision: e.target.value })}
                  className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                >
                  <option value="APPROVE">APPROVE (Verify & Publish)</option>
                  <option value="REJECT">REJECT (Decline listing)</option>
                  <option value="REQUEST_CORRECTION">REQUEST CORRECTION (Revert to Draft)</option>
                  <option value="SUSPEND">SUSPEND (Hide from marketplace)</option>
                  <option value="RESTORE">RESTORE (Unsuspend to Active)</option>
                  <option value="FORCE_PUBLISH">FORCE PUBLISH (Management Override)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Reason / Notes {['REJECT', 'SUSPEND', 'REQUEST_CORRECTION'].includes(moderateModal.decision) && <span className="text-rose-500">*</span>}
                </label>
                <textarea
                  rows={3}
                  value={moderateModal.reason}
                  onChange={(e) => setModerateModal({ ...moderateModal, reason: e.target.value })}
                  placeholder="Provide explicit operational rationale for this decision..."
                  className="w-full rounded-input border border-line bg-white p-2.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-seal"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                onClick={() => setModerateModal({ isOpen: false, decision: 'APPROVE', reason: '' })}
                disabled={submitting}
                className="rounded-button border border-line bg-surface px-4 py-2 text-xs font-medium text-ink hover:bg-surface-raised"
              >
                Cancel
              </button>
              <button
                onClick={handleModerateSubmit}
                disabled={submitting}
                className="rounded-button bg-seal px-4 py-2 text-xs font-medium text-white hover:bg-seal-deep disabled:opacity-50"
              >
                {submitting ? 'Applying...' : 'Apply Decision'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: VISIBILITY OVERRIDE */}
      {overrideModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-bold text-ink">
              Visibility Tier Override for #{overrideModal.property?.id}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">Override Action</label>
                <select
                  value={overrideModal.action}
                  onChange={(e: any) => setOverrideModal({ ...overrideModal, action: e.target.value })}
                  className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                >
                  <option value="FEATURE">FEATURE (Homepage & Locality Showcase)</option>
                  <option value="BOOST">BOOST (Search Priority Rank)</option>
                  <option value="PREMIUM">PREMIUM (Gold Showcase Tier)</option>
                  <option value="REMOVE_PROMOTION">REMOVE PROMOTION (Revert to Standard)</option>
                </select>
              </div>

              {overrideModal.action !== 'REMOVE_PROMOTION' && (
                <div>
                  <label className="block text-xs font-medium text-ink mb-1">Duration (Days)</label>
                  <input
                    type="number"
                    value={overrideModal.durationDays}
                    onChange={(e) => setOverrideModal({ ...overrideModal, durationDays: Number(e.target.value) })}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-ink mb-1">Management Reason</label>
                <input
                  type="text"
                  value={overrideModal.reason}
                  onChange={(e) => setOverrideModal({ ...overrideModal, reason: e.target.value })}
                  placeholder="e.g. Promotional partner placement"
                  className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                onClick={() => setOverrideModal({ isOpen: false, action: 'FEATURE', durationDays: 30, reason: '' })}
                disabled={submitting}
                className="rounded-button border border-line bg-surface px-4 py-2 text-xs font-medium text-ink hover:bg-surface-raised"
              >
                Cancel
              </button>
              <button
                onClick={handleOverrideSubmit}
                disabled={submitting}
                className="rounded-button bg-seal px-4 py-2 text-xs font-medium text-white hover:bg-seal-deep disabled:opacity-50"
              >
                {submitting ? 'Applying...' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: PROPERTY DETAIL INSPECTION */}
      {detailModal.isOpen && detailModal.propertyDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl rounded-card border border-line bg-surface p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-display text-lg font-bold text-ink">
                Property #{detailModal.propertyDetail.property.id} — {detailModal.propertyDetail.property.title}
              </h3>
              <button
                onClick={() => setDetailModal({ isOpen: false })}
                className="text-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted uppercase font-mono">Location</p>
                <p className="font-semibold text-ink mt-0.5">
                  {detailModal.propertyDetail.property.address_line1}, {detailModal.propertyDetail.property.locality}, {detailModal.propertyDetail.property.city} - {detailModal.propertyDetail.property.pincode}
                </p>
              </div>
              <div>
                <p className="text-muted uppercase font-mono">Financials</p>
                <p className="font-semibold text-ink mt-0.5">
                  Rent: {formatInr(detailModal.propertyDetail.property.rent_amount)} | Deposit: {formatInr(detailModal.propertyDetail.property.security_deposit)}
                </p>
              </div>
            </div>

            {/* Quality Breakdown */}
            <div className="rounded-card bg-surface-raised p-4 border border-line space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-ink">Quality Assessment: {detailModal.propertyDetail.quality.qualityStatus}</span>
                <span className="font-bold text-seal">{detailModal.propertyDetail.quality.score} / 100</span>
              </div>
              {detailModal.propertyDetail.quality.missingFields.length > 0 && (
                <div className="text-xs text-rose-600">
                  <p className="font-semibold">Missing items for optimal exposure:</p>
                  <ul className="list-disc list-inside mt-0.5 space-y-0.5">
                    {detailModal.propertyDetail.quality.missingFields.map((f: string, i: number) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Duplicate Check Alert */}
            {detailModal.propertyDetail.duplicateCheck?.isDuplicateSuspected && (
              <div className="rounded-card bg-rose-50 border border-rose-200 p-3 text-xs text-rose-800 space-y-1">
                <p className="font-bold">⚠️ Duplicate Listing Suspected</p>
                <p>Matches Property #{detailModal.propertyDetail.duplicateCheck.matchedPropertyId}: {detailModal.propertyDetail.duplicateCheck.matchedTitle}</p>
              </div>
            )}

            {/* Verification Checklist */}
            <div>
              <p className="text-xs font-semibold text-ink mb-1.5 uppercase font-mono">Verifications</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {detailModal.propertyDetail.verifications?.map((v: any) => (
                  <div key={v.check_type} className="flex items-center justify-between p-2 rounded bg-surface-raised border border-line/40">
                    <span className="font-medium text-ink">{v.check_type}</span>
                    <span className={`font-bold ${v.status === 'VERIFIED' ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {v.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-line">
              <button
                onClick={() => setDetailModal({ isOpen: false })}
                className="rounded-button bg-surface border border-line px-4 py-2 text-xs font-medium text-ink hover:bg-surface-raised"
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
