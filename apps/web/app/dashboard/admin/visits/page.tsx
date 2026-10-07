import { Metadata } from 'next';
import { AdminVisitsClient } from './admin-visits-client';

export const metadata: Metadata = {
  title: 'Visit Control Centre | Odibrick Management Operations',
  description: 'Centralized management control, conflict resolution, host assignments, SLA monitoring, and conversion analytics for all property visits.',
};

export default function AdminVisitsPage() {
  return <AdminVisitsClient />;
}
