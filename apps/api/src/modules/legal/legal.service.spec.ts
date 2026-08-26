import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { LegalService } from './legal.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
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

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(async (fn: any) => fn({ execute: jest.fn() })),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        LegalService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: { send: jest.fn(), sendMany: jest.fn() } },
        { provide: PaymentsService, useValue: { raiseMoveInDues: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(LegalService);
  });

  it('refuses a signature on a draft the legal team has not approved', async () => {
    (db.one as jest.Mock).mockResolvedValue({
      id: 1, status: 'AWAITING_SIGNATURES', approved_by: null, tenancy_id: 7,
    });
    await expect(service.sign(tenant, 1, { consent: true })).rejects.toThrow(
      /not been approved by the legal team/,
    );
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
});
