import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { Card, CardHeader, EmptyState, StatTile, StatusChip } from '@/components/ui';
import { PayButton } from './pay-button';
import { inr, shortDate, titleCase } from '@/lib/format';

export const metadata: Metadata = { title: 'Payments', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Payment = {
  id: number;
  reference_code: string;
  purpose: string;
  amount: number;
  tax_amount: number;
  total_amount: number;
  status: string;
  settlement_status: string;
  due_date?: string;
  paid_at?: string;
  property_title?: string;
  reference?: string;
  direction: 'IN' | 'OUT';
};

export default async function PaymentsPage() {
  const result = await serverApi<{ data: Payment[]; meta: { total: number } }>('/payments', {
    query: { perPage: 50 },
  });

  const due = result.data.filter((p) => ['DUE', 'FAILED', 'INITIATED'].includes(p.status));
  const settled = result.data.filter((p) => !['DUE', 'FAILED', 'INITIATED'].includes(p.status));

  const totalOut = due.filter((p) => p.direction === 'OUT').reduce((sum, p) => sum + Number(p.total_amount), 0);
  const receivedIn = settled
    .filter((p) => p.direction === 'IN' && p.status === 'PAID')
    .reduce((sum, p) => sum + Number(p.total_amount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Payments</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Every entry has a reference number and a transaction trail. Odibrick does not hold your money —
          payments settle directly between the parties or through a licensed payment provider.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Due from you" value={inr(totalOut)} note={`${due.length} open items`} />
        <StatTile label="Received" value={inr(receivedIn)} />
        <StatTile label="Ledger entries" value={result.meta.total} />
      </div>

      <Card>
        <CardHeader title="Due now" note={due.length ? 'Oldest first.' : undefined} />
        <div className="p-5">
          {due.length ? (
            <ul className="divide-y divide-line">
              {due.map((payment) => (
                <li key={payment.id} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{titleCase(payment.purpose)}</p>
                      <StatusChip status={payment.status} />
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wider text-muted">
                      {payment.reference_code}
                      {payment.property_title ? ` · ${payment.property_title}` : ''}
                      {payment.due_date ? ` · due ${shortDate(payment.due_date)}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="tabular font-display text-xl font-semibold">{inr(payment.total_amount)}</p>
                    {payment.direction === 'OUT' ? (
                      <PayButton paymentId={payment.id} reference={payment.reference_code} />
                    ) : (
                      <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                        Awaiting payer
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-muted">Nothing is due right now.</p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="History" />
        <div className="p-5">
          {settled.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-[14px]">
                <thead>
                  <tr className="border-b border-line text-left font-mono text-[10px] uppercase tracking-wider text-muted">
                    <th className="pb-2 pr-4 font-normal">Reference</th>
                    <th className="pb-2 pr-4 font-normal">Purpose</th>
                    <th className="pb-2 pr-4 font-normal">Property</th>
                    <th className="pb-2 pr-4 font-normal">Date</th>
                    <th className="pb-2 pr-4 text-right font-normal">Amount</th>
                    <th className="pb-2 text-right font-normal">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {settled.map((payment) => (
                    <tr key={payment.id}>
                      <td className="py-2.5 pr-4 font-mono text-[12px]">{payment.reference_code}</td>
                      <td className="py-2.5 pr-4">{titleCase(payment.purpose)}</td>
                      <td className="py-2.5 pr-4 text-muted">{payment.property_title ?? '—'}</td>
                      <td className="py-2.5 pr-4 text-muted">{shortDate(payment.paid_at)}</td>
                      <td className="py-2.5 pr-4 text-right tabular">
                        {payment.direction === 'OUT' ? '−' : '+'}
                        {inr(payment.total_amount)}
                      </td>
                      <td className="py-2.5 text-right">
                        <StatusChip status={payment.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              title="No settled payments yet"
              body="Once a deposit or a month's rent is recorded, it appears here with its bank or gateway reference."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
