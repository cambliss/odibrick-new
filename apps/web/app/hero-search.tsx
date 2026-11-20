'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const CITIES = [
  'Hyderabad',
  'Bengaluru',
  'Pune',
  'Mumbai',
  'Delhi NCR',
  'Chennai',
  'Kolkata',
  'Ahmedabad',
  'Jaipur',
  'Bhubaneswar',
];

const RENT_BUDGETS = [
  { value: '15000', label: 'Up to ₹15,000' },
  { value: '25000', label: 'Up to ₹25,000' },
  { value: '40000', label: 'Up to ₹40,000' },
  { value: '70000', label: 'Up to ₹70,000' },
];

const SALE_BUDGETS = [
  { value: '6000000', label: 'Up to ₹60 L' },
  { value: '10000000', label: 'Up to ₹1 Cr' },
  { value: '15000000', label: 'Up to ₹1.5 Cr' },
  { value: '30000000', label: 'Up to ₹3 Cr' },
];

type Intent = 'RENT' | 'SALE' | 'LIST';

export function HeroSearch({ listHref = '/register?role=OWNER' }: { listHref?: string }) {
  const router = useRouter();
  const [intent, setIntent] = useState<Intent>('RENT');
  const [city, setCity] = useState('');
  const [q, setQ] = useState('');
  const [budget, setBudget] = useState('');
  const [bedrooms, setBedrooms] = useState<'' | '2' | '3'>('');
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const budgetOptions = intent === 'SALE' ? SALE_BUDGETS : RENT_BUDGETS;

  const handleIntentChange = (next: Intent) => {
    setIntent(next);
    setBudget('');
    setValidationError(null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (intent === 'LIST') return;

    const trimmedQ = q.trim();
    if (trimmedQ.length > 120) {
      setValidationError('Please keep the locality or landmark under 120 characters.');
      return;
    }

    setValidationError(null);
    const params = new URLSearchParams({ listingType: intent });
    if (city) params.set('city', city);
    if (trimmedQ) params.set('q', trimmedQ);
    if (budget) {
      params.set(intent === 'SALE' ? 'maxPrice' : 'maxRent', budget);
    }
    if (bedrooms) params.set('minBedrooms', bedrooms);
    if (verifiedOnly) params.set('verifiedOnly', 'true');
    if (ownerOnly) params.set('listedBy', 'OWNER');

    router.push(`/properties?${params.toString()}`);
  };

  return (
    <div className="max-w-[640px] rounded-[20px] bg-white px-2.5 pb-4 pt-2.5 font-brand-sans text-brand-ink shadow-[0_30px_70px_rgba(0,0,0,0.4)]">
      {/* Tabs */}
      <div
        role="tablist"
        aria-label="What would you like to do?"
        className="mb-3 flex flex-wrap gap-1 border-b border-brand-line px-1.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={intent === 'RENT'}
          onClick={() => handleIntentChange('RENT')}
          className={`-mb-px flex h-[46px] items-center gap-[6px] border-b-2 px-2.5 text-[14px] font-semibold transition-colors sm:px-3.5 sm:text-[15px] ${
            intent === 'RENT'
              ? 'border-brand-green text-brand-green'
              : 'border-transparent text-brand-stone hover:text-brand-ink'
          }`}
        >
          <svg
            className="h-[18px] w-[18px] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="8" cy="15" r="4" />
            <path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2" />
          </svg>
          Rent
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={intent === 'SALE'}
          onClick={() => handleIntentChange('SALE')}
          className={`-mb-px flex h-[46px] items-center gap-[6px] border-b-2 px-2.5 text-[14px] font-semibold transition-colors sm:px-3.5 sm:text-[15px] ${
            intent === 'SALE'
              ? 'border-brand-green text-brand-green'
              : 'border-transparent text-brand-stone hover:text-brand-ink'
          }`}
        >
          <svg
            className="h-[18px] w-[18px] shrink-0"
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
          Buy
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={intent === 'LIST'}
          onClick={() => handleIntentChange('LIST')}
          className={`-mb-px flex h-[46px] items-center gap-[6px] border-b-2 px-2.5 text-[14px] font-semibold transition-colors sm:px-3.5 sm:text-[15px] ${
            intent === 'LIST'
              ? 'border-brand-green text-brand-green'
              : 'border-transparent text-brand-stone hover:text-brand-ink'
          }`}
        >
          <svg
            className="h-[18px] w-[18px] shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          List my property
        </button>
      </div>

      {intent === 'LIST' ? (
        <div className="px-4 pb-1 pt-3">
          <h3 className="font-brand-serif text-[22px] font-semibold leading-snug text-brand-ink">
            List your property for free
          </h3>
          <p className="mb-4 mt-1.5 text-[15px] leading-relaxed text-[#53645d]">
            Unlimited listings for owners, agents, and builders with verified ownership checks and
            lawyer-reviewed agreements.
          </p>
          <Link
            href={listHref}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-brand-green px-[22px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
          >
            Start listing
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      ) : (
        <>
          <form onSubmit={submit} noValidate>
            <div className="grid grid-cols-1 items-center px-1 sm:grid-cols-2 md:grid-cols-[1fr_1.25fr_1fr_auto]">
              <div className="min-w-0 border-b border-brand-line px-3 py-2.5 md:border-b-0 md:border-r md:px-3.5 md:py-1.5">
                <label
                  htmlFor="hero-city"
                  className="mb-0.5 block font-brand-label text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-stone"
                >
                  City
                </label>
                <select
                  id="hero-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className="w-full min-w-0 appearance-none bg-transparent py-0.5 text-[15px] font-medium text-brand-ink focus:outline-none"
                >
                  <option value="">All India</option>
                  {CITIES.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              <div className="min-w-0 border-b border-brand-line px-3 py-2.5 md:border-b-0 md:border-r md:px-3.5 md:py-1.5">
                <label
                  htmlFor="hero-q"
                  className="mb-0.5 block font-brand-label text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-stone"
                >
                  Locality
                </label>
                <input
                  id="hero-q"
                  type="text"
                  maxLength={120}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    if (validationError) setValidationError(null);
                  }}
                  placeholder="Locality, project or landmark"
                  autoComplete="off"
                  className="w-full min-w-0 bg-transparent py-0.5 text-[15px] font-medium text-brand-ink placeholder:font-normal placeholder:text-brand-stone/80 focus:outline-none"
                />
              </div>

              <div className="min-w-0 border-b border-brand-line px-3 py-2.5 sm:col-span-2 md:col-span-1 md:border-b-0 md:px-3.5 md:py-1.5">
                <label
                  htmlFor="hero-budget"
                  className="mb-0.5 block font-brand-label text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-stone"
                >
                  Budget
                </label>
                <select
                  id="hero-budget"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  className="w-full min-w-0 appearance-none bg-transparent py-0.5 text-[15px] font-medium text-brand-ink focus:outline-none"
                >
                  <option value="">Any budget</option>
                  {budgetOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                aria-label="Search properties"
                className="mt-2.5 inline-flex h-[48px] w-full items-center justify-center gap-2 rounded-[14px] bg-brand-green font-semibold text-white transition-colors hover:bg-brand-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick sm:col-span-2 md:col-span-1 md:mt-0 md:h-[54px] md:w-[54px] md:rounded-full"
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M16.5 16.5L21 21" />
                </svg>
                <span className="md:sr-only">Search properties</span>
              </button>
            </div>

            {validationError ? (
              <p role="alert" className="mt-2 px-3.5 text-[13px] font-medium text-brand-brick">
                {validationError}
              </p>
            ) : null}
          </form>

          {/* Quick-filter chips */}
          <div className="flex flex-wrap gap-2 px-3.5 pt-3.5" aria-label="Quick filters">
            <button
              type="button"
              aria-pressed={bedrooms === '2'}
              onClick={() => setBedrooms((prev) => (prev === '2' ? '' : '2'))}
              className={`inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-[13px] text-[14px] font-medium transition-colors ${
                bedrooms === '2'
                  ? 'border-brand-green bg-brand-green text-white'
                  : 'border-brand-line bg-white text-[#3d4f48] hover:border-brand-green'
              }`}
            >
              2 BHK
            </button>

            <button
              type="button"
              aria-pressed={bedrooms === '3'}
              onClick={() => setBedrooms((prev) => (prev === '3' ? '' : '3'))}
              className={`inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-[13px] text-[14px] font-medium transition-colors ${
                bedrooms === '3'
                  ? 'border-brand-green bg-brand-green text-white'
                  : 'border-brand-line bg-white text-[#3d4f48] hover:border-brand-green'
              }`}
            >
              3 BHK
            </button>

            <button
              type="button"
              aria-pressed={verifiedOnly}
              onClick={() => setVerifiedOnly((prev) => !prev)}
              className={`inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-[13px] text-[14px] font-medium transition-colors ${
                verifiedOnly
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
              aria-pressed={ownerOnly}
              onClick={() => setOwnerOnly((prev) => !prev)}
              className={`inline-flex h-[34px] items-center gap-1.5 rounded-pill border px-[13px] text-[14px] font-medium transition-colors ${
                ownerOnly
                  ? 'border-brand-green bg-brand-green text-white'
                  : 'border-brand-line bg-white text-[#3d4f48] hover:border-brand-green'
              }`}
            >
              Listed by owner
            </button>
          </div>
        </>
      )}
    </div>
  );
}
