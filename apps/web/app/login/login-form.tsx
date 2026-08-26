'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

export function LoginForm({ next }: { next?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push(next ?? '/dashboard');
      router.refresh();
    } catch (err) {
      // The API deliberately returns one message for both wrong email and
      // wrong password, so this does not leak which accounts exist.
      setError(err instanceof ApiError ? err.message : 'Could not sign in. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="field"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="password">
            Password
          </label>
          <a href="/support" className="text-[13px] text-muted hover:text-ink hover:underline">
            Forgot password?
          </a>
        </div>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="field"
        />
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Button type="submit" disabled={busy} full size="lg">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>

      <p className="hint">
        Sessions use secure, http-only cookies. Your token is never stored where a script on the page
        could read it.
      </p>
    </form>
  );
}
