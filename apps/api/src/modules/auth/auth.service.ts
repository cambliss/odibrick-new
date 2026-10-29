import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomInt, randomUUID } from 'crypto';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AccessTokenPayload, AuthUser, OtpChannel, RoleCode } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { decryptField, encryptField, randomToken, safeEqual, sha256 } from '../../common/util/crypto';
import { LoginDto, RegisterDto, SendOtpDto, VerifyOtpDto } from './auth.dto';

const SELF_SERVICE_ROLES: RoleCode[] = ['TENANT', 'OWNER', 'AGENT', 'BUILDER'];
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;
const ALLOWED_SANDBOX_DATABASES = new Set(['odibrick_staging', 'odibrick_test']);
const PRODUCTION_DOMAIN_PATTERN = /(?:^|https?:\/\/)(?:www\.)?odibrick\.com(?:\/|$)/i;

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_RATE_LIMIT_WINDOW_MINUTES = 15;
export const OTP_RATE_LIMIT_MAX_SENDS = 5;
export const DEFAULT_TERMS_VERSION = 'v1.0';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  // ------------------------------------------------------------------ register
  async register(
    dto: RegisterDto,
    req?: Request,
  ): Promise<{ user: AuthUser; verificationRequired: boolean } & TokenPair> {
    if (!SELF_SERVICE_ROLES.includes(dto.role)) {
      throw new ForbiddenException('Staff accounts are created by an administrator.');
    }

    const phone = dto.phone?.trim() ?? '';
    if (!/^[0-9]{10}$|^\+[0-9]{11,14}$/.test(phone)) {
      throw new BadRequestException('Enter a 10-digit mobile number.');
    }
    if (dto.termsAccepted !== true) {
      throw new BadRequestException('Please accept the terms of use and privacy policy.');
    }

    const email = dto.email.trim().toLowerCase();
    const existing = await this.db.one<{ id: number }>(
      'SELECT id FROM users WHERE email = ? OR phone = ? LIMIT 1',
      [email, phone],
    );
    if (existing) throw new ConflictException('An account already exists with this email or phone.');

    const passwordHash = await this.hashPassword(dto.password);
    const publicId = newPublicId();
    const termsVersion = dto.termsVersion?.trim() || DEFAULT_TERMS_VERSION;
    const ip = this.ipOf(req);

    const userId = await this.db.transaction(async (conn) => {
      const [res]: any = await conn.execute(
        `INSERT INTO users (
           public_id, email, phone, password_hash, full_name, status,
           email_verified_at, phone_verified_at, terms_accepted_at, terms_version, terms_accepted_ip
         )
         VALUES (?, ?, ?, ?, ?, 'PENDING', NULL, NULL, NOW(), ?, ?)`,
        [publicId, email, phone, passwordHash, dto.fullName.trim(), termsVersion, ip],
      );
      const id = res.insertId as number;

      await conn.execute(
        'INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE code = ?',
        [id, dto.role],
      );
      await conn.execute('INSERT INTO user_profiles (user_id, city) VALUES (?, ?)', [id, dto.city ?? null]);

      switch (dto.role) {
        case 'OWNER':
          await conn.execute('INSERT INTO owners (user_id) VALUES (?)', [id]);
          break;
        case 'TENANT':
          await conn.execute('INSERT INTO tenants (user_id) VALUES (?)', [id]);
          break;
        case 'AGENT':
          await conn.execute('INSERT INTO agents (user_id, agency_name) VALUES (?, ?)', [
            id,
            dto.organisationName ?? dto.fullName.trim(),
          ]);
          break;
        case 'BUILDER':
          await conn.execute('INSERT INTO builders (user_id, company_name) VALUES (?, ?)', [
            id,
            dto.organisationName ?? dto.fullName.trim(),
          ]);
          break;
      }
      return id;
    });

    await this.createOtpChallengeInternal(userId, 'EMAIL', email, 'REGISTRATION', req);
    await this.createOtpChallengeInternal(userId, 'SMS', phone, 'REGISTRATION', req);

    const user = await this.loadAuthUser(userId);
    await this.audit.record({
      actor: user,
      action: 'auth.registered',
      objectType: 'user',
      objectId: userId,
      metadata: { role: dto.role, termsAccepted: true, termsVersion },
      req,
    });
    const tokens = await this.issueTokens(user, req);
    return { user, verificationRequired: !user.contactVerified, ...tokens };
  }

  // --------------------------------------------------------------------- login
  async login(dto: LoginDto, req?: Request): Promise<{ user: AuthUser; verificationRequired: boolean } & TokenPair> {
    const row = await this.db.one<any>(
      `SELECT id, password_hash, status, failed_attempts, locked_until
         FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1`,
      [dto.email.toLowerCase()],
    );

    // Same message for unknown email and wrong password: no account enumeration.
    const genericFailure = new UnauthorizedException('Email or password is incorrect.');
    if (!row) throw genericFailure;

    if (row.locked_until && new Date(row.locked_until) > new Date()) {
      throw new UnauthorizedException(
        `Too many attempts. Try again after ${new Date(row.locked_until).toLocaleTimeString('en-IN')}.`,
      );
    }
    if (row.status === 'SUSPENDED' || row.status === 'DISABLED') {
      throw new ForbiddenException('This account is not active. Contact Odibrick support.');
    }

    const valid = await this.verifyPassword(row.password_hash, dto.password);
    if (!valid) {
      const attempts = row.failed_attempts + 1;
      await this.db.execute(
        `UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?`,
        [
          attempts,
          attempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
          row.id,
        ],
      );
      await this.audit.record({
        action: 'auth.login_failed', objectType: 'user', objectId: row.id, result: 'FAILURE', req,
      });
      throw genericFailure;
    }

    await this.db.execute(
      `UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW(), last_login_ip = ?
         WHERE id = ?`,
      [this.ipOf(req), row.id],
    );

    const user = await this.loadAuthUser(row.id);
    await this.audit.record({ actor: user, action: 'auth.login', objectType: 'user', objectId: row.id, req });
    const tokens = await this.issueTokens(user, req);
    return { user, verificationRequired: !user.contactVerified, ...tokens };
  }

  // ------------------------------------------------------------------- refresh
  async refresh(refreshToken: string, req?: Request): Promise<{ user: AuthUser } & TokenPair> {
    if (!refreshToken) throw new UnauthorizedException('Session expired. Sign in again.');
    const hash = sha256(refreshToken);

    const stored = await this.db.one<any>(
      `SELECT id, user_id, family_id, expires_at, revoked_at FROM refresh_tokens WHERE token_hash = ? LIMIT 1`,
      [hash],
    );
    if (!stored) throw new UnauthorizedException('Session expired. Sign in again.');

    // Reuse of a rotated token means the family is compromised: revoke all of it.
    if (stored.revoked_at) {
      await this.db.execute(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL`,
        [stored.family_id],
      );
      await this.audit.record({
        action: 'auth.refresh_reuse_detected', objectType: 'user', objectId: stored.user_id,
        result: 'DENIED', req,
      });
      throw new UnauthorizedException('Session ended for security reasons. Sign in again.');
    }
    if (new Date(stored.expires_at) < new Date()) {
      throw new UnauthorizedException('Session expired. Sign in again.');
    }

    const user = await this.loadAuthUser(stored.user_id);
    const tokens = await this.issueTokens(user, req, stored.family_id);
    await this.db.execute(
      `UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by =
         (SELECT id FROM (SELECT id FROM refresh_tokens WHERE token_hash = ?) t)
       WHERE id = ?`,
      [sha256(tokens.refreshToken), stored.id],
    );
    return { user, ...tokens };
  }

  // -------------------------------------------------------------------- logout
  async logout(refreshToken: string | undefined, user?: AuthUser, req?: Request): Promise<void> {
    if (refreshToken) {
      await this.db.execute(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL',
        [sha256(refreshToken)],
      );
    }
    if (user) {
      await this.audit.record({ actor: user, action: 'auth.logout', objectType: 'user', objectId: user.id, req });
    }
  }

  async changePassword(user: AuthUser, currentPassword: string, newPassword: string, req?: Request): Promise<void> {
    const row = await this.db.one<any>('SELECT password_hash FROM users WHERE id = ?', [user.id]);
    if (!row || !(await this.verifyPassword(row.password_hash, currentPassword))) {
      throw new BadRequestException('Current password is incorrect.');
    }
    await this.db.update('users', user.id, { password_hash: await this.hashPassword(newPassword) });
    await this.db.execute(
      'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
      [user.id],
    );
    await this.audit.record({ actor: user, action: 'auth.password_changed', objectType: 'user', objectId: user.id, req });
  }

  // -------------------------------------------------------- contact OTP engine
  async sendOtp(user: AuthUser, dto: SendOtpDto, req?: Request) {
    const account = await this.db.one<any>(
      `SELECT id, email, phone, status, email_verified_at, phone_verified_at
         FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [user.id],
    );
    if (!account) throw new UnauthorizedException('Account not found.');

    let destination: string;
    if (dto.channel === 'EMAIL') {
      if (account.email_verified_at) {
        throw new BadRequestException('Email address is already verified.');
      }
      destination = account.email;
    } else if (dto.channel === 'SMS') {
      if (!account.phone) {
        throw new BadRequestException('No mobile number is registered on this account.');
      }
      if (account.phone_verified_at) {
        throw new BadRequestException('Mobile number is already verified.');
      }
      destination = account.phone;
    } else {
      throw new BadRequestException('Choose EMAIL or SMS verification.');
    }

    const lastOtp = await this.db.one<any>(
      `SELECT id, created_at FROM otp_verifications
        WHERE user_id = ? AND channel = ? ORDER BY id DESC LIMIT 1`,
      [user.id, dto.channel],
    );
    if (lastOtp?.created_at) {
      const elapsedMs = Date.now() - new Date(lastOtp.created_at).getTime();
      const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
      if (elapsedMs < cooldownMs) {
        const remainingSeconds = Math.max(1, Math.ceil((cooldownMs - elapsedMs) / 1000));
        throw new BadRequestException(
          `Please wait ${remainingSeconds}s before requesting another verification code.`,
        );
      }
    }

    const windowStart = new Date(Date.now() - OTP_RATE_LIMIT_WINDOW_MINUTES * 60_000);
    const windowCount = await this.db.one<{ c: number }>(
      `SELECT COUNT(*) AS c FROM otp_verifications
        WHERE user_id = ? AND channel = ? AND created_at > ?`,
      [user.id, dto.channel, windowStart],
    );
    if ((windowCount?.c ?? 0) >= OTP_RATE_LIMIT_MAX_SENDS) {
      throw new BadRequestException(
        'Too many verification codes requested. Please wait 15 minutes before trying again.',
      );
    }

    const challenge = await this.createOtpChallengeInternal(
      user.id,
      dto.channel,
      destination,
      'CONTACT_VERIFICATION',
      req,
    );

    await this.audit.record({
      actor: user,
      action: 'auth.otp_sent',
      objectType: 'user',
      objectId: user.id,
      metadata: {
        channel: dto.channel,
        maskedDestination: this.maskDestination(dto.channel, destination),
      },
      req,
    });

    return {
      channel: dto.channel,
      maskedDestination: this.maskDestination(dto.channel, destination),
      expiresAt: challenge.expiresAt.toISOString(),
      resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
    };
  }

  async verifyOtp(
    user: AuthUser,
    dto: VerifyOtpDto,
    req?: Request,
  ): Promise<{ verified: boolean; channel: OtpChannel; user: AuthUser } & TokenPair> {
    if (dto.channel !== 'EMAIL' && dto.channel !== 'SMS') {
      throw new BadRequestException('Choose EMAIL or SMS verification.');
    }
    if (!dto.code || !/^[0-9]{6}$/.test(dto.code.trim())) {
      throw new BadRequestException('Enter the 6-digit verification code.');
    }

    const otp = await this.db.one<any>(
      `SELECT id, user_id, channel, destination, code_hash, attempts, max_attempts,
              expires_at, consumed_at, invalidated_at
         FROM otp_verifications
        WHERE user_id = ? AND channel = ?
        ORDER BY id DESC LIMIT 1`,
      [user.id, dto.channel],
    );

    if (!otp) {
      throw new BadRequestException('No verification code found. Please request a new code.');
    }

    if (otp.consumed_at) {
      await this.audit.record({
        actor: user,
        action: 'auth.otp_verify_failed',
        objectType: 'user',
        objectId: user.id,
        result: 'DENIED',
        metadata: { channel: dto.channel, reason: 'REPLAYED' },
        req,
      });
      throw new BadRequestException('This verification code has already been used.');
    }

    if (otp.invalidated_at) {
      throw new BadRequestException('This verification code is no longer valid. Please use the latest code.');
    }

    if (new Date(otp.expires_at).getTime() <= Date.now()) {
      await this.audit.record({
        actor: user,
        action: 'auth.otp_verify_failed',
        objectType: 'user',
        objectId: user.id,
        result: 'FAILURE',
        metadata: { channel: dto.channel, reason: 'EXPIRED' },
        req,
      });
      throw new BadRequestException('This verification code has expired. Please request a new code.');
    }

    const maxAttempts = Number(otp.max_attempts ?? OTP_MAX_ATTEMPTS);
    const currentAttempts = Number(otp.attempts ?? 0);
    if (currentAttempts >= maxAttempts) {
      throw new BadRequestException('Maximum verification attempts exceeded. Please request a new code.');
    }

    const expectedHash = this.hashOtpCode(user.id, dto.channel, dto.code.trim());
    const isValid = safeEqual(expectedHash, String(otp.code_hash));

    if (!isValid) {
      const nextAttempts = currentAttempts + 1;
      const exhausted = nextAttempts >= maxAttempts;
      await this.db.execute(
        'UPDATE otp_verifications SET attempts = ?, invalidated_at = ? WHERE id = ?',
        [nextAttempts, exhausted ? new Date() : null, otp.id],
      );
      await this.audit.record({
        actor: user,
        action: 'auth.otp_verify_failed',
        objectType: 'user',
        objectId: user.id,
        result: 'FAILURE',
        metadata: { channel: dto.channel, attempts: nextAttempts },
        req,
      });
      if (exhausted) {
        throw new BadRequestException('Maximum verification attempts exceeded. Please request a new code.');
      }
      throw new BadRequestException(
        `Invalid verification code. ${maxAttempts - nextAttempts} attempt(s) remaining.`,
      );
    }

    const consumeRes: any = await this.db.execute(
      `UPDATE otp_verifications
          SET consumed_at = NOW(), verified_ip = ?
        WHERE id = ?
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
          AND attempts < max_attempts
          AND expires_at > NOW()`,
      [this.ipOf(req), otp.id],
    );
    if (consumeRes && consumeRes.affectedRows === 0) {
      throw new BadRequestException('This verification code has already been used or is no longer valid.');
    }

    // Explicitly verify only the specific channel; EMAIL never substitutes for SMS and vice versa.
    if (dto.channel === 'EMAIL') {
      await this.db.execute(
        'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ?',
        [user.id],
      );
    } else {
      await this.db.execute(
        'UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, NOW()) WHERE id = ?',
        [user.id],
      );
    }

    const verifyRow = await this.db.one<any>(
      'SELECT status, email_verified_at, phone_verified_at FROM users WHERE id = ?',
      [user.id],
    );
    if (verifyRow?.email_verified_at && verifyRow?.phone_verified_at && verifyRow?.status === 'PENDING') {
      await this.db.execute("UPDATE users SET status = 'ACTIVE' WHERE id = ? AND status = 'PENDING'", [user.id]);
    }

    const updatedUser = await this.loadAuthUser(user.id);
    await this.audit.record({
      actor: updatedUser,
      action: 'auth.otp_verified',
      objectType: 'user',
      objectId: user.id,
      metadata: {
        channel: dto.channel,
        emailVerified: updatedUser.emailVerified,
        phoneVerified: updatedUser.phoneVerified,
        contactVerified: updatedUser.contactVerified,
      },
      req,
    });

    const tokens = await this.issueTokens(updatedUser, req);
    return {
      verified: true,
      channel: dto.channel,
      user: updatedUser,
      ...tokens,
    };
  }

  async otpStatus(user: AuthUser) {
    const account = await this.db.one<any>(
      `SELECT id, email, phone, status, email_verified_at, phone_verified_at, terms_accepted_at, terms_version
         FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      [user.id],
    );
    if (!account) throw new UnauthorizedException('Account not found.');

    const [emailOtp, smsOtp] = await Promise.all([
      this.db.one<any>(
        `SELECT expires_at, created_at, attempts, max_attempts, consumed_at, invalidated_at
           FROM otp_verifications WHERE user_id = ? AND channel = 'EMAIL' ORDER BY id DESC LIMIT 1`,
        [user.id],
      ),
      this.db.one<any>(
        `SELECT expires_at, created_at, attempts, max_attempts, consumed_at, invalidated_at
           FROM otp_verifications WHERE user_id = ? AND channel = 'SMS' ORDER BY id DESC LIMIT 1`,
        [user.id],
      ),
    ]);

    const formatChannelState = (verifiedAt: any, otpRow: any) => {
      const verified = Boolean(verifiedAt);
      if (verified || !otpRow) {
        return {
          verified,
          verifiedAt: verifiedAt ?? null,
          expiresAt: null,
          resendAvailableInSeconds: 0,
          attemptsRemaining: OTP_MAX_ATTEMPTS,
        };
      }
      const elapsedMs = otpRow.created_at ? Date.now() - new Date(otpRow.created_at).getTime() : Infinity;
      const cooldownMs = OTP_RESEND_COOLDOWN_SECONDS * 1000;
      const resendAvailableInSeconds =
        elapsedMs < cooldownMs ? Math.max(0, Math.ceil((cooldownMs - elapsedMs) / 1000)) : 0;
      const maxAttempts = Number(otpRow.max_attempts ?? OTP_MAX_ATTEMPTS);
      const attempts = Number(otpRow.attempts ?? 0);
      return {
        verified: false,
        verifiedAt: null,
        expiresAt: otpRow.expires_at ?? null,
        resendAvailableInSeconds,
        attemptsRemaining: Math.max(0, maxAttempts - attempts),
      };
    };

    const emailVerified = Boolean(account.email_verified_at);
    const phoneVerified = Boolean(account.phone_verified_at);

    return {
      status: account.status,
      email: this.maskDestination('EMAIL', account.email),
      phone: account.phone ? this.maskDestination('SMS', account.phone) : null,
      emailVerified,
      phoneVerified,
      contactVerified: emailVerified && phoneVerified,
      termsAccepted: Boolean(account.terms_accepted_at),
      termsVersion: account.terms_version ?? null,
      sandboxAvailable: this.isOtpSandboxEnabled(),
      channels: {
        EMAIL: formatChannelState(account.email_verified_at, emailOtp),
        SMS: formatChannelState(account.phone_verified_at, smsOtp),
      },
    };
  }

  /**
   * Controlled staging-only mechanism allowing a signed-in tester to retrieve
   * their own active OTP verification codes without sending external SMS/email
   * or printing secrets in server logs. Disabled in production (odibrick_v2).
   */
  async getSandboxOtpCodes(user: AuthUser, req?: Request) {
    if (!this.isOtpSandboxEnabled()) {
      throw new NotFoundException('OTP sandbox is disabled in this environment.');
    }

    const rows = await this.db.query<any>(
      `SELECT channel, destination, encrypted_test_code, expires_at
         FROM otp_verifications
        WHERE user_id = ?
          AND consumed_at IS NULL
          AND invalidated_at IS NULL
          AND expires_at > NOW()
        ORDER BY id DESC`,
      [user.id],
    );

    const codes: Record<string, { maskedDestination: string; code: string; expiresAt: string }> = {};
    for (const row of rows) {
      if (codes[row.channel] || !row.encrypted_test_code) continue;
      try {
        const keyHex = this.getSandboxKeyHex(user.id, row.channel as OtpChannel);
        const plainCode = decryptField(Buffer.from(row.encrypted_test_code), keyHex);
        codes[row.channel] = {
          maskedDestination: this.maskDestination(row.channel, row.destination),
          code: plainCode,
          expiresAt: new Date(row.expires_at).toISOString(),
        };
      } catch {
        // Ignore corrupted or undecryptable test payloads
      }
    }

    await this.audit.record({
      actor: user,
      action: 'auth.otp_sandbox_read',
      objectType: 'user',
      objectId: user.id,
      metadata: { channels: Object.keys(codes) },
      req,
    });

    return {
      environment: 'staging-sandbox',
      codes,
    };
  }

  async assertContactVerified(userId: number): Promise<void> {
    const row = await this.db.one<any>(
      'SELECT status, email_verified_at, phone_verified_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [userId],
    );
    if (!row || row.status === 'SUSPENDED' || row.status === 'DISABLED') {
      throw new ForbiddenException('This account is not active. Contact Odibrick support.');
    }
    const emailVerified = Boolean(row.email_verified_at);
    const phoneVerified = Boolean(row.phone_verified_at);
    if (!emailVerified && !phoneVerified) {
      throw new ForbiddenException(
        'Verify both your email address and mobile number via OTP before performing this action.',
      );
    }
    if (!emailVerified) {
      throw new ForbiddenException('Verify your email address via OTP before performing this action.');
    }
    if (!phoneVerified) {
      throw new ForbiddenException('Verify your mobile number via OTP before performing this action.');
    }
  }

  isOtpSandboxEnabled(): boolean {
    const explicit = process.env.OTP_SANDBOX_ENABLED?.trim().toLowerCase();
    if (explicit === 'false' || explicit === '0') return false;

    // Fail-closed database allowlist: if db.database is missing, empty, default ('odibrick'),
    // production ('odibrick_v2'), or misspelled, the sandbox is unconditionally disabled.
    const rawDbName = this.config.get<string>('db.database');
    const dbName = typeof rawDbName === 'string' ? rawDbName.trim().toLowerCase() : '';
    if (!dbName || !ALLOWED_SANDBOX_DATABASES.has(dbName)) {
      return false;
    }

    // Fail-closed production domain check: never enable sandbox if PUBLIC_WEB_URL or CORS_ORIGINS
    // references the production domain (odibrick.com / www.odibrick.com).
    const webUrl = (this.config.get<string>('app.webUrl') ?? '').trim();
    const corsOrigins = this.config.get<string[]>('app.corsOrigins') ?? [];
    if (
      PRODUCTION_DOMAIN_PATTERN.test(webUrl) ||
      corsOrigins.some((origin) => PRODUCTION_DOMAIN_PATTERN.test(origin))
    ) {
      return false;
    }

    if (explicit === 'true' || explicit === '1') return true;

    const appEnv = (this.config.get<string>('app.env') ?? 'production').trim().toLowerCase();
    return (
      dbName === 'odibrick_staging' ||
      appEnv === 'staging' ||
      appEnv === 'development' ||
      appEnv === 'test'
    );
  }

  // ------------------------------------------------------------------ internals
  async loadAuthUser(userId: number): Promise<AuthUser> {
    const user = await this.db.one<any>(
      `SELECT id, public_id, email, phone, full_name, status,
              email_verified_at, phone_verified_at, terms_accepted_at
         FROM users WHERE id = ? AND deleted_at IS NULL`,
      [userId],
    );
    if (!user) throw new UnauthorizedException('Account not found.');

    const roles = await this.db.query<{ code: RoleCode }>(
      'SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = ?',
      [userId],
    );
    const perms = await this.db.query<{ code: string }>(
      `SELECT DISTINCT p.code
         FROM user_roles ur
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ?`,
      [userId],
    );

    const emailVerified = Boolean(user.email_verified_at);
    const phoneVerified = Boolean(user.phone_verified_at);

    return {
      id: user.id,
      publicId: user.public_id,
      email: user.email,
      phone: user.phone ?? null,
      fullName: user.full_name,
      status: user.status,
      emailVerified,
      phoneVerified,
      contactVerified: emailVerified && phoneVerified,
      termsAccepted: Boolean(user.terms_accepted_at),
      roles: roles.map((r) => r.code),
      permissions: perms.map((p) => p.code),
    };
  }

  private async createOtpChallengeInternal(
    userId: number,
    channel: OtpChannel,
    destination: string,
    purpose: 'REGISTRATION' | 'CONTACT_VERIFICATION',
    req?: Request,
  ): Promise<{ code: string; expiresAt: Date }> {
    await this.db.execute(
      `UPDATE otp_verifications
          SET invalidated_at = NOW()
        WHERE user_id = ? AND channel = ? AND consumed_at IS NULL AND invalidated_at IS NULL`,
      [userId, channel],
    );

    const code = String(randomInt(100000, 1000000));
    const codeHash = this.hashOtpCode(userId, channel, code);
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);
    const encryptedTestCode = this.isOtpSandboxEnabled()
      ? encryptField(code, this.getSandboxKeyHex(userId, channel))
      : null;

    await this.db.insert('otp_verifications', {
      user_id: userId,
      channel,
      purpose,
      destination,
      code_hash: codeHash,
      encrypted_test_code: encryptedTestCode,
      attempts: 0,
      max_attempts: OTP_MAX_ATTEMPTS,
      expires_at: expiresAt,
      requested_ip: this.ipOf(req),
    });

    // Deliberately never log the OTP code itself in any environment.
    this.logger.log(
      `[OTP] issued channel=${channel} purpose=${purpose} user=${userId} expiresAt=${expiresAt.toISOString()}`,
    );

    return { code, expiresAt };
  }

  hashOtpCode(userId: number, channel: OtpChannel, code: string): string {
    const pepper = this.config.get<string>('auth.pepper') ?? '';
    return sha256(`otp:v1:${userId}:${channel}:${code.trim()}:${pepper}`);
  }

  private getSandboxKeyHex(userId: number, channel: OtpChannel): string {
    const seed =
      (this.config.get<string>('auth.fieldKey') || '') +
      ':' +
      (this.config.get<string>('auth.accessSecret') || 'odibrick-staging-sandbox') +
      ':' +
      (this.config.get<string>('auth.pepper') || '') +
      `:user:${userId}:channel:${channel}`;
    return createHash('sha256').update(seed).digest('hex');
  }

  private maskDestination(channel: OtpChannel, destination: string): string {
    if (!destination) return '';
    if (channel === 'EMAIL') {
      const [local, domain] = destination.split('@');
      if (!domain) return '***';
      const prefix = local.slice(0, Math.min(2, local.length));
      return `${prefix}***@${domain}`;
    }
    const clean = destination.replace(/\s+/g, '');
    if (clean.length <= 4) return '****';
    return `${'*'.repeat(Math.max(4, clean.length - 4))}${clean.slice(-4)}`;
  }

  private async issueTokens(user: AuthUser, req?: Request, familyId?: string): Promise<TokenPair> {
    const ttl = this.config.get<number>('auth.accessTtl')!;
    const payload: AccessTokenPayload = {
      sub: user.id,
      pid: user.publicId,
      email: user.email,
      name: user.fullName,
      roles: user.roles,
      perms: user.permissions,
      ev: Boolean(user.emailVerified),
      pv: Boolean(user.phoneVerified),
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('auth.accessSecret'),
      expiresIn: ttl,
    });

    const refreshToken = randomToken(48);
    const days = this.config.get<number>('auth.refreshTtlDays')!;
    await this.db.insert('refresh_tokens', {
      user_id: user.id,
      token_hash: sha256(refreshToken),
      family_id: familyId ?? randomUUID(),
      user_agent: req?.headers['user-agent']?.slice(0, 250) ?? null,
      ip: this.ipOf(req),
      expires_at: new Date(Date.now() + days * 86_400_000),
    });

    return { accessToken, refreshToken, expiresIn: ttl };
  }

  private async hashPassword(password: string): Promise<string> {
    return argon2.hash(password + this.config.get('auth.pepper'), {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  }

  private async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password + this.config.get('auth.pepper'));
    } catch {
      return false;
    }
  }

  private ipOf(req?: Request): string | null {
    if (!req) return null;
    const fwd = (req.headers?.['x-forwarded-for'] as string) ?? '';
    return (fwd.split(',')[0] || req.socket?.remoteAddress || '').slice(0, 45) || null;
  }
}
