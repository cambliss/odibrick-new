import { Metadata } from 'next';
import { AdminAutomationClient } from './admin-automation-client';

export const metadata: Metadata = {
  title: 'Automation & Workflow Control Centre | Admin | Odibrick',
  description: 'Management orchestration for business events, workflow rules, automated actions, failure resolution, and SLA escalations.',
  robots: { index: false, follow: false },
};

export default function AdminAutomationPage() {
  return <AdminAutomationClient />;
}
