'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const signOut = async () => {
    setBusy(true);
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={busy}
      className="rounded-card border border-line px-3 py-1.5 text-[13px] text-muted hover:border-seal hover:text-seal disabled:opacity-50"
    >
      {busy ? 'Signing out…' : 'Sign out'}
    </button>
  );
}
