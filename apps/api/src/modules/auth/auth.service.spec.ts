import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';

describe('AuthService', () => {
  let service: AuthService;
  let db: jest.Mocked<Partial<DatabaseService>>;

  const config = {
    get: (key: string) =>
      ({ 'auth.accessSecret': 's', 'auth.accessTtl': 900, 'auth.refreshTtlDays': 30, 'auth.pepper': 'p' } as any)[key],
  };

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: db },
        { provide: ConfigService, useValue: config },
        { provide: JwtService, useValue: { signAsync: jest.fn().mockResolvedValue('token') } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('does not let anyone self-register into a staff role', async () => {
    await expect(
      service.register({ fullName: 'X', email: 'x@y.com', password: 'longpassword1', role: 'ADMIN' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('gives the same error for an unknown email as for a wrong password', async () => {
    (db.one as jest.Mock).mockResolvedValue(null);
    await expect(service.login({ email: 'nobody@x.com', password: 'whatever' })).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes the whole token family when a rotated refresh token is replayed', async () => {
    (db.one as jest.Mock).mockResolvedValue({
      id: 1, user_id: 4, family_id: 'fam', expires_at: new Date(Date.now() + 1000), revoked_at: new Date(),
    });
    await expect(service.refresh('replayed')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('family_id = ?'), ['fam']);
  });
});
