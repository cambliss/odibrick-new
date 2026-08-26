import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { serverApi } from '@/lib/api';
import { ListingWizard } from './listing-wizard';

export const metadata: Metadata = { title: 'Add a property', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function NewPropertyPage() {
  // Listing requires a verified identity — checked here so the user is not
  // sent through ten steps only to be refused at the end.
  const profile = await serverApi<{ kyc?: { status: string } }>('/me/profile');
  if (profile.kyc?.status !== 'VERIFIED') redirect('/dashboard/kyc?reason=listing');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Add a property</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Ten short steps. Your draft is saved as you go, and nothing is visible to renters until you
          submit it and our team verifies it.
        </p>
      </div>

      <ListingWizard />
    </div>
  );
}
