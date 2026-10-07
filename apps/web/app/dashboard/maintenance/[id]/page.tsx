import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { serverApi, serverApiOrNull } from '@/lib/api';
import { Card, CardHeader, StatusChip, Button } from '@/components/ui';
import { inr, relative, shortDate, titleCase } from '@/lib/format';
import { MaintenanceActions } from './maintenance-actions';

export const metadata: Metadata = { title: 'Maintenance Request', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type MaintenanceDetail = {
  request: {
    id: number;
    public_id: string;
    ticket_number: string;
    category: string;
    priority: string;
    title: string;
    description?: string;
    status: string;
    cost_bearer: string;
    estimated_cost?: number;
    final_cost?: number;
    vendor_name?: string;
    vendor_phone?: string;
    scheduled_for?: string;
    completed_at?: string;
    owner_decision_note?: string;
    created_at: string;
    updated_at: string;
    raised_by: number;
    tenancy_id: number;
    property_id: number;
    property_title: string;
    locality?: string;
    city?: string;
    address_line1?: string;
    pincode?: string;
    raised_by_name: string;
    raised_by_email?: string;
    owner_user_id: number;
    owner_name: string;
    owner_email?: string;
    tenant_user_id: number;
    tenant_name: string;
    tenant_email?: string;
  };
  updates: Array<{
    id: number;
    status_from?: string;
    status_to?: string;
    message?: string;
    created_at: string;
    author: string;
    author_id: number;
  }>;
  documents: Array<{
    id: number;
    title: string;
    size_bytes: number;
    mime_type: string;
    storage_key: string;
    created_at: string;
  }>;
  payments?: Array<{
    id: number;
    reference_code: string;
    purpose: string;
    amount: number;
    tax_amount: number;
    total_amount: number;
    currency: string;
    status: string;
    settlement_status: string;
    due_date?: string;
    paid_at?: string;
    notes?: string;
    payer_name: string;
    payee_name?: string;
  }>;
};

type AuthMe = { id: number; fullName: string; roles: string[] };

export default async function MaintenanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestId = Number(id);
  if (isNaN(requestId)) notFound();

  const [me, data] = await Promise.all([
    serverApi<AuthMe>('/auth/me'),
    serverApiOrNull<MaintenanceDetail>(`/maintenance/${requestId}`),
  ]);

  if (!data || !data.request) {
    notFound();
  }

  const { request, updates, documents, payments = [] } = data;
  const isStaff = me.roles?.some((r) => ['SUPER_ADMIN', 'ADMIN', 'OPERATIONS'].includes(r));

  const priorityBadge = (priority: string) => {
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
      {/* Navigation trail */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <Link href="/dashboard/maintenance" className="hover:text-ink hover:underline">
            Maintenance
          </Link>
          <span>/</span>
          <span className="font-mono text-ink">{request.ticket_number}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-block rounded px-2.5 py-1 text-[12px] font-semibold border ${priorityBadge(request.priority)}`}>
            {titleCase(request.priority)} Priority
          </span>
          <StatusChip status={request.status} />
        </div>
      </div>

      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-semibold">{request.title}</h1>
        <p className="mt-1 text-[15px] text-muted">
          {request.property_title} {request.locality ? `· ${request.locality}, ${request.city}` : ''} · Raised by {request.raised_by_name} on {shortDate(request.created_at)}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Content (2 Columns) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Issue Overview */}
          <Card>
            <CardHeader title="Issue description" />
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 pb-4 border-b border-line sm:grid-cols-3 text-[13px]">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted block">Category</span>
                  <span className="font-medium text-ink mt-0.5 inline-block">{titleCase(request.category)}</span>
                </div>
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted block">Status</span>
                  <span className="font-medium text-ink mt-0.5 inline-block">{titleCase(request.status)}</span>
                </div>
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted block">Cost Bearer</span>
                  <span className="font-medium text-ink mt-0.5 inline-block">{titleCase(request.cost_bearer)}</span>
                </div>
              </div>

              <div>
                <p className="font-mono text-[11px] uppercase tracking-wider text-muted mb-1">Details</p>
                <div className="text-[15px] text-ink whitespace-pre-wrap leading-relaxed">
                  {request.description || 'No detailed description provided.'}
                </div>
              </div>

              {request.owner_decision_note && (
                <div className="rounded-card border border-line bg-sand-light/50 p-3.5 text-[13px] text-ink">
                  <span className="font-semibold block mb-0.5">Owner / Resolution Note:</span>
                  {request.owner_decision_note}
                </div>
              )}
            </div>
          </Card>

          {/* Financial Settlement & Payment Obligations */}
          <Card>
            <CardHeader
              title="Financial Settlement & Cost Allocation"
              note={
                payments.length > 0
                  ? `${payments.length} payment obligation(s) created.`
                  : request.final_cost !== null && request.final_cost !== undefined
                  ? 'Cost confirmed, awaiting management approval.'
                  : 'Pending final repair cost confirmation.'
              }
            />
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-paper/60 p-4 rounded-card border border-line">
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted block">Confirmed Cost</span>
                  <span className="font-semibold text-ink text-base mt-0.5 inline-block">
                    {request.final_cost !== null && request.final_cost !== undefined ? inr(request.final_cost) : '—'}
                  </span>
                </div>
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted block">Cost Bearer</span>
                  <span className="font-medium text-ink mt-0.5 inline-block">{titleCase(request.cost_bearer)}</span>
                </div>
                <div>
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted block">Financial Status</span>
                  <span className="mt-0.5 inline-block">
                    {payments.length > 0 ? (
                      payments.every((p) => p.status === 'PAID') ? (
                        <span className="rounded bg-emerald-100 text-emerald-800 font-mono text-xs px-2 py-0.5 font-semibold">
                          SETTLED
                        </span>
                      ) : (
                        <span className="rounded bg-amber-100 text-amber-800 font-mono text-xs px-2 py-0.5 font-semibold">
                          PAYMENT DUE
                        </span>
                      )
                    ) : request.final_cost !== null && request.final_cost !== undefined ? (
                      <span className="rounded bg-blue-100 text-blue-800 font-mono text-xs px-2 py-0.5 font-semibold">
                        PENDING APPROVAL
                      </span>
                    ) : (
                      <span className="rounded bg-paper text-muted font-mono text-xs px-2 py-0.5 border border-line">
                        UNASSESSED
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* Linked Payment Obligations */}
              {payments.length > 0 && (
                <div className="space-y-2">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted font-semibold">
                    Payment Obligations
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-line text-muted uppercase font-mono tracking-wider">
                          <th className="pb-2">Payment Ref</th>
                          <th className="pb-2">Payer</th>
                          <th className="pb-2">Amount</th>
                          <th className="pb-2">Due Date</th>
                          <th className="pb-2">Status</th>
                          <th className="pb-2">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line">
                        {payments.map((p) => (
                          <tr key={p.id} className="hover:bg-paper/60">
                            <td className="py-2.5 font-mono font-medium text-ink">{p.reference_code}</td>
                            <td className="py-2.5">
                              <span className="font-medium text-ink">{p.payer_name}</span>
                              {p.notes && <p className="text-[10px] text-muted">{p.notes}</p>}
                            </td>
                            <td className="py-2.5 font-semibold text-ink">{inr(p.total_amount)}</td>
                            <td className="py-2.5 font-mono text-muted">{p.due_date ? shortDate(p.due_date) : '—'}</td>
                            <td className="py-2.5"><StatusChip status={p.status} /></td>
                            <td className="py-2.5">
                              <Link
                                href={`/dashboard/payments`}
                                className="rounded border border-line bg-paper px-2.5 py-1 text-[11px] font-medium hover:border-seal text-seal-deep"
                              >
                                View Payment →
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Interactive Actions */}
          <Card>
            <CardHeader title="Actions & Status Controls" />
            <div className="p-6">
              <MaintenanceActions
                request={request}
                currentUserId={me.id}
                isStaff={isStaff}
              />
            </div>
          </Card>

          {/* Attachments */}
          {documents.length > 0 && (
            <Card>
              <CardHeader title="Photos & Attachments" />
              <div className="p-6">
                <ul className="divide-y divide-line">
                  {documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between py-3 first:pt-0">
                      <div>
                        <p className="font-medium text-[14px]">{doc.title}</p>
                        <p className="font-mono text-[11px] text-muted">
                          {(doc.size_bytes / 1024).toFixed(1)} KB · {shortDate(doc.created_at)}
                        </p>
                      </div>
                      <Button href={`/api/documents/${doc.id}/download`} size="sm" variant="secondary">
                        View document
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            </Card>
          )}

          {/* Activity / Audit History */}
          <Card>
            <CardHeader title="Activity History & Audit Trail" />
            <div className="p-6">
              {updates.length ? (
                <ol className="relative border-l border-line ml-3 space-y-6">
                  {updates.map((update, idx) => (
                    <li key={update.id || idx} className="ml-6">
                      <span className="absolute -left-2 flex h-4 w-4 items-center justify-center rounded-full bg-seal text-white ring-4 ring-white text-[9px]">
                        ✓
                      </span>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[14px] font-medium text-ink">
                          {update.author}
                          {update.status_to && update.status_from !== update.status_to && (
                            <span className="text-muted font-normal text-[13px] ml-2">
                              changed status to <span className="font-medium text-ink">{titleCase(update.status_to)}</span>
                            </span>
                          )}
                        </p>
                        <time className="font-mono text-[11px] text-muted">
                          {shortDate(update.created_at)}
                        </time>
                      </div>
                      {update.message && (
                        <p className="mt-1 text-[13px] text-muted bg-sand-light/40 rounded-card p-2.5 border border-line">
                          {update.message}
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[14px] text-muted">No activity records logged yet.</p>
              )}
            </div>
          </Card>
        </div>

        {/* Sidebar (1 Column) */}
        <div className="space-y-6">
          {/* Parties */}
          <Card>
            <CardHeader title="Parties & Tenancy" />
            <div className="p-5 space-y-4 text-[14px]">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Property Owner</p>
                <p className="font-medium text-ink">{request.owner_name}</p>
                {request.owner_email && (
                  <p className="text-[12px] text-muted">{request.owner_email}</p>
                )}
              </div>

              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Tenant</p>
                <p className="font-medium text-ink">{request.tenant_name}</p>
                {request.tenant_email && (
                  <p className="text-[12px] text-muted">{request.tenant_email}</p>
                )}
              </div>

              {request.tenancy_id && (
                <div className="pt-2 border-t border-line">
                  <Link
                    href={`/dashboard/tenancy/${request.tenancy_id}`}
                    className="text-[13px] font-medium text-seal-deep hover:underline"
                  >
                    View Tenancy Record →
                  </Link>
                </div>
              )}
            </div>
          </Card>

          {/* Vendor & Scheduling */}
          {(request.vendor_name || request.scheduled_for || request.final_cost) && (
            <Card>
              <CardHeader title="Repair & Vendor Details" />
              <div className="p-5 space-y-3 text-[14px]">
                {request.vendor_name && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Assigned Vendor</p>
                    <p className="font-medium text-ink">{request.vendor_name}</p>
                    {request.vendor_phone && (
                      <p className="text-[12px] text-muted">{request.vendor_phone}</p>
                    )}
                  </div>
                )}

                {request.scheduled_for && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Scheduled Visit</p>
                    <p className="font-medium text-ink">{shortDate(request.scheduled_for)}</p>
                  </div>
                )}

                {request.final_cost !== undefined && request.final_cost !== null && (
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Repair Cost</p>
                    <p className="tabular font-medium text-ink">{inr(request.final_cost)}</p>
                    <p className="text-[11px] text-muted">Borne by: {titleCase(request.cost_bearer)}</p>
                  </div>
                )}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
