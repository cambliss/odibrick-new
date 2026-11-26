import { Test } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { MarketplaceOperationsService } from './marketplace-operations.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import { CommercialOperationsService } from '../payments/commercial-operations.service';
import { InvoicesService } from '../payments/invoices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { VisitOutcome, VisitType } from './marketplace-operations.dto';

const tenant: AuthUser = {
  id: 20,
  publicId: 'U20',
  email: 'tenant@example.com',
  fullName: 'Naveen Gupta',
  roles: ['TENANT'],
  permissions: ['enquiry.create'],
};

const agent: AuthUser = {
  id: 30,
  publicId: 'U30',
  email: 'agent@example.com',
  fullName: 'Arjun Menon',
  roles: ['AGENT'],
  permissions: ['property.create'],
};

const stranger: AuthUser = {
  id: 99,
  publicId: 'U99',
  email: 'stranger@example.com',
  fullName: 'Unrelated User',
  roles: ['TENANT'],
  permissions: [],
};

const futureIso = (hoursAhead = 24) => new Date(Date.now() + hoursAhead * 3600 * 1000).toISOString();

describe('MarketplaceOperationsService - Property Visit Scheduling', () => {
  let service: MarketplaceOperationsService;
  let db: jest.Mocked<Partial<DatabaseService>>;
  let txExecute: jest.Mock;
  let audit: jest.Mocked<Partial<AuditService>>;
  let notifications: jest.Mocked<Partial<NotificationsService>>;

  beforeEach(async () => {
    txExecute = jest.fn();
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1 } as any),
      transaction: jest.fn(async (fn: any) => fn({ execute: txExecute })),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { send: jest.fn().mockResolvedValue(undefined) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        MarketplaceOperationsService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: audit },
        { provide: PaymentsService, useValue: {} },
        { provide: CommercialOperationsService, useValue: {} },
        { provide: InvoicesService, useValue: {} },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();

    service = moduleRef.get(MarketplaceOperationsService);
  });

  it('creates a tenant visit request linked to the property inside a locked transaction without creating a rental application', async () => {
    const startIso = futureIso(24);
    (db.one as jest.Mock)
      .mockResolvedValueOnce({ id: 300, title: '1 BHK studio in Viman Nagar', listed_by_user_id: agent.id, status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 171 }); // existing enquiry
    txExecute
      .mockResolvedValueOnce([[{ id: 300 }]]) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([[]]) // no active duplicate visit
      .mockResolvedValueOnce([[]]) // no prop conflict
      .mockResolvedValueOnce([[]]) // no host conflict
      .mockResolvedValueOnce([[]]) // no cust conflict
      .mockResolvedValueOnce([{ insertId: 401 }]); // INSERT INTO property_visits
    (db.insert as jest.Mock).mockResolvedValueOnce(501); // lead_follow_ups

    const res = await service.requestVisit(tenant, {
      propertyId: 300,
      scheduledStart: startIso,
      visitType: VisitType.IN_PERSON,
      customerNotes: 'Evening slot preferred',
    });

    expect(res.id).toBe(401);
    expect(res.status).toBe('REQUESTED');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(txExecute).toHaveBeenCalledWith(
      'SELECT id FROM properties WHERE id = ? FOR UPDATE',
      [300],
    );
    expect(txExecute).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO property_visits'),
      expect.arrayContaining([171, 300, tenant.id, agent.id, VisitType.IN_PERSON, 'Evening slot preferred']),
    );
    expect(db.insert).not.toHaveBeenCalledWith('applications', expect.anything());
    expect(notifications.send).toHaveBeenCalledWith(
      agent.id,
      'MAINTENANCE_UPDATE',
      expect.objectContaining({ actionUrl: '/dashboard/visits' }),
    );
  });

  it('rejects past date/time visit requests with BadRequestException', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 300,
      title: '1 BHK studio',
      listed_by_user_id: agent.id,
      status: 'ACTIVE',
    });

    await expect(
      service.requestVisit(tenant, {
        propertyId: 300,
        scheduledStart: new Date(Date.now() - 3600 * 1000).toISOString(),
      }),
    ).rejects.toThrow(BadRequestException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('prevents duplicate active visit requests on repeated or concurrent submissions for the same property', async () => {
    (db.one as jest.Mock)
      .mockResolvedValueOnce({ id: 300, title: '1 BHK studio', listed_by_user_id: agent.id, status: 'ACTIVE' })
      .mockResolvedValueOnce({ id: 171 }); // existing enquiry
    txExecute
      .mockResolvedValueOnce([[{ id: 300 }]]) // SELECT ... FOR UPDATE
      .mockResolvedValueOnce([[{ id: 401 }]]); // active visit already exists

    await expect(
      service.requestVisit(tenant, {
        propertyId: 300,
        scheduledStart: futureIso(48),
      }),
    ).rejects.toThrow(ConflictException);
    expect(txExecute).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO property_visits'),
      expect.anything(),
    );
  });

  it('prevents an owner or agent from requesting a visit on their own listing', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 300,
      title: '1 BHK studio',
      listed_by_user_id: agent.id,
      status: 'ACTIVE',
    });

    await expect(
      service.requestVisit(agent, {
        propertyId: 300,
        scheduledStart: futureIso(24),
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows the listing agent to confirm and reschedule a visit and notifies the tenant', async () => {
    const visitDetailRow = {
      id: 401,
      public_id: 'V401',
      status: 'REQUESTED',
      visit_type: 'IN_PERSON',
      scheduled_start: futureIso(24),
      scheduled_end: futureIso(25),
      timezone: 'Asia/Kolkata',
      property_id: 300,
      property_title: '1 BHK studio in Viman Nagar',
      city: 'Pune',
      locality: 'Viman Nagar',
      rent_amount: 22000,
      security_deposit: 44000,
      listed_by_user_id: agent.id,
      host_user_id: agent.id,
      customer_id: tenant.id,
      customer_name: tenant.fullName,
      customer_email: tenant.email,
      customer_phone: '9999999999',
      enquiry_id: 171,
    };

    // Confirm
    (db.one as jest.Mock).mockResolvedValueOnce(visitDetailRow);
    const confirmRes = await service.confirmProviderVisit(agent, 401, { notes: 'See you at gate 2' });
    expect(confirmRes.status).toBe('CONFIRMED');
    expect(notifications.send).toHaveBeenCalledWith(
      tenant.id,
      'MAINTENANCE_UPDATE',
      expect.objectContaining({ actionUrl: '/dashboard/visits' }),
    );

    // Reschedule -> PROPOSED
    (db.one as jest.Mock)
      .mockResolvedValueOnce({ ...visitDetailRow, status: 'CONFIRMED' })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const reschedRes = await service.rescheduleProviderVisit(agent, 401, {
      scheduledStart: futureIso(48),
      reason: 'Current tenant unavailable earlier',
    });
    expect(reschedRes.status).toBe('PROPOSED');
  });

  it('allows tenant to confirm a provider-proposed time and returns tenant reschedules to REQUESTED', async () => {
    // Confirm PROPOSED visit
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 401,
      customer_user_id: tenant.id,
      host_user_id: agent.id,
      status: 'PROPOSED',
      scheduled_start: futureIso(48),
      enquiry_id: 171,
    });
    const confirmed = await service.confirmCustomerVisit(tenant, 401, { notes: 'Works for me' });
    expect(confirmed.status).toBe('CONFIRMED');

    // Cannot self-confirm a REQUESTED visit
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 402,
      customer_user_id: tenant.id,
      host_user_id: agent.id,
      status: 'REQUESTED',
      scheduled_start: futureIso(48),
    });
    await expect(service.confirmCustomerVisit(tenant, 402, {})).rejects.toThrow(BadRequestException);

    // Tenant reschedule returns to REQUESTED so provider must confirm
    (db.one as jest.Mock)
      .mockResolvedValueOnce({
        id: 401,
        property_id: 300,
        customer_user_id: tenant.id,
        host_user_id: agent.id,
        status: 'CONFIRMED',
        enquiry_id: 171,
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    const resched = await service.rescheduleCustomerVisit(tenant, 401, {
      scheduledStart: futureIso(72),
      reason: 'Work meeting moved',
    });
    expect(resched.status).toBe('REQUESTED');
    expect(db.update).toHaveBeenCalledWith(
      'property_visits',
      401,
      expect.objectContaining({ status: 'REQUESTED' }),
    );
  });

  it('supports cancellation and completion with recorded outcomes, and blocks unauthorized users', async () => {
    // Unauthorized user blocked from customer cancel
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 401,
      customer_user_id: tenant.id,
      host_user_id: agent.id,
      status: 'REQUESTED',
    });
    await expect(
      service.cancelCustomerVisit(stranger, 401, { reason: 'Not mine' }),
    ).rejects.toThrow(ForbiddenException);

    // Unauthorized user blocked from provider completion
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 401,
      listed_by_user_id: agent.id,
      host_user_id: agent.id,
      customer_id: tenant.id,
      property_id: 300,
      property_title: '1 BHK studio',
    });
    await expect(
      service.completeProviderVisit(stranger, 401, { outcome: VisitOutcome.INTERESTED }),
    ).rejects.toThrow(ForbiddenException);

    // Authorized tenant cancels
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 401,
      customer_user_id: tenant.id,
      host_user_id: agent.id,
      status: 'REQUESTED',
      enquiry_id: 171,
    });
    const cancelled = await service.cancelCustomerVisit(tenant, 401, { reason: 'Travel delayed' });
    expect(cancelled.status).toBe('CANCELLED');

    // Authorized agent completes with outcome
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 402,
      public_id: 'V402',
      status: 'CONFIRMED',
      visit_type: 'IN_PERSON',
      scheduled_start: futureIso(2),
      scheduled_end: futureIso(3),
      timezone: 'Asia/Kolkata',
      property_id: 300,
      property_title: '1 BHK studio',
      city: 'Pune',
      locality: 'Viman Nagar',
      rent_amount: 22000,
      security_deposit: 44000,
      listed_by_user_id: agent.id,
      host_user_id: agent.id,
      customer_id: tenant.id,
      customer_name: tenant.fullName,
      customer_email: tenant.email,
      customer_phone: '9999999999',
      enquiry_id: 171,
    });
    const completed = await service.completeProviderVisit(agent, 402, {
      outcome: VisitOutcome.VERY_INTERESTED,
      outcomeNotes: 'Tenant wants to proceed this week',
    });
    expect(completed.status).toBe('COMPLETED');
    expect(completed.outcome).toBe(VisitOutcome.VERY_INTERESTED);
  });
});
