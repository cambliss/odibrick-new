import { createHash } from 'crypto';

/**
 * KYC consent wording registry.
 *
 * !! The wording below is a PLACEHOLDER. Legal has not approved any text yet.
 * !! Do not present this to users in production: replace the text, bump the
 * !! version, and obtain legal sign-off first. The version string below is
 * !! deliberately self-describing so a placeholder can never be mistaken for
 * !! approved consent in kyc_consents.consent_version.
 *
 * Every consent row stores the SHA-256 of the exact wording that applied, so a
 * later wording change never rewrites what an earlier user agreed to.
 * Biometric consent (selfie / face comparison) is a separate purpose from
 * general KYC processing consent and is never implied by it.
 */
export const KYC_CONSENT_VERSION = 'PLACEHOLDER-PENDING-LEGAL-REVIEW-v0';

const WORDING: Record<string, Record<string, string>> = {
  [KYC_CONSENT_VERSION]: {
    KYC_PROCESSING:
      '[PLACEHOLDER - NOT LEGALLY APPROVED] I consent to Odibrick processing my passport and any identity documents I upload to verify my identity.',
    BIOMETRIC_PROCESSING:
      '[PLACEHOLDER - NOT LEGALLY APPROVED] I separately consent to Odibrick processing a selfie and facial comparison for identity verification.',
    DATA_RETENTION:
      '[PLACEHOLDER - NOT LEGALLY APPROVED] Retention terms for identity documents are pending legal review.',
  },
};

export function consentWording(purpose: string, version: string): string | null {
  return WORDING[version]?.[purpose] ?? null;
}

export function consentTextHash(purpose: string, version: string): string | null {
  const text = consentWording(purpose, version);
  return text ? createHash('sha256').update(text).digest('hex') : null;
}

export function isCurrentConsentVersion(version: string): boolean {
  return version === KYC_CONSENT_VERSION;
}

