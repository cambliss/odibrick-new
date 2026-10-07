'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button, Card, EmptyState, StatusChip } from '@/components/ui';
import { inr, relative, titleCase } from '@/lib/format';

export type Listing = {
  id: number;
  slug: string;
  title: string;
  status: string;
  listing_type: string;
  property_type: string;
  bedrooms?: number;
  rent_amount?: number;
  sale_price?: number;
  locality: string;
  city: string;
  view_count: number;
  enquiry_count: number;
  application_count: number;
  quality_score: number;
  verified_checks: number;
  is_featured: boolean;
  updated_at: string;
};

export function PropertiesListClient({ initialListings }: { initialListings: Listing[] }) {
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>(initialListings);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Unified removal modal state
  const [removeModal, setRemoveModal] = useState<{
    isOpen: boolean;
    property?: Listing;
    eligibility?: any;
    reason: string;
  }>({
    isOpen: false,
    reason: '',
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleOpenRemoveModal = async (prop: Listing) => {
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
        setListings((prev) => prev.filter((p) => p.id !== removeModal.property?.id));
      } else {
        showToast(`Property "${removeModal.property.title}" removed from marketplace and archived.`);
        setListings((prev) =>
          prev.map((p) => (p.id === removeModal.property?.id ? { ...p, status: 'ARCHIVED' } : p)),
        );
      }

      setRemoveModal({ isOpen: false, reason: '' });
      router.refresh();
    } catch (err) {
      showToast('Failed to complete property removal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 rounded-pill bg-ink px-4 py-2.5 text-xs text-white shadow-xl animate-fade-in flex items-center gap-2">
          <span>ℹ️</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {listings.length ? (
        <div className="space-y-3">
          {listings.map((listing) => (
            <Card key={listing.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusChip status={listing.status} />
                    {listing.is_featured ? <Badge tone="ochre">Promoted</Badge> : null}
                    {listing.verified_checks > 0 ? (
                      <Badge tone="seal">{listing.verified_checks} checks verified</Badge>
                    ) : null}
                  </div>

                  <h2 className="mt-2 font-display text-lg font-semibold">
                    {listing.status === 'ACTIVE' ? (
                      <Link href={`/${listing.slug}`} className="hover:underline">
                        {listing.title}
                      </Link>
                    ) : (
                      listing.title
                    )}
                  </h2>
                  <p className="text-[14px] text-muted">
                    {listing.locality}, {listing.city} · {titleCase(listing.property_type)} ·{' '}
                    {inr(listing.listing_type === 'SALE' ? listing.sale_price : listing.rent_amount, true)}
                    {listing.listing_type === 'RENT' ? '/month' : ''}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                    <span>{listing.view_count} views</span>
                    <span>{listing.enquiry_count} enquiries</span>
                    <span>{listing.application_count} applications</span>
                    <span>Updated {relative(listing.updated_at)}</span>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <div className="text-right">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Completeness</p>
                    <p className="font-display text-2xl font-semibold tabular">{listing.quality_score}%</p>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button href={`/dashboard/properties/${listing.id}/edit`} variant="secondary" size="sm">
                      Edit Property
                    </Button>
                    <Button href={`/dashboard/properties/${listing.id}`} size="sm">
                      {listing.status === 'DRAFT' ? 'Finish listing' : 'Manage & Media'}
                    </Button>

                    <button
                      type="button"
                      onClick={() => handleOpenRemoveModal(listing)}
                      disabled={submitting}
                      className="px-2.5 py-1.5 text-xs font-medium rounded border border-rose-200 bg-rose-50/60 text-rose-700 hover:bg-rose-100 transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>

              {listing.status === 'DRAFT' ? (
                <p className="mt-4 rounded-card border border-ochre/30 bg-ochre-soft/50 px-3 py-2 text-[13px]">
                  This draft is not visible to renters. Complete the required fields and submit it for
                  verification to publish.
                </p>
              ) : null}
              {listing.status === 'PENDING_VERIFICATION' ? (
                <p className="mt-4 rounded-card border border-line bg-paper px-3 py-2 text-[13px] text-muted">
                  Our verification team is reviewing this listing. We will let you know either way — usually
                  within two working days.
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="No properties here yet"
          body="Add your first property. It takes about ten minutes, and you can save a draft at any point and come back to it."
          action={<Button href="/dashboard/properties/new">Add a property</Button>}
        />
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
                  Removal Reason <span className="text-muted font-normal">(optional)</span>
                </label>
                <textarea
                  rows={2}
                  value={removeModal.reason}
                  onChange={(e) => setRemoveModal((m) => ({ ...m, reason: e.target.value }))}
                  placeholder="e.g. Taking off market, rented outside Odibrick, undergoing renovation..."
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
    </>
  );
}
