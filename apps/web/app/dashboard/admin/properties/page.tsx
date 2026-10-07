import { Metadata } from 'next';
import { AdminPropertiesClient } from './admin-properties-client';

export const metadata: Metadata = {
  title: 'Property Management | Odibrick Management',
  description: 'Review, manage and govern all properties listed on Odibrick.',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default function AdminPropertiesPage() {
  return <AdminPropertiesClient />;
}
