import type { Metadata } from 'next';
import Link from 'next/link';
import { RegisterForm } from './register-form';

export const metadata: Metadata = {
  title: 'Create an account',
  description: 'Create an Odibrick account as a tenant, owner, agent or builder.',
  robots: { index: false, follow: false },
};

const ROLE_COPY: Record<string, { title: string; body: string }> = {
  TENANT: {
    title: 'Find a home with a record behind it',
    body: 'Apply to verified listings, meet the legal team on a video call before you sign, and document the property on day one.',
  },
  OWNER: {
    title: 'List your property, free',
    body: 'No listing fee and no cap. Verification, a lawyer-drafted agreement, recorded payments and an annual commission only when a tenancy actually starts.',
  },
  AGENT: {
    title: 'Unlimited inventory, free',
    body: 'Upload as many listings as you like. Pay only when you want Cambliss to run a campaign for you.',
  },
  BUILDER: {
    title: 'Put your project in front of buyers',
    body: 'Free project and unit inventory, RERA-verified profile, and enterprise marketing when you need reach.',
  },
};

export default function RegisterPage({
  searchParams,
}: {
  searchParams: { role?: string; next?: string };
}) {
  const role = (searchParams.role ?? 'TENANT').toUpperCase();
  const copy = ROLE_COPY[role] ?? ROLE_COPY.TENANT;

  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      <section className="relative hidden flex-col justify-between bg-ink p-10 text-white lg:flex">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 44px), repeating-linear-gradient(0deg, rgba(255,255,255,0.35) 0 1px, transparent 1px 44px)',
          }}
        />
        <Link href="/" className="relative font-display text-[22px] font-semibold">
          Odibrick
        </Link>
        <div className="relative max-w-md">
          <p className="font-mono text-eyebrow uppercase text-ochre">{role.toLowerCase()} account</p>
          <p className="mt-4 font-display text-3xl font-semibold leading-tight">{copy.title}</p>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">{copy.body}</p>
        </div>
        <p className="relative font-mono text-[11px] uppercase tracking-wider text-white/35">
          Cambliss Pvt. Ltd.
        </p>
      </section>

      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[440px]">
          <Link href="/" className="font-display text-xl font-semibold lg:hidden">
            Odibrick
          </Link>
          <h1 className="mt-6 font-display text-3xl font-semibold lg:mt-0">Create your account</h1>
          <p className="mt-1.5 text-[15px] text-muted">
            Already registered?{' '}
            <Link href="/login" className="font-medium text-seal underline underline-offset-4">
              Sign in
            </Link>
          </p>

          <div className="mt-8">
            <RegisterForm defaultRole={role} next={searchParams.next} />
          </div>
        </div>
      </section>
    </main>
  );
}
