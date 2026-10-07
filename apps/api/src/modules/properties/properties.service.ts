import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId, propertySlug } from '../../common/util/ids';
import { pageParams, paginate, Paginated } from '../../common/util/pagination';
import { CreatePropertyDto, PropertySearchDto, UpdatePropertyDto } from './properties.dto';
import { NotificationsService } from '../notifications/notifications.service';

const PUBLIC_STATUSES = ['ACTIVE', 'RENTED', 'SOLD'];

@Injectable()
export class PropertiesService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // -------------------------------------------------------------- search (public)
  async search(dto: PropertySearchDto): Promise<Paginated<any>> {
    const { page, perPage, offset } = pageParams(dto.page, dto.perPage, 48);
    const where: string[] = ['p.status = ?', 'p.deleted_at IS NULL'];
    const params: unknown[] = ['ACTIVE'];

    const eq = (sql: string, value: unknown) => {
      if (value !== undefined && value !== null && value !== '') {
        where.push(sql);
        params.push(value);
      }
    };

    eq('p.listing_type = ?', dto.listingType);
    eq('p.city = ?', dto.city);
    eq('p.locality = ?', dto.locality);
    eq('p.pincode = ?', dto.pincode);
    eq('p.property_type = ?', dto.propertyType);
    eq('p.furnishing = ?', dto.furnishing);
    eq('p.bedrooms >= ?', dto.minBedrooms);
    eq('p.bedrooms <= ?', dto.maxBedrooms);
    eq('p.bathrooms >= ?', dto.minBathrooms);
    eq('p.rent_amount >= ?', dto.minRent);
    eq('p.rent_amount <= ?', dto.maxRent);
    eq('p.sale_price >= ?', dto.minPrice);
    eq('p.sale_price <= ?', dto.maxPrice);
    eq('p.listed_by_role = ?', dto.listedBy);
    if (dto.protectedOnly) where.push('p.is_protected = 1');
    if (dto.petsAllowed) where.push('p.pets_allowed = 1');
    if (dto.parking) where.push('(p.parking_covered + p.parking_open) > 0');
    if (dto.availableNow) where.push('(p.available_from IS NULL OR p.available_from <= CURDATE())');
    if (dto.verifiedOnly) {
      where.push(`EXISTS (SELECT 1 FROM property_verifications pv
                   WHERE pv.property_id = p.id AND pv.status = 'VERIFIED'
                     AND pv.check_type IN ('OWNERSHIP_DOCUMENT','OWNER_IDENTITY'))`);
    }
    if (dto.q) {
      where.push('MATCH (p.title, p.description, p.locality, p.city) AGAINST (? IN NATURAL LANGUAGE MODE)');
      params.push(dto.q);
    }
    if (dto.amenities?.length) {
      where.push(`(SELECT COUNT(*) FROM property_amenities pa
                    JOIN amenities a ON a.id = pa.amenity_id
                   WHERE pa.property_id = p.id AND a.code IN (${dto.amenities.map(() => '?').join(',')})) = ?`);
      params.push(...dto.amenities, dto.amenities.length);
    }
    // bounding box for map view
    if (dto.swLat && dto.neLat && dto.swLng && dto.neLng) {
      where.push('p.latitude BETWEEN ? AND ? AND p.longitude BETWEEN ? AND ?');
      params.push(dto.swLat, dto.neLat, dto.swLng, dto.neLng);
    }

    const sort =
      {
        NEWEST: 'p.published_at DESC',
        PRICE_ASC: 'COALESCE(p.rent_amount, p.sale_price) ASC',
        PRICE_DESC: 'COALESCE(p.rent_amount, p.sale_price) DESC',
        AREA_DESC: 'p.builtup_area_sqft DESC',
      }[dto.sort ?? 'NEWEST'] ?? 'p.published_at DESC';

    const clause = where.join(' AND ');
    const rows = await this.db.query(
      `SELECT p.id, p.public_id, p.slug, p.title, p.listing_type, p.property_type, p.bedrooms,
              p.bathrooms, p.builtup_area_sqft, p.carpet_area_sqft, p.furnishing, p.rent_amount,
              p.sale_price, p.security_deposit, p.maintenance_amount, p.locality, p.city, p.state,
              p.latitude, p.longitude, p.available_from, p.is_protected, p.is_featured, p.visibility_tier, p.promoted_until,
              p.listed_by_role, p.view_count, p.published_at,
              (SELECT pi.storage_key FROM property_images pi WHERE pi.property_id = p.id
                ORDER BY pi.is_cover DESC, pi.sort_order ASC LIMIT 1) AS cover_key,
              (SELECT GROUP_CONCAT(pv.check_type) FROM property_verifications pv
                WHERE pv.property_id = p.id AND pv.status = 'VERIFIED') AS verified_checks
         FROM properties p
        WHERE ${clause}
        ORDER BY FIELD(p.visibility_tier, 'PREMIUM', 'FEATURED', 'PROMOTED', 'STANDARD'), p.is_featured DESC, ${sort}
        LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM properties p WHERE ${clause}`,
      params,
    );

    return paginate(rows.map(this.mapCard), countRow?.total ?? 0, page, perPage);
  }

  /** Live listings only — a draft or a rejected listing must never reach the index. */
  async sitemapEntries() {
    const data = await this.db.query(
      `SELECT slug, updated_at FROM properties
        WHERE status = 'ACTIVE' AND deleted_at IS NULL
        ORDER BY updated_at DESC LIMIT 5000`,
    );
    return { data };
  }

  async facets(city?: string) {
    const params = city ? [city] : [];
    const cityClause = city ? 'AND city = ?' : '';
    const [localities, types, priceBand] = await Promise.all([
      this.db.query(
        `SELECT locality, COUNT(*) AS count FROM properties
          WHERE status = 'ACTIVE' ${cityClause} GROUP BY locality ORDER BY count DESC LIMIT 24`,
        params,
      ),
      this.db.query(
        `SELECT property_type, COUNT(*) AS count FROM properties
          WHERE status = 'ACTIVE' ${cityClause} GROUP BY property_type ORDER BY count DESC`,
        params,
      ),
      this.db.one(
        `SELECT MIN(rent_amount) AS min_rent, MAX(rent_amount) AS max_rent
           FROM properties WHERE status = 'ACTIVE' AND listing_type = 'RENT' ${cityClause}`,
        params,
      ),
    ]);
    return { localities, types, priceBand };
  }

  // ---------------------------------------------------------------- detail
  async findBySlugOrPublicId(identifier: string, viewer?: AuthUser) {
    const property = await this.db.one<any>(
      `SELECT p.*, u.full_name AS lister_name, u.public_id AS lister_public_id,
              ag.agency_name, ag.verification_status AS agent_verification,
              b.company_name, bp.name AS project_name
         FROM properties p
         JOIN users u ON u.id = p.listed_by_user_id
         LEFT JOIN agents ag ON ag.id = p.agent_id
         LEFT JOIN builders b ON b.id = p.builder_id
         LEFT JOIN builder_projects bp ON bp.id = p.project_id
        WHERE (p.slug = ? OR p.public_id = ?) AND p.deleted_at IS NULL
        LIMIT 1`,
      [identifier, identifier],
    );
    if (!property) throw new NotFoundException('That listing is no longer available.');

    const isOwnerOrStaff =
      viewer &&
      (viewer.id === property.listed_by_user_id || viewer.permissions.includes('property.read.private'));
    if (!PUBLIC_STATUSES.includes(property.status) && !isOwnerOrStaff) {
      throw new NotFoundException('That listing is no longer available.');
    }

    const [images, videos, amenities, verifications, timeline] = await Promise.all([
      this.db.query('SELECT id, storage_key, caption, room_tag, is_cover FROM property_images WHERE property_id = ? ORDER BY is_cover DESC, sort_order', [property.id]),
      this.db.query('SELECT id, storage_key, external_url, kind FROM property_videos WHERE property_id = ?', [property.id]),
      this.db.query('SELECT a.code, a.name, a.category, a.icon FROM property_amenities pa JOIN amenities a ON a.id = pa.amenity_id WHERE pa.property_id = ?', [property.id]),
      this.db.query("SELECT check_type, status, verified_at FROM property_verifications WHERE property_id = ?", [property.id]),
      this.db.query('SELECT event_code, title, detail, occurred_at FROM property_timeline WHERE property_id = ? ORDER BY occurred_at DESC LIMIT 20', [property.id]),
    ]);

    return {
      ...this.mapDetail(property, isOwnerOrStaff),
      images,
      videos,
      amenities,
      verifications,
      timeline,
    };
  }

  async recordView(propertyId: number, userId?: number, sessionHash?: string, source?: string) {
    await this.db.insert('property_views', {
      property_id: propertyId,
      user_id: userId ?? null,
      session_hash: sessionHash ?? null,
      source: source ?? null,
    });
    await this.db.execute('UPDATE properties SET view_count = view_count + 1 WHERE id = ?', [propertyId]);
  }

  // --------------------------------------------------------- create / wizard
  async create(user: AuthUser, dto: CreatePropertyDto, req?: Request) {
    const listerRole = this.resolveListerRole(user);
    const partyIds = await this.partyIds(user.id);

    const publicId = newPublicId();
    const slug = propertySlug({
      city: dto.city ?? '',
      locality: dto.locality ?? '',
      bedrooms: dto.bedrooms,
      propertyType: dto.propertyType,
      publicId,
    });

    const id = await this.db.insert('properties', {
      public_id: publicId,
      slug,
      listed_by_user_id: user.id,
      listed_by_role: listerRole,
      owner_id: listerRole === 'OWNER' ? partyIds.ownerId : null,
      agent_id: listerRole === 'AGENT' ? partyIds.agentId : null,
      builder_id: listerRole === 'BUILDER' ? partyIds.builderId : null,
      project_id: dto.projectId ?? null,
      title: dto.title ?? '',
      listing_type: dto.listingType,
      property_type: dto.propertyType,
      bedrooms: dto.bedrooms ?? null,
      bathrooms: dto.bathrooms ?? null,
      balconies: dto.balconies ?? null,
      floor_number: dto.floorNumber ?? null,
      total_floors: dto.totalFloors ?? null,
      carpet_area_sqft: dto.carpetAreaSqft ?? null,
      builtup_area_sqft: dto.builtupAreaSqft ?? null,
      furnishing: dto.furnishing ?? 'UNFURNISHED',
      facing: dto.facing ?? null,
      age_years: dto.ageYears ?? null,
      parking_covered: dto.parkingCovered ?? 0,
      parking_open: dto.parkingOpen ?? 0,
      rent_amount: dto.rentAmount ?? null,
      sale_price: dto.salePrice ?? null,
      security_deposit: dto.securityDeposit ?? null,
      maintenance_amount: dto.maintenanceAmount ?? null,
      maintenance_period: dto.maintenancePeriod ?? 'MONTHLY',
      lock_in_months: dto.lockInMonths ?? null,
      notice_period_days: dto.noticePeriodDays ?? null,
      address_line1: dto.addressLine1 ?? '',
      address_line2: dto.addressLine2 ?? null,
      locality: dto.locality ?? '',
      city: dto.city ?? '',
      state: dto.state ?? '',
      pincode: dto.pincode ?? '',
      latitude: dto.latitude ?? null,
      longitude: dto.longitude ?? null,
      available_from: dto.availableFrom ?? null,
      preferred_tenants: dto.preferredTenants?.join(',') ?? null,
      pets_allowed: dto.petsAllowed ? 1 : 0,
      description: dto.description ?? null,
      house_rules: dto.houseRules ?? null,
      status: 'DRAFT',
      wizard_step: dto.wizardStep ?? 1,
    });

    const amenityCodes = dto.amenityCodes ?? dto.amenities;
    if (amenityCodes?.length) await this.setAmenities(id, amenityCodes);

    await this.db.insert('property_timeline', {
      property_id: id,
      event_code: 'PROPERTY_CREATED',
      title: 'Listing created',
      detail: `Draft started by ${user.fullName}`,
      actor_id: user.id,
    });
    await this.recalculateQuality(id);
    await this.audit.record({ actor: user, action: 'property.created', objectType: 'property', objectId: id, req });

    return this.findOwned(user, id);
  }

  async update(user: AuthUser, id: number, dto: UpdatePropertyDto, req?: Request) {
    const property = await this.assertCanEdit(user, id);
    if (['RENTED', 'SOLD'].includes(property.status)) {
      throw new BadRequestException('This property has an active tenancy and cannot be edited.');
    }

    const map: Record<string, unknown> = {
      title: dto.title,
      listing_type: dto.listingType,
      property_type: dto.propertyType,
      bedrooms: dto.bedrooms,
      bathrooms: dto.bathrooms,
      balconies: dto.balconies,
      floor_number: dto.floorNumber,
      total_floors: dto.totalFloors,
      carpet_area_sqft: dto.carpetAreaSqft,
      builtup_area_sqft: dto.builtupAreaSqft,
      furnishing: dto.furnishing,
      facing: dto.facing,
      age_years: dto.ageYears,
      parking_covered: dto.parkingCovered,
      parking_open: dto.parkingOpen,
      rent_amount: dto.rentAmount,
      sale_price: dto.salePrice,
      security_deposit: dto.securityDeposit,
      maintenance_amount: dto.maintenanceAmount,
      maintenance_period: dto.maintenancePeriod,
      price_negotiable: dto.priceNegotiable === undefined ? undefined : dto.priceNegotiable ? 1 : 0,
      lock_in_months: dto.lockInMonths,
      notice_period_days: dto.noticePeriodDays,
      address_line1: dto.addressLine1,
      address_line2: dto.addressLine2,
      locality: dto.locality,
      city: dto.city,
      state: dto.state,
      pincode: dto.pincode,
      latitude: dto.latitude,
      longitude: dto.longitude,
      available_from: dto.availableFrom,
      preferred_tenants: dto.preferredTenants ? (Array.isArray(dto.preferredTenants) ? dto.preferredTenants.join(',') : dto.preferredTenants) : undefined,
      pets_allowed: dto.petsAllowed === undefined ? undefined : dto.petsAllowed ? 1 : 0,
      non_veg_allowed: dto.nonVegAllowed === undefined ? undefined : dto.nonVegAllowed ? 1 : 0,
      description: dto.description,
      house_rules: dto.houseRules,
      wizard_step: dto.wizardStep,
      slug: (dto.city !== undefined || dto.locality !== undefined || dto.bedrooms !== undefined || dto.propertyType !== undefined)
        ? propertySlug({
            city: dto.city !== undefined ? dto.city : property.city,
            locality: dto.locality !== undefined ? dto.locality : property.locality,
            bedrooms: dto.bedrooms !== undefined ? dto.bedrooms : property.bedrooms,
            propertyType: dto.propertyType !== undefined ? dto.propertyType : property.property_type,
            publicId: property.public_id,
          })
        : undefined,
    };

    await this.db.update('properties', id, map);
    const amenityCodes = dto.amenityCodes ?? dto.amenities;
    if (amenityCodes) await this.setAmenities(id, amenityCodes);
    await this.recalculateQuality(id);
    await this.audit.record({ actor: user, action: 'property.updated', objectType: 'property', objectId: id, req });
    return this.findOwned(user, id);
  }

  /** Wizard step 10: hand the listing to the verification team. */
  async submitForVerification(user: AuthUser, id: number, req?: Request) {
    const property = await this.assertCanEdit(user, id);
    const missing = this.missingForPublish(property);
    if (missing.length) {
      throw new BadRequestException(`Add the following before submitting: ${missing.join(', ')}.`);
    }

    const images = await this.db.one<{ c: number }>(
      'SELECT COUNT(*) AS c FROM property_images WHERE property_id = ?', [id],
    );
    if ((images?.c ?? 0) < 4) throw new BadRequestException('Add at least 4 photographs before submitting.');

    await this.db.update('properties', id, { status: 'PENDING_VERIFICATION', rejection_reason: null });

    const checks = ['KYC', 'OWNER_IDENTITY', 'OWNERSHIP_DOCUMENT', 'ADDRESS', 'PHOTO_AUTHENTICITY'];
    for (const check of checks) {
      await this.db.execute(
        `INSERT INTO property_verifications (property_id, check_type, status)
         VALUES (?, ?, 'PENDING')
         ON DUPLICATE KEY UPDATE status = IF(status = 'FAILED', 'PENDING', status)`,
        [id, check],
      );
    }
    await this.audit.record({ actor: user, action: 'property.submitted', objectType: 'property', objectId: id, req });
    return { status: 'PENDING_VERIFICATION', message: 'Sent to the verification team. Most listings are reviewed within 24 hours.' };
  }

  /** Verification team decision. Badges only ever come from verified check rows. */
  async moderate(user: AuthUser, id: number, decision: 'APPROVE' | 'REJECT', reason?: string, req?: Request) {
    const property = await this.db.one<any>('SELECT * FROM properties WHERE id = ?', [id]);
    if (!property) throw new NotFoundException('Listing not found.');

    if (decision === 'REJECT') {
      if (!reason) throw new BadRequestException('Give the lister a reason so they can fix it.');
      await this.db.update('properties', id, { status: 'REJECTED', rejection_reason: reason });
      await this.audit.record({ actor: user, action: 'property.rejected', objectType: 'property', objectId: id, metadata: { reason }, req });
      return { status: 'REJECTED' };
    }

    await this.db.update('properties', id, {
      status: 'ACTIVE',
      published_at: property.published_at ?? new Date(),
      rejection_reason: null,
    });
    await this.db.execute(
      `UPDATE property_verifications SET status = 'VERIFIED', verified_at = NOW(), reviewer_id = ?
        WHERE property_id = ? AND check_type IN ('KYC','OWNER_IDENTITY','ADDRESS')`,
      [user.id, id],
    );
    await this.db.insert('property_timeline', {
      property_id: id,
      event_code: 'PROPERTY_VERIFIED',
      title: 'Listing verified and published',
      actor_id: user.id,
    });
    await this.audit.record({ actor: user, action: 'property.approved', objectType: 'property', objectId: id, req });
    return { status: 'ACTIVE' };
  }

  async setVerificationCheck(user: AuthUser, id: number, checkType: string, status: string, notes?: string) {
    await this.db.execute(
      `INSERT INTO property_verifications (property_id, check_type, status, reviewer_id, notes, verified_at)
       VALUES (?, ?, ?, ?, ?, IF(? = 'VERIFIED', NOW(), NULL))
       ON DUPLICATE KEY UPDATE status = VALUES(status), reviewer_id = VALUES(reviewer_id),
                               notes = VALUES(notes), verified_at = VALUES(verified_at)`,
      [id, checkType, status, user.id, notes ?? null, status],
    );
    await this.audit.record({
      actor: user, action: 'property.verification_updated', objectType: 'property', objectId: id,
      metadata: { checkType, status },
    });
    return this.db.query('SELECT check_type, status, verified_at FROM property_verifications WHERE property_id = ?', [id]);
  }

  async getPropertyDeletionEligibility(user: AuthUser, id: number) {
    const property = await this.assertCanEdit(user, id);

    const [
      enquiriesRes,
      viewingsRes,
      visitsRes,
      applicationsRes,
      tenanciesRes,
      agreementsRes,
      paymentsRes,
      disputesRes,
      riskCasesRes,
      maintenanceRes,
    ] = await Promise.all([
      this.db.one<any>('SELECT COUNT(*) AS total FROM enquiries WHERE property_id = ?', [id]),
      this.db.one<any>('SELECT COUNT(*) AS total FROM viewings WHERE property_id = ?', [id]),
      this.db.one<any>('SELECT COUNT(*) AS total FROM property_visits WHERE property_id = ?', [id]),
      this.db.one<any>('SELECT COUNT(*) AS total FROM applications WHERE property_id = ?', [id]),
      this.db.one<any>('SELECT COUNT(*) AS total FROM tenancies WHERE property_id = ?', [id]),
      this.db.one<any>(
        'SELECT COUNT(*) AS total FROM agreements WHERE tenancy_id IN (SELECT id FROM tenancies WHERE property_id = ?)',
        [id],
      ),
      this.db.one<any>(
        'SELECT COUNT(*) AS total FROM payments WHERE property_id = ? OR tenancy_id IN (SELECT id FROM tenancies WHERE property_id = ?)',
        [id, id],
      ),
      this.db.one<any>(
        'SELECT COUNT(*) AS total FROM disputes WHERE tenancy_id IN (SELECT id FROM tenancies WHERE property_id = ?)',
        [id],
      ),
      this.db.one<any>(
        'SELECT COUNT(*) AS total FROM risk_cases WHERE subject_property_id = ?',
        [id],
      ),
      this.db.one<any>(
        'SELECT COUNT(*) AS total FROM maintenance_requests WHERE property_id = ? OR tenancy_id IN (SELECT id FROM tenancies WHERE property_id = ?)',
        [id, id],
      ),
    ]);

    const enquiries = Number(enquiriesRes?.total || 0);
    const visits = Number(viewingsRes?.total || 0) + Number(visitsRes?.total || 0);
    const applications = Number(applicationsRes?.total || 0);
    const tenancies = Number(tenanciesRes?.total || 0);
    const agreements = Number(agreementsRes?.total || 0);
    const payments = Number(paymentsRes?.total || 0);
    const disputes = Number(disputesRes?.total || 0);
    const riskCases = Number(riskCasesRes?.total || 0);
    const maintenance = Number(maintenanceRes?.total || 0);

    const dependencies = {
      enquiries,
      visits,
      applications,
      tenancies,
      agreements,
      payments,
      disputes,
      riskCases,
      maintenance,
    };

    const hasFinancialOrLegalHistory =
      tenancies > 0 ||
      agreements > 0 ||
      payments > 0 ||
      disputes > 0 ||
      riskCases > 0 ||
      ['RENTED', 'SOLD'].includes(property.status);

    const hasInteractionHistory = enquiries > 0 || visits > 0 || applications > 0 || maintenance > 0;

    const totalProtectedDependencies =
      enquiries + visits + applications + tenancies + agreements + payments + disputes + riskCases + maintenance;

    const blockers: string[] = [];
    if (['RENTED', 'SOLD'].includes(property.status)) {
      blockers.push(`Property is currently in ${property.status} status`);
    }
    if (tenancies > 0) blockers.push(`Property has ${tenancies} tenancy record(s)`);
    if (agreements > 0) blockers.push(`Property has ${agreements} legal agreement(s)`);
    if (payments > 0) blockers.push(`Property has ${payments} payment transaction(s)`);
    if (disputes > 0) blockers.push(`Property has ${disputes} dispute case(s)`);
    if (riskCases > 0) blockers.push(`Property has ${riskCases} risk management case(s)`);
    if (applications > 0) blockers.push(`Property has ${applications} rental application(s)`);
    if (enquiries > 0) blockers.push(`Property has ${enquiries} customer enquiry/enquiries`);
    if (visits > 0) blockers.push(`Property has ${visits} scheduled visit(s)/viewing(s)`);
    if (maintenance > 0) blockers.push(`Property has ${maintenance} maintenance request(s)`);

    const canHardDelete = totalProtectedDependencies === 0 && !hasFinancialOrLegalHistory;
    const canArchive = property.status !== 'ARCHIVED';

    const action: 'DELETE' | 'ARCHIVE' = canHardDelete ? 'DELETE' : 'ARCHIVE';
    const actionLabel = canHardDelete ? 'Delete permanently' : 'Archive and remove from marketplace';
    const explanation = canHardDelete
      ? 'This property has no connected inquiries, applications, tenancies, or payment history. Removing it will permanently delete the property.'
      : 'This property has protected rental, financial, or lifecycle history. Removing it will archive it from the public marketplace while 100% preserving all historical and financial records.';

    return {
      propertyId: id,
      title: property.title,
      status: property.status,
      action,
      actionLabel,
      explanation,
      canHardDelete,
      canArchive,
      hasFinancialOrLegalHistory,
      hasInteractionHistory,
      dependencies,
      blockers,
    };
  }

  async removeProperty(user: AuthUser, id: number, reason?: string, req?: Request) {
    const eligibility = await this.getPropertyDeletionEligibility(user, id);

    if (eligibility.canHardDelete) {
      return this.deleteProperty(user, id, req);
    } else {
      const archiveReason = reason?.trim() || 'Removed from marketplace by authorized manager';
      return this.archiveProperty(user, id, archiveReason, req);
    }
  }

  async deleteProperty(user: AuthUser, id: number, req?: Request) {
    const eligibility = await this.getPropertyDeletionEligibility(user, id);

    if (!eligibility.canHardDelete) {
      const reasonText = eligibility.blockers.join('; ');
      throw new BadRequestException(
        `This property cannot be permanently deleted because it has protected lifecycle dependencies. Blockers: ${reasonText}. Use "Archive Property" instead.`,
      );
    }

    // Clean up draft/property sub-records safely
    await this.db.execute('DELETE FROM property_amenities WHERE property_id = ?', [id]);
    await this.db.execute('DELETE FROM property_images WHERE property_id = ?', [id]);
    await this.db.execute('DELETE FROM property_verifications WHERE property_id = ?', [id]);
    await this.db.execute('DELETE FROM property_views WHERE property_id = ?', [id]);
    await this.db.execute('DELETE FROM property_interactions WHERE property_id = ?', [id]);
    await this.db.execute('DELETE FROM property_timeline WHERE property_id = ?', [id]);
    await this.db.execute('DELETE FROM saved_properties WHERE property_id = ?', [id]);
    await this.db.execute('DELETE FROM listing_promotions WHERE listing_id = ?', [id]);
    await this.db.execute('DELETE FROM property_units WHERE property_id = ?', [id]);
    await this.db.execute('DELETE FROM properties WHERE id = ?', [id]);

    await this.audit.record({
      actor: user,
      action: 'property.deleted',
      objectType: 'property',
      objectId: id,
      metadata: {
        title: eligibility.title,
        status: eligibility.status,
        deletedPermanently: true,
      },
      req,
    });

    return {
      success: true,
      action: 'DELETE',
      message: 'Property permanently deleted.',
      propertyId: id,
    };
  }

  async archiveProperty(user: AuthUser, id: number, reason: string, req?: Request) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A valid archive reason is required.');
    }

    const property = await this.assertCanEdit(user, id);
    if (property.status === 'ARCHIVED') {
      throw new BadRequestException('This property is already archived.');
    }

    const previousStatus = property.status;

    await this.db.update('properties', id, {
      status: 'ARCHIVED',
    });

    await this.db.insert('property_timeline', {
      property_id: id,
      event_code: 'PROPERTY_ARCHIVED',
      title: 'Property archived',
      detail: `Archived by ${user.fullName}: ${reason.trim()}`,
      actor_id: user.id,
    });

    await this.audit.record({
      actor: user,
      action: 'property.archived',
      objectType: 'property',
      objectId: id,
      metadata: {
        title: property.title,
        previousStatus,
        newStatus: 'ARCHIVED',
        reason: reason.trim(),
      },
      req,
    });

    const isStaff = user.permissions.includes('property.moderate');
    if (isStaff && property.listed_by_user_id !== user.id) {
      try {
        await this.notifications.send(property.listed_by_user_id, 'PROPERTY_STATUS_CHANGE', {
          title: 'Property Archived by Management',
          body: `Your property "${property.title}" has been archived by Odibrick Management. Reason: ${reason.trim()}`,
          actionUrl: '/dashboard/properties',
          severity: 'WARNING',
        });
      } catch (e) {
        // Non-fatal notification failure
      }
    }

    return {
      success: true,
      status: 'ARCHIVED',
      action: 'ARCHIVE',
      message: 'Property archived successfully.',
      propertyId: id,
    };
  }

  async archive(user: AuthUser, id: number, req?: Request) {
    return this.archiveProperty(user, id, 'Archived by user', req);
  }

  async duplicate(user: AuthUser, id: number) {
    const source = await this.assertCanEdit(user, id);
    const publicId = newPublicId();
    const slug = propertySlug({
      city: source.city, locality: source.locality, bedrooms: source.bedrooms,
      propertyType: source.property_type, publicId,
    });
    const copyId = await this.db.execute(
      `INSERT INTO properties (public_id, slug, listed_by_user_id, listed_by_role, owner_id, agent_id,
        builder_id, project_id, title, listing_type, property_type, bedrooms, bathrooms, balconies,
        floor_number, total_floors, carpet_area_sqft, builtup_area_sqft, furnishing, facing, age_years,
        parking_covered, parking_open, rent_amount, sale_price, security_deposit, maintenance_amount,
        maintenance_period, address_line1, address_line2, locality, city, state, pincode, latitude,
        longitude, description, house_rules, status, wizard_step)
       SELECT ?, ?, listed_by_user_id, listed_by_role, owner_id, agent_id, builder_id, project_id,
        CONCAT(title, ' (copy)'), listing_type, property_type, bedrooms, bathrooms, balconies,
        floor_number, total_floors, carpet_area_sqft, builtup_area_sqft, furnishing, facing, age_years,
        parking_covered, parking_open, rent_amount, sale_price, security_deposit, maintenance_amount,
        maintenance_period, address_line1, address_line2, locality, city, state, pincode, latitude,
        longitude, description, house_rules, 'DRAFT', 3
        FROM properties WHERE id = ?`,
      [publicId, slug, id],
    );
    await this.db.execute(
      'INSERT INTO property_amenities (property_id, amenity_id) SELECT ?, amenity_id FROM property_amenities WHERE property_id = ?',
      [copyId.insertId, id],
    );
    return this.findOwned(user, copyId.insertId);
  }

  // ------------------------------------------------------------- inventory
  async listMine(user: AuthUser, status?: string, page?: number, perPage?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, perPage);
    const where = ['p.listed_by_user_id = ?', 'p.deleted_at IS NULL'];
    const params: unknown[] = [user.id];
    if (status) {
      where.push('p.status = ?');
      params.push(status);
    }
    const clause = where.join(' AND ');
    const rows = await this.db.query(
      `SELECT p.id, p.public_id, p.slug, p.title, p.status, p.listing_type, p.property_type, p.bedrooms,
              p.city, p.locality, p.rent_amount, p.sale_price, p.view_count, p.enquiry_count,
              p.quality_score, p.wizard_step, p.is_protected, p.is_featured, p.created_at,
              (SELECT pi.storage_key FROM property_images pi WHERE pi.property_id = p.id
                ORDER BY pi.is_cover DESC, pi.sort_order LIMIT 1) AS cover_key,
              (SELECT COUNT(*) FROM applications a WHERE a.property_id = p.id AND a.status = 'SUBMITTED') AS new_applications
         FROM properties p WHERE ${clause}
        ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM properties p WHERE ${clause}`, params,
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  async moderationQueue(page?: number, perPage?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, perPage);
    const rows = await this.db.query(
      `SELECT p.id, p.public_id, p.title, p.city, p.locality, p.listed_by_role, p.rent_amount,
              p.created_at, u.full_name AS lister_name, u.email AS lister_email,
              (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) AS image_count,
              (SELECT COUNT(*) FROM documents d WHERE d.entity_type = 'property' AND d.entity_id = p.id) AS document_count
         FROM properties p JOIN users u ON u.id = p.listed_by_user_id
        WHERE p.status = 'PENDING_VERIFICATION'
        ORDER BY p.created_at ASC LIMIT ? OFFSET ?`,
      [pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      "SELECT COUNT(*) AS total FROM properties WHERE status = 'PENDING_VERIFICATION'",
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  async findOwned(user: AuthUser, id: number) {
    const row = await this.db.one<any>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) throw new NotFoundException('Listing not found.');
    const isStaff = user.permissions.includes('property.moderate') || user.permissions.includes('property.read.private');
    if (row.listed_by_user_id !== user.id && !isStaff) {
      const { ownerId, agentId, builderId } = await this.partyIds(user.id);
      const isParty = (ownerId && row.owner_id === ownerId) || (agentId && row.agent_id === agentId) || (builderId && row.builder_id === builderId);
      if (!isParty) {
        throw new ForbiddenException('This listing belongs to another account.');
      }
    }
    const amenities = await this.db.query(
      'SELECT a.code FROM property_amenities pa JOIN amenities a ON a.id = pa.amenity_id WHERE pa.property_id = ?',
      [id],
    );
    const images = await this.db.query(
      'SELECT id, storage_key, caption, room_tag, is_cover, sort_order, created_at FROM property_images WHERE property_id = ? ORDER BY is_cover DESC, sort_order ASC, id ASC',
      [id],
    );
    return { ...this.mapDetail(row, true), amenityCodes: amenities.map((a: any) => a.code), images };
  }

  // ------------------------------------------------------------------ media
  async getImages(user: AuthUser, propertyId: number) {
    const property = await this.db.one<any>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [propertyId]);
    if (!property) throw new NotFoundException('Listing not found.');

    if (!PUBLIC_STATUSES.includes(property.status)) {
      await this.assertCanEdit(user, propertyId);
    }

    return this.db.query(
      'SELECT id, storage_key, caption, room_tag, is_cover, sort_order, created_at FROM property_images WHERE property_id = ? ORDER BY is_cover DESC, sort_order ASC, id ASC',
      [propertyId],
    );
  }

  async attachImage(
    user: AuthUser,
    propertyId: number,
    storageKey: string,
    caption?: string,
    roomTag?: string,
    req?: Request,
  ) {
    await this.assertCanEdit(user, propertyId);
    const count = await this.db.one<{ c: number }>(
      'SELECT COUNT(*) AS c FROM property_images WHERE property_id = ?',
      [propertyId],
    );
    const isCover = (count?.c ?? 0) === 0 ? 1 : 0;
    const sortOrder = count?.c ?? 0;
    const id = await this.db.insert('property_images', {
      property_id: propertyId,
      storage_key: storageKey,
      caption: caption ?? null,
      room_tag: roomTag ?? null,
      is_cover: isCover,
      sort_order: sortOrder,
    });
    await this.recalculateQuality(propertyId);
    await this.audit.record({
      actor: user,
      action: 'property.image_attached',
      objectType: 'property',
      objectId: propertyId,
      metadata: { imageId: id, storageKey, isCover },
      req,
    });
    return { id, storageKey, isCover, sortOrder };
  }

  async setCoverImage(user: AuthUser, propertyId: number, imageId: number, req?: Request) {
    await this.assertCanEdit(user, propertyId);
    const img = await this.db.one<any>(
      'SELECT id FROM property_images WHERE id = ? AND property_id = ?',
      [imageId, propertyId],
    );
    if (!img) throw new NotFoundException('Photograph not found on this listing.');

    await this.db.execute('UPDATE property_images SET is_cover = 0 WHERE property_id = ?', [propertyId]);
    await this.db.execute('UPDATE property_images SET is_cover = 1 WHERE id = ? AND property_id = ?', [
      imageId,
      propertyId,
    ]);

    await this.audit.record({
      actor: user,
      action: 'property.cover_image_set',
      objectType: 'property',
      objectId: propertyId,
      metadata: { imageId },
      req,
    });

    return { success: true, coverImageId: imageId };
  }

  async reorderImages(user: AuthUser, propertyId: number, imageIds: number[], req?: Request) {
    await this.assertCanEdit(user, propertyId);
    if (!Array.isArray(imageIds)) {
      throw new BadRequestException('imageIds must be an array of image IDs.');
    }

    for (let i = 0; i < imageIds.length; i++) {
      await this.db.execute(
        'UPDATE property_images SET sort_order = ? WHERE id = ? AND property_id = ?',
        [i, imageIds[i], propertyId],
      );
    }

    await this.audit.record({
      actor: user,
      action: 'property.images_reordered',
      objectType: 'property',
      objectId: propertyId,
      metadata: { imageIds },
      req,
    });

    return { success: true };
  }

  async removeImage(user: AuthUser, propertyId: number, imageId: number, req?: Request) {
    await this.assertCanEdit(user, propertyId);
    const img = await this.db.one<any>(
      'SELECT * FROM property_images WHERE id = ? AND property_id = ?',
      [imageId, propertyId],
    );
    if (!img) throw new NotFoundException('Photograph not found on this listing.');

    await this.db.execute('DELETE FROM property_images WHERE id = ? AND property_id = ?', [imageId, propertyId]);

    if (img.is_cover) {
      const nextFirst = await this.db.one<any>(
        'SELECT id FROM property_images WHERE property_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1',
        [propertyId],
      );
      if (nextFirst) {
        await this.db.execute('UPDATE property_images SET is_cover = 1 WHERE id = ?', [nextFirst.id]);
      }
    }

    await this.recalculateQuality(propertyId);
    await this.audit.record({
      actor: user,
      action: 'property.image_removed',
      objectType: 'property',
      objectId: propertyId,
      metadata: { imageId },
      req,
    });

    return { success: true };
  }

  // -------------------------------------------------------------- internals
  private async setAmenities(propertyId: number, codes: string[]) {
    await this.db.execute('DELETE FROM property_amenities WHERE property_id = ?', [propertyId]);
    if (!codes.length) return;
    await this.db.execute(
      `INSERT IGNORE INTO property_amenities (property_id, amenity_id)
       SELECT ?, id FROM amenities WHERE code IN (${codes.map(() => '?').join(',')})`,
      [propertyId, ...codes],
    );
  }

  private async assertCanEdit(user: AuthUser, id: number) {
    const row = await this.db.one<any>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!row) throw new NotFoundException('Listing not found.');
    const isStaff = user.permissions.includes('property.moderate');
    if (isStaff) {
      return row;
    }
    if (!user.permissions.includes('property.update.own')) {
      throw new ForbiddenException('You do not have permission to update properties.');
    }
    if (row.listed_by_user_id === user.id) {
      return row;
    }
    const { ownerId, agentId, builderId } = await this.partyIds(user.id);
    if ((ownerId && row.owner_id === ownerId) || (agentId && row.agent_id === agentId) || (builderId && row.builder_id === builderId)) {
      return row;
    }
    throw new ForbiddenException('This listing belongs to another account.');
  }

  private resolveListerRole(user: AuthUser): 'OWNER' | 'AGENT' | 'BUILDER' {
    if (user.roles.includes('AGENT')) return 'AGENT';
    if (user.roles.includes('BUILDER')) return 'BUILDER';
    if (user.roles.includes('OWNER')) return 'OWNER';
    if (user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN')) return 'OWNER';
    throw new ForbiddenException('Add an owner, agent or builder profile before listing a property.');
  }

  private async partyIds(userId: number) {
    const [owner, agent, builder] = await Promise.all([
      this.db.one<any>('SELECT id FROM owners WHERE user_id = ?', [userId]),
      this.db.one<any>('SELECT id FROM agents WHERE user_id = ?', [userId]),
      this.db.one<any>('SELECT id FROM builders WHERE user_id = ?', [userId]),
    ]);
    return { ownerId: owner?.id ?? null, agentId: agent?.id ?? null, builderId: builder?.id ?? null };
  }

  private missingForPublish(p: any): string[] {
    const missing: string[] = [];
    if (!p.title) missing.push('a title');
    if (!p.address_line1 || !p.locality || !p.city || !p.pincode) missing.push('the full address');
    if (p.listing_type === 'RENT' && !p.rent_amount) missing.push('monthly rent');
    if (p.listing_type === 'SALE' && !p.sale_price) missing.push('sale price');
    if (!p.description || p.description.length < 40) missing.push('a description of at least 40 characters');
    return missing;
  }

  /** Listing completeness drives search ranking and the "improve this listing" prompts. */
  private async recalculateQuality(id: number) {
    const p = await this.db.one<any>('SELECT * FROM properties WHERE id = ?', [id]);
    if (!p) return;
    const counts = await this.db.one<any>(
      `SELECT (SELECT COUNT(*) FROM property_images WHERE property_id = ?) AS images,
              (SELECT COUNT(*) FROM property_videos WHERE property_id = ?) AS videos,
              (SELECT COUNT(*) FROM property_amenities WHERE property_id = ?) AS amenities`,
      [id, id, id],
    );
    let score = 0;
    score += Math.min(30, (counts.images ?? 0) * 5);
    score += counts.videos ? 10 : 0;
    score += Math.min(15, (counts.amenities ?? 0) * 2);
    score += p.description?.length > 120 ? 15 : p.description?.length > 40 ? 8 : 0;
    score += p.latitude && p.longitude ? 10 : 0;
    score += p.carpet_area_sqft ? 5 : 0;
    score += p.available_from ? 5 : 0;
    score += p.house_rules ? 5 : 0;
    score += p.security_deposit ? 5 : 0;
    await this.db.update('properties', id, { quality_score: Math.min(100, score) });
  }

  private mapCard = (row: any) => ({
    id: row.id,
    publicId: row.public_id,
    slug: row.slug,
    title: row.title,
    listingType: row.listing_type,
    propertyType: row.property_type,
    bedrooms: row.bedrooms,
    bathrooms: row.bathrooms,
    areaSqft: row.builtup_area_sqft ?? row.carpet_area_sqft,
    furnishing: row.furnishing,
    rent: row.rent_amount,
    price: row.sale_price,
    deposit: row.security_deposit,
    maintenance: row.maintenance_amount,
    locality: row.locality,
    city: row.city,
    state: row.state,
    lat: row.latitude,
    lng: row.longitude,
    availableFrom: row.available_from,
    isProtected: !!row.is_protected,
    isFeatured: !!row.is_featured,
    visibilityTier: row.visibility_tier || 'STANDARD',
    promotedUntil: row.promoted_until,
    listedByRole: row.listed_by_role,
    views: row.view_count,
    coverKey: row.cover_key,
    verifiedChecks: row.verified_checks ? String(row.verified_checks).split(',') : [],
  });

  private mapDetail(row: any, includePrivate = false) {
    return {
      id: row.id,
      publicId: row.public_id,
      slug: row.slug,
      title: row.title,
      status: row.status,
      listingType: row.listing_type,
      propertyType: row.property_type,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      balconies: row.balconies,
      floorNumber: row.floor_number,
      totalFloors: row.total_floors,
      carpetAreaSqft: row.carpet_area_sqft,
      builtupAreaSqft: row.builtup_area_sqft,
      furnishing: row.furnishing,
      facing: row.facing,
      ageYears: row.age_years,
      parkingCovered: row.parking_covered,
      parkingOpen: row.parking_open,
      rentAmount: row.rent_amount,
      salePrice: row.sale_price,
      securityDeposit: row.security_deposit,
      maintenanceAmount: row.maintenance_amount,
      maintenancePeriod: row.maintenance_period,
      priceNegotiable: !!row.price_negotiable,
      lockInMonths: row.lock_in_months,
      noticePeriodDays: row.notice_period_days,
      locality: row.locality,
      city: row.city,
      state: row.state,
      pincode: row.pincode,
      latitude: row.latitude,
      longitude: row.longitude,
      availableFrom: row.available_from,
      preferredTenants: row.preferred_tenants ? String(row.preferred_tenants).split(',') : [],
      petsAllowed: !!row.pets_allowed,
      nonVegAllowed: row.non_veg_allowed === null || row.non_veg_allowed === undefined ? true : !!row.non_veg_allowed,
      description: row.description,
      houseRules: row.house_rules,
      isProtected: !!row.is_protected,
      isFeatured: !!row.is_featured,
      qualityScore: row.quality_score,
      wizardStep: row.wizard_step,
      views: row.view_count,
      listedByRole: row.listed_by_role,
      listerName: row.lister_name ?? null,
      agencyName: row.agency_name ?? row.company_name ?? null,
      projectName: row.project_name ?? null,
      publishedAt: row.published_at,
      // exact address is only exposed to the lister, staff, and an accepted tenant
      addressLine1: includePrivate ? row.address_line1 : undefined,
      addressLine2: includePrivate ? row.address_line2 : undefined,
      rejectionReason: includePrivate ? row.rejection_reason : undefined,
    };
  }
}
