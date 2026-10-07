import type { Metadata } from 'next';
import { serverApiOrNull } from '@/lib/api';
import { SavedSearchesClient } from './saved-searches-client';

export const metadata: Metadata = {
  title: 'Saved Searches & Alerts — Odibrick',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function SavedSearchesPage() {
  const initialSearches = await serverApiOrNull<any[]>('/customer/saved-searches');

  return (
    <div className="space-y-6">
      <SavedSearchesClient initialSearches={initialSearches || []} />
    </div>
  );
}
