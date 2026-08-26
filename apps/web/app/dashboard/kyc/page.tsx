import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { Card, CardHeader, StatusChip } from '@/components/ui';
import { KycForm } from './kyc-form';
import { Seal } from '@/components/verification-seal';
import { shortDate } from '@/lib/format';

export const metadata: Metadata = { title: 'Identity verification', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

const REASONS: Record<string, string> = {
  listing: 'You need a verified identity before publishing a property.',
  application: 'You need a verified identity before applying for a home.',
};

export default async function KycPage({ searchParams }: { searchParams: { reason?: string } }) {
  const profile = await serverApi<{
    account: { full_name: string };
    kyc?: { status: string; reviewed_at?: string; expires_at?: string };
  }>('/me/profile');

  const status = profile.kyc?.status ?? 'NOT_STARTED';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Identity verification</h1>
        <p className="mt-1 max-w-2xl text-[15px] text-muted">
          Both sides of every Odibrick tenancy are verified. It is the reason a badge on this platform
          means something.
        </p>
      </div>

      {searchParams.reason && REASONS[searchParams.reason] ? (
        <p className="rounded-card border border-ochre/40 bg-ochre-soft px-5 py-4 text-[15px]">
          {REASONS[searchParams.reason]}
        </p>
      ) : null}

      {status === 'VERIFIED' ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-6">
            <Seal label="Verified" sub={shortDate(profile.kyc?.reviewed_at)} />
            <div>
              <p className="font-display text-xl font-semibold">Your identity is verified</p>
              <p className="mt-1 text-[15px] text-muted">
                Reviewed by our team on {shortDate(profile.kyc?.reviewed_at)}
                {profile.kyc?.expires_at ? `, valid until ${shortDate(profile.kyc.expires_at)}` : ''}. You
                can list properties and apply for homes.
              </p>
            </div>
          </div>
        </Card>
      ) : status === 'SUBMITTED' || status === 'IN_REVIEW' ? (
        <Card>
          <CardHeader title="In review" action={<StatusChip status={status} />} />
          <div className="p-5">
            <p className="text-[15px] text-muted">
              Our verification team has your documents. This is a person reading them, not an automated
              check, so it usually takes one to two working days. We will notify you either way.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {status === 'REJECTED' ? (
            <p className="rounded-card border border-alert/30 bg-alert/5 px-5 py-4 text-[15px] text-alert">
              Your last submission could not be verified. Check that the name matches your ID exactly and
              that the scan is legible, then submit again.
            </p>
          ) : null}

          <Card>
            <CardHeader
              title="Submit your details"
              note="Stored encrypted. Only the last four digits of your ID are ever shown back to anyone."
            />
            <div className="p-5">
              <KycForm defaultName={profile.account.full_name} />
            </div>
          </Card>

          <Card className="p-5">
            <p className="eyebrow">What we do with this</p>
            <ul className="mt-3 space-y-2 text-[15px] text-muted">
              <li>Our team checks the document against the name on your account.</li>
              <li>The ID number is encrypted at rest; the plain value is never returned by the API.</li>
              <li>Documents live in a private vault — they are never attached to a public listing.</li>
              <li>Access to your documents is logged, including who opened them and when.</li>
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}
