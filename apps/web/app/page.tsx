import type { Metadata } from 'next';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import type { PropertyCardData } from '@/components/property-card';
import { RecordSpine } from '@/components/record-spine';
import { HeroSearch } from './hero-search';
import { Skyline } from '@/components/brand/skyline';
import { QuickPaths } from '@/components/landing/quick-paths';
import { ExploreSection } from '@/components/landing/explore-section';
import { ServicesSection } from '@/components/landing/services-section';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import { CtaBand } from '@/components/landing/cta-band';
import { resolveListingHref } from '@/lib/explore-query';
import { serverApi, serverApiOrNull } from '@/lib/api';

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

export default async function HomePage() {
  let featured: PropertyCardData[] = [];
  let total = 0;
  let fetchFailed = false;
  const me = await serverApiOrNull<{ fullName: string; roles: string[] }>('/auth/me');
  const listHref = resolveListingHref(me);
  try {
    const result = await serverApi<SearchResponse>('/properties', {
      query: { perPage: 6, sort: 'NEWEST', listingType: 'RENT' },
    });
    featured = result.data;
    total = result.meta.total;
  } catch {
    featured = [];
    fetchFailed = true;
  }

  return (
    <>
      <SiteHeader variant="landing" />

      {/* ---------------------------------------------------------------- hero */}
      <section className="brickgrid relative overflow-hidden bg-brand-green pt-10 font-brand-sans text-white md:pt-16">
        <div className="relative z-[2] mx-auto grid w-[calc(100%-36px)] max-w-[1240px] items-end gap-12 md:w-[calc(100%-64px)] lg:grid-cols-[1.08fr_0.92fr] lg:gap-14">
          <div className="min-w-0 pb-16 lg:pb-[72px]">
            <p className="brand-label text-brand-sage">Property, protected · Across India</p>
            <h1 className="my-5 font-brand-serif text-[clamp(44px,5.4vw,76px)] font-semibold leading-[1.02] tracking-[-0.015em]">
              Find a home.
              <br />
              <em className="font-normal italic text-brand-sage">Keep it protected.</em>
            </h1>
            <p className="mb-8 max-w-[500px] text-[17px] leading-[1.55] text-[#cfdcd6] sm:text-[18px]">
              Search verified homes, complete the agreement with a lawyer on a video call, pay on a
              recorded ledger, and document the flat from the day you get the keys.
            </p>

            <HeroSearch listHref={listHref} />

            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-[14px] text-[#cfdcd6]">
              <span>
                <strong className="font-semibold text-white">{total || '—'}</strong> homes listed
              </span>
              <span>Free, unlimited listings for owners, agents and builders</span>
            </div>
          </div>

          {/* Arched architectural visual & signature tenancy record */}
          <div className="relative hidden min-h-[580px] self-stretch lg:block">
            <div className="brickgrid absolute inset-x-0 bottom-0 top-2.5 overflow-hidden rounded-t-[200px] border border-white/10 bg-brand-forest">
              <div className="relative z-[2] flex h-full flex-col justify-start px-12 pb-36 pt-24">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <p className="brand-label text-[11px] text-brand-sage">Tenancy record</p>
                  <span className="font-mono text-[11px] text-white/45">ODB-TNY-2026-000412</span>
                </div>
                <div className="mt-4 [&_.spine-node::before]:border-white/30 [&_.spine-node::before]:bg-brand-forest [&_.spine::before]:bg-white/20">
                  <div className="text-white [&_p.font-mono]:text-brand-sage/80 [&_p.text-muted]:text-[#cfdcd6]">
                    <RecordSpine events={SPECIMEN} dense />
                  </div>
                </div>
              </div>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-b from-transparent via-transparent to-brand-forest/70"
              />
            </div>

            <div className="guard absolute -left-[34px] bottom-6 z-[3] rounded-[4px] bg-brand-ivory px-[26px] py-4 text-center text-brand-green shadow-brand">
              <div className="brand-label text-[11px] text-brand-stone">On the record</div>
              <b className="mt-1 block font-brand-serif text-[20px] font-semibold">
                Day 1 to Move-out
              </b>
            </div>
          </div>
        </div>

        <Skyline variant="hero" className="absolute inset-x-0 bottom-0 z-[1]" />
      </section>

      {/* ---------------------------------------------------------- quick paths */}
      <QuickPaths
        listHref={listHref}
        professionalHref="/for-agents"
      />

      {/* ------------------------------------------------------------- explore */}
      <ExploreSection
        initialRentData={featured}
        initialRentTotal={total}
        initialFailed={fetchFailed}
      />

      {/* ------------------------------------------------------------ services */}
      <ServicesSection />

      {/* -------------------------------------------------------- how it works */}
      <HowItWorksSection ownerListHref={listHref} />

      {/* ----------------------------------------------------------------- cta */}
      <CtaBand listHref={listHref} />

      <SiteFooter variant="landing" />
    </>
  );
}
