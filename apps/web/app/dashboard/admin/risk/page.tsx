import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { AdminRiskClient } from './admin-risk-client';

export const metadata: Metadata = {
  title: 'Trust & Risk Control Centre — Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminRiskPage() {
  const [overview, casesData, signalsData, eventsData, suspiciousPayments, suspiciousAccounts, suspiciousListings] = await Promise.all([
    serverApi<any>('/admin/risk/overview').catch(() => null),
    serverApi<any>('/admin/risk/cases?pageSize=50').catch(() => ({ data: [], total: 0, page: 1, pageSize: 50 })),
    serverApi<any>('/admin/risk/signals?pageSize=50').catch(() => ({ data: [], total: 0, page: 1, pageSize: 50 })),
    serverApi<any>('/admin/risk/security-events?pageSize=50').catch(() => ({ data: [], total: 0, page: 1, pageSize: 50 })),
    serverApi<any>('/admin/risk/suspicious/payments').catch(() => []),
    serverApi<any>('/admin/risk/suspicious/accounts').catch(() => []),
    serverApi<any>('/admin/risk/suspicious/listings').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <AdminRiskClient
        initialOverview={overview}
        initialCases={casesData?.data || []}
        initialCasesTotal={casesData?.total || 0}
        initialSignals={signalsData?.data || []}
        initialEvents={eventsData?.data || []}
        initialPayments={suspiciousPayments || []}
        initialAccounts={suspiciousAccounts || []}
        initialListings={suspiciousListings || []}
      />
    </div>
  );
}
