import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { PropertyCard, type PropertyCardData } from '@/components/property-card';
import { EmptyState, Button } from '@/components/ui';
import { SearchFilters } from './search-filters';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

type SearchResponse = {
  data: PropertyCardData[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}): Promise<Metadata> {
  const city = searchParams.city ?? 'India';
  const type = searchParams.listingType === 'SALE' ? 'for sale' : 'for rent';
  return {
    title: `Verified homes ${type} in ${city}`,
    description: `Browse verified ${type} listings in ${city} on Odibrick, with lawyer-reviewed agreements and recorded payments.`,
    alternates: { canonical: `/properties?city=${encodeURIComponent(city)}` },
  };
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  let results: SearchResponse = { data: [], meta: { page: 1, perPage: 24, total: 0, totalPages: 1 } };
  let failed = false;

  try {
    results = await serverApi<SearchResponse>('/properties', { query: { perPage: 24, ...searchParams } });
  } catch {
    failed = true;
  }

  const page = results.meta.page;
  const buildPageHref = (target: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParams).forEach(([key, value]) => {
      if (typeof value === 'string') params.set(key, value);
      else if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    });
    params.set('page', String(target));
    return `/properties?${params.toString()}`;
  };

  return (
    <>
      <SiteHeader />

      <main className="mx-auto max-w-[1180px] px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold">
              {searchParams.listingType === 'SALE' ? 'Homes for sale' : 'Homes for rent'}
              {searchParams.city ? ` in ${searchParams.city}` : ''}
            </h1>
            <p className="mt-1 text-sm text-muted">
              {failed
                ? 'Results are unavailable right now.'
                : `${results.meta.total} ${results.meta.total === 1 ? 'home' : 'homes'} match your filters`}
            </p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
          <SearchFilters />

          <div>
            {failed ? (
              <EmptyState
                title="We could not load listings"
                body="The search service did not respond. Refresh the page, and if it keeps happening our support team can look into it."
                action={<Button href="/properties">Try again</Button>}
              />
            ) : results.data.length ? (
              <>
                <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {results.data.map((property) => (
                    <PropertyCard key={property.id} property={property} />
                  ))}
                </div>

                {results.meta.totalPages > 1 ? (
                  <nav className="mt-10 flex items-center justify-center gap-2" aria-label="Pagination">
                    {page > 1 ? (
                      <Button href={buildPageHref(page - 1)} variant="secondary" size="sm">
                        Previous
                      </Button>
                    ) : null}
                    <span className="px-3 font-mono text-[12px] uppercase tracking-wider text-muted">
                      Page {page} of {results.meta.totalPages}
                    </span>
                    {page < results.meta.totalPages ? (
                      <Button href={buildPageHref(page + 1)} variant="secondary" size="sm">
                        Next
                      </Button>
                    ) : null}
                  </nav>
                ) : null}
              </>
            ) : (
              <EmptyState
                title="Nothing matches these filters yet"
                body="Try widening the rent range, removing a filter, or searching a neighbouring locality. New listings are published every day."
                action={<Button href="/properties">Clear all filters</Button>}
              />
            )}
          </div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
