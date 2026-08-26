import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Button, Card, CardHeader, EmptyState, StatusChip } from '@/components/ui';
import { ApplicationDecision } from './application-decision';
import { inr, relative, shortDate, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Applications', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Application = {
  id: number;
  status: string;
  occupants: number;
  household_type: string;
  move_in_date?: string;
  tenure_months?: number;
  offered_rent?: number;
  message?: string;
  created_at: string;
  property_id: number;
  property_title: string;
  property_slug: string;
  locality: string;
  city: string;
  rent_amount?: number;
  tenant_name?: string;
  tenant_public_id?: string;
  tenant_kyc_status?: string;
  tenancy_id?: number;
};

export default async function ApplicationsPage() {
  const [incoming, outgoing] = await Promise.all([
    serverApi<{ data: Application[] }>('/applications/received'),
    serverApi<{ data: Application[] }>('/applications/mine'),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Applications</h1>
        <p className="mt-1 text-[15px] text-muted">
          Accepting an application opens a legal case and starts the agreement — it is not a casual step.
        </p>
      </div>

      {incoming.data.length ? (
        <Card>
          <CardHeader
            title="Received"
            note="People who want to rent one of your properties."
          />
          <div className="divide-y divide-line">
            {incoming.data.map((application) => (
              <div key={application.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusChip status={application.status} />
                      {application.tenant_kyc_status === 'VERIFIED' ? (
                        <span className="font-mono text-[11px] uppercase tracking-wider text-seal">
                          ✦ Identity verified
                        </span>
                      ) : (
                        <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                          Identity not verified
                        </span>
                      )}
                    </div>
                    <p className="mt-2 font-display text-lg font-semibold">{application.tenant_name}</p>
                    <p className="text-[14px] text-muted">
                      For{' '}
                      <Link href={`/${application.property_slug}`} className="underline underline-offset-2">
                        {application.property_title}
                      </Link>
                      , {application.locality}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted">
                      <span>{application.occupants} occupants</span>
                      <span>{titleCase(application.household_type)}</span>
                      {application.move_in_date ? <span>Move in {shortDate(application.move_in_date)}</span> : null}
                      {application.tenure_months ? <span>{application.tenure_months} months</span> : null}
                      {application.offered_rent ? <span>Offer {inr(application.offered_rent)}</span> : null}
                      <span>Applied {relative(application.created_at)}</span>
                    </div>
                    {application.message ? (
                      <p className="mt-3 max-w-2xl rounded-card border border-line bg-paper px-3 py-2 text-[14px]">
                        {application.message}
                      </p>
                    ) : null}
                  </div>

                  <ApplicationDecision
                    applicationId={application.id}
                    status={application.status}
                    tenancyId={application.tenancy_id}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Sent" note="Applications you have made." />
        <div className="p-5">
          {outgoing.data.length ? (
            <ul className="divide-y divide-line">
              {outgoing.data.map((application) => (
                <li key={application.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                  <div className="min-w-0">
                    <Link href={`/${application.property_slug}`} className="font-medium hover:underline">
                      {application.property_title}
                    </Link>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                      {application.locality}, {application.city} · applied {relative(application.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusChip status={application.status} />
                    {application.tenancy_id ? (
                      <Button href={`/dashboard/tenancy/${application.tenancy_id}`} size="sm" variant="secondary">
                        Open tenancy
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="You have not applied anywhere yet"
              body="When you find a home you like, start the rental process from its page. You can track every step here."
              action={<Button href="/properties">Browse homes</Button>}
            />
          )}
        </div>
      </Card>
    </div>
  );
}
