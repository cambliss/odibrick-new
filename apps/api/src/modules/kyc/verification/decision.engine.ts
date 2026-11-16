import { OverallOutcome, ProviderResult } from './provider.interface';

/**
 * Decision engine (Phase 3A).
 *
 * There is intentionally NO approval action here. Automatic approval is
 * disabled in this phase; adding it requires a selected, tested and explicitly
 * approved provider and a new engine version. The only automated outcomes are:
 *   - ESCALATE: send the case to the KYC team (the default for everything), or
 *   - REJECT: only for a clear, deterministic validation failure.
 *
 * Provider timeouts, errors and inconclusive results always ESCALATE.
 */
export type EngineAction = 'ESCALATE' | 'REJECT';

export interface EngineDecision {
  action: EngineAction;
  /** Machine code stored on the attempt / audit trail. */
  reasonCode: string;
  /** Human message; only set for REJECT (shown to the user). */
  userMessage?: string;
}

export interface EngineInput {
  /** Deterministic facts evaluated locally from stored data. */
  deterministic: {
    passportExpired: boolean;
    passportExpiryDate?: string | null;
    passportMissing: boolean;
  };
  /** Result from the provider, or null when the provider timed out / errored. */
  providerResult: ProviderResult | null;
  flags: string[];
}

export function decide(input: EngineInput): EngineDecision {
  const { deterministic } = input;

  // Deterministic validation failures are the only reason to reject automatically.
  if (deterministic.passportMissing) {
    return {
      action: 'REJECT',
      reasonCode: 'PASSPORT_MISSING',
      userMessage: 'A passport is required. Please upload your passport photo page and resubmit.',
    };
  }
  if (deterministic.passportExpired) {
    return {
      action: 'REJECT',
      reasonCode: 'PASSPORT_EXPIRED',
      userMessage: `This passport expired${deterministic.passportExpiryDate ? ` on ${deterministic.passportExpiryDate}` : ''}. Please submit a passport that is still valid.`,
    };
  }

  const outcome: OverallOutcome | 'NO_RESULT' = input.providerResult?.outcome ?? 'NO_RESULT';
  if (outcome === 'NO_RESULT') return { action: 'ESCALATE', reasonCode: 'PROVIDER_NO_RESULT' };
  if (outcome === 'ERROR') return { action: 'ESCALATE', reasonCode: 'PROVIDER_ERROR' };
  if (outcome === 'INCONCLUSIVE') return { action: 'ESCALATE', reasonCode: 'MANUAL_REVIEW_REQUIRED' };
  if (outcome === 'FAIL') {
    // A provider FAIL can mean fraud, a bad image, or a provider limitation: a human decides.
    return { action: 'ESCALATE', reasonCode: 'PROVIDER_REPORTED_FAIL' };
  }
  // PASS: still not an approval in Phase 3A.
  return { action: 'ESCALATE', reasonCode: 'AUTO_APPROVAL_DISABLED' };
}

