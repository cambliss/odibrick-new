import { Badge } from './ui';

const LABELS: Record<string, string> = {
  KYC: 'KYC verified',
  OWNER_IDENTITY: 'Owner verified',
  OWNERSHIP_DOCUMENT: 'Documents verified',
  ADDRESS: 'Address verified',
  PHOTO_AUTHENTICITY: 'Photos checked',
  PHYSICAL_VISIT: 'Visited by Odibrick',
  PROTECTED_PLAN: 'Odibrick Protected',
};

/**
 * A seal appears only when a verification row exists and reads VERIFIED.
 * There is no "assumed verified" state anywhere in this component.
 */
export function VerificationSeals({ checks, compact }: { checks: string[]; compact?: boolean }) {
  if (!checks?.length) {
    return compact ? null : (
      <p className="text-[13px] text-muted">
        No checks completed yet. This listing has not been verified by Odibrick.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {checks.map((check) => (
        <Badge key={check} tone={check === 'PROTECTED_PLAN' ? 'ochre' : 'seal'}>
          <span aria-hidden className="text-[10px]">✦</span>
          {LABELS[check] ?? check.replace(/_/g, ' ').toLowerCase()}
        </Badge>
      ))}
    </div>
  );
}

/** The large stamp used on the property page and on executed agreements. */
export function Seal({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="inline-flex w-[132px] flex-col items-center justify-center rounded-full border-2 border-dashed border-ochre/60 bg-ochre-soft px-3 py-4 text-center">
      <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ochre">Odibrick</span>
      <span className="mt-1 font-display text-[15px] font-semibold leading-tight text-ochre">{label}</span>
      {sub ? <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-ochre/80">{sub}</span> : null}
    </div>
  );
}
