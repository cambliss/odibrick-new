import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PaymentReminderService } from './payment-reminder.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';

describe('PaymentReminderService - D-11 Pagination limits', () => {
  let service: PaymentReminderService;
  let db: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    db = {
      query: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentReminderService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: { send: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PaymentReminderService);
  });

  it('safely defaults limit to 50 when omitted', async () => {
    await service.getPaymentEscalations({});
    expect(db.query).toHaveBeenCalledTimes(1);
    const params = (db.query as jest.Mock).mock.calls[0][1];
    expect(params[4]).toBe(50);
  });

  it('bounds excessive limit to 100 max', async () => {
    await service.getPaymentEscalations({ limit: 500 });
    expect(db.query).toHaveBeenCalledTimes(1);
    const params = (db.query as jest.Mock).mock.calls[0][1];
    expect(params[4]).toBe(100);
  });

  it('respects valid custom limit', async () => {
    await service.getPaymentEscalations({ limit: 25 });
    expect(db.query).toHaveBeenCalledTimes(1);
    const params = (db.query as jest.Mock).mock.calls[0][1];
    expect(params[4]).toBe(25);
  });

  it('rejects non-positive limit with BadRequestException', async () => {
    await expect(service.getPaymentEscalations({ limit: 0 })).rejects.toThrow(BadRequestException);
    await expect(service.getPaymentEscalations({ limit: -10 })).rejects.toThrow(BadRequestException);
    await expect(service.getPaymentEscalations({ limit: NaN })).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid minDaysOverdue with BadRequestException', async () => {
    await expect(service.getPaymentEscalations({ minDaysOverdue: -1 })).rejects.toThrow(BadRequestException);
    await expect(service.getPaymentEscalations({ minDaysOverdue: NaN })).rejects.toThrow(BadRequestException);
  });
});
