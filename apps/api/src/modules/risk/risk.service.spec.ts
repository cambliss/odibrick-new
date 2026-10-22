import { Test } from '@nestjs/testing';
import { RiskService } from './risk.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { OperationalTasksService } from '../operations/operational-tasks.service';
import { AutomationService } from '../automation/automation.service';

describe('RiskService', () => {
  let service: RiskService;
  let db: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      execute: jest.fn().mockResolvedValue([{ affectedRows: 1 }] as any),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        RiskService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: OperationalTasksService, useValue: { createTask: jest.fn() } },
        { provide: AutomationService, useValue: { trigger: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(RiskService);
  });

  describe('D-10 schema verification', () => {
    it('getSuspiciousListings queries p.public_id AS propertyCode and p.rent_amount AS monthlyRent without p.property_code', async () => {
      (db.query as jest.Mock).mockResolvedValueOnce([
        {
          propertyId: 101,
          propertyCode: 'PROP-101',
          title: 'Suspicious Luxury Villa',
          city: 'Hyderabad',
          locality: 'Banjara Hills',
          monthlyRent: '75000',
          status: 'SUSPENDED',
          createdAt: new Date('2026-01-01T10:00:00Z'),
          ownerId: 2,
          ownerName: 'Scammer Test',
        },
      ]);

      const result = await service.getSuspiciousListings();

      expect(db.query).toHaveBeenCalledTimes(1);
      const sql = (db.query as jest.Mock).mock.calls[0][0];
      // Assert that invalid property_code column is not queried directly from properties
      expect(sql).not.toContain('p.property_code');
      expect(sql).toContain('p.public_id AS propertyCode');
      expect(sql).toContain('p.rent_amount AS monthlyRent');

      expect(result).toHaveLength(1);
      expect(result[0].propertyCode).toBe('PROP-101');
      expect(result[0].monthlyRent).toBe(75000);
      expect(result[0].riskReason).toBe('Property suspended by moderation');
    });

    it('getCaseById selects p.public_id AS property_code without column error', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        id: 1,
        public_id: 'RC-1',
        case_number: 'RC-2026-0001',
        case_type: 'LISTING_INTEGRITY',
        subject_user_id: 2,
        subject_property_id: 101,
        risk_level: 'HIGH',
        status: 'OPEN',
        summary: 'Duplicate listing test',
        evidence: '[]',
        property_title: 'Suspicious Luxury Villa',
        property_code: 'PROP-101',
        created_at: new Date('2026-01-01'),
      });
      (db.query as jest.Mock).mockResolvedValue([]); // timeline and signals

      const result = await service.getCaseById(1);

      expect(db.one).toHaveBeenCalled();
      const sql = (db.one as jest.Mock).mock.calls[0][0];
      expect(sql).not.toContain('p.property_code,');
      expect(sql).toContain('p.public_id AS property_code');
      expect(result.property_code).toBe('PROP-101');
      expect(result.property_title).toBe('Suspicious Luxury Villa');
    });
  });
});
