import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { AdminIntegrationsClient } from './admin-integrations-client';

export const metadata: Metadata = {
  title: 'External Integrations Platform — Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminIntegrationsPage() {
  const [healthSummary, integrations] = await Promise.all([
    serverApi<any>('/admin/integrations/health').catch(() => null),
    serverApi<any[]>('/admin/integrations').catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <AdminIntegrationsClient
        initialHealth={healthSummary}
        initialIntegrations={integrations || []}
      />
    </div>
  );
}
