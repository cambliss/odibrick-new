'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

export type HeaderUser = {
  fullName: string;
  roles: string[];
} | null;

const NAV_LINKS = [
  { href: '/properties?listingType=RENT', label: 'Rent', hideMd: false },
  { href: '/properties?listingType=SALE', label: 'Buy', hideMd: false },
  { href: '/how-it-works', label: 'How it works', hideMd: true },
  { href: '/for-agents', label: 'For agents', hideMd: true },
  { href: '/support', label: 'Support', hideMd: false },
];

export function LandingHeader({ me }: { me: HeaderUser }) {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const firstLinkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      firstLinkRef.current?.focus();
    }, 10);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        menuBtnRef.current?.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  const closeMenu = () => {
    setOpen(false);
    menuBtnRef.current?.focus();
  };

  const firstName = me?.fullName?.trim().split(/\s+/)[0] || 'Account';
  const initials = (me?.fullName ?? '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <header
      className={`sticky top-0 z-40 bg-brand-green font-brand-sans text-white transition-shadow duration-200 ${
        scrolled ? 'shadow-header-scroll' : ''
      }`}
    >
      <div className="mx-auto flex h-[66px] w-[calc(100%-36px)] max-w-[1400px] items-center justify-between gap-5 md:h-[76px] md:w-[calc(100%-48px)]">
        <Link
          href="/"
          aria-label="Odibrick home"
          className="shrink-0 rounded-md py-1 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-brick"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/odibrick-logo-white.png"
            alt="Odibrick — Property, Protected"
            width={360}
            height={92}
            className="h-[30px] w-auto md:h-[38px]"
          />
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1.5 md:flex">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${
                item.hideMd ? 'hidden lg:inline-flex' : 'inline-flex'
              } h-10 items-center whitespace-nowrap rounded-pill px-[13px] text-[15px] font-medium text-[#e5eee9] transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick`}
            >
              {item.label}
            </Link>
          ))}

          {me ? (
            <Link
              href="/dashboard"
              className="ml-2 inline-flex h-[38px] items-center gap-2 whitespace-nowrap rounded-pill bg-white pl-1.5 pr-4 text-[14px] font-semibold text-brand-green transition-colors hover:bg-brand-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
            >
              <span
                aria-hidden="true"
                className="grid h-7 w-7 place-items-center rounded-full bg-brand-sage font-brand-label text-[12px] font-semibold text-brand-green"
              >
                {initials || 'OB'}
              </span>
              <span>{firstName}’s dashboard</span>
            </Link>
          ) : (
            <>
              <Link
                href="/register?role=OWNER"
                className="inline-flex h-10 items-center whitespace-nowrap rounded-pill px-[13px] text-[15px] font-medium text-[#e5eee9] transition-colors hover:bg-white/[0.08] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
              >
                List property
              </Link>
              <Link
                href="/login"
                className="ml-1 inline-flex h-[38px] items-center justify-center whitespace-nowrap rounded-pill bg-white px-[15px] text-[14px] font-semibold text-brand-green transition-colors hover:bg-brand-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
              >
                Sign in
              </Link>
            </>
          )}
        </nav>

        <button
          ref={menuBtnRef}
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls="mobile-nav-drawer"
          aria-label={open ? 'Close menu' : 'Open menu'}
          className="grid h-[42px] w-[42px] place-items-center rounded-full text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick md:hidden"
        >
          {open ? (
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          ) : (
            <svg
              className="h-6 w-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          )}
        </button>
      </div>

      {open ? (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
          className="fixed inset-x-0 bottom-0 top-[66px] z-30 flex flex-col overflow-y-auto border-t border-white/15 bg-brand-green px-5 pb-8 pt-4 md:hidden"
        >
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {NAV_LINKS.map((item, idx) => (
              <Link
                key={item.href}
                ref={idx === 0 ? firstLinkRef : undefined}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-2 py-3 text-[16px] font-medium text-[#e5eee9] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
              >
                {item.label}
              </Link>
            ))}

            <div className="my-3 border-t border-white/15" />

            {me ? (
              <Link
                href="/dashboard"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-pill bg-white px-5 text-[15px] font-semibold text-brand-green transition-colors hover:bg-brand-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
              >
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 place-items-center rounded-full bg-brand-sage font-brand-label text-[12px] font-semibold text-brand-green"
                >
                  {initials || 'OB'}
                </span>
                <span>{firstName}’s dashboard</span>
              </Link>
            ) : (
              <div className="flex flex-col gap-2.5 pt-1">
                <Link
                  href="/register?role=OWNER"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-12 items-center justify-center rounded-pill border border-white/30 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
                >
                  List property
                </Link>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className="inline-flex h-12 items-center justify-center rounded-pill bg-white px-5 text-[15px] font-semibold text-brand-green transition-colors hover:bg-brand-sage-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-brick"
                >
                  Sign in
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={closeMenu}
              className="mt-4 self-start px-2 py-2 text-[14px] text-brand-sage underline underline-offset-4"
            >
              Close menu
            </button>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
