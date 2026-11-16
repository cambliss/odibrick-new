import { Injectable } from '@nestjs/common';
import {
  KycVerificationProvider,
  ProviderCapabilities,
  ProviderResult,
  VerificationRequest,
} from '../provider.interface';

/**
 * Safe default provider: performs no automated verification and always answers
 * INCONCLUSIVE, which routes every case to the KYC team. It is not
 * authoritative and cannot approve anything.
 */
@Injectable()
export class ManualProvider implements KycVerificationProvider {
  readonly key = 'manual';
  readonly authoritative = false;

  capabilities(): ProviderCapabilities {
    return {
      passportCountries: 'NONE',
      ocr: false,
      mrz: false,
      authenticity: false,
      liveness: false,
      faceMatch: false,
      sourceVerification: [],
    };
  }

  async start(request: VerificationRequest): Promise<ProviderResult> {
    return {
      providerRef: `manual-${request.attemptId}`,
      outcome: 'INCONCLUSIVE',
      checks: { MANUAL_REVIEW: 'INCONCLUSIVE' },
    };
  }
}

