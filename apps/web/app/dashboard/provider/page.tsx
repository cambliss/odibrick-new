import type { Metadata } from 'next';
import { serverApiOrNull } from '@/lib/api';
import { ProviderActionCentreClient } from './provider-action-centre-client';

export const metadata: Metadata = {
  title: 'Provider Action Centre — Odibrick',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ProviderActionCentrePage() {
  const [actionCentre, performance, demandInsights] = await Promise.all([
    serverApiOrNull<any>('/provider/action-centre'),
    serverApiOrNull<any[]>('/provider/listing-performance'),
    serverApiOrNull<any>('/provider/demand-insights'),
  ]);

  return (
    <div className="space-y-6">
      <ProviderActionCentreClient
        actionCentre={actionCentre}
        performance={performance || []}
        demandInsights={demandInsights}
      />
    </div>
  );
}
