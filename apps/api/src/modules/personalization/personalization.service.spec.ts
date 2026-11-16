import { Test } from '@nestjs/testing';
import { PersonalizationService } from './personalization.service';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationService } from '../automation/automation.service';

describe('PersonalizationService — Phase 2 Multi-Locality & Multi-BHK Matching', () => {
  let service: PersonalizationService;
  let db: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PersonalizationService,
        { provide: DatabaseService, useValue: db },
        { provide: AuditService, useValue: { record: jest.fn() } },
        { provide: NotificationsService, useValue: { send: jest.fn() } },
        { provide: AutomationService, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(PersonalizationService);
  });

  it('reads authoritative preferredLocalities and preferredBhk from user_profiles.preferences JSON', async () => {
    (db.one as jest.Mock).mockResolvedValueOnce({
      id: 1,
      user_id: 20,
      preferred_city: 'Hyderabad',
      preferred_locality: 'Gachibowli, Madhapur',
      min_bhk: 1,
      max_bhk: 3,
      min_rent: 20000,
      max_rent: 40000,
      furnishing: 'SEMI_FURNISHED',
      profile_preferences: JSON.stringify({
        preferredLocalities: ['Gachibowli', 'Madhapur'],
        preferredBhk: [1, 3],
        furnishing: 'SEMI_FURNISHED',
      }),
    });

    const prefs = await service.getPreferences(20);
    expect(prefs?.preferredCity).toBe('Hyderabad');
    expect(prefs?.preferredLocalities).toEqual(['Gachibowli', 'Madhapur']);
    expect(prefs?.preferredBhk).toEqual([1, 3]);
  });

  it('matches properties against any selected locality in preferredLocalities and exact preferredBhk selections', () => {
    const criteria = {
      preferredCity: 'Hyderabad',
      preferredLocalities: ['Gachibowli', 'Madhapur'],
      preferredBhk: [1, 3],
      minRent: 20000,
      maxRent: 40000,
    };

    const matchingSecondLocality3Bhk = service.calculatePropertyMatch(
      {
        city: 'Hyderabad',
        locality: 'Madhapur',
        bedrooms: 3,
        rent_amount: 32000,
      },
      criteria,
    );
    expect(matchingSecondLocality3Bhk.scoreBreakdown.location).toBe(25);
    expect(matchingSecondLocality3Bhk.scoreBreakdown.bhk).toBe(20);
    expect(matchingSecondLocality3Bhk.scoreBreakdown.budget).toBe(25);

    const nonMatching2Bhk = service.calculatePropertyMatch(
      {
        city: 'Hyderabad',
        locality: 'Gachibowli',
        bedrooms: 2,
        rent_amount: 30000,
      },
      criteria,
    );
    expect(nonMatching2Bhk.scoreBreakdown.location).toBe(25);
    expect(nonMatching2Bhk.scoreBreakdown.bhk).toBe(0);
  });
});
