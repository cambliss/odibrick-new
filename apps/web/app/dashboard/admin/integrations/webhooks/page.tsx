import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { AdminWebhooksClient } from './admin-webhooks-client';

export const metadata: Metadata = {
  title: 'Webhook Control Centre — Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminWebhooksPage() {
  const webhooksData = await serverApi<any>('/admin/integrations/webhooks?pageSize=50').catch(() => ({
    data: [],
    total: 0,
    page: 1,
    pageSize: 50,
  }));

  return (
    <div className="space-y-6">
      <AdminWebhooksClient
        initialWebhooks={webhooksData?.data || []}
        initialTotal={webhooksData?.total || 0}
      />
    </div>
  );
}
