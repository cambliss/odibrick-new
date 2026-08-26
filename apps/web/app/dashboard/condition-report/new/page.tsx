import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * Starting a report is a POST, so this route opens (or resumes) the draft and
 * sends the user straight into the wizard.
 */
export default async function StartConditionReportPage({
  searchParams,
}: {
  searchParams: { tenancyId?: string; kind?: string };
}) {
  if (!searchParams.tenancyId) redirect('/dashboard/tenancies');

  const result = await serverApi<{ id: number }>('/inspections', {
    method: 'POST',
    body: JSON.stringify({
      tenancyId: Number(searchParams.tenancyId),
      kind: searchParams.kind ?? 'CHECK_IN',
    }),
  });

  redirect(`/dashboard/condition-report/${result.id}`);
}
