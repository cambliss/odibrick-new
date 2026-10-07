import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Button, Card, CardHeader, EmptyState, StatTile, StatusChip } from '@/components/ui';
import { inr, relative, shortDate, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Disputes & Resolutions', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type DisputeRow = {
  id: number;
  public_id: string;
  case_number: string;
  category: string;
  summary: string;
  detail?: string;
  amount_claimed?: number;
  status: string;
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  resolution?: string;
  tenancy_id: number;
  tenancy_stage: string;
  property_id: number;
  property_title: string;
  locality?: string;
  city?: string;
  raised_by_name: string;
  against_user_name?: string;
  assigned_to_name?: string;
  legal_case_number?: string;
  legal_case_status?: string;
  evidence_count: number;
};

export default async function DisputesPage({
  searchParams,
}: {
  searchParams?: Promise<{
    status?: string;
    category?: string;
    financialOnly?: string;
    onlyResolved?: string;
    mineOnly?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : {};
  const activeStatus = params.status || 'ALL';
  const activeCategory = params.category || 'ALL';
  const financialOnly = params.financialOnly === 'true';
  const onlyResolved = params.onlyResolved;

  const disputes = await serverApi<DisputeRow[]>('/disputes', {
    query: {
      status: activeStatus !== 'ALL' ? activeStatus : undefined,
      category: activeCategory !== 'ALL' ? activeCategory : undefined,
      financialOnly: financialOnly ? 'true' : undefined,
      onlyResolved: onlyResolved !== undefined ? onlyResolved : undefined,
    },
  });

  const allItems = disputes || [];
  const openCount = allItems.filter((d) => ['OPEN', 'EVIDENCE_SUBMITTED', 'UNDER_REVIEW'].includes(d.status)).length;
  const legalCount = allItems.filter((d) => d.status === 'LEGAL_REVIEW').length;
  const proposedCount = allItems.filter((d) => d.status === 'RESOLUTION_PROPOSED').length;
  const resolvedCount = allItems.filter((d) => ['RESOLVED', 'CLOSED'].includes(d.status)).length;

  const getNextAction = (d: DisputeRow) => {
    switch (d.status) {
      case 'OPEN':
        return 'Awaiting evidence submission or initial staff review';
      case 'EVIDENCE_SUBMITTED':
        return 'Evidence pending management evaluation';
      case 'UNDER_REVIEW':
        return 'Odibrick Management active review & investigation';
      case 'LEGAL_REVIEW':
        return `Legal team case review (${d.legal_case_number || 'Legal Case'})`;
      case 'RESOLUTION_PROPOSED':
        return 'Binding resolution proposed — pending finalization';
      case 'RESOLVED':
        return d.amount_claimed ? 'Resolution binding — financial settlement due' : 'Resolution closed';
      case 'CLOSED':
        return 'Dispute closed';
      case 'WITHDRAWN':
        return 'Withdrawn by party';
      default:
        return 'Review in progress';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">Dispute & Resolution Management</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-muted">
            Centralized platform dispute resolution. All evidence, communications, and binding outcomes are governed by Odibrick Management.
          </p>
        </div>
        <Button href="/dashboard/disputes/new">
          Raise a dispute
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="Total cases" value={allItems.length} />
        <StatTile label="Open / in review" value={openCount} />
        <StatTile label="Legal escalation" value={legalCount} />
        <StatTile label="Resolved / closed" value={resolvedCount} />
      </div>

      <Card>
        <CardHeader
          title="Dispute Queue"
          note="Select any dispute to enter the workspace, review evidence, communicate, or track management resolution."
        />

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper/50 px-5 py-3 text-sm">
          <span className="font-mono text-xs uppercase tracking-wider text-muted mr-1">Filter:</span>
          
          {/* Status Tabs */}
          {[
            { label: 'All Cases', value: 'ALL' },
            { label: 'Open', value: 'OPEN' },
            { label: 'Under Review', value: 'UNDER_REVIEW' },
            { label: 'Legal Review', value: 'LEGAL_REVIEW' },
            { label: 'Proposed', value: 'RESOLUTION_PROPOSED' },
            { label: 'Resolved', value: 'RESOLVED' },
            { label: 'Closed', value: 'CLOSED' },
          ].map((tab) => {
            const isActive = activeStatus === tab.value;
            const queryParams = new URLSearchParams();
            if (tab.value !== 'ALL') queryParams.set('status', tab.value);
            if (activeCategory !== 'ALL') queryParams.set('category', activeCategory);
            if (financialOnly) queryParams.set('financialOnly', 'true');
            const href = `/dashboard/disputes?${queryParams.toString()}`;

            return (
              <Link
                key={tab.value}
                href={href}
                className={`rounded-sm px-2.5 py-1 text-xs font-medium transition-colors ${
                  isActive ? 'bg-seal text-white' : 'bg-white text-muted hover:text-ink border border-line'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}

          <div className="ml-auto flex items-center gap-2">
            <Link
              href={
                financialOnly
                  ? `/dashboard/disputes?status=${activeStatus}&category=${activeCategory}`
                  : `/dashboard/disputes?status=${activeStatus}&category=${activeCategory}&financialOnly=true`
              }
              className={`rounded-sm px-2.5 py-1 text-xs font-medium border ${
                financialOnly ? 'bg-amber-100 border-amber-300 text-amber-900 font-semibold' : 'bg-white border-line text-muted hover:text-ink'
              }`}
            >
              💰 Financial Claims Only
            </Link>
          </div>
        </div>

        {allItems.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title="No disputes found"
              body="There are no dispute records matching your current filter criteria."
              action={
                <Button href="/dashboard/disputes/new" variant="secondary" size="sm">
                  Raise a new dispute
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-paper/70 font-mono text-[11px] uppercase tracking-wider text-muted">
                <tr>
                  <th className="px-5 py-3">Case / Category</th>
                  <th className="px-4 py-3">Property & Tenancy</th>
                  <th className="px-4 py-3">Parties</th>
                  <th className="px-4 py-3">Claim Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Assigned Reviewer</th>
                  <th className="px-4 py-3">Next Action</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {allItems.map((d) => (
                  <tr key={d.id} className="hover:bg-paper/40 transition-colors">
                    <td className="px-5 py-3.5">
                      <Link href={`/dashboard/disputes/${d.id}`} className="block group">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-semibold text-seal group-hover:underline">
                            {d.case_number}
                          </span>
                          {d.evidence_count > 0 && (
                            <span className="rounded bg-paper border border-line px-1.5 py-0.2 text-[10px] text-muted">
                              📎 {d.evidence_count}
                            </span>
                          )}
                        </div>
                        <span className="inline-block mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted">
                          {d.category.replace(/_/g, ' ')}
                        </span>
                        <p className="text-xs text-ink truncate max-w-xs mt-0.5">{d.summary}</p>
                      </Link>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink">{d.property_title}</p>
                      <p className="text-xs text-muted">
                        {d.city} · <span className="font-mono uppercase text-[10px]">Tenancy #{d.tenancy_id} ({d.tenancy_stage})</span>
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs text-ink font-medium">Raised: {d.raised_by_name}</p>
                      {d.against_user_name && (
                        <p className="text-xs text-muted">Against: {d.against_user_name}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {d.amount_claimed ? (
                        <span className="font-mono text-xs font-medium tabular text-ink">
                          {inr(d.amount_claimed)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusChip status={d.status} />
                    </td>
                    <td className="px-4 py-3.5">
                      {d.assigned_to_name ? (
                        <span className="text-xs text-ink font-medium">{d.assigned_to_name}</span>
                      ) : (
                        <span className="text-xs text-amber-700 font-mono">Unassigned</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      <p className="text-xs text-muted truncate">{getNextAction(d)}</p>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <Link
                        href={`/dashboard/disputes/${d.id}`}
                        className="inline-flex items-center justify-center rounded-card border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-seal hover:text-seal transition-colors"
                      >
                        Workspace →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
