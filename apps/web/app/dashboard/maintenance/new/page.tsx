import type { Metadata } from 'next';
import Link from 'next/link';
import { serverApi } from '@/lib/api';
import { Card, CardHeader } from '@/components/ui';
import { ReportIssueForm } from './report-issue-form';

export const metadata: Metadata = { title: 'Report Maintenance Issue', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Tenancy = {
  id: number;
  stage: string;
  rent_amount: number;
  property_title: string;
  locality?: string;
  city?: string;
  counterparty_name?: string;
};

export default async function NewMaintenancePage({
  searchParams,
}: {
  searchParams?: Promise<{ tenancyId?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const tenancyId = params.tenancyId ? Number(params.tenancyId) : undefined;

  const tenanciesRes = await serverApi<{ data: Tenancy[] }>('/tenancies');

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <Link href="/dashboard/maintenance" className="hover:text-ink hover:underline">
          Maintenance
        </Link>
        <span>/</span>
        <span className="text-ink">Report an issue</span>
      </div>

      <div>
        <h1 className="font-display text-3xl font-semibold">Report a maintenance issue</h1>
        <p className="mt-1 text-[15px] text-muted">
          Submit repair and maintenance requests for your active tenancy. The owner will review and update you with next steps.
        </p>
      </div>

      <Card>
        <CardHeader title="Issue details" />
        <div className="p-6">
          <ReportIssueForm
            tenancies={tenanciesRes.data}
            initialTenancyId={tenancyId}
          />
        </div>
      </Card>
    </div>
  );
}
