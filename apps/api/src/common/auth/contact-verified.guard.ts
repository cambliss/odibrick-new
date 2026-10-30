import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { ALLOW_UNVERIFIED_CONTACT_KEY, IS_PUBLIC_KEY } from './decorators';
import { AuthUser, STAFF_ROLES } from './auth.types';

const EXEMPT_PATH_PATTERNS = [
  /^\/(?:api\/)?notifications\/read$/i,
];

@Injectable()
export class ContactVerifiedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const allowUnverified = this.reflector.getAllAndOverride<boolean>(ALLOW_UNVERIFIED_CONTACT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowUnverified) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const user = (req as any).user as AuthUser | undefined;
    if (!user) return true;

    // Platform staff roles are provisioned by administrators and exempt from self-registration gates.
    if (user.roles?.some((r) => STAFF_ROLES.includes(r))) {
      return true;
    }

    // Preserve read-only browsing and access to verification/profile/dashboard screens.
    const method = (req.method ?? 'GET').toUpperCase();
    if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      return true;
    }

    const rawPath = (req.path || req.originalUrl || '').split('?')[0];
    if (EXEMPT_PATH_PATTERNS.some((re) => re.test(rawPath))) {
      return true;
    }

    const row = await this.db.one<{
      status: string;
      email_verified_at: Date | string | null;
      phone_verified_at: Date | string | null;
    }>(
      'SELECT status, email_verified_at, phone_verified_at FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1',
      [user.id],
    );

    if (!row || row.status === 'SUSPENDED' || row.status === 'DISABLED') {
      throw new ForbiddenException('This account is not active. Contact Odibrick support.');
    }

    const emailVerified = Boolean(row.email_verified_at);
    const phoneVerified = Boolean(row.phone_verified_at);
    user.emailVerified = emailVerified;
    user.phoneVerified = phoneVerified;
    user.contactVerified = emailVerified && phoneVerified;

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

    return true;
  }
}
