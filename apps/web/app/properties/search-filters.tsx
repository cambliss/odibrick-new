'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useState } from 'react';

const PROPERTY_TYPES = [
  ['APARTMENT', 'Apartment'],
  ['INDEPENDENT_HOUSE', 'Independent house'],
  ['VILLA', 'Villa'],
  ['STUDIO', 'Studio'],
  ['PENTHOUSE', 'Penthouse'],
];

const AMENITIES = [
  ['LIFT', 'Lift'],
  ['POWER_BACKUP', 'Power backup'],
  ['SECURITY', '24x7 security'],
  ['GATED', 'Gated community'],
  ['GYM', 'Gym'],
  ['PARK', 'Park'],
  ['AC', 'Air conditioning'],
  ['PIPED_GAS', 'Piped gas'],
];

export function SearchFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);

  const update = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === '') next.delete(key);
      else next.set(key, value);
      next.delete('page');
      router.push(`/properties?${next.toString()}`);
    },
    [params, router],
  );

  const toggleMulti = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      const current = next.getAll(key);
      next.delete(key);
      const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      updated.forEach((v) => next.append(key, v));
      next.delete('page');
      router.push(`/properties?${next.toString()}`);
    },
    [params, router],
  );

  const has = (key: string, value: string) => params.getAll(key).includes(value);

  return (
    <aside className="lg:sticky lg:top-6 lg:self-start">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mb-3 w-full rounded-card border border-line bg-white px-4 py-3 text-left font-medium lg:hidden"
      >
        {open ? 'Hide filters' : 'Show filters'}
      </button>

      <div className={`${open ? 'block' : 'hidden'} space-y-5 rounded-card border border-line bg-white p-5 lg:block`}>
        <div>
          <p className="eyebrow">Monthly rent</p>
          <div className="mt-2 flex gap-2">
            <input
              type="number"
              inputMode="numeric"
              placeholder="Min"
              defaultValue={params.get('minRent') ?? ''}
              onBlur={(event) => update('minRent', event.target.value)}
              className="field"
              aria-label="Minimum rent"
            />
            <input
              type="number"
              inputMode="numeric"
              placeholder="Max"
              defaultValue={params.get('maxRent') ?? ''}
              onBlur={(event) => update('maxRent', event.target.value)}
              className="field"
              aria-label="Maximum rent"
            />
          </div>
        </div>

        <div>
          <p className="eyebrow">Bedrooms</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[1, 2, 3, 4].map((count) => {
              const active = params.get('minBedrooms') === String(count);
              return (
                <button
                  key={count}
                  type="button"
                  onClick={() => update('minBedrooms', active ? null : String(count))}
                  aria-pressed={active}
                  className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${
                    active ? 'border-seal bg-seal text-white' : 'border-line text-muted hover:border-seal'
                  }`}
                >
                  {count}+ BHK
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="eyebrow">Property type</p>
          <div className="mt-2 space-y-1.5">
            {PROPERTY_TYPES.map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-[14px]">
                <input
                  type="radio"
                  name="propertyType"
                  checked={params.get('propertyType') === value}
                  onChange={() => update('propertyType', value)}
                  className="accent-seal"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="eyebrow">Furnishing</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              ['UNFURNISHED', 'Bare'],
              ['SEMI_FURNISHED', 'Semi'],
              ['FULLY_FURNISHED', 'Full'],
            ].map(([value, label]) => {
              const active = params.get('furnishing') === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('furnishing', active ? null : value)}
                  aria-pressed={active}
                  className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${
                    active ? 'border-seal bg-seal text-white' : 'border-line text-muted hover:border-seal'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="eyebrow">Trust</p>
          <div className="mt-2 space-y-1.5 text-[14px]">
            {[
              ['verifiedOnly', 'Documents verified'],
              ['protectedOnly', 'Odibrick Protected'],
              ['availableNow', 'Available now'],
              ['petsAllowed', 'Pets allowed'],
              ['parking', 'Has parking'],
            ].map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={params.get(key) === 'true'}
                  onChange={(event) => update(key, event.target.checked ? 'true' : null)}
                  className="accent-seal"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="eyebrow">Listed by</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {['OWNER', 'AGENT', 'BUILDER'].map((value) => {
              const active = params.get('listedBy') === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => update('listedBy', active ? null : value)}
                  aria-pressed={active}
                  className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${
                    active ? 'border-seal bg-seal text-white' : 'border-line text-muted hover:border-seal'
                  }`}
                >
                  {value.toLowerCase()}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="eyebrow">Amenities</p>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-[14px]">
            {AMENITIES.map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={has('amenities', value)}
                  onChange={() => toggleMulti('amenities', value)}
                  className="accent-seal"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="rule pt-4">
          <label className="eyebrow" htmlFor="sort">
            Sort
          </label>
          <select
            id="sort"
            value={params.get('sort') ?? 'NEWEST'}
            onChange={(event) => update('sort', event.target.value)}
            className="field mt-2"
          >
            <option value="NEWEST">Newest first</option>
            <option value="PRICE_ASC">Price: low to high</option>
            <option value="PRICE_DESC">Price: high to low</option>
            <option value="AREA_DESC">Largest first</option>
          </select>
        </div>
      </div>
    </aside>
  );
}
