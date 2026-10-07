import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { serverApi, serverApiOrNull, ApiError } from '@/lib/api';
import { AgreementView, type AgreementDetailPayload } from './agreement-view';

export const metadata: Metadata = { title: 'Review Agreement · Odibrick', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Me = {
  id: number;
  fullName: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export default async function AgreementDetailPage({ params }: { params: { id: string } }) {
  const me = await serverApiOrNull<Me>('/auth/me');
  if (!me) {
    redirect(`/login?next=/dashboard/agreements/${params.id}`);
  }

  let data: AgreementDetailPayload;
  try {
    data = await serverApi<AgreementDetailPayload>(`/agreements/${params.id}`);
  } catch (error) {
    if (error instanceof ApiError && [403, 404].includes(error.status)) {
      notFound();
    }
    throw error;
  }

  return <AgreementView data={data} currentUser={me} />;
}
