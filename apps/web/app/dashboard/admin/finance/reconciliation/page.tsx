import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { ReconciliationClient } from './reconciliation-client';

export const metadata: Metadata = {
  title: 'Financial Operations & Reconciliation · Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function FinancialReconciliationPage() {
  const initialOverview = await serverApi<any>('/admin/finance/control-overview').catch(() => null);

  return (
    <div className="space-y-6">
      <ReconciliationClient initialOverview={initialOverview} />
    </div>
  );
}
