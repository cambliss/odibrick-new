import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi, ApiError } from '@/lib/api';
import { Badge, Button, Card, CardHeader, DataRow, EmptyState, StatusChip } from '@/components/ui';
import { RecordSpine, JourneyBar } from '@/components/record-spine';
import { Seal } from '@/components/verification-seal';
import { inr, shortDate, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Tenancy', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type TenancyDetail = {
  tenancy: {
    id: number;
    stage: string;
    service_plan: string;
    rent_amount: number;
    deposit_amount: number;
    maintenance_amount?: number;
    start_date?: string;
    end_date?: string;
    lock_in_months?: number;
    notice_period_days?: number;
    renewal_due_on?: string;
    property_id: number;
    property_title: string;
    property_slug: string;
    locality: string;
    city: string;
    owner_name: string;
    tenant_name: string;
    is_owner: boolean;
  };
  nextAction?: { label: string; href: string; detail?: string };
  agreement?: { id: number; agreement_number: string; status: string; executed_at?: string };
  legalCase?: { id: number; case_number: string; status: string };
  payments: Array<{ id: number; reference_code: string; purpose: string; total_amount: number; status: string; due_date?: string }>;
  inspections: Array<{ id: number; report_number: string; kind: string; status: string; submitted_at?: string; media_count: number }>;
  maintenance: Array<{ id: number; ticket_number: string; title: string; status: string; priority: string }>;
  timeline: Array<{ event_code: string; title: string; detail?: string; occurred_at: string }>;
};

export default async function TenancyPage({ params }: { params: { id: string } }) {
  let data: TenancyDetail;
  try {
    data = await serverApi<TenancyDetail>(`/tenancies/${params.id}`);
  } catch (error) {
    if (error instanceof ApiError && [403, 404].includes(error.status)) notFound();
    throw error;
  }

  const { tenancy } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Tenancy · {titleCase(tenancy.service_plan)} plan</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">
            <Link href={`/${tenancy.property_slug}`} className="hover:underline">
              {tenancy.property_title}
            </Link>
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {tenancy.locality}, {tenancy.city} · {tenancy.is_owner ? tenancy.tenant_name : tenancy.owner_name}
          </p>
        </div>
        <StatusChip status={tenancy.stage} />
      </div>

      <div className="rounded-card border border-line bg-white p-5">
        <JourneyBar stage={tenancy.stage} />
      </div>

      {data.nextAction ? (
        <Link
          href={data.nextAction.href}
          className="flex items-center justify-between gap-4 rounded-card border border-ochre/40 bg-ochre-soft px-5 py-4 transition-colors hover:border-ochre"
        >
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-ochre">Next step</p>
            <p className="mt-1 font-display text-lg font-semibold">{data.nextAction.label}</p>
            {data.nextAction.detail ? (
              <p className="mt-0.5 text-[14px] text-muted">{data.nextAction.detail}</p>
            ) : null}
          </div>
          <span aria-hidden className="font-mono text-xl text-ochre">
            →
          </span>
        </Link>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px] lg:items-start">
        <div className="space-y-6">
          {/* -------------------------------------------------------- record */}
          <Card>
            <CardHeader
              title="Tenancy record"
              note="Everything that has happened, in order, with timestamps."
            />
            <div className="p-5">
              <RecordSpine events={data.timeline} />
            </div>
          </Card>

          {/* ---------------------------------------------------- inspections */}
          <Card>
            <CardHeader
              title="Condition reports"
              action={
                tenancy.stage === 'CHECK_IN_PENDING' || tenancy.stage === 'MOVE_OUT' ? (
                  <Button href={`/dashboard/condition-report/new?tenancyId=${tenancy.id}`} size="sm">
                    Start report
                  </Button>
                ) : null
              }
            />
            <div className="p-5">
              {data.inspections.length ? (
                <ul className="divide-y divide-line">
                  {data.inspections.map((inspection) => (
                    <li key={inspection.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div>
                        <Link
                          href={`/dashboard/condition-report/${inspection.id}`}
                          className="font-medium hover:underline"
                        >
                          {inspection.kind === 'CHECK_IN' ? 'Day 1 condition report' : titleCase(inspection.kind)}
                        </Link>
                        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                          {inspection.report_number} · {inspection.media_count} attachments
                          {inspection.submitted_at ? ` · ${shortDate(inspection.submitted_at)}` : ''}
                        </p>
                      </div>
                      <StatusChip status={inspection.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title="No condition report yet"
                  body="The Day 1 report is what a deposit deduction gets checked against later. Record it as soon as you have the keys."
                />
              )}
            </div>
          </Card>

          {/* ---------------------------------------------------- maintenance */}
          <Card>
            <CardHeader
              title="Maintenance"
              action={
                <Button href={`/dashboard/maintenance/new?tenancyId=${tenancy.id}`} size="sm" variant="secondary">
                  Raise a request
                </Button>
              }
            />
            <div className="p-5">
              {data.maintenance.length ? (
                <ul className="divide-y divide-line">
                  {data.maintenance.map((request) => (
                    <li key={request.id} className="flex items-center justify-between gap-3 py-3 first:pt-0">
                      <div>
                        <p className="font-medium">{request.title}</p>
                        <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                          {request.ticket_number} · {titleCase(request.priority)}
                        </p>
                      </div>
                      <StatusChip status={request.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[15px] text-muted">No maintenance requests on this tenancy.</p>
              )}
            </div>
          </Card>
        </div>

        {/* ------------------------------------------------------------ rail */}
        <aside className="space-y-4 lg:sticky lg:top-6">
          <Card className="p-5">
            <p className="eyebrow">Terms</p>
            <dl className="mt-2">
              <DataRow label="Rent" value={`${inr(tenancy.rent_amount)}/month`} />
              <DataRow label="Deposit" value={inr(tenancy.deposit_amount)} />
              {tenancy.maintenance_amount ? (
                <DataRow label="Maintenance" value={inr(tenancy.maintenance_amount)} />
              ) : null}
              <DataRow label="Start" value={shortDate(tenancy.start_date)} />
              <DataRow label="End" value={shortDate(tenancy.end_date)} />
              <DataRow
                label="Lock-in"
                value={tenancy.lock_in_months ? `${tenancy.lock_in_months} months` : '—'}
              />
              <DataRow
                label="Notice"
                value={tenancy.notice_period_days ? `${tenancy.notice_period_days} days` : '—'}
              />
              <DataRow label="Renewal due" value={shortDate(tenancy.renewal_due_on)} />
            </dl>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Agreement</p>
            {data.agreement ? (
              <>
                <p className="mt-2 font-mono text-[13px]">{data.agreement.agreement_number}</p>
                <div className="mt-2">
                  <StatusChip status={data.agreement.status} />
                </div>
                {data.agreement.status === 'EXECUTED' ? (
                  <div className="mt-4 flex justify-center">
                    <Seal
                      label="Executed"
                      sub={data.agreement.executed_at ? shortDate(data.agreement.executed_at) : undefined}
                    />
                  </div>
                ) : (
                  <p className="mt-3 text-[13px] text-muted">
                    Not in force until every party has signed.
                  </p>
                )}
                <Button
                  href={`/dashboard/agreements/${data.agreement.id}`}
                  variant="secondary"
                  size="sm"
                  full
                  className="mt-4"
                >
                  {data.agreement.status === 'AWAITING_SIGNATURES' ? 'Review and sign' : 'Open agreement'}
                </Button>
              </>
            ) : (
              <p className="mt-2 text-[14px] text-muted">
                Our legal team drafts the agreement once the case is opened. You will be notified when
                there is something to review.
              </p>
            )}
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Payments</p>
            {data.payments.length ? (
              <ul className="mt-2 divide-y divide-line">
                {data.payments.slice(0, 6).map((payment) => (
                  <li key={payment.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px]">{titleCase(payment.purpose)}</p>
                      <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                        {payment.reference_code}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-[14px]">{inr(payment.total_amount)}</p>
                      <StatusChip status={payment.status} />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[14px] text-muted">Nothing raised yet.</p>
            )}
            <Button href="/dashboard/payments" variant="ghost" size="sm" full className="mt-3">
              Full ledger
            </Button>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Something wrong?</p>
            <p className="mt-2 text-[14px] text-muted">
              If you and the other party disagree about deposit deductions or damage, open a dispute. Our
              team reviews the record and helps you reach a resolution — we do not decide it for you.
            </p>
            <Button
              href={`/dashboard/disputes/new?tenancyId=${tenancy.id}`}
              variant="secondary"
              size="sm"
              full
              className="mt-3"
            >
              Open a dispute
            </Button>
          </Card>
        </aside>
      </div>
    </div>
  );
}
