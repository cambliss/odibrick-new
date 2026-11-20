'use client';

import Link from 'next/link';
import { useState } from 'react';

type AudienceKey = 'seek' | 'own' | 'build';

const AUDIENCES: Array<{
  key: AudienceKey;
  label: string;
  steps: Array<{ title: string; body: string }>;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
}> = [
  {
    key: 'seek',
    label: 'Tenants & buyers',
    steps: [
      {
        title: 'Search verified listings',
        body: 'Filter by city, locality, budget, and verification status to see homes with checked details.',
      },
      {
        title: 'Consult and sign',
        body: 'Review terms with qualified legal counsel on a video call and execute the agreement digitally.',
      },
      {
        title: 'Pay and document Day 1',
        body: 'Record deposits and rent on the ledger, then log a timestamped room-by-room condition report.',
      },
    ],
    primaryCta: { label: 'Explore homes', href: '/properties' },
    secondaryCta: { label: 'How the process works', href: '/how-it-works' },
  },
  {
    key: 'own',
    label: 'Property owners',
    steps: [
      {
        title: 'List for free',
        body: 'Publish your home, plot, or commercial unit with clear pricing and zero upfront listing fees.',
      },
      {
        title: 'Verify ownership & KYC',
        body: 'Complete identity and ownership document checks so tenants can trust what they are applying to.',
      },
      {
        title: 'Track agreements & ledger',
        body: 'Review applications, sign lawyer-approved agreements, and track every rent receipt in your dashboard.',
      },
    ],
    primaryCta: { label: 'List property', href: '/register?role=OWNER' },
    secondaryCta: { label: 'How the process works', href: '/how-it-works' },
  },
  {
    key: 'build',
    label: 'Builders & agents',
    steps: [
      {
        title: 'Add unlimited inventory',
        body: 'Create a verified business profile with your RERA number and upload projects or units with no cap.',
      },
      {
        title: 'Track leads & site visits',
        body: 'Manage enquiries, site visits, and listing conversion analytics directly inside your dashboard.',
      },
      {
        title: 'Optional Cambliss campaigns',
        body: 'When you want extra reach, Cambliss runs paid media and landing pages with performance reported back.',
      },
    ],
    primaryCta: { label: 'Create an agent account', href: '/register?role=AGENT' },
    secondaryCta: { label: 'See marketing packages', href: '/for-agents' },
  },
];

export function HowItWorksSection({ ownerListHref }: { ownerListHref?: string }) {
  const [active, setActive] = useState<AudienceKey>('seek');
  const current = AUDIENCES.find((a) => a.key === active) ?? AUDIENCES[0];

  const primaryHref =
    current.key === 'own' && ownerListHref ? ownerListHref : current.primaryCta.href;

  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, idx: number) => {
    let nextIdx: number | null = null;
    if (event.key === 'ArrowRight') nextIdx = (idx + 1) % AUDIENCES.length;
    else if (event.key === 'ArrowLeft') nextIdx = (idx - 1 + AUDIENCES.length) % AUDIENCES.length;
    else if (event.key === 'Home') nextIdx = 0;
    else if (event.key === 'End') nextIdx = AUDIENCES.length - 1;
    if (nextIdx === null) return;
    event.preventDefault();
    const target = AUDIENCES[nextIdx];
    setActive(target.key);
    document.getElementById(`how-tab-${target.key}`)?.focus();
  };

  return (
    <section
      id="how"
      aria-labelledby="how-heading"
      className="bg-white py-16 font-brand-sans text-brand-ink md:py-24"
    >
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1240px] md:w-[calc(100%-64px)]">
        <p className="brand-label text-brand-stone">How it works</p>
        <h2
          id="how-heading"
          className="mb-7 mt-2.5 font-brand-serif text-[clamp(30px,3.3vw,44px)] font-semibold leading-[1.12] tracking-[-0.015em] text-brand-ink"
        >
          Three steps, <em className="font-normal italic">whoever you are.</em>
        </h2>

        <div
          role="tablist"
          aria-label="Choose your role"
          className="mb-8 inline-flex flex-wrap gap-1.5 rounded-pill border border-brand-line bg-white p-1"
        >
          {AUDIENCES.map((aud, idx) => (
            <button
              key={aud.key}
              type="button"
              role="tab"
              id={`how-tab-${aud.key}`}
              tabIndex={active === aud.key ? 0 : -1}
              aria-selected={active === aud.key}
              aria-controls={`how-panel-${aud.key}`}
              onClick={() => setActive(aud.key)}
              onKeyDown={(e) => handleTabKeyDown(e, idx)}
              className={`h-9 rounded-pill px-[18px] text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick ${
                active === aud.key
                  ? 'bg-brand-green text-white'
                  : 'text-brand-stone hover:text-brand-ink'
              }`}
            >
              {aud.label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`how-panel-${current.key}`}
          aria-labelledby={`how-tab-${current.key}`}
          className="grid gap-5 md:grid-cols-3"
        >
          {current.steps.map((step, index) => (
            <div
              key={step.title}
              className="rounded-[20px] bg-brand-ivory p-[30px]"
            >
              <div className="font-brand-serif text-[46px] font-normal italic leading-none text-brand-sage">
                0{index + 1}
              </div>
              <h3 className="mt-[18px] font-brand-serif text-[22px] font-semibold text-brand-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-[15px] leading-[1.55] text-[#53645d]">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href={primaryHref}
            className="inline-flex h-12 items-center justify-center rounded-pill bg-brand-green px-[22px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
          >
            {current.primaryCta.label}
          </Link>
          {current.secondaryCta ? (
            <Link
              href={current.secondaryCta.href}
              className="inline-flex h-12 items-center justify-center rounded-pill border border-brand-green/20 bg-white px-[22px] text-[15px] font-semibold text-brand-green transition-colors hover:border-brand-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
            >
              {current.secondaryCta.label}
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
