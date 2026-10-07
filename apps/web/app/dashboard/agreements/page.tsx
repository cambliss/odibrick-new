import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverApiOrNull } from '@/lib/api';
import { Badge, Card, CardHeader, EmptyState, StatusChip } from '@/components/ui';
import { shortDate, inr } from '@/lib/format';

export const metadata: Metadata = { title: 'My Agreements · Odibrick', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type AgreementItem = {
  id: number;
  agreement_number: string;
  status: string;
  current_version: number;
  property_title: string;
  locality: string;
  city: string;
  rent_amount: number;
  deposit_amount: number;
  counterparty_name: string;
  role: 'OWNER' | 'TENANT';
  my_signature_status: 'PENDING' | 'SIGNED';
};

export default async function AgreementsListPage() {
  const me = await serverApiOrNull<any>('/auth/me');
  if (!me) redirect('/login?next=/dashboard/agreements');

  // Query my tenancies to get agreements list
  const tenancies = await serverApiOrNull<any[]>('/tenancies');

  const agreements = (tenancies || [])
    .filter((t) => t.agreement_id)
    .map((t) => ({
      id: t.agreement_id,
      agreement_number: `Agreement #${t.agreement_id}`,
      status: t.agreement_status,
      property_title: t.title,
      locality: t.locality,
      city: t.city,
      rent_amount: t.rent_amount,
      deposit_amount: t.deposit_amount,
      counterparty_name: me.id === t.owner_user_id ? t.tenant_name : t.owner_name,
      role: me.id === t.owner_user_id ? 'OWNER' : 'TENANT',
    }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Agreements</h1>
        <p className="mt-1 text-[15px] text-muted">
          Legally reviewed rental and lease agreements, signatures, and execution records.
        </p>
      </div>

      <Card>
        <CardHeader title="Your Agreements" />
        <div className="p-5">
          {agreements.length ? (
            <div className="space-y-4">
              {agreements.map((agr) => (
                <Link
                  key={agr.id}
                  href={`/dashboard/agreements/${agr.id}`}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line p-4 transition-colors hover:border-seal"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-sm font-semibold">{agr.agreement_number}</p>
                      <StatusChip status={agr.status} />
                    </div>
                    <p className="mt-1 text-sm font-medium text-ink">{agr.property_title}</p>
                    <p className="text-xs text-muted">
                      {agr.locality}, {agr.city} · Rent: {inr(agr.rent_amount)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-seal font-medium">Review & Sign →</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No active agreements"
              body="When an owner accepts an application and our legal team completes the draft, your agreement will appear here for review and digital signature."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
