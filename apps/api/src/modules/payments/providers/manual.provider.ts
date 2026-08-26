import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CollectionOrder, PaymentProvider, RefundResult, VerifiedPayment } from './payment-provider.interface';

/**
 * Default adapter for pre-integration operation.
 *
 * It generates a reference the payer quotes on a direct bank/UPI transfer.
 * It never reports SUCCESS on its own — an operator with payment.manage must
 * confirm receipt against the bank statement, and that action is audited.
 */
@Injectable()
export class ManualPaymentProvider implements PaymentProvider {
  readonly key = 'manual';
  readonly custodial = false;
  private readonly logger = new Logger(ManualPaymentProvider.name);

  async createOrder(input: {
    referenceCode: string; amount: number; currency: string; purpose: string;
  }): Promise<CollectionOrder> {
    this.logger.log(`Manual collection raised: ${input.referenceCode} for ${input.currency} ${input.amount}`);
    return {
      providerOrderId: `manual_${randomUUID()}`,
      amount: input.amount,
      currency: input.currency,
      checkoutPayload: {},
      instructions:
        `Transfer ${input.currency} ${input.amount} to the account shown on your payment page and quote ` +
        `reference ${input.referenceCode}. Odibrick marks the payment received once the credit is confirmed.`,
    };
  }

  async verifyCallback(): Promise<VerifiedPayment> {
    throw new Error('The manual provider has no callback. Payments are confirmed by an operator.');
  }

  async refund(): Promise<RefundResult> {
    throw new Error('Refunds under the manual provider are processed by bank transfer and recorded by an operator.');
  }
}
