import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuthUser } from '../../common/auth/auth.types';

const testTenant: AuthUser = {
  id: 20,
  publicId: 'U20',
  email: 'tenant@example.com',
  fullName: 'Arjun Verma',
  roles: ['TENANT'],
  permissions: ['property.view'],
};

describe('UsersService', () => {
  let service: UsersService;
  let db: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('profile', () => {
    it('aggregates account, profile, tenant, owner, and kyc details for authenticated user', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ id: 20, full_name: 'Arjun Verma', email: 'tenant@example.com' }) // users
        .mockResolvedValueOnce({ city: 'Bengaluru', occupation: 'Engineer' }) // user_profiles
        .mockResolvedValueOnce(null) // owners
        .mockResolvedValueOnce({ household_type: 'FAMILY', occupants: 3 }) // tenants
        .mockResolvedValueOnce(null) // agents
        .mockResolvedValueOnce(null) // builders
        .mockResolvedValueOnce({ status: 'VERIFIED' }); // kyc_records

      const res = await service.profile(testTenant);
      expect((res.account as any)?.id).toBe(20);
      expect((res.profile as any)?.city).toBe('Bengaluru');
      expect((res.tenant as any)?.occupants).toBe(3);
      expect((res.kyc as any)?.status).toBe('VERIFIED');
      expect(res.roles).toEqual(['TENANT']);
    });
  });

  describe('updateProfile', () => {
    it('updates user full_name and executes user_profiles upsert', async () => {
      (db.one as jest.Mock).mockResolvedValue({ id: 20, full_name: 'Arjun V. Patel' });

      await service.updateProfile(testTenant, {
        fullName: 'Arjun V. Patel',
        city: 'Bengaluru',
        occupation: 'Software Architect',
        tenant: { householdType: 'BACHELOR', occupants: 1 },
      });

      expect(db.update).toHaveBeenCalledWith('users', 20, { full_name: 'Arjun V. Patel' });
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_profiles'),
        expect.any(Array),
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE tenants SET'),
        expect.any(Array),
      );
    });
  });

  describe('publicProfile', () => {
    it('throws NotFoundException when publicId does not exist', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.publicProfile('NON_EXISTENT')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns sanitized public profile without exposing private phone or email', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        public_id: 'PUB-123',
        full_name: 'Odibrick Realty',
        created_at: '2026-01-01',
        agency_name: 'Odibrick Realty LLC',
        rera_number: 'PRM/KA/RERA/1251/310/PR/210326/004033',
        agent_status: 'VERIFIED',
        rating: 4.8,
        active_listings: 12,
        kyc_status: 'VERIFIED',
      });

      const res = await service.publicProfile('PUB-123');
      expect(res.publicId).toBe('PUB-123');
      expect(res.name).toBe('Odibrick Realty LLC');
      expect(res.identityVerified).toBe(true);
      expect(res.activeListings).toBe(12);
      expect((res as any).email).toBeUndefined();
      expect((res as any).phone).toBeUndefined();
    });
  });

  describe('toggleSaved', () => {
    it('removes saved property if already saved', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ property_id: 101 });

      const res = await service.toggleSaved(testTenant, 101);
      expect(res.saved).toBe(false);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM saved_properties'),
        [20, 101],
      );
    });

    it('adds saved property if not previously saved', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null);

      const res = await service.toggleSaved(testTenant, 101);
      expect(res.saved).toBe(true);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO saved_properties'),
        [20, 101],
      );
    });
  });

  describe('dashboardSummary', () => {
    it('generates actionable tasks for unverified KYC and due payments', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce(null) // KYC is unverified
        .mockResolvedValueOnce({ c: 3 }); // 3 unread notifications

      (db.query as jest.Mock)
        .mockResolvedValueOnce([
          { id: 1, reference_code: 'ODB-PAY-1', purpose: 'RENT', total_amount: 35000, due_date: '2026-11-01' },
        ]) // duePayments
        .mockResolvedValueOnce([]) // openDisputes
        .mockResolvedValueOnce([]) // activeTenancies
        .mockResolvedValueOnce([]); // pendingApplications

      const res = await service.dashboardSummary(testTenant);
      expect(res.unreadNotifications).toBe(3);
      expect(res.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Verify your identity to list or apply', href: '/dashboard/kyc' }),
          expect.objectContaining({ label: expect.stringContaining('Pay rent — INR 35000'), href: '/dashboard/payments' }),
        ]),
      );
    });
  });
});
