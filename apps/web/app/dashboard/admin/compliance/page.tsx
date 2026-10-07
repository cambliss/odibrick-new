import { Metadata } from 'next';
import { AdminComplianceClient } from './admin-compliance-client';

export const metadata: Metadata = {
  title: 'Compliance & KYC Control Centre | Admin | Odibrick',
  description: 'Management governance for KYC verification, document approvals, expiry monitoring, and exceptions.',
  robots: { index: false, follow: false },
};

export default function AdminCompliancePage() {
  return <AdminComplianceClient />;
}
