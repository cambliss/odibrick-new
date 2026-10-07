import { createHmac } from 'crypto';
import {
  ConfigValidationResult,
  HealthCheckResult,
  IProviderAdapter,
  IntegrationCapability,
} from '../integrations.types';

export abstract class BaseProviderAdapter implements IProviderAdapter {
  abstract readonly key: string;
  abstract readonly capability: IntegrationCapability;
  abstract readonly name: string;

  abstract testConnection(): Promise<HealthCheckResult>;
  abstract validateConfig(): ConfigValidationResult;

  async verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
    payload: any,
  ): Promise<{ verified: boolean; error?: string }> {
    // Default verification check (can be overridden by specific provider)
    const signature = headers['x-provider-signature'] || headers['x-razorpay-signature'] || headers['x-hub-signature-256'];
    if (!signature) {
      // If signature header is missing, fail securely
      return { verified: false, error: 'Missing webhook signature header.' };
    }
    return { verified: true };
  }

  protected maskSecret(val?: string): string {
    if (!val) return '••••••••';
    if (val.length <= 6) return '••••••••';
    return `${val.slice(0, 4)}••••${val.slice(-3)}`;
  }

  protected verifyHmacSha256(rawBody: string, signature: string, secret: string): boolean {
    if (!signature || !secret) return false;
    const computed = createHmac('sha256', secret).update(rawBody).digest('hex');
    return computed === signature;
  }
}
