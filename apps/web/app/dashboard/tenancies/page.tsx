import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Badge, Button, Card, EmptyState, StatusChip } from '@/components/ui';
import { inr, shortDate } from '@/lib/format';

export const metadata: Metadata = { title: 'My tenancies', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

interface TenancySummary {
  id: number;
  public_id: string;
  stage: string;
  service_plan: string;
  rent_amount: number;
  deposit_amount: number;
  start_date?: string;
  end_date?: string;
  renewal_due_on?: string;
  property_id: number;
  slug: string;
  title: string;
  locality: string;
  city: string;
  owner_name: string;
  tenant_name: string;
  agreement_id?: number;
  agreement_status?: string;
  payments_due: number;
}

const TABS = [
  ['', 'All'],
  ['ACTIVE', 'Active'],
  ['LEGAL_REVIEW', 'Legal review'],
  ['PENDING_DEPOSIT', 'Deposit pending'],
  ['NOTICE_PERIOD', 'Notice period'],
  ['CLOSED', 'Closed'],
];

export default async function TenanciesPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string }>;
}) {
  const sp = await searchParams;
  let tenancies: TenancySummary[] = [];

  try {
    tenancies = await serverApi<TenancySummary[]>('/rental/tenancies');
  } catch {
    tenancies = [];
  }

  const selectedStage = sp.stage ?? '';
  const filtered = selectedStage
    ? tenancies.filter((t) => t.stage.toUpperCase() === selectedStage.toUpperCase())
    : tenancies;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Tenancies</h1>
          <p className="mt-1 text-[15px] text-muted">
            Manage your active leases, legal agreements, rent schedules, renewals, and move-out settlements.
          </p>
        </div>
        <Button href="/properties">Find a home</Button>
      </div>

      <nav aria-label="Filter tenancies by status" className="flex flex-wrap gap-1.5">
        {TABS.map(([value, label]) => {
          const active = selectedStage === value;
          return (
            <Link
              key={label}
              href={value ? `/dashboard/tenancies?stage=${value}` : '/dashboard/tenancies'}
              aria-current={active ? 'page' : undefined}
              className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition ${
                active ? 'border-seal bg-seal text-white' : 'border-line bg-white text-muted hover:border-seal'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {filtered.length === 0 ? (
        <EmptyState
          title="No tenancies found"
          body={
            selectedStage
              ? `There are no tenancies currently in the ${selectedStage.toLowerCase().replace('_', ' ')} stage.`
              : 'You do not have any active or past tenancies recorded yet. Start by browsing properties or listing your home.'
          }
          action={<Button href="/properties">Browse properties</Button>}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((t) => (
            <Card key={t.id} className="flex flex-col justify-between p-5 transition hover:border-seal">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-mono text-[11px] text-muted">REF #{t.public_id || t.id}</span>
                    <h2 className="font-display text-lg font-semibold text-seal">
                      <Link href={`/dashboard/tenancy/${t.id}`} className="hover:underline">
                        {t.title}
                      </Link>
                    </h2>
                    <p className="text-[13px] text-muted">
                      {t.locality}, {t.city}
                    </p>
                  </div>
                  <StatusChip status={t.stage} />
                </div>

                <div className="grid grid-cols-2 gap-2 rounded border border-line bg-surface/50 p-2.5 text-xs">
                  <div>
                    <span className="text-muted">Monthly Rent</span>
                    <p className="font-semibold text-seal">{inr(t.rent_amount)}</p>
                  </div>
                  <div>
                    <span className="text-muted">Security Deposit</span>
                    <p className="font-semibold text-seal">{inr(t.deposit_amount)}</p>
                  </div>
                  <div>
                    <span className="text-muted">Tenant</span>
                    <p className="font-medium text-seal">{t.tenant_name}</p>
                  </div>
                  <div>
                    <span className="text-muted">Owner</span>
                    <p className="font-medium text-seal">{t.owner_name}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                  {t.start_date && (
                    <span className="text-muted">
                      Start: <span className="font-mono text-seal">{shortDate(t.start_date)}</span>
                    </span>
                  )}
                  {t.end_date && (
                    <span className="text-muted">
                      End: <span className="font-mono text-seal">{shortDate(t.end_date)}</span>
                    </span>
                  )}
                  {t.payments_due > 0 && (
                    <Badge tone="alert">{t.payments_due} payment{t.payments_due > 1 ? 's' : ''} due</Badge>
                  )}
                  {t.agreement_status && (
                    <Badge tone={t.agreement_status === 'EXECUTED' ? 'seal' : 'ochre'}>
                      Agreement: {t.agreement_status}
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-2 border-t border-line pt-3">
                <Button size="sm" variant="ghost" href={`/properties/${t.slug || t.property_id}`}>
                  View Property
                </Button>
                <Button size="sm" href={`/dashboard/tenancy/${t.id}`}>
                  Manage Tenancy →
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
