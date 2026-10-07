import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { AdminAnalyticsClient } from './admin-analytics-client';

export const metadata: Metadata = {
  title: 'Analytics & Business Intelligence — Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const [overview, propertiesData, financeData, opsData, complianceData] = await Promise.all([
    serverApi<any>('/admin/analytics/overview').catch(() => null),
    serverApi<any>('/admin/analytics/properties').catch(() => null),
    serverApi<any>('/admin/analytics/finance').catch(() => null),
    serverApi<any>('/admin/analytics/operations').catch(() => null),
    serverApi<any>('/admin/analytics/compliance').catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <AdminAnalyticsClient
        initialOverview={overview}
        initialProperties={propertiesData}
        initialFinance={financeData}
        initialOperations={opsData}
        initialCompliance={complianceData}
      />
    </div>
  );
}
