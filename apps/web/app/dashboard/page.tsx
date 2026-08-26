import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi, serverApiOrNull } from '@/lib/api';
import { Badge, Button, Card, CardHeader, EmptyState, StatTile, StatusChip } from '@/components/ui';
import { RecordSpine } from '@/components/record-spine';
import { inr, relative, shortDate, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Dashboard', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Summary = {
  kycStatus: string;
  unreadNotifications: number;
  tasks: Array<{ label: string; href: string; severity: string }>;
  stats: {
    active_listings: number;
    draft_listings: number;
    new_leads: number;
    new_applications: number;
    my_applications: number;
    saved: number;
    active_tenancies: number;
  };
};

type Me = { fullName: string; roles: string[] };

type Tenancy = {
  id: number;
  stage: string;
  rent_amount: number;
  property_title: string;
  locality: string;
  city: string;
  counterparty_name?: string;
  start_date?: string;
  renewal_due_on?: string;
};

type Payment = {
  id: number;
  reference_code: string;
  purpose: string;
  total_amount: number;
  status: string;
  due_date?: string;
  direction: 'IN' | 'OUT';
};

type Notification = { id: number; title: string; body: string; created_at: string; action_url?: string };

export default async function DashboardPage() {
  const [me, summary, tenancies, payments, notifications] = await Promise.all([
    serverApi<Me>('/auth/me'),
    serverApi<Summary>('/me/summary'),
    serverApiOrNull<{ data: Tenancy[] }>('/tenancies'),
    serverApiOrNull<{ data: Payment[] }>('/payments', { query: { perPage: 5 } }),
    serverApiOrNull<Notification[]>('/notifications', { query: { limit: 5 } }),
  ]);

  const isLister = me.roles.some((r) => ['OWNER', 'AGENT', 'BUILDER'].includes(r));
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">{greeting}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold">{me.fullName.split(' ')[0]}</h1>
      </div>

      {/* ------------------------------------------------------ next actions */}
      <Card>
        <CardHeader
          title="What needs doing"
          note={summary.tasks.length ? 'In the order we would deal with them.' : undefined}
          action={
            summary.unreadNotifications ? (
              <Link href="/dashboard/notifications">
                <Badge tone="ochre">{summary.unreadNotifications} unread</Badge>
              </Link>
            ) : null
          }
        />
        <div className="p-5">
          {summary.tasks.length ? (
            <ul className="space-y-2">
              {summary.tasks.map((task, index) => (
                <li key={`${task.href}-${index}`}>
                  <Link
                    href={task.href}
                    className={`flex items-center justify-between gap-4 rounded-card border px-4 py-3 transition-colors hover:border-seal ${
                      task.severity === 'ACTION' ? 'border-ochre/40 bg-ochre-soft/40' : 'border-line bg-white'
                    }`}
                  >
                    <span className="text-[15px]">{task.label}</span>
                    <span aria-hidden className="font-mono text-muted">
                      →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">
              Nothing is waiting on you. Anything that needs your attention will show up here first.
            </p>
          )}
        </div>
      </Card>

      {/* ------------------------------------------------------------- stats */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {isLister ? (
          <>
            <StatTile label="Live listings" value={summary.stats.active_listings} />
            <StatTile
              label="Drafts"
              value={summary.stats.draft_listings}
              note={summary.stats.draft_listings ? 'Not visible to renters yet' : undefined}
            />
            <StatTile label="New leads" value={summary.stats.new_leads} />
            <StatTile label="New applications" value={summary.stats.new_applications} />
          </>
        ) : (
          <>
            <StatTile label="My applications" value={summary.stats.my_applications} />
            <StatTile label="Saved homes" value={summary.stats.saved} />
            <StatTile label="Active tenancies" value={summary.stats.active_tenancies} />
            <StatTile label="Identity" value={titleCase(summary.kycStatus)} />
          </>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------- tenancies */}
        <Card>
          <CardHeader
            title="Tenancies"
            action={
              tenancies?.data?.length ? (
                <Button href="/dashboard/tenancies" variant="ghost" size="sm">
                  All
                </Button>
              ) : null
            }
          />
          <div className="p-5">
            {tenancies?.data?.length ? (
              <ul className="space-y-3">
                {tenancies.data.slice(0, 3).map((tenancy) => (
                  <li key={tenancy.id}>
                    <Link
                      href={`/dashboard/tenancy/${tenancy.id}`}
                      className="block rounded-card border border-line p-4 transition-colors hover:border-seal"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{tenancy.property_title}</p>
                          <p className="text-[13px] text-muted">
                            {tenancy.locality}, {tenancy.city}
                            {tenancy.counterparty_name ? ` · ${tenancy.counterparty_name}` : ''}
                          </p>
                        </div>
                        <StatusChip status={tenancy.stage} />
                      </div>
                      <p className="mt-2 font-mono text-[12px] uppercase tracking-wider text-muted">
                        {inr(tenancy.rent_amount)}/month
                        {tenancy.renewal_due_on ? ` · renews ${shortDate(tenancy.renewal_due_on)}` : ''}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted">
                No tenancy yet. One is created automatically when an application is accepted.
              </p>
            )}
          </div>
        </Card>

        {/* --------------------------------------------------------- payments */}
        <Card>
          <CardHeader
            title="Payments"
            action={
              <Button href="/dashboard/payments" variant="ghost" size="sm">
                Ledger
              </Button>
            }
          />
          <div className="p-5">
            {payments?.data?.length ? (
              <ul className="divide-y divide-line">
                {payments.data.slice(0, 5).map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                    <div className="min-w-0">
                      <p className="truncate text-[15px]">{titleCase(payment.purpose)}</p>
                      <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                        {payment.reference_code}
                        {payment.due_date ? ` · due ${shortDate(payment.due_date)}` : ''}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular font-medium">
                        {payment.direction === 'OUT' ? '−' : '+'}
                        {inr(payment.total_amount)}
                      </p>
                      <StatusChip status={payment.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted">
                Nothing on the ledger yet. Deposits and rent appear here with a reference number once an
                agreement is executed.
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* --------------------------------------------------------- activity */}
      <Card>
        <CardHeader title="Recent activity" />
        <div className="p-5">
          {notifications?.length ? (
            <RecordSpine
              events={notifications.map((n) => ({
                title: n.title,
                detail: n.body,
                occurred_at: n.created_at,
              }))}
              dense
            />
          ) : (
            <EmptyState
              title="Nothing recorded yet"
              body="Verifications, agreements, payments and condition reports all show up here as they happen."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
