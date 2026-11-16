import { Test } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
  let mockConn: { execute: jest.Mock };

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
    mockConn = { execute: jest.fn().mockResolvedValue([[]]) };
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(async (fn: any) => fn(mockConn)),
    };
    audit = {
      record: jest.fn().mockResolvedValue(undefined),
    };
    notify = {
      send: jest.fn().mockResolvedValue(undefined),
      sendMany: jest.fn().mockResolvedValue(undefined),
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
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payment_transactions'),
        expect.arrayContaining([5, 'HDFC-NEFT-987654321', 'NEFT', 25000, 'INR']),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'payment.recorded_offline',
          objectId: 5,
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

    it('commits payment as PAID and returns warning when post-commit notification delivery fails', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 5,
        reference_code: 'ODB-PAY-2026-000005',
        total_amount: 25000,
        currency: 'INR',
        status: 'PROCESSING',
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM payments WHERE id = ?')) {
          return [[{
            id: 5,
            reference_code: 'ODB-PAY-2026-000005',
            tenancy_id: null,
            total_amount: 25000,
            currency: 'INR',
            status: 'PROCESSING',
          }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes('FROM listing_promotions')) {
          return [[]];
        }
        return [[]];
      });

      (notify.send as jest.Mock).mockRejectedValueOnce(new Error('SMS gateway connection timeout'));

      const result = await service.recordOfflinePayment(operatorUser, 5, {
        bankReference: 'HDFC-NEFT-987654321',
        method: 'NEFT',
      });

      expect(result.status).toBe('PAID');
      expect(result.notificationWarning).toBe('Payment recorded, but party notification delivery failed.');
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE payments SET status = 'PAID'"),
        expect.anything(),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'payment.recorded_offline',
          objectId: 5,
          metadata: expect.objectContaining({
            notificationsDelivered: false,
            notificationError: 'SMS gateway connection timeout',
          }),
        }),
      );
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

  describe('Odibrick Service Fee Invoicing & Agreement Execution Gate', () => {
    it('creates the Odibrick fee invoice and payment obligation exactly once (idempotent)', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ c: 0 }) // no existing move-in dues
        .mockResolvedValueOnce(null) // no existing fee payment
        .mockResolvedValueOnce({
          id: 1,
          code: 'STD_ANNUAL',
          basis: 'PERCENT_OF_MONTHLY_RENT',
          percent_value: 50,
          tax_rate: 18,
          payer: 'OWNER',
        }) // commission rule
        .mockResolvedValueOnce({ full_name: 'Tara Verma', email: 'tara@odibrick.com' }) // payer user
        .mockResolvedValueOnce({
          address_line1: '123 MG Road',
          locality: 'Indiranagar',
          city: 'Bengaluru',
          state: 'Karnataka',
          pincode: '560038',
        }); // property

      (db.nextSequence as jest.Mock) = jest.fn().mockResolvedValue(101);

      await service.raiseMoveInDues({
        id: 7,
        property_id: 3,
        tenant_user_id: 20,
        owner_user_id: 10,
        rent_amount: 30000,
        deposit_amount: 60000,
        service_plan: 'STANDARD',
        start_date: '2026-11-01',
      });

      // Verify Odibrick service fee payment obligation created
      expect(db.insert).toHaveBeenCalledWith(
        'payments',
        expect.objectContaining({
          purpose: 'SERVICE_FEE',
          amount: 15000,
          tax_amount: 2700,
          total_amount: 17700,
          payee_user_id: null,
          tenancy_id: 7,
        }),
      );

      // Verify GST invoice created with status ISSUED
      expect(db.insert).toHaveBeenCalledWith(
        'invoices',
        expect.objectContaining({
          user_id: 10,
          tenancy_id: 7,
          subtotal: 15000,
          total: 17700,
          status: 'ISSUED',
        }),
      );
    });

    it('does not execute agreement when only security deposit or rent is paid while Odibrick fee remains unpaid', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 5,
        reference_code: 'ODB-PAY-2026-000005',
        tenancy_id: 7,
        total_amount: 60000,
        currency: 'INR',
        status: 'PROCESSING',
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 5, tenancy_id: 7, total_amount: 60000, status: 'PROCESSING', purpose: 'SECURITY_DEPOSIT' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes('FROM listing_promotions')) {
          return [[]];
        }
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 3, stage: 'AWAITING_PAYMENT' }]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          // Fee exists but is DUE (unpaid)
          return [[{ id: 10, status: 'DUE', total_amount: 17700 }]];
        }
        return [[]];
      });

      const result = await service.recordOfflinePayment(operatorUser, 5, {
        bankReference: 'HDFC-NEFT-DEPOSIT-ONLY',
        method: 'NEFT',
      });

      expect(result.status).toBe('PAID');
      // Agreement must NOT be marked EXECUTED because Odibrick fee is unpaid
      const updateAgrCalls = mockConn.execute.mock.calls.filter((c: any) =>
        c[0].includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(updateAgrCalls.length).toBe(0);

      // Tenancy must NOT move to CHECK_IN_PENDING
      const updateTenancyCalls = mockConn.execute.mock.calls.filter((c: any) =>
        c[0].includes("UPDATE tenancies SET stage = 'CHECK_IN_PENDING'"),
      );
      expect(updateTenancyCalls.length).toBe(0);
    });

    it('paying fee without authorized finance confirmation (settleByPayer) does not execute the agreement', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        payer_user_id: payerUser.id,
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'DUE',
      });

      const result = await service.settleByPayer(payerUser, 10, {
        method: 'UPI',
        reference: 'UPI-FEE-CLAIM-123',
      });

      expect(result.status).toBe('PROCESSING');
      // Must not be marked PAID
      expect(result.status).not.toBe('PAID');

      // Agreement must not be executed
      expect(db.update).not.toHaveBeenCalledWith('agreements', expect.anything(), expect.objectContaining({ status: 'EXECUTED' }));
    });

    it('zero-signatory agreement cannot execute even if Odibrick fee is confirmed', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PROCESSING',
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 10, tenancy_id: 7, total_amount: 17700, status: 'PROCESSING', purpose: 'SERVICE_FEE' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes('FROM listing_promotions')) {
          return [[]];
        }
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 3, stage: 'AWAITING_PAYMENT' }]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          return [[{ id: 10, status: 'PROCESSING', total_amount: 17700 }]];
        }
        if (sql.includes('FROM agreements')) {
          return [[{ id: 88, legal_case_id: 44, current_version: 1, status: 'APPROVED_BY_LEGAL', approved_by: 3 }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ version: 1, reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          // 0 total signatories (corrupted / zero-signatory)
          return [[{ total_sigs: 0, signed_sigs: 0, pending_sigs: 0 }]];
        }
        return [[]];
      });

      const result = await service.recordOfflinePayment(operatorUser, 10, {
        bankReference: 'HDFC-NEFT-FEE-ZERO-SIGS',
        method: 'NEFT',
      });

      expect(result.status).toBe('PAID');
      // Zero-signatory agreement must NOT be marked EXECUTED
      const updateAgrCalls = mockConn.execute.mock.calls.filter((c: any) =>
        c[0].includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(updateAgrCalls.length).toBe(0);
    });

    it('atomically executes agreement, legal case, sets property to RENTED, and advances tenancy when Odibrick fee is confirmed PAID', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PROCESSING',
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 10, tenancy_id: 7, total_amount: 17700, status: 'PROCESSING', purpose: 'SERVICE_FEE' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes('FROM listing_promotions')) {
          return [[]];
        }
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 3, stage: 'AWAITING_PAYMENT' }]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          return [[{ id: 10, status: 'PROCESSING', total_amount: 17700 }]];
        }
        if (sql.includes('FROM agreements')) {
          return [[{
            id: 88,
            legal_case_id: 44,
            current_version: 1,
            status: 'APPROVED_BY_LEGAL',
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'STAMP-REF-123',
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ version: 1, reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          // 2 total signatories, 2 signed, 0 pending
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        return [[]];
      });

      const result = await service.recordOfflinePayment(operatorUser, 10, {
        bankReference: 'HDFC-NEFT-FEE-CONFIRMED',
        method: 'NEFT',
      });

      expect(result.status).toBe('PAID');

      // Agreement marked EXECUTED
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE agreements SET status = 'EXECUTED', executed_at = NOW() WHERE id = ?"),
        [88],
      );

      // Legal case marked EXECUTED
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE legal_cases SET status = 'EXECUTED', closed_at = NOW() WHERE id = ?"),
        [44],
      );

      // Tenancy moved to CHECK_IN_PENDING
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tenancies SET stage = 'CHECK_IN_PENDING' WHERE id = ?"),
        [7],
      );

      // Property moved to RENTED
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE properties SET status = 'RENTED' WHERE id = ?"),
        [3],
      );

      // Invoice marked PAID
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE invoices SET status = 'PAID' WHERE payment_id = ? AND status <> 'PAID'"),
        [10],
      );

      // Commission marked PAID
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE commissions SET status = 'PAID' WHERE payment_id = ? AND status <> 'PAID'"),
        [10],
      );
    });

    it('records fee as PAID but leaves agreement unexecuted when stamping verification is pending or rejected', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PROCESSING',
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 10, tenancy_id: 7, total_amount: 17700, status: 'PROCESSING', purpose: 'SERVICE_FEE' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes('FROM listing_promotions')) {
          return [[]];
        }
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 3, stage: 'AWAITING_PAYMENT' }]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          return [[{ id: 10, status: 'PROCESSING', total_amount: 17700 }]];
        }
        if (sql.includes('FROM agreements')) {
          return [[{
            id: 88,
            legal_case_id: 44,
            current_version: 1,
            status: 'APPROVED_BY_LEGAL',
            approved_by: 3,
            stamp_duty_status: 'PENDING',
            stamp_verified_at: null,
            stamp_reference: null,
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ version: 1, reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        return [[]];
      });

      const result = await service.recordOfflinePayment(operatorUser, 10, {
        bankReference: 'HDFC-NEFT-FEE-STAMP-PENDING',
        method: 'NEFT',
      });

      expect(result.status).toBe('PAID');

      // Agreement must NOT be marked EXECUTED
      const updateAgrCalls = mockConn.execute.mock.calls.filter((c: any) =>
        c[0].includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(updateAgrCalls.length).toBe(0);

      // Tenancy must NOT advance to CHECK_IN_PENDING
      const updateTenancyCalls = mockConn.execute.mock.calls.filter((c: any) =>
        c[0].includes("UPDATE tenancies SET stage = 'CHECK_IN_PENDING'"),
      );
      expect(updateTenancyCalls.length).toBe(0);

      // Property must NOT be marked RENTED
      const updatePropCalls = mockConn.execute.mock.calls.filter((c: any) =>
        c[0].includes("UPDATE properties SET status = 'RENTED'"),
      );
      expect(updatePropCalls.length).toBe(0);
    });

    it('safely handles repeated payment confirmation without duplicate execution or side effects', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PAID', // already settled
      });

      await expect(
        service.recordOfflinePayment(operatorUser, 10, {
          bankReference: 'HDFC-NEFT-FEE-CONFIRMED',
          method: 'NEFT',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(mockConn.execute).not.toHaveBeenCalledWith(
        expect.stringContaining("UPDATE agreements SET status = 'EXECUTED'"),
        expect.anything(),
      );
    });

    it('leaves agreement unexecuted and does not advance tenancy when payment callback fails', async () => {
      mockProvider.verifyCallback.mockResolvedValueOnce({
        providerOrderId: 'order_fee_123',
        status: 'FAILED',
        failureCode: 'PAYMENT_FAILED',
        failureReason: 'Insufficient funds',
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM payment_transactions WHERE provider_order_id = ?')) {
          return [[{ id: 99, payment_id: 10, status: 'PENDING' }]];
        }
        return [[]];
      });

      const res = await service.handleCallback({ order_id: 'order_fee_123' });
      expect(res).toEqual({ handled: true });

      // Payment marked FAILED
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE payments SET status = 'FAILED'"),
        [10],
      );

      // Agreement and tenancy must NOT be updated
      expect(mockConn.execute).not.toHaveBeenCalledWith(
        expect.stringContaining("UPDATE agreements SET status = 'EXECUTED'"),
        expect.anything(),
      );
      expect(mockConn.execute).not.toHaveBeenCalledWith(
        expect.stringContaining("UPDATE tenancies SET stage = 'CHECK_IN_PENDING'"),
        expect.anything(),
      );
      expect(mockConn.execute).not.toHaveBeenCalledWith(
        expect.stringContaining("UPDATE properties SET status = 'RENTED'"),
        expect.anything(),
      );
    });

    it('returns { handled: true } without error when post-commit notification delivery fails on callback', async () => {
      mockProvider.verifyCallback.mockResolvedValueOnce({
        providerOrderId: 'order_fee_123',
        providerTxnId: 'txn_fee_123',
        status: 'SUCCESS',
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM payment_transactions WHERE provider_order_id = ?')) {
          return [[{ id: 99, payment_id: 10, status: 'PENDING' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE provider_txn_id = ?')) {
          return [[]];
        }
        if (sql.includes('FROM payments WHERE id = ?')) {
          return [[{
            id: 10,
            reference_code: 'ODB-PAY-2026-000010',
            tenancy_id: null,
            total_amount: 17700,
            currency: 'INR',
            status: 'PROCESSING',
            purpose: 'SERVICE_FEE',
          }]];
        }
        if (sql.includes('FROM listing_promotions')) {
          return [[]];
        }
        return [[]];
      });

      (notify.send as jest.Mock).mockRejectedValueOnce(new Error('Push notification service failure'));

      const res = await service.handleCallback({ order_id: 'order_fee_123' });
      expect(res).toEqual({ handled: true });

      // Payment still marked PAID in DB
      expect(mockConn.execute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE payments SET status = 'PAID'"),
        expect.anything(),
      );
    });

    it('enforces uniform lock order: locks tenancy row before payment row for tenancy-linked payments', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PROCESSING',
      });

      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 3, stage: 'AWAITING_PAYMENT' }]];
        }
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 10, tenancy_id: 7, total_amount: 17700, status: 'PROCESSING', purpose: 'SERVICE_FEE' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          return [[{ id: 10, status: 'PROCESSING', total_amount: 17700 }]];
        }
        if (sql.includes('FROM agreements')) {
          return [[]];
        }
        return [[]];
      });

      await service.recordOfflinePayment(operatorUser, 10, {
        bankReference: 'HDFC-NEFT-ORDER-CHECK',
        method: 'NEFT',
      });

      const executeCalls = mockConn.execute.mock.calls.map((c: any[]) => c[0]);
      const tenancyLockIndex = executeCalls.findIndex((sql: string) =>
        sql.includes('FROM tenancies WHERE id = ? FOR UPDATE'),
      );
      const paymentLockIndex = executeCalls.findIndex((sql: string) =>
        sql.includes('FROM payments WHERE id = ? FOR UPDATE'),
      );

      expect(tenancyLockIndex).toBeGreaterThanOrEqual(0);
      expect(paymentLockIndex).toBeGreaterThanOrEqual(0);
      expect(tenancyLockIndex).toBeLessThan(paymentLockIndex);
    });

    it('explicitly selects all required stamping fields in active agreement query', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PROCESSING',
      });
      let agreementQuerySql = '';
      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 10, tenancy_id: 7, total_amount: 17700, status: 'PROCESSING', purpose: 'SERVICE_FEE' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          return [[{ id: 10, status: 'PROCESSING', total_amount: 17700 }]];
        }
        if (sql.includes('FROM agreements')) {
          agreementQuerySql = sql;
          return [[{
            id: 88,
            legal_case_id: 44,
            current_version: 1,
            status: 'APPROVED_BY_LEGAL',
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'STAMP-REF-123',
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ version: 1, reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        return [[]];
      });

      await service.recordOfflinePayment(operatorUser, 10, {
        bankReference: 'HDFC-NEFT-QUERY-CHECK',
        method: 'NEFT',
      });

      expect(agreementQuerySql).toContain('stamp_duty_status');
      expect(agreementQuerySql).toContain('stamp_reference');
      expect(agreementQuerySql).toContain('stamp_verified_by');
      expect(agreementQuerySql).toContain('stamp_verified_at');
    });

    it('blocks agreement execution when stamp_verified_by is missing in PAID status', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PROCESSING',
      });
      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 10, tenancy_id: 7, total_amount: 17700, status: 'PROCESSING', purpose: 'SERVICE_FEE' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          return [[{ id: 10, status: 'PROCESSING', total_amount: 17700 }]];
        }
        if (sql.includes('FROM agreements')) {
          return [[{
            id: 88,
            legal_case_id: 44,
            current_version: 1,
            status: 'APPROVED_BY_LEGAL',
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: null,
            stamp_verified_at: new Date(),
            stamp_reference: 'STAMP-REF-123',
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ version: 1, reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        return [[]];
      });

      const res = await service.recordOfflinePayment(operatorUser, 10, {
        bankReference: 'HDFC-NEFT-NO-VERIFIER',
        method: 'NEFT',
      });

      expect(res.status).toBe('PAID');
      const executeCalls = mockConn.execute.mock.calls.map((c: any[]) => c[0]);
      const executedAgreementCalls = executeCalls.filter((sql: string) =>
        sql.includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(executedAgreementCalls.length).toBe(0);
    });

    it('blocks agreement execution when NOT_APPLICABLE status has an incorrect reference', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PROCESSING',
      });
      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 10, tenancy_id: 7, total_amount: 17700, status: 'PROCESSING', purpose: 'SERVICE_FEE' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          return [[{ id: 10, status: 'PROCESSING', total_amount: 17700 }]];
        }
        if (sql.includes('FROM agreements')) {
          return [[{
            id: 88,
            legal_case_id: 44,
            current_version: 1,
            status: 'APPROVED_BY_LEGAL',
            approved_by: 3,
            stamp_duty_status: 'NOT_APPLICABLE',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'WRONG-REF-123',
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          return [[{ version: 1, reviewed_at: new Date() }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        return [[]];
      });

      await service.recordOfflinePayment(operatorUser, 10, {
        bankReference: 'HDFC-NEFT-BAD-NA-REF',
        method: 'NEFT',
      });

      const executeCalls = mockConn.execute.mock.calls.map((c: any[]) => c[0]);
      const executedAgreementCalls = executeCalls.filter((sql: string) =>
        sql.includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(executedAgreementCalls.length).toBe(0);
    });

    it('blocks agreement execution during payment confirmation when current agreement version has reviewed_at === null', async () => {
      (db.one as jest.Mock).mockResolvedValue({
        id: 10,
        reference_code: 'ODB-PAY-2026-000010',
        tenancy_id: 7,
        total_amount: 17700,
        currency: 'INR',
        status: 'PROCESSING',
      });
      mockConn.execute.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM tenancies WHERE id = ? FOR UPDATE')) {
          return [[{ id: 7, property_id: 5, stage: 'AWAITING_PAYMENT', owner_user_id: 2, tenant_user_id: 20 }]];
        }
        if (sql.includes('FROM payments WHERE id = ? FOR UPDATE')) {
          return [[{ id: 10, tenancy_id: 7, total_amount: 17700, status: 'PROCESSING', purpose: 'SERVICE_FEE' }]];
        }
        if (sql.includes('FROM payment_transactions WHERE idempotency_key = ?')) {
          return [[]];
        }
        if (sql.includes("purpose IN ('SERVICE_FEE','COMMISSION')")) {
          return [[{ id: 10, status: 'PROCESSING', total_amount: 17700 }]];
        }
        if (sql.includes('FROM agreements')) {
          return [[{
            id: 88,
            legal_case_id: 44,
            current_version: 1,
            status: 'APPROVED_BY_LEGAL',
            approved_by: 3,
            stamp_duty_status: 'PAID',
            stamp_verified_by: 3,
            stamp_verified_at: new Date(),
            stamp_reference: 'STAMP-REF-123',
          }]];
        }
        if (sql.includes('FROM agreement_versions')) {
          // Unapproved version: reviewed_at is null
          return [[{ version: 1, reviewed_at: null }]];
        }
        if (sql.includes('FROM agreement_signatories')) {
          return [[{ total_sigs: 2, signed_sigs: 2, pending_sigs: 0 }]];
        }
        return [[]];
      });

      const res = await service.recordOfflinePayment(operatorUser, 10, {
        bankReference: 'HDFC-NEFT-UNREVIEWED-VER',
        method: 'NEFT',
      });

      expect(res.status).toBe('PAID');
      const executeCalls = mockConn.execute.mock.calls.map((c: any[]) => c[0]);
      const executedAgreementCalls = executeCalls.filter((sql: string) =>
        sql.includes("UPDATE agreements SET status = 'EXECUTED'"),
      );
      expect(executedAgreementCalls.length).toBe(0);
    });
  });
});
