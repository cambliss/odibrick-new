import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';

const regularUser: AuthUser = {
  id: 20,
  publicId: 'U20',
  email: 'user@example.com',
  fullName: 'Regular User',
  roles: ['TENANT'],
  permissions: ['property.view'],
};

const kycReviewer: AuthUser = {
  id: 5,
  publicId: 'U5',
  email: 'compliance@odibrick.com',
  fullName: 'Compliance Officer',
  roles: ['KYC_TEAM'],
  permissions: ['kyc.review', 'kyc.verify'],
};

describe('KycService', () => {
  let service: KycService;
  let db: jest.Mocked<Partial<DatabaseService>>;
  let audit: jest.Mocked<Partial<AuditService>>;
  let notify: jest.Mocked<Partial<NotificationsService>>;
  let config: jest.Mocked<Partial<ConfigService>>;

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notify = { send: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'auth.fieldKey') return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        if (key === 'providers.kyc') return 'manual';
        return null;
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notify },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = moduleRef.get(KycService);
  });

  describe('isStaff', () => {
    it('returns false for regular tenants and owners', () => {
      expect(service.isStaff(regularUser)).toBe(false);
    });

    it('returns true for compliance and admin roles', () => {
      expect(service.isStaff(kycReviewer)).toBe(true);
      expect(service.isStaff({ ...regularUser, roles: ['SUPER_ADMIN'] })).toBe(true);
      expect(service.isStaff({ ...regularUser, permissions: ['kyc.verify'] })).toBe(true);
    });
  });

  describe('status', () => {
    it('returns KYC status and document records for user', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        user_id: 20,
        status: 'VERIFIED',
        legal_name: 'Regular User',
        id_type: 'AADHAAR',
        id_last4: '1234',
      });
      (db.query as jest.Mock).mockResolvedValueOnce([
        { id: 10, title: 'Aadhaar Front', verification_status: 'VERIFIED' },
      ]);

      const res = await service.status(regularUser);
      expect(res.status).toBe('VERIFIED');
      expect(res.documents).toHaveLength(1);
    });
  });

  describe('submit', () => {
    it('rejects submission when contact OTP verification is incomplete', async () => {
      const unverifiedUser: AuthUser = {
        ...regularUser,
        emailVerified: true,
        phoneVerified: false,
        contactVerified: false,
      };
      await expect(
        service.submit(unverifiedUser, {
          legalName: 'Regular User',
          idType: 'PAN',
          idNumber: 'ABCDE1234F',
        }),
      ).rejects.toThrow(/Verify your mobile number via OTP/i);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('rejects submission if identity is already verified', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'VERIFIED' });

      await expect(
        service.submit(regularUser, {
          legalName: 'Regular User',
          idType: 'PAN',
          idNumber: 'ABCDE1234F',
        }),
      ).rejects.toThrow(/already verified/i);
    });

    it('rejects submission if documents are currently under review', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'UNDER_REVIEW' });

      await expect(
        service.submit(regularUser, {
          legalName: 'Regular User',
          idType: 'PAN',
          idNumber: 'ABCDE1234F',
        }),
      ).rejects.toThrow(/already under review/i);
    });

    it('successfully submits KYC with encrypted idNumber and notifies compliance', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null); // no prior KYC
      (db.insert as jest.Mock).mockResolvedValueOnce(42);

      const res = await service.submit(regularUser, {
        legalName: 'Regular User',
        idType: 'PAN',
        idNumber: 'ABCDE1234F',
        documentIds: [101, 102],
      });

      expect(res.id).toBe(42);
      expect(res.status).toBe('UNDER_REVIEW');
      expect(db.insert).toHaveBeenCalledWith(
        'kyc_records',
        expect.objectContaining({
          user_id: 20,
          id_last4: '234F',
          status: 'UNDER_REVIEW',
        }),
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE documents SET entity_type'),
        expect.any(Array),
      );
      expect(notify.send).toHaveBeenCalledWith(20, 'KYC_SUBMITTED', expect.any(Object));
      expect(audit.record).toHaveBeenCalled();
    });
  });

  describe('verify', () => {
    it('throws NotFoundException if KYC record does not exist', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.verify(kycReviewer, 999, {})).rejects.toBeInstanceOf(NotFoundException);
    });

    it('marks KYC record and linked documents as VERIFIED', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 42, user_id: 20, status: 'UNDER_REVIEW' });

      const res = await service.verify(kycReviewer, 42, { internalNotes: 'Clear match' });
      expect(res.status).toBe('VERIFIED');
      expect(db.update).toHaveBeenCalledWith(
        'kyc_records',
        42,
        expect.objectContaining({
          status: 'VERIFIED',
          reviewer_id: kycReviewer.id,
          internal_notes: 'Clear match',
        }),
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE documents SET verification_status = 'VERIFIED'"),
        [kycReviewer.id, 42, 20],
      );
      expect(notify.send).toHaveBeenCalledWith(20, 'KYC_APPROVED', expect.any(Object));
    });
  });

  describe('reject', () => {
    it('throws BadRequestException if rejection reason is missing or too short', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 42, user_id: 20, status: 'UNDER_REVIEW' });
      await expect(service.reject(kycReviewer, 42, { reason: '  ' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('marks KYC as REJECTED and notifies user with reason', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 42, user_id: 20, status: 'UNDER_REVIEW' });

      const res = await service.reject(kycReviewer, 42, { reason: 'PAN image is blurry' });
      expect(res.status).toBe('REJECTED');
      expect(res.rejectionReason).toBe('PAN image is blurry');
      expect(db.update).toHaveBeenCalledWith(
        'kyc_records',
        42,
        expect.objectContaining({
          status: 'REJECTED',
          rejection_reason: 'PAN image is blurry',
        }),
      );
      expect(notify.send).toHaveBeenCalledWith(20, 'KYC_REJECTED', expect.any(Object));
    });
  });

  describe('requestAdditionalDocuments', () => {
    it('updates status to DOCUMENTS_PENDING and sends explanation', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 42, user_id: 20, status: 'UNDER_REVIEW' });

      const res = await service.requestAdditionalDocuments(kycReviewer, 42, {
        reason: 'Please upload address proof matching current address',
      });
      expect(res.status).toBe('DOCUMENTS_PENDING');
      expect(db.update).toHaveBeenCalledWith(
        'kyc_records',
        42,
        expect.objectContaining({
          status: 'DOCUMENTS_PENDING',
        }),
      );
      expect(notify.send).toHaveBeenCalledWith(20, 'KYC_ADDITIONAL_DOCS_REQUESTED', expect.any(Object));
    });
  });
});
