import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverApiOrNull } from '@/lib/api';
import { VerifyContactClient, type OtpStatusResponse } from './verify-contact-client';

export const metadata: Metadata = {
  title: 'Verify Email & Mobile — Odibrick',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';

export default async function VerifyContactPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const status = await serverApiOrNull<OtpStatusResponse>('/auth/otp/status');
  if (!status) {
    redirect('/login?next=/verify-contact');
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[960px] items-center justify-between px-5 py-4">
          <Link href="/" className="font-display text-xl font-semibold">
            Odibrick
          </Link>
          <div className="flex items-center gap-4 text-[14px]">
            <Link href="/properties" className="text-muted hover:text-ink">
              Browse homes
            </Link>
            <Link href="/dashboard" className="text-seal hover:underline">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 py-10">
        <div className="mb-6">
          <p className="eyebrow">Step 3 of Onboarding · Contact Verification</p>
          <h1 className="mt-2 font-display text-3xl font-semibold">
            Confirm your email and mobile number
          </h1>
          <p className="mt-2 text-[15px] text-muted">
            Enter the 6-digit one-time passwords (OTPs) for both your email address and mobile number.
            You can browse listings while pending, but both must be verified before sending enquiries,
            booking visits, listing properties, or submitting KYC.
          </p>
        </div>

        <VerifyContactClient initialStatus={status} nextUrl={next ?? '/dashboard'} />
      </main>
    </div>
  );
}
