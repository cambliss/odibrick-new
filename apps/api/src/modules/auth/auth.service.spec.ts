import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AuthService, OTP_MAX_ATTEMPTS } from './auth.service';
import { RegisterDto, VerifyOtpDto } from './auth.dto';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';

describe('AuthService & Phase 1 Contact OTP Verification', () => {
  let service: AuthService;
  let db: jest.Mocked<Partial<DatabaseService>>;
  let audit: jest.Mocked<Partial<AuditService>>;
  let configValues: Record<string, any>;

  const pendingTenant: AuthUser = {
    id: 42,
    publicId: '01JTESTUSER000000000000042',
    email: 'tenant@staging.odibrick.local',
    phone: '9876543210',
    fullName: 'Aarav Sharma',
    status: 'PENDING',
    emailVerified: false,
    phoneVerified: false,
    contactVerified: false,
    termsAccepted: true,
    roles: ['TENANT'],
    permissions: ['property.view', 'enquiry.create', 'application.create'],
  };

  beforeEach(async () => {
    delete process.env.OTP_SANDBOX_ENABLED;
    configValues = {
      'app.env': 'staging',
      'db.database': 'odibrick_staging',
      'auth.accessSecret': 'test-access-secret-key',
      'auth.accessTtl': 900,
      'auth.refreshTtlDays': 30,
      'auth.pepper': 'test-pepper-secret',
      'auth.fieldKey': '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    };

    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(),
    };
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: db },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string) => configValues[key]) },
        },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('signed-jwt-token') } },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = moduleRef.get(AuthService);
  });

  // ------------------------------------------------------------------ DTO & Registration Validation
  describe('Registration validation & terms consent', () => {
    it('validates RegisterDto: requires phone and termsAccepted === true', async () => {
      const missingPhoneAndTerms = plainToInstance(RegisterDto, {
        fullName: 'Aarav Sharma',
        email: 'aarav@example.com',
        password: 'StrongPassword1',
        role: 'TENANT',
      });
      const errors1 = await validate(missingPhoneAndTerms);
      const props1 = errors1.map((e) => e.property);
      expect(props1).toContain('phone');
      expect(props1).toContain('termsAccepted');

      const falseTerms = plainToInstance(RegisterDto, {
        fullName: 'Aarav Sharma',
        email: 'aarav@example.com',
        phone: '9876543210',
        password: 'StrongPassword1',
        role: 'TENANT',
        termsAccepted: false,
      });
      const errors2 = await validate(falseTerms);
      expect(errors2.map((e) => e.property)).toContain('termsAccepted');

      const validDto = plainToInstance(RegisterDto, {
        fullName: 'Aarav Sharma',
        email: 'aarav@example.com',
        phone: '9876543210',
        password: 'StrongPassword1',
        role: 'TENANT',
        termsAccepted: true,
      });
      const errors3 = await validate(validDto);
      expect(errors3).toHaveLength(0);
    });

    it('does not let anyone self-register into a staff role', async () => {
      await expect(
        service.register({
          fullName: 'Staff Attacker',
          email: 'x@y.com',
          phone: '9876543210',
          password: 'longpassword1',
          role: 'ADMIN' as any,
          termsAccepted: true,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects registration when mobile number is missing or invalid', async () => {
      await expect(
        service.register({
          fullName: 'Aarav Sharma',
          email: 'aarav@example.com',
          phone: '' as any,
          password: 'longpassword1',
          role: 'TENANT',
          termsAccepted: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects registration when termsAccepted is not true', async () => {
      await expect(
        service.register({
          fullName: 'Aarav Sharma',
          email: 'aarav@example.com',
          phone: '9876543210',
          password: 'longpassword1',
          role: 'TENANT',
          termsAccepted: false,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects duplicate email or mobile number with ConflictException', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 99 });
      await expect(
        service.register({
          fullName: 'Aarav Sharma',
          email: 'aarav@example.com',
          phone: '9876543210',
          password: 'longpassword1',
          role: 'TENANT',
          termsAccepted: true,
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('creates user in PENDING status with terms consent recorded and issues hashed EMAIL + SMS OTPs', async () => {
      const mockConn = {
        execute: jest.fn().mockResolvedValue([{ insertId: 42 }]),
      };
      (db.transaction as jest.Mock).mockImplementationOnce(async (cb: any) => cb(mockConn));
      (db.one as jest.Mock)
        .mockResolvedValueOnce(null) // no existing user
        .mockResolvedValueOnce({
          id: 42,
          public_id: '01JTESTUSER000000000000042',
          email: 'aarav@example.com',
          phone: '9876543210',
          full_name: 'Aarav Sharma',
          status: 'PENDING',
          email_verified_at: null,
          phone_verified_at: null,
          terms_accepted_at: new Date(),
        });
      (db.query as jest.Mock)
        .mockResolvedValueOnce([{ code: 'TENANT' }])
        .mockResolvedValueOnce([{ code: 'property.view' }]);

      const result = await service.register({
        fullName: 'Aarav Sharma',
        email: 'Aarav@Example.com',
        phone: '9876543210',
        password: 'StrongPassword1',
        role: 'TENANT',
        termsAccepted: true,
      });

      expect(result.verificationRequired).toBe(true);
      expect(result.user.status).toBe('PENDING');
      expect(result.user.emailVerified).toBe(false);
      expect(result.user.phoneVerified).toBe(false);
      expect(result.user.contactVerified).toBe(false);
      expect(result.user.termsAccepted).toBe(true);

      // Verify user insert records PENDING status and terms_accepted_at
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('terms_accepted_at'),
        expect.arrayContaining(['aarav@example.com', '9876543210', 'Aarav Sharma', 'v1.0']),
      );

      // Verify both EMAIL and SMS OTP challenges were created with 64-char SHA-256 hashes
      const otpInserts = (db.insert as jest.Mock).mock.calls.filter(([table]) => table === 'otp_verifications');
      expect(otpInserts).toHaveLength(2);
      expect(otpInserts[0][1]).toEqual(
        expect.objectContaining({
          user_id: 42,
          channel: 'EMAIL',
          purpose: 'REGISTRATION',
          destination: 'aarav@example.com',
          code_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          attempts: 0,
          max_attempts: OTP_MAX_ATTEMPTS,
        }),
      );
      expect(otpInserts[1][1]).toEqual(
        expect.objectContaining({
          user_id: 42,
          channel: 'SMS',
          purpose: 'REGISTRATION',
          destination: '9876543210',
          code_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
          attempts: 0,
          max_attempts: OTP_MAX_ATTEMPTS,
        }),
      );
    });
  });

  // ------------------------------------------------------------------ OTP Verification, Separation & Lifecycle
  describe('OTP verification: separation of EMAIL and SMS, expiry, retry limits, and replay prevention', () => {
    it('verifies EMAIL OTP without marking phone_verified_at or activating account prematurely', async () => {
      const validCode = '482910';
      const validHash = service.hashOtpCode(pendingTenant.id, 'EMAIL', validCode);

      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: 101,
          user_id: pendingTenant.id,
          channel: 'EMAIL',
          destination: pendingTenant.email,
          code_hash: validHash,
          attempts: 0,
          max_attempts: 5,
          expires_at: new Date(Date.now() + 600_000),
          consumed_at: null,
          invalidated_at: null,
        })
        // check after email update: phone_verified_at is still NULL
        .mockResolvedValueOnce({
          status: 'PENDING',
          email_verified_at: new Date(),
          phone_verified_at: null,
        })
        // loadAuthUser
        .mockResolvedValueOnce({
          id: pendingTenant.id,
          public_id: pendingTenant.publicId,
          email: pendingTenant.email,
          phone: pendingTenant.phone,
          full_name: pendingTenant.fullName,
          status: 'PENDING',
          email_verified_at: new Date(),
          phone_verified_at: null,
          terms_accepted_at: new Date(),
        });

      const res = await service.verifyOtp(pendingTenant, { channel: 'EMAIL', code: validCode });

      expect(res.verified).toBe(true);
      expect(res.user.emailVerified).toBe(true);
      expect(res.user.phoneVerified).toBe(false);
      expect(res.user.contactVerified).toBe(false);
      expect(res.user.status).toBe('PENDING');

      // Ensure only email_verified_at was updated, never phone_verified_at or status='ACTIVE'
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET email_verified_at'),
        [pendingTenant.id],
      );
      expect(db.execute).not.toHaveBeenCalledWith(
        expect.stringContaining('phone_verified_at'),
        expect.anything(),
      );
      expect(db.execute).not.toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'ACTIVE'"),
        expect.anything(),
      );
    });

    it('transitions user status to ACTIVE only after BOTH email and mobile OTPs are verified', async () => {
      const smsCode = '739201';
      const smsHash = service.hashOtpCode(pendingTenant.id, 'SMS', smsCode);

      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: 102,
          user_id: pendingTenant.id,
          channel: 'SMS',
          destination: pendingTenant.phone,
          code_hash: smsHash,
          attempts: 0,
          max_attempts: 5,
          expires_at: new Date(Date.now() + 600_000),
          consumed_at: null,
          invalidated_at: null,
        })
        // Both email_verified_at and phone_verified_at are now non-null
        .mockResolvedValueOnce({
          status: 'PENDING',
          email_verified_at: new Date(),
          phone_verified_at: new Date(),
        })
        // loadAuthUser
        .mockResolvedValueOnce({
          id: pendingTenant.id,
          public_id: pendingTenant.publicId,
          email: pendingTenant.email,
          phone: pendingTenant.phone,
          full_name: pendingTenant.fullName,
          status: 'ACTIVE',
          email_verified_at: new Date(),
          phone_verified_at: new Date(),
          terms_accepted_at: new Date(),
        });

      const res = await service.verifyOtp(pendingTenant, { channel: 'SMS', code: smsCode });

      expect(res.verified).toBe(true);
      expect(res.user.emailVerified).toBe(true);
      expect(res.user.phoneVerified).toBe(true);
      expect(res.user.contactVerified).toBe(true);
      expect(res.user.status).toBe('ACTIVE');

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET phone_verified_at'),
        [pendingTenant.id],
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE users SET status = 'ACTIVE'"),
        [pendingTenant.id],
      );
    });

    it('rejects an incorrect OTP, increments attempts, and reports remaining attempts', async () => {
      const actualHash = service.hashOtpCode(pendingTenant.id, 'EMAIL', '111111');
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 103,
        user_id: pendingTenant.id,
        channel: 'EMAIL',
        destination: pendingTenant.email,
        code_hash: actualHash,
        attempts: 1,
        max_attempts: 5,
        expires_at: new Date(Date.now() + 600_000),
        consumed_at: null,
        invalidated_at: null,
      });

      await expect(
        service.verifyOtp(pendingTenant, { channel: 'EMAIL', code: '999999' }),
      ).rejects.toThrow(/Invalid verification code\. 3 attempt\(s\) remaining/i);

      expect(db.execute).toHaveBeenCalledWith(
        'UPDATE otp_verifications SET attempts = ?, invalidated_at = ? WHERE id = ?',
        [2, null, 103],
      );
    });

    it('locks and invalidates the OTP when the 5th incorrect attempt is reached', async () => {
      const actualHash = service.hashOtpCode(pendingTenant.id, 'SMS', '111111');
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 104,
        user_id: pendingTenant.id,
        channel: 'SMS',
        destination: pendingTenant.phone,
        code_hash: actualHash,
        attempts: 4, // 4 prior failures; this is the 5th attempt
        max_attempts: 5,
        expires_at: new Date(Date.now() + 600_000),
        consumed_at: null,
        invalidated_at: null,
      });

      await expect(
        service.verifyOtp(pendingTenant, { channel: 'SMS', code: '222222' }),
      ).rejects.toThrow(/Maximum verification attempts exceeded/i);

      expect(db.execute).toHaveBeenCalledWith(
        'UPDATE otp_verifications SET attempts = ?, invalidated_at = ? WHERE id = ?',
        [5, expect.any(Date), 104],
      );
    });

    it('rejects an expired OTP', async () => {
      const code = '654321';
      const hash = service.hashOtpCode(pendingTenant.id, 'EMAIL', code);
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 105,
        user_id: pendingTenant.id,
        channel: 'EMAIL',
        destination: pendingTenant.email,
        code_hash: hash,
        attempts: 0,
        max_attempts: 5,
        expires_at: new Date(Date.now() - 5_000), // expired 5s ago
        consumed_at: null,
        invalidated_at: null,
      });

      await expect(
        service.verifyOtp(pendingTenant, { channel: 'EMAIL', code }),
      ).rejects.toThrow(/expired/i);
    });

    it('prevents replay of an already-consumed OTP (single-use enforcement)', async () => {
      const code = '654321';
      const hash = service.hashOtpCode(pendingTenant.id, 'EMAIL', code);
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 106,
        user_id: pendingTenant.id,
        channel: 'EMAIL',
        destination: pendingTenant.email,
        code_hash: hash,
        attempts: 0,
        max_attempts: 5,
        expires_at: new Date(Date.now() + 600_000),
        consumed_at: new Date(Date.now() - 10_000), // already used
        invalidated_at: null,
      });

      await expect(
        service.verifyOtp(pendingTenant, { channel: 'EMAIL', code }),
      ).rejects.toThrow(/already been used/i);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'auth.otp_verify_failed',
          result: 'DENIED',
          metadata: expect.objectContaining({ reason: 'REPLAYED' }),
        }),
      );
    });
  });

  // ------------------------------------------------------------------ Resend Cooldown & Rate Limiting
  describe('OTP resend cooldown and rate limiting', () => {
    it('enforces a 60-second cooldown between OTP resends for the same channel', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: pendingTenant.id,
          email: pendingTenant.email,
          phone: pendingTenant.phone,
          status: 'PENDING',
          email_verified_at: null,
          phone_verified_at: null,
        })
        .mockResolvedValueOnce({
          id: 201,
          created_at: new Date(Date.now() - 15_000), // sent 15s ago
        });

      await expect(service.sendOtp(pendingTenant, { channel: 'SMS' })).rejects.toThrow(
        /Please wait \d+s before requesting another verification code/i,
      );
    });

    it('enforces the 15-minute window rate limit (max 5 sends)', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: pendingTenant.id,
          email: pendingTenant.email,
          phone: pendingTenant.phone,
          status: 'PENDING',
          email_verified_at: null,
          phone_verified_at: null,
        })
        .mockResolvedValueOnce({
          id: 202,
          created_at: new Date(Date.now() - 120_000), // 2 minutes ago (past 60s cooldown)
        })
        .mockResolvedValueOnce({ c: 5 }); // 5 sends in last 15 minutes

      await expect(service.sendOtp(pendingTenant, { channel: 'SMS' })).rejects.toThrow(
        /Too many verification codes requested/i,
      );
    });

    it('invalidates previous active OTPs and issues a fresh OTP when cooldown and rate limit pass', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: pendingTenant.id,
          email: pendingTenant.email,
          phone: pendingTenant.phone,
          status: 'PENDING',
          email_verified_at: null,
          phone_verified_at: null,
        })
        .mockResolvedValueOnce({
          id: 203,
          created_at: new Date(Date.now() - 90_000), // 90s ago
        })
        .mockResolvedValueOnce({ c: 2 });

      const res = await service.sendOtp(pendingTenant, { channel: 'EMAIL' });

      expect(res.channel).toBe('EMAIL');
      expect(res.resendCooldownSeconds).toBe(60);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE otp_verifications'),
        [pendingTenant.id, 'EMAIL'],
      );
      expect(db.insert).toHaveBeenCalledWith(
        'otp_verifications',
        expect.objectContaining({
          user_id: pendingTenant.id,
          channel: 'EMAIL',
          purpose: 'CONTACT_VERIFICATION',
        }),
      );
    });
  });

  // ------------------------------------------------------------------ Staging Sandbox Isolation
  describe('Controlled staging-only OTP sandbox (fail-closed)', () => {
    it('blocks sandbox OTP retrieval when database is production (odibrick_v2), even if OTP_SANDBOX_ENABLED=true', async () => {
      process.env.OTP_SANDBOX_ENABLED = 'true';
      configValues['db.database'] = 'odibrick_v2';
      configValues['app.env'] = 'production';

      expect(service.isOtpSandboxEnabled()).toBe(false);
      await expect(service.getSandboxOtpCodes(pendingTenant)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('is fail-closed when database name is missing, empty, default (odibrick), or misspelled, even if OTP_SANDBOX_ENABLED=true', async () => {
      process.env.OTP_SANDBOX_ENABLED = 'true';
      for (const badDb of ['', undefined, 'odibrick', 'odibrick_prod', 'odibrick_stg']) {
        configValues['db.database'] = badDb;
        expect(service.isOtpSandboxEnabled()).toBe(false);
      }
    });

    it('is fail-closed when webUrl or corsOrigins references production domain (odibrick.com)', async () => {
      process.env.OTP_SANDBOX_ENABLED = 'true';
      configValues['db.database'] = 'odibrick_staging';
      configValues['app.webUrl'] = 'https://odibrick.com';
      expect(service.isOtpSandboxEnabled()).toBe(false);

      configValues['app.webUrl'] = 'https://staging.vercel.app';
      configValues['app.corsOrigins'] = ['https://www.odibrick.com'];
      expect(service.isOtpSandboxEnabled()).toBe(false);
    });

    it('prevents cross-user decryption of encrypted_test_code due to per-user key binding', async () => {
      let capturedEncrypted: Buffer | null = null;
      (db.insert as jest.Mock).mockImplementationOnce(async (_table: string, row: any) => {
        capturedEncrypted = row.encrypted_test_code;
        return 1;
      });
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: pendingTenant.id,
          email: pendingTenant.email,
          phone: pendingTenant.phone,
          status: 'PENDING',
          email_verified_at: null,
          phone_verified_at: null,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ c: 0 });

      await service.sendOtp(pendingTenant, { channel: 'SMS' });
      expect(capturedEncrypted).toBeInstanceOf(Buffer);

      // Simulate another user (id = 99) receiving the ciphertext blob
      const otherUser: AuthUser = { ...pendingTenant, id: 99 };
      (db.query as jest.Mock).mockResolvedValueOnce([
        {
          channel: 'SMS',
          destination: pendingTenant.phone,
          encrypted_test_code: capturedEncrypted,
          expires_at: new Date(Date.now() + 600_000),
        },
      ]);

      const sandboxOther = await service.getSandboxOtpCodes(otherUser);
      expect(sandboxOther.codes.SMS).toBeUndefined();
    });

    it('decrypts and returns active test OTPs for the authenticated owner on odibrick_staging', async () => {
      let capturedEncrypted: Buffer | null = null;
      (db.insert as jest.Mock).mockImplementationOnce(async (_table: string, row: any) => {
        capturedEncrypted = row.encrypted_test_code;
        return 1;
      });
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: pendingTenant.id,
          email: pendingTenant.email,
          phone: pendingTenant.phone,
          status: 'PENDING',
          email_verified_at: null,
          phone_verified_at: null,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ c: 0 });

      await service.sendOtp(pendingTenant, { channel: 'SMS' });
      expect(capturedEncrypted).toBeInstanceOf(Buffer);

      (db.query as jest.Mock).mockResolvedValueOnce([
        {
          channel: 'SMS',
          destination: pendingTenant.phone,
          encrypted_test_code: capturedEncrypted,
          expires_at: new Date(Date.now() + 600_000),
        },
      ]);

      const sandbox = await service.getSandboxOtpCodes(pendingTenant);
      expect(sandbox.environment).toBe('staging-sandbox');
      expect(sandbox.codes.SMS?.code).toMatch(/^[0-9]{6}$/);
    });
  });

  // ------------------------------------------------------------------ Login & Refresh Security
  describe('Login and token refresh security', () => {
    it('gives the same error for an unknown email as for a wrong password', async () => {
      (db.one as jest.Mock).mockResolvedValue(null);
      await expect(service.login({ email: 'nobody@x.com', password: 'whatever' })).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('revokes the whole token family when a rotated refresh token is replayed', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 1,
        user_id: 4,
        family_id: 'fam',
        expires_at: new Date(Date.now() + 1000),
        revoked_at: new Date(),
      });
      await expect(service.refresh('replayed')).rejects.toBeInstanceOf(UnauthorizedException);
      expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('family_id = ?'), ['fam']);
    });
  });
});
