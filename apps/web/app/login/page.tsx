import type { Metadata } from 'next';
import Link from 'next/link';
import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Odibrick account.',
  robots: { index: false, follow: false },
};

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1fr_1.1fr]">
      {/* left: the pitch, kept short */}
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
          <p className="font-mono text-eyebrow uppercase text-ochre">Property, protected</p>
          <p className="mt-4 font-display text-3xl font-semibold leading-tight">
            Your agreements, payments and condition reports live in one place.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">
            Nothing here is reconstructed from memory later. Every step is written down when it happens,
            and both parties can see the same record.
          </p>
        </div>
        <p className="relative font-mono text-[11px] uppercase tracking-wider text-white/35">
          Cambliss Pvt. Ltd.
        </p>
      </section>

      {/* right: the form */}
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[400px]">
          <Link href="/" className="font-display text-xl font-semibold lg:hidden">
            Odibrick
          </Link>
          <h1 className="mt-6 font-display text-3xl font-semibold lg:mt-0">Sign in</h1>
          <p className="mt-1.5 text-[15px] text-muted">
            New here?{' '}
            <Link href="/register" className="font-medium text-seal underline underline-offset-4">
              Create an account
            </Link>
          </p>

          <div className="mt-8">
            <LoginForm next={searchParams.next} />
          </div>
        </div>
      </section>
    </main>
  );
}
