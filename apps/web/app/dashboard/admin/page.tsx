import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Card, CardHeader, StatTile } from '@/components/ui';
import { inr, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Control centre', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Kpis = {
  totals: Record<string, number>;
  revenueSeries: Array<{ month: string; commission: number; marketing: number; services: number; total: number }>;
  funnel: { views: number; enquiries: number; applications: number; tenancies: number };
  cities: Array<{ city: string; properties: number; active: number; avg_rent: number }>;
  usersByRole: Array<{ role: string; count: number }>;
};

type GovernanceOverview = {
  pendingKyc: Array<{ id: number; legal_name: string; subject_type: string; id_type: string; submitted_at: string; user_id: number; full_name: string; email: string }>;
  pendingProperties: Array<{ id: number; title: string; city: string; locality: string; rent_amount: number; created_at: string; owner_name: string }>;
  unassignedLegalCases: Array<{ id: number; case_number: string; case_type: string; status: string; priority: string; created_at: string; owner_name: string; tenant_name: string }>;
  openDisputes: Array<{ id: number; case_number: string; category: string; status: string; amount_claimed: number; summary: string; created_at: string; raised_by_name: string }>;
  moveOutTenancies: Array<{ id: number; public_id: string; stage: string; rent_amount: number; deposit_amount: number; property_title: string; owner_name: string; tenant_name: string }>;
  recentAuditEvents: Array<{ id: number; action: string; object_type: string; object_id: number; created_at: string; actor_name?: string; actor_role?: string }>;
};

export default async function AdminPage() {
  const [kpis, governance] = await Promise.all([
    serverApi<Kpis>('/admin/kpis'),
    serverApi<GovernanceOverview>('/admin/governance-overview').catch(() => null),
  ]);

  const maxRevenue = Math.max(...kpis.revenueSeries.map((r) => Number(r.total)), 1);
  const funnelMax = Math.max(kpis.funnel.views, 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Control centre</h1>
        <p className="mt-1 text-[15px] text-muted">
          Central authority and governance over all platform operations, transactions, verifications, and compliance.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Users" value={kpis.totals?.total_users ?? 0} />
        <StatTile label="Live listings" value={kpis.totals?.active_properties ?? 0} />
        <StatTile label="Active tenancies" value={kpis.totals?.active_tenancies ?? 0} />
        <StatTile
          label="Awaiting verification"
          value={kpis.totals?.pending_verifications ?? 0}
          note="Listings and KYC"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-card border border-red-200/50 bg-gradient-to-r from-red-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-red-700 font-semibold bg-white px-2 py-0.5 rounded border border-red-200">
                Security
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Trust & Risk</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Fraud investigation, security telemetry, risk signal engine, and suspicious activity triage.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/admin/risk"
              className="inline-block rounded-button bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-red-700"
            >
              Open Risk Centre →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-blue-200/50 bg-gradient-to-r from-blue-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-blue-700 font-semibold bg-white px-2 py-0.5 rounded border border-blue-200">
                Ecosystem
              </span>
              <h3 className="font-display text-base font-semibold text-ink">External Integrations</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Provider adapters for Email, SMS, WhatsApp, Payment Gateways, KYC, E-Sign, and Webhooks.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/admin/integrations"
              className="inline-block rounded-button bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-blue-700"
            >
              Open Integrations →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-indigo-200/50 bg-gradient-to-r from-indigo-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-indigo-700 font-semibold bg-white px-2 py-0.5 rounded border border-indigo-200">
                Intelligence
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Analytics & BI</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Real-time executive KPIs, property demand funnels, financial classification, and report exports.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/admin/analytics"
              className="inline-block rounded-button bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-indigo-700"
            >
              Open BI Engine →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-rose-200/50 bg-gradient-to-r from-rose-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-rose-700 font-semibold bg-white px-2 py-0.5 rounded border border-rose-200">
                Operations
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Control Tower</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Centralized work queue, task assignments, SLA tracking, escalations, and cross-domain exception triage.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/admin/operations"
              className="inline-block rounded-button bg-rose-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-rose-700"
            >
              Open Control Tower →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-seal/20 bg-gradient-to-r from-seal-soft/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-seal-deep font-semibold bg-white px-2 py-0.5 rounded border border-seal-soft">
                Management
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Finance Centre</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Platform-wide financial ledger, overdue monitoring, commission queue, and revenue tracking.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/admin/finance"
              className="inline-block rounded-button bg-seal px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-seal-deep"
            >
              Open Finance →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-emerald-200/50 bg-gradient-to-r from-emerald-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-emerald-700 font-semibold bg-white px-2 py-0.5 rounded border border-emerald-200">
                Inventory
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Property Management</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Review, manage and govern all properties listed on Odibrick across Owners, Agents, and Builders.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/admin/properties"
              className="inline-block rounded-button bg-seal px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-seal-deep"
            >
              Manage Properties →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-indigo-200/50 bg-gradient-to-r from-indigo-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-indigo-700 font-semibold bg-white px-2 py-0.5 rounded border border-indigo-200">
                Marketplace
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Inventory & Ads</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Inventory moderation, duplicate detection, visibility tiers, monetization packages, and attribution.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/admin/marketplace"
              className="inline-block rounded-button bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-indigo-700"
            >
              Open Marketplace →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-blue-200/50 bg-gradient-to-r from-blue-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-blue-700 font-semibold bg-white px-2 py-0.5 rounded border border-blue-200">
                Leads
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Lead Control</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Lead assignments, SLA stale monitoring, qualification pipelines, and spam moderation.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/admin/leads"
              className="inline-block rounded-button bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-blue-700"
            >
              Open Leads →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-teal-200/50 bg-gradient-to-r from-teal-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-teal-700 font-semibold bg-white px-2 py-0.5 rounded border border-teal-200">
                Visits
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Visit Control</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Walkthrough scheduling, host assignments, conflict overrides, SLA reminders, and conversion.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/admin/visits"
              className="inline-block rounded-button bg-teal-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-teal-700"
            >
              Open Visits →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-purple-200/50 bg-gradient-to-r from-purple-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-purple-700 font-semibold bg-white px-2 py-0.5 rounded border border-purple-200">
                Messages
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Comms Hub</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Platform-wide communication supervision, internal operational notes, SLA tracking, and resolution.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/admin/messages"
              className="inline-block rounded-button bg-purple-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-purple-700"
            >
              Open Comms →
            </Link>
          </div>
        </div>

        <div className="rounded-card border border-amber-200/50 bg-gradient-to-r from-amber-50/70 via-surface to-surface p-5 flex flex-col justify-between gap-4 shadow-subtle">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-amber-700 font-semibold bg-white px-2 py-0.5 rounded border border-amber-200">
                Automation
              </span>
              <h3 className="font-display text-base font-semibold text-ink">Engine & Rules</h3>
            </div>
            <p className="text-[13px] text-muted mt-1">
              Event bus, deterministic workflow rules, SLA escalations, notifications, and failure recovery.
            </p>
          </div>
          <div>
            <Link
              href="/dashboard/admin/automation"
              className="inline-block rounded-button bg-amber-600 px-3 py-1.5 text-xs font-medium text-white shadow-soft transition-colors hover:bg-amber-700"
            >
              Open Automation →
            </Link>
          </div>
        </div>
      </div>

      {/* Operational Governance Queues */}
      {governance && (
        <div className="space-y-6">
          <div className="border-b border-line pb-2">
            <h2 className="font-display text-xl font-semibold text-ink">Operational Governance & Supervision Queues</h2>
            <p className="text-xs font-mono uppercase tracking-wider text-muted mt-0.5">
              Real-time intervention requirements across compliance, legal, disputes, and move-out workflows
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Pending KYC Queue */}
            <Card>
              <CardHeader
                title="Identity Verifications (KYC)"
                note={`${governance.pendingKyc.length} submissions awaiting review.`}
                action={
                  <Link href="/dashboard/kyc" className="text-xs font-mono uppercase tracking-wider text-seal hover:underline">
                    View Queue →
                  </Link>
                }
              />
              <div className="p-5">
                {governance.pendingKyc.length ? (
                  <ul className="divide-y divide-line">
                    {governance.pendingKyc.slice(0, 5).map((item) => (
                      <li key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-[14px]">
                        <div>
                          <p className="font-medium text-ink">{item.legal_name || item.full_name}</p>
                          <p className="text-xs text-muted font-mono">{item.id_type} · {item.email}</p>
                        </div>
                        <Link
                          href="/dashboard/kyc"
                          className="rounded-sm border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal"
                        >
                          Review
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-muted">No pending identity verification submissions.</p>
                )}
              </div>
            </Card>

            {/* Unassigned Legal Cases */}
            <Card>
              <CardHeader
                title="Unassigned Legal Cases"
                note={`${governance.unassignedLegalCases.length} legal cases require advocate assignment.`}
                action={
                  <Link href="/dashboard/legal" className="text-xs font-mono uppercase tracking-wider text-seal hover:underline">
                    Legal Board →
                  </Link>
                }
              />
              <div className="p-5">
                {governance.unassignedLegalCases.length ? (
                  <ul className="divide-y divide-line">
                    {governance.unassignedLegalCases.slice(0, 5).map((c) => (
                      <li key={c.id} className="py-2.5 flex items-center justify-between gap-3 text-[14px]">
                        <div>
                          <p className="font-mono text-xs font-semibold text-seal">{c.case_number}</p>
                          <p className="text-xs text-muted">Owner: {c.owner_name} · Tenant: {c.tenant_name}</p>
                        </div>
                        <Link
                          href={`/dashboard/legal/${c.id}`}
                          className="rounded-sm border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal"
                        >
                          Assign
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-muted">All active legal cases are assigned.</p>
                )}
              </div>
            </Card>

            {/* Open Disputes Queue */}
            <Card>
              <CardHeader
                title="Open Disputes & Settlement Conflicts"
                note={`${governance.openDisputes.length} disputes requiring administrative review.`}
                action={
                  <Link href="/dashboard/disputes" className="text-xs font-mono uppercase tracking-wider text-seal hover:underline">
                    View Queue →
                  </Link>
                }
              />
              <div className="p-5">
                {governance.openDisputes.length ? (
                  <ul className="divide-y divide-line">
                    {governance.openDisputes.slice(0, 5).map((d) => (
                      <li key={d.id} className="py-2.5 flex items-center justify-between gap-3 text-[14px]">
                        <Link href={`/dashboard/disputes/${d.id}`} className="min-w-0 flex-1 hover:opacity-80">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-semibold text-alert">{d.case_number}</span>
                            <span className="text-xs text-muted font-mono uppercase">[{d.category}]</span>
                          </div>
                          <p className="text-xs text-muted truncate mt-0.5">{d.summary}</p>
                        </Link>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-medium tabular">
                            {inr(d.amount_claimed)}
                          </span>
                          <Link
                            href={`/dashboard/disputes/${d.id}`}
                            className="rounded-sm border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal"
                          >
                            Review
                          </Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-muted">No open disputes requiring platform intervention.</p>
                )}
              </div>
            </Card>

            {/* Move-Out & Settlement Oversight */}
            <Card>
              <CardHeader
                title="Active Move-Out & Settlements"
                note={`${governance.moveOutTenancies.length} tenancies in move-out stage.`}
              />
              <div className="p-5">
                {governance.moveOutTenancies.length ? (
                  <ul className="divide-y divide-line">
                    {governance.moveOutTenancies.slice(0, 5).map((t) => (
                      <li key={t.id} className="py-2.5 flex items-center justify-between gap-3 text-[14px]">
                        <div>
                          <p className="font-medium text-ink">{t.property_title}</p>
                          <p className="text-xs text-muted">Deposit: {inr(t.deposit_amount)} · Tenant: {t.tenant_name}</p>
                        </div>
                        <Link
                          href={`/dashboard/tenancy/${t.id}`}
                          className="rounded-sm border border-line bg-paper px-2.5 py-1 text-xs font-medium hover:border-seal"
                        >
                          View
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-muted">No tenancies currently in move-out settlement.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* Analytics & Metrics */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* revenue — a plain bar chart drawn in the ledger language */}
        <Card>
          <CardHeader title="Revenue, last 12 months" note="Settled payments only." />
          <div className="p-5">
            {kpis.revenueSeries.length ? (
              <ul className="space-y-2.5">
                {kpis.revenueSeries.map((row) => (
                  <li key={row.month} className="flex items-center gap-3">
                    <span className="w-16 font-mono text-[11px] uppercase tracking-wider text-muted">
                      {row.month}
                    </span>
                    <span className="h-4 flex-1 overflow-hidden rounded-sm bg-paper">
                      <span
                        className="block h-full bg-seal"
                        style={{ width: `${(Number(row.total) / maxRevenue) * 100}%` }}
                      />
                    </span>
                    <span className="w-24 text-right tabular text-[13px]">{inr(row.total, true)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[15px] text-muted">No settled payments in the last twelve months.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Funnel, last 30 days" />
          <div className="p-5">
            <ul className="space-y-3">
              {[
                ['Property views', kpis.funnel.views],
                ['Enquiries', kpis.funnel.enquiries],
                ['Applications', kpis.funnel.applications],
                ['Tenancies created', kpis.funnel.tenancies],
              ].map(([label, value]) => (
                <li key={String(label)}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[14px]">{label}</span>
                    <span className="tabular font-medium">{Number(value).toLocaleString('en-IN')}</span>
                  </div>
                  <span className="mt-1 block h-2 overflow-hidden rounded-sm bg-paper">
                    <span
                      className="block h-full bg-ochre"
                      style={{ width: `${(Number(value) / funnelMax) * 100}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[13px] text-muted">
              View-to-tenancy conversion:{' '}
              {kpis.funnel.views ? ((kpis.funnel.tenancies / kpis.funnel.views) * 100).toFixed(2) : '0.00'}%
            </p>
          </div>
        </Card>

        <Card>
          <CardHeader title="Cities" />
          <div className="p-5">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wider text-muted">
                  <th className="pb-2 font-normal">City</th>
                  <th className="pb-2 text-right font-normal">Listings</th>
                  <th className="pb-2 text-right font-normal">Live</th>
                  <th className="pb-2 text-right font-normal">Avg rent</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {kpis.cities.map((city) => (
                  <tr key={city.city}>
                    <td className="py-2">{city.city}</td>
                    <td className="py-2 text-right tabular">{city.properties}</td>
                    <td className="py-2 text-right tabular">{city.active}</td>
                    <td className="py-2 text-right tabular">{inr(city.avg_rent, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader title="Accounts by role" />
          <div className="p-5">
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-[14px]">
              {kpis.usersByRole.map((row) => (
                <li key={row.role} className="flex items-baseline justify-between border-b border-line/70 py-1.5">
                  <span className="text-muted">{titleCase(row.role)}</span>
                  <span className="tabular font-medium">{row.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['/dashboard/admin/users', 'Users and roles', 'Manage permissions and status'],
          ['/dashboard/admin/settings', 'Platform settings', 'Configure platform parameters'],
          ['/dashboard/admin/audit', 'Audit log', 'Complete immutable traceability trail'],
          ['/dashboard/admin/fraud', 'Fraud signals', 'Automated heuristic flags'],
          ['/dashboard/admin/commissions', 'Commission rules', 'Manage pricing and tiers'],
          ['/dashboard/campaigns', 'Campaign board', 'Marketing operations'],
        ].map(([href, label, desc]) => (
          <Link
            key={href}
            href={href}
            className="rounded-card border border-line bg-white px-4 py-4 transition-colors hover:border-seal"
          >
            <p className="font-medium text-ink">{label}</p>
            <p className="text-xs text-muted mt-0.5">{desc}</p>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-wider text-seal">Open →</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

