'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { PropertyCard, type PropertyCardData } from '@/components/property-card';
import { Skeleton } from '@/components/ui';
import { api } from '@/lib/api';
import {
  buildExploreApiQuery,
  buildPropertiesHref,
  DEFAULT_EXPLORE_FILTERS,
  EXPLORE_PROPERTY_TYPES,
  EXPLORE_SORT_OPTIONS,
  type ExploreFilterState,
  type ExploreListingType,
  type ExploreSort,
} from '@/lib/explore-query';

type SearchResponse = {
  data: PropertyCardData[];
  meta: { total: number };
};

type ExploreSectionProps = {
  initialRentData: PropertyCardData[];
  initialRentTotal: number;
  initialFailed?: boolean;
};

export function ExploreSection({
  initialRentData,
  initialRentTotal,
  initialFailed = false,
}: ExploreSectionProps) {
  const [filters, setFilters] = useState<ExploreFilterState>(DEFAULT_EXPLORE_FILTERS);
  const [items, setItems] = useState<PropertyCardData[]>(initialRentData);
  const [total, setTotal] = useState<number>(initialRentTotal);
  const [loading, setLoading] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(initialFailed);
  const isFirstRender = useRef(true);
  const requestIdRef = useRef(0);

  const fetchListings = async (nextFilters: ExploreFilterState) => {
    const reqId = ++requestIdRef.current;
    setLoading(true);
    setFailed(false);
    try {
      const res = await api<SearchResponse>('/properties', {
        query: buildExploreApiQuery(nextFilters, 6),
      });
      if (reqId !== requestIdRef.current) return;
      setItems(res.data ?? []);
      setTotal(res.meta?.total ?? 0);
    } catch {
      if (reqId !== requestIdRef.current) return;
      setFailed(true);
    } finally {
      if (reqId === requestIdRef.current) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    void fetchListings(filters);
  }, [filters]);

  const setListingType = (listingType: ExploreListingType) => {
    setFilters((prev) => ({ ...prev, listingType }));
  };

  const resetFilters = () => {
    setFilters((prev) => ({
      ...DEFAULT_EXPLORE_FILTERS,
      listingType: prev.listingType,
    }));
  };

  const hasActiveFilters = Boolean(
    filters.propertyType || filters.verifiedOnly || filters.ownerOnly || filters.sort !== 'NEWEST',
  );

  const viewAllHref = buildPropertiesHref(filters);

  return (
    <section
      id="explore"
      aria-labelledby="explore-heading"
      className="bg-brand-ivory pb-20 pt-10 font-brand-sans text-brand-ink"
    >
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1400px] md:w-[calc(100%-48px)]">
        {/* Top bar */}
        <div className="mb-5 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="brand-label text-brand-stone">Explore</p>
            <h2
              id="explore-heading"
              className="mt-2 font-brand-serif text-[clamp(28px,2.6vw,36px)] font-semibold leading-[1.12] tracking-[-0.015em] text-brand-ink"
            >
              {filters.listingType === 'SALE'
                ? 'Homes for sale across India'
                : 'Homes to rent across India'}
            </h2>
            <p className="mt-1.5 text-[15px] text-brand-stone" aria-live="polite">
              {loading
                ? 'Updating listings…'
                : failed
                  ? 'Listings could not be loaded right now.'
                  : `${total} ${total === 1 ? 'property' : 'properties'} available`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Rent / Buy segmented control */}
            <div
              role="group"
              aria-label="Rent or buy"
              className="inline-flex rounded-pill border border-brand-line bg-white p-1"
            >
              <button
                type="button"
                aria-pressed={filters.listingType === 'RENT'}
                onClick={() => setListingType('RENT')}
                className={`h-9 rounded-pill px-[18px] text-[14px] font-semibold transition-colors ${
                  filters.listingType === 'RENT'
                    ? 'bg-brand-green text-white'
                    : 'text-brand-stone hover:text-brand-ink'
                }`}
              >
                Rent
              </button>
              <button
                type="button"
                aria-pressed={filters.listingType === 'SALE'}
                onClick={() => setListingType('SALE')}
                className={`h-9 rounded-pill px-[18px] text-[14px] font-semibold transition-colors ${
                  filters.listingType === 'SALE'
                    ? 'bg-brand-green text-white'
                    : 'text-brand-stone hover:text-brand-ink'
                }`}
              >
                Buy
              </button>
            </div>

            {/* Property type select */}
            <select
              aria-label="Property type"
              value={filters.propertyType}
              onChange={(e) => setFilters((prev) => ({ ...prev, propertyType: e.target.value }))}
              className="h-10 max-w-full appearance-none rounded-pill border border-brand-line bg-white bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%228%22%3E%3Cpath%20d%3D%22M1%201.5l5%205%205-5%22%20fill%3D%22none%22%20stroke%3D%22%23133D31%22%20stroke-width%3D%221.6%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_14px_center] bg-no-repeat pl-[15px] pr-[34px] text-[14px] font-medium text-brand-ink focus:border-brand-green focus:outline-none"
            >
              {EXPLORE_PROPERTY_TYPES.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Sort select */}
            <select
              aria-label="Sort properties"
              value={filters.sort}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, sort: e.target.value as ExploreSort }))
              }
              className="h-10 max-w-full appearance-none rounded-pill border border-brand-line bg-white bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%228%22%3E%3Cpath%20d%3D%22M1%201.5l5%205%205-5%22%20fill%3D%22none%22%20stroke%3D%22%23133D31%22%20stroke-width%3D%221.6%22%20stroke-linecap%3D%22round%22%2F%3E%3C%2Fsvg%3E')] bg-[position:right_14px_center] bg-no-repeat pl-[15px] pr-[34px] text-[14px] font-medium text-brand-ink focus:border-brand-green focus:outline-none"
            >
              {EXPLORE_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Active filter chips */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={filters.verifiedOnly}
            onClick={() => setFilters((prev) => ({ ...prev, verifiedOnly: !prev.verifiedOnly }))}
            className={`inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-[13px] text-[14px] font-medium transition-colors ${
              filters.verifiedOnly
                ? 'border-brand-green bg-brand-green text-white'
                : 'border-brand-line bg-white text-[#3d4f48] hover:border-brand-green'
            }`}
          >
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Verified only
          </button>

          <button
            type="button"
            aria-pressed={filters.ownerOnly}
            onClick={() => setFilters((prev) => ({ ...prev, ownerOnly: !prev.ownerOnly }))}
            className={`inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-[13px] text-[14px] font-medium transition-colors ${
              filters.ownerOnly
                ? 'border-brand-green bg-brand-green text-white'
                : 'border-brand-line bg-white text-[#3d4f48] hover:border-brand-green'
            }`}
          >
            Listed by owner
          </button>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={resetFilters}
              className="px-2 text-[14px] font-medium text-brand-green underline underline-offset-4 hover:text-brand-forest"
            >
              Clear all
            </button>
          ) : null}
        </div>

        {/* Grid / Loading / Error / Empty */}
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3" aria-label="Loading properties">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="rounded-[16px] border border-brand-line bg-white p-3.5 shadow-brand-sm"
              >
                <Skeleton className="aspect-[4/3] w-full rounded-[12px]" />
                <Skeleton className="mt-4 h-6 w-32" />
                <Skeleton className="mt-2 h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : failed ? (
          <div className="rounded-[16px] border border-brand-brick/30 bg-white p-10 text-center">
            <h3 className="font-brand-serif text-[22px] font-semibold text-brand-ink">
              We could not load listings right now
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[15px] text-[#4f605a]">
              The property service did not respond. Please try again in a moment, or open the full
              search page.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={() => void fetchListings(filters)}
                className="inline-flex h-10 items-center justify-center rounded-pill bg-brand-green px-5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-forest"
              >
                Try again
              </button>
              <Link
                href={viewAllHref}
                className="inline-flex h-10 items-center justify-center rounded-pill border border-brand-line bg-white px-5 text-[14px] font-semibold text-brand-green transition-colors hover:border-brand-green"
              >
                View all properties
              </Link>
            </div>
          </div>
        ) : items.length ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        ) : (
          <div className="rounded-[16px] border border-dashed border-brand-sage bg-white p-12 text-center text-[#4f605a]">
            <h3 className="font-brand-serif text-[22px] font-semibold text-brand-ink">
              No homes match these filters
            </h3>
            <p className="mx-auto mt-2 max-w-md text-[15px]">
              Try switching between Rent and Buy, choosing another property type, or clearing your
              filters.
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-pill bg-brand-green px-5 text-[14px] font-semibold text-white transition-colors hover:bg-brand-forest"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        )}

        {/* View all properties CTA */}
        <div className="mt-10 flex justify-center">
          <Link
            href={viewAllHref}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-pill border border-brand-green/25 bg-white px-6 text-[15px] font-semibold text-brand-green transition-colors hover:border-brand-green hover:bg-brand-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
          >
            View all properties
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </div>
    </section>
  );
}
