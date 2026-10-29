'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

const ROLES = [
  ['TENANT', 'Rent a home'],
  ['OWNER', 'List my property'],
  ['AGENT', 'I am an agent'],
  ['BUILDER', 'I am a builder'],
];

export function RegisterForm({ defaultRole, next }: { defaultRole: string; next?: string }) {
  const router = useRouter();
  const [role, setRole] = useState(ROLES.some(([r]) => r === defaultRole) ? defaultRole : 'TENANT');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = password.length >= 12 ? 'strong' : password.length >= 8 ? 'fair' : 'weak';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmedPhone = phone.trim();
    if (!/^[0-9]{10}$|^\+[0-9]{11,14}$/.test(trimmedPhone)) {
      setError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (!accepted) {
      setError('Please accept the terms of use and privacy policy to continue.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api<{
        user?: { contactVerified?: boolean };
        verificationRequired?: boolean;
      }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          email: email.trim(),
          phone: trimmedPhone,
          password,
          role,
          termsAccepted: accepted,
          termsVersion: 'v1.0',
        }),
      });
      const verifyTarget = next
        ? `/verify-contact?next=${encodeURIComponent(next)}`
        : '/verify-contact';
      if (res?.verificationRequired !== false && !res?.user?.contactVerified) {
        router.push(verifyTarget);
      } else {
        router.push(next ?? '/dashboard');
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset>
        <legend className="label">I want to</legend>
        <div className="grid grid-cols-2 gap-2">
          {ROLES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRole(value)}
              aria-pressed={role === value}
              className={`rounded-card border px-3 py-2.5 text-left text-[14px] transition-colors ${
                role === value
                  ? 'border-seal bg-seal-soft font-medium text-seal-deep'
                  : 'border-line bg-white hover:border-seal'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor="fullName">
          Full name
        </label>
        <input
          id="fullName"
          required
          minLength={2}
          autoComplete="name"
          aria-invalid={!!error}
          aria-describedby={error ? 'register-error' : undefined}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="field"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            aria-invalid={!!error}
            aria-describedby={error ? 'register-error' : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="field"
          />
        </div>
        <div>
          <label className="label" htmlFor="phone">
            Mobile number
          </label>
          <input
            id="phone"
            type="tel"
            required
            pattern="^[0-9]{10}$|^\+[0-9]{11,14}$"
            inputMode="tel"
            autoComplete="tel"
            aria-invalid={!!error}
            aria-describedby={error ? 'register-error' : undefined}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="field"
            placeholder="9876543210"
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          aria-invalid={!!error}
          aria-describedby={error ? 'register-error password-hint' : 'password-hint'}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="field"
        />
        <p id="password-hint" className="hint">
          At least 10 characters.{' '}
          {password ? (
            <span
              className={
                strength === 'strong' ? 'text-seal' : strength === 'fair' ? 'text-ochre' : 'text-alert'
              }
            >
              Currently {strength}.
            </span>
          ) : null}
        </p>
      </div>

      <label htmlFor="accept-terms" className="flex cursor-pointer items-start gap-2.5 text-[14px]">
        <input
          id="accept-terms"
          type="checkbox"
          required
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          className="mt-1 accent-seal"
        />
        <span className="text-muted">
          I accept the{' '}
          <a href="/legal/terms" className="text-seal underline underline-offset-2">
            terms of use
          </a>{' '}
          and{' '}
          <a href="/legal/privacy" className="text-seal underline underline-offset-2">
            privacy policy
          </a>
          .
        </span>
      </label>

      {error ? <ErrorNote id="register-error">{error}</ErrorNote> : null}

      <Button type="submit" disabled={busy} full size="lg">
        {busy ? 'Creating account…' : 'Create account & send OTP'}
      </Button>

      <p className="hint">
        Next, you will confirm your email address and mobile number with a one-time password (OTP). Identity
        (KYC) verification is separate and reviewed by our team before listing or applying.
      </p>
    </form>
  );
}
