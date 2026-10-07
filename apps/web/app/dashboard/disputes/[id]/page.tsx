import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi, serverApiOrNull } from '@/lib/api';
import { DisputeWorkspace } from './dispute-workspace';

export const metadata: Metadata = { title: 'Dispute Workspace', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type AuthMe = {
  id: number;
  fullName: string;
  roles: string[];
  permissions: string[];
};

export default async function DisputeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const disputeId = Number(id);
  if (isNaN(disputeId)) notFound();

  const [me, data] = await Promise.all([
    serverApi<AuthMe>('/auth/me'),
    serverApiOrNull<any>(`/disputes/${disputeId}`),
  ]);

  if (!data || !data.dispute) {
    notFound();
  }

  return (
    <DisputeWorkspace
      data={data}
      currentUser={me}
    />
  );
}
