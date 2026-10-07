import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { FinanceControlCentreClient } from './finance-client';

export const metadata: Metadata = {
  title: 'Finance Control Centre · Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminFinancePage() {
  const initialOverview = await serverApi<any>('/admin/finance/overview', {
    query: { period: 'this_month' },
  });

  return (
    <div className="space-y-6">
      <FinanceControlCentreClient initialOverview={initialOverview} />
    </div>
  );
}
