'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

type ChannelState = {
  verified: boolean;
  verifiedAt: string | null;
  expiresAt: string | null;
  resendAvailableInSeconds: number;
  attemptsRemaining: number;
};

export type OtpStatusResponse = {
  status: string;
  email: string;
  phone: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  contactVerified: boolean;
  termsAccepted: boolean;
  termsVersion: string | null;
  sandboxAvailable: boolean;
  channels: {
    EMAIL: ChannelState;
    SMS: ChannelState;
  };
};

type SandboxCodesResponse = {
  environment: string;
  codes: {
    EMAIL?: { maskedDestination: string; code: string; expiresAt: string };
    SMS?: { maskedDestination: string; code: string; expiresAt: string };
  };
};

export function VerifyContactClient({
  initialStatus,
  nextUrl,
}: {
  initialStatus: OtpStatusResponse;
  nextUrl: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<OtpStatusResponse>(initialStatus);
  const [emailCode, setEmailCode] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [emailCooldown, setEmailCooldown] = useState(
    initialStatus.channels.EMAIL.resendAvailableInSeconds ?? 0,
  );
  const [smsCooldown, setSmsCooldown] = useState(
    initialStatus.channels.SMS.resendAvailableInSeconds ?? 0,
  );
  const [busyChannel, setBusyChannel] = useState<'EMAIL' | 'SMS' | 'SANDBOX' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sandboxCodes, setSandboxCodes] = useState<SandboxCodesResponse['codes'] | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setEmailCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      setSmsCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const refreshStatus = async () => {
    const fresh = await api<OtpStatusResponse>('/auth/otp/status');
    setStatus(fresh);
    setEmailCooldown(fresh.channels.EMAIL.resendAvailableInSeconds ?? 0);
    setSmsCooldown(fresh.channels.SMS.resendAvailableInSeconds ?? 0);
    return fresh;
  };

  const verifyChannel = async (channel: 'EMAIL' | 'SMS') => {
    const code = (channel === 'EMAIL' ? emailCode : smsCode).trim();
    if (!/^[0-9]{6}$/.test(code)) {
      setError(`Enter a valid 6-digit ${channel === 'EMAIL' ? 'email' : 'mobile'} OTP.`);
      return;
    }
    setBusyChannel(channel);
    setError(null);
    setNotice(null);
    try {
      await api('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ channel, code }),
      });
      const fresh = await refreshStatus();
      setNotice(
        `${channel === 'EMAIL' ? 'Email address' : 'Mobile number'} verified successfully.`,
      );
      if (fresh.contactVerified) {
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed. Try again.');
      await refreshStatus().catch(() => undefined);
    } finally {
      setBusyChannel(null);
    }
  };

  const resendChannel = async (channel: 'EMAIL' | 'SMS') => {
    setBusyChannel(channel);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ resendCooldownSeconds: number }>('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ channel }),
      });
      if (channel === 'EMAIL') {
        setEmailCooldown(res.resendCooldownSeconds ?? 60);
        setEmailCode('');
      } else {
        setSmsCooldown(res.resendCooldownSeconds ?? 60);
        setSmsCode('');
      }
      setSandboxCodes(null);
      await refreshStatus();
      setNotice(
        `A new 6-digit verification code has been issued for your ${
          channel === 'EMAIL' ? 'email address' : 'mobile number'
        }.`,
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend code.');
    } finally {
      setBusyChannel(null);
    }
  };

  const loadSandboxCodes = async () => {
    setBusyChannel('SANDBOX');
    setError(null);
    try {
      const res = await api<SandboxCodesResponse>('/auth/otp/sandbox-codes');
      setSandboxCodes(res.codes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load staging test codes.');
    } finally {
      setBusyChannel(null);
    }
  };

  return (
    <div className="space-y-6">
      {error ? <ErrorNote id="otp-error">{error}</ErrorNote> : null}

      {notice ? (
        <div
          role="status"
          className="rounded-card border border-seal bg-seal-soft px-4 py-3 text-[14px] text-seal-deep"
        >
          {notice}
        </div>
      ) : null}

      {status.contactVerified ? (
        <Card>
          <CardHeader
            title="Contact verification complete"
            action={<Badge tone="seal">Verified</Badge>}
          />
          <div className="space-y-4 p-5">
            <p className="text-[15px] text-muted">
              Both your email address ({status.email}) and mobile number ({status.phone}) have been
              verified. Your account is now active.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => {
                  router.push(nextUrl);
                  router.refresh();
                }}
              >
                Continue to dashboard →
              </Button>
              <Link
                href="/properties"
                className="inline-flex items-center px-3 py-2 text-[14px] text-muted hover:text-ink"
              >
                Browse properties
              </Link>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2">
        {/* -------------------------------------------- Email Verification */}
        <Card>
          <CardHeader
            title="1. Email OTP"
            note={status.email}
            action={
              status.emailVerified ? (
                <Badge tone="seal">Verified</Badge>
              ) : (
                <Badge tone="ochre">Pending</Badge>
              )
            }
          />
          <div className="space-y-4 p-5">
            {status.emailVerified ? (
              <p className="text-[14px] text-muted">
                Your email address is confirmed.
              </p>
            ) : (
              <>
                <div>
                  <label className="label" htmlFor="email-otp">
                    6-digit Email OTP
                  </label>
                  <input
                    id="email-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="^[0-9]{6}$"
                    placeholder="123456"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="field font-mono tracking-widest"
                  />
                  <p className="hint">
                    Valid for 10 minutes · {status.channels.EMAIL.attemptsRemaining} attempt(s)
                    remaining.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    disabled={busyChannel !== null || emailCode.length !== 6}
                    onClick={() => verifyChannel('EMAIL')}
                  >
                    {busyChannel === 'EMAIL' ? 'Verifying…' : 'Verify email'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyChannel !== null || emailCooldown > 0}
                    onClick={() => resendChannel('EMAIL')}
                  >
                    {emailCooldown > 0 ? `Resend in ${emailCooldown}s` : 'Resend email OTP'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>

        {/* ------------------------------------------- Mobile Verification */}
        <Card>
          <CardHeader
            title="2. Mobile OTP (SMS)"
            note={status.phone ?? 'No mobile number'}
            action={
              status.phoneVerified ? (
                <Badge tone="seal">Verified</Badge>
              ) : (
                <Badge tone="ochre">Pending</Badge>
              )
            }
          />
          <div className="space-y-4 p-5">
            {status.phoneVerified ? (
              <p className="text-[14px] text-muted">
                Your mobile number is confirmed.
              </p>
            ) : (
              <>
                <div>
                  <label className="label" htmlFor="sms-otp">
                    6-digit Mobile OTP
                  </label>
                  <input
                    id="sms-otp"
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    pattern="^[0-9]{6}$"
                    placeholder="123456"
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="field font-mono tracking-widest"
                  />
                  <p className="hint">
                    Valid for 10 minutes · {status.channels.SMS.attemptsRemaining} attempt(s)
                    remaining.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    disabled={busyChannel !== null || smsCode.length !== 6}
                    onClick={() => verifyChannel('SMS')}
                  >
                    {busyChannel === 'SMS' ? 'Verifying…' : 'Verify mobile'}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busyChannel !== null || smsCooldown > 0}
                    onClick={() => resendChannel('SMS')}
                  >
                    {smsCooldown > 0 ? `Resend in ${smsCooldown}s` : 'Resend mobile OTP'}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------- Staging-Only Controlled Test Mechanism */}
      {status.sandboxAvailable && !status.contactVerified ? (
        <Card>
          <CardHeader
            title="Staging QA Verification Sandbox"
            note="Controlled staging-only test helper (disabled in production). No external SMS/email is sent and codes are never written to server logs."
            action={<Badge tone="ochre">Staging Only</Badge>}
          />
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busyChannel !== null}
                onClick={loadSandboxCodes}
              >
                {busyChannel === 'SANDBOX' ? 'Loading…' : 'Reveal staging test OTPs'}
              </Button>
            </div>

            {sandboxCodes ? (
              <div className="grid gap-3 rounded-card border border-line bg-paper p-3 text-[13px] sm:grid-cols-2">
                <div>
                  <p className="font-medium">Email test code ({status.email})</p>
                  {sandboxCodes.EMAIL ? (
                    <div className="mt-1 flex items-center gap-2">
                      <code className="rounded bg-white px-2 py-0.5 font-mono text-[15px] font-semibold">
                        {sandboxCodes.EMAIL.code}
                      </code>
                      <button
                        type="button"
                        onClick={() => setEmailCode(sandboxCodes.EMAIL!.code)}
                        className="text-xs font-medium text-seal underline"
                      >
                        Fill Email OTP
                      </button>
                    </div>
                  ) : (
                    <p className="text-muted">Already verified or expired (click Resend).</p>
                  )}
                </div>

                <div>
                  <p className="font-medium">Mobile test code ({status.phone})</p>
                  {sandboxCodes.SMS ? (
                    <div className="mt-1 flex items-center gap-2">
                      <code className="rounded bg-white px-2 py-0.5 font-mono text-[15px] font-semibold">
                        {sandboxCodes.SMS.code}
                      </code>
                      <button
                        type="button"
                        onClick={() => setSmsCode(sandboxCodes.SMS!.code)}
                        className="text-xs font-medium text-seal underline"
                      >
                        Fill Mobile OTP
                      </button>
                    </div>
                  ) : (
                    <p className="text-muted">Already verified or expired (click Resend).</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="flex items-center justify-between border-t border-line pt-4 text-[14px] text-muted">
        <span>You can browse homes while verification is pending.</span>
        <div className="flex gap-4">
          <Link href="/properties" className="text-seal hover:underline">
            Browse homes
          </Link>
          <Link href="/dashboard" className="text-seal hover:underline">
            View dashboard (read-only)
          </Link>
        </div>
      </div>
    </div>
  );
}
