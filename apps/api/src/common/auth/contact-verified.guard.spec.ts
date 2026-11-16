import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ContactVerifiedGuard } from './contact-verified.guard';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from './auth.types';

describe('ContactVerifiedGuard — Protected Action Enforcement', () => {
  let guard: ContactVerifiedGuard;
  let reflector: jest.Mocked<Partial<Reflector>>;
  let db: jest.Mocked<Partial<DatabaseService>>;

  const makeContext = (opts: {
    method?: string;
    path?: string;
    user?: AuthUser;
    isPublic?: boolean;
    allowUnverified?: boolean;
  }): ExecutionContext => {
    (reflector.getAllAndOverride as jest.Mock)
      .mockReturnValueOnce(Boolean(opts.isPublic))
      .mockReturnValueOnce(Boolean(opts.allowUnverified));

    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          method: opts.method ?? 'POST',
          path: opts.path ?? '/api/enquiries',
          originalUrl: opts.path ?? '/api/enquiries',
          user: opts.user,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  const clientUser: AuthUser = {
    id: 42,
    publicId: '01JCLIENT00000000000000042',
    email: 'tenant@staging.odibrick.local',
    fullName: 'Aarav Sharma',
    roles: ['TENANT'],
    permissions: ['enquiry.create', 'application.create'],
  };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    db = {
      one: jest.fn(),
    };
    guard = new ContactVerifiedGuard(reflector as Reflector, db as DatabaseService);
  });

  it('allows @Public() routes without checking database', async () => {
    const ctx = makeContext({ isPublic: true, method: 'POST', path: '/api/auth/login' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(db.one).not.toHaveBeenCalled();
  });

  it('allows @AllowUnverifiedContact() routes while onboarding is incomplete', async () => {
    const ctx = makeContext({
      allowUnverified: true,
      method: 'POST',
      path: '/api/auth/otp/verify',
      user: clientUser,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(db.one).not.toHaveBeenCalled();
  });

  it('preserves read-only GET browsing and dashboard/verification screens for unverified users', async () => {
    const ctx = makeContext({
      method: 'GET',
      path: '/api/properties',
      user: clientUser,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(db.one).not.toHaveBeenCalled();
  });

  it('preserves read-only GET /api/me/profile access while onboarding is incomplete', async () => {
    const ctx = makeContext({
      method: 'GET',
      path: '/api/me/profile',
      user: clientUser,
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(db.one).not.toHaveBeenCalled();
  });

  it('blocks PATCH /api/me/profile when email or mobile is unverified', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      status: 'PENDING',
      email_verified_at: new Date(),
      phone_verified_at: null,
    });

    const ctx = makeContext({
      method: 'PATCH',
      path: '/api/me/profile',
      user: { ...clientUser },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /Verify your mobile number via OTP before performing this action/i,
    );
  });

  it('allows PATCH /api/me/profile once both email and mobile are verified', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      status: 'ACTIVE',
      email_verified_at: new Date(),
      phone_verified_at: new Date(),
    });

    const ctx = makeContext({
      method: 'PATCH',
      path: '/api/me/profile',
      user: { ...clientUser },
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('blocks protected actions when both email and mobile are unverified', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      status: 'PENDING',
      email_verified_at: null,
      phone_verified_at: null,
    });

    const ctx = makeContext({
      method: 'POST',
      path: '/api/enquiries',
      user: { ...clientUser },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /Verify both your email address and mobile number via OTP/i,
    );
  });

  it('blocks protected actions when only email is verified (email does not substitute for mobile)', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      status: 'PENDING',
      email_verified_at: new Date(),
      phone_verified_at: null,
    });

    const ctx = makeContext({
      method: 'POST',
      path: '/api/viewings',
      user: { ...clientUser },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /Verify your mobile number via OTP before performing this action/i,
    );
  });

  it('blocks protected actions when only mobile is verified (mobile does not substitute for email)', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      status: 'PENDING',
      email_verified_at: null,
      phone_verified_at: new Date(),
    });

    const ctx = makeContext({
      method: 'POST',
      path: '/api/properties',
      user: { ...clientUser, roles: ['OWNER'] },
    });

    await expect(guard.canActivate(ctx)).rejects.toThrow(
      /Verify your email address via OTP before performing this action/i,
    );
  });

  it('allows protected actions once both email_verified_at and phone_verified_at are verified', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      status: 'ACTIVE',
      email_verified_at: new Date(),
      phone_verified_at: new Date(),
    });

    const userCopy = { ...clientUser };
    const ctx = makeContext({
      method: 'POST',
      path: '/api/enquiries',
      user: userCopy,
    });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(userCopy.emailVerified).toBe(true);
    expect(userCopy.phoneVerified).toBe(true);
    expect(userCopy.contactVerified).toBe(true);
  });

  it('blocks suspended accounts with ForbiddenException', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      status: 'SUSPENDED',
      email_verified_at: new Date(),
      phone_verified_at: new Date(),
    });

    const ctx = makeContext({
      method: 'POST',
      path: '/api/enquiries',
      user: { ...clientUser },
    });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
