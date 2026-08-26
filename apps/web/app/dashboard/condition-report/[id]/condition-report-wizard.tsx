'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Button, Card, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { titleCase } from '@/lib/format';

const CONDITIONS = [
  ['NEW', 'New'],
  ['GOOD', 'Good'],
  ['FAIR', 'Fair'],
  ['DAMAGED', 'Damaged'],
  ['MISSING', 'Missing'],
];

const DAMAGE_TYPES = ['NONE', 'SCRATCH', 'CRACK', 'STAIN', 'LEAKAGE', 'DENT', 'BROKEN', 'WEAR'];

type ChecklistRoom = { room: string; elements: string[] };
type Item = {
  room: string;
  roomLabel?: string;
  element: string;
  conditionRating: string;
  damageType: string;
  notes?: string;
};

/**
 * The condition report is the product's most consequential form: it is what a
 * deposit deduction gets argued against a year later. So it insists on
 * photographs, records the capture time alongside the server time, and refuses
 * to submit a report that is too thin to be useful.
 */
export function ConditionReportWizard({
  inspectionId,
  checklist,
  kind,
  initialItems,
}: {
  inspectionId: number;
  checklist: ChecklistRoom[];
  kind: string;
  initialItems?: Item[];
}) {
  const router = useRouter();
  const [roomIndex, setRoomIndex] = useState(0);
  const [items, setItems] = useState<Item[]>(
    initialItems?.length
      ? initialItems
      : checklist.flatMap((room) =>
          room.elements.map((element) => ({
            room: room.room,
            element,
            conditionRating: 'GOOD',
            damageType: 'NONE',
          })),
        ),
  );
  const [photoCount, setPhotoCount] = useState(0);
  const [readings, setReadings] = useState({ electricityReading: '', waterReading: '', gasReading: '' });
  const [overall, setOverall] = useState('GOOD');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const room = checklist[roomIndex];
  const roomItems = items.filter((item) => item.room === room.room);
  const flagged = items.filter((i) => ['DAMAGED', 'MISSING'].includes(i.conditionRating)).length;
  const isLast = roomIndex === checklist.length - 1;

  const updateItem = (element: string, patch: Partial<Item>) =>
    setItems((current) =>
      current.map((item) =>
        item.room === room.room && item.element === element ? { ...item, ...patch } : item,
      ),
    );

  const saveItems = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/inspections/${inspectionId}/items`, {
        method: 'PUT',
        body: JSON.stringify({ items }),
      });
      setSaved(`Saved at ${new Date().toLocaleTimeString('en-IN')}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const uploadPhotos = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'inspections');
        const uploaded = await api<{ storageKey: string }>('/uploads', { method: 'POST', body: form });
        await api(`/inspections/${inspectionId}/media`, {
          method: 'POST',
          body: JSON.stringify({
            storageKey: uploaded.storageKey,
            mediaType: 'PHOTO',
            // The device's own timestamp is recorded next to the server's.
            capturedAt: new Date(file.lastModified).toISOString(),
            caption: `${titleCase(room.room)} — ${file.name}`,
          }),
        });
        setPhotoCount((count) => count + 1);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/inspections/${inspectionId}/items`, { method: 'PUT', body: JSON.stringify({ items }) });
      await api(`/inspections/${inspectionId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ overallCondition: overall, ...readings }),
      });
      router.push(`/dashboard/condition-report/${inspectionId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      <nav aria-label="Rooms" className="lg:sticky lg:top-6 lg:self-start">
        <ol className="spine hidden lg:block">
          {checklist.map((entry, index) => (
            <li
              key={entry.room}
              data-state={index < roomIndex ? 'done' : index === roomIndex ? 'current' : 'pending'}
              className="spine-node pb-3 last:pb-0"
            >
              <button
                type="button"
                onClick={() => setRoomIndex(index)}
                className={`text-left text-[14px] ${index === roomIndex ? 'font-medium' : 'text-muted hover:text-ink'}`}
              >
                {titleCase(entry.room)}
              </button>
            </li>
          ))}
        </ol>

        <div className="mt-6 hidden rounded-card border border-line bg-white p-4 lg:block">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Progress</p>
          <p className="mt-1 text-[14px]">
            {photoCount} photographs
            <br />
            {flagged} items flagged
          </p>
          <p className="mt-2 text-[12px] text-muted">Five items and five photographs minimum.</p>
        </div>

        <p className="font-mono text-[11px] uppercase tracking-wider text-muted lg:hidden">
          {titleCase(room.room)} · room {roomIndex + 1} of {checklist.length}
        </p>
      </nav>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="eyebrow">
              {kind === 'MOVE_OUT' ? 'Move-out report' : 'Day 1 condition report'}
            </p>
            <h2 className="mt-2 font-display text-2xl font-semibold">{titleCase(room.room)}</h2>
          </div>
          <Badge tone={photoCount >= 5 ? 'seal' : 'ochre'}>{photoCount} photos</Badge>
        </div>

        <div className="mt-6 space-y-4">
          {roomItems.map((item) => (
            <div key={item.element} className="rounded-card border border-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">{titleCase(item.element)}</p>
                <div className="flex flex-wrap gap-1">
                  {CONDITIONS.map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateItem(item.element, { conditionRating: value })}
                      aria-pressed={item.conditionRating === value}
                      className={`rounded-pill border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider ${
                        item.conditionRating === value
                          ? value === 'DAMAGED' || value === 'MISSING'
                            ? 'border-alert bg-alert text-white'
                            : 'border-seal bg-seal text-white'
                          : 'border-line text-muted hover:border-seal'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {item.conditionRating !== 'GOOD' && item.conditionRating !== 'NEW' ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-[180px_1fr]">
                  <div>
                    <label className="label" htmlFor={`damage-${item.element}`}>
                      What kind
                    </label>
                    <select
                      id={`damage-${item.element}`}
                      className="field"
                      value={item.damageType}
                      onChange={(e) => updateItem(item.element, { damageType: e.target.value })}
                    >
                      {DAMAGE_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {titleCase(type)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor={`notes-${item.element}`}>
                      Notes
                    </label>
                    <input
                      id={`notes-${item.element}`}
                      className="field"
                      value={item.notes ?? ''}
                      onChange={(e) => updateItem(item.element, { notes: e.target.value })}
                      placeholder="Where exactly, and how bad?"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-card border border-dashed border-line p-4">
          <label className="label" htmlFor={`photos-${room.room}`}>
            Photographs of the {titleCase(room.room).toLowerCase()}
          </label>
          <input
            id={`photos-${room.room}`}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={uploadPhotos}
            disabled={busy}
            className="field file:mr-3 file:rounded-card file:border-0 file:bg-seal file:px-3 file:py-1.5 file:text-white"
          />
          <p className="hint">
            Photograph anything you have marked as damaged. We record both the time your device reports and
            the time the file reaches our servers.
          </p>
        </div>

        {isLast ? (
          <div className="mt-6 space-y-4 border-t border-line pt-6">
            <h3 className="font-display text-lg font-semibold">Meter readings and overall condition</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ['electricityReading', 'Electricity'],
                ['waterReading', 'Water'],
                ['gasReading', 'Gas'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="label" htmlFor={key}>
                    {label}
                  </label>
                  <input
                    id={key}
                    className="field"
                    value={(readings as any)[key]}
                    onChange={(e) => setReadings({ ...readings, [key]: e.target.value })}
                    placeholder="Reading"
                  />
                </div>
              ))}
            </div>
            <div>
              <label className="label" htmlFor="overall">
                Overall condition
              </label>
              <select
                id="overall"
                className="field sm:w-64"
                value={overall}
                onChange={(e) => setOverall(e.target.value)}
              >
                {['EXCELLENT', 'GOOD', 'FAIR', 'POOR'].map((value) => (
                  <option key={value} value={value}>
                    {titleCase(value)}
                  </option>
                ))}
              </select>
            </div>
            <p className="rounded-card border border-line bg-paper px-4 py-3 text-[13px] text-muted">
              Once you submit, this report is locked and sent to the other party to acknowledge. It cannot
              be edited afterwards — that is the point of it.
            </p>
          </div>
        ) : null}

        {error ? <div className="mt-5">{<ErrorNote>{error}</ErrorNote>}</div> : null}
        {saved && !error ? <p className="mt-5 text-[13px] text-seal">{saved}</p> : null}

        <div className="mt-8 flex flex-wrap gap-3 border-t border-line pt-5">
          {roomIndex > 0 ? (
            <Button variant="secondary" onClick={() => setRoomIndex(roomIndex - 1)}>
              Previous room
            </Button>
          ) : null}
          {!isLast ? (
            <Button
              onClick={async () => {
                await saveItems();
                setRoomIndex(roomIndex + 1);
              }}
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Next room'}
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy}>
              {busy ? 'Submitting…' : 'Submit report'}
            </Button>
          )}
          <Button variant="ghost" onClick={saveItems} disabled={busy}>
            Save progress
          </Button>
        </div>
      </Card>
    </div>
  );
}
