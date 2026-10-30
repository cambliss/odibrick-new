import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuthUser } from '../../common/auth/auth.types';
import { isValidCalendarDateString, UpdateProfileDto } from './users.dto';

export interface ProfilePreferencesJson {
  preferredLocalities: string[];
  preferredBhk: number[];
  furnishing: 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FULLY_FURNISHED' | null;
}

export interface ProfileCompletionField {
  key: string;
  label: string;
  completed: boolean;
}

export interface ProfileCompletionStatus {
  isComplete: boolean;
  percentage: number;
  completedCount: number;
  totalRequired: number;
  missingFields: string[];
  fields: ProfileCompletionField[];
}

interface NormalizedProfileData {
  fullName: string | null;
  city: string | null;
  preferredLocalities: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  preferredBhk: number[];
  preferredMoveIn: string | null;
  furnishing: 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FULLY_FURNISHED' | null;
  propertiesCount: number | null;
  rawPreferencesObj: Record<string, any>;
}

const MAX_LOCALITY_LENGTH = 120;
const MAX_JOINED_LOCALITIES_LENGTH = 190;
const VALID_GENDERS = ['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'];
const VALID_HOUSEHOLD_TYPES = ['FAMILY', 'BACHELOR', 'COUPLE', 'COMPANY_LEASE', 'STUDENT'];

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  private parseJsonObject(raw: unknown): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return { ...(raw as Record<string, any>) };
    }
    return {};
  }

  private normalizeLocalitiesArray(values: unknown[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const item of values) {
      if (typeof item !== 'string') continue;
      const trimmed = item.trim();
      if (!trimmed) continue;
      const lower = trimmed.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        result.push(trimmed);
      }
    }
    return result;
  }

  private normalizeBhkArray(values: unknown[]): number[] {
    const set = new Set<number>();
    for (const item of values) {
      const n = Number(item);
      if (Number.isInteger(n) && n >= 1 && n <= 10) {
        set.add(n);
      }
    }
    return Array.from(set).sort((a, b) => a - b);
  }

  private normalizeFurnishing(
    value: unknown,
  ): 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FULLY_FURNISHED' | null {
    if (!value || typeof value !== 'string') return null;
    const upper = value.trim().toUpperCase();
    if (upper === 'ANY' || upper === '') return null;
    if (upper === 'FURNISHED' || upper === 'FULLY_FURNISHED') return 'FULLY_FURNISHED';
    if (upper === 'SEMI_FURNISHED') return 'SEMI_FURNISHED';
    if (upper === 'UNFURNISHED') return 'UNFURNISHED';
    return null;
  }

  private normalizeDateOnly(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return null;
      const iso = value.toISOString().slice(0, 10);
      return isValidCalendarDateString(iso) ? iso : null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return null;
      if (isValidCalendarDateString(trimmed)) {
        return trimmed;
      }
      if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
        const datePart = trimmed.slice(0, 10);
        if (isValidCalendarDateString(datePart)) {
          return datePart;
        }
      }
    }
    return null;
  }

  /**
   * Resolves an optional string column:
   * - `undefined` (omitted from request) -> preserves `existing`
   * - `null` or `""` (explicitly cleared) -> returns `null`
   * - non-empty string -> returns trimmed string
   */
  private resolveOptionalString(
    incoming: string | null | undefined,
    existing: string | null | undefined,
  ): string | null {
    if (incoming === undefined) {
      return existing !== undefined && existing !== null && String(existing).trim() !== ''
        ? String(existing).trim()
        : null;
    }
    if (incoming === null) return null;
    const trimmed = String(incoming).trim();
    return trimmed === '' ? null : trimmed;
  }

  /**
   * Resolves an optional numeric column:
   * - `undefined` (omitted from request) -> preserves `existing`
   * - `null` or `""` (explicitly cleared) -> returns `null`
   * - finite number -> returns `Number(incoming)`
   */
  private resolveOptionalNumber(
    incoming: number | string | null | undefined,
    existing: number | string | null | undefined,
  ): number | null {
    if (incoming === undefined) {
      return existing !== undefined && existing !== null && !Number.isNaN(Number(existing))
        ? Number(existing)
        : null;
    }
    if (incoming === null || String(incoming).trim() === '') return null;
    const n = Number(incoming);
    return Number.isFinite(n) ? n : null;
  }

  private extractNormalizedProfileData(params: {
    accountFullName?: string | null;
    profile?: any;
    tenant?: any;
    owner?: any;
    propertyPreferences?: any;
  }): NormalizedProfileData {
    const { accountFullName, profile, tenant, owner, propertyPreferences } = params;
    const rawPreferencesObj = this.parseJsonObject(profile?.preferences);

    let preferredLocalities: string[] = [];
    if (Array.isArray(rawPreferencesObj.preferredLocalities)) {
      preferredLocalities = this.normalizeLocalitiesArray(rawPreferencesObj.preferredLocalities);
    }
    if (preferredLocalities.length === 0 && propertyPreferences?.preferred_locality) {
      preferredLocalities = this.normalizeLocalitiesArray(
        String(propertyPreferences.preferred_locality).split(','),
      );
    }
    if (preferredLocalities.length === 0 && profile?.locality) {
      preferredLocalities = this.normalizeLocalitiesArray([String(profile.locality)]);
    }

    let preferredBhk: number[] = [];
    if (Array.isArray(rawPreferencesObj.preferredBhk)) {
      preferredBhk = this.normalizeBhkArray(rawPreferencesObj.preferredBhk);
    }
    if (
      preferredBhk.length === 0 &&
      (propertyPreferences?.min_bhk != null || propertyPreferences?.max_bhk != null)
    ) {
      const min = Number(propertyPreferences.min_bhk ?? propertyPreferences.max_bhk);
      const max = Number(propertyPreferences.max_bhk ?? propertyPreferences.min_bhk);
      if (Number.isInteger(min) && Number.isInteger(max) && min >= 1 && max >= min && max <= 10) {
        const range: number[] = [];
        for (let i = min; i <= max; i++) range.push(i);
        preferredBhk = range;
      }
    }

    const cityRaw = profile?.city ?? propertyPreferences?.preferred_city ?? null;
    const city = cityRaw && String(cityRaw).trim() ? String(cityRaw).trim() : null;

    const budgetMin =
      tenant?.budget_min != null
        ? Number(tenant.budget_min)
        : propertyPreferences?.min_rent != null
          ? Number(propertyPreferences.min_rent)
          : null;

    const budgetMax =
      tenant?.budget_max != null
        ? Number(tenant.budget_max)
        : propertyPreferences?.max_rent != null
          ? Number(propertyPreferences.max_rent)
          : null;

    const preferredMoveIn = this.normalizeDateOnly(tenant?.preferred_move_in);
    const furnishing =
      this.normalizeFurnishing(rawPreferencesObj.furnishing) ??
      this.normalizeFurnishing(propertyPreferences?.furnishing);

    const propertiesCount =
      owner?.properties_count != null && !Number.isNaN(Number(owner.properties_count))
        ? Number(owner.properties_count)
        : null;

    const fullName =
      accountFullName && String(accountFullName).trim() ? String(accountFullName).trim() : null;

    return {
      fullName,
      city,
      preferredLocalities,
      budgetMin,
      budgetMax,
      preferredBhk,
      preferredMoveIn,
      furnishing,
      propertiesCount,
      rawPreferencesObj,
    };
  }

  /**
   * Step 4 ("Complete profile") completion evaluation per Odibrick_Business_Flow.pdf:
   * - All client roles (TENANT, OWNER, AGENT, BUILDER): Full name, City, Preferred localities (multiple)
   * - TENANT: Minimum and maximum rental budget, Preferred BHK configurations, Expected move-in date
   * - OWNER: Number of properties (>= 1)
   * - AGENT / BUILDER: No extra mandatory fields beyond base client fields
   */
  calculateProfileCompletion(roles: string[], data: NormalizedProfileData): ProfileCompletionStatus {
    const fields: ProfileCompletionField[] = [
      {
        key: 'fullName',
        label: 'Full name',
        completed: Boolean(data.fullName && data.fullName.trim().length >= 2),
      },
      {
        key: 'city',
        label: 'City',
        completed: Boolean(data.city && data.city.trim().length > 0),
      },
      {
        key: 'preferredLocalities',
        label: 'Preferred localities',
        completed: data.preferredLocalities.length > 0,
      },
    ];

    if (roles.includes('TENANT')) {
      const hasValidBudget =
        data.budgetMin !== null &&
        data.budgetMax !== null &&
        Number.isFinite(data.budgetMin) &&
        Number.isFinite(data.budgetMax) &&
        data.budgetMin >= 1 &&
        data.budgetMax >= data.budgetMin;

      fields.push(
        {
          key: 'budget',
          label: 'Minimum and maximum rental budget',
          completed: hasValidBudget,
        },
        {
          key: 'preferredBhk',
          label: 'Preferred BHK configurations',
          completed: data.preferredBhk.length > 0,
        },
        {
          key: 'preferredMoveIn',
          label: 'Expected move-in date',
          completed: Boolean(data.preferredMoveIn && isValidCalendarDateString(data.preferredMoveIn)),
        },
      );
    }

    if (roles.includes('OWNER')) {
      fields.push({
        key: 'propertiesCount',
        label: 'Number of properties',
        completed:
          data.propertiesCount !== null &&
          Number.isInteger(data.propertiesCount) &&
          data.propertiesCount >= 1,
      });
    }

    const totalRequired = fields.length;
    const completedCount = fields.filter((f) => f.completed).length;
    const percentage = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 100;
    const missingFields = fields.filter((f) => !f.completed).map((f) => f.label);

    return {
      isComplete: missingFields.length === 0,
      percentage,
      completedCount,
      totalRequired,
      missingFields,
      fields,
    };
  }

  async profile(user: AuthUser) {
    const [account, profile, owner, tenant, agent, builder, kyc, propertyPreferences] = await Promise.all([
      this.db.one<any>(
        `SELECT id, public_id, full_name, email, phone, status, mfa_enabled,
                email_verified_at, phone_verified_at, created_at
           FROM users WHERE id = ?`,
        [user.id],
      ),
      this.db.one<any>('SELECT * FROM user_profiles WHERE user_id = ?', [user.id]),
      this.db.one<any>('SELECT * FROM owners WHERE user_id = ?', [user.id]),
      this.db.one<any>('SELECT * FROM tenants WHERE user_id = ?', [user.id]),
      this.db.one<any>('SELECT * FROM agents WHERE user_id = ?', [user.id]),
      this.db.one<any>('SELECT * FROM builders WHERE user_id = ?', [user.id]),
      this.db.one<any>(
        'SELECT status, reviewed_at, expires_at FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [user.id],
      ),
      this.db.one<any>('SELECT * FROM user_property_preferences WHERE user_id = ?', [user.id]),
    ]);

    const normalized = this.extractNormalizedProfileData({
      accountFullName: account?.full_name ?? user.fullName ?? null,
      profile,
      tenant,
      owner,
      propertyPreferences,
    });

    const profileCompletion = this.calculateProfileCompletion(user.roles ?? [], normalized);

    const enrichedProfile = profile
      ? {
          ...profile,
          city: normalized.city,
          locality: normalized.preferredLocalities[0] ?? profile.locality ?? null,
          preferredLocalities: normalized.preferredLocalities,
          preferences: {
            ...normalized.rawPreferencesObj,
            preferredLocalities: normalized.preferredLocalities,
            preferredBhk: normalized.preferredBhk,
            furnishing: normalized.furnishing,
          },
        }
      : {
          user_id: user.id,
          city: normalized.city,
          locality: normalized.preferredLocalities[0] ?? null,
          preferredLocalities: normalized.preferredLocalities,
          avatar_path: null,
          preferences: {
            preferredLocalities: normalized.preferredLocalities,
            preferredBhk: normalized.preferredBhk,
            furnishing: normalized.furnishing,
          },
        };

    const enrichedTenant =
      tenant || user.roles?.includes('TENANT')
        ? {
            ...(tenant ?? {
              user_id: user.id,
              household_type: null,
              occupants: null,
              has_pets: 0,
              monthly_income: null,
            }),
            budget_min: normalized.budgetMin,
            budget_max: normalized.budgetMax,
            preferred_move_in: normalized.preferredMoveIn,
            preferredBhk: normalized.preferredBhk,
            furnishing: normalized.furnishing,
          }
        : null;

    const enrichedOwner =
      owner || user.roles?.includes('OWNER')
        ? {
            ...(owner ?? {
              user_id: user.id,
              owner_type: 'INDIVIDUAL',
              bank_verified: 0,
            }),
            properties_count: normalized.propertiesCount ?? 0,
          }
        : null;

    return {
      account,
      profile: enrichedProfile,
      roles: user.roles,
      owner: enrichedOwner,
      tenant: enrichedTenant,
      agent,
      builder,
      kyc,
      rentalPreferences: {
        city: normalized.city,
        preferredLocalities: normalized.preferredLocalities,
        budgetMin: normalized.budgetMin,
        budgetMax: normalized.budgetMax,
        preferredBhk: normalized.preferredBhk,
        preferredMoveIn: normalized.preferredMoveIn,
        furnishing: normalized.furnishing,
      },
      profileCompletion,
    };
  }

  async updateProfile(user: AuthUser, dto: UpdateProfileDto) {
    const rawDto = dto as Record<string, unknown>;
    if (rawDto.email !== undefined || rawDto.phone !== undefined) {
      throw new BadRequestException(
        'Email address and mobile number are verified contacts and cannot be modified through the profile editor.',
      );
    }

    let cleanFullName: string | undefined;
    if (dto.fullName !== undefined) {
      cleanFullName = String(dto.fullName).trim();
      if (cleanFullName.length < 2 || cleanFullName.length > 160) {
        throw new BadRequestException('Full name must be between 2 and 160 characters.');
      }
    }

    let cleanCity: string | null | undefined;
    if (dto.city !== undefined) {
      const trimmedCity = dto.city === null ? '' : String(dto.city).trim();
      if (trimmedCity.length > 96) {
        throw new BadRequestException('City name cannot exceed 96 characters.');
      }
      cleanCity = trimmedCity || null;
    }

    let cleanDateOfBirth: string | null | undefined;
    if (dto.dateOfBirth !== undefined) {
      if (dto.dateOfBirth === null || String(dto.dateOfBirth).trim() === '') {
        cleanDateOfBirth = null;
      } else {
        const parsedDob = this.normalizeDateOnly(dto.dateOfBirth);
        if (!parsedDob) {
          throw new BadRequestException('Date of birth must be a valid YYYY-MM-DD calendar date.');
        }
        cleanDateOfBirth = parsedDob;
      }
    }

    if (
      dto.gender !== undefined &&
      dto.gender !== null &&
      String(dto.gender).trim() !== '' &&
      !VALID_GENDERS.includes(String(dto.gender).trim())
    ) {
      throw new BadRequestException('Invalid gender selection.');
    }

    let incomingLocalities: string[] | undefined;
    if (dto.preferredLocalities !== undefined) {
      if (!Array.isArray(dto.preferredLocalities)) {
        throw new BadRequestException('Preferred localities must be an array of locality names.');
      }
      for (const loc of dto.preferredLocalities) {
        if (typeof loc !== 'string') {
          throw new BadRequestException('Each preferred locality must be a string.');
        }
        if (loc.trim().length > MAX_LOCALITY_LENGTH) {
          throw new BadRequestException(
            `Each locality name must be ${MAX_LOCALITY_LENGTH} characters or fewer.`,
          );
        }
      }
      incomingLocalities = this.normalizeLocalitiesArray(dto.preferredLocalities);
      const joined = incomingLocalities.join(', ');
      if (joined.length > MAX_JOINED_LOCALITIES_LENGTH) {
        throw new BadRequestException(
          `Combined preferred localities cannot exceed ${MAX_JOINED_LOCALITIES_LENGTH} characters. Please select fewer or shorter locality names.`,
        );
      }
    } else if (dto.locality !== undefined) {
      const trimmedLoc = dto.locality === null ? '' : String(dto.locality).trim();
      if (trimmedLoc.length > MAX_LOCALITY_LENGTH) {
        throw new BadRequestException(
          `Locality name must be ${MAX_LOCALITY_LENGTH} characters or fewer.`,
        );
      }
      incomingLocalities = trimmedLoc ? [trimmedLoc] : [];
    }

    let cleanAvatarPath: string | null | undefined;
    if (dto.avatarPath !== undefined) {
      if (dto.avatarPath === null || String(dto.avatarPath).trim() === '') {
        cleanAvatarPath = null;
      } else {
        const cleanKey = String(dto.avatarPath).trim().replace(/\\/g, '/');
        const allowedPrefix = `profiles/${user.publicId}/`;
        if (
          cleanKey.includes('..') ||
          cleanKey.startsWith('/') ||
          (!cleanKey.startsWith(allowedPrefix) && !cleanKey.startsWith('demo/profiles/'))
        ) {
          throw new BadRequestException('Invalid profile photo storage key.');
        }
        cleanAvatarPath = cleanKey;
      }
    }

    let incomingBhk: number[] | undefined;
    let incomingFurnishing: 'UNFURNISHED' | 'SEMI_FURNISHED' | 'FULLY_FURNISHED' | null | undefined;
    let incomingMoveIn: string | null | undefined;

    if (dto.tenant !== undefined) {
      if (
        dto.tenant.householdType !== undefined &&
        dto.tenant.householdType !== null &&
        String(dto.tenant.householdType).trim() !== '' &&
        !VALID_HOUSEHOLD_TYPES.includes(String(dto.tenant.householdType).trim())
      ) {
        throw new BadRequestException('Invalid household type selection.');
      }
      if (
        dto.tenant.occupants !== undefined &&
        dto.tenant.occupants !== null &&
        String(dto.tenant.occupants).trim() !== ''
      ) {
        const occ = Number(dto.tenant.occupants);
        if (!Number.isInteger(occ) || occ < 1 || occ > 20) {
          throw new BadRequestException('Occupants must be a whole number between 1 and 20.');
        }
      }
      if (
        dto.tenant.budgetMin !== undefined &&
        dto.tenant.budgetMin !== null &&
        String(dto.tenant.budgetMin).trim() !== ''
      ) {
        const min = Number(dto.tenant.budgetMin);
        if (!Number.isFinite(min) || min < 1) {
          throw new BadRequestException('Minimum rental budget must be at least 1.');
        }
      }
      if (
        dto.tenant.budgetMax !== undefined &&
        dto.tenant.budgetMax !== null &&
        String(dto.tenant.budgetMax).trim() !== ''
      ) {
        const max = Number(dto.tenant.budgetMax);
        if (!Number.isFinite(max) || max < 1) {
          throw new BadRequestException('Maximum rental budget must be at least 1.');
        }
      }
      if (dto.tenant.preferredBhk !== undefined) {
        if (!Array.isArray(dto.tenant.preferredBhk)) {
          throw new BadRequestException('Preferred BHK configurations must be an array of numbers.');
        }
        for (const b of dto.tenant.preferredBhk) {
          const n = Number(b);
          if (!Number.isInteger(n) || n < 1 || n > 10) {
            throw new BadRequestException('Each preferred BHK value must be an integer between 1 and 10.');
          }
        }
        incomingBhk = this.normalizeBhkArray(dto.tenant.preferredBhk);
      }
      if (dto.tenant.furnishing !== undefined) {
        if (
          dto.tenant.furnishing === null ||
          String(dto.tenant.furnishing).trim() === '' ||
          String(dto.tenant.furnishing).toUpperCase() === 'ANY'
        ) {
          incomingFurnishing = null;
        } else {
          const norm = this.normalizeFurnishing(dto.tenant.furnishing);
          if (!norm) {
            throw new BadRequestException('Invalid furnishing preference.');
          }
          incomingFurnishing = norm;
        }
      }
      if (dto.tenant.preferredMoveIn !== undefined) {
        if (dto.tenant.preferredMoveIn === null || String(dto.tenant.preferredMoveIn).trim() === '') {
          incomingMoveIn = null;
        } else {
          const normDate = this.normalizeDateOnly(dto.tenant.preferredMoveIn);
          if (!normDate) {
            throw new BadRequestException(
              'Expected move-in date must be a valid YYYY-MM-DD calendar date.',
            );
          }
          incomingMoveIn = normDate;
        }
      }
    }

    if (
      dto.owner !== undefined &&
      dto.owner.propertiesCount !== undefined &&
      dto.owner.propertiesCount !== null
    ) {
      const count = Number(dto.owner.propertiesCount);
      if (!Number.isInteger(count) || count < 0 || count > 10000) {
        throw new BadRequestException('Number of properties must be a whole number between 0 and 10,000.');
      }
    }

    const runInTx = async <T>(
      fn: (runner: {
        one: <R = any>(sql: string, params?: unknown[]) => Promise<R | null>;
        execute: (sql: string, params?: unknown[]) => Promise<any>;
      }) => Promise<T>,
    ): Promise<T> => {
      if (typeof this.db.transaction === 'function') {
        return this.db.transaction(async (conn) => {
          const runner = {
            one: async <R = any>(sql: string, params: unknown[] = []): Promise<R | null> => {
              const [rows]: any = await conn.query(sql, params as any[]);
              return Array.isArray(rows) && rows.length ? (rows[0] as R) : null;
            },
            execute: async (sql: string, params: unknown[] = []) => {
              const [res] = await conn.execute(sql, params as any[]);
              return res;
            },
          };
          return fn(runner);
        });
      }
      return fn({
        one: (sql, params = []) => this.db.one(sql, params),
        execute: (sql, params = []) => this.db.execute(sql, params),
      });
    };

    await runInTx(async (runner) => {
      const [
        existingProfile,
        existingTenant,
        existingOwner,
        existingPropPrefs,
        existingAgent,
        existingBuilder,
      ] = await Promise.all([
        runner.one<any>('SELECT * FROM user_profiles WHERE user_id = ? FOR UPDATE', [user.id]),
        user.roles.includes('TENANT')
          ? runner.one<any>('SELECT * FROM tenants WHERE user_id = ? FOR UPDATE', [user.id])
          : Promise.resolve(null),
        user.roles.includes('OWNER')
          ? runner.one<any>('SELECT * FROM owners WHERE user_id = ? FOR UPDATE', [user.id])
          : Promise.resolve(null),
        user.roles.includes('TENANT')
          ? runner.one<any>('SELECT * FROM user_property_preferences WHERE user_id = ? FOR UPDATE', [user.id])
          : Promise.resolve(null),
        user.roles.includes('AGENT') && dto.agency !== undefined
          ? runner.one<any>('SELECT * FROM agents WHERE user_id = ? FOR UPDATE', [user.id])
          : Promise.resolve(null),
        user.roles.includes('BUILDER') && dto.agency !== undefined
          ? runner.one<any>('SELECT * FROM builders WHERE user_id = ? FOR UPDATE', [user.id])
          : Promise.resolve(null),
      ]);

      const currentNormalized = this.extractNormalizedProfileData({
        accountFullName: cleanFullName ?? user.fullName,
        profile: existingProfile,
        tenant: existingTenant,
        owner: existingOwner,
        propertyPreferences: existingPropPrefs,
      });

      const effectiveCity = cleanCity !== undefined ? cleanCity : currentNormalized.city;
      const effectiveLocalities =
        incomingLocalities !== undefined ? incomingLocalities : currentNormalized.preferredLocalities;
      const primaryLocality = effectiveLocalities[0] ?? null;
      const effectiveBhk = incomingBhk !== undefined ? incomingBhk : currentNormalized.preferredBhk;
      const effectiveFurnishing =
        incomingFurnishing !== undefined ? incomingFurnishing : currentNormalized.furnishing;

      const effectiveBudgetMin = this.resolveOptionalNumber(
        dto.tenant?.budgetMin,
        currentNormalized.budgetMin,
      );
      const effectiveBudgetMax = this.resolveOptionalNumber(
        dto.tenant?.budgetMax,
        currentNormalized.budgetMax,
      );

      if (
        effectiveBudgetMin !== null &&
        effectiveBudgetMax !== null &&
        effectiveBudgetMax < effectiveBudgetMin
      ) {
        throw new BadRequestException(
          'Maximum rental budget must be greater than or equal to minimum rental budget.',
        );
      }

      if (cleanFullName !== undefined) {
        if (typeof this.db.update === 'function' && typeof this.db.transaction !== 'function') {
          await this.db.update('users', user.id, { full_name: cleanFullName });
        } else {
          await runner.execute('UPDATE users SET full_name = ? WHERE id = ?', [cleanFullName, user.id]);
        }
      }

      const updatedPreferencesJson = JSON.stringify({
        ...currentNormalized.rawPreferencesObj,
        preferredLocalities: effectiveLocalities,
        preferredBhk: effectiveBhk,
        furnishing: effectiveFurnishing,
      });

      const effectiveAvatarPath =
        cleanAvatarPath !== undefined ? cleanAvatarPath : (existingProfile?.avatar_path ?? null);
      const effectiveDateOfBirth =
        cleanDateOfBirth !== undefined
          ? cleanDateOfBirth
          : this.normalizeDateOnly(existingProfile?.date_of_birth);
      const effectiveGender = this.resolveOptionalString(dto.gender, existingProfile?.gender);
      const effectiveOccupation = this.resolveOptionalString(
        dto.occupation,
        existingProfile?.occupation,
      );
      const effectiveEmployer = this.resolveOptionalString(
        dto.employer,
        existingProfile?.employer,
      );
      const effectiveAddressLine1 = this.resolveOptionalString(
        dto.addressLine1,
        existingProfile?.address_line1,
      );
      const effectiveAddressLine2 = this.resolveOptionalString(
        dto.addressLine2,
        existingProfile?.address_line2,
      );
      const effectiveState = this.resolveOptionalString(dto.state, existingProfile?.state);
      const effectivePincode = this.resolveOptionalString(dto.pincode, existingProfile?.pincode);
      const effectiveAbout = this.resolveOptionalString(dto.about, existingProfile?.about);

      await runner.execute(
        `INSERT INTO user_profiles (
           user_id, avatar_path, date_of_birth, gender, occupation, employer,
           address_line1, address_line2, locality, city, state, pincode, about, preferences
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           avatar_path = VALUES(avatar_path),
           date_of_birth = VALUES(date_of_birth),
           gender = VALUES(gender),
           occupation = VALUES(occupation),
           employer = VALUES(employer),
           address_line1 = VALUES(address_line1),
           address_line2 = VALUES(address_line2),
           locality = VALUES(locality),
           city = VALUES(city),
           state = VALUES(state),
           pincode = VALUES(pincode),
           about = VALUES(about),
           preferences = VALUES(preferences)`,
        [
          user.id,
          effectiveAvatarPath,
          effectiveDateOfBirth,
          effectiveGender,
          effectiveOccupation,
          effectiveEmployer,
          effectiveAddressLine1,
          effectiveAddressLine2,
          primaryLocality,
          effectiveCity,
          effectiveState,
          effectivePincode,
          effectiveAbout,
          updatedPreferencesJson,
        ],
      );

      if (
        user.roles.includes('TENANT') &&
        (dto.tenant !== undefined ||
          dto.city !== undefined ||
          dto.preferredLocalities !== undefined ||
          dto.locality !== undefined)
      ) {
        const effectiveHouseholdType = this.resolveOptionalString(
          dto.tenant?.householdType,
          existingTenant?.household_type,
        );
        const effectiveOccupants = this.resolveOptionalNumber(
          dto.tenant?.occupants,
          existingTenant?.occupants,
        );
        const effectiveHasPets =
          dto.tenant?.hasPets !== undefined && dto.tenant?.hasPets !== null
            ? dto.tenant.hasPets
              ? 1
              : 0
            : Number(existingTenant?.has_pets ?? 0);
        const effectiveMonthlyIncome = this.resolveOptionalNumber(
          dto.tenant?.monthlyIncome,
          existingTenant?.monthly_income,
        );
        const effectiveMoveIn =
          incomingMoveIn !== undefined ? incomingMoveIn : currentNormalized.preferredMoveIn;

        await runner.execute(
          `INSERT INTO tenants (
             user_id, household_type, occupants, has_pets, monthly_income,
             preferred_move_in, budget_min, budget_max
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             household_type = VALUES(household_type),
             occupants = VALUES(occupants),
             has_pets = VALUES(has_pets),
             monthly_income = VALUES(monthly_income),
             preferred_move_in = VALUES(preferred_move_in),
             budget_min = VALUES(budget_min),
             budget_max = VALUES(budget_max)`,
          [
            user.id,
            effectiveHouseholdType,
            effectiveOccupants,
            effectiveHasPets,
            effectiveMonthlyIncome,
            effectiveMoveIn,
            effectiveBudgetMin,
            effectiveBudgetMax,
          ],
        );

        const minBhk = effectiveBhk.length > 0 ? Math.min(...effectiveBhk) : null;
        const maxBhk = effectiveBhk.length > 0 ? Math.max(...effectiveBhk) : null;
        const joinedLocalities =
          effectiveLocalities.length > 0 ? effectiveLocalities.join(', ') : null;

        await runner.execute(
          `INSERT INTO user_property_preferences (
             user_id, preferred_city, preferred_locality, min_bhk, max_bhk,
             min_rent, max_rent, furnishing, move_in_timeframe, tenant_type
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             preferred_city = VALUES(preferred_city),
             preferred_locality = VALUES(preferred_locality),
             min_bhk = VALUES(min_bhk),
             max_bhk = VALUES(max_bhk),
             min_rent = VALUES(min_rent),
             max_rent = VALUES(max_rent),
             furnishing = VALUES(furnishing),
             move_in_timeframe = VALUES(move_in_timeframe),
             tenant_type = VALUES(tenant_type),
             updated_at = CURRENT_TIMESTAMP`,
          [
            user.id,
            effectiveCity,
            joinedLocalities,
            minBhk,
            maxBhk,
            effectiveBudgetMin,
            effectiveBudgetMax,
            effectiveFurnishing,
            effectiveMoveIn,
            effectiveHouseholdType,
          ],
        );
      }

      if (user.roles.includes('OWNER') && dto.owner !== undefined) {
        const effectiveOwnerType =
          this.resolveOptionalString(dto.owner.ownerType, existingOwner?.owner_type) ??
          'INDIVIDUAL';
        const effectivePropertiesCount =
          dto.owner.propertiesCount !== undefined && dto.owner.propertiesCount !== null
            ? Number(dto.owner.propertiesCount)
            : Number(existingOwner?.properties_count ?? 0);

        await runner.execute(
          `INSERT INTO owners (user_id, owner_type, properties_count)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             owner_type = VALUES(owner_type),
             properties_count = VALUES(properties_count)`,
          [user.id, effectiveOwnerType, effectivePropertiesCount],
        );
      }

      if (dto.agency && (user.roles.includes('AGENT') || user.roles.includes('BUILDER'))) {
        if (user.roles.includes('AGENT')) {
          const effectiveAgencyName =
            this.resolveOptionalString(dto.agency.name, existingAgent?.agency_name) ??
            cleanFullName ??
            user.fullName ??
            'Agency';
          const effectiveRera = this.resolveOptionalString(
            dto.agency.reraNumber,
            existingAgent?.rera_number,
          );
          const effectiveGstin = this.resolveOptionalString(
            dto.agency.gstin,
            existingAgent?.gstin,
          );
          const effectiveTeamSize = this.resolveOptionalNumber(
            dto.agency.teamSize,
            existingAgent?.team_size,
          );

          await runner.execute(
            `INSERT INTO agents (user_id, agency_name, rera_number, gstin, team_size)
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               agency_name = VALUES(agency_name),
               rera_number = VALUES(rera_number),
               gstin = VALUES(gstin),
               team_size = VALUES(team_size)`,
            [user.id, effectiveAgencyName, effectiveRera, effectiveGstin, effectiveTeamSize],
          );
        } else {
          const effectiveCompanyName =
            this.resolveOptionalString(dto.agency.name, existingBuilder?.company_name) ??
            cleanFullName ??
            user.fullName ??
            'Builder';
          const effectiveRera = this.resolveOptionalString(
            dto.agency.reraNumber,
            existingBuilder?.rera_number,
          );
          const effectiveGstin = this.resolveOptionalString(
            dto.agency.gstin,
            existingBuilder?.gstin,
          );
          const effectiveCin = this.resolveOptionalString(
            dto.agency.cin,
            existingBuilder?.cin,
          );
          const effectiveWebsite = this.resolveOptionalString(
            dto.agency.website,
            existingBuilder?.website,
          );

          await runner.execute(
            `INSERT INTO builders (user_id, company_name, rera_number, gstin, cin, website)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
               company_name = VALUES(company_name),
               rera_number = VALUES(rera_number),
               gstin = VALUES(gstin),
               cin = VALUES(cin),
               website = VALUES(website)`,
            [
              user.id,
              effectiveCompanyName,
              effectiveRera,
              effectiveGstin,
              effectiveCin,
              effectiveWebsite,
            ],
          );
        }
      }
    });

    return this.profile(user);
  }

  async publicProfile(publicId: string) {
    const user = await this.db.one<any>(
      `SELECT u.public_id, u.full_name, u.created_at,
              a.agency_name, a.rera_number, a.verification_status AS agent_status, a.rating,
              b.company_name, b.rera_number AS builder_rera, b.verification_status AS builder_status,
              (SELECT COUNT(*) FROM properties p WHERE p.listed_by_user_id = u.id AND p.status = 'ACTIVE') AS active_listings,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS kyc_status
         FROM users u
         LEFT JOIN agents a ON a.user_id = u.id
         LEFT JOIN builders b ON b.user_id = u.id
        WHERE u.public_id = ? AND u.deleted_at IS NULL`,
      [publicId],
    );
    if (!user) throw new NotFoundException('Profile not found.');
    // Contact details are never in a public profile — enquiries route through the platform.
    return {
      publicId: user.public_id,
      name: user.agency_name ?? user.company_name ?? user.full_name,
      memberSince: user.created_at,
      activeListings: user.active_listings,
      identityVerified: user.kyc_status === 'VERIFIED',
      reraNumber: user.rera_number ?? user.builder_rera ?? null,
      rating: user.rating,
    };
  }

  async savedProperties(user: AuthUser) {
    return this.db.query(
      `SELECT p.id, p.public_id, p.slug, p.title, p.locality, p.city, p.rent_amount, p.sale_price,
              p.bedrooms, p.property_type, p.status, sp.note, sp.created_at AS saved_at,
              (SELECT pi.storage_key FROM property_images pi WHERE property_id = p.id
                ORDER BY pi.is_cover DESC LIMIT 1) AS cover_key
         FROM saved_properties sp JOIN properties p ON p.id = sp.property_id
        WHERE sp.user_id = ? ORDER BY sp.created_at DESC`,
      [user.id],
    );
  }

  async toggleSaved(user: AuthUser, propertyId: number) {
    const existing = await this.db.one<any>(
      'SELECT property_id FROM saved_properties WHERE user_id = ? AND property_id = ?',
      [user.id, propertyId],
    );
    if (existing) {
      await this.db.execute('DELETE FROM saved_properties WHERE user_id = ? AND property_id = ?', [
        user.id,
        propertyId,
      ]);
      return { saved: false };
    }
    await this.db.execute('INSERT INTO saved_properties (user_id, property_id) VALUES (?, ?)', [
      user.id,
      propertyId,
    ]);
    return { saved: true };
  }

  /** Everything the signed-in user needs for the "what do I do next" panel. */
  async dashboardSummary(user: AuthUser) {
    const [kyc, notifications, profileRow] = await Promise.all([
      this.db.one<any>(
        'SELECT status FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [user.id],
      ),
      this.db.one<any>(
        "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL AND channel = 'IN_APP'",
        [user.id],
      ),
      this.db.one<any>(
        `SELECT u.full_name,
                up.city, up.locality, up.preferences,
                t.budget_min, t.budget_max, t.preferred_move_in,
                o.properties_count,
                upp.preferred_city, upp.preferred_locality, upp.min_bhk, upp.max_bhk,
                upp.min_rent, upp.max_rent, upp.furnishing
           FROM users u
           LEFT JOIN user_profiles up ON up.user_id = u.id
           LEFT JOIN tenants t ON t.user_id = u.id
           LEFT JOIN owners o ON o.user_id = u.id
           LEFT JOIN user_property_preferences upp ON upp.user_id = u.id
          WHERE u.id = ?`,
        [user.id],
      ),
    ]);

    const normalized = this.extractNormalizedProfileData({
      accountFullName: profileRow?.full_name ?? user.fullName ?? null,
      profile: profileRow
        ? {
            city: profileRow.city,
            locality: profileRow.locality,
            preferences: profileRow.preferences,
          }
        : null,
      tenant: profileRow
        ? {
            budget_min: profileRow.budget_min,
            budget_max: profileRow.budget_max,
            preferred_move_in: profileRow.preferred_move_in,
          }
        : null,
      owner: profileRow
        ? {
            properties_count: profileRow.properties_count,
          }
        : null,
      propertyPreferences: profileRow
        ? {
            preferred_city: profileRow.preferred_city,
            preferred_locality: profileRow.preferred_locality,
            min_bhk: profileRow.min_bhk,
            max_bhk: profileRow.max_bhk,
            min_rent: profileRow.min_rent,
            max_rent: profileRow.max_rent,
            furnishing: profileRow.furnishing,
          }
        : null,
    });

    const profileCompletion = this.calculateProfileCompletion(user.roles ?? [], normalized);

    const tasks: Array<{ label: string; href: string; severity: string }> = [];
    if (user.contactVerified === false || user.emailVerified === false || user.phoneVerified === false) {
      tasks.push({
        label: 'Verify your email and mobile number via OTP',
        href: '/verify-contact',
        severity: 'ACTION',
      });
    }
    if (!profileCompletion.isComplete) {
      tasks.push({
        label: `Complete your profile (${profileCompletion.percentage}% complete — missing: ${profileCompletion.missingFields.join(', ')})`,
        href: '/dashboard/profile',
        severity: 'ACTION',
      });
    }
    if (!kyc || kyc.status !== 'VERIFIED') {
      tasks.push({
        label:
          kyc?.status === 'SUBMITTED'
            ? 'Identity verification in progress'
            : 'Verify your identity to list or apply',
        href: '/dashboard/kyc',
        severity: kyc?.status === 'SUBMITTED' ? 'INFO' : 'ACTION',
      });
    }

    const duePayments = await this.db.query<any>(
      "SELECT id, reference_code, purpose, total_amount, due_date FROM payments WHERE payer_user_id = ? AND status = 'DUE' ORDER BY due_date LIMIT 5",
      [user.id],
    );
    duePayments.forEach((p) =>
      tasks.push({
        label: `Pay ${p.purpose.toLowerCase().replace('_', ' ')} — INR ${p.total_amount}`,
        href: '/dashboard/payments',
        severity: 'ACTION',
      }),
    );

    const signatures = await this.db.query<any>(
      `SELECT a.id, a.agreement_number FROM agreement_signatories s JOIN agreements a ON a.id = s.agreement_id
        WHERE s.user_id = ? AND s.status = 'PENDING' AND a.status IN ('AWAITING_SIGNATURES','PARTIALLY_SIGNED')`,
      [user.id],
    );
    signatures.forEach((a) =>
      tasks.push({
        label: `Sign agreement ${a.agreement_number}`,
        href: `/dashboard/agreements/${a.id}`,
        severity: 'ACTION',
      }),
    );

    const checkIn = await this.db.query<any>(
      "SELECT id FROM tenancies WHERE tenant_user_id = ? AND stage = 'CHECK_IN_PENDING'",
      [user.id],
    );
    checkIn.forEach((t) =>
      tasks.push({
        label: 'Record your Day 1 condition report',
        href: `/dashboard/tenancy/${t.id}`,
        severity: 'ACTION',
      }),
    );

    const ownerMaintenanceReviews = await this.db.query<any>(
      `SELECT m.id, m.ticket_number, m.title FROM maintenance_requests m
         JOIN tenancies t ON t.id = m.tenancy_id
        WHERE t.owner_user_id = ? AND m.status IN ('OPEN', 'OWNER_REVIEW') LIMIT 5`,
      [user.id],
    );
    ownerMaintenanceReviews.forEach((m) =>
      tasks.push({
        label: `Review maintenance request ${m.ticket_number}: ${m.title}`,
        href: `/dashboard/maintenance/${m.id}`,
        severity: 'ACTION',
      }),
    );

    const tenantMaintenanceConfirmations = await this.db.query<any>(
      `SELECT m.id, m.ticket_number, m.title FROM maintenance_requests m
         JOIN tenancies t ON t.id = m.tenancy_id
        WHERE t.tenant_user_id = ? AND m.status = 'COMPLETED' LIMIT 5`,
      [user.id],
    );
    tenantMaintenanceConfirmations.forEach((m) =>
      tasks.push({
        label: `Confirm resolution of maintenance ${m.ticket_number}`,
        href: `/dashboard/maintenance/${m.id}`,
        severity: 'ACTION',
      }),
    );

    const stats = await this.db.one<any>(
      `SELECT (SELECT COUNT(*) FROM properties WHERE listed_by_user_id = ? AND status = 'ACTIVE') AS active_listings,
              (SELECT COUNT(*) FROM properties WHERE listed_by_user_id = ? AND status = 'DRAFT') AS draft_listings,
              (SELECT COUNT(*) FROM enquiries e JOIN properties p ON p.id = e.property_id
                WHERE p.listed_by_user_id = ? AND e.status = 'NEW') AS new_leads,
              (SELECT COUNT(*) FROM applications a JOIN properties p ON p.id = a.property_id
                WHERE p.listed_by_user_id = ? AND a.status = 'SUBMITTED') AS new_applications,
              (SELECT COUNT(*) FROM applications WHERE tenant_user_id = ?) AS my_applications,
              (SELECT COUNT(*) FROM saved_properties WHERE user_id = ?) AS saved,
              (SELECT COUNT(*) FROM tenancies WHERE (owner_user_id = ? OR tenant_user_id = ?) AND stage NOT IN ('CLOSED','CANCELLED')) AS active_tenancies`,
      [user.id, user.id, user.id, user.id, user.id, user.id, user.id, user.id],
    );

    return {
      kycStatus: kyc?.status ?? 'NOT_STARTED',
      unreadNotifications: notifications?.c ?? 0,
      profileCompletion,
      tasks,
      stats,
    };
  }
}
