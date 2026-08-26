import Link from 'next/link';
import { Button } from '@/components/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <Link href="/" className="font-display text-xl font-semibold">
          Odibrick
        </Link>
        <p className="mt-8 font-mono text-eyebrow uppercase text-muted">Error 404</p>
        <h1 className="mt-3 font-display text-4xl font-semibold">This page is not on the record</h1>
        <p className="mt-3 text-[15px] text-muted">
          The listing may have been rented, archived or removed. Search again and you will probably find
          something similar in the same locality.
        </p>
        <div className="mt-7 flex justify-center gap-3">
          <Button href="/properties">Search homes</Button>
          <Button href="/" variant="secondary">
            Go home
          </Button>
        </div>
      </div>
    </main>
  );
}
