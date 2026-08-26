import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Badge, Card, CardHeader, EmptyState, StatTile, StatusChip } from '@/components/ui';
import { inr, relative, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Legal queue', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type LegalCase = {
  id: number;
  case_number: string;
  case_type: string;
  status: string;
  priority: string;
  jurisdiction?: string;
  opened_at: string;
  assignee_name?: string;
  tenancy_id: number;
  rent_amount: number;
  deposit_amount: number;
  service_plan: string;
  property_title: string;
  locality: string;
  city: string;
  owner_name: string;
  tenant_name: string;
  agreement_id?: number;
  agreement_status?: string;
  meetings_scheduled: number;
};

const FILTERS = [
  ['', 'All open'],
  ['INTAKE', 'Intake'],
  ['DOCUMENT_REVIEW', 'Document review'],
  ['CONSULTATION_SCHEDULED', 'Consultation'],
  ['DRAFTING', 'Drafting'],
  ['APPROVED', 'Awaiting signature'],
];

export default async function LegalQueuePage({ searchParams }: { searchParams: { status?: string } }) {
  const result = await serverApi<{ data: LegalCase[]; meta: { total: number } }>('/legal/cases', {
    query: { status: searchParams.status, perPage: 50 },
  });

  const urgent = result.data.filter((c) => ['URGENT', 'HIGH'].includes(c.priority)).length;
  const unassigned = result.data.filter((c) => !c.assignee_name).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Legal queue</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Every case here has real parties and real money attached. Nothing is drafted or approved
          automatically — a qualified person signs off on each version.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Open cases" value={result.meta.total} />
        <StatTile label="High priority" value={urgent} />
        <StatTile label="Unassigned" value={unassigned} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map(([value, label]) => {
          const active = (searchParams.status ?? '') === value;
          return (
            <Link
              key={label}
              href={value ? `/dashboard/legal?status=${value}` : '/dashboard/legal'}
              className={`rounded-pill border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider ${
                active ? 'border-seal bg-seal text-white' : 'border-line bg-white text-muted hover:border-seal'
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {result.data.length ? (
        <div className="space-y-3">
          {result.data.map((legalCase) => (
            <Card key={legalCase.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px]">{legalCase.case_number}</span>
                    <StatusChip status={legalCase.status} />
                    {['URGENT', 'HIGH'].includes(legalCase.priority) ? (
                      <Badge tone="alert">{legalCase.priority}</Badge>
                    ) : null}
                    <Badge>{titleCase(legalCase.service_plan)}</Badge>
                  </div>

                  <p className="mt-2 font-display text-lg font-semibold">{legalCase.property_title}</p>
                  <p className="text-[14px] text-muted">
                    {legalCase.locality}, {legalCase.city} · {legalCase.owner_name} ⟷ {legalCase.tenant_name}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                    <span>{titleCase(legalCase.case_type)}</span>
                    <span>Rent {inr(legalCase.rent_amount)}</span>
                    <span>Deposit {inr(legalCase.deposit_amount)}</span>
                    <span>{legalCase.jurisdiction ?? 'Jurisdiction not set'}</span>
                    <span>Opened {relative(legalCase.opened_at)}</span>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Assigned to</p>
                  <p className="text-[14px]">{legalCase.assignee_name ?? 'Nobody yet'}</p>
                  {legalCase.agreement_status ? (
                    <div className="mt-2">
                      <StatusChip status={legalCase.agreement_status} />
                    </div>
                  ) : null}
                  <Link
                    href={`/dashboard/legal/${legalCase.id}`}
                    className="mt-3 inline-block rounded-card border border-line px-3 py-1.5 text-[13px] hover:border-seal hover:text-seal"
                  >
                    Open case
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nothing in the queue"
          body="Cases appear here the moment an owner accepts an application. There is nothing waiting right now."
        />
      )}
    </div>
  );
}
