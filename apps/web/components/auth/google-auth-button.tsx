'use client';

import { useState } from 'react';

interface GoogleAuthButtonProps {
  mode: 'login' | 'register';
  role?: string;
  next?: string;
  onError?: (error: string) => void;
  className?: string;
}

export function GoogleAuthButton({
  mode,
  role = 'TENANT',
  next,
  onError,
  className = '',
}: GoogleAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (role) params.set('role', role);
      if (next) params.set('next', next);

      const qs = params.toString();
      const targetUrl = `/api/auth/google${qs ? `?${qs}` : ''}`;
      window.location.href = targetUrl;
    } catch (err: any) {
      setLoading(false);
      onError?.(err?.message || 'Failed to initiate Google sign in.');
    }
  };

  const label = mode === 'login' ? 'Continue with Google' : 'Sign up with Google';

  return (
    <div className={`w-full ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="group relative flex w-full items-center justify-center gap-3 rounded-card border border-line bg-white px-4 py-2.5 text-[15px] font-medium text-ink shadow-sm transition-all hover:border-seal hover:bg-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-seal disabled:cursor-not-allowed disabled:opacity-60"
        aria-label={label}
      >
        {loading ? (
          <svg
            className="h-5 w-5 animate-spin text-seal"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        ) : (
          <svg
            className="h-4.5 w-4.5 shrink-0"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.88c2.27-2.09 3.66-5.17 3.66-9.09z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.09C3.26 21.39 7.36 24 12 24z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.32c-.25-.72-.38-1.49-.38-2.32s.13-1.6.38-2.32V6.59H1.25C.45 8.19 0 9.99 0 12s.45 3.81 1.25 5.41l4.03-3.09z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.36 0 3.26 2.61 1.25 6.59l4.03 3.09c.95-2.83 3.6-4.93 6.72-4.93z"
            />
          </svg>
        )}
        <span>{loading ? 'Connecting to Google…' : label}</span>
      </button>

      {/* Divider */}
      <div className="relative my-5">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-line" />
        </div>
        <div className="relative flex justify-center text-[12px] uppercase tracking-wider">
          <span className="bg-white px-3 font-mono text-muted">
            {mode === 'login' ? 'or sign in with email' : 'or continue with email'}
          </span>
        </div>
      </div>
    </div>
  );
}
