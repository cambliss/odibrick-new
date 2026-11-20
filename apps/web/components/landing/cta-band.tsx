import Link from 'next/link';

export function CtaBand({ listHref = '/register?role=OWNER' }: { listHref?: string }) {
  return (
    <>
      {/* Conversion CTA Band */}
      <section className="bg-brand-ivory pb-12 pt-16 font-brand-sans md:pb-14 md:pt-20">
        <div className="mx-auto w-[calc(100%-36px)] max-w-[1240px] md:w-[calc(100%-64px)]">
          <div className="brickgrid relative flex flex-col items-start justify-between gap-8 overflow-hidden rounded-[22px] bg-brand-green p-8 text-white sm:rounded-[28px] sm:p-11 lg:flex-row lg:items-center lg:gap-10 lg:p-16">
            <div className="relative z-[2] max-w-[640px]">
              <p className="brand-label text-brand-sage">Property, protected</p>
              <h2 className="mt-3 font-brand-serif text-[clamp(30px,3.2vw,44px)] font-semibold leading-[1.12] tracking-[-0.015em]">
                Ready to list or find a verified home?{' '}
                <em className="font-normal italic text-brand-sage">Start with a clear record.</em>
              </h2>
              <p className="mt-3.5 max-w-[520px] text-[16px] leading-[1.55] text-[#cfdcd6]">
                Free, unlimited listings for owners, agents, and builders — with verified checks,
                lawyer-approved agreements, and recorded payments.
              </p>
            </div>

            <div className="relative z-[2] flex flex-wrap gap-3">
              <Link
                href={listHref}
                className="inline-flex h-12 items-center justify-center rounded-pill bg-brand-brick px-[22px] text-[15px] font-semibold text-white transition-colors hover:bg-brand-brick-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                List property
              </Link>
              <Link
                href="/properties"
                className="inline-flex h-12 items-center justify-center rounded-pill border border-white/60 px-[22px] text-[15px] font-semibold text-white transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Explore homes
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Preserved Straight answer legal & coordination disclaimer */}
      <section className="border-t border-brand-line bg-brand-sage-soft py-12 font-brand-sans text-brand-ink">
        <div className="mx-auto w-[calc(100%-36px)] max-w-[1240px] md:w-[calc(100%-64px)]">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="max-w-xl">
              <span className="inline-flex items-center rounded-pill border border-brand-green/25 bg-white/70 px-3 py-1 font-brand-label text-[11px] font-semibold uppercase tracking-[0.14em] text-brand-green">
                Straight answer
              </span>
              <p className="mt-3 font-brand-serif text-xl font-semibold text-brand-ink">
                Odibrick is not an insurer, a bank or your lawyer’s replacement.
              </p>
              <p className="mt-2 text-[15px] leading-[1.55] text-[#4d5f58]">
                We coordinate verification, documentation and records. Agreements are approved by
                qualified legal professionals. Protection products, where offered, are issued by
                licensed insurers. We say which is which on every screen.
              </p>
            </div>
            <Link
              href="/how-it-works"
              className="font-semibold text-brand-green underline underline-offset-4 hover:text-brand-forest focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
            >
              How the process works
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
