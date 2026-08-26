import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Badge, Button, Card, EmptyState, StatusChip } from '@/components/ui';
import { inr, relative, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'My properties', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Listing = {
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

const TABS = [
  ['', 'All'],
  ['ACTIVE', 'Live'],
  ['PENDING_VERIFICATION', 'In review'],
  ['DRAFT', 'Drafts'],
  ['RENTED', 'Rented'],
];

export default async function MyPropertiesPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const result = await serverApi<{ data: Listing[]; meta: { total: number } }>('/properties/mine', {
    query: { status: searchParams.status, perPage: 50 },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">My properties</h1>
          <p className="mt-1 text-[15px] text-muted">
            Listing is free and unlimited. You are charged only when a tenancy starts, or if you buy a
            marketing package.
          </p>
        </div>
        <Button href="/dashboard/properties/new">Add a property</Button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map(([value, label]) => {
          const active = (searchParams.status ?? '') === value;
          return (
            <Link
              key={label}
              href={value ? `/dashboard/properties?status=${value}` : '/dashboard/properties'}
              className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${
                active ? 'border-seal bg-seal text-white' : 'border-line bg-white text-muted hover:border-seal'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {result.data.length ? (
        <div className="space-y-3">
          {result.data.map((listing) => (
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
                  <Button href={`/dashboard/properties/${listing.id}`} variant="secondary" size="sm">
                    {listing.status === 'DRAFT' ? 'Finish listing' : 'Manage'}
                  </Button>
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
    </div>
  );
}
