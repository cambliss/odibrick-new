import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { AdminOperationsClient } from './admin-operations-client';

export const metadata: Metadata = {
  title: 'Operations Control Tower — Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminOperationsPage() {
  const [overview, tasksData, exceptions] = await Promise.all([
    serverApi<any>('/admin/operations/overview').catch(() => null),
    serverApi<any>('/admin/operations/tasks?limit=50').catch(() => ({ data: [], total: 0, page: 1, limit: 50, totalPages: 1 })),
    serverApi<any>('/admin/operations/exceptions').catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <AdminOperationsClient
        initialOverview={overview}
        initialTasks={tasksData?.data || []}
        initialTotal={tasksData?.total || 0}
        initialExceptions={exceptions}
      />
    </div>
  );
}
