import { dateTime } from '@/lib/format';

export type SpineEvent = {
  event_code?: string;
  title: string;
  detail?: string | null;
  occurred_at?: string | null;
  state?: 'done' | 'current' | 'pending';
};

/**
 * The record spine — Odibrick's signature element.
 *
 * Every property and every tenancy has one. It is the visible form of the
 * product's claim: that the whole tenancy is on the record, in order, with
 * timestamps.
 */
export function RecordSpine({ events, dense }: { events: SpineEvent[]; dense?: boolean }) {
  if (!events?.length) {
    return <p className="text-sm text-muted">Nothing recorded yet. Events appear here as they happen.</p>;
  }
  return (
    <ol className="spine">
      {events.map((event, index) => (
        <li
          key={`${event.title}-${index}`}
          data-state={event.state ?? 'done'}
          className={`spine-node ${dense ? 'pb-4' : 'pb-6'} last:pb-0`}
        >
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
            {event.occurred_at ? dateTime(event.occurred_at) : 'Scheduled'}
          </p>
          <p className="mt-0.5 font-display text-[15px] font-semibold">{event.title}</p>
          {event.detail ? <p className="mt-0.5 text-sm text-muted">{event.detail}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** The six-step journey used on the property page and the tenancy header. */
const JOURNEY = [
  { code: 'APPLY', label: 'Apply' },
  { code: 'VERIFY', label: 'Verify' },
  { code: 'LEGAL', label: 'Legal review' },
  { code: 'SIGN', label: 'Agreement' },
  { code: 'PAY', label: 'Payment' },
  { code: 'CHECK_IN', label: 'Check-in' },
];

const STAGE_INDEX: Record<string, number> = {
  LEGAL_REVIEW: 2, CONSULTATION: 2, AGREEMENT_DRAFT: 3, AWAITING_SIGNATURES: 3,
  AWAITING_PAYMENT: 4, CHECK_IN_PENDING: 5, ACTIVE: 6, RENEWAL_DUE: 6, MOVE_OUT: 6, CLOSED: 6,
};

export function JourneyBar({ stage }: { stage?: string }) {
  const reached = stage ? STAGE_INDEX[stage] ?? 0 : 0;
  return (
    <ol className="flex flex-wrap gap-x-1 gap-y-2">
      {JOURNEY.map((step, index) => {
        const done = index < reached;
        const current = index === reached;
        return (
          <li key={step.code} className="flex items-center gap-1">
            <span
              className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
                done
                  ? 'border-seal/25 bg-seal-soft text-seal-deep'
                  : current
                    ? 'border-ochre/40 bg-ochre-soft text-ochre'
                    : 'border-line bg-white text-muted'
              }`}
            >
              <span aria-hidden>{done ? '✓' : index + 1}</span>
              {step.label}
            </span>
            {index < JOURNEY.length - 1 ? <span aria-hidden className="text-line">—</span> : null}
          </li>
        );
      })}
    </ol>
  );
}
