'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string; requires?: string; roles?: string[] };

const SECTIONS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'What needs doing' },
      // { href: '/dashboard/notifications', label: 'Notifications' },
    ],
  },
  {
    title: 'Renting',
    items: [
      { href: '/dashboard/applications', label: 'Applications' },
      // { href: '/dashboard/tenancies', label: 'Tenancies' },
      { href: '/dashboard/payments', label: 'Payments' },
      // { href: '/dashboard/maintenance', label: 'Maintenance' },
    ],
  },
  {
    title: 'Listing',
    items: [
      { href: '/dashboard/properties', label: 'My properties', roles: ['OWNER', 'AGENT', 'BUILDER'] },
      // { href: '/dashboard/leads', label: 'Leads', roles: ['OWNER', 'AGENT', 'BUILDER'] },
      // { href: '/dashboard/marketing', label: 'Marketing', roles: ['OWNER', 'AGENT', 'BUILDER'] },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/dashboard/kyc', label: 'Identity' },
      // { href: '/dashboard/documents', label: 'Documents' },
      // { href: '/dashboard/support', label: 'Support' },
    ],
  },
  {
    title: 'Odibrick team',
    items: [
      { href: '/dashboard/legal', label: 'Legal queue', requires: 'legal.case.manage' },
      // { href: '/dashboard/verification', label: 'Verification queue', requires: 'property.moderate' },
      // { href: '/dashboard/campaigns', label: 'Campaign board', requires: 'campaign.manage' },
      { href: '/dashboard/admin', label: 'Control centre', requires: 'analytics.read' },
    ],
  },
];

export function DashboardNav({ roles, permissions }: { roles: string[]; permissions: string[] }) {
  const pathname = usePathname();

  const visible = SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => {
      if (item.requires && !permissions.includes(item.requires)) return false;
      if (item.roles && !item.roles.some((role) => roles.includes(role))) return false;
      return true;
    }),
  })).filter((section) => section.items.length);

  return (
    <nav aria-label="Dashboard" className="lg:sticky lg:top-6 lg:self-start">
      <div className="flex gap-4 overflow-x-auto pb-2 lg:block lg:space-y-6 lg:overflow-visible lg:pb-0">
        {visible.map((section) => (
          <div key={section.title} className="min-w-max lg:min-w-0">
            <p className="eyebrow hidden lg:block">{section.title}</p>
            <ul className="flex gap-1 lg:mt-2 lg:block lg:space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={`block whitespace-nowrap rounded-card px-3 py-2 text-[14px] transition-colors ${
                        active ? 'bg-seal-soft font-medium text-seal-deep' : 'text-muted hover:bg-white hover:text-ink'
                      }`}
                    >
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
