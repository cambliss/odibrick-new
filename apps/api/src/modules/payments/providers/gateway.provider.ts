import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { CollectionOrder, PaymentProvider, RefundResult, VerifiedPayment } from './payment-provider.interface';

/**
 * Skeleton for a licensed payment aggregator (Razorpay, Cashfree, PayU...).
 *
 * The signature check below is real; the HTTP calls are intentionally left
 * unimplemented so that nothing in this repository can report a successful
 * payment that did not happen. Fill in createOrder/refund against the chosen
 * provider's API once the merchant account exists.
 */
@Injectable()
export class GatewayPaymentProvider implements PaymentProvider {
  readonly key = 'gateway';
  readonly custodial = true;
  private readonly logger = new Logger(GatewayPaymentProvider.name);

  constructor(private readonly config: ConfigService) {}

  async createOrder(): Promise<CollectionOrder> {
    throw new ServiceUnavailableException(
      'Online payments are not enabled on this environment yet. Use the recorded-transfer flow.',
    );
  }

  async verifyCallback(payload: Record<string, unknown>, signature?: string): Promise<VerifiedPayment> {
    const secret = this.config.get<string>('providers.paymentWebhookSecret');
    if (!secret || !signature) throw new ServiceUnavailableException('Webhook verification is not configured.');

    const expected = createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(signature);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      this.logger.warn('Rejected a payment webhook with an invalid signature');
      throw new ServiceUnavailableException('Invalid webhook signature.');
    }

    const entity = (payload as any)?.payload?.payment?.entity ?? {};
    return {
      providerTxnId: entity.id,
      providerOrderId: entity.order_id,
      status: entity.status === 'captured' ? 'SUCCESS' : entity.status === 'failed' ? 'FAILED' : 'PENDING',
      method: entity.method,
      amount: Number(entity.amount ?? 0) / 100,
      failureCode: entity.error_code,
      failureReason: entity.error_description,
      raw: payload,
    };
  }

  async refund(): Promise<RefundResult> {
    throw new ServiceUnavailableException('Refund API is not wired to a provider yet.');
  }
}
