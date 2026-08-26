import Link from 'next/link';

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

export function SiteFooter() {
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
