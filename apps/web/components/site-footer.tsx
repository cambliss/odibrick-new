import Link from 'next/link';
import { Skyline } from './brand/skyline';

const COLUMNS = [
  {
    title: 'Renting',
    links: [
      { label: 'Search homes', href: '/properties?listingType=RENT' },
      { label: 'How the process works', href: '/how-it-works' },
      { label: 'Day 1 condition report', href: '/how-it-works#condition-report' },
      { label: 'Protection plans', href: '/protection' },
    ],
  },
  {
    title: 'Listing',
    links: [
      { label: 'List your property', href: '/register?role=OWNER' },
      { label: 'For agents and builders', href: '/for-agents' },
      { label: 'Cambliss marketing', href: '/for-agents#marketing' },
      { label: 'Verification', href: '/how-it-works#verification' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About Odibrick', href: '/about' },
      { label: 'Support', href: '/support' },
      { label: 'Terms of use', href: '/legal/terms' },
      { label: 'Privacy policy', href: '/legal/privacy' },
    ],
  },
];

const LANDING_COLUMNS = [
  {
    title: 'Renting & Buying',
    links: [
      { label: 'Search homes to rent', href: '/properties?listingType=RENT' },
      { label: 'Search homes to buy', href: '/properties?listingType=SALE' },
      { label: 'How the process works', href: '/how-it-works' },
    ],
  },
  {
    title: 'Listing',
    links: [
      { label: 'List your property', href: '/register?role=OWNER' },
      { label: 'For agents and builders', href: '/for-agents' },
      { label: 'Cambliss marketing', href: '/for-agents#marketing' },
    ],
  },
  {
    title: 'Company & Help',
    links: [
      { label: 'Customer support', href: '/support' },
      { label: 'Terms of use', href: '/legal/terms' },
      { label: 'Privacy policy', href: '/legal/privacy' },
    ],
  },
];

export function SiteFooter({ variant = 'default' }: { variant?: 'default' | 'landing' }) {
  if (variant === 'landing') {
    return (
      <footer className="relative mt-24 bg-brand-green font-brand-sans text-[#cfdcd6] md:mt-28">
        <Skyline
          variant="footer"
          className="pointer-events-none absolute inset-x-0 -top-[58px] h-[60px] overflow-hidden sm:-top-[90px] sm:h-[92px] lg:-top-[118px] lg:h-[120px]"
        />
        <div className="mx-auto w-[calc(100%-36px)] max-w-[1240px] md:w-[calc(100%-64px)]">
          <div className="grid grid-cols-1 gap-10 pb-10 pt-14 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(3,1fr)] lg:gap-12">
            <div className="sm:col-span-2 lg:col-span-1">
              <Link
                href="/"
                aria-label="Odibrick home"
                className="inline-block rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-brick"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/brand/odibrick-logo-white.png"
                  alt="Odibrick — Property, Protected"
                  width={360}
                  height={92}
                  className="mb-4 h-11 w-auto"
                />
              </Link>
              <p className="max-w-[300px] text-[15px] leading-[1.55] text-[#cfdcd6]">
                A rental and property-protection platform from Camblis Pvt. Ltd. Every brick,
                accounted for.
              </p>
            </div>

            {LANDING_COLUMNS.map((column) => (
              <div key={column.title}>
                <h3 className="mb-4 mt-1.5 font-brand-label text-[12px] font-semibold uppercase tracking-[0.16em] text-brand-sage">
                  {column.title}
                </h3>
                <ul className="flex flex-col gap-2.5 text-[15px]">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-[#cfdcd6] transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="border-t border-white/15 pb-8 pt-6 text-[13px] text-[#9fb5ab]">
            <p className="max-w-4xl leading-relaxed">
              Odibrick coordinates verification, documentation and payment records. Agreements are
              prepared and approved by qualified legal professionals; insurance products, where
              offered, are issued by licensed insurers, not by Odibrick.
            </p>
            <div className="mt-4 flex flex-wrap justify-between gap-4">
              <span>© {new Date().getFullYear()} Odibrick by Camblis Pvt. Ltd. · Property, Protected.</span>
              <span>All rights reserved.</span>
            </div>
          </div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="border-t border-line bg-white">
      <div className="mx-auto max-w-[1180px] px-5 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <p className="font-display text-xl font-semibold">Odibrick</p>
            <p className="mt-2 max-w-xs text-sm text-muted">
              A rental platform that stays involved after the handshake: verification, a lawyer-reviewed
              agreement, a recorded payment ledger and a condition record for the property.
            </p>
            <p className="mt-4 font-mono text-[11px] uppercase tracking-wider text-muted">
              Built by Cambliss Pvt. Ltd.
            </p>
          </div>
          {COLUMNS.map((column) => (
            <div key={column.title}>
              <p className="eyebrow">{column.title}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-muted hover:text-ink hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="rule mt-10 pt-6 text-[13px] text-muted">
          <p>
            Odibrick coordinates verification, documentation and payment records. Agreements are prepared and
            approved by qualified legal professionals; insurance products, where offered, are issued by licensed
            insurers, not by Odibrick.
          </p>
          <p className="mt-3">© {new Date().getFullYear()} Cambliss Pvt. Ltd. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
