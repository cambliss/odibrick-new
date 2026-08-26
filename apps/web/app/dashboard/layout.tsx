import Link from 'next/link';
import { redirect } from 'next/navigation';
import { serverApiOrNull } from '@/lib/api';
import { DashboardNav } from './dashboard-nav';
import { SignOutButton } from './sign-out-button';

type Me = {
  id: number;
  fullName: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const me = await serverApiOrNull<Me>('/auth/me');
  if (!me) redirect('/login?next=/dashboard');

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-5 py-3">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="font-display text-[20px] font-semibold">
              Odibrick
            </Link>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted sm:inline">
              {me.roles.map((r) => r.replace(/_/g, ' ').toLowerCase()).join(' · ')}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/properties" className="text-[14px] text-muted hover:text-ink">
              Browse homes
            </Link>
            <span className="hidden text-[14px] sm:inline">{me.fullName}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-6 px-5 py-6 lg:grid-cols-[220px_1fr]">
        <DashboardNav roles={me.roles} permissions={me.permissions} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
