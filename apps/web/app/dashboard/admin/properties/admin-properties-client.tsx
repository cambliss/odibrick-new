'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, StatTile, StatusChip } from '@/components/ui';
import { inr, titleCase } from '@/lib/format';

type PropertyItem = {
  id: number;
  publicId: string;
  slug: string;
  title: string;
  status: string;
  listingType: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  carpetAreaSqft?: number;
  rentAmount: number | null;
  salePrice: number | null;
  securityDeposit: number | null;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  addressLine1?: string;
  isProtected: boolean;
  isFeatured: boolean;
  visibilityTier: string;
  featuredUntil?: string;
  promotedUntil?: string;
  viewCount: number;
  enquiryCount: number;
  imageCount: number;
  applicationCount: number;
  leadCount: number;
  qualityStatus: string;
  qualityScore: number;
  missingFields: string[];
  duplicateFlagged: boolean;
  duplicateOfPropertyId?: number;
  rejectionReason?: string;
  suspendedAt?: string;
  suspensionReason?: string;
  activePromotionCode?: string;
  activePromotionEndsAt?: string;
  lister: {
    id: number;
    name: string;
    email: string;
    phone?: string;
    role: string;
  };
};

const STATUS_TABS = [
  ['ALL', 'All Properties'],
  ['ACTIVE', 'Live Active'],
  ['PENDING_VERIFICATION', 'In Review'],
  ['DRAFT', 'Drafts'],
  ['PAUSED', 'Paused'],
  ['SUSPENDED', 'Suspended'],
  ['REJECTED', 'Rejected'],
  ['RENTED', 'Rented / Sold'],
  ['ARCHIVED', 'Archived'],
] as const;

const PROPERTY_TYPES = [
  ['', 'All Property Types'],
  ['APARTMENT', 'Apartment'],
  ['INDEPENDENT_HOUSE', 'Independent House'],
  ['VILLA', 'Villa'],
  ['STUDIO', 'Studio'],
  ['PENTHOUSE', 'Penthouse'],
  ['PLOT', 'Plot'],
  ['COMMERCIAL', 'Commercial'],
  ['PG', 'PG / Co-Living'],
] as const;

export function AdminPropertiesClient() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [listings, setListings] = useState<PropertyItem[]>([]);
  const [meta, setMeta] = useState<{ total: number; page: number; perPage: number } | null>(null);

  // Filters State
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [propertyTypeFilter, setPropertyTypeFilter] = useState<string>('');
  const [listingTypeFilter, setListingTypeFilter] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<string>('');
  const [cityFilter, setCityFilter] = useState<string>('');
  const [photoFilter, setPhotoFilter] = useState<string>('');
  const [verifiedOnly, setVerifiedOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);

  // Modals state
  const [moderateModal, setModerateModal] = useState<{
    isOpen: boolean;
    property?: PropertyItem;
    decision: 'APPROVE' | 'REJECT' | 'REQUEST_CORRECTION' | 'SUSPEND' | 'RESTORE' | 'FORCE_PUBLISH';
    reason: string;
  }>({
    isOpen: false,
    decision: 'APPROVE',
    reason: '',
  });

  const [overrideModal, setOverrideModal] = useState<{
    isOpen: boolean;
    property?: PropertyItem;
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
    eligibility?: any;
  }>({
    isOpen: false,
  });

  const [removeModal, setRemoveModal] = useState<{
    isOpen: boolean;
    property?: PropertyItem;
    eligibility?: any;
    reason: string;
  }>({
    isOpen: false,
    reason: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Synchronized floating horizontal scrollbar state and refs
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const floatingScrollRef = useRef<HTMLDivElement>(null);
  const isSyncingRef = useRef(false);

  const [showFloatingScrollbar, setShowFloatingScrollbar] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollMetrics, setScrollMetrics] = useState({
    scrollWidth: 0,
    clientWidth: 0,
    canScroll: false,
    scrollLeft: 0,
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const updateScrollMetrics = useCallback(() => {
    if (!tableScrollRef.current) return;
    const { scrollWidth, clientWidth, scrollLeft } = tableScrollRef.current;
    const maxScroll = Math.max(1, scrollWidth - clientWidth);
    const canScroll = scrollWidth > clientWidth + 10;
    const progress = Math.min(100, Math.max(0, Math.round((scrollLeft / maxScroll) * 100)));

    setScrollProgress(progress);
    setScrollMetrics({
      scrollWidth,
      clientWidth,
      canScroll,
      scrollLeft,
    });
  }, []);

  useEffect(() => {
    const checkVisibility = () => {
      if (!tableContainerRef.current || !tableScrollRef.current) return;
      const rect = tableContainerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight || document.documentElement.clientHeight;

      // Floating scrollbar appears when user is within the table and table bottom is below the viewport
      const isTableInView = rect.top < windowHeight - 140 && rect.bottom > windowHeight + 30;
      const { scrollWidth, clientWidth } = tableScrollRef.current;
      const hasOverflow = scrollWidth > clientWidth + 10;

      setShowFloatingScrollbar(isTableInView && hasOverflow);
      updateScrollMetrics();
    };

    window.addEventListener('scroll', checkVisibility, { passive: true });
    window.addEventListener('resize', checkVisibility, { passive: true });
    checkVisibility();

    return () => {
      window.removeEventListener('scroll', checkVisibility);
      window.removeEventListener('resize', checkVisibility);
    };
  }, [updateScrollMetrics, listings, loading]);

  const handleTableScroll = () => {
    if (isSyncingRef.current) return;
    if (!tableScrollRef.current) return;
    const currentScrollLeft = tableScrollRef.current.scrollLeft;

    if (floatingScrollRef.current && Math.abs(floatingScrollRef.current.scrollLeft - currentScrollLeft) > 1) {
      isSyncingRef.current = true;
      floatingScrollRef.current.scrollLeft = currentScrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
    updateScrollMetrics();
  };

  const handleFloatingScroll = () => {
    if (isSyncingRef.current) return;
    if (!floatingScrollRef.current || !tableScrollRef.current) return;
    const currentScrollLeft = floatingScrollRef.current.scrollLeft;

    if (Math.abs(tableScrollRef.current.scrollLeft - currentScrollLeft) > 1) {
      isSyncingRef.current = true;
      tableScrollRef.current.scrollLeft = currentScrollLeft;
      requestAnimationFrame(() => {
        isSyncingRef.current = false;
      });
    }
    updateScrollMetrics();
  };

  const scrollToFraction = (fraction: number) => {
    if (!tableScrollRef.current) return;
    const maxScroll = tableScrollRef.current.scrollWidth - tableScrollRef.current.clientWidth;
    tableScrollRef.current.scrollTo({
      left: maxScroll * fraction,
      behavior: 'smooth',
    });
  };

  const handleOpenRemoveModal = async (prop: PropertyItem) => {
    try {
      setSubmitting(true);
      const res = await fetch(`/api/properties/${prop.id}/removal-eligibility`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.message || 'Failed to check property removal status.');
        return;
      }
      const eligibility = await res.json();
      setRemoveModal({
        isOpen: true,
        property: prop,
        eligibility,
        reason: '',
      });
    } catch (err) {
      showToast('Network error while checking property removal status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRemoval = async () => {
    if (!removeModal.property) return;
    try {
      setSubmitting(true);
      const res = await fetch(`/api/properties/${removeModal.property.id}/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: removeModal.reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.message || 'Failed to remove property.');
        return;
      }

      if (data.action === 'DELETE') {
        showToast(`Property "${removeModal.property.title}" permanently deleted.`);
      } else {
        showToast(`Property "${removeModal.property.title}" removed from marketplace and archived.`);
      }

      setRemoveModal({ isOpen: false, reason: '' });
      if (detailModal.isOpen) setDetailModal({ isOpen: false });
      await loadData();
    } catch (err) {
      showToast('Failed to complete property removal.');
    } finally {
      setSubmitting(false);
    }
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const ovRes = await fetch('/api/admin/marketplace/overview');
      if (ovRes.ok) setOverview(await ovRes.json());
      await loadListings();
    } catch (err) {
      console.error('Failed to load admin property data', err);
    } finally {
      setLoading(false);
    }
  };

  const loadListings = async () => {
    try {
      const queryParams = new URLSearchParams();
      if (statusFilter && statusFilter !== 'ALL') queryParams.append('status', statusFilter);
      if (propertyTypeFilter) queryParams.append('propertyType', propertyTypeFilter);
      if (listingTypeFilter) queryParams.append('listingType', listingTypeFilter);
      if (tierFilter) queryParams.append('visibilityTier', tierFilter);
      if (cityFilter) queryParams.append('city', cityFilter);
      if (photoFilter) queryParams.append('photoFilter', photoFilter);
      if (verifiedOnly) queryParams.append('verifiedOnly', 'true');
      if (searchQuery.trim()) queryParams.append('q', searchQuery.trim());
      queryParams.append('page', page.toString());
      queryParams.append('perPage', '25');

      const res = await fetch(`/api/admin/marketplace/listings?${queryParams.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setListings(data.data || []);
        setMeta(data.meta || { total: 0, page: 1, perPage: 25 });
      }
    } catch (err) {
      console.error('Failed to load listings', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadListings();
  }, [statusFilter, propertyTypeFilter, listingTypeFilter, tierFilter, cityFilter, photoFilter, verifiedOnly, page]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadListings();
  };

  const handleModerateSubmit = async () => {
    if (!moderateModal.property) return;
    if (['REJECT', 'REQUEST_CORRECTION', 'SUSPEND'].includes(moderateModal.decision) && !moderateModal.reason.trim()) {
      alert('Please provide a reason for this moderation action.');
      return;
    }

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
      if (!res.ok) throw new Error(data.message || 'Moderation action failed');

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
    } catch (err: any) {
      alert(err.message || 'Action failed');
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

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 rounded-md bg-seal-deep px-4 py-3 text-sm font-medium text-white shadow-xl transition-all">
          ✓ {toastMessage}
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-seal bg-seal-soft/50 px-2 py-0.5 rounded border border-seal-soft">
              Management Governance
            </span>
            <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              Property Management
            </h1>
          </div>
          <p className="mt-1 text-sm text-muted">
            Review, manage and govern all properties listed on Odibrick across Owners, Agents, and Builders.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link href="/dashboard/properties/new">
            <Button variant="primary" size="sm">+ List New Property</Button>
          </Link>
          <Link href="/dashboard/admin/marketplace">
            <Button variant="secondary" size="sm">Marketplace Ads & Packages</Button>
          </Link>
          <button
            onClick={() => { setPage(1); loadData(); }}
            className="rounded-button border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Overview Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatTile label="Total Properties" value={overview?.totals?.totalProperties ?? (meta?.total || 0)} />
        <StatTile label="Live Active" value={overview?.totals?.activeListings ?? 0} />
        <StatTile label="Pending Verification" value={overview?.totals?.pendingVerification ?? 0} />
        <StatTile label="Drafts" value={overview?.totals?.draftListings ?? 0} />
        <StatTile label="Suspended" value={overview?.totals?.suspendedListings ?? 0} />
        <StatTile label="Promoted Active" value={overview?.totals?.totalPromotedActive ?? 0} />
      </div>

      {/* Status Pill Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-line pb-3">
        {STATUS_TABS.map(([val, label]) => {
          const active = statusFilter === val;
          return (
            <button
              key={val}
              type="button"
              onClick={() => {
                setStatusFilter(val);
                setPage(1);
              }}
              className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                active
                  ? 'border-seal bg-seal text-white font-semibold shadow-xs'
                  : 'border-line bg-white text-muted hover:border-seal hover:text-ink'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Filter and Search Bar */}
      <Card className="p-4 space-y-3 bg-surface border border-line">
        <form onSubmit={handleSearchSubmit} className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[240px]">
            <input
              type="text"
              placeholder="Search by title, locality, city, public ID, or lister name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-seal"
            />
          </div>

          <Button type="submit" size="sm" variant="secondary">
            Search
          </Button>

          {searchQuery && (
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setPage(1); }}
              className="text-xs text-muted hover:text-ink font-mono"
            >
              Clear
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-line/60">
          <select
            value={propertyTypeFilter}
            onChange={(e) => { setPropertyTypeFilter(e.target.value); setPage(1); }}
            className="rounded-input border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
          >
            {PROPERTY_TYPES.map(([val, lbl]) => (
              <option key={val} value={val}>{lbl}</option>
            ))}
          </select>

          <select
            value={listingTypeFilter}
            onChange={(e) => { setListingTypeFilter(e.target.value); setPage(1); }}
            className="rounded-input border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
          >
            <option value="">All Purposes (Rent & Sale)</option>
            <option value="RENT">Rent Only</option>
            <option value="SALE">Sale Only</option>
          </select>

          <select
            value={tierFilter}
            onChange={(e) => { setTierFilter(e.target.value); setPage(1); }}
            className="rounded-input border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
          >
            <option value="">All Visibility Tiers</option>
            <option value="STANDARD">Standard</option>
            <option value="PROMOTED">Promoted</option>
            <option value="FEATURED">Featured</option>
            <option value="PREMIUM">Premium</option>
          </select>

          <select
            value={photoFilter}
            onChange={(e) => { setPhotoFilter(e.target.value); setPage(1); }}
            className="rounded-input border border-line bg-white px-2.5 py-1.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
          >
            <option value="">All Photo Counts</option>
            <option value="DEFICIENT">Needs Photos (&lt; 4 photos)</option>
            <option value="COMPLETE">Photo Threshold Met (4+ photos)</option>
          </select>

          <label className="flex items-center gap-2 cursor-pointer text-xs text-ink font-medium ml-auto">
            <input
              type="checkbox"
              checked={verifiedOnly}
              onChange={(e) => { setVerifiedOnly(e.target.checked); setPage(1); }}
              className="h-3.5 w-3.5 rounded border-line text-seal focus:ring-seal"
            />
            <span>Verified Checks Only</span>
          </label>
        </div>
      </Card>

      {/* Property Inventory Table Container */}
      <div ref={tableContainerRef} className="rounded-card border border-line shadow-subtle p-0 overflow-hidden bg-white">
        {/* Quick Column Navigation Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50 border-b border-line text-xs">
          <div className="flex flex-wrap items-center gap-1.5 text-muted font-medium">
            <span className="text-[11px] font-mono uppercase tracking-wider text-muted mr-1">Quick Column Jump:</span>
            <button
              type="button"
              onClick={() => scrollToFraction(0)}
              className="px-2 py-0.5 rounded bg-white border border-line hover:border-seal hover:text-seal text-ink text-[11px] transition-colors shadow-2xs"
            >
              Property / ID
            </button>
            <button
              type="button"
              onClick={() => scrollToFraction(0.18)}
              className="px-2 py-0.5 rounded bg-white border border-line hover:border-seal hover:text-seal text-ink text-[11px] transition-colors shadow-2xs"
            >
              Status & Lister
            </button>
            <button
              type="button"
              onClick={() => scrollToFraction(0.42)}
              className="px-2 py-0.5 rounded bg-white border border-line hover:border-seal hover:text-seal text-ink text-[11px] transition-colors shadow-2xs"
            >
              Location & Specs
            </button>
            <button
              type="button"
              onClick={() => scrollToFraction(0.68)}
              className="px-2 py-0.5 rounded bg-white border border-line hover:border-seal hover:text-seal text-ink text-[11px] transition-colors shadow-2xs"
            >
              Pricing & Media
            </button>
            <button
              type="button"
              onClick={() => scrollToFraction(1)}
              className="px-2 py-0.5 rounded bg-white border border-line hover:border-seal hover:text-seal text-ink text-[11px] transition-colors shadow-2xs"
            >
              Management Actions ▶
            </button>
          </div>
          <div className="text-[11px] text-muted font-mono">
            Table Scroll: <span className="font-bold text-ink">{scrollProgress}%</span>
          </div>
        </div>

        {/* Dedicated Horizontal Overflow Container */}
        <div
          ref={tableScrollRef}
          onScroll={handleTableScroll}
          className="overflow-x-auto relative w-full focus:outline-none"
          tabIndex={0}
          aria-label="Properties inventory table"
        >
          <table className="w-full text-left text-xs border-collapse min-w-[1360px]">
            <thead>
              <tr className="bg-slate-50 border-b border-line text-ink font-semibold">
                {/* 1. Sticky Left Column: Property / ID */}
                <th className="p-3.5 w-[260px] min-w-[240px] max-w-[280px] sticky left-0 z-20 bg-slate-50 border-r border-line shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                  Property / ID
                </th>
                {/* 2. Status */}
                <th className="p-3.5 min-w-[130px]">Status</th>
                {/* 3. Provider / Lister */}
                <th className="p-3.5 min-w-[150px]">Provider / Lister</th>
                {/* 4. Location & Specs */}
                <th className="p-3.5 min-w-[170px]">Location & Specs</th>
                {/* 5. Pricing */}
                <th className="p-3.5 min-w-[130px]">Pricing</th>
                {/* 6. Photos */}
                <th className="p-3.5 min-w-[90px] text-center">Photos</th>
                {/* 7. Score */}
                <th className="p-3.5 min-w-[80px] text-center">Score</th>
                {/* 8. Tier */}
                <th className="p-3.5 min-w-[110px]">Tier</th>
                {/* 9. Sticky Right Column: Management Actions */}
                <th className="p-3.5 w-[330px] min-w-[310px] sticky right-0 z-20 bg-slate-50 border-l border-line text-right shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                  Management Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line bg-white">
              {loading ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted bg-white">
                    Loading properties inventory…
                  </td>
                </tr>
              ) : listings.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-muted bg-white">
                    No properties matched the selected filters.
                  </td>
                </tr>
              ) : (
                listings.map((prop) => (
                  <tr key={prop.id} className="group hover:bg-slate-50/80 transition-colors">
                    {/* 1. Sticky Left Column: Title & ID */}
                    <td className="p-3.5 w-[260px] min-w-[240px] max-w-[280px] sticky left-0 z-10 bg-white group-hover:bg-slate-50 border-r border-line shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)]">
                      <div className="font-semibold text-ink truncate" title={prop.title}>
                        {prop.title}
                      </div>
                      <div className="text-[11px] font-mono text-muted mt-0.5">
                        #{prop.id} • {prop.publicId}
                      </div>
                    </td>

                    {/* 2. Status */}
                    <td className="p-3.5">
                      <StatusChip status={prop.status} />
                      {prop.rejectionReason && (
                        <p className="text-[10px] text-rose-600 mt-0.5 max-w-[130px] truncate" title={prop.rejectionReason}>
                          {prop.rejectionReason}
                        </p>
                      )}
                    </td>

                    {/* 3. Provider / Lister */}
                    <td className="p-3.5">
                      <div className="font-semibold text-ink truncate max-w-[150px]" title={prop.lister?.name || 'Unassigned'}>
                        {prop.lister?.name || 'Unassigned'}
                      </div>
                      <div className="text-[10px] text-muted font-mono uppercase">
                        {prop.lister?.role || 'OWNER'}
                      </div>
                    </td>

                    {/* 4. Location & Specs */}
                    <td className="p-3.5">
                      <div className="text-ink font-medium">{prop.locality}, {prop.city}</div>
                      <div className="text-[11px] text-muted">
                        {prop.bedrooms ? `${prop.bedrooms} BHK · ` : ''}
                        {prop.carpetAreaSqft ? `${prop.carpetAreaSqft} sqft · ` : ''}
                        {titleCase(prop.propertyType)}
                      </div>
                    </td>

                    {/* 5. Pricing */}
                    <td className="p-3.5 font-bold text-ink whitespace-nowrap">
                      {prop.listingType === 'SALE' ? (
                        <span>{inr(prop.salePrice)}</span>
                      ) : (
                        <span>{inr(prop.rentAmount)}<span className="text-[10px] font-normal text-muted">/mo</span></span>
                      )}
                    </td>

                    {/* 6. Photos */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded font-mono text-[10px] font-semibold ${
                          prop.imageCount >= 4
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {prop.imageCount}/4
                      </span>
                    </td>

                    {/* 7. Completeness Score */}
                    <td className="p-3.5 text-center whitespace-nowrap">
                      <span className="font-mono text-xs font-bold text-seal">
                        {prop.qualityScore}%
                      </span>
                    </td>

                    {/* 8. Tier */}
                    <td className="p-3.5 whitespace-nowrap">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
                          prop.visibilityTier === 'PREMIUM'
                            ? 'bg-amber-500 text-white'
                            : prop.visibilityTier === 'FEATURED'
                            ? 'bg-indigo-600 text-white'
                            : prop.visibilityTier === 'PROMOTED'
                            ? 'bg-sky-500 text-white'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {prop.visibilityTier}
                      </span>
                    </td>

                    {/* 9. Sticky Right Column: Management Actions */}
                    <td className="p-3.5 w-[330px] min-w-[310px] sticky right-0 z-10 bg-white group-hover:bg-slate-50 border-l border-line text-right shadow-[-2px_0_4px_-1px_rgba(0,0,0,0.06)] space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => openPropertyDetail(prop.id)}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-line bg-white hover:bg-slate-50 text-ink shadow-2xs"
                      >
                        Inspect
                      </button>

                      <Link
                        href={`/dashboard/properties/${prop.id}/edit`}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-seal/30 bg-seal-soft text-seal-deep hover:bg-seal hover:text-white transition-colors inline-block shadow-2xs"
                      >
                        Edit Property
                      </Link>

                      <Link
                        href={`/dashboard/properties/${prop.id}`}
                        className="px-2 py-1 text-[11px] font-medium rounded border border-line bg-white hover:bg-slate-50 text-muted hover:text-ink inline-block shadow-2xs"
                      >
                        Media
                      </Link>

                      {prop.status === 'ACTIVE' && prop.slug ? (
                        <Link
                          href={`/${prop.slug}`}
                          target="_blank"
                          className="px-2 py-1 text-[11px] font-medium rounded border border-line bg-white hover:bg-slate-50 text-ink inline-block shadow-2xs"
                        >
                          Public ↗
                        </Link>
                      ) : null}

                      {prop.status !== 'ARCHIVED' && (
                        <button
                          onClick={() => setModerateModal({ isOpen: true, property: prop, decision: 'APPROVE', reason: '' })}
                          className="px-2 py-1 text-[11px] font-medium rounded bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors shadow-2xs"
                        >
                          Moderate
                        </button>
                      )}

                      {prop.status === 'ACTIVE' && (
                        <button
                          onClick={() => setOverrideModal({ isOpen: true, property: prop, action: 'FEATURE', durationDays: 30, reason: '' })}
                          className="px-2 py-1 text-[11px] font-medium rounded border border-line bg-white hover:bg-slate-50 text-ink shadow-2xs"
                        >
                          Boost
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenRemoveModal(prop)}
                        className="px-2 py-1 text-[11px] font-medium rounded bg-rose-50/70 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors shadow-2xs"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Full-width Pagination Footer outside scroll wrapper */}
        {meta && meta.total > 0 && (
          <div className="flex items-center justify-between border-t border-line bg-slate-50 px-4 py-3 text-xs text-muted">
            <div>
              Showing {Math.min((page - 1) * meta.perPage + 1, meta.total)} to{' '}
              {Math.min(page * meta.perPage, meta.total)} of {meta.total} properties
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded border border-line bg-white px-3 py-1 text-xs font-medium text-ink disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                Previous
              </button>
              <span className="font-mono">Page {page} of {Math.ceil(meta.total / meta.perPage) || 1}</span>
              <button
                disabled={page * meta.perPage >= meta.total}
                onClick={() => setPage((p) => p + 1)}
                className="rounded border border-line bg-white px-3 py-1 text-xs font-medium text-ink disabled:opacity-50 hover:bg-slate-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SYNCHRONIZED FLOATING HORIZONTAL SCROLLBAR */}
      {showFloatingScrollbar && (
        <div
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2.5rem)] max-w-4xl bg-ink/90 text-white backdrop-blur-md rounded-2xl shadow-2xl p-3 border border-white/15 animate-fade-in transition-all duration-200"
          role="region"
          aria-label="Synchronized floating horizontal scrollbar"
        >
          <div className="flex items-center justify-between gap-3 text-xs mb-2">
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="font-semibold text-white tracking-wide text-[11px] uppercase font-mono">
                Horizontal Table Navigator
              </span>
            </div>

            {/* Quick Column Jump Buttons */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px]">
              <button
                type="button"
                onClick={() => scrollToFraction(0)}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/90 font-medium transition-colors"
              >
                Property
              </button>
              <button
                type="button"
                onClick={() => scrollToFraction(0.18)}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/90 font-medium transition-colors"
              >
                Status/Lister
              </button>
              <button
                type="button"
                onClick={() => scrollToFraction(0.42)}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/90 font-medium transition-colors"
              >
                Specs
              </button>
              <button
                type="button"
                onClick={() => scrollToFraction(0.68)}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/90 font-medium transition-colors"
              >
                Pricing
              </button>
              <button
                type="button"
                onClick={() => scrollToFraction(1)}
                className="px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white/90 font-medium transition-colors"
              >
                Actions ▶
              </button>
            </div>

            <div className="font-mono text-[11px] text-white/80">
              {scrollProgress}%
            </div>
          </div>

          {/* Synchronized Floating Scroll Rail */}
          <div
            ref={floatingScrollRef}
            onScroll={handleFloatingScroll}
            className="overflow-x-auto w-full h-3 bg-white/15 hover:bg-white/25 transition-colors rounded-full cursor-pointer focus:outline-none"
            tabIndex={0}
            aria-label="Horizontally scroll property table"
          >
            <div style={{ width: scrollMetrics.scrollWidth || 1360, height: 1 }} />
          </div>
        </div>
      )}

      {/* INSPECT DETAIL MODAL */}
      {detailModal.isOpen && detailModal.propertyDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-card border border-line bg-white p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-ink">
                  Property #{detailModal.propertyDetail.id}: {detailModal.propertyDetail.title}
                </h3>
                <p className="text-xs text-muted font-mono">{detailModal.propertyDetail.publicId}</p>
              </div>
              <button
                onClick={() => setDetailModal({ isOpen: false })}
                className="text-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="p-3 bg-surface-raised rounded border border-line">
                <span className="font-semibold text-muted uppercase font-mono text-[10px]">Location & Address</span>
                <p className="font-medium text-ink mt-1">{detailModal.propertyDetail.addressLine1 || '—'}</p>
                <p className="text-muted">{detailModal.propertyDetail.locality}, {detailModal.propertyDetail.city} {detailModal.propertyDetail.pincode}</p>
              </div>
              <div className="p-3 bg-surface-raised rounded border border-line">
                <span className="font-semibold text-muted uppercase font-mono text-[10px]">Lister / Owner Contact</span>
                <p className="font-medium text-ink mt-1">{detailModal.propertyDetail.lister?.name} ({detailModal.propertyDetail.lister?.role})</p>
                <p className="text-muted">{detailModal.propertyDetail.lister?.email} · {detailModal.propertyDetail.lister?.phone || 'No phone'}</p>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 bg-slate-50 rounded border border-line">
                <p className="text-[10px] text-muted uppercase font-mono">Type</p>
                <p className="font-bold text-ink mt-0.5">{titleCase(detailModal.propertyDetail.propertyType)}</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-line">
                <p className="text-[10px] text-muted uppercase font-mono">Pricing</p>
                <p className="font-bold text-ink mt-0.5">{inr(detailModal.propertyDetail.rentAmount || detailModal.propertyDetail.salePrice)}</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-line">
                <p className="text-[10px] text-muted uppercase font-mono">Completeness</p>
                <p className="font-bold text-seal mt-0.5">{detailModal.propertyDetail.qualityScore}%</p>
              </div>
              <div className="p-2.5 bg-slate-50 rounded border border-line">
                <p className="text-[10px] text-muted uppercase font-mono">Photos</p>
                <p className="font-bold text-ink mt-0.5">{detailModal.propertyDetail.imageCount} attached</p>
              </div>
            </div>

            {detailModal.propertyDetail.description && (
              <div className="p-3 bg-slate-50 rounded border border-line text-xs">
                <span className="font-semibold text-muted uppercase font-mono text-[10px]">Description</span>
                <p className="mt-1 leading-relaxed text-ink/90">{detailModal.propertyDetail.description}</p>
              </div>
            )}

            <div className="flex flex-wrap justify-between items-center gap-2 pt-2 border-t border-line">
              <button
                onClick={() => handleOpenRemoveModal(detailModal.propertyDetail)}
                className="px-3 py-1.5 text-xs font-medium rounded bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors"
              >
                Remove Property
              </button>

              <div className="flex gap-2">
                <Link
                  href={`/dashboard/properties/${detailModal.propertyDetail.id}/edit`}
                  className="px-3 py-1.5 text-xs font-semibold rounded bg-seal text-white hover:bg-seal-deep transition-colors"
                >
                  Edit Property Details →
                </Link>
                <button
                  onClick={() => setDetailModal({ isOpen: false })}
                  className="px-3 py-1.5 text-xs font-medium rounded border border-line bg-white hover:bg-slate-50 text-ink"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODERATION MODAL */}
      {moderateModal.isOpen && moderateModal.property && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-card border border-line bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-bold text-ink">
              Moderate Listing #{moderateModal.property.id}
            </h3>
            <p className="text-xs text-muted">
              {moderateModal.property.title} · Currently {moderateModal.property.status}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Moderation Decision
                </label>
                <select
                  value={moderateModal.decision}
                  onChange={(e: any) => setModerateModal((m) => ({ ...m, decision: e.target.value }))}
                  className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                >
                  <option value="APPROVE">Approve & Publish (ACTIVE)</option>
                  <option value="FORCE_PUBLISH">Force Publish (Override Verification)</option>
                  <option value="REQUEST_CORRECTION">Request Correction (Feedback)</option>
                  <option value="REJECT">Reject Listing</option>
                  <option value="SUSPEND">Suspend Listing</option>
                  <option value="RESTORE">Restore to Active</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Reason / Reviewer Notes
                </label>
                <textarea
                  rows={3}
                  value={moderateModal.reason}
                  onChange={(e) => setModerateModal((m) => ({ ...m, reason: e.target.value }))}
                  placeholder="Explain why this decision is made (required for rejection/suspension)..."
                  className="w-full rounded-input border border-line bg-white p-2.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setModerateModal({ isOpen: false, decision: 'APPROVE', reason: '' })}
                className="px-3 py-1.5 text-xs font-medium rounded border border-line bg-white text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleModerateSubmit}
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-seal text-white hover:bg-seal-deep shadow-sm transition-colors"
              >
                {submitting ? 'Applying…' : 'Confirm Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PROMOTION / OVERRIDE MODAL */}
      {overrideModal.isOpen && overrideModal.property && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-card border border-line bg-white p-6 shadow-xl space-y-4">
            <h3 className="font-display text-lg font-bold text-ink">
              Promotion & Visibility Override
            </h3>
            <p className="text-xs text-muted">
              #{overrideModal.property.id}: {overrideModal.property.title}
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Override Action
                </label>
                <select
                  value={overrideModal.action}
                  onChange={(e: any) => setOverrideModal((m) => ({ ...m, action: e.target.value }))}
                  className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                >
                  <option value="FEATURE">Feature Listing (FEATURED Tier)</option>
                  <option value="BOOST">Boost Listing (PROMOTED Tier)</option>
                  <option value="PREMIUM">Premium Sponsorship (PREMIUM Tier)</option>
                  <option value="REMOVE_PROMOTION">Remove / Revert to Standard</option>
                </select>
              </div>

              {overrideModal.action !== 'REMOVE_PROMOTION' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Duration (Days)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={overrideModal.durationDays}
                    onChange={(e) => setOverrideModal((m) => ({ ...m, durationDays: Number(e.target.value) }))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Management Justification
                </label>
                <input
                  type="text"
                  value={overrideModal.reason}
                  onChange={(e) => setOverrideModal((m) => ({ ...m, reason: e.target.value }))}
                  placeholder="e.g. Partner builder campaign sponsorship"
                  className="w-full rounded-input border border-line bg-white px-3 py-2 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setOverrideModal({ isOpen: false, action: 'FEATURE', durationDays: 30, reason: '' })}
                className="px-3 py-1.5 text-xs font-medium rounded border border-line bg-white text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOverrideSubmit}
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-semibold rounded bg-seal text-white hover:bg-seal-deep shadow-sm transition-colors"
              >
                {submitting ? 'Applying…' : 'Apply Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* UNIFIED REMOVE PROPERTY CONFIRMATION MODAL */}
      {removeModal.isOpen && removeModal.property && removeModal.eligibility && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-card border border-line bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <span className="text-xl">
                  {removeModal.eligibility.action === 'DELETE' ? '🗑️' : '📦'}
                </span>
                <h3 className="font-display text-lg font-bold text-ink">
                  Remove Property
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRemoveModal({ isOpen: false, reason: '' })}
                className="text-muted hover:text-ink text-sm p-1"
              >
                ✕
              </button>
            </div>

            {/* Property Summary */}
            <div className="p-3 bg-slate-50 rounded-card border border-line text-xs">
              <p className="font-semibold text-ink text-sm">{removeModal.property.title}</p>
              <p className="text-muted font-mono text-[11px] mt-0.5">
                ID: #{removeModal.property.id} · {removeModal.property.locality}, {removeModal.property.city} · Status: {removeModal.property.status}
              </p>
            </div>

            {/* Authoritative Backend Action Banner */}
            <div
              className={`p-3.5 rounded-card border text-xs space-y-2 ${
                removeModal.eligibility.action === 'DELETE'
                  ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold uppercase tracking-wider ${
                    removeModal.eligibility.action === 'DELETE'
                      ? 'bg-rose-600 text-white'
                      : 'bg-amber-600 text-white'
                  }`}
                >
                  Action: {removeModal.eligibility.actionLabel}
                </span>
              </div>
              <p className="leading-relaxed font-medium">
                {removeModal.eligibility.explanation}
              </p>

              {/* Protected Records List */}
              {removeModal.eligibility.blockers && removeModal.eligibility.blockers.length > 0 && (
                <div className="pt-2 border-t border-amber-200/80">
                  <p className="font-semibold text-[11px] uppercase tracking-wider text-amber-800 mb-1">
                    Protected Platform Records:
                  </p>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-900/90">
                    {removeModal.eligibility.dependencies?.enquiries > 0 && (
                      <li>{removeModal.eligibility.dependencies.enquiries} customer enquiry/enquiries</li>
                    )}
                    {removeModal.eligibility.dependencies?.visits > 0 && (
                      <li>{removeModal.eligibility.dependencies.visits} scheduled visit(s)/viewing(s)</li>
                    )}
                    {removeModal.eligibility.dependencies?.applications > 0 && (
                      <li>{removeModal.eligibility.dependencies.applications} rental application(s)</li>
                    )}
                    {removeModal.eligibility.dependencies?.tenancies > 0 && (
                      <li>{removeModal.eligibility.dependencies.tenancies} tenancy record(s)</li>
                    )}
                    {removeModal.eligibility.dependencies?.agreements > 0 && (
                      <li>{removeModal.eligibility.dependencies.agreements} executed agreement(s)</li>
                    )}
                    {removeModal.eligibility.dependencies?.payments > 0 && (
                      <li>{removeModal.eligibility.dependencies.payments} payment transaction(s)</li>
                    )}
                    {removeModal.eligibility.dependencies?.disputes > 0 && (
                      <li>{removeModal.eligibility.dependencies.disputes} dispute case(s)</li>
                    )}
                    {removeModal.eligibility.dependencies?.maintenance > 0 && (
                      <li>{removeModal.eligibility.dependencies.maintenance} maintenance request(s)</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* Optional/Mandatory Reason Input */}
            {removeModal.eligibility.action === 'ARCHIVE' && (
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                  Management Removal Reason <span className="text-muted font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={removeModal.reason}
                  onChange={(e) => setRemoveModal((m) => ({ ...m, reason: e.target.value }))}
                  placeholder="e.g. Owner requested deactivation, compliance review, listing replaced..."
                  className="w-full rounded-input border border-line bg-white p-2.5 text-xs text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setRemoveModal({ isOpen: false, reason: '' })}
                className="px-3.5 py-1.5 text-xs font-medium rounded border border-line bg-white text-muted hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoval}
                disabled={submitting}
                className={`px-4 py-1.5 text-xs font-semibold rounded shadow-sm transition-colors ${
                  removeModal.eligibility.action === 'DELETE'
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-seal text-white hover:bg-seal-deep'
                }`}
              >
                {submitting ? 'Processing…' : removeModal.eligibility.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


