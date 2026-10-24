import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LegalService } from './legal.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { StorageService } from '../storage/storage.service';
import { AuthUser } from '../../common/auth/auth.types';

const tenant: AuthUser = {
  id: 20, publicId: 'T1', email: 't@example.com', fullName: 'Tenant', roles: ['TENANT'], permissions: ['agreement.sign'],
};
const lawyer: AuthUser = {
  id: 3, publicId: 'L1', email: 'l@odibrick.com', fullName: 'Counsel',
  roles: ['LEGAL_TEAM'], permissions: ['agreement.draft', 'agreement.approve', 'legal.case.manage'],
};

describe('LegalService', () => {
  let service: LegalService;
  let db: jest.Mocked<Partial<DatabaseService>>;
  let notify: { send: jest.Mock; sendMany: jest.Mock };
  let mockConn: any;

  beforeEach(async () => {
    notify = {
      send: jest.fn().mockResolvedValue(undefined),
      sendMany: jest.fn().mockResolvedValue(undefined),
    };
    mockConn = {
      execute: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE') || sql.includes('FROM tenancies WHERE id = ?')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM agreements') && sql.includes('FOR UPDATE')) {
          return [[{
            id: 1,
            tenancy_id: 7,
            status: 'APPROVED_BY_LEGAL',
            current_version: 1,
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'IN-DL1234567890',
            legal_case_id: 2,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        if (sql.includes('FROM payments') && sql.includes("purpose IN ('SERVICE_FEE', 'COMMISSION')")) {
          return [[{ id: 10, status: 'PAID' }]];
        }
        return [[]];
      }),
    };
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(async (fn: any) => fn(mockConn)),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LegalService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: notify },
        { provide: PaymentsService, useValue: { raiseMoveInDues: jest.fn() } },
        { provide: StorageService, useValue: { store: jest.fn(), registerDocument: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(LegalService);
  });

  it('refuses a signature on a draft the legal team has not approved', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 1, status: 'AWAITING_SIGNATURES', approved_by: null, tenancy_id: 7, current_version: 1,
    });
    await expect(service.sign(tenant, 1, { consent: true })).rejects.toThrow(
      /not been approved by the legal team/,
    );
  });

  it('refuses signature if current agreement version is unapproved', async () => {
    (db.one as jest.Mock)
      .mockResolvedValueOnce({ id: 1, status: 'AWAITING_SIGNATURES', approved_by: 3, current_version: 1, tenancy_id: 7 })
      .mockResolvedValueOnce({ version: 1, reviewed_at: null }); // unapproved version
    await expect(service.sign(tenant, 1, { consent: true })).rejects.toThrow(
      /current agreement version has not been approved/,
    );
  });

  it('refuses signature on a stale or superseded agreement version', async () => {
    (db.one as jest.Mock)
      .mockResolvedValueOnce({ id: 1, status: 'AWAITING_SIGNATURES', approved_by: 3, current_version: 2, tenancy_id: 7 })
      .mockResolvedValueOnce({ version: 2, reviewed_at: new Date() });
    await expect(service.sign(tenant, 1, { consent: true, version: 1 })).rejects.toThrow(
      /Cannot sign version 1; current approved version is 2/,
    );
  });

  it('first signature does not execute agreement and returns PARTIALLY_SIGNED', async () => {
    (db.one as jest.Mock)
      .mockResolvedValueOnce({ id: 1, status: 'AWAITING_SIGNATURES', approved_by: 3, current_version: 1, tenancy_id: 7 })
      .mockResolvedValueOnce({ version: 1, reviewed_at: new Date() })
      .mockResolvedValueOnce({ id: 101, agreement_id: 1, user_id: tenant.id, status: 'PENDING' })
      .mockResolvedValueOnce({ c: 1 }); // 1 signature still pending

    const res = await service.sign(tenant, 1, { consent: true, version: 1 });
    expect(res).toEqual({ status: 'PARTIALLY_SIGNED', pendingSignatures: 1 });
    expect(db.update).toHaveBeenCalledWith('agreements', 1, { status: 'PARTIALLY_SIGNED' });
    expect(db.update).not.toHaveBeenCalledWith('agreements', 1, expect.objectContaining({ status: 'EXECUTED' }));
  });

  it('second signature does not execute agreement before payment and transitions to AWAITING_PAYMENT', async () => {
    (db.one as jest.Mock)
      .mockResolvedValueOnce({
        id: 1, agreement_number: 'ODB-AGR-2026-000001', status: 'PARTIALLY_SIGNED',
        approved_by: 3, current_version: 1, tenancy_id: 7, legal_case_id: 2, agreement_type: 'LEAVE_AND_LICENSE',
      })
      .mockResolvedValueOnce({ version: 1, reviewed_at: new Date() })
      .mockResolvedValueOnce({ id: 102, agreement_id: 1, user_id: tenant.id, status: 'PENDING' })
      .mockResolvedValueOnce({ c: 0 }) // 0 pending signatures (both signed)
      .mockResolvedValueOnce({ id: 7, property_id: 5, owner_user_id: 2, tenant_user_id: tenant.id, rent_amount: 30000, deposit_amount: 60000 });

    const paymentsService = (service as any).payments;
    const res = await service.sign(tenant, 1, { consent: true, version: 1 });

    expect(res).toEqual({ status: 'AWAITING_PAYMENT', pendingSignatures: 0 });
    // Agreement status is set to APPROVED_BY_LEGAL, NOT EXECUTED
    expect(db.update).toHaveBeenCalledWith('agreements', 1, { status: 'APPROVED_BY_LEGAL' });
    expect(db.update).not.toHaveBeenCalledWith('agreements', 1, expect.objectContaining({ status: 'EXECUTED' }));
    // Tenancy stage moves to AWAITING_PAYMENT
    expect(db.update).toHaveBeenCalledWith('tenancies', 7, { stage: 'AWAITING_PAYMENT' });
    // Move-in dues are raised for payment
    expect(paymentsService.raiseMoveInDues).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it('refuses approval of a version that is no longer current', async () => {
    (db.one as jest.Mock).mockResolvedValue({ id: 1, current_version: 3, legal_case_id: 2, tenancy_id: 7 });
    await expect(service.approve(lawyer, 1, { version: 2 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('will not redraft an agreement that is already out for signature', async () => {
    (db.one as jest.Mock)
      .mockResolvedValueOnce({ id: 9, tenancy_id: 7, rent_amount: 30000 })
      .mockResolvedValueOnce({ id: 1, status: 'AWAITING_SIGNATURES', current_version: 1 });
    await expect(service.draft(lawyer, 9, { bodyHtml: '<p>x</p>' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assigns advocate, sets status to DOCUMENT_REVIEW and records audit', async () => {
    const result = await service.assign(lawyer, 2, { assigneeId: 3, priority: 'HIGH' });
    expect(db.update).toHaveBeenCalledWith('legal_cases', 2, {
      assigned_to: 3,
      status: 'DOCUMENT_REVIEW',
      priority: 'HIGH',
    });
    expect(result).toEqual({ id: 2, assignedTo: 3 });
  });

  describe('Stamping Verification Workflow', () => {
    it('submits stamping certificate details and leaves status PENDING', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: tenant.id, property_id: 5,
      });

      const res = await service.submitStampingCertificate(tenant, 1, {
        certificateNumber: 'IN-DL1234567890',
        stampAmount: 500,
        state: 'Delhi',
      });

      expect(res).toEqual({
        id: 1,
        stampDutyStatus: 'PENDING',
        stampReference: 'IN-DL1234567890',
        stampDocumentId: undefined,
      });
      expect(db.update).toHaveBeenCalledWith(
        'agreements',
        1,
        expect.objectContaining({
          stamp_reference: 'IN-DL1234567890',
          stamp_amount: 500,
          stamp_state: 'Delhi',
          stamp_duty_status: 'PENDING',
        }),
      );
    });

    it('rejects cross-agreement document references', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: tenant.id, property_id: 5,
        })
        .mockResolvedValueOnce({
          id: 999, document_type: 'STAMPING_DOCUMENT', agreement_id: 2, // belongs to agreement 2, not 1!
        });

      await expect(
        service.submitStampingCertificate(tenant, 1, {
          certificateNumber: 'IN-DL1234567890',
          documentId: 999,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forbids tenant or owner from self-verifying stamping', async () => {
      await expect(
        service.verifyStamping(tenant, 1, { certificateNumber: 'IN-DL1234567890' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids tenant or owner from rejecting stamping', async () => {
      await expect(
        service.rejectStamping(tenant, 1, { reason: 'Blurred image' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('forbids tenant or owner from marking stamping as NOT_APPLICABLE', async () => {
      await expect(
        service.markStampingNotApplicable(tenant, 1, { reason: 'Short term lease' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows authorized staff to verify stamping and records verifier, timestamp, audit, and timeline', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
        stampAmount: 500,
        state: 'Delhi',
      });

      expect(res.id).toBe(1);
      expect(res.stampDutyStatus).toBe('PAID');
      expect(res.stampVerifiedBy).toBe(lawyer.id);
    });

    it('allows authorized staff to reject stamping with clear reason, updating status and notifying parties', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5, stamp_document_id: null,
      });

      const res = await service.rejectStamping(lawyer, 1, {
        reason: 'Certificate number illegible in uploaded document.',
      });

      expect(res).toEqual({
        id: 1,
        stampDutyStatus: 'PENDING',
        stampRejectionReason: 'Certificate number illegible in uploaded document.',
      });
    });

    it('allows authorized staff to record NOT_APPLICABLE with audited reason', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      const res = await service.markStampingNotApplicable(lawyer, 1, {
        reason: 'Commercial sublease exempt under local jurisdiction laws.',
      });

      expect(res.stampDutyStatus).toBe('NOT_APPLICABLE');
      expect(res.stampVerifiedBy).toBe(lawyer.id);
    });

    it('enforces uniform lock order: locks tenancy row before agreement row during stamping verification', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      const executeCalls = mockConn.execute.mock.calls.map((call: any[]) => call[0]);
      const tenancyLockIndex = executeCalls.findIndex((sql: string) =>
        sql.includes('FROM tenancies WHERE id = ? FOR UPDATE'),
      );
      const agreementLockIndex = executeCalls.findIndex((sql: string) =>
        sql.includes('FROM agreements a WHERE a.id = ? FOR UPDATE'),
      );

      expect(tenancyLockIndex).toBeGreaterThanOrEqual(0);
      expect(agreementLockIndex).toBeGreaterThanOrEqual(0);
      expect(tenancyLockIndex).toBeLessThan(agreementLockIndex);
    });

    it('blocks agreement execution when multiple fee obligations exist and one is unpaid', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE') || sql.includes('FROM tenancies WHERE id = ?')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM agreements') && sql.includes('FOR UPDATE')) {
          return [[{
            id: 1,
            tenancy_id: 7,
            status: 'APPROVED_BY_LEGAL',
            current_version: 1,
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'IN-DL1234567890',
            legal_case_id: 2,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        // Multiple fees: one is PAID, but one remains DUE
        if (sql.includes('FROM payments') && sql.includes("purpose IN ('SERVICE_FEE', 'COMMISSION')")) {
          return [[
            { id: 10, status: 'PAID', purpose: 'SERVICE_FEE' },
            { id: 11, status: 'DUE', purpose: 'COMMISSION' },
          ]];
        }
        return [[]];
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      expect(res.executed).toBe(false);
      const updateExecutedCalls = mockConn.execute.mock.calls.filter((call: any[]) =>
        call[0].includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(updateExecutedCalls.length).toBe(0);
    });

    it('executes agreement when all multiple fee obligations are confirmed PAID', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE') || sql.includes('FROM tenancies WHERE id = ?')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM agreements') && sql.includes('FOR UPDATE')) {
          return [[{
            id: 1,
            tenancy_id: 7,
            status: 'APPROVED_BY_LEGAL',
            current_version: 1,
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'IN-DL1234567890',
            legal_case_id: 2,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        // All fees are confirmed PAID
        if (sql.includes('FROM payments') && sql.includes("purpose IN ('SERVICE_FEE', 'COMMISSION')")) {
          return [[
            { id: 10, status: 'PAID', purpose: 'SERVICE_FEE' },
            { id: 11, status: 'PAID', purpose: 'COMMISSION' },
          ]];
        }
        return [[]];
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      expect(res.executed).toBe(true);

      // Explicitly assert that execution updates all four entities:
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE agreements SET status = 'EXECUTED', executed_at = NOW() WHERE id = ?"),
        [1],
      );
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE legal_cases SET status = 'EXECUTED', closed_at = NOW() WHERE id = ?"),
        [2],
      );
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tenancies SET stage = 'CHECK_IN_PENDING' WHERE id = ?"),
        [7],
      );
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE properties SET status = 'RENTED' WHERE id = ?"),
        [5],
      );
    });

    it('rejects certificate submission on an already EXECUTED agreement', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: tenant.id, property_id: 5,
        status: 'EXECUTED',
      });

      await expect(
        service.submitStampingCertificate(tenant, 1, {
          certificateNumber: 'IN-DL1234567890',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects certificate upload on a CANCELLED or SUPERSEDED agreement', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: tenant.id, property_id: 5,
        status: 'SUPERSEDED',
      });

      const mockFile = { buffer: Buffer.from('fake-pdf'), originalname: 'cert.pdf', mimetype: 'application/pdf' } as any;
      await expect(
        service.uploadStampingCertificate(tenant, 1, mockFile, { certificateNumber: 'IN-DL1234567890' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('resets previous verification actor and timestamp upon replacement certificate submission', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: tenant.id, property_id: 5,
        status: 'APPROVED_BY_LEGAL',
        stamp_duty_status: 'PAID',
        stamp_verified_by: 3,
        stamp_verified_at: new Date('2026-01-01'),
      });

      await service.submitStampingCertificate(tenant, 1, {
        certificateNumber: 'IN-DL9999999999',
      });

      expect(db.update).toHaveBeenCalledWith(
        'agreements',
        1,
        expect.objectContaining({
          stamp_reference: 'IN-DL9999999999',
          stamp_duty_status: 'PENDING',
          stamp_verified_by: null,
          stamp_verified_at: null,
        }),
      );
    });

    it('forbids stamping verification on an already EXECUTED agreement', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
        status: 'EXECUTED',
      });

      await expect(
        service.verifyStamping(lawyer, 1, { certificateNumber: 'IN-DL1234567890' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('does NOT dispatch agreement-execution notifications when the transaction fails or rolls back', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      // Transaction fails midway
      (db.transaction as jest.Mock).mockRejectedValueOnce(
        new Error('Transaction deadlock or connection failure'),
      );

      await expect(
        service.verifyStamping(lawyer, 1, { certificateNumber: 'IN-DL1234567890' }),
      ).rejects.toThrow('Transaction deadlock or connection failure');

      // Crucial invariant: No execution notifications sent when transaction fails
      expect(notify.sendMany).not.toHaveBeenCalled();
      expect(notify.send).not.toHaveBeenCalled();
    });

    it('dispatches agreement-execution notifications only after successful transaction commit and exactly once', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      expect(res.executed).toBe(true);

      // Verify notifications dispatched to both parties exactly once
      expect(notify.sendMany).toHaveBeenCalledTimes(1);
      expect(notify.sendMany).toHaveBeenCalledWith(
        [2, 20],
        'AGREEMENT_READY',
        expect.objectContaining({
          title: 'Agreement executed',
          actionUrl: '/dashboard/tenancy/7',
        }),
      );

      expect(notify.send).toHaveBeenCalledTimes(1);
      expect(notify.send).toHaveBeenCalledWith(
        20,
        'CHECK_IN_PENDING',
        expect.objectContaining({
          title: 'Document your home',
          actionUrl: '/dashboard/tenancy/7/check-in',
        }),
      );
    });

    it('does NOT dispatch execution notifications when stamping is verified but fee remains unpaid', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      // Fee obligation is DUE, not PAID
      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE') || sql.includes('FROM tenancies WHERE id = ?')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM agreements') && sql.includes('FOR UPDATE')) {
          return [[{
            id: 1,
            tenancy_id: 7,
            status: 'APPROVED_BY_LEGAL',
            current_version: 1,
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'IN-DL1234567890',
            legal_case_id: 2,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        if (sql.includes('FROM payments') && sql.includes("purpose IN ('SERVICE_FEE', 'COMMISSION')")) {
          return [[{ id: 10, status: 'DUE' }]];
        }
        return [[]];
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      expect(res.executed).toBe(false);
      expect(notify.sendMany).not.toHaveBeenCalled();
      expect(notify.send).not.toHaveBeenCalled();
    });

    it('handles repeated stamping verification idempotently when agreement is already EXECUTED with matching certificate', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        tenancy_id: 7,
        owner_user_id: 2,
        tenant_user_id: 20,
        property_id: 5,
        status: 'EXECUTED',
        stamp_duty_status: 'PAID',
        stamp_reference: 'IN-DL1234567890',
        stamp_verified_by: 3,
        stamp_verified_at: new Date('2026-10-24T10:00:00Z'),
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      expect(res).toEqual({
        id: 1,
        stampDutyStatus: 'PAID',
        stampReference: 'IN-DL1234567890',
        stampVerifiedBy: 3,
        stampVerifiedAt: expect.any(Date),
        executed: true,
      });

      // Crucial idempotency invariants: no transaction run, no audit or notifications repeated
      expect(db.transaction).not.toHaveBeenCalled();
      expect(notify.sendMany).not.toHaveBeenCalled();
      expect(notify.send).not.toHaveBeenCalled();
    });

    it('rejects repeated verification if certificate reference differs on an already EXECUTED agreement', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        tenancy_id: 7,
        owner_user_id: 2,
        tenant_user_id: 20,
        property_id: 5,
        status: 'EXECUTED',
        stamp_duty_status: 'PAID',
        stamp_reference: 'IN-DL1234567890',
      });

      // Different certificate reference submitted on already executed agreement
      await expect(
        service.verifyStamping(lawyer, 1, {
          certificateNumber: 'IN-DL9999999999',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('handles repeated markStampingNotApplicable idempotently when agreement is already EXECUTED with NOT_APPLICABLE', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        tenancy_id: 7,
        owner_user_id: 2,
        tenant_user_id: 20,
        property_id: 5,
        status: 'EXECUTED',
        stamp_duty_status: 'NOT_APPLICABLE',
        stamp_reference: 'NOT_APPLICABLE',
        stamp_verified_by: 3,
      });

      const res = await service.markStampingNotApplicable(lawyer, 1, {
        reason: 'Commercial lease exempt under municipal act',
      });

      expect(res).toEqual({
        id: 1,
        stampDutyStatus: 'NOT_APPLICABLE',
        stampReference: 'NOT_APPLICABLE',
        stampVerifiedBy: 3,
        executed: true,
      });

      expect(db.transaction).not.toHaveBeenCalled();
      expect(notify.sendMany).not.toHaveBeenCalled();
      expect(notify.send).not.toHaveBeenCalled();
    });

    it('retains HTTP 200 success and writes audit record even when post-commit notification dispatch fails', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      // Notification delivery fails after successful commit
      notify.sendMany.mockRejectedValueOnce(new Error('Push notification gateway connection timeout'));

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      // Request succeeds with executed: true and notification warning
      expect(res.executed).toBe(true);
      expect(res.stampDutyStatus).toBe('PAID');
      expect((res as any).notificationWarning).toBeDefined();

      // Audit was still recorded with notificationsDelivered: false
      const auditService = (service as any).audit;
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'agreement.stamping_verified',
          metadata: expect.objectContaining({
            executed: true,
            notificationsDelivered: false,
            notificationError: 'Push notification gateway connection timeout',
          }),
        }),
      );
    });

    it('blocks agreement execution when stamp_verified_by is null across PAID, REGISTERED, and NOT_APPLICABLE', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE') || sql.includes('FROM tenancies WHERE id = ?')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM agreements') && sql.includes('FOR UPDATE')) {
          return [[{
            id: 1,
            tenancy_id: 7,
            status: 'APPROVED_BY_LEGAL',
            current_version: 1,
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: null, // MISSING VERIFIER ID
            stamp_verified_at: new Date(),
            stamp_reference: 'IN-DL1234567890',
            legal_case_id: 2,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        if (sql.includes('FROM payments') && sql.includes("purpose IN ('SERVICE_FEE', 'COMMISSION')")) {
          return [[{ id: 10, status: 'PAID' }]];
        }
        return [[]];
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      expect(res.executed).toBe(false);
      const updateExecutedCalls = mockConn.execute.mock.calls.filter((call: any[]) =>
        call[0].includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(updateExecutedCalls.length).toBe(0);
    });

    it('blocks agreement execution when certificate reference is empty string', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE') || sql.includes('FROM tenancies WHERE id = ?')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM agreements') && sql.includes('FOR UPDATE')) {
          return [[{
            id: 1,
            tenancy_id: 7,
            status: 'APPROVED_BY_LEGAL',
            current_version: 1,
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: '   ', // EMPTY WHITESPACE REFERENCE
            legal_case_id: 2,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        if (sql.includes('FROM payments') && sql.includes("purpose IN ('SERVICE_FEE', 'COMMISSION')")) {
          return [[{ id: 10, status: 'PAID' }]];
        }
        return [[]];
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      expect(res.executed).toBe(false);
      const updateExecutedCalls = mockConn.execute.mock.calls.filter((call: any[]) =>
        call[0].includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(updateExecutedCalls.length).toBe(0);
    });

    it('blocks agreement execution when NOT_APPLICABLE has an incorrect reference in database', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE') || sql.includes('FROM tenancies WHERE id = ?')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM agreements') && sql.includes('FOR UPDATE')) {
          return [[{
            id: 1,
            tenancy_id: 7,
            status: 'APPROVED_BY_LEGAL',
            current_version: 1,
            approved_by: 3,
            stamp_duty_status: 'NOT_APPLICABLE',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'CORRUPT_REF', // Must equal NOT_APPLICABLE
            legal_case_id: 2,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        if (sql.includes('FROM payments') && sql.includes("purpose IN ('SERVICE_FEE', 'COMMISSION')")) {
          return [[{ id: 10, status: 'PAID' }]];
        }
        return [[]];
      });

      const res = await service.markStampingNotApplicable(lawyer, 1, {
        reason: 'Commercial lease exempt under municipal act',
      });

      expect(res.executed).toBe(false);
      const updateExecutedCalls = mockConn.execute.mock.calls.filter((call: any[]) =>
        call[0].includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(updateExecutedCalls.length).toBe(0);
    });

    it('blocks agreement execution during stamping verification when current agreement version has reviewed_at === null', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1, tenancy_id: 7, owner_user_id: 2, tenant_user_id: 20, property_id: 5,
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE') || sql.includes('FROM tenancies WHERE id = ?')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM agreements') && sql.includes('FOR UPDATE')) {
          return [[{
            id: 1,
            tenancy_id: 7,
            status: 'APPROVED_BY_LEGAL',
            current_version: 1,
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'IN-DL1234567890',
            legal_case_id: 2,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          // Version has not been approved / reviewed_at is null
          return [[{ reviewed_at: null }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        if (sql.includes('FROM payments') && sql.includes("purpose IN ('SERVICE_FEE', 'COMMISSION')")) {
          return [[{ id: 10, status: 'PAID' }]];
        }
        return [[]];
      });

      const res = await service.verifyStamping(lawyer, 1, {
        certificateNumber: 'IN-DL1234567890',
      });

      expect(res.executed).toBe(false);
      const updateExecutedCalls = mockConn.execute.mock.calls.filter((call: any[]) =>
        call[0].includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(updateExecutedCalls.length).toBe(0);
    });
  });
});
