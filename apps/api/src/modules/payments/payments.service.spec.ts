import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PAYMENT_PROVIDER } from './payments.tokens';
import { AuthUser } from '../../common/auth/auth.types';

describe('PaymentsService (Security & Settlement Verification)', () => {
  let service: PaymentsService;
  let db: jest.Mocked<Partial<DatabaseService>>;
  let audit: jest.Mocked<Partial<AuditService>>;
  let notify: jest.Mocked<Partial<NotificationsService>>;

  const payerUser: AuthUser = {
    id: 10,
    publicId: 'USR-PAYER-10',
    email: 'payer@odibrick.test',
    fullName: 'Payer Tenant',
    roles: ['TENANT'],
    permissions: ['payment.read'],
  };

  const otherUser: AuthUser = {
    id: 99,
    publicId: 'USR-OTHER-99',
    email: 'other@odibrick.test',
    fullName: 'Other User',
    roles: ['TENANT'],
    permissions: ['payment.read'],
  };

  const operatorUser: AuthUser = {
    id: 1,
    publicId: 'USR-ADMIN-1',
    email: 'admin@odibrick.test',
    fullName: 'Finance Operator',
    roles: ['ADMIN'],
    permissions: ['payment.manage'],
  };

  const mockProvider = {
    key: 'manual',
    custodial: false,
    createOrder: jest.fn(),
    verifyCallback: jest.fn(),
    refund: jest.fn(),
  };

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(async (fn: any) => fn({ execute: jest.fn().mockResolvedValue([[]]) })),
    };
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    notify = {
      send: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notify },
        { provide: PAYMENT_PROVIDER, useValue: mockProvider },
      ],
    }).compile();

    service = moduleRef.get(PaymentsService);
  });

  describe('settleByPayer (D-03 Self-Settlement Prevention)', () => {
    it('does NOT mark payment as PAID; sets status to PROCESSING and transaction status to PENDING', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 5,
        reference_code: 'ODB-PAY-2026-000005',
        payer_user_id: 10,
        payee_user_id: 20,
        total_amount: 25000,
        currency: 'INR',
        status: 'DUE',
      });

      const result = await service.settleByPayer(payerUser, 5, {
        method: 'UPI',
        reference: 'UPI-REF-12345',
      });

      // Crucial security invariant: Payment must NOT be PAID
      expect(result.status).toBe('PROCESSING');
      expect(result.status).not.toBe('PAID');

      // Verify transaction inserted with PENDING status, not SUCCESS
      expect(db.insert).toHaveBeenCalledWith(
        'payment_transactions',
        expect.objectContaining({
          payment_id: 5,
          provider_txn_id: 'UPI-REF-12345',
          status: 'PENDING',
        }),
      );

      // Verify payment updated to PROCESSING, not PAID
      expect(db.update).toHaveBeenCalledWith(
        'payments',
        5,
        expect.objectContaining({
          status: 'PROCESSING',
          settlement_status: 'PENDING',
        }),
      );
    });

    it('rejects self-settlement when payment is already PAID', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 5,
        payer_user_id: 10,
        status: 'PAID',
      });

      await expect(
        service.settleByPayer(payerUser, 5, { reference: 'REF' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects self-settlement when payment is already PROCESSING', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 5,
        payer_user_id: 10,
        status: 'PROCESSING',
      });

      await expect(
        service.settleByPayer(payerUser, 5, { reference: 'REF' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('forbids unrelated user from submitting payment claim on another account', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 5,
        payer_user_id: 10,
        status: 'DUE',
      });

      await expect(
        service.settleByPayer(otherUser, 5, { reference: 'REF' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('recordOfflinePayment (Authorized Operator Confirmation)', () => {
    it('marks payment PAID when an authorized operator confirms the bank reference', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 5,
        reference_code: 'ODB-PAY-2026-000005',
        total_amount: 25000,
        currency: 'INR',
        status: 'PROCESSING',
      });

      const result = await service.recordOfflinePayment(operatorUser, 5, {
        bankReference: 'HDFC-NEFT-987654321',
        method: 'NEFT',
      });

      expect(result.status).toBe('PAID');
      expect(db.insert).toHaveBeenCalledWith(
        'payment_transactions',
        expect.objectContaining({
          payment_id: 5,
          provider_txn_id: 'HDFC-NEFT-987654321',
          status: 'SUCCESS',
        }),
      );
      expect(db.update).toHaveBeenCalledWith(
        'payments',
        5,
        expect.objectContaining({
          status: 'PAID',
        }),
      );
    });

    it('rejects operator confirmation when bank reference is missing', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 5,
        status: 'DUE',
      });

      await expect(
        service.recordOfflinePayment(operatorUser, 5, { bankReference: '' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('D-20 ManualPaymentProvider Callback Handling', () => {
    it('throws BadRequestException for manual payment callbacks (not unhandled 500)', async () => {
      const { ManualPaymentProvider } = await import('./providers/manual.provider');
      const manualProvider = new ManualPaymentProvider();

      await expect(manualProvider.verifyCallback()).rejects.toThrow(BadRequestException);
      await expect(manualProvider.verifyCallback()).rejects.toThrow(
        'The manual payment provider does not accept automated webhooks',
      );
    });

    it('throws BadRequestException for manual payment refunds', async () => {
      const { ManualPaymentProvider } = await import('./providers/manual.provider');
      const manualProvider = new ManualPaymentProvider();

      await expect(manualProvider.refund()).rejects.toThrow(BadRequestException);
    });
  });
});
