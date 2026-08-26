/**
 * Payment provider contract.
 *
 * Odibrick does not hold customer funds. An adapter either:
 *  - creates a collection order at a licensed PA/PG and reports back, or
 *  - records a payment that happened outside the platform (bank transfer, UPI).
 *
 * No adapter is permitted to mark a payment PAID without a verifiable
 * provider reference or an authorised staff attestation.
 */
export interface CollectionOrder {
  providerOrderId: string;
  amount: number;
  currency: string;
  /** Handed to the client SDK/checkout. Empty when settlement happens off-platform. */
  checkoutPayload: Record<string, unknown>;
  instructions?: string;
}

export interface VerifiedPayment {
  providerTxnId: string;
  providerOrderId: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  method?: string;
  amount: number;
  failureCode?: string;
  failureReason?: string;
  raw?: Record<string, unknown>;
}

export interface RefundResult {
  providerTxnId: string;
  status: 'SUCCESS' | 'PENDING' | 'FAILED';
  amount: number;
}

export interface PaymentProvider {
  readonly key: string;
  readonly custodial: boolean;
  createOrder(input: {
    referenceCode: string;
    amount: number;
    currency: string;
    purpose: string;
    payerEmail?: string;
    payerPhone?: string;
    notes?: Record<string, string>;
  }): Promise<CollectionOrder>;
  verifyCallback(payload: Record<string, unknown>, signature?: string): Promise<VerifiedPayment>;
  refund(input: { providerTxnId: string; amount: number; reason?: string }): Promise<RefundResult>;
}
