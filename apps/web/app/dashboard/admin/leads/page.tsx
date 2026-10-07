import { Metadata } from 'next';
import { AdminLeadsClient } from './admin-leads-client';

export const metadata: Metadata = {
  title: 'Lead Control Centre & Conversion Governance | Odibrick Management',
  description: 'Manage platform-wide lead pipeline, assignment & reassignment, SLA stale monitoring, spam detection, and conversion analytics.',
};

export default function AdminLeadsPage() {
  return <AdminLeadsClient />;
}
