import type { Metadata } from 'next';
import { serverApi, serverApiOrNull } from '@/lib/api';
import { Card, CardHeader, StatusChip } from '@/components/ui';
import { KycForm } from './kyc-form';
import { canResubmitKyc, isKycInProgress } from './kyc-logic';
import { Seal } from '@/components/verification-seal';
import { shortDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Identity verification', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const REASONS: Record<string, string> = {
  listing: 'You need a verified identity before publishing a property.',
  application: 'You need a verified identity before applying for a home.',
};

export default async function KycPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const sp = await searchParams;
  const [profile, kycState] = await Promise.all([
    serverApi<{
      account: { full_name: string };
      kyc?: { status: string; reviewed_at?: string; expires_at?: string };
    }>('/me/profile'),
    serverApiOrNull<{
      status: string;
      submissionEnabled?: boolean;
      record: {
        status?: string;
        rejection_reason?: string | null;
        reviewed_at?: string | null;
        expires_at?: string | null;
      } | null;
    }>('/kyc/me'),
  ]);

  const status = kycState?.status ?? profile.kyc?.status ?? 'NOT_STARTED';
  const submissionEnabled = kycState?.submissionEnabled === true;
  const reviewedAt = kycState?.record?.reviewed_at ?? profile.kyc?.reviewed_at;
  const expiresAt = kycState?.record?.expires_at ?? profile.kyc?.expires_at;
  const rejectionReason = kycState?.record?.rejection_reason ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Identity verification</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Both sides of every Odibrick tenancy are verified. It is the reason a badge on this platform
          means something.
        </p>
      </div>

      {sp.reason && REASONS[sp.reason] ? (
        <p className="rounded-card border border-ochre/40 bg-ochre-soft px-5 py-4 text-[15px]">
          {REASONS[sp.reason]}
        </p>
      ) : null}

      {status === 'VERIFIED' ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-6">
            <Seal label="Verified" sub={shortDate(reviewedAt ?? undefined)} />
            <div>
              <p className="font-display text-xl font-semibold">Your identity is verified</p>
              <p className="mt-1 text-[15px] text-muted">
                Reviewed by our team on {shortDate(reviewedAt ?? undefined)}
                {expiresAt ? `, valid until ${shortDate(expiresAt)}` : ''}. You
                can list properties and apply for homes.
              </p>
            </div>
          </div>
        </Card>
      ) : isKycInProgress(status) ? (
        <Card>
          <CardHeader title="In review" action={<StatusChip status={status} />} />
          <div className="p-5">
            <p className="text-[15px] text-muted">
              Our verification team has your passport and supporting documents. This is reviewed by our
              compliance team, so it usually takes one to two working days. We will notify you either way.
            </p>
          </div>
        </Card>
      ) : status === 'SUSPENDED' ? (
        <Card>
          <CardHeader title="Verification suspended" action={<StatusChip status="SUSPENDED" />} />
          <div className="p-5 space-y-2">
            <p className="text-[15px] text-alert">
              Your identity verification is currently suspended and cannot be resubmitted directly.
            </p>
            {rejectionReason ? (
              <p className="text-[14px] text-muted">Reason: {rejectionReason}</p>
            ) : null}
            <p className="text-[14px] text-muted">Please contact Odibrick support for assistance.</p>
          </div>
        </Card>
      ) : canResubmitKyc(status) ? (
        !submissionEnabled ? (
          <Card>
            <CardHeader
              title="KYC verification temporarily unavailable"
              action={<StatusChip status="PENDING" />}
            />
            <div className="p-5 space-y-2">
              <p className="text-[15px] text-muted">
                KYC verification is temporarily unavailable while we finalize our compliance review.
                Existing verified accounts, authentication, and property workflows remain active.
              </p>
              <p className="text-[14px] text-muted">
                Please check back shortly to complete your identity verification.
              </p>
            </div>
          </Card>
        ) : (
        <>
          {status === 'REJECTED' || status === 'DOCUMENTS_PENDING' || status === 'EXPIRED' ? (
            <p className="rounded-card border border-alert/30 bg-alert/5 px-5 py-4 text-[15px] text-alert">
              {status === 'EXPIRED'
                ? 'Your previous verification has expired. Please submit your current passport details.'
                : status === 'DOCUMENTS_PENDING'
                  ? 'Additional or clearer documents were requested by our compliance team.'
                  : 'Your last submission could not be verified. Check that your name matches your passport exactly and that the scan is legible, then submit again.'}
              {rejectionReason ? ` (${rejectionReason})` : ''}
            </p>
          ) : null}

          <Card>
            <CardHeader
              title="Submit your passport details"
              note="Your passport number is never stored in plain text — only a keyed hash and the last four characters are retained."
            />
            <div className="p-5">
              <KycForm defaultName={profile.account.full_name} />
            </div>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">What we do with this</p>
            <ul className="mt-3 space-y-2 text-[15px] text-muted">
              <li>Our team checks your passport details against the name on your account.</li>
              <li>Your passport number is never stored in plain text or returned by the API.</li>
              <li>Documents live in a private vault — they are never attached to a public listing.</li>
              <li>Access to your documents is logged, including who opened them and when.</li>
            </ul>
          </Card>
        </>
        )
      ) : (
        <Card>
          <CardHeader title="Verification status" action={<StatusChip status={status} />} />
          <div className="p-5">
            <p className="text-[15px] text-muted">
              Current verification status: {status}. Please contact support if you need help.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
