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

export default async function AdminPage() {
  const kpis = await serverApi<Kpis>('/admin/kpis');
  const maxRevenue = Math.max(...kpis.revenueSeries.map((r) => Number(r.total)), 1);
  const funnelMax = Math.max(kpis.funnel.views, 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Control centre</h1>
        <p className="mt-1 text-[15px] text-muted">
          Every figure here is computed from the database at request time. Nothing on this page is a
          placeholder.
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

      {/* <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['/dashboard/admin/users', 'Users and roles'],
          ['/dashboard/admin/settings', 'Platform settings'],
          ['/dashboard/admin/audit', 'Audit log'],
          ['/dashboard/admin/fraud', 'Fraud signals'],
          ['/dashboard/admin/commissions', 'Commission rules'],
          ['/dashboard/campaigns', 'Campaign board'],
        ].map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className="rounded-card border border-line bg-white px-4 py-4 transition-colors hover:border-seal"
          >
            <p className="font-medium">{label}</p>
            <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted">Open →</p>
          </Link>
        ))}
      </div> */}
    </div>
  );
}
