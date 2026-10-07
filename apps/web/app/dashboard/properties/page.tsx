import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Button } from '@/components/ui';
import { Listing, PropertiesListClient } from './properties-list-client';

export const metadata: Metadata = { title: 'My properties', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const TABS = [
  ['', 'All'],
  ['ACTIVE', 'Live'],
  ['PENDING_VERIFICATION', 'In review'],
  ['DRAFT', 'Drafts'],
  ['RENTED', 'Rented'],
  ['ARCHIVED', 'Archived'],
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

      <PropertiesListClient initialListings={result.data || []} />
    </div>
  );
}

