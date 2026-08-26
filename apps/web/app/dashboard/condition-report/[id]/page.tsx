import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi, ApiError } from '@/lib/api';
import { Badge, Button, Card, CardHeader, DataRow, StatusChip } from '@/components/ui';
import { Seal } from '@/components/verification-seal';
import { ConditionReportWizard } from './condition-report-wizard';
import { AcknowledgeReport } from './acknowledge-report';
import { dateTime, shortDate, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Condition report', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Detail = {
  inspection: {
    id: number;
    report_number: string;
    kind: string;
    status: string;
    conducted_by: number;
    conducted_by_name: string;
    conducted_role: string;
    property_title: string;
    locality: string;
    city: string;
    tenancy_id: number;
    submitted_at?: string;
    owner_ack_at?: string;
    tenant_ack_at?: string;
    overall_condition?: string;
    electricity_reading?: string;
    water_reading?: string;
    gas_reading?: string;
  };
  items: Array<{
    id: number;
    room: string;
    element: string;
    condition_rating: string;
    damage_type: string;
    notes?: string;
    flagged: number;
  }>;
  media: Array<{ id: number; caption?: string; captured_at?: string; received_at: string }>;
  comparison?: {
    deteriorated: Array<{ room: string; element: string; before: string; after: string; notes?: string }>;
    unchanged: number;
    note: string;
  };
};

export default async function ConditionReportPage({ params }: { params: { id: string } }) {
  let data: Detail;
  try {
    data = await serverApi<Detail>(`/inspections/${params.id}`);
  } catch (error) {
    if (error instanceof ApiError && [403, 404].includes(error.status)) notFound();
    throw error;
  }

  const { inspection } = data;
  const me = await serverApi<{ id: number }>('/auth/me');

  // A draft opens straight into the wizard for whoever started it.
  if (inspection.status === 'DRAFT' && inspection.conducted_by === me.id) {
    const checklist = await serverApi<Array<{ room: string; elements: string[] }>>('/inspections/checklist');
    return (
      <div className="space-y-6">
        <div>
          <p className="eyebrow">{inspection.report_number}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">
            {inspection.kind === 'MOVE_OUT' ? 'Move-out condition report' : 'Day 1 condition report'}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            {inspection.property_title} · {inspection.locality}, {inspection.city}
          </p>
        </div>
        <ConditionReportWizard
          inspectionId={inspection.id}
          checklist={checklist}
          kind={inspection.kind}
          initialItems={data.items.map((item) => ({
            room: item.room,
            element: item.element,
            conditionRating: item.condition_rating,
            damageType: item.damage_type,
            notes: item.notes,
          }))}
        />
      </div>
    );
  }

  const rooms = Array.from(new Set(data.items.map((i) => i.room)));
  const fullyAcknowledged = !!inspection.owner_ack_at && !!inspection.tenant_ack_at;
  const needsMyAck =
    inspection.status !== 'DRAFT' && inspection.conducted_by !== me.id && !fullyAcknowledged;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow">{inspection.report_number}</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">
            {inspection.kind === 'MOVE_OUT' ? 'Move-out condition report' : 'Day 1 condition report'}
          </h1>
          <p className="mt-1 text-[15px] text-muted">
            <Link href={`/dashboard/tenancy/${inspection.tenancy_id}`} className="hover:underline">
              {inspection.property_title}
            </Link>{' '}
            · recorded by {inspection.conducted_by_name} ({titleCase(inspection.conducted_role)})
          </p>
        </div>
        <StatusChip status={inspection.status} />
      </div>

      {needsMyAck ? <AcknowledgeReport inspectionId={inspection.id} /> : null}

      {data.comparison ? (
        <Card>
          <CardHeader
            title="Compared with the Day 1 record"
            note={`${data.comparison.deteriorated.length} items changed, ${data.comparison.unchanged} unchanged.`}
          />
          <div className="p-5">
            {data.comparison.deteriorated.length ? (
              <ul className="divide-y divide-line">
                {data.comparison.deteriorated.map((change, index) => (
                  <li key={index} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0">
                    <div>
                      <p className="font-medium">
                        {titleCase(change.room)} · {titleCase(change.element)}
                      </p>
                      {change.notes ? <p className="text-[13px] text-muted">{change.notes}</p> : null}
                    </div>
                    <p className="font-mono text-[12px] uppercase tracking-wider">
                      <span className="text-muted">{change.before}</span>
                      <span aria-hidden className="mx-2">
                        →
                      </span>
                      <span className="text-alert">{change.after}</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px]">Nothing has deteriorated against the Day 1 record.</p>
            )}
            <p className="mt-5 rounded-card border border-line bg-paper px-4 py-3 text-[13px] text-muted">
              {data.comparison.note}
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
        <Card>
          <CardHeader title="What was recorded" note={`${data.items.length} items across ${rooms.length} rooms.`} />
          <div className="divide-y divide-line">
            {rooms.map((room) => (
              <div key={room} className="p-5">
                <p className="font-mono text-[11px] uppercase tracking-wider text-seal">{titleCase(room)}</p>
                <ul className="mt-3 space-y-2">
                  {data.items
                    .filter((item) => item.room === room)
                    .map((item) => (
                      <li key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <span className="text-[15px]">{titleCase(item.element)}</span>
                          {item.notes ? (
                            <span className="ml-2 text-[13px] text-muted">— {item.notes}</span>
                          ) : null}
                        </div>
                        <Badge tone={item.flagged ? 'alert' : 'seal'}>
                          {item.condition_rating}
                          {item.damage_type !== 'NONE' ? ` · ${item.damage_type.toLowerCase()}` : ''}
                        </Badge>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>

        <aside className="space-y-4 lg:sticky lg:top-6">
          {fullyAcknowledged ? (
            <Card className="p-5 text-center">
              <div className="flex justify-center">
                <Seal label="Acknowledged" sub="Both parties" />
              </div>
              <p className="mt-4 text-left text-[13px] text-muted">
                Both parties have accepted this record. It is the reference point for any deposit question
                at the end of the tenancy.
              </p>
            </Card>
          ) : null}

          <Card className="p-5">
            <p className="eyebrow">Report</p>
            <dl className="mt-2">
              <DataRow label="Submitted" value={inspection.submitted_at ? dateTime(inspection.submitted_at) : '—'} />
              <DataRow label="Tenant signed" value={inspection.tenant_ack_at ? shortDate(inspection.tenant_ack_at) : 'Pending'} />
              <DataRow label="Owner signed" value={inspection.owner_ack_at ? shortDate(inspection.owner_ack_at) : 'Pending'} />
              <DataRow label="Overall" value={titleCase(inspection.overall_condition)} />
              <DataRow label="Attachments" value={data.media.length} />
            </dl>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Meter readings</p>
            <dl className="mt-2">
              <DataRow label="Electricity" value={inspection.electricity_reading ?? '—'} />
              <DataRow label="Water" value={inspection.water_reading ?? '—'} />
              <DataRow label="Gas" value={inspection.gas_reading ?? '—'} />
            </dl>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">Attachments</p>
            <ul className="mt-2 space-y-2 text-[13px]">
              {data.media.slice(0, 8).map((item) => (
                <li key={item.id} className="border-b border-line/70 pb-2 last:border-0">
                  <p>{item.caption ?? 'Photograph'}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">
                    device {item.captured_at ? dateTime(item.captured_at) : 'unknown'} · received{' '}
                    {dateTime(item.received_at)}
                  </p>
                </li>
              ))}
            </ul>
            {data.media.length > 8 ? (
              <p className="mt-2 text-[13px] text-muted">+{data.media.length - 8} more</p>
            ) : null}
          </Card>

          <Button href={`/dashboard/tenancy/${inspection.tenancy_id}`} variant="secondary" full>
            Back to tenancy
          </Button>
        </aside>
      </div>
    </div>
  );
}
