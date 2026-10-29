import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { RentalService } from './rental.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';

const tenant: AuthUser = {
  id: 20, publicId: 'U20', email: 'tenant@example.com', fullName: 'Test Tenant',
  roles: ['TENANT'], permissions: ['application.create', 'enquiry.create'],
};

const owner: AuthUser = {
  id: 10, publicId: 'U10', email: 'owner@example.com', fullName: 'Property Owner',
  roles: ['OWNER'], permissions: ['property.create', 'application.decide'],
};

const admin: AuthUser = {
  id: 1, publicId: 'U1', email: 'admin@odibrick.com', fullName: 'Super Admin',
  roles: ['SUPER_ADMIN'], permissions: ['tenancy.manage'],
};

describe('RentalService', () => {
  let service: RentalService;
  let db: jest.Mocked<Partial<DatabaseService>>;
  let audit: jest.Mocked<Partial<AuditService>>;
  let notify: jest.Mocked<Partial<NotificationsService>>;

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(async (fn: any) => fn({
        execute: jest.fn().mockResolvedValue([{ insertId: 99, affectedRows: 1 }]),
      })),
      nextSequence: jest.fn().mockResolvedValue(1),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notify = {
      send: jest.fn().mockResolvedValue(undefined),
      sendMany: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RentalService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notify },
      ],
    }).compile();

    service = moduleRef.get(RentalService);
  });

  describe('createEnquiry', () => {
    it('blocks enquiry creation when email or mobile OTP verification is incomplete', async () => {
      const unverifiedTenant: AuthUser = {
        ...tenant,
        emailVerified: true,
        phoneVerified: false,
        contactVerified: false,
      };
      await expect(service.createEnquiry(unverifiedTenant, { propertyId: 101 })).rejects.toThrow(
        /Verify your mobile number via OTP/i,
      );
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('disallows an owner from enquiring about their own property', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 101, listed_by_user_id: owner.id, title: 'Villa' });
      await expect(service.createEnquiry(owner, { propertyId: 101 })).rejects.toThrow(
        /cannot enquire about your own listing/i,
      );
    });

    it('returns ALREADY_SENT when an enquiry was already made in the past 24 hours', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ id: 101, listed_by_user_id: 999, title: 'Villa' }) // activeProperty
        .mockResolvedValueOnce({ id: 50 }); // recent enquiry check

      const res = await service.createEnquiry(tenant, { propertyId: 101, message: 'Interested' });
      expect(res.status).toBe('ALREADY_SENT');
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('successfully creates an enquiry, increments count, and notifies the listing owner', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ id: 101, listed_by_user_id: 10, title: 'Villa Green' })
        .mockResolvedValueOnce(null); // no recent enquiry
      (db.insert as jest.Mock).mockResolvedValueOnce(77);

      const res = await service.createEnquiry(tenant, { propertyId: 101, message: 'When can I visit?' });
      expect(res.status).toBe('NEW');
      expect(res.id).toBe(77);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE properties SET enquiry_count'),
        [101],
      );
      expect(notify.send).toHaveBeenCalledWith(10, 'APPLICATION_SUBMITTED', expect.any(Object));
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('decide', () => {
    it('throws NotFoundException if application does not exist', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.decide(owner, 999, { decision: 'REJECT' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException if a non-owner without permissions tries to decide', async () => {
      const unauthorizedUser: AuthUser = { ...tenant, permissions: [] };
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 12, listed_by_user_id: 999 });
      await expect(service.decide(unauthorizedUser, 12, { decision: 'ACCEPT' })).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('rejects an application cleanly with decision notes', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 12,
        listed_by_user_id: owner.id,
        tenant_user_id: tenant.id,
        title: 'Penthouse',
        status: 'SUBMITTED',
      });

      const res = await service.decide(owner, 12, {
        decision: 'REJECT',
        note: 'Credit score below threshold',
      });
      expect(res.status).toBe('REJECTED');
      expect(db.update).toHaveBeenCalledWith(
        'applications',
        12,
        expect.objectContaining({
          status: 'REJECTED',
          decided_by: owner.id,
          decision_note: 'Credit score below threshold',
        }),
      );
      expect(notify.send).toHaveBeenCalledWith(tenant.id, 'APPLICATION_ACCEPTED', expect.any(Object));
    });
  });

  describe('adminOverrideTenancy', () => {
    it('throws NotFoundException if tenancy does not exist', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null);
      await expect(
        service.adminOverrideTenancy(admin, 999, { action: 'FORCE_CLOSE', reason: 'Dispute fixture cleanup' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException if user lacks tenancy.manage permission', async () => {
      const unauthorizedAdmin: AuthUser = { ...admin, permissions: [] };
      await expect(
        service.adminOverrideTenancy(unauthorizedAdmin, 1, { action: 'FORCE_CLOSE', reason: 'Cleanup' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException if tenancy is already closed on FORCE_CLOSE', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        property_id: 10,
        property_title: 'Villa',
        stage: 'CLOSED',
        owner_user_id: 10,
        tenant_user_id: 20,
      });
      await expect(
        service.adminOverrideTenancy(admin, 1, { action: 'FORCE_CLOSE', reason: 'Repeat close' }),
      ).rejects.toThrow(/already closed/i);
    });

    it('throws BadRequestException if tenancy is closed on HOLD', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        property_id: 10,
        property_title: 'Villa',
        stage: 'CLOSED',
        owner_user_id: 10,
        tenant_user_id: 20,
      });
      await expect(
        service.adminOverrideTenancy(admin, 1, { action: 'HOLD', reason: 'Hold attempt' }),
      ).rejects.toThrow(/cannot put a closed tenancy on hold/i);
    });

    it('transitions tenancy to CLOSED on FORCE_CLOSE and records audit and timeline', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 8888,
        property_id: 1,
        property_title: 'Villa Prime',
        stage: 'ACTIVE',
        owner_user_id: 10,
        tenant_user_id: 20,
      });

      const res = await service.adminOverrideTenancy(admin, 8888, {
        action: 'FORCE_CLOSE',
        reason: 'Legacy test fixture cleanup',
      });

      expect(res.stage).toBe('CLOSED');
      expect(db.update).toHaveBeenCalledWith('tenancies', 8888, expect.objectContaining({ stage: 'CLOSED' }));
      expect(notify.sendMany).toHaveBeenCalledWith([10, 20], 'INFO', expect.any(Object));
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'management.tenancy.closed',
          objectId: 8888,
        }),
      );
    });
  });

  describe('tenancyDetail', () => {
    it('throws NotFoundException when tenancy id does not exist', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.tenancyDetail(tenant, 9999)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException if non-party and non-staff attempts access', async () => {
      const outsider: AuthUser = { id: 999, publicId: 'OUT', email: 'out@example.com', fullName: 'Outsider', roles: [], permissions: [] };
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        owner_user_id: 10,
        tenant_user_id: 20,
      });
      await expect(service.tenancyDetail(outsider, 1)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns tenancy details with financial summary and agreement', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        property_id: 10,
        owner_user_id: 10,
        tenant_user_id: 20,
        stage: 'ACTIVE',
        title: 'Lakeview Apartment',
        rent_amount: 45000,
        deposit_amount: 90000,
      });

      (db.query as jest.Mock)
        .mockResolvedValueOnce([{ id: 101, status: 'EXECUTED' }]) // agreements
        .mockResolvedValueOnce([]) // payments
        .mockResolvedValueOnce([]) // meetings
        .mockResolvedValueOnce([]) // inspections
        .mockResolvedValueOnce([{ id: 50, case_number: 'LGL-1', status: 'CLOSED' }]) // legalCases
        .mockResolvedValueOnce([]) // timeline
        .mockResolvedValueOnce([]) // maintenance
        .mockResolvedValueOnce([]); // disputes

      const res = await service.tenancyDetail(tenant, 1);
      expect(res.tenancy.id).toBe(1);
      expect(res.tenancy.stage).toBe('ACTIVE');
      expect(res.agreement?.id).toBe(101);
      expect(res.legalCase?.id).toBe(50);
    });
  });
});
