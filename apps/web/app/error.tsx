'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the server logs; the visitor never sees a stack trace.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center px-5">
      <div className="max-w-md text-center">
        <p className="font-mono text-eyebrow uppercase text-muted">Something went wrong</p>
        <h1 className="mt-3 font-display text-3xl font-semibold">We could not load this page</h1>
        <p className="mt-3 text-[15px] text-muted">
          The problem is on our side, not yours. Try again, and if it keeps happening our support team can
          look into it with the reference below.
        </p>
        {error.digest ? (
          <p className="mt-4 font-mono text-[12px] text-muted">Reference {error.digest}</p>
        ) : null}
        <div className="mt-7 flex justify-center gap-3">
          <Button onClick={reset}>Try again</Button>
          <Button href="/support" variant="secondary">
            Contact support
          </Button>
        </div>
      </div>
    </main>
  );
}
