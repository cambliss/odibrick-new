import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/api';
import { AdminRiskDetailClient } from './admin-risk-detail-client';

export const metadata: Metadata = {
  title: 'Risk Case Investigation — Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

interface PageProps {
  params: { id: string };
}

export default async function AdminRiskCaseDetailPage({ params }: PageProps) {
  const caseData = await serverApi<any>(`/admin/risk/cases/${params.id}`).catch(() => null);

  if (!caseData) {
    notFound();
  }

  return (
    <div className="space-y-6">
      <AdminRiskDetailClient initialCase={caseData} />
    </div>
  );
}
