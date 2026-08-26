import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AccessTokenPayload, AuthUser, RoleCode } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { randomToken, sha256 } from '../../common/util/crypto';
import { LoginDto, RegisterDto } from './auth.dto';

const SELF_SERVICE_ROLES: RoleCode[] = ['TENANT', 'OWNER', 'AGENT', 'BUILDER'];
const MAX_FAILED_ATTEMPTS = 8;
const LOCK_MINUTES = 15;

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
  async register(dto: RegisterDto, req?: Request): Promise<{ user: AuthUser } & TokenPair> {
    if (!SELF_SERVICE_ROLES.includes(dto.role)) {
      throw new ForbiddenException('Staff accounts are created by an administrator.');
    }

    const existing = await this.db.one<{ id: number }>(
      'SELECT id FROM users WHERE email = ? OR (phone IS NOT NULL AND phone = ?) LIMIT 1',
      [dto.email.toLowerCase(), dto.phone ?? null],
    );
    if (existing) throw new ConflictException('An account already exists with this email or phone.');

    const passwordHash = await this.hashPassword(dto.password);
    const publicId = newPublicId();

    const userId = await this.db.transaction(async (conn) => {
      const [res]: any = await conn.execute(
        `INSERT INTO users (public_id, email, phone, password_hash, full_name, status)
         VALUES (?, ?, ?, ?, ?, 'ACTIVE')`,
        [publicId, dto.email.toLowerCase(), dto.phone ?? null, passwordHash, dto.fullName],
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
            dto.organisationName ?? dto.fullName,
          ]);
          break;
        case 'BUILDER':
          await conn.execute('INSERT INTO builders (user_id, company_name) VALUES (?, ?)', [
            id,
            dto.organisationName ?? dto.fullName,
          ]);
          break;
      }
      return id;
    });

    const user = await this.loadAuthUser(userId);
    await this.audit.record({ actor: user, action: 'auth.registered', objectType: 'user', objectId: userId, req });
    const tokens = await this.issueTokens(user, req);
    return { user, ...tokens };
  }

  // --------------------------------------------------------------------- login
  async login(dto: LoginDto, req?: Request): Promise<{ user: AuthUser } & TokenPair> {
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
    return { user, ...tokens };
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

  // ------------------------------------------------------------------ internals
  async loadAuthUser(userId: number): Promise<AuthUser> {
    const user = await this.db.one<any>(
      'SELECT id, public_id, email, full_name FROM users WHERE id = ? AND deleted_at IS NULL',
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

    return {
      id: user.id,
      publicId: user.public_id,
      email: user.email,
      fullName: user.full_name,
      roles: roles.map((r) => r.code),
      permissions: perms.map((p) => p.code),
    };
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
    const fwd = (req.headers['x-forwarded-for'] as string) ?? '';
    return (fwd.split(',')[0] || req.socket.remoteAddress || '').slice(0, 45) || null;
  }
}
