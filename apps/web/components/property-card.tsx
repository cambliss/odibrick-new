import Link from 'next/link';
import { inr, shortDate, titleCase } from '@/lib/format';
import { hasApprovedPropertyVerification } from '@/lib/explore-query';
import { VerificationSeals } from './verification-seal';

export type PropertyCardData = {
  id: number;
  slug: string;
  title: string;
  listingType: string;
  propertyType: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  areaSqft?: number | null;
  furnishing?: string;
  rent?: number | null;
  price?: number | null;
  deposit?: number | null;
  locality: string;
  city: string;
  availableFrom?: string | null;
  isProtected?: boolean;
  isFeatured?: boolean;
  listedByRole?: string;
  coverKey?: string | null;
  verifiedChecks?: string[];
};

export function PropertyCard({ property }: { property: PropertyCardData }) {
  const isSale = property.listingType === 'SALE';
  const amount = isSale ? property.price : property.rent;
  const hasVerified = hasApprovedPropertyVerification(property.verifiedChecks);

  return (
    <article className="group rounded-[16px] border border-brand-line bg-white p-3.5 font-brand-sans shadow-brand-sm transition-all duration-200 hover:border-brand-green/40 hover:shadow-brand">
      <Link
        href={`/${property.slug}`}
        className="block rounded-[12px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-brick"
      >
        <div className="relative aspect-[4/3] overflow-hidden rounded-[12px] bg-brand-sage-soft">
          {property.coverKey ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/storage/${property.coverKey}`}
              alt={`${property.title} in ${property.locality}, ${property.city}`}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
              <svg
                className="h-8 w-8 text-brand-green/40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6" />
              </svg>
              <span className="font-brand-label text-[11px] uppercase tracking-[0.16em] text-brand-green/60">
                {titleCase(property.propertyType)}
              </span>
            </div>
          )}

          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {hasVerified ? (
              <span className="inline-flex items-center gap-1 rounded-pill bg-white/95 px-2.5 py-1 font-brand-label text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-green shadow-sm">
                <svg
                  className="h-3.5 w-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
                Verified
              </span>
            ) : null}

            {property.isFeatured ? (
              <span className="inline-flex items-center rounded-pill bg-brand-ink/85 px-2.5 py-1 font-brand-label text-[11px] font-semibold uppercase tracking-[0.08em] text-white backdrop-blur-sm">
                Promoted
              </span>
            ) : null}
          </div>

          {property.isProtected ? (
            <span className="absolute right-3 top-3 rounded-pill bg-brand-green px-2.5 py-1 font-brand-label text-[11px] font-semibold uppercase tracking-[0.08em] text-white">
              Protected
            </span>
          ) : null}

          {property.listedByRole ? (
            <span className="absolute bottom-3 left-3 rounded-pill bg-brand-forest/75 px-2.5 py-1 font-brand-label text-[11px] font-medium tracking-[0.06em] text-white backdrop-blur-sm">
              {titleCase(property.listedByRole)} listed
            </span>
          ) : null}
        </div>

        <div className="pt-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-brand-serif text-[22px] font-semibold leading-[1.1] tracking-[-0.01em] text-brand-ink tabular">
              {inr(amount, true)}
              {!isSale ? (
                <span className="ml-1 font-brand-sans text-[13px] font-medium tracking-normal text-brand-stone">
                  / month
                </span>
              ) : null}
            </p>
            {property.furnishing ? (
              <span className="shrink-0 rounded-pill border border-brand-line bg-brand-ivory px-2.5 py-0.5 font-brand-label text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-stone">
                {titleCase(property.furnishing)}
              </span>
            ) : null}
          </div>

          <h3 className="mt-1.5 line-clamp-1 font-brand-sans text-[16px] font-semibold text-brand-ink">
            {property.title}
          </h3>

          <p className="mt-0.5 flex items-center gap-1.5 text-[14px] text-[#4f605a]">
            <svg
              className="h-4 w-4 shrink-0 text-brand-stone"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z" />
              <circle cx="12" cy="9" r="2.5" />
            </svg>
            <span className="line-clamp-1">
              {property.locality}, {property.city}
            </span>
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-brand-stone">
            {property.bedrooms ? (
              <span className="inline-flex items-center gap-1.5">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M3 18v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 15h18M6 10V7h5v3M13 10V7h5v3M3 18v2M21 18v2" />
                </svg>
                {property.bedrooms} BHK
              </span>
            ) : null}

            {property.bathrooms ? (
              <span className="inline-flex items-center gap-1.5">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4v-3zM6 12V6a2 2 0 0 1 4 0M7 19l-1 2M17 19l1 2" />
                </svg>
                {property.bathrooms} bath
              </span>
            ) : null}

            {property.areaSqft ? (
              <span className="inline-flex items-center gap-1.5">
                <svg
                  className="h-4 w-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="4" y="4" width="16" height="16" rx="2" />
                  <path d="M9 15l6-6M11 9h4v4" />
                </svg>
                {property.areaSqft.toLocaleString('en-IN')} sqft
              </span>
            ) : null}
          </div>

          {hasVerified || (!isSale && property.deposit) ? (
            <div className="mt-3 border-t border-brand-line pt-3">
              <VerificationSeals checks={property.verifiedChecks ?? []} compact />
              {!isSale && property.deposit ? (
                <p className="mt-1.5 text-[13px] text-[#53645d]">
                  Deposit {inr(property.deposit, true)}
                  {property.availableFrom ? ` · available ${shortDate(property.availableFrom)}` : ''}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </Link>
    </article>
  );
}
