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
      { href: '/dashboard/saved-properties', label: 'Saved Properties' },
      { href: '/dashboard/saved-searches', label: 'Saved Searches & Alerts' },
      { href: '/dashboard/applications', label: 'Applications' },
      { href: '/dashboard/visits', label: 'Property Visits' },
      { href: '/dashboard/messages', label: 'Messages & Support' },
      // { href: '/dashboard/tenancies', label: 'Tenancies' },
      { href: '/dashboard/payments', label: 'Payments' },
      { href: '/dashboard/maintenance', label: 'Maintenance' },
      { href: '/dashboard/disputes', label: 'Disputes' },
    ],
  },
  {
    title: 'Listing',
    items: [
      { href: '/dashboard/provider', label: 'Provider Action Centre', roles: ['OWNER', 'AGENT', 'BUILDER', 'ADMIN', 'SUPER_ADMIN'] },
      { href: '/dashboard/properties', label: 'My properties', roles: ['OWNER', 'AGENT', 'BUILDER'] },
      { href: '/dashboard/admin/properties', label: 'Property Management', roles: ['ADMIN', 'SUPER_ADMIN'] },
      { href: '/dashboard/leads', label: 'Leads & Enquiries', roles: ['OWNER', 'AGENT', 'BUILDER'] },
      { href: '/dashboard/visits', label: 'Visits & Walkthroughs', roles: ['OWNER', 'AGENT', 'BUILDER'] },
      { href: '/dashboard/messages', label: 'Messages & Inquiries', roles: ['OWNER', 'AGENT', 'BUILDER'] },
      // { href: '/dashboard/marketing', label: 'Marketing', roles: ['OWNER', 'AGENT', 'BUILDER'] },
    ],
  },
  {
    title: 'Account',
    items: [
      { href: '/dashboard/documents', label: 'Documents & Vault' },
      { href: '/dashboard/kyc', label: 'Identity & KYC' },
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
      { href: '/dashboard/admin/properties', label: 'Property Management', requires: 'property.moderate' },
      { href: '/dashboard/admin/analytics', label: 'Analytics & BI Engine', requires: 'analytics.read' },
      { href: '/dashboard/admin/reports', label: 'Management Reports & Exports', requires: 'reports.read' },
      { href: '/dashboard/admin/risk', label: 'Trust & Risk Centre', requires: 'risk.read' },
      { href: '/dashboard/admin/operations', label: 'Operations Control Tower', requires: 'operations.read' },
      { href: '/dashboard/admin/compliance', label: 'Compliance & KYC Centre', requires: 'compliance.read' },
      { href: '/dashboard/admin/marketplace', label: 'Marketplace Operations', requires: 'property.moderate' },
      { href: '/dashboard/admin/leads', label: 'Lead Control Centre', requires: 'property.moderate' },
      { href: '/dashboard/admin/visits', label: 'Visit Control Centre', requires: 'property.moderate' },
      { href: '/dashboard/admin/messages', label: 'Communication Hub', requires: 'conversation.manage' },
      { href: '/dashboard/admin/finance', label: 'Finance centre', requires: 'payment.manage' },
      { href: '/dashboard/admin/commercial', label: 'Commercial & Revenue', requires: 'payment.manage' },
      { href: '/dashboard/admin/automation', label: 'Automation & Rules', requires: 'automation.read' },
      { href: '/dashboard/admin/integrations', label: 'External Integrations', requires: 'integration.read' },
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
