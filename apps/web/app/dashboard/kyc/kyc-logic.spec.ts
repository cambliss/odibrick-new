import * as assert from 'node:assert/strict';
import {
  buildSubmitKycPayload,
  canResubmitKyc,
  isKycInProgress,
  KYC_CONSENT_VERSION,
  KycFormState,
  OPTIONAL_IDENTITY_TYPES,
  validateKycForm,
} from './kyc-logic';

const validState = (): KycFormState => ({
  legalName: 'Arjun Verma',
  passportNumber: 'P1234567',
  issuingCountry: 'ind',
  nationality: '',
  dateOfBirth: '1992-05-14',
  issueDate: '',
  expiryDate: '2032-05-14',
  mrzText: '',
  passportDocumentId: 101,
  hasPassportFile: false,
  supportingDocuments: [],
  kycProcessingAccepted: true,
  biometricProcessingAccepted: false,
});

export function runFrontendKycLogicTests() {
  const now = new Date('2026-11-16T00:00:00.000Z');

  // 1. Valid form passes validation and builds exact SubmitKycDto shape
  assert.equal(validateKycForm(validState(), now), null);
  const payload = buildSubmitKycPayload(validState(), 101, []);
  assert.deepEqual(payload, {
    legalName: 'Arjun Verma',
    passport: {
      documentId: 101,
      number: 'P1234567',
      issuingCountry: 'IND',
      dateOfBirth: '1992-05-14',
      expiryDate: '2032-05-14',
    },
    consents: [
      {
        purpose: 'KYC_PROCESSING',
        version: KYC_CONSENT_VERSION,
        accepted: true,
      },
    ],
  });

  // 2. Requires explicit KYC_PROCESSING consent
  const noConsent = validState();
  noConsent.kycProcessingAccepted = false;
  assert.match(validateKycForm(noConsent, now) ?? '', /consent/i);

  // 3. Rejects expired passport
  const expired = validState();
  expired.expiryDate = '2025-01-01';
  assert.match(validateKycForm(expired, now) ?? '', /expired/i);

  // 4. Rejects missing passport file/documentId
  const noFile = validState();
  noFile.passportDocumentId = undefined;
  noFile.hasPassportFile = false;
  assert.match(validateKycForm(noFile, now) ?? '', /passport/i);

  // 5. Rejects invalid passport number
  const badNum = validState();
  badNum.passportNumber = '12';
  assert.match(validateKycForm(badNum, now) ?? '', /passport number/i);

  // 6. Supporting documents exclude AADHAAR and include optional number when provided
  assert.equal((OPTIONAL_IDENTITY_TYPES as readonly string[]).includes('AADHAAR'), false);
  const withSupporting = validState();
  withSupporting.supportingDocuments = [{ type: 'PAN', number: 'ABCDE1234F', documentId: 202 }];
  assert.equal(validateKycForm(withSupporting, now), null);
  const withSupportingPayload = buildSubmitKycPayload(withSupporting, 101, [202]);
  assert.deepEqual(withSupportingPayload.supportingDocuments, [
    { documentId: 202, type: 'PAN', number: 'ABCDE1234F' },
  ]);

  // 7. Status helpers match backend kyc-state.ts
  assert.equal(isKycInProgress('PROCESSING'), true);
  assert.equal(isKycInProgress('UNDER_REVIEW'), true);
  assert.equal(isKycInProgress('SUBMITTED'), true);
  assert.equal(isKycInProgress('REJECTED'), false);
  assert.equal(canResubmitKyc('REJECTED'), true);
  assert.equal(canResubmitKyc('DOCUMENTS_PENDING'), true);
  assert.equal(canResubmitKyc('EXPIRED'), true);
  assert.equal(canResubmitKyc('SUSPENDED'), false);
  assert.equal(canResubmitKyc('VERIFIED'), false);
}

if (require.main === module) {
  runFrontendKycLogicTests();
  console.log('Frontend KYC logic tests passed.');
}
