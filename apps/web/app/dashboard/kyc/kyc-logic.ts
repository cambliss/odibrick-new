/**
 * Client-side KYC form contract, validation, and payload builder.
 * Mirrors apps/api/src/modules/kyc/kyc.dto.ts, kyc-consent.ts, and kyc-state.ts
 * without introducing any extra requirements or storing sensitive identity data.
 */

export const KYC_CONSENT_VERSION = 'PLACEHOLDER-PENDING-LEGAL-REVIEW-v0';

export const KYC_CONSENT_WORDING = {
  KYC_PROCESSING:
    '[PLACEHOLDER - NOT LEGALLY APPROVED] I consent to Odibrick processing my passport and any identity documents I upload to verify my identity.',
  BIOMETRIC_PROCESSING:
    '[PLACEHOLDER - NOT LEGALLY APPROVED] I separately consent to Odibrick processing a selfie and facial comparison for identity verification.',
} as const;

export const OPTIONAL_IDENTITY_TYPES = ['PAN', 'VOTER_ID', 'DRIVING_LICENCE', 'OTHER'] as const;
export type OptionalIdentityType = (typeof OPTIONAL_IDENTITY_TYPES)[number];

export const OPTIONAL_IDENTITY_LABELS: Record<OptionalIdentityType, string> = {
  PAN: 'PAN card',
  VOTER_ID: 'Voter ID',
  DRIVING_LICENCE: 'Driving licence',
  OTHER: 'Other government ID',
};

export const IN_PROGRESS_KYC_STATUSES = ['SUBMITTED', 'PROCESSING', 'UNDER_REVIEW', 'IN_REVIEW'] as const;
export const RESUBMITTABLE_KYC_STATUSES = ['NOT_STARTED', 'REJECTED', 'DOCUMENTS_PENDING', 'EXPIRED'] as const;

export function isKycInProgress(status: string): boolean {
  return (IN_PROGRESS_KYC_STATUSES as readonly string[]).includes(status);
}

export function canResubmitKyc(status: string): boolean {
  return (RESUBMITTABLE_KYC_STATUSES as readonly string[]).includes(status);
}

export interface SupportingDocDraft {
  type: OptionalIdentityType;
  number: string;
  documentId?: number;
  file?: File | null;
}

export interface KycFormState {
  legalName: string;
  passportNumber: string;
  issuingCountry: string;
  nationality: string;
  dateOfBirth: string;
  issueDate: string;
  expiryDate: string;
  mrzText: string;
  passportDocumentId?: number;
  hasPassportFile: boolean;
  supportingDocuments: SupportingDocDraft[];
  kycProcessingAccepted: boolean;
  biometricProcessingAccepted: boolean;
}

export interface SubmitKycPayload {
  legalName: string;
  passport: {
    documentId: number;
    number: string;
    issuingCountry: string;
    nationality?: string;
    dateOfBirth: string;
    issueDate?: string;
    expiryDate: string;
    mrzLines?: string[];
  };
  supportingDocuments?: Array<{
    documentId: number;
    type: OptionalIdentityType;
    number?: string;
  }>;
  consents: Array<{
    purpose: 'KYC_PROCESSING' | 'BIOMETRIC_PROCESSING';
    version: string;
    accepted: boolean;
  }>;
}

const PASSPORT_NUMBER_RE = /^[A-Za-z0-9 \-/.]{5,24}$/;
const COUNTRY_CODE_RE = /^[A-Za-z<]{1,3}$/;
const SUPPORTING_NUMBER_RE = /^[A-Za-z0-9 \-/]{4,24}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function todayUtcIso(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function parseMrzText(raw: string): string[] | undefined {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.length ? lines : undefined;
}

export function validateKycForm(state: KycFormState, now: Date = new Date()): string | null {
  const legalName = state.legalName.trim();
  if (legalName.length < 2 || legalName.length > 190) {
    return 'Enter your full name (2 to 190 characters) exactly as printed on your passport.';
  }

  if (!state.passportDocumentId && !state.hasPassportFile) {
    return 'Upload a clear scan or photograph of your passport.';
  }

  const passportNumber = state.passportNumber.trim();
  if (!PASSPORT_NUMBER_RE.test(passportNumber)) {
    return 'Enter the passport number exactly as printed (5 to 24 characters).';
  }

  const issuingCountry = state.issuingCountry.trim().toUpperCase();
  if (!COUNTRY_CODE_RE.test(issuingCountry)) {
    return 'Enter the 3-letter issuing country code printed on your passport (for example, IND).';
  }

  const nationality = state.nationality.trim().toUpperCase();
  if (nationality && !COUNTRY_CODE_RE.test(nationality)) {
    return 'Enter a valid 3-letter nationality code.';
  }

  if (!isValidIsoDate(state.dateOfBirth)) {
    return 'Enter a valid date of birth.';
  }
  const today = todayUtcIso(now);
  if (state.dateOfBirth > today) {
    return 'Date of birth cannot be in the future.';
  }

  if (!isValidIsoDate(state.expiryDate)) {
    return 'Enter a valid passport expiry date.';
  }
  if (state.expiryDate < today) {
    return `This passport expired on ${state.expiryDate}. Upload a valid passport.`;
  }

  if (state.issueDate) {
    if (!isValidIsoDate(state.issueDate)) {
      return 'Enter a valid passport issue date.';
    }
    if (state.issueDate > today) {
      return 'Passport issue date cannot be in the future.';
    }
    if (state.issueDate > state.expiryDate) {
      return 'Passport issue date must be before its expiry date.';
    }
  }

  const mrzLines = parseMrzText(state.mrzText);
  if (mrzLines) {
    if (mrzLines.length < 2 || mrzLines.length > 3) {
      return 'Machine-readable zone (MRZ) must have 2 or 3 lines if provided.';
    }
    if (mrzLines.some((line) => line.length > 44)) {
      return 'Each MRZ line must be at most 44 characters.';
    }
  }

  if (state.supportingDocuments.length > 5) {
    return 'You can attach at most 5 supporting documents.';
  }
  for (const doc of state.supportingDocuments) {
    if (!OPTIONAL_IDENTITY_TYPES.includes(doc.type)) {
      return 'Unsupported supporting document type.';
    }
    if (!doc.documentId && !doc.file) {
      return `Upload a file for your ${OPTIONAL_IDENTITY_LABELS[doc.type]} or remove it.`;
    }
    const num = doc.number.trim();
    if (num && !SUPPORTING_NUMBER_RE.test(num)) {
      return `Enter a valid document number for ${OPTIONAL_IDENTITY_LABELS[doc.type]} (or leave it blank).`;
    }
  }

  if (!state.kycProcessingAccepted) {
    return 'You must accept the identity verification processing consent before submitting.';
  }

  return null;
}

export function buildSubmitKycPayload(
  state: KycFormState,
  passportDocumentId: number,
  supportingDocumentIds: number[],
): SubmitKycPayload {
  const nationality = state.nationality.trim().toUpperCase();
  const mrzLines = parseMrzText(state.mrzText);

  const payload: SubmitKycPayload = {
    legalName: state.legalName.trim(),
    passport: {
      documentId: passportDocumentId,
      number: state.passportNumber.trim(),
      issuingCountry: state.issuingCountry.trim().toUpperCase(),
      ...(nationality ? { nationality } : {}),
      dateOfBirth: state.dateOfBirth,
      ...(state.issueDate ? { issueDate: state.issueDate } : {}),
      expiryDate: state.expiryDate,
      ...(mrzLines ? { mrzLines } : {}),
    },
    consents: [
      {
        purpose: 'KYC_PROCESSING',
        version: KYC_CONSENT_VERSION,
        accepted: state.kycProcessingAccepted,
      },
      ...(state.biometricProcessingAccepted
        ? [
            {
              purpose: 'BIOMETRIC_PROCESSING' as const,
              version: KYC_CONSENT_VERSION,
              accepted: true,
            },
          ]
        : []),
    ],
  };

  if (state.supportingDocuments.length > 0) {
    payload.supportingDocuments = state.supportingDocuments.map((doc, idx) => {
      const num = doc.number.trim();
      return {
        documentId: supportingDocumentIds[idx],
        type: doc.type,
        ...(num ? { number: num } : {}),
      };
    });
  }

  return payload;
}
