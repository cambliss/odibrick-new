'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  buildSubmitKycPayload,
  KYC_CONSENT_VERSION,
  KYC_CONSENT_WORDING,
  KycFormState,
  OPTIONAL_IDENTITY_LABELS,
  OPTIONAL_IDENTITY_TYPES,
  OptionalIdentityType,
  SupportingDocDraft,
  validateKycForm,
} from './kyc-logic';

async function uploadKycDocument(file: File, documentType: string, title: string): Promise<number> {
  const form = new FormData();
  form.append('file', file);
  form.append('category', 'KYC');
  form.append('documentType', documentType);
  form.append('title', title);
  form.append('visibility', 'PRIVATE');
  const uploaded = await api<{ id: number }>('/documents', { method: 'POST', body: form });
  return uploaded.id;
}

export function KycForm({ defaultName }: { defaultName: string }) {
  const router = useRouter();
  const [legalName, setLegalName] = useState(defaultName);
  const [passportNumber, setPassportNumber] = useState('');
  const [issuingCountry, setIssuingCountry] = useState('IND');
  const [nationality, setNationality] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [mrzText, setMrzText] = useState('');
  const [showMrz, setShowMrz] = useState(false);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [supportingDocs, setSupportingDocs] = useState<SupportingDocDraft[]>([]);
  const [kycProcessingAccepted, setKycProcessingAccepted] = useState(false);
  const [biometricProcessingAccepted, setBiometricProcessingAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addSupportingDoc = () => {
    if (supportingDocs.length >= 5) return;
    setSupportingDocs((prev) => [...prev, { type: 'PAN', number: '', file: null }]);
  };

  const updateSupportingDoc = (index: number, patch: Partial<SupportingDocDraft>) => {
    setSupportingDocs((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const removeSupportingDoc = (index: number) => {
    setSupportingDocs((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const state: KycFormState = {
      legalName,
      passportNumber,
      issuingCountry,
      nationality,
      dateOfBirth,
      issueDate,
      expiryDate,
      mrzText,
      hasPassportFile: Boolean(passportFile),
      supportingDocuments: supportingDocs,
      kycProcessingAccepted,
      biometricProcessingAccepted,
    };

    const validationError = validateKycForm(state);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!passportFile) {
      setError('Upload a clear scan or photograph of your passport.');
      return;
    }

    setBusy(true);
    try {
      const passportDocumentId = await uploadKycDocument(
        passportFile,
        'PASSPORT',
        'Passport identity document',
      );

      const supportingDocumentIds: number[] = [];
      for (const doc of supportingDocs) {
        if (!doc.file) {
          throw new Error(`Please attach a file for your ${OPTIONAL_IDENTITY_LABELS[doc.type]}.`);
        }
        const docId = await uploadKycDocument(
          doc.file,
          doc.type,
          `${OPTIONAL_IDENTITY_LABELS[doc.type]} supporting document`,
        );
        supportingDocumentIds.push(docId);
      }

      const payload = buildSubmitKycPayload(state, passportDocumentId, supportingDocumentIds);
      await api('/kyc/submit', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      setPassportNumber('');
      setMrzText('');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Could not submit verification. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-w-2xl space-y-6" noValidate>
      <div>
        <label className="label" htmlFor="legalName">
          Full name, exactly as printed on your passport
        </label>
        <input
          id="legalName"
          className="field"
          required
          maxLength={190}
          aria-invalid={!!error}
          value={legalName}
          onChange={(event) => setLegalName(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="passportNumber">
            Passport number
          </label>
          <input
            id="passportNumber"
            className="field"
            required
            maxLength={24}
            autoComplete="off"
            spellCheck={false}
            aria-describedby="passport-number-hint"
            value={passportNumber}
            onChange={(event) => setPassportNumber(event.target.value)}
          />
          <p id="passport-number-hint" className="hint">
            Only the last four characters and a cryptographic hash are retained.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="issuingCountry">
            Issuing country code
          </label>
          <input
            id="issuingCountry"
            className="field uppercase"
            required
            maxLength={3}
            placeholder="IND"
            value={issuingCountry}
            onChange={(event) => setIssuingCountry(event.target.value.toUpperCase())}
          />
          <p className="hint">3-letter code printed on the passport (for example, IND, GBR, USA).</p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="dateOfBirth">
            Date of birth
          </label>
          <input
            id="dateOfBirth"
            type="date"
            className="field"
            required
            value={dateOfBirth}
            onChange={(event) => setDateOfBirth(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="issueDate">
            Issue date (optional)
          </label>
          <input
            id="issueDate"
            type="date"
            className="field"
            value={issueDate}
            onChange={(event) => setIssueDate(event.target.value)}
          />
        </div>

        <div>
          <label className="label" htmlFor="expiryDate">
            Expiry date
          </label>
          <input
            id="expiryDate"
            type="date"
            className="field"
            required
            value={expiryDate}
            onChange={(event) => setExpiryDate(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="nationality">
            Nationality code (optional)
          </label>
          <input
            id="nationality"
            className="field uppercase"
            maxLength={3}
            placeholder="IND"
            value={nationality}
            onChange={(event) => setNationality(event.target.value.toUpperCase())}
          />
        </div>

        <div>
          <label className="label" htmlFor="passportDocument">
            Passport photo page scan
          </label>
          <input
            id="passportDocument"
            type="file"
            required
            accept="image/jpeg,image/png,application/pdf"
            aria-describedby="passport-document-hint"
            onChange={(event) => setPassportFile(event.target.files?.[0] ?? null)}
            className="field file:mr-3 file:rounded-card file:border-0 file:bg-seal file:px-3 file:py-1.5 file:text-white"
          />
          <p id="passport-document-hint" className="hint">
            JPEG, PNG, or PDF up to 15 MB. All four corners and the MRZ must be legible.
          </p>
        </div>
      </div>

      <div className="rounded-card border border-line bg-paper/60 p-4">
        <button
          type="button"
          className="text-sm font-medium text-seal underline-offset-4 hover:underline"
          onClick={() => setShowMrz((v) => !v)}
        >
          {showMrz ? 'Hide optional MRZ lines' : 'Add machine-readable zone (MRZ) lines (optional)'}
        </button>
        {showMrz ? (
          <div className="mt-3">
            <label className="label" htmlFor="mrzLines">
              MRZ lines (2 or 3 lines from the bottom of your passport)
            </label>
            <textarea
              id="mrzLines"
              rows={3}
              className="field font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
              value={mrzText}
              onChange={(event) => setMrzText(event.target.value)}
            />
            <p className="hint">Validated locally during submission and never stored.</p>
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="label mb-0">Supporting identity documents (optional)</p>
            <p className="hint mt-0">
              PAN, Voter ID, Driving licence, or Other government ID. Aadhaar is not accepted.
            </p>
          </div>
          {supportingDocs.length < 5 ? (
            <button
              type="button"
              onClick={addSupportingDoc}
              className="rounded-card border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink hover:border-seal"
            >
              + Add document
            </button>
          ) : null}
        </div>

        {supportingDocs.map((doc, idx) => (
          <div key={idx} className="grid gap-3 rounded-card border border-line bg-white p-4 sm:grid-cols-[160px_1fr_1fr_auto]">
            <div>
              <label className="label" htmlFor={`sup-type-${idx}`}>
                Type
              </label>
              <select
                id={`sup-type-${idx}`}
                className="field"
                value={doc.type}
                onChange={(event) =>
                  updateSupportingDoc(idx, { type: event.target.value as OptionalIdentityType })
                }
              >
                {OPTIONAL_IDENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {OPTIONAL_IDENTITY_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor={`sup-num-${idx}`}>
                Number (optional)
              </label>
              <input
                id={`sup-num-${idx}`}
                className="field"
                autoComplete="off"
                maxLength={24}
                value={doc.number}
                onChange={(event) => updateSupportingDoc(idx, { number: event.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor={`sup-file-${idx}`}>
                File
              </label>
              <input
                id={`sup-file-${idx}`}
                type="file"
                accept="image/jpeg,image/png,application/pdf"
                onChange={(event) =>
                  updateSupportingDoc(idx, { file: event.target.files?.[0] ?? null })
                }
                className="field file:mr-2 file:rounded-card file:border-0 file:bg-seal file:px-2.5 file:py-1 file:text-xs file:text-white"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => removeSupportingDoc(idx)}
                className="rounded-card border border-line px-3 py-2 text-sm text-alert hover:bg-alert/5"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-card border border-line bg-paper p-4">
        <p className="eyebrow">Identity verification consent ({KYC_CONSENT_VERSION})</p>
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-line text-seal focus:ring-seal"
            checked={kycProcessingAccepted}
            onChange={(event) => setKycProcessingAccepted(event.target.checked)}
            required
          />
          <span>
            {KYC_CONSENT_WORDING.KYC_PROCESSING} <span className="text-alert">*</span>
          </span>
        </label>
        <label className="flex items-start gap-3 text-sm text-muted">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-line text-seal focus:ring-seal"
            checked={biometricProcessingAccepted}
            onChange={(event) => setBiometricProcessingAccepted(event.target.checked)}
          />
          <span>{KYC_CONSENT_WORDING.BIOMETRIC_PROCESSING} (optional)</span>
        </label>
      </div>

      {error ? <ErrorNote id="kyc-error">{error}</ErrorNote> : null}

      <Button type="submit" disabled={busy || !kycProcessingAccepted}>
        {busy ? 'Submitting…' : 'Submit for verification'}
      </Button>
    </form>
  );
}
