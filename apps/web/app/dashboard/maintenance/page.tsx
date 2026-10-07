import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Button, Card, CardHeader, EmptyState, StatTile, StatusChip } from '@/components/ui';
import { relative, shortDate, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Maintenance & Repairs', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type MaintenanceRow = {
  id: number;
  public_id: string;
  ticket_number: string;
  category: string;
  priority: string;
  title: string;
  status: string;
  cost_bearer: string;
  estimated_cost?: number;
  final_cost?: number;
  scheduled_for?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
  raised_by: number;
  tenancy_id: number;
  property_id: number;
  property_title: string;
  locality?: string;
  city?: string;
  raised_by_name: string;
  owner_name?: string;
  tenant_name?: string;
};

export default async function MaintenancePage({
  searchParams,
}: {
  searchParams?: Promise<{ status?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const activeStatus = params.status || 'ALL';

  const result = await serverApi<{ data: MaintenanceRow[]; meta: { total: number } }>('/maintenance', {
    query: { status: activeStatus !== 'ALL' ? activeStatus : undefined, perPage: 50 },
  });

  const allItems = result.data;
  const openCount = allItems.filter((m) => ['OPEN', 'OWNER_REVIEW'].includes(m.status)).length;
  const inProgressCount = allItems.filter((m) => ['APPROVED', 'SCHEDULED', 'IN_PROGRESS'].includes(m.status)).length;
  const resolvedCount = allItems.filter((m) => ['COMPLETED', 'VERIFIED', 'CLOSED'].includes(m.status)).length;

  const priorityColor = (priority: string) => {
    switch (priority) {
      case 'EMERGENCY':
        return 'bg-crimson-soft text-crimson-deep border-crimson/30';
      case 'HIGH':
        return 'bg-ochre-soft text-ochre-deep border-ochre/30';
      case 'LOW':
        return 'bg-paper text-muted border-line';
      default:
        return 'bg-seal-soft text-seal-deep border-seal/30';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Maintenance & Repairs</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted">
            Track and resolve repair requests with your landlord or tenant. Every action is timestamped with an audit trail.
          </p>
        </div>
        <Button href="/dashboard/maintenance/new">
          Report an issue
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Total requests" value={result.meta.total} />
        <StatTile label="Open / in review" value={openCount} />
        <StatTile label="In progress" value={inProgressCount} />
        <StatTile label="Resolved / closed" value={resolvedCount} />
      </div>

      <Card>
        <CardHeader
          title="Service requests"
          note="Select any request to view activity, messages, and resolution status."
        />
        <div className="p-5">
          {allItems.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wider text-muted">
                    <th className="pb-2 pr-4 font-normal">Ticket</th>
                    <th className="pb-2 pr-4 font-normal">Issue</th>
                    <th className="pb-2 pr-4 font-normal">Category</th>
                    <th className="pb-2 pr-4 font-normal">Priority</th>
                    <th className="pb-2 pr-4 font-normal">Property</th>
                    <th className="pb-2 pr-4 font-normal">Status</th>
                    <th className="pb-2 pr-4 font-normal">Created</th>
                    <th className="pb-2 text-right font-normal">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {allItems.map((item) => (
                    <tr key={item.id} className="hover:bg-sand-light/40 transition-colors">
                      <td className="py-3 pr-4 font-mono text-[12px] font-medium text-ink">
                        {item.ticket_number}
                      </td>
                      <td className="py-3 pr-4">
                        <Link href={`/dashboard/maintenance/${item.id}`} className="font-medium text-ink hover:underline">
                          {item.title}
                        </Link>
                        {item.tenant_name && item.owner_name && (
                          <div className="text-[11px] text-muted">
                            Raised by {item.raised_by_name}
                          </div>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        <span className="inline-block rounded px-2 py-0.5 text-[11px] font-medium bg-sand-light text-ink border border-line">
                          {titleCase(item.category)}
                        </span>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-block rounded px-2 py-0.5 text-[11px] font-medium border ${priorityColor(item.priority)}`}>
                          {titleCase(item.priority)}
                        </span>
                      </td>
                      <td className="py-3 pr-4 text-muted">
                        <div>{item.property_title}</div>
                        {item.locality && (
                          <div className="text-[11px] text-muted">{item.locality}, {item.city}</div>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <StatusChip status={item.status} />
                      </td>
                      <td className="py-3 pr-4 text-muted whitespace-nowrap">
                        {shortDate(item.created_at)}
                      </td>
                      <td className="py-3 text-right">
                        <Button href={`/dashboard/maintenance/${item.id}`} size="sm" variant="secondary">
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No maintenance requests"
              body="When you or your tenant raise a maintenance or repair issue, it will appear here."
              action={
                <Button href="/dashboard/maintenance/new" size="sm">
                  Report an issue
                </Button>
              }
            />
          )}
        </div>
      </Card>
    </div>
  );
}
