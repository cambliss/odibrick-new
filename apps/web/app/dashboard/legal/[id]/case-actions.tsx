'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorNote } from '@/components/ui';

type Advocate = {
  id: number;
  full_name: string;
  email: string;
};

/* -------------------------------------------------------- Assign Advocate Modal */
export function AssignAdvocateButton({
  caseId,
  currentAssigneeId,
  currentPriority,
  advocates,
}: {
  caseId: number;
  currentAssigneeId?: number | null;
  currentPriority: string;
  advocates: Advocate[];
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [assigneeId, setAssigneeId] = useState<number | ''>(currentAssigneeId ?? '');
  const [priority, setPriority] = useState(currentPriority ?? 'NORMAL');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/legal/cases/${caseId}/assign`, {
        method: 'POST',
        body: JSON.stringify({
          assigneeId: assigneeId ? Number(assigneeId) : undefined,
          priority,
        }),
      });
      setIsOpen(false);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to assign advocate.');
    }
  }

  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(true)}
      >
        {currentAssigneeId ? 'Reassign advocate' : 'Assign advocate'}
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card border border-line bg-white p-6 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-display text-lg font-semibold">Assign advocate</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAssign} className="mt-4 space-y-4">
              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <div>
                <label htmlFor="advocate-select" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                  Advocate / Legal counsel
                </label>
                <select
                  id="advocate-select"
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:outline-none"
                >
                  <option value="">Select an advocate...</option>
                  {advocates.map((adv) => (
                    <option key={adv.id} value={adv.id}>
                      {adv.full_name} ({adv.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="priority-select" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                  Case Priority
                </label>
                <select
                  id="priority-select"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:outline-none"
                >
                  <option value="LOW">Low</option>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={isPending}>
                  {isPending ? 'Saving...' : 'Confirm assignment'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------- Add Note Form */
export function AddNoteForm({ caseId }: { caseId: number }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'INTERNAL' | 'PARTIES'>('INTERNAL');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setError(null);
    setSuccess(false);

    try {
      await api(`/legal/cases/${caseId}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: body.trim(), visibility }),
      });
      setBody('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add note.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {success ? (
        <p className="rounded-card border border-seal/30 bg-seal-soft px-3 py-1.5 text-xs text-seal-deep font-medium">
          Note saved successfully.
        </p>
      ) : null}

      <div>
        <label htmlFor="note-body" className="sr-only">Add case note</label>
        <textarea
          id="note-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Record notes on KYC, title deed verification, clauses discussed, or special terms..."
          rows={3}
          required
          className="w-full rounded-card border border-line bg-paper px-3 py-2 text-[14px] text-ink placeholder:text-muted/60 focus:border-seal focus:bg-white focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor="note-visibility" className="font-mono text-[11px] uppercase tracking-wider text-muted">
            Visibility:
          </label>
          <select
            id="note-visibility"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as 'INTERNAL' | 'PARTIES')}
            className="rounded-card border border-line bg-white px-2 py-1 font-mono text-[12px] focus:border-seal focus:outline-none"
          >
            <option value="INTERNAL">Internal (Legal Team only)</option>
            <option value="PARTIES">Visible to Owner & Tenant</option>
          </select>
        </div>

        <Button
          variant="primary"
          size="sm"
          type="submit"
          disabled={isPending || !body.trim()}
        >
          {isPending ? 'Adding note...' : 'Post note'}
        </Button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------- Schedule Meeting Modal */
export function ScheduleMeetingButton({ caseId }: { caseId: number }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [purpose, setPurpose] = useState('LEGAL_CONSULTATION');
  const [scheduledFor, setScheduledFor] = useState('');
  const [durationMin, setDurationMin] = useState(30);
  const [agenda, setAgenda] = useState('');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleSchedule(e: React.FormEvent) {
    e.preventDefault();
    if (!scheduledFor) {
      setError('Please select a valid date and time.');
      return;
    }
    setError(null);

    try {
      await api('/legal/meetings', {
        method: 'POST',
        body: JSON.stringify({
          legalCaseId: caseId,
          purpose,
          scheduledFor: new Date(scheduledFor).toISOString(),
          durationMin: Number(durationMin),
          agenda: agenda.trim() || undefined,
        }),
      });
      setIsOpen(false);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to schedule consultation.');
    }
  }

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setIsOpen(true)}>
        Schedule consultation
      </Button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-card border border-line bg-white p-6 shadow-card">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3 className="font-display text-lg font-semibold">Schedule legal consultation</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-muted hover:text-ink text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSchedule} className="mt-4 space-y-4">
              {error ? <ErrorNote>{error}</ErrorNote> : null}

              <div>
                <label htmlFor="meeting-purpose" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                  Meeting Purpose
                </label>
                <select
                  id="meeting-purpose"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:outline-none"
                >
                  <option value="LEGAL_CONSULTATION">Legal Consultation & Agreement Review</option>
                  <option value="OWNER_TENANT_DISCUSSION">Owner-Tenant Discussion</option>
                  <option value="PROPERTY_WALKTHROUGH">Property Walkthrough / Handover</option>
                  <option value="SUPPORT">Compliance & Support</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="meeting-time" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                    Date & Time
                  </label>
                  <input
                    id="meeting-time"
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(e) => setScheduledFor(e.target.value)}
                    required
                    className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="meeting-duration" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                    Duration (Minutes)
                  </label>
                  <select
                    id="meeting-duration"
                    value={durationMin}
                    onChange={(e) => setDurationMin(Number(e.target.value))}
                    className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:outline-none"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="meeting-agenda" className="font-mono text-[11px] uppercase tracking-wider text-muted block mb-1">
                  Agenda / Focus points
                </label>
                <textarea
                  id="meeting-agenda"
                  value={agenda}
                  onChange={(e) => setAgenda(e.target.value)}
                  placeholder="Items to address during this session (e.g., custom lock-in clauses, painting charges)..."
                  rows={2}
                  className="w-full rounded-card border border-line bg-paper px-3 py-2 text-sm focus:border-seal focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-line">
                <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)} disabled={isPending}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" type="submit" disabled={isPending}>
                  {isPending ? 'Scheduling...' : 'Schedule meeting'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------- Quick Approve Agreement */
export function ApproveAgreementButton({
  agreementId,
  currentVersion,
}: {
  agreementId: number;
  currentVersion: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    if (!confirm(`Approve Agreement draft version ${currentVersion} and send for party signatures?`)) {
      return;
    }
    setError(null);
    try {
      await api(`/agreements/${agreementId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ version: currentVersion }),
      });
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to approve draft.');
    }
  }

  return (
    <div>
      {error ? <div className="mb-2"><ErrorNote>{error}</ErrorNote></div> : null}
      <Button
        variant="primary"
        size="sm"
        onClick={handleApprove}
        disabled={isPending}
      >
        {isPending ? 'Approving...' : `Approve draft (v${currentVersion})`}
      </Button>
    </div>
  );
}
