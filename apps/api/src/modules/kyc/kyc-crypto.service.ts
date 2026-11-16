import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { decryptField, encryptField } from '../../common/util/crypto';

export interface KeyedValue<T> {
  value: T;
  keyVersion: number;
}

/**
 * Passport-number protection (Phase 3A).
 *
 *  - HMAC-SHA256 (KYC_HMAC_KEY) of the normalised number is the default stored
 *    form: it supports duplicate detection without retaining the number.
 *  - AES-256-GCM (KYC_ENCRYPTION_KEY) helpers exist for a future, separately
 *    approved requirement to retain a full number. Nothing in Phase 3A calls
 *    encryptNumber(): the full passport number is NOT stored by default.
 *  - Both keys are independent of FIELD_ENCRYPTION_KEY and the auth secrets;
 *    configuration is refused if they collide.
 *
 * Key rotation: set the new key and a higher *_VERSION, keep the old key in
 * *_PREVIOUS (+ its version). New rows use the current version. Encrypted
 * values carry a 1-byte key-version prefix so old rows stay decryptable;
 * HMAC rows store number_hmac_key_ver, and duplicate lookups compute both the
 * current and previous HMAC until old rows are re-keyed by a maintenance job.
 */
@Injectable()
export class KycCryptoService {
  constructor(private readonly config: ConfigService) {}

  private get hmacKey(): string {
    return this.config.get<string>('kyc.hmacKey') || '';
  }

  private get hmacVersion(): number {
    return Number(this.config.get<number>('kyc.hmacKeyVersion') || 1);
  }

  isConfigured(): boolean {
    return this.hmacKey.length >= 32 && !this.collides();
  }

  /** Fails closed: without an independent HMAC key no passport is accepted. */
  assertConfigured(): void {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({
        code: 'KYC_NOT_CONFIGURED',
        message: 'Identity verification is temporarily unavailable. Please try again later.',
      });
    }
  }

  private collides(): boolean {
    const hmac = this.hmacKey;
    const enc = this.config.get<string>('kyc.encryptionKey') || '';
    const reserved = [
      this.config.get<string>('auth.fieldKey'),
      this.config.get<string>('auth.accessSecret'),
      this.config.get<string>('auth.refreshSecret'),
      this.config.get<string>('auth.pepper'),
    ].filter((v): v is string => !!v);
    if (reserved.includes(hmac)) return true;
    if (enc && (reserved.includes(enc) || enc === hmac)) return true;
    return false;
  }

  /** Last four characters, for display. */
  last4(value: string): string {
    return value.slice(-4);
  }

  /** Masked display form, e.g. "••••4567". Never reveals more than the last four. */
  mask(last4: string | null | undefined): string | null {
    return last4 ? `••••${last4}` : null;
  }

  /**
   * HMAC-SHA256 over a scoped, normalised value. Scope separates document types
   * and issuing countries so equal strings in different contexts never collide.
   */
  numberHmac(scope: string, country: string | null, normalisedNumber: string, version = this.hmacVersion): KeyedValue<string> {
    this.assertConfigured();
    const key = this.keyForHmac(version);
    const value = createHmac('sha256', key)
      .update(`kyc:v1:${scope}:${country ?? '-'}:${normalisedNumber}`)
      .digest('hex');
    return { value, keyVersion: version };
  }

  /** HMACs for every configured key version (current first) – used to look up duplicates during rotation. */
  numberHmacCandidates(scope: string, country: string | null, normalisedNumber: string): string[] {
    const versions = [this.hmacVersion];
    const prev = Number(this.config.get<number>('kyc.hmacKeyPreviousVersion') || 0);
    if (prev > 0 && this.config.get<string>('kyc.hmacKeyPrevious')) versions.push(prev);
    return versions.map((v) => this.numberHmac(scope, country, normalisedNumber, v).value);
  }

  private keyForHmac(version: number): string {
    if (version === this.hmacVersion) return this.hmacKey;
    const prevVersion = Number(this.config.get<number>('kyc.hmacKeyPreviousVersion') || 0);
    const prev = this.config.get<string>('kyc.hmacKeyPrevious') || '';
    if (prevVersion === version && prev) return prev;
    throw new ServiceUnavailableException({ code: 'KYC_KEY_UNAVAILABLE', message: 'Identity verification is temporarily unavailable.' });
  }

  /** Only for a future approved retention requirement. Not used by default. */
  encryptNumber(plain: string): KeyedValue<Buffer> {
    const version = Number(this.config.get<number>('kyc.encryptionKeyVersion') || 1);
    const key = this.config.get<string>('kyc.encryptionKey') || '';
    if (!/^[0-9a-fA-F]{64}$/.test(key) || this.collides()) {
      throw new ServiceUnavailableException({ code: 'KYC_NOT_CONFIGURED', message: 'Identity verification is temporarily unavailable.' });
    }
    const payload = encryptField(plain, key);
    return { value: Buffer.concat([Buffer.from([version & 0xff]), payload]), keyVersion: version };
  }

  decryptNumber(blob: Buffer): string {
    const version = blob[0];
    const current = Number(this.config.get<number>('kyc.encryptionKeyVersion') || 1);
    const prevVersion = Number(this.config.get<number>('kyc.encryptionKeyPreviousVersion') || 0);
    const key =
      version === current
        ? this.config.get<string>('kyc.encryptionKey')
        : version === prevVersion
          ? this.config.get<string>('kyc.encryptionKeyPrevious')
          : undefined;
    if (!key) throw new ServiceUnavailableException({ code: 'KYC_KEY_UNAVAILABLE', message: 'Identity verification is temporarily unavailable.' });
    return decryptField(blob.subarray(1), key);
  }
}

