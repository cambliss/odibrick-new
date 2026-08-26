import Link from 'next/link';
import type { ReactNode } from 'react';

/* ------------------------------------------------------------------ button */
type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  href?: string;
  type?: 'button' | 'submit';
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
  full?: boolean;
};

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-card font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

const VARIANTS = {
  primary: 'bg-seal text-white hover:bg-seal-deep',
  secondary: 'border border-line bg-white text-ink hover:border-seal hover:text-seal',
  ghost: 'text-seal hover:bg-seal-soft',
  danger: 'bg-alert text-white hover:opacity-90',
};

const SIZES = { sm: 'px-3 py-1.5 text-[13px]', md: 'px-4 py-2.5 text-[15px]', lg: 'px-6 py-3.5 text-base' };

export function Button({
  children, variant = 'primary', size = 'md', href, type = 'button',
  disabled, onClick, className = '', full,
}: ButtonProps) {
  const classes = `${BUTTON_BASE} ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`;
  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }
  return (
    <button type={type} className={classes} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/* -------------------------------------------------------------------- card */
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-line bg-white shadow-card ${className}`}>{children}</div>;
}

export function CardHeader({ title, action, note }: { title: string; action?: ReactNode; note?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {note ? <p className="mt-0.5 text-[13px] text-muted">{note}</p> : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------- badge */
export function Badge({
  children, tone = 'neutral', className = '',
}: { children: ReactNode; tone?: 'neutral' | 'seal' | 'ochre' | 'alert' | 'info'; className?: string }) {
  const tones = {
    neutral: 'bg-paper text-muted border-line',
    seal: 'bg-seal-soft text-seal-deep border-seal/25',
    ochre: 'bg-ochre-soft text-ochre border-ochre/30',
    alert: 'bg-alert/10 text-alert border-alert/25',
    info: 'bg-info/10 text-info border-info/25',
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-pill border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/* ------------------------------------------------------------ status chips */
const STATUS_TONES: Record<string, 'neutral' | 'seal' | 'ochre' | 'alert' | 'info'> = {
  ACTIVE: 'seal', VERIFIED: 'seal', PAID: 'seal', EXECUTED: 'seal', ACKNOWLEDGED: 'seal', COMPLETED: 'seal',
  DRAFT: 'neutral', CLOSED: 'neutral', ARCHIVED: 'neutral',
  PENDING_VERIFICATION: 'ochre', SUBMITTED: 'ochre', DUE: 'ochre', AWAITING_SIGNATURES: 'ochre',
  AWAITING_PAYMENT: 'ochre', CHECK_IN_PENDING: 'ochre', OWNER_REVIEW: 'ochre', IN_REVIEW: 'ochre',
  REJECTED: 'alert', FAILED: 'alert', DISPUTED: 'alert', OVERDUE: 'alert', SUSPENDED: 'alert',
};

export function StatusChip({ status }: { status?: string | null }) {
  if (!status) return null;
  return <Badge tone={STATUS_TONES[status] ?? 'info'}>{status.replace(/_/g, ' ')}</Badge>;
}

/* --------------------------------------------------------------- empty/err */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line bg-white/60 px-6 py-12 text-center">
      <p className="font-display text-lg">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-card border border-alert/25 bg-alert/5 px-3 py-2 text-sm text-alert">
      {children}
    </p>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-card bg-line/60 ${className}`} aria-hidden />;
}

/* --------------------------------------------------------------- data rows */
export function DataRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2.5 last:border-0">
      <dt className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd className="text-right text-[15px] tabular">{value ?? '—'}</dd>
    </div>
  );
}

export function StatTile({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-card border border-line bg-white px-4 py-4">
      <p className="font-mono text-[11px] uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1.5 font-display text-2xl font-semibold tabular">{value}</p>
      {note ? <p className="mt-1 text-[13px] text-muted">{note}</p> : null}
    </div>
  );
}
