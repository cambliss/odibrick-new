'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

const ID_TYPES = [
  ['AADHAAR', 'Aadhaar'],
  ['PAN', 'PAN'],
  ['PASSPORT', 'Passport'],
  ['DRIVING_LICENSE', 'Driving licence'],
  ['VOTER_ID', 'Voter ID'],
];

export function KycForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [legalName, setLegalName] = useState(defaultName);
  const [idType, setIdType] = useState('AADHAAR');
  const [idNumber, setIdNumber] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let documentId: number | undefined;
      if (file) {
        const form = new FormData();
        form.append('file', file);
        form.append('category', 'KYC_DOCUMENT');
        form.append('title', `${idType} document`);
        const uploaded = await api<{ id: number }>('/documents', { method: 'POST', body: form });
        documentId = uploaded.id;
      }
      await api('/kyc', {
        method: 'POST',
        body: JSON.stringify({ legalName, idType, idNumber, documentId }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-xl space-y-4">
      <div>
        <label className="label" htmlFor="legalName">
          Full name, exactly as printed on the document
        </label>
        <input
          id="legalName"
          className="field"
          required
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <div>
          <label className="label" htmlFor="idType">
            Document
          </label>
          <select
            id="idType"
            className="field"
            value={idType}
            onChange={(event) => setIdType(event.target.value)}
          >
            {ID_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="idNumber">
            Document number
          </label>
          <input
            id="idNumber"
            className="field"
            required
            value={idNumber}
            onChange={(event) => setIdNumber(event.target.value)}
            autoComplete="off"
          />
          <p className="hint">Encrypted before it is stored. Only the last four digits are ever displayed.</p>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="document">
          Scan or photograph of the document
        </label>
        <input
          id="document"
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          className="field file:mr-3 file:rounded-card file:border-0 file:bg-seal file:px-3 file:py-1.5 file:text-white"
        />
        <p className="hint">JPEG, PNG or PDF up to 10 MB. Make sure all four corners are visible.</p>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      <Button type="submit" disabled={busy}>
        {busy ? 'Submitting…' : 'Submit for verification'}
      </Button>
    </form>
  );
}
