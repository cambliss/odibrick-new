import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { AdminReportsClient } from './admin-reports-client';

export const metadata: Metadata = {
  title: 'Management Reports & Exports — Odibrick Management',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  const initialReport = await serverApi<any>('/admin/reports/properties').catch(() => null);

  return (
    <div className="space-y-6">
      <AdminReportsClient initialReport={initialReport} />
    </div>
  );
}
