import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui';
import { CreateDisputeForm } from './create-dispute-form';

export const metadata: Metadata = { title: 'Raise a Dispute', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Tenancy = {
  id: number;
  stage: string;
  rent_amount: number;
  deposit_amount: number;
  property_title: string;
  locality?: string;
  city?: string;
  counterparty_name?: string;
};

export default async function NewDisputePage({
  searchParams,
}: {
  searchParams?: Promise<{ tenancyId?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const tenancyId = params.tenancyId ? Number(params.tenancyId) : undefined;

  let tenancies: Tenancy[] = [];
  try {
    const res = await serverApi<{ data: Tenancy[] }>('/tenancies');
    tenancies = res?.data || [];
  } catch (err) {
    tenancies = [];
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Link href="/dashboard/disputes" className="hover:text-ink hover:underline">
          Disputes
        </Link>
        <span>/</span>
        <span className="text-ink">Raise a dispute</span>
      </div>

      <div>
        <h1 className="font-display text-3xl font-semibold">Raise a Dispute</h1>
        <p className="mt-1 text-[15px] text-muted">
          Submit a dispute for formal administrative review. Odibrick Management reviews all submitted evidence and provides structured resolution governance.
        </p>
      </div>

      <Card>
        <CardHeader
          title="Case Information & Claim"
          note="All fields are auditable and communicated to the other party and platform review officers."
        />
        <div className="p-6">
          <CreateDisputeForm
            tenancies={tenancies}
            initialTenancyId={tenancyId}
          />
        </div>
      </Card>
    </div>
  );
}
