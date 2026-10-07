import { Metadata } from 'next';
import { AdminMessagesClient } from './admin-messages-client';

export const metadata: Metadata = {
  title: 'Communication Control Centre | Odibrick Admin',
  description: 'Global conversation supervision, SLA monitoring, handler assignment, and internal operational notes.',
  robots: { index: false, follow: false },
};

export default function AdminMessagesPage() {
  return <AdminMessagesClient />;
}
