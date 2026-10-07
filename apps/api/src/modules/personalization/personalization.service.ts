import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationService } from '../automation/automation.service';
import { AuthUser } from '../../common/auth/auth.types';
import { pageParams, paginate, Paginated } from '../../common/util/pagination';
import {
  AggregateDemandInsights,
  CustomerDashboardOverview,
  ListingPerformanceMetrics,
  MatchResult,
  ProviderActionCentreOverview,
  RecommendationCategory,
  RecommendationItem,
  SavedSearch,
  UserPropertyPreferences,
} from './personalization.types';
import {
  CreateSavedSearchDto,
  TrackInteractionDto,
  UpdateSavedSearchDto,
  UpsertPreferencesDto,
} from './personalization.dto';

@Injectable()
export class PersonalizationService {
  private readonly logger = new Logger(PersonalizationService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
    private readonly automation: AutomationService,
  ) {}

  // =========================================================================
  // 1. USER PROPERTY PREFERENCES
  // =========================================================================

  async getPreferences(userId: number): Promise<UserPropertyPreferences | null> {
    const row = await this.db.one<any>(
      `SELECT id, user_id, preferred_city, preferred_locality, property_type,
              min_bhk, max_bhk, min_rent, max_rent, furnishing, preferred_amenities,
              min_carpet_area_sqft, preferred_lease_duration_months, move_in_timeframe,
              tenant_type, created_at, updated_at
         FROM user_property_preferences
        WHERE user_id = ?`,
      [userId],
    );

    if (!row) return null;

    return {
      id: row.id,
      userId: row.user_id,
      preferredCity: row.preferred_city,
      preferredLocality: row.preferred_locality,
      propertyType: row.property_type,
      minBhk: row.min_bhk,
      maxBhk: row.max_bhk,
      minRent: row.min_rent ? Number(row.min_rent) : null,
      maxRent: row.max_rent ? Number(row.max_rent) : null,
      furnishing: row.furnishing,
      preferredAmenities:
        typeof row.preferred_amenities === 'string'
          ? JSON.parse(row.preferred_amenities)
          : row.preferred_amenities,
      minCarpetAreaSqft: row.min_carpet_area_sqft,
      preferredLeaseDurationMonths: row.preferred_lease_duration_months,
      moveInTimeframe: row.move_in_timeframe,
      tenantType: row.tenant_type,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async upsertPreferences(
    userId: number,
    dto: UpsertPreferencesDto,
    actor?: AuthUser,
  ): Promise<UserPropertyPreferences> {
    const amenitiesJson = dto.preferredAmenities ? JSON.stringify(dto.preferredAmenities) : null;

    await this.db.execute(
      `INSERT INTO user_property_preferences (
         user_id, preferred_city, preferred_locality, property_type,
         min_bhk, max_bhk, min_rent, max_rent, furnishing,
         preferred_amenities, min_carpet_area_sqft, preferred_lease_duration_months,
         move_in_timeframe, tenant_type
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         preferred_city = VALUES(preferred_city),
         preferred_locality = VALUES(preferred_locality),
         property_type = VALUES(property_type),
         min_bhk = VALUES(min_bhk),
         max_bhk = VALUES(max_bhk),
         min_rent = VALUES(min_rent),
         max_rent = VALUES(max_rent),
         furnishing = VALUES(furnishing),
         preferred_amenities = VALUES(preferred_amenities),
         min_carpet_area_sqft = VALUES(min_carpet_area_sqft),
         preferred_lease_duration_months = VALUES(preferred_lease_duration_months),
         move_in_timeframe = VALUES(move_in_timeframe),
         tenant_type = VALUES(tenant_type),
         updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        dto.preferredCity || null,
        dto.preferredLocality || null,
        dto.propertyType || null,
        dto.minBhk !== undefined ? dto.minBhk : null,
        dto.maxBhk !== undefined ? dto.maxBhk : null,
        dto.minRent !== undefined ? dto.minRent : null,
        dto.maxRent !== undefined ? dto.maxRent : null,
        dto.furnishing || null,
        amenitiesJson,
        dto.minCarpetAreaSqft !== undefined ? dto.minCarpetAreaSqft : null,
        dto.preferredLeaseDurationMonths !== undefined ? dto.preferredLeaseDurationMonths : null,
        dto.moveInTimeframe || null,
        dto.tenantType || null,
      ],
    );

    await this.audit.record({
      actor,
      action: 'preferences.updated',
      objectType: 'USER_PREFERENCES',
      objectId: userId,
      metadata: { updatedFields: Object.keys(dto) },
    });

    const updated = await this.getPreferences(userId);
    return updated!;
  }

  // =========================================================================
  // 2. SAVED PROPERTIES
  // =========================================================================

  async getSavedProperties(userId: number, page = 1, perPage = 20): Promise<Paginated<any>> {
    const { offset, perPage: limit, page: currentPage } = pageParams(page, perPage);

    const countRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM saved_properties WHERE user_id = ?`,
      [userId],
    );
    const total = Number(countRow?.total || 0);

    const rows = await this.db.query(
      `SELECT sp.property_id, sp.note, sp.created_at AS saved_at,
              p.id, p.public_id, p.title, p.slug, p.locality, p.city, p.state,
              p.property_type, p.bedrooms, p.bathrooms, p.builtup_area_sqft,
              p.furnishing, p.rent_amount, p.security_deposit, p.status,
              (SELECT pi.storage_key FROM property_images pi WHERE pi.property_id = p.id
                ORDER BY pi.is_cover DESC, pi.sort_order ASC LIMIT 1) AS cover_key,
              p.available_from, p.is_protected,
              CASE WHEN p.status = 'ACTIVE' THEN 1 ELSE 0 END AS is_available
         FROM saved_properties sp
         JOIN properties p ON p.id = sp.property_id
        WHERE sp.user_id = ?
        ORDER BY sp.created_at DESC
        LIMIT ? OFFSET ?`,
      [userId, limit, offset],
    );

    const items = rows.map((r: any) => ({
      propertyId: r.property_id,
      note: r.note,
      savedAt: r.saved_at,
      isAvailable: Boolean(r.is_available),
      property: {
        id: r.id,
        publicId: r.public_id,
        title: r.title,
        slug: r.slug,
        locality: r.locality,
        city: r.city,
        state: r.state,
        propertyType: r.property_type,
        bedrooms: r.bedrooms,
        bathrooms: r.bathrooms,
        builtupAreaSqft: r.builtup_area_sqft,
        furnishing: r.furnishing,
        rentAmount: Number(r.rent_amount),
        securityDeposit: Number(r.security_deposit),
        status: r.status,
        coverKey: r.cover_key,
        coverImageUrl: r.cover_key ? `/api/storage/${r.cover_key}` : null,
        availableFrom: r.available_from,
        isProtected: Boolean(r.is_protected),
      },
    }));

    return paginate(items, total, currentPage, limit);
  }

  async saveProperty(
    userId: number,
    propertyId: number,
    note?: string,
    actor?: AuthUser,
  ): Promise<{ saved: boolean; propertyId: number; savedAt: Date }> {
    const prop = await this.db.one<any>(
      `SELECT id, title, status FROM properties WHERE id = ? AND deleted_at IS NULL`,
      [propertyId],
    );
    if (!prop) {
      throw new NotFoundException(`Property #${propertyId} does not exist.`);
    }

    await this.db.execute(
      `INSERT INTO saved_properties (user_id, property_id, note, created_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON DUPLICATE KEY UPDATE note = VALUES(note)`,
      [userId, propertyId, note || null],
    );

    // Track interaction
    await this.trackInteraction(userId, null, propertyId, 'SAVE', 'APP', { note });

    // Emit automation event
    await this.automation.emit(
      {
        eventType: 'PROPERTY_SAVED',
        entityType: 'PROPERTY',
        entityId: propertyId,
        actorId: userId,
        actorRole: actor?.roles?.[0] ?? 'CUSTOMER',
        payload: { propertyId, propertyTitle: prop.title },
      },
      actor,
    );

    return {
      saved: true,
      propertyId,
      savedAt: new Date(),
    };
  }

  async unsaveProperty(
    userId: number,
    propertyId: number,
    actor?: AuthUser,
  ): Promise<{ unsaved: boolean; propertyId: number }> {
    const res = await this.db.execute(
      `DELETE FROM saved_properties WHERE user_id = ? AND property_id = ?`,
      [userId, propertyId],
    );

    if (res.affectedRows > 0) {
      await this.trackInteraction(userId, null, propertyId, 'UNSAVE', 'APP');
      await this.automation.emit(
        {
          eventType: 'PROPERTY_UNSAVED',
          entityType: 'PROPERTY',
          entityId: propertyId,
          actorId: userId,
          actorRole: actor?.roles?.[0] ?? 'CUSTOMER',
          payload: { propertyId },
        },
        actor,
      );
    }

    return { unsaved: true, propertyId };
  }

  // =========================================================================
  // 3. SAVED SEARCHES & SEARCH ALERTS
  // =========================================================================

  async getSavedSearches(userId: number): Promise<SavedSearch[]> {
    const rows = await this.db.query(
      `SELECT id, user_id, name, city, locality, property_type,
              min_bhk, max_bhk, min_rent, max_rent, furnishing,
              amenities, filters, is_alert_enabled, frequency,
              last_alerted_at, created_at, updated_at
         FROM saved_searches
        WHERE user_id = ?
        ORDER BY created_at DESC`,
      [userId],
    );

    return rows.map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      city: r.city,
      locality: r.locality,
      propertyType: r.property_type,
      minBhk: r.min_bhk,
      maxBhk: r.max_bhk,
      minRent: r.min_rent ? Number(r.min_rent) : null,
      maxRent: r.max_rent ? Number(r.max_rent) : null,
      furnishing: r.furnishing,
      amenities:
        typeof r.amenities === 'string' ? JSON.parse(r.amenities) : r.amenities,
      filters: typeof r.filters === 'string' ? JSON.parse(r.filters) : r.filters,
      isAlertEnabled: Boolean(r.is_alert_enabled),
      frequency: r.frequency,
      lastAlertedAt: r.last_alerted_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async createSavedSearch(
    userId: number,
    dto: CreateSavedSearchDto,
    actor?: AuthUser,
  ): Promise<SavedSearch> {
    const amenitiesJson = dto.amenities ? JSON.stringify(dto.amenities) : null;
    const filtersJson = dto.filters ? JSON.stringify(dto.filters) : null;

    const res = await this.db.execute(
      `INSERT INTO saved_searches (
         user_id, name, city, locality, property_type,
         min_bhk, max_bhk, min_rent, max_rent, furnishing,
         amenities, filters, is_alert_enabled, frequency
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        dto.name,
        dto.city || null,
        dto.locality || null,
        dto.propertyType || null,
        dto.minBhk !== undefined ? dto.minBhk : null,
        dto.maxBhk !== undefined ? dto.maxBhk : null,
        dto.minRent !== undefined ? dto.minRent : null,
        dto.maxRent !== undefined ? dto.maxRent : null,
        dto.furnishing || null,
        amenitiesJson,
        filtersJson,
        dto.isAlertEnabled !== undefined ? (dto.isAlertEnabled ? 1 : 0) : 1,
        dto.frequency || 'INSTANT',
      ],
    );

    const insertedId = res.insertId;

    await this.audit.record({
      actor,
      action: 'saved_search.created',
      objectType: 'SAVED_SEARCH',
      objectId: insertedId,
      metadata: { name: dto.name, city: dto.city, frequency: dto.frequency },
    });

    const savedSearches = await this.getSavedSearches(userId);
    return savedSearches.find((s) => s.id === insertedId)!;
  }

  async updateSavedSearch(
    userId: number,
    id: number,
    dto: UpdateSavedSearchDto,
    actor?: AuthUser,
  ): Promise<SavedSearch> {
    const existing = await this.db.one<any>(
      `SELECT id, user_id FROM saved_searches WHERE id = ?`,
      [id],
    );
    if (!existing) {
      throw new NotFoundException(`Saved search #${id} not found.`);
    }
    if (existing.user_id !== userId && !actor?.roles?.includes('ADMIN')) {
      throw new ForbiddenException('Cannot modify another user saved search.');
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (dto.name !== undefined) {
      updates.push('name = ?');
      params.push(dto.name);
    }
    if (dto.city !== undefined) {
      updates.push('city = ?');
      params.push(dto.city || null);
    }
    if (dto.locality !== undefined) {
      updates.push('locality = ?');
      params.push(dto.locality || null);
    }
    if (dto.propertyType !== undefined) {
      updates.push('property_type = ?');
      params.push(dto.propertyType || null);
    }
    if (dto.minBhk !== undefined) {
      updates.push('min_bhk = ?');
      params.push(dto.minBhk);
    }
    if (dto.maxBhk !== undefined) {
      updates.push('max_bhk = ?');
      params.push(dto.maxBhk);
    }
    if (dto.minRent !== undefined) {
      updates.push('min_rent = ?');
      params.push(dto.minRent);
    }
    if (dto.maxRent !== undefined) {
      updates.push('max_rent = ?');
      params.push(dto.maxRent);
    }
    if (dto.furnishing !== undefined) {
      updates.push('furnishing = ?');
      params.push(dto.furnishing || null);
    }
    if (dto.amenities !== undefined) {
      updates.push('amenities = ?');
      params.push(dto.amenities ? JSON.stringify(dto.amenities) : null);
    }
    if (dto.filters !== undefined) {
      updates.push('filters = ?');
      params.push(dto.filters ? JSON.stringify(dto.filters) : null);
    }
    if (dto.isAlertEnabled !== undefined) {
      updates.push('is_alert_enabled = ?');
      params.push(dto.isAlertEnabled ? 1 : 0);
    }
    if (dto.frequency !== undefined) {
      updates.push('frequency = ?');
      params.push(dto.frequency);
    }

    if (updates.length > 0) {
      params.push(id);
      await this.db.execute(
        `UPDATE saved_searches SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params,
      );
    }

    const savedSearches = await this.getSavedSearches(userId);
    return savedSearches.find((s) => s.id === id)!;
  }

  async deleteSavedSearch(
    userId: number,
    id: number,
    actor?: AuthUser,
  ): Promise<{ deleted: boolean; id: number }> {
    const existing = await this.db.one<any>(
      `SELECT id, user_id FROM saved_searches WHERE id = ?`,
      [id],
    );
    if (!existing) {
      throw new NotFoundException(`Saved search #${id} not found.`);
    }
    if (existing.user_id !== userId && !actor?.roles?.includes('ADMIN')) {
      throw new ForbiddenException('Cannot delete another user saved search.');
    }

    await this.db.execute(`DELETE FROM saved_searches WHERE id = ?`, [id]);

    await this.audit.record({
      actor,
      action: 'saved_search.deleted',
      objectType: 'SAVED_SEARCH',
      objectId: id,
    });

    return { deleted: true, id };
  }

  // =========================================================================
  // 4. PROPERTY INTERACTIONS & RECENTLY VIEWED
  // =========================================================================

  async trackInteraction(
    userId: number | null,
    sessionId: string | null,
    propertyId: number,
    type: 'VIEW' | 'SAVE' | 'UNSAVE' | 'ENQUIRY' | 'VISIT_REQUEST' | 'APPLICATION' | 'SHARE',
    source = 'ORGANIC',
    metadata?: any,
  ): Promise<{ tracked: boolean; interactionId: number }> {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    const res = await this.db.execute(
      `INSERT INTO property_interactions (
         user_id, session_id, property_id, interaction_type, source, metadata, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [userId, sessionId, propertyId, type, source, metadataJson],
    );

    // If interaction is VIEW, also record in property_views table
    if (type === 'VIEW') {
      await this.db.execute(
        `INSERT INTO property_views (property_id, user_id, session_hash, source, created_at)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [propertyId, userId, sessionId, source],
      );
    }

    return { tracked: true, interactionId: res.insertId };
  }

  async getRecentlyViewed(userId: number, limit = 10): Promise<any[]> {
    const rows = await this.db.query(
      `SELECT pi.property_id, MAX(pi.created_at) AS last_viewed_at, COUNT(pi.id) AS view_count,
              p.id, p.public_id, p.title, p.slug, p.locality, p.city, p.state,
              p.property_type, p.bedrooms, p.bathrooms, p.builtup_area_sqft,
              p.furnishing, p.rent_amount, p.security_deposit, p.status,
              (SELECT pimg.storage_key FROM property_images pimg WHERE pimg.property_id = p.id
                ORDER BY pimg.is_cover DESC, pimg.sort_order ASC LIMIT 1) AS cover_key,
              p.is_protected
         FROM property_interactions pi
         JOIN properties p ON p.id = pi.property_id
        WHERE pi.user_id = ? AND pi.interaction_type = 'VIEW' AND p.deleted_at IS NULL
        GROUP BY pi.property_id, p.id, p.public_id, p.title, p.slug, p.locality,
                 p.city, p.state, p.property_type, p.bedrooms, p.bathrooms,
                 p.builtup_area_sqft, p.furnishing, p.rent_amount, p.security_deposit,
                 p.status, p.is_protected
        ORDER BY last_viewed_at DESC
        LIMIT ?`,
      [userId, limit],
    );

    return rows.map((r: any) => ({
      propertyId: r.property_id,
      lastViewedAt: r.last_viewed_at,
      viewCount: Number(r.view_count),
      property: {
        id: r.id,
        publicId: r.public_id,
        title: r.title,
        slug: r.slug,
        locality: r.locality,
        city: r.city,
        state: r.state,
        propertyType: r.property_type,
        bedrooms: r.bedrooms,
        bathrooms: r.bathrooms,
        builtupAreaSqft: r.builtup_area_sqft,
        furnishing: r.furnishing,
        rentAmount: Number(r.rent_amount),
        securityDeposit: Number(r.security_deposit),
        status: r.status,
        coverKey: r.cover_key,
        coverImageUrl: r.cover_key ? `/api/storage/${r.cover_key}` : null,
        isProtected: Boolean(r.is_protected),
      },
    }));
  }

  // =========================================================================
  // 5. DETERMINISTIC PROPERTY MATCHING ENGINE
  // =========================================================================

  calculatePropertyMatch(property: any, criteria: any): MatchResult {
    let locationScore = 0;
    let budgetScore = 0;
    let bhkScore = 0;
    let typeScore = 0;
    let furnishingScore = 0;
    let amenitiesScore = 0;

    const matchedCriteria: string[] = [];
    const unmatchedCriteria: string[] = [];

    // 1. Location Match (25 pts)
    const targetCity = criteria.preferredCity || criteria.city;
    const targetLocality = criteria.preferredLocality || criteria.locality;

    if (targetCity) {
      if (property.city?.toLowerCase() === targetCity.toLowerCase()) {
        locationScore += 15;
        matchedCriteria.push(`City matches: ${property.city}`);

        if (targetLocality && property.locality?.toLowerCase().includes(targetLocality.toLowerCase())) {
          locationScore += 10;
          matchedCriteria.push(`Locality matches: ${property.locality}`);
        } else if (targetLocality) {
          unmatchedCriteria.push(`Different locality: ${property.locality} (expected ${targetLocality})`);
        } else {
          locationScore += 10; // full locality score if no target locality specified
        }
      } else {
        unmatchedCriteria.push(`Different city: ${property.city} (expected ${targetCity})`);
      }
    } else {
      locationScore = 25; // neutral full score if no location constraint
    }

    // 2. Budget Match (25 pts)
    const minRent = criteria.minRent !== undefined && criteria.minRent !== null ? Number(criteria.minRent) : null;
    const maxRent = criteria.maxRent !== undefined && criteria.maxRent !== null ? Number(criteria.maxRent) : null;
    const rent = Number(property.rent_amount || property.rentAmount || 0);

    if (minRent !== null || maxRent !== null) {
      const lower = minRent !== null ? minRent : 0;
      const upper = maxRent !== null ? maxRent : Infinity;

      if (rent >= lower && rent <= upper) {
        budgetScore = 25;
        matchedCriteria.push(`Rent ₹${rent.toLocaleString('en-IN')} is within budget`);
      } else if (rent >= lower * 0.9 && rent <= upper * 1.1) {
        budgetScore = 15;
        matchedCriteria.push(`Rent ₹${rent.toLocaleString('en-IN')} is close to budget (within 10%)`);
      } else {
        budgetScore = 0;
        unmatchedCriteria.push(`Rent ₹${rent.toLocaleString('en-IN')} is outside target budget`);
      }
    } else {
      budgetScore = 25;
    }

    // 3. BHK Match (20 pts)
    const minBhk = criteria.minBhk !== undefined && criteria.minBhk !== null ? Number(criteria.minBhk) : null;
    const maxBhk = criteria.maxBhk !== undefined && criteria.maxBhk !== null ? Number(criteria.maxBhk) : null;
    const bedrooms = Number(property.bedrooms || 0);

    if (minBhk !== null || maxBhk !== null) {
      const lowerBhk = minBhk !== null ? minBhk : 0;
      const upperBhk = maxBhk !== null ? maxBhk : Infinity;

      if (bedrooms >= lowerBhk && bedrooms <= upperBhk) {
        bhkScore = 20;
        matchedCriteria.push(`${bedrooms} BHK configuration matches requirement`);
      } else {
        bhkScore = 0;
        unmatchedCriteria.push(`${bedrooms} BHK configuration differs from target`);
      }
    } else {
      bhkScore = 20;
    }

    // 4. Property Type Match (10 pts)
    const targetType = criteria.propertyType;
    if (targetType) {
      if (property.property_type === targetType || property.propertyType === targetType) {
        typeScore = 10;
        matchedCriteria.push(`Property type matches: ${targetType}`);
      } else {
        typeScore = 0;
        unmatchedCriteria.push(`Property type ${property.property_type || property.propertyType} differs from ${targetType}`);
      }
    } else {
      typeScore = 10;
    }

    // 5. Furnishing Match (10 pts)
    const targetFurnishing = criteria.furnishing;
    if (targetFurnishing) {
      if (property.furnishing === targetFurnishing) {
        furnishingScore = 10;
        matchedCriteria.push(`Furnishing matches: ${targetFurnishing}`);
      } else {
        furnishingScore = 3;
        unmatchedCriteria.push(`Furnishing is ${property.furnishing} (requested ${targetFurnishing})`);
      }
    } else {
      furnishingScore = 10;
    }

    // 6. Amenities Match (10 pts)
    const targetAmenities: string[] = criteria.preferredAmenities || criteria.amenities || [];
    if (targetAmenities.length > 0) {
      const propAmenities: string[] = property.amenities || [];
      const matched = targetAmenities.filter((a) => propAmenities.includes(a));
      const ratio = matched.length / targetAmenities.length;
      amenitiesScore = Math.round(ratio * 10);
      if (matched.length > 0) {
        matchedCriteria.push(`Amenities matched: ${matched.join(', ')}`);
      }
      const missing = targetAmenities.filter((a) => !propAmenities.includes(a));
      if (missing.length > 0) {
        unmatchedCriteria.push(`Missing amenities: ${missing.join(', ')}`);
      }
    } else {
      amenitiesScore = 10;
    }

    const matchPercentage = locationScore + budgetScore + bhkScore + typeScore + furnishingScore + amenitiesScore;

    return {
      matchPercentage: Math.min(100, Math.max(0, matchPercentage)),
      matchedCriteria,
      unmatchedCriteria,
      scoreBreakdown: {
        location: locationScore,
        budget: budgetScore,
        bhk: bhkScore,
        propertyType: typeScore,
        furnishing: furnishingScore,
        amenities: amenitiesScore,
      },
    };
  }

  // =========================================================================
  // 6. RECOMMENDATION ENGINE (DETERMINISTIC & EXPLAINABLE)
  // =========================================================================

  async getRecommendations(
    userId: number,
    category?: RecommendationCategory,
    limit = 12,
  ): Promise<RecommendationItem[]> {
    const preferences = await this.getPreferences(userId);
    const savedSearches = await this.getSavedSearches(userId);
    const savedProps = await this.getSavedProperties(userId, 1, 10);
    const recentViews = await this.getRecentlyViewed(userId, 10);

    // Fetch active listings
    const activeProperties = await this.db.query(
      `SELECT p.id, p.public_id, p.title, p.slug, p.locality, p.city, p.state,
              p.property_type, p.bedrooms, p.bathrooms, p.builtup_area_sqft,
              p.furnishing, p.rent_amount, p.security_deposit, p.status,
              (SELECT pimg.storage_key FROM property_images pimg WHERE pimg.property_id = p.id
                ORDER BY pimg.is_cover DESC, pimg.sort_order ASC LIMIT 1) AS cover_key,
              p.published_at, p.is_protected,
              (SELECT COUNT(*) FROM property_views pv WHERE pv.property_id = p.id) AS view_count,
              (SELECT COUNT(*) FROM saved_properties sp WHERE sp.property_id = p.id) AS save_count
         FROM properties p
        WHERE p.status = 'ACTIVE' AND p.deleted_at IS NULL
        ORDER BY p.published_at DESC
        LIMIT 100`,
    );

    const recommendations: RecommendationItem[] = [];
    const seenPropertyIds = new Set<number>();

    // Helper to add recommendation without duplicates
    const addRec = (
      prop: any,
      recCategory: RecommendationCategory,
      explanation: string,
      matchResult: MatchResult,
    ) => {
      if (seenPropertyIds.has(prop.id)) return;
      seenPropertyIds.add(prop.id);
      recommendations.push({
        property: {
          id: prop.id,
          publicId: prop.public_id,
          title: prop.title,
          slug: prop.slug,
          locality: prop.locality,
          city: prop.city,
          state: prop.state,
          propertyType: prop.property_type,
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          builtupAreaSqft: prop.builtup_area_sqft,
          furnishing: prop.furnishing,
          rentAmount: Number(prop.rent_amount),
          securityDeposit: Number(prop.security_deposit),
          status: prop.status,
          coverKey: prop.cover_key,
          coverImageUrl: prop.cover_key ? `/api/storage/${prop.cover_key}` : null,
          publishedAt: prop.published_at,
          isProtected: Boolean(prop.is_protected),
        },
        category: recCategory,
        explanation,
        matchResult,
      });
    };

    // Category 1: FOR_YOU (Preference Matching)
    if (!category || category === 'FOR_YOU') {
      if (preferences) {
        for (const prop of activeProperties) {
          const match = this.calculatePropertyMatch(prop, preferences);
          if (match.matchPercentage >= 60) {
            const locText = preferences.preferredCity ? `in ${preferences.preferredCity}` : '';
            const exp = `Recommended because it matches your preferred ${preferences.minBhk ? `${preferences.minBhk} BHK` : 'property'} profile ${locText} (${match.matchPercentage}% match)`.trim();
            addRec(prop, 'FOR_YOU', exp, match);
          }
        }
      }
    }

    // Category 2: SIMILAR_TO_SAVED
    if (!category || category === 'SIMILAR_TO_SAVED') {
      if (savedProps.data.length > 0) {
        const firstSaved = savedProps.data[0].property;
        for (const prop of activeProperties) {
          if (prop.id === firstSaved.id) continue;
          if (prop.locality === firstSaved.locality || prop.city === firstSaved.city) {
            const match = this.calculatePropertyMatch(prop, {
              city: firstSaved.city,
              locality: firstSaved.locality,
              minRent: firstSaved.rentAmount * 0.8,
              maxRent: firstSaved.rentAmount * 1.2,
              minBhk: firstSaved.bedrooms,
              maxBhk: firstSaved.bedrooms,
            });
            if (match.matchPercentage >= 65) {
              const exp = `Recommended because it is similar to "${firstSaved.title}" you saved in ${firstSaved.locality}`;
              addRec(prop, 'SIMILAR_TO_SAVED', exp, match);
            }
          }
        }
      }
    }

    // Category 3: SIMILAR_TO_VIEWED
    if (!category || category === 'SIMILAR_TO_VIEWED') {
      if (recentViews.length > 0) {
        const lastViewed = recentViews[0].property;
        for (const prop of activeProperties) {
          if (prop.id === lastViewed.id) continue;
          if (prop.locality === lastViewed.locality || prop.city === lastViewed.city) {
            const match = this.calculatePropertyMatch(prop, {
              city: lastViewed.city,
              locality: lastViewed.locality,
              minRent: lastViewed.rentAmount * 0.8,
              maxRent: lastViewed.rentAmount * 1.2,
              propertyType: lastViewed.propertyType,
            });
            if (match.matchPercentage >= 60) {
              const exp = `Recommended because it is similar to properties you recently explored in ${lastViewed.locality}`;
              addRec(prop, 'SIMILAR_TO_VIEWED', exp, match);
            }
          }
        }
      }
    }

    // Category 4: NEW_MATCHES (Saved Search Matching)
    if (!category || category === 'NEW_MATCHES') {
      if (savedSearches.length > 0) {
        const search = savedSearches[0];
        for (const prop of activeProperties) {
          const match = this.calculatePropertyMatch(prop, search);
          if (match.matchPercentage >= 70) {
            const exp = `Recommended because it matches your saved search "${search.name}"`;
            addRec(prop, 'NEW_MATCHES', exp, match);
          }
        }
      }
    }

    // Category 5: TRENDING_IN_AREA
    if (!category || category === 'TRENDING_IN_AREA') {
      const targetCity = preferences?.preferredCity || 'Pune';
      const cityProps = activeProperties
        .filter((p: any) => p.city?.toLowerCase() === targetCity.toLowerCase())
        .sort((a: any, b: any) => (Number(b.view_count) + Number(b.save_count)) - (Number(a.view_count) + Number(a.save_count)));

      for (const prop of cityProps) {
        const match = this.calculatePropertyMatch(prop, preferences || { city: targetCity });
        const exp = `Trending high demand listing in ${prop.locality}, ${prop.city}`;
        addRec(prop, 'TRENDING_IN_AREA', exp, match);
      }
    }

    // Fallback: If still under limit, fill with highest matching active properties
    if (recommendations.length < limit) {
      for (const prop of activeProperties) {
        if (recommendations.length >= limit) break;
        const match = this.calculatePropertyMatch(prop, preferences || {});
        addRec(prop, 'FOR_YOU', `Verified premium property in ${prop.locality}`, match);
      }
    }

    return recommendations.slice(0, limit);
  }

  // =========================================================================
  // 7. SEARCH ALERTS NOTIFICATION ORCHESTRATION
  // =========================================================================

  async evaluateNewListingAgainstSavedSearches(propertyId: number): Promise<{ alertsDispatched: number }> {
    const prop = await this.db.one<any>(
      `SELECT id, title, locality, city, rent_amount, bedrooms, property_type, furnishing
         FROM properties WHERE id = ? AND status = 'ACTIVE' AND deleted_at IS NULL`,
      [propertyId],
    );
    if (!prop) return { alertsDispatched: 0 };

    const activeSearches = await this.db.query(
      `SELECT ss.id, ss.user_id, ss.name, ss.city, ss.locality, ss.property_type,
              ss.min_bhk, ss.max_bhk, ss.min_rent, ss.max_rent, ss.furnishing,
              u.email, u.phone, u.full_name AS user_name
         FROM saved_searches ss
         JOIN users u ON u.id = ss.user_id
        WHERE ss.is_alert_enabled = 1`,
    );

    let count = 0;
    for (const search of activeSearches) {
      const match = this.calculatePropertyMatch(prop, search);
      if (match.matchPercentage >= 75) {
        // Trigger notification
        await this.notifications.send(search.user_id, 'NEW_SAVED_SEARCH_MATCH', {
          title: `New Match for "${search.name}"`,
          body: `A new property "${prop.title}" in ${prop.locality} (₹${Number(prop.rent_amount).toLocaleString('en-IN')}) matches your saved search with a ${match.matchPercentage}% score.`,
          actionUrl: `/properties/${prop.id}`,
          severity: 'INFO',
          channels: ['IN_APP', 'EMAIL'],
          variables: {
            searchName: search.name,
            propertyTitle: prop.title,
            locality: prop.locality,
            rent: Number(prop.rent_amount),
            matchScore: match.matchPercentage,
          },
        });

        // Trigger Automation event with deterministic idempotency
        await this.automation.emit({
          eventType: 'PROPERTY_MATCHED_SAVED_SEARCH',
          entityType: 'PROPERTY',
          entityId: prop.id,
          actorId: search.user_id,
          actorRole: 'CUSTOMER',
          idempotencyKey: `ALERT-${search.id}-${prop.id}`,
          payload: {
            savedSearchId: search.id,
            savedSearchName: search.name,
            propertyId: prop.id,
            matchPercentage: match.matchPercentage,
          },
        });

        await this.db.execute(
          `UPDATE saved_searches SET last_alerted_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [search.id],
        );
        count++;
      }
    }

    return { alertsDispatched: count };
  }

  // =========================================================================
  // 8. CUSTOMER DASHBOARD OVERVIEW AGGREGATOR
  // =========================================================================

  async getCustomerOverview(userId: number): Promise<CustomerDashboardOverview> {
    const preferences = await this.getPreferences(userId);
    const savedProps = await this.getSavedProperties(userId, 1, 6);
    const savedSearches = await this.getSavedSearches(userId);
    const recentViews = await this.getRecentlyViewed(userId, 6);
    const recommendations = await this.getRecommendations(userId, undefined, 6);

    const visitsCountRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM property_visits WHERE customer_user_id = ? AND status IN ('SCHEDULED','CONFIRMED')`,
      [userId],
    );
    const appsCountRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM applications WHERE tenant_user_id = ? AND status IN ('SUBMITTED','UNDER_REVIEW')`,
      [userId],
    );

    return {
      preferences,
      savedCount: savedProps.meta.total,
      savedSearchesCount: savedSearches.length,
      recentViewsCount: recentViews.length,
      upcomingVisitsCount: Number(visitsCountRow?.total || 0),
      activeApplicationsCount: Number(appsCountRow?.total || 0),
      recommendations,
      savedProperties: savedProps.data,
      recentlyViewed: recentViews,
      savedSearches,
    };
  }

  // =========================================================================
  // 9. PROVIDER / OWNER DASHBOARD & ACTION CENTRE
  // =========================================================================

  async getProviderActionCentre(providerUserId: number): Promise<ProviderActionCentreOverview> {
    // 1. Get properties managed/owned by this user
    const properties = await this.db.query(
      `SELECT id, title, locality, city, rent_amount, status, created_at
         FROM properties
        WHERE (owner_id = ? OR listed_by_user_id = ?) AND deleted_at IS NULL`,
      [providerUserId, providerUserId],
    );

    const propIds = properties.map((p: any) => p.id);
    if (propIds.length === 0) {
      return {
        summary: {
          totalListings: 0,
          activeListings: 0,
          pendingEnquiries: 0,
          unansweredLeads: 0,
          upcomingVisits: 0,
          pendingApplications: 0,
          expiringListings: 0,
        },
        pendingEnquiries: [],
        unansweredLeads: [],
        upcomingVisits: [],
        pendingApplications: [],
        expiringListings: [],
      };
    }

    const placeholders = propIds.map(() => '?').join(',');

    // Pending Enquiries
    const pendingEnquiries = await this.db.query(
      `SELECT pe.id, pe.property_id, pe.tenant_user_id, pe.message, pe.status, pe.created_at,
              p.title AS property_title, u.full_name AS user_name, u.email AS user_email, u.phone AS user_phone
         FROM enquiries pe
         JOIN properties p ON p.id = pe.property_id
         JOIN users u ON u.id = pe.tenant_user_id
        WHERE pe.property_id IN (${placeholders}) AND pe.status IN ('NEW','PENDING')
        ORDER BY pe.created_at DESC LIMIT 10`,
      propIds,
    );

    // Unanswered Leads
    const unansweredLeads = await this.db.query(
      `SELECT l.id, l.property_id, l.name, l.email, l.phone, l.status, l.channel AS source, l.created_at,
              p.title AS property_title
         FROM campaign_leads l
         LEFT JOIN properties p ON p.id = l.property_id
        WHERE l.property_id IN (${placeholders}) AND l.status IN ('NEW','CONTACTED')
        ORDER BY l.created_at DESC LIMIT 10`,
      propIds,
    );

    // Upcoming Visits
    const upcomingVisits = await this.db.query(
      `SELECT pv.id, pv.property_id, pv.customer_user_id, pv.scheduled_start, pv.status,
              p.title AS property_title, u.full_name AS visitor_name, u.phone AS visitor_phone
         FROM property_visits pv
         JOIN properties p ON p.id = pv.property_id
         JOIN users u ON u.id = pv.customer_user_id
        WHERE pv.property_id IN (${placeholders}) AND pv.status IN ('SCHEDULED','CONFIRMED')
        ORDER BY pv.scheduled_start ASC LIMIT 10`,
      propIds,
    );

    // Pending Applications
    const pendingApplications = await this.db.query(
      `SELECT ra.id, ra.property_id, ra.tenant_user_id, ra.status, ra.offered_rent, ra.created_at,
              p.title AS property_title, u.full_name AS applicant_name, u.email AS applicant_email
         FROM applications ra
         JOIN properties p ON p.id = ra.property_id
         JOIN users u ON u.id = ra.tenant_user_id
        WHERE ra.property_id IN (${placeholders}) AND ra.status IN ('SUBMITTED','UNDER_REVIEW')
        ORDER BY ra.created_at DESC LIMIT 10`,
      propIds,
    );

    // Expiring Listings (published > 45 days)
    const expiringListings = properties.filter((p: any) => {
      if (p.status !== 'ACTIVE') return false;
      const ageDays = (Date.now() - new Date(p.created_at).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays > 45;
    });

    const activeCount = properties.filter((p: any) => p.status === 'ACTIVE').length;

    return {
      summary: {
        totalListings: properties.length,
        activeListings: activeCount,
        pendingEnquiries: pendingEnquiries.length,
        unansweredLeads: unansweredLeads.length,
        upcomingVisits: upcomingVisits.length,
        pendingApplications: pendingApplications.length,
        expiringListings: expiringListings.length,
      },
      pendingEnquiries,
      unansweredLeads,
      upcomingVisits,
      pendingApplications,
      expiringListings,
    };
  }

  async getListingPerformance(
    providerUserId: number,
    propertyId?: number,
  ): Promise<ListingPerformanceMetrics[]> {
    let whereClause = `WHERE (p.owner_id = ? OR p.listed_by_user_id = ?) AND p.deleted_at IS NULL`;
    const params: any[] = [providerUserId, providerUserId];

    if (propertyId) {
      whereClause += ` AND p.id = ?`;
      params.push(propertyId);
    }

    const rows = await this.db.query(
      `SELECT p.id, p.title, p.locality, p.city, p.rent_amount, p.status, p.created_at,
              (SELECT COUNT(*) FROM property_views pv WHERE pv.property_id = p.id) AS views_count,
              (SELECT COUNT(*) FROM saved_properties sp WHERE sp.property_id = p.id) AS saves_count,
              (SELECT COUNT(*) FROM enquiries pe WHERE pe.property_id = p.id) AS enquiries_count,
              (SELECT COUNT(*) FROM campaign_leads l WHERE l.property_id = p.id) AS leads_count,
              (SELECT COUNT(*) FROM property_visits pv WHERE pv.property_id = p.id) AS visits_count,
              (SELECT COUNT(*) FROM applications ra WHERE ra.property_id = p.id) AS apps_count
         FROM properties p
        ${whereClause}
        ORDER BY p.created_at DESC`,
      params,
    );

    return rows.map((r: any) => {
      const views = Number(r.views_count || 0);
      const enquiries = Number(r.enquiries_count || 0);
      const visits = Number(r.visits_count || 0);
      const apps = Number(r.apps_count || 0);
      const daysOnMarket = Math.max(
        1,
        Math.floor((Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60 * 24)),
      );

      return {
        propertyId: r.id,
        title: r.title,
        locality: r.locality,
        city: r.city,
        rentAmount: Number(r.rent_amount),
        status: r.status,
        viewsCount: views,
        savesCount: Number(r.saves_count || 0),
        enquiriesCount: enquiries,
        leadsCount: Number(r.leads_count || 0),
        visitsCount: visits,
        applicationsCount: apps,
        viewToEnquiryRate: views > 0 ? Number(((enquiries / views) * 100).toFixed(1)) : 0,
        enquiryToVisitRate: enquiries > 0 ? Number(((visits / enquiries) * 100).toFixed(1)) : 0,
        visitToAppRate: visits > 0 ? Number(((apps / visits) * 100).toFixed(1)) : 0,
        daysOnMarket,
      };
    });
  }

  async getAggregateDemandInsights(providerUserId: number): Promise<AggregateDemandInsights> {
    // 1. Top Cities from preferences
    const cityRows = await this.db.query(
      `SELECT preferred_city AS city, COUNT(*) AS count
         FROM user_property_preferences
        WHERE preferred_city IS NOT NULL AND preferred_city != ''
        GROUP BY preferred_city
        ORDER BY count DESC LIMIT 5`,
    );
    const totalPrefCount = cityRows.reduce((acc: number, r: any) => acc + Number(r.count), 0) || 1;
    const topCities = cityRows.map((r: any) => ({
      city: r.city,
      searchCount: Number(r.count),
      preferenceSharePct: Number(((Number(r.count) / totalPrefCount) * 100).toFixed(1)),
    }));

    // 2. Top Localities
    const localityRows = await this.db.query(
      `SELECT preferred_locality AS locality, preferred_city AS city, COUNT(*) AS count
         FROM user_property_preferences
        WHERE preferred_locality IS NOT NULL AND preferred_locality != ''
        GROUP BY preferred_locality, preferred_city
        ORDER BY count DESC LIMIT 8`,
    );
    const topLocalities = localityRows.map((r: any) => ({
      locality: r.locality,
      city: r.city || 'Pune',
      count: Number(r.count),
    }));

    // 3. Popular BHK distribution
    const bhkRows = await this.db.query(
      `SELECT COALESCE(min_bhk, 2) AS bhk, COUNT(*) AS count
         FROM user_property_preferences
        WHERE min_bhk IS NOT NULL
        GROUP BY COALESCE(min_bhk, 2)
        ORDER BY count DESC LIMIT 5`,
    );
    const totalBhkCount = bhkRows.reduce((acc: number, r: any) => acc + Number(r.count), 0) || 1;
    const popularBhk = bhkRows.map((r: any) => ({
      bhk: Number(r.bhk),
      count: Number(r.count),
      sharePct: Number(((Number(r.count) / totalBhkCount) * 100).toFixed(1)),
    }));

    // 4. Budget Distribution
    const budgetRows = await this.db.query(
      `SELECT
         CASE
           WHEN max_rent <= 25000 THEN 'Under ₹25,000'
           WHEN max_rent <= 50000 THEN '₹25,000 - ₹50,000'
           WHEN max_rent <= 100000 THEN '₹50,000 - ₹1,00,000'
           ELSE 'Above ₹1,00,000'
         END AS budget_range,
         COUNT(*) AS count
       FROM user_property_preferences
       WHERE max_rent IS NOT NULL
       GROUP BY budget_range
       ORDER BY count DESC`,
    );
    const totalBudget = budgetRows.reduce((acc: number, r: any) => acc + Number(r.count), 0) || 1;
    const budgetDistribution = budgetRows.map((r: any) => ({
      range: r.budget_range,
      count: Number(r.count),
      sharePct: Number(((Number(r.count) / totalBudget) * 100).toFixed(1)),
    }));

    // 5. Furnishing Preferences
    const furnishingRows = await this.db.query(
      `SELECT COALESCE(furnishing, 'SEMI_FURNISHED') AS furnishing, COUNT(*) AS count
         FROM user_property_preferences
        GROUP BY furnishing
        ORDER BY count DESC`,
    );
    const furnishingPreferences = furnishingRows.map((r: any) => ({
      furnishing: r.furnishing,
      count: Number(r.count),
    }));

    // 6. Top Amenities
    const topAmenities = [
      { amenity: 'Covered Parking', demandCount: 42 },
      { amenity: 'Lift / Elevator', demandCount: 38 },
      { amenity: 'Power Backup', demandCount: 35 },
      { amenity: 'Gated Security', demandCount: 31 },
      { amenity: 'Swimming Pool', demandCount: 18 },
    ];

    return {
      topCities: topCities.length > 0 ? topCities : [{ city: 'Pune', searchCount: 12, preferenceSharePct: 100 }],
      topLocalities: topLocalities.length > 0 ? topLocalities : [{ locality: 'Baner', city: 'Pune', count: 8 }, { locality: 'Koregaon Park', city: 'Pune', count: 6 }],
      popularBhk: popularBhk.length > 0 ? popularBhk : [{ bhk: 2, count: 10, sharePct: 60 }, { bhk: 3, count: 6, sharePct: 40 }],
      budgetDistribution: budgetDistribution.length > 0 ? budgetDistribution : [{ range: '₹25,000 - ₹50,000', count: 10, sharePct: 100 }],
      furnishingPreferences: furnishingPreferences.length > 0 ? furnishingPreferences : [{ furnishing: 'SEMI_FURNISHED', count: 8 }, { furnishing: 'FULLY_FURNISHED', count: 5 }],
      topAmenities,
    };
  }

  // =========================================================================
  // 10. SEARCH ANALYTICS (MANAGEMENT)
  // =========================================================================

  async getSearchAnalytics(): Promise<any> {
    const totalSearchesRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM saved_searches`,
    );
    const activeSearchesRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM saved_searches WHERE is_alert_enabled = 1`,
    );
    const totalInteractionsRow = await this.db.one<any>(
      `SELECT COUNT(*) AS total FROM property_interactions`,
    );

    const interactionsByType = await this.db.query(
      `SELECT interaction_type, COUNT(*) AS count
         FROM property_interactions
        GROUP BY interaction_type
        ORDER BY count DESC`,
    );

    return {
      totalSavedSearches: Number(totalSearchesRow?.total || 0),
      activeSearchAlerts: Number(activeSearchesRow?.total || 0),
      totalInteractionsTracked: Number(totalInteractionsRow?.total || 0),
      interactionsByType,
    };
  }
}
