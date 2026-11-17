import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

const display = localFont({
  src: [
    { path: './fonts/fraunces-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/fraunces-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/fraunces-latin-700-normal.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-display',
  display: 'swap',
});

const body = localFont({
  src: [
    { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-body',
  display: 'swap',
});

const mono = localFont({
  src: [
    { path: './fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
  variable: '--font-mono',
  display: 'swap',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://odibrick.com';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Odibrick — property, protected',
    template: '%s · Odibrick',
  },
  description:
    'Find a verified home, complete the agreement with a real lawyer, pay through a recorded ledger, and document the property from day one.',
  openGraph: {
    type: 'website',
    siteName: 'Odibrick',
    locale: 'en_IN',
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
