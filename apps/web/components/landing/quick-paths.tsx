import Link from 'next/link';

type QuickPathsProps = {
  listHref?: string;
  professionalHref?: string;
};

export function QuickPaths({
  listHref = '/register?role=OWNER',
  professionalHref = '/for-agents',
}: QuickPathsProps) {
  const paths = [
    {
      href: '/properties?listingType=RENT',
      title: 'Rent a home',
      description: 'Find a rental within your budget',
      icon: (
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
          <circle cx="8" cy="15" r="4" />
          <path d="M11 12l8.5-8.5M16 7l2.5 2.5M14 9l2 2" />
        </svg>
      ),
    },
    {
      href: '/properties?listingType=SALE',
      title: 'Buy a property',
      description: 'Compare homes, prices and details',
      icon: (
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
          <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-6h4v6" />
        </svg>
      ),
    },
    {
      href: listHref,
      title: 'List my property',
      description: 'Publish with verified ownership checks',
      icon: (
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
          <path d="M12 5v14M5 12h14" />
        </svg>
      ),
    },
    {
      href: professionalHref,
      title: 'Builder or agent',
      description: 'List a project or manage client units',
      icon: (
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
          <path d="M4 21V5l8-2v18M12 8h8v13M2 21h20M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" />
        </svg>
      ),
    },
  ];

  return (
    <section
      aria-labelledby="quick-paths-title"
      className="bg-brand-ivory pb-5 pt-10 font-brand-sans text-brand-ink"
    >
      <div className="mx-auto w-[calc(100%-36px)] max-w-[1400px] md:w-[calc(100%-48px)]">
        <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end sm:gap-6">
          <div>
            <p className="brand-label text-brand-stone">Start here</p>
            <h2
              id="quick-paths-title"
              className="mt-2 font-brand-serif text-[clamp(27px,3vw,38px)] font-semibold leading-[1.12] tracking-[-0.015em] text-brand-ink"
            >
              What would you like to do?
            </h2>
          </div>
          <p className="max-w-[330px] text-[15px] text-[#4d5f58]">
            Choose one path. You can change it at any time.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {paths.map((item) => (
            <Link
              key={item.title}
              href={item.href}
              className="group grid min-h-[168px] grid-cols-[1fr_auto] content-start gap-1.5 rounded-[16px] border border-brand-line bg-white p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-green hover:shadow-brand-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick sm:min-h-[175px] sm:p-5"
            >
              <span className="col-span-full mb-2 grid h-10 w-10 place-items-center rounded-[11px] bg-brand-sage-soft text-brand-green">
                {item.icon}
              </span>
              <strong className="col-span-full text-[15px] font-semibold text-brand-ink sm:text-[17px]">
                {item.title}
              </strong>
              <small className="max-w-[225px] text-[13px] leading-[1.4] text-[#53645d] sm:text-[14px]">
                {item.description}
              </small>
              <span
                aria-hidden="true"
                className="self-end text-[20px] text-brand-green transition-transform duration-200 group-hover:translate-x-0.5 sm:text-[22px]"
              >
                →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
