import { Test } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycService } from './kyc.service';
import { KycCryptoService } from './kyc-crypto.service';
import { KycTransitionService } from './kyc-transition.service';
import { KYC_CONSENT_VERSION } from './kyc-consent';
import { SubmitKycDto } from './kyc.dto';
import { VerificationOrchestrator } from './verification/verification.orchestrator';
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
  let txConn: { execute: jest.Mock; query: jest.Mock };
  let audit: jest.Mocked<Partial<AuditService>>;
  let notify: jest.Mocked<Partial<NotificationsService>>;
  let config: jest.Mocked<Partial<ConfigService>>;
  let transitions: jest.Mocked<Partial<KycTransitionService>>;
  let orchestrator: jest.Mocked<Partial<VerificationOrchestrator>>;

  const validSubmitDto = (): SubmitKycDto => ({
    legalName: 'Regular User',
    passport: {
      documentId: 101,
      number: 'P1234567',
      issuingCountry: 'IND',
      dateOfBirth: '1992-05-14',
      expiryDate: '2032-05-14',
    },
    supportingDocuments: [{ documentId: 102, type: 'PAN', number: 'ABCDE1234F' }],
    consents: [
      { purpose: 'KYC_PROCESSING', version: KYC_CONSENT_VERSION, accepted: true },
    ],
  });

  beforeEach(async () => {
    txConn = {
      execute: jest.fn().mockResolvedValue([{ affectedRows: 1, insertId: 1 }]),
      query: jest.fn().mockResolvedValue([[{ max_no: 0 }]]),
    };
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(async (fn: (conn: any) => Promise<any>) => fn(txConn)),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notify = { send: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'auth.fieldKey') return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        if (key === 'kyc.submissionEnabled') return true;
        if (key === 'kyc.hmacKey') return 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
        if (key === 'kyc.hmacKeyVersion') return 1;
        if (key === 'providers.kyc') return 'manual';
        return null;
      }),
    };
    transitions = {
      transition: jest.fn().mockResolvedValue({ from: 'REJECTED', to: 'SUBMITTED', version: 2 }),
    };
    orchestrator = {
      providerKey: 'manual',
      run: jest.fn().mockResolvedValue({ applied: true, status: 'UNDER_REVIEW', reasonCode: 'MANUAL_REVIEW' }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        KycService,
        KycCryptoService,
        { provide: KycTransitionService, useValue: transitions },
        { provide: VerificationOrchestrator, useValue: orchestrator },
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
    it('blocks new submissions when KYC_SUBMISSION_ENABLED is false', async () => {
      (config.get as jest.Mock).mockImplementation((key: string) =>
        key === 'kyc.submissionEnabled' ? false : null,
      );

      await expect(service.submit(regularUser, validSubmitDto())).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'KYC_SUBMISSION_DISABLED' }),
      });
      expect(db.one).not.toHaveBeenCalled();
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('blocks resubmissions when KYC_SUBMISSION_ENABLED is unset or false', async () => {
      (config.get as jest.Mock).mockImplementation(() => undefined);
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 42, status: 'REJECTED', decision_version: 1 });

      await expect(service.submit(regularUser, validSubmitDto())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects submission when contact OTP verification is incomplete', async () => {
      const unverifiedUser: AuthUser = {
        ...regularUser,
        emailVerified: true,
        phoneVerified: false,
        contactVerified: false,
      };
      await expect(service.submit(unverifiedUser, validSubmitDto())).rejects.toThrow(
        /Verify your mobile number via OTP/i,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('fails closed when KYC_HMAC_KEY is not configured', async () => {
      (config.get as jest.Mock).mockImplementation(() => null);
      await expect(service.submit(regularUser, validSubmitDto())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects submission when KYC_PROCESSING consent is missing or not accepted', async () => {
      const dto = validSubmitDto();
      dto.consents = [{ purpose: 'KYC_PROCESSING', version: KYC_CONSENT_VERSION, accepted: false }];

      await expect(service.submit(regularUser, dto)).rejects.toBeInstanceOf(BadRequestException);
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('rejects submission if identity is already verified', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'VERIFIED', decision_version: 1 });

      await expect(service.submit(regularUser, validSubmitDto())).rejects.toThrow(
        /already verified/i,
      );
    });

    it('rejects submission if documents are currently under review', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ id: 1, status: 'UNDER_REVIEW', decision_version: 1 });

      await expect(service.submit(regularUser, validSubmitDto())).rejects.toThrow(
        /already under review/i,
      );
    });

    it('rejects submission when a referenced document belongs to another user', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null); // no prior KYC
      (db.query as jest.Mock).mockResolvedValueOnce([
        { id: 101, owner_user_id: regularUser.id, is_active: 1 },
        { id: 102, owner_user_id: 999, is_active: 1 },
      ]);

      await expect(service.submit(regularUser, validSubmitDto())).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(db.transaction).not.toHaveBeenCalled();
    });

    it('successfully submits passport-first KYC, hashes passport number with HMAC, records consent, and runs orchestrator', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce(null) // no prior KYC
        .mockResolvedValueOnce({ date_of_birth: '1992-05-14' }); // user_profiles
      (db.query as jest.Mock)
        .mockResolvedValueOnce([
          { id: 101, owner_user_id: regularUser.id, is_active: 1 },
          { id: 102, owner_user_id: regularUser.id, is_active: 1 },
        ])
        .mockResolvedValueOnce([]); // no duplicate HMAC
      txConn.execute
        .mockResolvedValueOnce([{ insertId: 42, affectedRows: 1 }]) // kyc_records
        .mockResolvedValue([{ affectedRows: 1, insertId: 7 }]); // subsequent inserts/updates (attemptId = 7)

      const res = await service.submit(regularUser, validSubmitDto());

      expect(res).toEqual({ id: 42, status: 'UNDER_REVIEW', attemptId: 7 });
      expect(txConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kyc_records'),
        [regularUser.id, 'Regular User', '4567', 'manual', 101],
      );
      expect(txConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kyc_identity_documents'),
        expect.arrayContaining([42, 101, 'IND', 'Regular User', '4567']),
      );
      expect(txConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO kyc_consents'),
        expect.arrayContaining([regularUser.id, 42, 'KYC_PROCESSING', KYC_CONSENT_VERSION]),
      );
      expect(txConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE documents'),
        [42, 42, regularUser.id, 101, 102],
      );
      expect(orchestrator.run).toHaveBeenCalledWith(42, 7);
      expect(notify.send).toHaveBeenCalledWith(20, 'KYC_SUBMITTED', expect.any(Object));
      expect(audit.record).toHaveBeenCalled();
    });

    it('allows resubmission from REJECTED via KycTransitionService and supersedes prior identity docs', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ id: 42, user_id: 20, status: 'REJECTED', decision_version: 2 })
        .mockResolvedValueOnce(null); // user_profiles
      (db.query as jest.Mock)
        .mockResolvedValueOnce([
          { id: 101, owner_user_id: regularUser.id, is_active: 1 },
          { id: 102, owner_user_id: regularUser.id, is_active: 1 },
        ])
        .mockResolvedValueOnce([]); // no duplicate HMAC
      txConn.query.mockResolvedValueOnce([[{ max_no: 1 }]]);
      txConn.execute.mockResolvedValue([{ affectedRows: 1, insertId: 9 }]);

      const res = await service.submit(regularUser, validSubmitDto());

      expect(res).toEqual({ id: 42, status: 'UNDER_REVIEW', attemptId: 9 });
      expect(transitions.transition).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'SUBMITTED',
          actor: 'USER',
          by: regularUser,
        }),
      );
      expect(txConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE kyc_identity_documents SET status = 'SUPERSEDED'"),
        [42],
      );
      expect(orchestrator.run).toHaveBeenCalledWith(42, 9);
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
