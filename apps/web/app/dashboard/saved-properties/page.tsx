import type { Metadata } from 'next';
import { serverApiOrNull } from '@/lib/api';
import { SavedPropertiesClient } from './saved-properties-client';

export const metadata: Metadata = {
  title: 'Saved Properties — Odibrick',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SavedPropertiesPage() {
  const initialData = await serverApiOrNull<any>('/customer/saved-properties');

  return (
    <div className="space-y-6">
      <SavedPropertiesClient initialData={initialData} />
    </div>
  );
}
