import Link from 'next/link';

const SERVICES = [
  {
    title: 'Verification',
    body: 'Ownership papers, identity, and address checks are reviewed by our team before a listing receives a verified seal.',
    icon: (
      <svg
        className="h-6 w-6"
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
    ),
  },
  {
    title: 'Legal agreements',
    body: 'Clauses are drafted from a reviewed library, discussed with both parties on a video consultation, and approved by qualified counsel.',
    icon: (
      <svg
        className="h-6 w-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />
      </svg>
    ),
  },
  {
    title: 'Recorded payments',
    body: 'Deposits, rent, and fees sit on a ledger with a reference number, a due date, and a receipt behind every entry.',
    icon: (
      <svg
        className="h-6 w-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <rect x="3" y="6" width="18" height="14" rx="2" />
        <path d="M3 10h18M16 15h2" />
      </svg>
    ),
  },
  {
    title: 'Condition reports',
    body: 'A timestamped Day 1 condition report, maintenance logs during the tenancy, and a move-out comparison room by room.',
    icon: (
      <svg
        className="h-6 w-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
  },
];

export function ServicesSection() {
  return (
    <section
      id="services"
      aria-labelledby="services-heading"
      className="bg-brand-ivory pb-20 pt-5 font-brand-sans text-brand-ink md:pb-24"
    >
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1240px] md:w-[calc(100%-64px)]">
        <div className="mb-9 flex flex-col items-start justify-between gap-6 md:flex-row md:items-end">
          <div>
            <p className="brand-label text-brand-stone">Property protection</p>
            <h2
              id="services-heading"
              className="mt-2.5 font-brand-serif text-[clamp(30px,3.3vw,44px)] font-semibold leading-[1.12] tracking-[-0.015em] text-brand-ink"
            >
              Beyond the listing,{' '}
              <em className="font-normal italic">we keep the record.</em>
            </h2>
            <p className="mt-3 max-w-[560px] text-[17px] leading-[1.55] text-[#4d5f58]">
              Most portals stop at the phone number. We coordinate verification, lawyer-reviewed
              agreements, recorded payments, and condition reports from day one.
            </p>
          </div>
          <Link
            href="/how-it-works"
            className="inline-flex h-12 shrink-0 items-center justify-center rounded-pill border border-brand-green/20 bg-white px-[22px] text-[15px] font-semibold text-brand-green transition-colors hover:border-brand-green focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
          >
            How the process works
          </Link>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-[1.1fr_1fr_1fr]">
          {/* Proof panel */}
          <div className="brickgrid flex flex-col justify-between overflow-hidden rounded-[20px] bg-brand-green p-8 text-white md:col-span-2 xl:col-span-1 xl:row-span-2 xl:p-9">
            <div>
              <p className="brand-label text-brand-sage">Every step, documented</p>
              <h3 className="mt-3.5 font-brand-serif text-[30px] font-semibold leading-[1.1] sm:text-[34px]">
                You always know the true state of the tenancy.
              </h3>
              <p className="mt-3 text-[15px] leading-[1.55] text-[#cfdcd6]">
                Verification checks, signed agreements, payment references, and room-by-room
                condition records — visible to both parties in one place.
              </p>
            </div>

            <div className="guard mt-7 p-7 text-center [--guard-c:var(--brand-sage)]">
              <p className="brand-label text-brand-sage">Condition record</p>
              <b className="mt-1.5 block font-brand-serif text-[24px] font-semibold sm:text-[26px]">
                Day 1 to Move-out
              </b>
              <p className="mt-1.5 text-[14px] text-[#cfdcd6]">
                Timestamped photos, room notes &amp; meter readings
              </p>
            </div>
          </div>

          {/* 4 service cards */}
          {SERVICES.map((item) => (
            <article
              key={item.title}
              className="rounded-[20px] border border-brand-line bg-white p-[30px] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-brand"
            >
              <div className="mb-[22px] grid h-[52px] w-[52px] place-items-center rounded-full bg-brand-sage-soft text-brand-green">
                {item.icon}
              </div>
              <h3 className="font-brand-serif text-[22px] font-semibold text-brand-ink">
                {item.title}
              </h3>
              <p className="mt-2 text-[15px] leading-[1.55] text-[#53645d]">{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
