import { Test } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UsersService } from './users.service';
import { UpdateProfileDto } from './users.dto';
import { DatabaseService } from '../../common/database/database.service';
import { AuthUser } from '../../common/auth/auth.types';

const testTenant: AuthUser = {
  id: 20,
  publicId: 'U20',
  email: 'tenant@example.com',
  fullName: 'Arjun Verma',
  roles: ['TENANT'],
  permissions: ['property.view'],
};

const testOwner: AuthUser = {
  id: 30,
  publicId: 'U30',
  email: 'owner@example.com',
  fullName: 'Priya Nair',
  roles: ['OWNER'],
  permissions: ['property.create', 'property.update.own'],
};

const testAgent: AuthUser = {
  id: 40,
  publicId: 'U40',
  email: 'agent@example.com',
  fullName: 'Vikram Rao',
  roles: ['AGENT'],
  permissions: ['property.create'],
};

const testBuilder: AuthUser = {
  id: 50,
  publicId: 'U50',
  email: 'builder@example.com',
  fullName: 'Meera Builders',
  roles: ['BUILDER'],
  permissions: ['property.create'],
};

describe('UsersService', () => {
  let service: UsersService;
  let db: jest.Mocked<Partial<DatabaseService>>;

  beforeEach(async () => {
    db = {
      one: jest.fn(),
      query: jest.fn().mockResolvedValue([]),
      insert: jest.fn().mockResolvedValue(1),
      update: jest.fn().mockResolvedValue(1),
      execute: jest.fn().mockResolvedValue({ affectedRows: 1, insertId: 1 } as any),
      transaction: jest.fn(async (fn: any) => {
        const fakeConn = {
          query: async (sql: string, params: unknown[] = []) => {
            const row = await db.one!(sql, params);
            return [row ? [row] : []];
          },
          execute: async (sql: string, params: unknown[] = []) => {
            const res = await db.execute!(sql, params);
            return [res];
          },
        };
        return fn(fakeConn);
      }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = moduleRef.get(UsersService);
  });

  describe('profile & Step 4 completion calculation', () => {
    it('aggregates account, profile, tenant preferences, and reports incomplete Step 4 fields for a new tenant', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: 20,
          public_id: 'U20',
          full_name: 'Arjun Verma',
          email: 'tenant@example.com',
          phone: '9876543210',
          email_verified_at: '2026-10-30T10:00:00Z',
          phone_verified_at: '2026-10-30T10:01:00Z',
        }) // users
        .mockResolvedValueOnce({ city: 'Bengaluru', locality: null, preferences: null }) // user_profiles
        .mockResolvedValueOnce(null) // owners
        .mockResolvedValueOnce({
          household_type: 'FAMILY',
          occupants: 3,
          budget_min: null,
          budget_max: null,
          preferred_move_in: null,
        }) // tenants
        .mockResolvedValueOnce(null) // agents
        .mockResolvedValueOnce(null) // builders
        .mockResolvedValueOnce({ status: 'VERIFIED' }) // kyc_records
        .mockResolvedValueOnce(null); // user_property_preferences

      const res = await service.profile(testTenant);
      expect((res.account as any)?.id).toBe(20);
      expect((res.account as any)?.email_verified_at).toBe('2026-10-30T10:00:00Z');
      expect((res.profile as any)?.city).toBe('Bengaluru');
      expect((res.tenant as any)?.occupants).toBe(3);
      expect((res.kyc as any)?.status).toBe('VERIFIED');
      expect(res.roles).toEqual(['TENANT']);
      expect(res.profileCompletion.isComplete).toBe(false);
      expect(res.profileCompletion.completedCount).toBe(2); // fullName + city
      expect(res.profileCompletion.totalRequired).toBe(6);
      expect(res.profileCompletion.missingFields).toEqual([
        'Preferred localities',
        'Minimum and maximum rental budget',
        'Preferred BHK configurations',
        'Expected move-in date',
      ]);
    });

    it('reports 100% completion for a tenant when all Step 4 fields are populated', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          id: 20,
          full_name: 'Arjun Verma',
          email: 'tenant@example.com',
          phone: '9876543210',
        }) // users
        .mockResolvedValueOnce({
          city: 'Hyderabad',
          locality: 'Gachibowli',
          preferences: JSON.stringify({
            preferredLocalities: ['Gachibowli', 'Madhapur'],
            preferredBhk: [2, 3],
            furnishing: 'SEMI_FURNISHED',
          }),
        }) // user_profiles
        .mockResolvedValueOnce(null) // owners
        .mockResolvedValueOnce({
          budget_min: 25000,
          budget_max: 45000,
          preferred_move_in: '2026-12-01',
        }) // tenants
        .mockResolvedValueOnce(null) // agents
        .mockResolvedValueOnce(null) // builders
        .mockResolvedValueOnce(null) // kyc_records (KYC not started yet — separate from Step 4)
        .mockResolvedValueOnce(null); // user_property_preferences

      const res = await service.profile(testTenant);
      expect(res.profileCompletion.isComplete).toBe(true);
      expect(res.profileCompletion.percentage).toBe(100);
      expect(res.profileCompletion.missingFields).toEqual([]);
      expect(res.rentalPreferences).toEqual({
        city: 'Hyderabad',
        preferredLocalities: ['Gachibowli', 'Madhapur'],
        budgetMin: 25000,
        budgetMax: 45000,
        preferredBhk: [2, 3],
        preferredMoveIn: '2026-12-01',
        furnishing: 'SEMI_FURNISHED',
      });
    });

    it('calculates Owner Step 4 completion using fullName, city, preferredLocalities, and properties_count >= 1', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ id: 30, full_name: 'Priya Nair', email: 'owner@example.com' }) // users
        .mockResolvedValueOnce({
          city: 'Pune',
          preferences: JSON.stringify({ preferredLocalities: ['Baner', 'Wakad'] }),
        }) // user_profiles
        .mockResolvedValueOnce({ user_id: 30, owner_type: 'INDIVIDUAL', properties_count: 0 }) // owners (0 properties)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const incompleteRes = await service.profile(testOwner);
      expect(incompleteRes.profileCompletion.isComplete).toBe(false);
      expect(incompleteRes.profileCompletion.missingFields).toEqual(['Number of properties']);

      (db.one as jest.Mock)
        .mockResolvedValueOnce({ id: 30, full_name: 'Priya Nair', email: 'owner@example.com' })
        .mockResolvedValueOnce({
          city: 'Pune',
          preferences: JSON.stringify({ preferredLocalities: ['Baner', 'Wakad'] }),
        })
        .mockResolvedValueOnce({ user_id: 30, owner_type: 'INDIVIDUAL', properties_count: 3 })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const completeRes = await service.profile(testOwner);
      expect(completeRes.profileCompletion.isComplete).toBe(true);
      expect(completeRes.profileCompletion.percentage).toBe(100);
      expect((completeRes.owner as any)?.properties_count).toBe(3);
    });

    it('requires only fullName, city, and preferredLocalities for Agent/Builder roles without inventing extra mandatory fields', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ id: 40, full_name: 'Vikram Rao', email: 'agent@example.com' })
        .mockResolvedValueOnce({
          city: 'Bengaluru',
          preferences: JSON.stringify({ preferredLocalities: ['Indiranagar'] }),
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ agency_name: 'Rao Realty', rera_number: null, gstin: null })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const res = await service.profile(testAgent);
      expect(res.profileCompletion.isComplete).toBe(true);
      expect(res.profileCompletion.totalRequired).toBe(3);
    });
  });

  describe('updateProfile', () => {
    it('atomically updates user_profiles, tenants, and synchronizes user_property_preferences for a tenant', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ city: 'Bengaluru', preferences: null }) // existingProfile
        .mockResolvedValueOnce({ budget_min: null, budget_max: null }) // existingTenant
        .mockResolvedValueOnce(null) // existingPropPrefs
        // Subsequent profile() reads:
        .mockResolvedValueOnce({ id: 20, full_name: 'Arjun V. Patel' })
        .mockResolvedValueOnce({
          city: 'Hyderabad',
          locality: 'Gachibowli',
          preferences: JSON.stringify({
            preferredLocalities: ['Gachibowli', 'Kondapur'],
            preferredBhk: [2, 3],
            furnishing: 'FULLY_FURNISHED',
          }),
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          budget_min: 22000,
          budget_max: 38000,
          preferred_move_in: '2026-11-15',
          household_type: 'BACHELOR',
          occupants: 1,
        })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await service.updateProfile(testTenant, {
        fullName: 'Arjun V. Patel',
        city: 'Hyderabad',
        preferredLocalities: ['Gachibowli', 'Kondapur'],
        occupation: 'Software Architect',
        tenant: {
          householdType: 'BACHELOR',
          occupants: 1,
          budgetMin: 22000,
          budgetMax: 38000,
          preferredBhk: [3, 2],
          preferredMoveIn: '2026-11-15',
          furnishing: 'FULLY_FURNISHED',
        },
      });

      expect(db.transaction).toHaveBeenCalledTimes(1);
      expect(db.execute).toHaveBeenCalledWith(
        'UPDATE users SET full_name = ? WHERE id = ?',
        ['Arjun V. Patel', 20],
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_profiles'),
        expect.arrayContaining([
          20,
          'Gachibowli',
          'Hyderabad',
          JSON.stringify({
            preferredLocalities: ['Gachibowli', 'Kondapur'],
            preferredBhk: [2, 3],
            furnishing: 'FULLY_FURNISHED',
          }),
        ]),
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        [20, 'BACHELOR', 1, 0, null, '2026-11-15', 22000, 38000],
      );
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_property_preferences'),
        [20, 'Hyderabad', 'Gachibowli, Kondapur', 2, 3, 22000, 38000, 'FULLY_FURNISHED', '2026-11-15', 'BACHELOR'],
      );
    });

    it('updates owners.properties_count for an owner account', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ city: 'Pune', preferences: null }) // existingProfile
        .mockResolvedValueOnce({ owner_type: 'INDIVIDUAL', properties_count: 0 }) // existingOwner
        .mockResolvedValue({ id: 30, full_name: 'Priya Nair', properties_count: 4 });

      await service.updateProfile(testOwner, {
        city: 'Pune',
        preferredLocalities: ['Koregaon Park', 'Kalyani Nagar'],
        owner: { propertiesCount: 4, ownerType: 'INDIVIDUAL' },
      });

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO owners (user_id, owner_type, properties_count)'),
        [30, 'INDIVIDUAL', 4],
      );
    });

    it('clears optional fields to NULL when explicitly passed null or empty string across user_profiles, tenants, agents, and builders', async () => {
      // 1. Tenant clearing occupation, employer, about, dateOfBirth, householdType, occupants, furnishing
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          city: 'Hyderabad',
          locality: 'Gachibowli',
          avatar_path: 'profiles/U20/avatar.jpg',
          date_of_birth: '1995-05-10',
          gender: 'MALE',
          occupation: 'Engineer',
          employer: 'Acme Corp',
          about: 'Old bio',
          preferences: JSON.stringify({
            preferredLocalities: ['Gachibowli'],
            preferredBhk: [2],
            furnishing: 'SEMI_FURNISHED',
          }),
        }) // existingProfile
        .mockResolvedValueOnce({
          household_type: 'FAMILY',
          occupants: 4,
          has_pets: 1,
          monthly_income: 120000,
          preferred_move_in: '2026-12-01',
          budget_min: 20000,
          budget_max: 35000,
        }) // existingTenant
        .mockResolvedValueOnce({
          preferred_city: 'Hyderabad',
          preferred_locality: 'Gachibowli',
          min_bhk: 2,
          max_bhk: 2,
          min_rent: 20000,
          max_rent: 35000,
          furnishing: 'SEMI_FURNISHED',
          move_in_timeframe: '2026-12-01',
          tenant_type: 'FAMILY',
        }) // existingPropPrefs
        .mockResolvedValue({ id: 20, full_name: 'Arjun Verma' });

      await service.updateProfile(testTenant, {
        avatarPath: null,
        dateOfBirth: '',
        gender: null,
        occupation: '',
        employer: null,
        about: '   ',
        tenant: {
          householdType: '',
          occupants: null,
          monthlyIncome: null,
          furnishing: 'ANY',
        },
      });

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_profiles'),
        [
          20,
          null, // avatar_path cleared
          null, // date_of_birth cleared
          null, // gender cleared
          null, // occupation cleared
          null, // employer cleared
          null, // address_line1
          null, // address_line2
          'Gachibowli', // primaryLocality preserved
          'Hyderabad', // effectiveCity preserved
          null,
          null,
          null, // about cleared
          JSON.stringify({
            preferredLocalities: ['Gachibowli'],
            preferredBhk: [2],
            furnishing: null, // furnishing cleared
          }),
        ],
      );

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        [
          20,
          null, // household_type cleared
          null, // occupants cleared
          1, // has_pets preserved (omitted)
          null, // monthly_income cleared
          '2026-12-01', // preferred_move_in preserved (omitted)
          20000, // budget_min preserved (omitted)
          35000, // budget_max preserved (omitted)
        ],
      );

      // 2. Agent clearing reraNumber, gstin, teamSize
      (db.execute as jest.Mock).mockClear();
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ city: 'Bengaluru', preferences: null }) // existingProfile
        .mockResolvedValueOnce({
          agency_name: 'Rao Realty',
          rera_number: 'RERA-123',
          gstin: '29ABCDE1234F1Z5',
          team_size: 12,
        }) // existingAgent
        .mockResolvedValue({ id: 40, full_name: 'Vikram Rao' });

      await service.updateProfile(testAgent, {
        agency: {
          reraNumber: '',
          gstin: null,
          teamSize: null,
        },
      });

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO agents'),
        [40, 'Rao Realty', null, null, null],
      );

      // 3. Builder clearing reraNumber, gstin, cin, website
      (db.execute as jest.Mock).mockClear();
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ city: 'Bengaluru', preferences: null }) // existingProfile
        .mockResolvedValueOnce({
          company_name: 'Meera Homes Pvt Ltd',
          rera_number: 'RERA-999',
          gstin: '29ZZZZZ1234F1Z5',
          cin: 'U70100KA2020PTC123456',
          website: 'https://meerahomes.example',
        }) // existingBuilder
        .mockResolvedValue({ id: 50, full_name: 'Meera Builders' });

      await service.updateProfile(testBuilder, {
        agency: {
          reraNumber: null,
          gstin: '',
          cin: null,
          website: '',
        },
      });

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO builders'),
        [50, 'Meera Homes Pvt Ltd', null, null, null, null],
      );
    });

    it('preserves omitted fields when only a subset of profile fields is updated', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({
          city: 'Hyderabad',
          locality: 'Gachibowli',
          avatar_path: 'profiles/U20/photo.png',
          date_of_birth: '1993-08-15',
          gender: 'FEMALE',
          occupation: 'Product Manager',
          employer: 'TechFlow',
          address_line1: 'Plot 42',
          address_line2: 'Phase 2',
          state: 'Telangana',
          pincode: '500032',
          about: 'Existing bio',
          preferences: JSON.stringify({
            preferredLocalities: ['Gachibowli', 'Madhapur'],
            preferredBhk: [2, 3],
            furnishing: 'FULLY_FURNISHED',
          }),
        }) // existingProfile
        .mockResolvedValueOnce({
          household_type: 'COUPLE',
          occupants: 2,
          has_pets: 1,
          monthly_income: 150000,
          preferred_move_in: '2026-12-10',
          budget_min: 30000,
          budget_max: 50000,
        }) // existingTenant
        .mockResolvedValueOnce(null) // existingPropPrefs
        .mockResolvedValue({ id: 20, full_name: 'Arjun Verma' });

      await service.updateProfile(testTenant, {
        tenant: {
          budgetMax: 55000,
        },
      });

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_profiles'),
        [
          20,
          'profiles/U20/photo.png',
          '1993-08-15',
          'FEMALE',
          'Product Manager',
          'TechFlow',
          'Plot 42',
          'Phase 2',
          'Gachibowli',
          'Hyderabad',
          'Telangana',
          '500032',
          'Existing bio',
          JSON.stringify({
            preferredLocalities: ['Gachibowli', 'Madhapur'],
            preferredBhk: [2, 3],
            furnishing: 'FULLY_FURNISHED',
          }),
        ],
      );

      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO tenants'),
        [20, 'COUPLE', 2, 1, 150000, '2026-12-10', 30000, 55000],
      );
    });

    it('rejects invalid calendar dates (e.g. 2026-02-31, 2026-13-01, non-leap 2026-02-29) on preferredMoveIn and dateOfBirth', async () => {
      for (const invalidDate of ['2026-02-31', '2026-13-01', '2026-02-29', '2026-04-31', 'not-a-date']) {
        await expect(
          service.updateProfile(testTenant, {
            tenant: { preferredMoveIn: invalidDate },
          }),
        ).rejects.toThrow(/Expected move-in date must be a valid YYYY-MM-DD calendar date/i);

        await expect(
          service.updateProfile(testTenant, {
            dateOfBirth: invalidDate,
          }),
        ).rejects.toThrow(/Date of birth must be a valid YYYY-MM-DD calendar date/i);

        const dtoInstance = plainToInstance(UpdateProfileDto, {
          dateOfBirth: invalidDate,
          tenant: { preferredMoveIn: invalidDate },
        });
        const errors = await validate(dtoInstance);
        expect(errors.length).toBeGreaterThan(0);
      }
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('accepts valid YYYY-MM-DD calendar dates including leap-year 2028-02-29', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ city: 'Hyderabad', preferences: null })
        .mockResolvedValueOnce({ budget_min: 20000, budget_max: 35000 })
        .mockResolvedValueOnce(null)
        .mockResolvedValue({ id: 20, full_name: 'Arjun Verma' });

      const dtoInstance = plainToInstance(UpdateProfileDto, {
        dateOfBirth: '1996-02-29',
        tenant: { preferredMoveIn: '2028-02-29' },
      });
      const errors = await validate(dtoInstance);
      expect(errors).toHaveLength(0);

      await expect(
        service.updateProfile(testTenant, {
          dateOfBirth: '1996-02-29',
          tenant: { preferredMoveIn: '2028-02-29' },
        }),
      ).resolves.toBeDefined();
    });

    it('rejects zero or negative rental budgets in both DTO and service', async () => {
      for (const badBudget of [0, -1, -25000]) {
        await expect(
          service.updateProfile(testTenant, {
            tenant: { budgetMin: badBudget, budgetMax: 30000 },
          }),
        ).rejects.toThrow(/Minimum rental budget must be at least 1/i);

        await expect(
          service.updateProfile(testTenant, {
            tenant: { budgetMin: 20000, budgetMax: badBudget },
          }),
        ).rejects.toThrow(/Maximum rental budget must be at least 1/i);

        const dtoInstance = plainToInstance(UpdateProfileDto, {
          tenant: { budgetMin: badBudget, budgetMax: badBudget },
        });
        const errors = await validate(dtoInstance);
        expect(errors.length).toBeGreaterThan(0);
      }
      expect(db.execute).not.toHaveBeenCalled();
    });

    it('rejects attempts to modify verified email or phone through the profile editor', async () => {
      await expect(
        service.updateProfile(testTenant, {
          fullName: 'Arjun Verma',
          email: 'hacker@example.com',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.updateProfile(testTenant, {
          fullName: 'Arjun Verma',
          phone: '9999999999',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(db.execute).not.toHaveBeenCalled();
    });

    it('rejects budgetMax < budgetMin', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce({ city: 'Bengaluru', preferences: null })
        .mockResolvedValueOnce({ budget_min: 30000, budget_max: 40000 })
        .mockResolvedValueOnce(null);

      await expect(
        service.updateProfile(testTenant, {
          tenant: { budgetMin: 45000, budgetMax: 25000 },
        }),
      ).rejects.toThrow(/Maximum rental budget must be greater than or equal to minimum rental budget/i);
    });

    it('rejects overly long combined localities instead of silently truncating', async () => {
      const tooManyLongLocalities = [
        'Very Long Locality Name Sector One Area Phase One East',
        'Very Long Locality Name Sector Two Area Phase Two West',
        'Very Long Locality Name Sector Three Area Phase Three North',
        'Very Long Locality Name Sector Four Area Phase Four South',
      ];
      await expect(
        service.updateProfile(testTenant, {
          preferredLocalities: tooManyLongLocalities,
        }),
      ).rejects.toThrow(/Combined preferred localities cannot exceed 190 characters/i);
    });

    it('rejects avatarPath that does not belong to the authenticated user', async () => {
      await expect(
        service.updateProfile(testTenant, {
          avatarPath: 'profiles/OTHER_USER/avatar.jpg',
        }),
      ).rejects.toThrow(/Invalid profile photo storage key/i);
    });
  });

  describe('publicProfile', () => {
    it('throws NotFoundException when publicId does not exist', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.publicProfile('NON_EXISTENT')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns sanitized public profile without exposing private phone or email', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({
        public_id: 'PUB-123',
        full_name: 'Odibrick Realty',
        created_at: '2026-01-01',
        agency_name: 'Odibrick Realty LLC',
        rera_number: 'PRM/KA/RERA/1251/310/PR/210326/004033',
        agent_status: 'VERIFIED',
        rating: 4.8,
        active_listings: 12,
        kyc_status: 'VERIFIED',
      });

      const res = await service.publicProfile('PUB-123');
      expect(res.publicId).toBe('PUB-123');
      expect(res.name).toBe('Odibrick Realty LLC');
      expect(res.identityVerified).toBe(true);
      expect(res.activeListings).toBe(12);
      expect((res as any).email).toBeUndefined();
      expect((res as any).phone).toBeUndefined();
    });
  });

  describe('toggleSaved', () => {
    it('removes saved property if already saved', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce({ property_id: 101 });

      const res = await service.toggleSaved(testTenant, 101);
      expect(res.saved).toBe(false);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM saved_properties'),
        [20, 101],
      );
    });

    it('adds saved property if not previously saved', async () => {
      (db.one as jest.Mock).mockResolvedValueOnce(null);

      const res = await service.toggleSaved(testTenant, 101);
      expect(res.saved).toBe(true);
      expect(db.execute).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO saved_properties'),
        [20, 101],
      );
    });
  });

  describe('dashboardSummary', () => {
    it('generates actionable tasks for incomplete Step 4 profile, unverified KYC, and due payments', async () => {
      (db.one as jest.Mock)
        .mockResolvedValueOnce(null) // KYC is unverified
        .mockResolvedValueOnce({ c: 3 }) // 3 unread notifications
        .mockResolvedValueOnce({
          full_name: 'Arjun Verma',
          city: 'Bengaluru',
          locality: null,
          preferences: null,
          budget_min: null,
          budget_max: null,
          preferred_move_in: null,
        }) // profileRow
        .mockResolvedValueOnce({ active_listings: 0 }); // stats

      (db.query as jest.Mock)
        .mockResolvedValueOnce([
          { id: 1, reference_code: 'ODB-PAY-1', purpose: 'RENT', total_amount: 35000, due_date: '2026-11-01' },
        ]) // duePayments
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      const res = await service.dashboardSummary(testTenant);
      expect(res.unreadNotifications).toBe(3);
      expect(res.profileCompletion.isComplete).toBe(false);
      expect(res.tasks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            label: expect.stringContaining('Complete your profile'),
            href: '/dashboard/profile',
          }),
          expect.objectContaining({
            label: 'Verify your identity to list or apply',
            href: '/dashboard/kyc',
          }),
          expect.objectContaining({
            label: expect.stringContaining('Pay rent — INR 35000'),
            href: '/dashboard/payments',
          }),
        ]),
      );
    });
  });
});
