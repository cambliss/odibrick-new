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
  searchParams: Promise<{ tenancyId?: string; kind?: string }>;
}) {
  const sp = await searchParams;
  if (!sp.tenancyId) redirect('/dashboard/tenancies');

  const result = await serverApi<{ id: number }>('/inspections', {
    method: 'POST',
    body: JSON.stringify({
      tenancyId: Number(sp.tenancyId),
      kind: sp.kind ?? 'CHECK_IN',
    }),
  });

  redirect(`/dashboard/condition-report/${result.id}`);
}
