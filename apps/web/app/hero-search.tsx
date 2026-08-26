'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const CITIES = ['Hyderabad', 'Bengaluru', 'Pune'];

export function HeroSearch() {
  const router = useRouter();
  const [listingType, setListingType] = useState<'RENT' | 'SALE'>('RENT');
  const [city, setCity] = useState(CITIES[0]);
  const [q, setQ] = useState('');

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams({ listingType, city });
    if (q.trim()) params.set('q', q.trim());
    router.push(`/properties?${params.toString()}`);
  };

  return (
    <form onSubmit={submit} className="rounded-card bg-white p-2 shadow-lift">
      <div className="flex gap-1 px-1 pt-1">
        {(['RENT', 'SALE'] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setListingType(type)}
            aria-pressed={listingType === type}
            className={`rounded-pill px-3 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
              listingType === type ? 'bg-seal text-white' : 'text-muted hover:bg-paper'
            }`}
          >
            {type === 'RENT' ? 'Rent' : 'Buy'}
          </button>
        ))}
      </div>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor="hero-city">
          City
        </label>
        <select
          id="hero-city"
          value={city}
          onChange={(event) => setCity(event.target.value)}
          className="rounded-card border border-line bg-white px-3 py-3 text-[15px] text-ink focus:border-seal focus:outline-none sm:w-44"
        >
          {CITIES.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>

        <label className="sr-only" htmlFor="hero-q">
          Locality or landmark
        </label>
        <input
          id="hero-q"
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Locality, project or landmark"
          className="flex-1 rounded-card border border-line px-3 py-3 text-[15px] text-ink placeholder:text-muted/60 focus:border-seal focus:outline-none"
        />

        <button
          type="submit"
          className="rounded-card bg-seal px-6 py-3 font-medium text-white transition-colors hover:bg-seal-deep"
        >
          Search homes
        </button>
      </div>
    </form>
  );
}
