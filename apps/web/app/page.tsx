import Link from 'next/link';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { PropertyCard, type PropertyCardData } from '@/components/property-card';
import { RecordSpine } from '@/components/record-spine';
import { Button, Badge } from '@/components/ui';
import { HeroSearch } from './hero-search';
import { serverApi } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Odibrick — find a home you can trust',
  description:
    'Verified listings, an agreement reviewed by a real lawyer, payments on a recorded ledger, and a Day 1 condition report for your home.',
};

export const revalidate = 300;

type SearchResponse = { data: PropertyCardData[]; meta: { total: number } };

/** The specimen record shown in the hero — the product's whole claim in one card. */
const SPECIMEN = [
  { title: 'Listing verified', detail: 'Ownership document and owner identity checked', occurred_at: '2026-06-02T10:12:00Z' },
  { title: 'Legal consultation', detail: 'Deposit, lock-in and notice agreed on a recorded call', occurred_at: '2026-06-06T05:30:00Z' },
  { title: 'Agreement executed', detail: 'Signed by both parties after approval by counsel', occurred_at: '2026-06-09T11:44:00Z' },
  { title: 'Deposit received', detail: '₹1,20,000 recorded against ODB-PAY-2026-000412', occurred_at: '2026-06-10T04:02:00Z' },
  { title: 'Day 1 condition report', detail: '38 photographs, 6 rooms, meter readings', occurred_at: '2026-06-12T13:20:00Z' },
];

const WHY = [
  {
    label: 'Verification',
    title: 'A badge means someone checked',
    body: 'Ownership papers, identity and address are reviewed by our team before a listing goes live. Where a check has not been done, we say so instead of showing a badge.',
  },
  {
    label: 'Legal',
    title: 'A lawyer approves the agreement',
    body: 'Clauses are drafted from a reviewed library, discussed with both parties on a video consultation, and approved by a qualified professional before anyone signs.',
  },
  {
    label: 'Payments',
    title: 'Every rupee has a reference',
    body: 'Deposits, rent and fees sit on a ledger with a reference number, a due date and a receipt. Nothing is marked paid without a bank or gateway reference behind it.',
  },
  {
    label: 'Records',
    title: 'The property has a memory',
    body: 'A timestamped condition report on day one, maintenance events during the tenancy, and a move-out report compared against the original — room by room.',
  },
];

export default async function HomePage() {
  let featured: PropertyCardData[] = [];
  let total = 0;
  try {
    const result = await serverApi<SearchResponse>('/properties', {
      query: { perPage: 6, sort: 'NEWEST', listingType: 'RENT' },
    });
    featured = result.data;
    total = result.meta.total;
  } catch {
    featured = [];
  }

  return (
    <>
      <SiteHeader transparent />

      {/* ---------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden bg-ink pb-16 pt-28 text-white sm:pb-24 sm:pt-36">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 44px), repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 44px)',
          }}
        />
        <div className="relative mx-auto grid max-w-[1180px] gap-12 px-5 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="font-mono text-eyebrow uppercase text-ochre">Hyderabad · Bengaluru · Pune</p>
            <h1 className="mt-4 font-display text-hero font-semibold">
              Find a home
              <br />
              you can trust.
            </h1>
            <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-white/75">
              Search verified properties, complete the agreement with a lawyer on a video call, pay on a
              recorded ledger, and document the flat from the day you get the keys.
            </p>

            <div className="mt-8">
              <HeroSearch />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-white/60">
              <span>
                <strong className="font-mono text-white">{total || '—'}</strong> homes listed
              </span>
              <span>Free, unlimited listings for owners, agents and builders</span>
            </div>
          </div>

          {/* The signature: an actual tenancy record, not an illustration. */}
          <div className="rounded-card border border-white/15 bg-white/[0.04] p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-ochre">Tenancy record</p>
              <span className="font-mono text-[11px] text-white/40">ODB-TNY-2026-000412</span>
            </div>
            <div className="mt-5 [&_.spine::before]:bg-white/20 [&_.spine-node::before]:border-white/30 [&_.spine-node::before]:bg-ink">
              <div className="text-white [&_p.font-mono]:text-white/45 [&_p.text-muted]:text-white/55">
                <RecordSpine events={SPECIMEN} dense />
              </div>
            </div>
            <p className="mt-5 border-t border-white/10 pt-4 text-[13px] leading-relaxed text-white/50">
              Every tenancy on Odibrick keeps a record like this one. Both parties can see it, and it is what
              a deposit dispute is decided against.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------------- why */}
      <section className="mx-auto max-w-[1180px] px-5 py-20">
        <div className="max-w-2xl">
          <p className="eyebrow">Why Odibrick</p>
          <h2 className="mt-3 font-display text-display font-semibold">
            Most portals stop at the phone number. We start there.
          </h2>
        </div>

        <div className="mt-12 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2">
          {WHY.map((item) => (
            <div key={item.label} className="bg-white p-7">
              <p className="eyebrow text-seal">{item.label}</p>
              <h3 className="mt-3 font-display text-xl font-semibold">{item.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ listings */}
      <section className="border-y border-line bg-white py-20">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Recently listed</p>
              <h2 className="mt-3 font-display text-display font-semibold">Homes on the platform</h2>
            </div>
            <Button href="/properties?listingType=RENT" variant="secondary">
              See all homes
            </Button>
          </div>

          {featured.length ? (
            <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </div>
          ) : (
            <p className="mt-10 rounded-card border border-dashed border-line px-6 py-10 text-center text-muted">
              Listings will appear here once the platform has published inventory in your city.
            </p>
          )}
        </div>
      </section>

      {/* -------------------------------------------------------------- agents */}
      <section id="for-agents" className="mx-auto max-w-[1180px] px-5 py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="eyebrow">For agents and builders</p>
            <h2 className="mt-3 font-display text-display font-semibold">
              Listing is free. Attention is what costs money.
            </h2>
            <p className="mt-5 text-[15px] leading-relaxed text-muted">
              Upload as much inventory as you like, with no cap and no per-listing fee. When you want reach,
              Cambliss runs the campaign: creative, paid media, landing pages and qualified leads, with the
              performance reported back into your dashboard.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button href="/register?role=AGENT">Create an agent account</Button>
              <Button href="/for-agents" variant="secondary">
                See marketing packages
              </Button>
            </div>
          </div>

          <div className="rounded-card border border-line bg-white p-7 shadow-card">
            <p className="eyebrow">What you get free</p>
            <ul className="mt-4 space-y-3 text-[15px]">
              {[
                'Unlimited property and unit inventory',
                'Verified business profile with your RERA number',
                'Leads, enquiries and site-visit tracking',
                'Views and conversion analytics per listing',
                'Transaction support through to the agreement',
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <span aria-hidden className="mt-1 text-seal">
                    ✓
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 border-t border-line pt-4 text-[13px] text-muted">
              Paid packages start at ₹7,999 for 30 days and are billed separately from listings.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- note */}
      <section className="border-t border-line bg-seal-soft py-14">
        <div className="mx-auto max-w-[1180px] px-5">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl">
              <Badge tone="seal">Straight answer</Badge>
              <p className="mt-3 font-display text-xl font-semibold">
                Odibrick is not an insurer, a bank or your lawyer’s replacement.
              </p>
              <p className="mt-2 text-[15px] text-muted">
                We coordinate verification, documentation and records. Agreements are approved by qualified
                legal professionals. Protection products, where offered, are issued by licensed insurers.
                We say which is which on every screen.
              </p>
            </div>
            <Link href="/how-it-works" className="font-medium text-seal underline underline-offset-4">
              How the process works
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </>
  );
}
