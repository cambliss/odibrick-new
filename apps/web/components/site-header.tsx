import Link from 'next/link';
import { serverApiOrNull } from '@/lib/api';

type Me = { fullName: string; roles: string[] };

export async function SiteHeader({ transparent }: { transparent?: boolean }) {
  const me = await serverApiOrNull<Me>('/auth/me');

  return (
    <header className={`${transparent ? 'absolute inset-x-0 top-0 z-20' : 'border-b border-line bg-white'}`}>
      <div className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className={`font-display text-[22px] font-semibold tracking-tight ${transparent ? 'text-white' : 'text-ink'}`}>
            Odibrick
          </span>
          <span className={`hidden font-mono text-[10px] uppercase tracking-[0.2em] sm:inline ${transparent ? 'text-white/60' : 'text-muted'}`}>
            Property, protected
          </span>
        </Link>

        <nav className={`flex items-center gap-1 text-[14px] ${transparent ? 'text-white/90' : 'text-ink'}`}>
          <Link href="/properties?listingType=RENT" className="rounded-card px-3 py-2 hover:underline">
            Rent
          </Link>
          <Link href="/properties?listingType=SALE" className="hidden rounded-card px-3 py-2 hover:underline sm:block">
            Buy
          </Link>
          <Link href="/for-agents" className="hidden rounded-card px-3 py-2 hover:underline md:block">
            For agents
          </Link>
          {me ? (
            <Link
              href="/dashboard"
              className={`ml-2 rounded-card px-4 py-2 font-medium ${
                transparent ? 'bg-white text-ink' : 'bg-seal text-white hover:bg-seal-deep'
              }`}
            >
              {me.fullName.split(' ')[0]}’s dashboard
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-card px-3 py-2 hover:underline">
                Sign in
              </Link>
              <Link
                href="/register"
                className={`ml-1 rounded-card px-4 py-2 font-medium ${
                  transparent ? 'bg-white text-ink' : 'bg-seal text-white hover:bg-seal-deep'
                }`}
              >
                List a property
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
