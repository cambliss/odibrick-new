import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { ProfileApiPayload, ProfileForm } from './profile-form';

export const metadata: Metadata = {
  title: 'My Profile',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const profileData = await serverApi<ProfileApiPayload>('/me/profile');

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Step 4 · Account setup</p>
        <h1 className="mt-1 font-display text-3xl font-semibold">My Profile</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Manage your personal details, preferred city and localities, and role-specific preferences.
        </p>
      </div>

      <ProfileForm initialData={profileData} />
    </div>
  );
}
