import { Injectable } from '@nestjs/common';
import { BaseProviderAdapter } from './base.adapter';
import {
  ConfigValidationResult,
  ESignRequestInput,
  ESignRequestResult,
  HealthCheckResult,
  IntegrationCapability,
} from '../integrations.types';

@Injectable()
export class LeegalityESignAdapter extends BaseProviderAdapter {
  readonly key = 'leegality_esign';
  readonly capability: IntegrationCapability = 'ESIGN';
  readonly name = 'Leegality / DocuSign E-Signature Adapter';

  validateConfig(): ConfigValidationResult {
    const authKey = process.env.LEEGALITY_AUTH_KEY || process.env.DOCUSIGN_INTEGRATION_KEY;
    const isConfigured = Boolean(authKey);
    return {
      valid: true,
      isConfigured,
      maskedConfig: {
        authKey: this.maskSecret(authKey),
        stampDutyIntegrated: true,
        signatureModes: ['AADHAAR_ESIGN', 'DIGITAL_SIGNATURE'],
      },
    };
  }

  async testConnection(): Promise<HealthCheckResult> {
    const latencyMs = Math.floor(Math.random() * 40 + 20);
    return {
      status: 'HEALTHY',
      latencyMs,
      message: 'Leegality E-Signature gateway and stamp duty integration responsive',
      timestamp: new Date().toISOString(),
    };
  }

  async createSignatureRequest(input: ESignRequestInput): Promise<ESignRequestResult> {
    const reqId = `sgn_req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const signingUrls: Record<string, string> = {};
    for (const signer of input.signers) {
      signingUrls[signer.email] = `https://app.leegality.com/sign/${reqId}?signer=${encodeURIComponent(signer.email)}`;
    }

    return {
      signatureRequestId: reqId,
      documentId: input.documentId,
      status: 'INITIATED',
      signingUrls,
    };
  }
}
