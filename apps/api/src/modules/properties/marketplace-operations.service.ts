import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { PaymentsService } from '../payments/payments.service';
import { CommercialOperationsService } from '../payments/commercial-operations.service';
import { InvoicesService } from '../payments/invoices.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { formatReference, newPublicId } from '../../common/util/ids';
import { pageParams, paginate, Paginated } from '../../common/util/pagination';
import {
  AdminLeadsQueryDto,
  AdminVisitsQueryDto,
  AssignLeadDto,
  AssignVisitDto,
  CancelVisitDto,
  CompleteVisitDto,
  ConfirmVisitDto,
  ContactLeadDto,
  ConvertLeadDto,
  CustomerVisitsQueryDto,
  FollowUpLeadDto,
  LeadStatus,
  ManagementPromotionOverrideDto,
  MarketplaceLeadsQueryDto,
  MarketplaceListingsQueryDto,
  MarkLeadDuplicateDto,
  MarkLeadLostDto,
  MarkLeadSpamDto,
  ModerateListingDto,
  ModerationDecision,
  NoShowVisitDto,
  OverrideVisitDto,
  PromotionOverrideAction,
  ProposeVisitDto,
  ProviderLeadsQueryDto,
  ProviderVisitsQueryDto,
  QualifyLeadDto,
  RecordLeadDto,
  RequestVisitDto,
  RescheduleVisitDto,
  SavePropertyDto,
  VisibilityTier,
  VisitOutcome,
  VisitOverrideAction,
  VisitStatus,
  VisitType,
} from './marketplace-operations.dto';
import { CommercialCategory } from '../payments/commercial-operations.dto';

@Injectable()
export class MarketplaceOperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly payments: PaymentsService,
    private readonly commercial: CommercialOperationsService,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
  ) {}

  private isManagement(user: AuthUser): boolean {
    return (
      user.roles.includes('SUPER_ADMIN') ||
      user.roles.includes('ADMIN') ||
      user.permissions.includes('marketplace.manage') ||
      user.permissions.includes('listing.moderate')
    );
  }

  // =========================================================================
  // 1. MARKETPLACE OVERVIEW & EXECUTIVE ANALYTICS
  // =========================================================================
  async getMarketplaceOverview(user: AuthUser) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access the Marketplace Overview.');
    }

    const [
      counts,
      promotionsSummary,
      leadSummary,
      revenueSummary,
      topCities,
    ] = await Promise.all([
      this.db.one<any>(`
        SELECT
          COUNT(*) AS total_properties,
          SUM(IF(status = 'ACTIVE', 1, 0)) AS active_listings,
          SUM(IF(status = 'PENDING_VERIFICATION', 1, 0)) AS pending_verification,
          SUM(IF(status = 'SUSPENDED', 1, 0)) AS suspended_listings,
          SUM(IF(status = 'DRAFT', 1, 0)) AS draft_listings,
          SUM(IF(status = 'ARCHIVED', 1, 0)) AS archived_listings,
          SUM(IF(status IN ('RENTED', 'SOLD'), 1, 0)) AS closed_listings,
          SUM(IF(visibility_tier != 'STANDARD' OR is_featured = 1, 1, 0)) AS total_promoted_active,
          SUM(IF(duplicate_of_property_id IS NOT NULL, 1, 0)) AS duplicate_flagged_count
        FROM properties
        WHERE deleted_at IS NULL
      `),
      this.db.one<any>(`
        SELECT
          COUNT(*) AS total_promotions,
          SUM(IF(status = 'ACTIVE', 1, 0)) AS active_promotions,
          SUM(IF(status = 'EXPIRED', 1, 0)) AS expired_promotions,
          SUM(IF(status = 'PENDING_PAYMENT', 1, 0)) AS pending_payment_promotions,
          SUM(IF(visibility_tier = 'PREMIUM' AND status = 'ACTIVE', 1, 0)) AS active_premium,
          SUM(IF(visibility_tier = 'FEATURED' AND status = 'ACTIVE', 1, 0)) AS active_featured,
          SUM(IF(visibility_tier = 'PROMOTED' AND status = 'ACTIVE', 1, 0)) AS active_boosted
        FROM listing_promotions
      `),
      this.db.one<any>(`
        SELECT
          (SELECT COUNT(*) FROM enquiries) AS total_enquiries,
          (SELECT COUNT(*) FROM applications) AS total_applications,
          (SELECT COUNT(*) FROM tenancies WHERE stage = 'ACTIVE') AS active_tenancies,
          (SELECT COUNT(*) FROM campaign_leads) AS total_campaign_leads
      `),
      this.db.one<any>(`
        SELECT
          COALESCE(SUM(total_amount), 0) AS total_marketing_billed,
          COALESCE(SUM(IF(status = 'PAID', total_amount, 0)), 0) AS total_marketing_collected,
          COALESCE(SUM(IF(status IN ('CALCULATED','PENDING_REVIEW','APPROVED','PAYMENT_DUE'), total_amount, 0)), 0) AS total_marketing_due
        FROM commercial_obligations
        WHERE category = 'MARKETING_PACKAGE'
      `),
      this.db.query<any>(`
        SELECT city, COUNT(*) AS count, SUM(IF(status = 'ACTIVE', 1, 0)) AS active_count
        FROM properties
        WHERE deleted_at IS NULL
        GROUP BY city
        ORDER BY count DESC
        LIMIT 5
      `),
    ]);

    const totalEnquiries = Number(leadSummary?.total_enquiries || 0);
    const totalApps = Number(leadSummary?.total_applications || 0);
    const activeTenancies = Number(leadSummary?.active_tenancies || 0);
    const conversionRate = totalEnquiries > 0 ? Number(((activeTenancies / totalEnquiries) * 100).toFixed(2)) : 0;

    return {
      totals: {
        totalProperties: Number(counts?.total_properties || 0),
        activeListings: Number(counts?.active_listings || 0),
        pendingVerification: Number(counts?.pending_verification || 0),
        suspendedListings: Number(counts?.suspended_listings || 0),
        draftListings: Number(counts?.draft_listings || 0),
        archivedListings: Number(counts?.archived_listings || 0),
        closedListings: Number(counts?.closed_listings || 0),
        totalPromotedActive: Number(counts?.total_promoted_active || 0),
        duplicateFlaggedCount: Number(counts?.duplicate_flagged_count || 0),
      },
      promotions: {
        totalPromotions: Number(promotionsSummary?.total_promotions || 0),
        activePromotions: Number(promotionsSummary?.active_promotions || 0),
        expiredPromotions: Number(promotionsSummary?.expired_promotions || 0),
        pendingPaymentPromotions: Number(promotionsSummary?.pending_payment_promotions || 0),
        activePremium: Number(promotionsSummary?.active_premium || 0),
        activeFeatured: Number(promotionsSummary?.active_featured || 0),
        activeBoosted: Number(promotionsSummary?.active_boosted || 0),
      },
      attribution: {
        totalEnquiries,
        totalApplications: totalApps,
        activeTenancies,
        conversionRate,
      },
      revenue: {
        totalBilled: Number(revenueSummary?.total_marketing_billed || 0),
        totalCollected: Number(revenueSummary?.total_marketing_collected || 0),
        totalDue: Number(revenueSummary?.total_marketing_due || 0),
        currency: 'INR',
      },
      topCities,
      timestamp: new Date().toISOString(),
    };
  }

  // =========================================================================
  // 2. LISTINGS OPERATIONS & MANAGEMENT
  // =========================================================================
  async listMarketplaceListings(user: AuthUser, query: MarketplaceListingsQueryDto): Promise<Paginated<any>> {
    const { page, perPage, offset } = pageParams(query.page, query.perPage, 25);
    const whereClauses: string[] = ['p.deleted_at IS NULL'];
    const params: any[] = [];

    // Role-based scoping: non-management users can only view their own properties
    if (!this.isManagement(user)) {
      whereClauses.push('p.listed_by_user_id = ?');
      params.push(user.id);
    }

    if (query.status && query.status !== 'ALL') {
      whereClauses.push('p.status = ?');
      params.push(query.status);
    }

    if (query.visibilityTier) {
      whereClauses.push('p.visibility_tier = ?');
      params.push(query.visibilityTier);
    }

    if (query.city) {
      whereClauses.push('p.city = ?');
      params.push(query.city);
    }

    if (query.propertyType) {
      whereClauses.push('p.property_type = ?');
      params.push(query.propertyType);
    }

    if (query.listingType) {
      whereClauses.push('p.listing_type = ?');
      params.push(query.listingType);
    }

    if (query.photoFilter === 'DEFICIENT') {
      whereClauses.push('(SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) < 4');
    } else if (query.photoFilter === 'COMPLETE') {
      whereClauses.push('(SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) >= 4');
    }

    if (query.verifiedOnly === true || query.verifiedOnly === 'true') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM property_verifications pv
        WHERE pv.property_id = p.id AND pv.status = 'VERIFIED'
      )`);
    }

    if (query.duplicateFlagged === true || query.duplicateFlagged === 'true') {
      whereClauses.push('p.duplicate_of_property_id IS NOT NULL');
    }

    if (query.q) {
      whereClauses.push('(p.title LIKE ? OR p.city LIKE ? OR p.locality LIKE ? OR p.address_line1 LIKE ? OR p.public_id LIKE ? OR u.full_name LIKE ?)');
      const term = `%${query.q}%`;
      params.push(term, term, term, term, term, term);
    }

    const where = whereClauses.join(' AND ');

    const rows = await this.db.query<any>(
      `SELECT p.id, p.public_id, p.slug, p.title, p.status, p.listing_type, p.property_type,
              p.bedrooms, p.bathrooms, p.carpet_area_sqft, p.rent_amount, p.sale_price,
              p.security_deposit, p.locality, p.city, p.state, p.pincode, p.address_line1,
              p.is_protected, p.is_featured, p.visibility_tier, p.featured_until, p.promoted_until,
              p.view_count, p.enquiry_count, p.quality_score, p.wizard_step, p.rejection_reason,
              p.suspended_at, p.suspension_reason, p.duplicate_of_property_id, p.created_at, p.updated_at,
              u.id AS lister_user_id, u.full_name AS lister_name, u.email AS lister_email, u.phone AS lister_phone,
              p.listed_by_role,
              (SELECT COUNT(*) FROM property_images pi WHERE pi.property_id = p.id) AS image_count,
              (SELECT COUNT(*) FROM applications app WHERE app.property_id = p.id) AS application_count,
              (SELECT COUNT(*) FROM enquiries enq WHERE enq.property_id = p.id) AS lead_count,
              (SELECT lp.promotion_code FROM listing_promotions lp WHERE lp.listing_id = p.id AND lp.status = 'ACTIVE' ORDER BY lp.id DESC LIMIT 1) AS active_promotion_code,
              (SELECT lp.ends_at FROM listing_promotions lp WHERE lp.listing_id = p.id AND lp.status = 'ACTIVE' ORDER BY lp.id DESC LIMIT 1) AS active_promotion_ends_at
         FROM properties p
         JOIN users u ON u.id = p.listed_by_user_id
        WHERE ${where}
        ORDER BY FIELD(p.visibility_tier, 'PREMIUM', 'FEATURED', 'PROMOTED', 'STANDARD'), p.is_featured DESC, p.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM properties p JOIN users u ON u.id = p.listed_by_user_id WHERE ${where}`,
      params,
    );

    const items = rows.map((r) => {
      const quality = this.checkListingQuality(r);
      return {
        id: r.id,
        publicId: r.public_id,
        slug: r.slug,
        title: r.title,
        status: r.status,
        listingType: r.listing_type,
        propertyType: r.property_type,
        bedrooms: r.bedrooms,
        bathrooms: r.bathrooms,
        carpetAreaSqft: r.carpet_area_sqft,
        rentAmount: r.rent_amount !== null ? Number(r.rent_amount) : null,
        salePrice: r.sale_price !== null ? Number(r.sale_price) : null,
        securityDeposit: r.security_deposit !== null ? Number(r.security_deposit) : null,
        locality: r.locality,
        city: r.city,
        state: r.state,
        pincode: r.pincode,
        addressLine1: r.address_line1,
        isProtected: Boolean(r.is_protected),
        isFeatured: Boolean(r.is_featured),
        visibilityTier: r.visibility_tier || 'STANDARD',
        featuredUntil: r.featured_until,
        promotedUntil: r.promoted_until,
        viewCount: Number(r.view_count || 0),
        enquiryCount: Number(r.enquiry_count || 0),
        imageCount: Number(r.image_count || 0),
        applicationCount: Number(r.application_count || 0),
        leadCount: Number(r.lead_count || 0),
        qualityStatus: quality.qualityStatus,
        qualityScore: quality.score,
        missingFields: quality.missingFields,
        duplicateFlagged: Boolean(r.duplicate_of_property_id),
        duplicateOfPropertyId: r.duplicate_of_property_id,
        rejectionReason: r.rejection_reason,
        suspendedAt: r.suspended_at,
        suspensionReason: r.suspension_reason,
        activePromotionCode: r.active_promotion_code,
        activePromotionEndsAt: r.active_promotion_ends_at,
        lister: {
          id: r.lister_user_id,
          name: r.lister_name,
          email: r.lister_email,
          phone: r.lister_phone,
          role: r.listed_by_role,
        },
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      };
    });

    return paginate(items, countRow?.total ?? 0, page, perPage);
  }

  async getListingDetail(user: AuthUser, id: number) {
    const property = await this.db.one<any>(
      `SELECT p.*,
              u.id AS lister_user_id, u.full_name AS lister_name, u.email AS lister_email, u.phone AS lister_phone
         FROM properties p
         JOIN users u ON u.id = p.listed_by_user_id
        WHERE p.id = ? AND p.deleted_at IS NULL`,
      [id],
    );
    if (!property) throw new NotFoundException('Property not found.');

    if (!this.isManagement(user) && property.listed_by_user_id !== user.id) {
      throw new ForbiddenException('You do not have permission to view this listing detail.');
    }

    const [images, verifications, promotions, leads, timeline] = await Promise.all([
      this.db.query('SELECT * FROM property_images WHERE property_id = ? ORDER BY is_cover DESC, sort_order ASC', [id]),
      this.db.query('SELECT * FROM property_verifications WHERE property_id = ?', [id]),
      this.db.query('SELECT * FROM listing_promotions WHERE listing_id = ? ORDER BY created_at DESC', [id]),
      this.db.query(`
        SELECT e.id, e.public_id, e.message, e.contact_pref, e.status, e.source, e.created_at,
               u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
          FROM enquiries e
          JOIN users u ON u.id = e.tenant_user_id
         WHERE e.property_id = ?
         ORDER BY e.created_at DESC
         LIMIT 20
      `, [id]),
      this.db.query('SELECT * FROM property_timeline WHERE property_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 30', [id]),
    ]);

    const quality = this.checkListingQuality(property);
    const duplicateCheck = await this.checkDuplicate(property.id);

    return {
      property: {
        ...property,
        rentAmount: property.rent_amount !== null ? Number(property.rent_amount) : null,
        salePrice: property.sale_price !== null ? Number(property.sale_price) : null,
        securityDeposit: property.security_deposit !== null ? Number(property.security_deposit) : null,
      },
      quality,
      duplicateCheck,
      images,
      verifications,
      promotions,
      leads,
      timeline,
    };
  }

  // =========================================================================
  // 3. MODERATION WORKFLOWS & MANAGEMENT AUTHORITY
  // =========================================================================
  async moderateListing(user: AuthUser, id: number, dto: ModerateListingDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can moderate marketplace listings.');
    }

    const property = await this.db.one<any>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [id]);
    if (!property) throw new NotFoundException('Property listing not found.');

    const decision = dto.decision;
    const reason = dto.reason?.trim() || null;

    switch (decision) {
      case ModerationDecision.APPROVE:
      case ModerationDecision.FORCE_PUBLISH: {
        await this.db.update('properties', id, {
          status: 'ACTIVE',
          published_at: property.published_at || new Date(),
          rejection_reason: null,
          suspended_at: null,
          suspension_reason: null,
          suspended_by: null,
          moderated_by: user.id,
          moderated_at: new Date(),
        });

        // Mark verification checks as verified
        await this.db.execute(
          `UPDATE property_verifications SET status = 'VERIFIED', verified_at = NOW(), reviewer_id = ?
            WHERE property_id = ? AND check_type IN ('KYC', 'OWNER_IDENTITY', 'ADDRESS')`,
          [user.id, id],
        );

        await this.db.insert('property_timeline', {
          property_id: id,
          event_code: 'PROPERTY_APPROVED',
          title: decision === ModerationDecision.FORCE_PUBLISH ? 'Listing force-published by Management' : 'Listing approved & published',
          detail: reason || 'Listing verified and made publicly visible.',
          actor_id: user.id,
        });

        await this.audit.record({
          actor: user,
          action: decision === ModerationDecision.FORCE_PUBLISH ? 'management.listing_override' : 'listing.approved',
          objectType: 'property',
          objectId: id,
          metadata: { decision, reason },
          req,
        });

        await this.notifications.send(property.listed_by_user_id, 'MAINTENANCE_UPDATE', {
          title: 'Listing Approved',
          body: `Your property listing "${property.title}" is now published and live on Odibrick.`,
          actionUrl: `/dashboard/properties`,
        });

        return { id, status: 'ACTIVE', message: 'Listing approved and published successfully.' };
      }

      case ModerationDecision.REJECT: {
        if (!reason) {
          throw new BadRequestException('A reason is mandatory when rejecting a listing.');
        }

        await this.db.update('properties', id, {
          status: 'REJECTED',
          rejection_reason: reason,
          moderated_by: user.id,
          moderated_at: new Date(),
        });

        await this.db.insert('property_timeline', {
          property_id: id,
          event_code: 'PROPERTY_REJECTED',
          title: 'Listing rejected by moderation',
          detail: reason,
          actor_id: user.id,
        });

        await this.audit.record({
          actor: user,
          action: 'listing.rejected',
          objectType: 'property',
          objectId: id,
          metadata: { reason },
          req,
        });

        await this.notifications.send(property.listed_by_user_id, 'MAINTENANCE_UPDATE', {
          title: 'Listing Rejected',
          body: `Your property listing "${property.title}" requires revisions: ${reason}`,
          actionUrl: `/dashboard/properties`,
        });

        return { id, status: 'REJECTED', message: 'Listing rejected with reason recorded.' };
      }

      case ModerationDecision.REQUEST_CORRECTION: {
        if (!reason) {
          throw new BadRequestException('A reason is required when requesting corrections.');
        }

        await this.db.update('properties', id, {
          status: 'DRAFT',
          rejection_reason: `Correction requested: ${reason}`,
          moderated_by: user.id,
          moderated_at: new Date(),
        });

        await this.db.insert('property_timeline', {
          property_id: id,
          event_code: 'CORRECTION_REQUESTED',
          title: 'Correction requested by moderation',
          detail: reason,
          actor_id: user.id,
        });

        await this.audit.record({
          actor: user,
          action: 'listing.correction_requested',
          objectType: 'property',
          objectId: id,
          metadata: { reason },
          req,
        });

        return { id, status: 'DRAFT', message: 'Listing reverted to draft for lister corrections.' };
      }

      case ModerationDecision.SUSPEND: {
        if (!reason) {
          throw new BadRequestException('A reason is mandatory when suspending a listing.');
        }

        await this.db.update('properties', id, {
          status: 'SUSPENDED',
          suspended_at: new Date(),
          suspension_reason: reason,
          suspended_by: user.id,
          is_featured: 0,
          visibility_tier: 'STANDARD',
        });

        // Suspend any active promotions
        await this.db.execute(
          `UPDATE listing_promotions SET status = 'SUSPENDED' WHERE listing_id = ? AND status = 'ACTIVE'`,
          [id],
        );

        await this.db.insert('property_timeline', {
          property_id: id,
          event_code: 'PROPERTY_SUSPENDED',
          title: 'Listing suspended by Management',
          detail: reason,
          actor_id: user.id,
        });

        await this.audit.record({
          actor: user,
          action: 'listing.suspended',
          objectType: 'property',
          objectId: id,
          metadata: { reason },
          req,
        });

        await this.notifications.send(property.listed_by_user_id, 'MAINTENANCE_UPDATE', {
          title: 'Listing Suspended',
          body: `Your property listing "${property.title}" has been suspended: ${reason}`,
          actionUrl: `/dashboard/properties`,
        });

        return { id, status: 'SUSPENDED', message: 'Listing suspended from marketplace.' };
      }

      case ModerationDecision.RESTORE: {
        await this.db.update('properties', id, {
          status: 'ACTIVE',
          suspended_at: null,
          suspension_reason: null,
          suspended_by: null,
        });

        // Restore promotions that were suspended and are still within validity window
        await this.db.execute(
          `UPDATE listing_promotions SET status = 'ACTIVE' WHERE listing_id = ? AND status = 'SUSPENDED' AND ends_at > NOW()`,
          [id],
        );

        // Check if there is an active promotion restored
        const activePromo = await this.db.one<any>(
          `SELECT * FROM listing_promotions WHERE listing_id = ? AND status = 'ACTIVE' AND ends_at > NOW() ORDER BY ends_at DESC LIMIT 1`,
          [id],
        );
        if (activePromo) {
          await this.db.update('properties', id, {
            is_featured: 1,
            visibility_tier: activePromo.visibility_tier,
            featured_until: activePromo.ends_at,
            promoted_until: activePromo.ends_at,
          });
        }

        await this.db.insert('property_timeline', {
          property_id: id,
          event_code: 'PROPERTY_RESTORED',
          title: 'Listing restored by Management',
          detail: reason || 'Listing restored to active status.',
          actor_id: user.id,
        });

        await this.audit.record({
          actor: user,
          action: 'listing.restored',
          objectType: 'property',
          objectId: id,
          metadata: { reason },
          req,
        });

        return { id, status: 'ACTIVE', message: 'Listing restored to active marketplace status.' };
      }

      case ModerationDecision.ARCHIVE: {
        await this.db.update('properties', id, {
          status: 'ARCHIVED',
          is_featured: 0,
          visibility_tier: 'STANDARD',
        });

        await this.db.execute(
          `UPDATE listing_promotions SET status = 'CANCELLED' WHERE listing_id = ? AND status IN ('ACTIVE','PENDING_PAYMENT')`,
          [id],
        );

        await this.audit.record({
          actor: user,
          action: 'listing.archived',
          objectType: 'property',
          objectId: id,
          metadata: { reason },
          req,
        });

        return { id, status: 'ARCHIVED', message: 'Listing archived.' };
      }

      default:
        throw new BadRequestException(`Unsupported moderation decision: ${decision}`);
    }
  }

  // =========================================================================
  // 4. DETERMINISTIC QUALITY & DUPLICATE CONTROL
  // =========================================================================
  checkListingQuality(property: any) {
    const missingFields: string[] = [];
    let score = 100;

    if (!property.title || property.title.length < 10) {
      missingFields.push('Descriptive title (min 10 characters)');
      score -= 15;
    }
    if (!property.description || property.description.length < 30) {
      missingFields.push('Detailed description (min 30 characters)');
      score -= 15;
    }
    if (!property.rent_amount && !property.sale_price) {
      missingFields.push('Valid rent or sale price');
      score -= 20;
    }
    if (!property.locality) {
      missingFields.push('Locality');
      score -= 10;
    }
    if (!property.city) {
      missingFields.push('City');
      score -= 10;
    }
    if (!property.pincode) {
      missingFields.push('Pincode');
      score -= 10;
    }
    if (!property.bedrooms && !['PLOT', 'SHOP', 'OFFICE', 'WAREHOUSE'].includes(property.property_type)) {
      missingFields.push('Bedrooms count');
      score -= 10;
    }
    const imageCount = property.image_count !== undefined
      ? Number(property.image_count)
      : Array.isArray(property.images)
      ? property.images.length
      : 0;

    if (imageCount < 3) {
      missingFields.push('At least 3 high-quality photographs');
      score -= 20;
    }

    score = Math.max(score, 0);
    const qualityStatus = score >= 80 ? 'COMPLETE' : score >= 50 ? 'REQUIRES_REVIEW' : 'INCOMPLETE';

    return {
      score,
      qualityStatus,
      missingFields,
    };
  }

  async checkDuplicate(propertyId: number) {
    const source = await this.db.one<any>('SELECT * FROM properties WHERE id = ?', [propertyId]);
    if (!source) return { isDuplicateSuspected: false, reasons: [] };

    const matches = await this.db.query<any>(
      `SELECT id, public_id, title, listed_by_user_id, status, address_line1, rent_amount, created_at
         FROM properties
        WHERE id != ?
          AND deleted_at IS NULL
          AND city = ?
          AND locality = ?
          AND property_type = ?
          AND address_line1 = ?
        LIMIT 3`,
      [
        propertyId,
        source.city,
        source.locality,
        source.property_type,
        source.address_line1,
      ],
    );

    if (matches.length > 0) {
      const match = matches[0];
      await this.db.update('properties', propertyId, {
        duplicate_of_property_id: match.id,
        duplicate_flagged_at: new Date(),
      });

      return {
        isDuplicateSuspected: true,
        matchedPropertyId: match.id,
        matchedPublicId: match.public_id,
        matchedTitle: match.title,
        reasons: [
          `Matches location (${source.locality}, ${source.city}), property type (${source.property_type}), bedrooms (${source.bedrooms}), and address/price.`,
        ],
      };
    }

    return {
      isDuplicateSuspected: false,
      reasons: [],
    };
  }

  // =========================================================================
  // 5. PACKAGES & PROMOTION MONETIZATION (PHASE 8 COMMERCIAL INTEGRATION)
  // =========================================================================
  async listPackages(audience?: string) {
    const params: any[] = [];
    let clause = 'WHERE is_active = 1';
    if (audience && audience !== 'ANY') {
      clause += " AND audience IN (?, 'ANY')";
      params.push(audience);
    }
    const rows = await this.db.query<any>(
      `SELECT id, code, name, tagline, audience, duration_days, price, tax_rate,
              ad_budget_included, features, channels, featured_slots, is_custom_quote, is_active
         FROM marketing_packages ${clause}
        ORDER BY sort_order ASC, price ASC`,
      params,
    );

    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      tagline: r.tagline,
      audience: r.audience,
      durationDays: Number(r.duration_days),
      price: Number(r.price),
      taxRate: Number(r.tax_rate),
      totalWithTax: Number((Number(r.price) * (1 + Number(r.tax_rate) / 100)).toFixed(2)),
      features: typeof r.features === 'string' ? JSON.parse(r.features) : r.features || [],
      channels: typeof r.channels === 'string' ? JSON.parse(r.channels) : r.channels || [],
      featuredSlots: Number(r.featured_slots || 0),
      isCustomQuote: Boolean(r.is_custom_quote),
    }));
  }

  async previewPackagePurchase(user: AuthUser, listingId: number, packageId: number) {
    const [property, pkg] = await Promise.all([
      this.db.one<any>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [listingId]),
      this.db.one<any>('SELECT * FROM marketing_packages WHERE id = ? AND is_active = 1', [packageId]),
    ]);

    if (!property) throw new NotFoundException('Property listing not found.');
    if (!pkg) throw new NotFoundException('Marketing package not found or inactive.');

    const price = Number(pkg.price);
    const taxRate = Number(pkg.tax_rate || 18.0);
    const taxAmount = Number(((price * taxRate) / 100).toFixed(2));
    const totalAmount = Number((price + taxAmount).toFixed(2));
    const durationDays = Number(pkg.duration_days || 30);

    const visibilityTier = pkg.code.includes('PREMIUM') || pkg.code.includes('BUILDER')
      ? VisibilityTier.PREMIUM
      : pkg.code.includes('BOOST')
      ? VisibilityTier.PROMOTED
      : VisibilityTier.FEATURED;

    return {
      listingId,
      listingTitle: property.title,
      packageId,
      packageCode: pkg.code,
      packageName: pkg.name,
      visibilityTier,
      durationDays,
      price,
      taxRate,
      taxAmount,
      totalAmount,
      currency: 'INR',
      simulatedStartsAt: new Date().toISOString(),
      simulatedEndsAt: new Date(Date.now() + durationDays * 86400000).toISOString(),
      isSimulation: true,
    };
  }

  async purchasePackage(user: AuthUser, listingId: number, packageId: number, req?: Request) {
    const [property, pkg] = await Promise.all([
      this.db.one<any>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [listingId]),
      this.db.one<any>('SELECT * FROM marketing_packages WHERE id = ? AND is_active = 1', [packageId]),
    ]);

    if (!property) throw new NotFoundException('Property listing not found.');
    if (!pkg) throw new NotFoundException('Marketing package not found or inactive.');

    if (!this.isManagement(user) && property.listed_by_user_id !== user.id) {
      throw new ForbiddenException('You can only purchase marketing promotions for your own listings.');
    }

    const price = Number(pkg.price);
    const taxRate = Number(pkg.tax_rate || 18.0);
    const taxAmount = Number(((price * taxRate) / 100).toFixed(2));
    const totalAmount = Number((price + taxAmount).toFixed(2));
    const durationDays = Number(pkg.duration_days || 30);

    const visibilityTier = pkg.code.includes('PREMIUM') || pkg.code.includes('BUILDER')
      ? 'PREMIUM'
      : pkg.code.includes('BOOST')
      ? 'PROMOTED'
      : 'FEATURED';

    // 1. Create or retrieve commercial obligation (idempotent via Phase 8 CommercialOperationsService)
    // We use a composite source reference or marketing order sequence
    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM listing_promotions');
    const promoSeq = (seq?.c || 0) + 1;
    const promotionCode = formatReference('PRM', promoSeq);

    // Create commercial obligation
    const obligation = await this.commercial.createCommercialObligation(user, {
      category: CommercialCategory.MARKETING_PACKAGE,
      sourceType: 'MARKETING_ORDER',
      sourceId: promoSeq * 1000 + property.id,
      baseAmount: price,
      payerUserId: user.id,
      propertyId: property.id,
      customNotes: `Marketplace promotion: ${pkg.name} (${visibilityTier}) for "${property.title}"`,
    });

    // 2. Automatically approve obligation for collection so payment obligation is created
    const adminActor: AuthUser = this.isManagement(user)
      ? user
      : ({ id: 1, roles: ['SUPER_ADMIN'], permissions: ['commercial.manage'] } as any);
    const approved = await this.commercial.approveObligation(adminActor, obligation.id, {});
    const paymentId = approved.paymentId;

    // 3. Create listing promotion record in PENDING_PAYMENT status
    const publicId = newPublicId();
    const startsAt = new Date();
    const endsAt = new Date(Date.now() + durationDays * 86400000);

    const promoInsert = await this.db.insert('listing_promotions', {
      public_id: publicId,
      promotion_code: promotionCode,
      listing_id: property.id,
      package_id: pkg.id,
      buyer_user_id: user.id,
      visibility_tier: visibilityTier,
      commercial_obligation_id: obligation.id,
      payment_id: paymentId,
      starts_at: startsAt,
      ends_at: endsAt,
      status: 'PENDING_PAYMENT',
      activation_source: 'PAID_PACKAGE',
      created_by: user.id,
      notes: `${pkg.name} purchased by ${user.fullName}`,
    });

    await this.audit.record({
      actor: user,
      action: 'package.purchased',
      objectType: 'listing_promotion',
      objectId: promoInsert,
      metadata: { packageCode: pkg.code, listingId: property.id, totalAmount, paymentId },
      req,
    });

    return {
      promotionId: promoInsert,
      promotionCode,
      packageId: pkg.id,
      packageName: pkg.name,
      visibilityTier,
      durationDays,
      totalAmount,
      obligationNumber: obligation.obligationNumber,
      paymentId,
      status: 'PENDING_PAYMENT',
      message: 'Promotion order placed. Settle payment to activate visibility.',
    };
  }

  /**
   * Activate promotion upon payment settlement
   */
  async activatePromotion(paymentId: number, req?: Request) {
    const promotion = await this.db.one<any>(
      'SELECT * FROM listing_promotions WHERE payment_id = ?',
      [paymentId],
    );
    if (!promotion) return null;

    if (promotion.status === 'ACTIVE') {
      return { id: promotion.id, status: 'ACTIVE', message: 'Promotion is already active.' };
    }

    const pkg = await this.db.one<any>('SELECT * FROM marketing_packages WHERE id = ?', [promotion.package_id]);
    const durationDays = Number(pkg?.duration_days || 30);
    const startsAt = new Date();
    const endsAt = new Date(Date.now() + durationDays * 86400000);

    await this.db.update('listing_promotions', promotion.id, {
      status: 'ACTIVE',
      starts_at: startsAt,
      ends_at: endsAt,
    });

    // Update property visibility
    await this.db.update('properties', promotion.listing_id, {
      is_featured: 1,
      visibility_tier: promotion.visibility_tier,
      featured_until: endsAt,
      promoted_until: endsAt,
    });

    await this.db.insert('property_timeline', {
      property_id: promotion.listing_id,
      event_code: 'PROMOTION_ACTIVATED',
      title: `Marketplace Promotion Activated (${promotion.visibility_tier})`,
      detail: `Promotion active until ${endsAt.toISOString().slice(0, 10)}.`,
      actor_id: promotion.buyer_user_id,
    });

    // Try generating invoice via InvoicesService
    try {
      const payerUser = await this.db.one<any>('SELECT * FROM users WHERE id = ?', [promotion.buyer_user_id]);
      if (payerUser) {
        const inv = await this.invoices.generateInvoiceForPayment(
          { id: payerUser.id, roles: ['ADMIN'], permissions: ['invoice.generate'] } as any,
          paymentId,
          { placeOfSupply: 'Maharashtra' },
          req,
        );
        if (inv?.invoiceId) {
          await this.db.update('listing_promotions', promotion.id, { invoice_id: inv.invoiceId });
        }
      }
    } catch {
      // Non-blocking invoice creation
    }

    await this.audit.record({
      actor: { id: promotion.buyer_user_id, roles: ['SYSTEM'] } as any,
      action: 'listing.promotion_started',
      objectType: 'listing_promotion',
      objectId: promotion.id,
      metadata: { visibilityTier: promotion.visibility_tier, endsAt },
      req,
    });

    await this.notifications.send(promotion.buyer_user_id, 'MAINTENANCE_UPDATE', {
      title: 'Promotion Live!',
      body: `Your listing promotion (${promotion.visibility_tier}) is now active on Odibrick.`,
      actionUrl: `/dashboard/properties`,
    });

    return { id: promotion.id, status: 'ACTIVE', startsAt, endsAt, visibilityTier: promotion.visibility_tier };
  }

  async listPromotions(user: AuthUser, listingId?: number, status?: string) {
    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (!this.isManagement(user)) {
      whereClauses.push('lp.buyer_user_id = ?');
      params.push(user.id);
    }

    if (listingId) {
      whereClauses.push('lp.listing_id = ?');
      params.push(listingId);
    }

    if (status) {
      whereClauses.push('lp.status = ?');
      params.push(status);
    }

    const where = whereClauses.join(' AND ');

    return this.db.query<any>(
      `SELECT lp.*,
              p.title AS property_title, p.city, p.locality, p.status AS property_status,
              mp.name AS package_name, mp.code AS package_code,
              u.full_name AS buyer_name, u.email AS buyer_email,
              pay.status AS payment_status, pay.total_amount AS payment_amount,
              inv.invoice_number
         FROM listing_promotions lp
         JOIN properties p ON p.id = lp.listing_id
         LEFT JOIN marketing_packages mp ON mp.id = lp.package_id
         JOIN users u ON u.id = lp.buyer_user_id
         LEFT JOIN payments pay ON pay.id = lp.payment_id
         LEFT JOIN invoices inv ON inv.id = lp.invoice_id
        WHERE ${where}
        ORDER BY lp.created_at DESC`,
      params,
    );
  }

  // =========================================================================
  // 6. PROMOTION EXPIRY & AUTOMATED CLEANUP
  // =========================================================================
  async processExpiredPromotions() {
    const expiredList = await this.db.query<any>(
      `SELECT * FROM listing_promotions WHERE status = 'ACTIVE' AND ends_at <= NOW()`,
    );

    const expiredIds: number[] = [];

    for (const promo of expiredList) {
      await this.db.update('listing_promotions', promo.id, { status: 'EXPIRED' });
      expiredIds.push(promo.id);

      // Check if property has any other active promotion
      const remainingActive = await this.db.one<any>(
        `SELECT * FROM listing_promotions WHERE listing_id = ? AND status = 'ACTIVE' AND ends_at > NOW() ORDER BY ends_at DESC LIMIT 1`,
        [promo.listing_id],
      );

      if (remainingActive) {
        await this.db.update('properties', promo.listing_id, {
          is_featured: 1,
          visibility_tier: remainingActive.visibility_tier,
          featured_until: remainingActive.ends_at,
          promoted_until: remainingActive.ends_at,
        });
      } else {
        await this.db.update('properties', promo.listing_id, {
          is_featured: 0,
          visibility_tier: 'STANDARD',
          featured_until: null,
          promoted_until: null,
        });
      }

      await this.audit.record({
        actor: { id: 1, roles: ['SYSTEM'] } as any,
        action: 'listing.promotion_expired',
        objectType: 'listing_promotion',
        objectId: promo.id,
      });

      await this.notifications.send(promo.buyer_user_id, 'MAINTENANCE_UPDATE', {
        title: 'Promotion Expired',
        body: `Your visibility promotion for property #${promo.listing_id} has expired. Renew to maintain high exposure.`,
        actionUrl: `/dashboard/properties`,
      });
    }

    return {
      processedCount: expiredIds.length,
      expiredPromotionIds: expiredIds,
    };
  }

  // =========================================================================
  // 7. MANAGEMENT PROMOTION OVERRIDE
  // =========================================================================
  async managementOverridePromotion(
    user: AuthUser,
    listingId: number,
    dto: ManagementPromotionOverrideDto,
    req?: Request,
  ) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can perform promotion overrides.');
    }

    const property = await this.db.one<any>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [listingId]);
    if (!property) throw new NotFoundException('Property listing not found.');

    const durationDays = dto.durationDays || 30;
    const tier = dto.visibilityTier || (dto.action === PromotionOverrideAction.PREMIUM ? 'PREMIUM' : dto.action === PromotionOverrideAction.BOOST ? 'PROMOTED' : 'FEATURED');

    if (dto.action === PromotionOverrideAction.REMOVE_PROMOTION) {
      await this.db.update('properties', listingId, {
        is_featured: 0,
        visibility_tier: 'STANDARD',
        featured_until: null,
        promoted_until: null,
      });

      await this.db.execute(
        `UPDATE listing_promotions SET status = 'CANCELLED' WHERE listing_id = ? AND status = 'ACTIVE'`,
        [listingId],
      );

      await this.audit.record({
        actor: user,
        action: 'management.listing_override',
        objectType: 'property',
        objectId: listingId,
        metadata: { action: 'REMOVE_PROMOTION', reason: dto.reason },
        req,
      });

      return { listingId, visibilityTier: 'STANDARD', isFeatured: false, message: 'Promotions revoked by Management.' };
    }

    const startsAt = new Date();
    const endsAt = new Date(Date.now() + durationDays * 86400000);

    // Create management override promotion record
    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM listing_promotions');
    const promotionCode = formatReference('PRM-MGT', (seq?.c || 0) + 1);

    await this.db.insert('listing_promotions', {
      public_id: newPublicId(),
      promotion_code: promotionCode,
      listing_id: listingId,
      buyer_user_id: user.id,
      visibility_tier: tier,
      starts_at: startsAt,
      ends_at: endsAt,
      status: 'ACTIVE',
      activation_source: 'MANAGEMENT_OVERRIDE',
      created_by: user.id,
      notes: dto.reason || `Management override granted by ${user.fullName}`,
    });

    await this.db.update('properties', listingId, {
      is_featured: 1,
      visibility_tier: tier,
      featured_until: endsAt,
      promoted_until: endsAt,
    });

    await this.audit.record({
      actor: user,
      action: 'management.listing_override',
      objectType: 'property',
      objectId: listingId,
      metadata: { action: dto.action, visibilityTier: tier, durationDays, reason: dto.reason },
      req,
    });

    return {
      listingId,
      visibilityTier: tier,
      isFeatured: true,
      endsAt,
      message: `Management granted ${tier} visibility for ${durationDays} days.`,
    };
  }

  // =========================================================================
  // 8. CUSTOMER MARKETPLACE EXPERIENCE (SAVED, ENQUIRIES & DASHBOARD)
  // =========================================================================
  async listCustomerSavedProperties(user: AuthUser) {
    const rows = await this.db.query<any>(
      `SELECT p.id, p.public_id, p.slug, p.title, p.property_type, p.bedrooms, p.bathrooms,
              p.carpet_area_sqft, p.rent_amount, p.sale_price, p.security_deposit,
              p.locality, p.city, p.state, p.status, p.is_featured, p.visibility_tier,
              sp.note, sp.created_at AS saved_at,
              (SELECT pi.storage_key FROM property_images pi WHERE pi.property_id = p.id ORDER BY pi.is_cover DESC, pi.sort_order ASC LIMIT 1) AS cover_key
         FROM saved_properties sp
         JOIN properties p ON p.id = sp.property_id
        WHERE sp.user_id = ? AND p.deleted_at IS NULL
        ORDER BY sp.created_at DESC`,
      [user.id],
    );

    return rows.map((r) => ({
      id: r.id,
      publicId: r.public_id,
      slug: r.slug,
      title: r.title,
      propertyType: r.property_type,
      bedrooms: r.bedrooms,
      bathrooms: r.bathrooms,
      carpetAreaSqft: r.carpet_area_sqft,
      rentAmount: r.rent_amount !== null ? Number(r.rent_amount) : null,
      salePrice: r.sale_price !== null ? Number(r.sale_price) : null,
      securityDeposit: r.security_deposit !== null ? Number(r.security_deposit) : null,
      locality: r.locality,
      city: r.city,
      state: r.state,
      status: r.status,
      isFeatured: Boolean(r.is_featured),
      visibilityTier: r.visibility_tier || 'STANDARD',
      coverKey: r.cover_key,
      note: r.note,
      savedAt: r.saved_at,
    }));
  }

  async toggleCustomerSavedProperty(user: AuthUser, propertyId: number, note?: string) {
    const property = await this.db.one<any>('SELECT id FROM properties WHERE id = ? AND deleted_at IS NULL', [propertyId]);
    if (!property) throw new NotFoundException('Property not found.');

    const existing = await this.db.one<any>(
      'SELECT property_id FROM saved_properties WHERE user_id = ? AND property_id = ?',
      [user.id, propertyId],
    );

    if (existing) {
      await this.db.execute('DELETE FROM saved_properties WHERE user_id = ? AND property_id = ?', [user.id, propertyId]);
      await this.audit.record({ actor: user, action: 'property.unsaved', objectType: 'property', objectId: propertyId });
      return { saved: false, propertyId, message: 'Property removed from saved listings.' };
    } else {
      await this.db.insert('saved_properties', {
        user_id: user.id,
        property_id: propertyId,
        note: note || null,
      });
      await this.audit.record({ actor: user, action: 'property.saved', objectType: 'property', objectId: propertyId });
      return { saved: true, propertyId, message: 'Property saved successfully.' };
    }
  }

  async listCustomerEnquiries(user: AuthUser) {
    const rows = await this.db.query<any>(
      `SELECT e.id, e.public_id, e.message, e.contact_pref, e.status, e.source, e.created_at, e.responded_at,
              e.acknowledged_at, e.contacted_at, e.qualified_at, e.converted_at, e.next_follow_up_at,
              e.property_id, p.title AS property_title, p.slug AS property_slug, p.locality, p.city,
              p.rent_amount, p.security_deposit,
              (SELECT pi.storage_key FROM property_images pi WHERE pi.property_id = p.id ORDER BY pi.is_cover DESC LIMIT 1) AS cover_key,
              owner.id AS lister_user_id, owner.full_name AS lister_name,
              assigned.id AS assigned_user_id, assigned.full_name AS assigned_user_name,
              app.id AS application_id, app.status AS application_status,
              t.id AS tenancy_id, t.stage AS tenancy_stage
         FROM enquiries e
         JOIN properties p ON p.id = e.property_id
         JOIN users owner ON owner.id = p.listed_by_user_id
         LEFT JOIN users assigned ON assigned.id = e.assigned_user_id
         LEFT JOIN applications app ON app.enquiry_id = e.id
         LEFT JOIN tenancies t ON t.application_id = app.id
        WHERE e.tenant_user_id = ?
        ORDER BY e.created_at DESC`,
      [user.id],
    );

    return rows.map((r) => ({
      id: r.id,
      publicId: r.public_id,
      message: r.message,
      contactPref: r.contact_pref,
      status: r.status,
      source: r.source,
      property: {
        id: r.property_id,
        title: r.property_title,
        slug: r.property_slug,
        locality: r.locality,
        city: r.city,
        rentAmount: r.rent_amount !== null ? Number(r.rent_amount) : null,
        securityDeposit: r.security_deposit !== null ? Number(r.security_deposit) : null,
        coverKey: r.cover_key,
      },
      contactPerson: {
        name: r.assigned_user_name || r.lister_name,
      },
      application: r.application_id ? { id: r.application_id, status: r.application_status } : null,
      tenancy: r.tenancy_id ? { id: r.tenancy_id, stage: r.tenancy_stage } : null,
      createdAt: r.created_at,
      respondedAt: r.responded_at,
      acknowledgedAt: r.acknowledged_at,
      contactedAt: r.contacted_at,
      qualifiedAt: r.qualified_at,
      convertedAt: r.converted_at,
      nextFollowUpAt: r.next_follow_up_at,
    }));
  }

  async getCustomerEnquiryDetail(user: AuthUser, enquiryId: number) {
    const row = await this.db.one<any>(
      `SELECT e.*, p.title AS property_title, p.slug AS property_slug, p.locality, p.city,
              p.rent_amount, p.security_deposit,
              owner.full_name AS lister_name,
              assigned.full_name AS assigned_user_name,
              app.id AS application_id, app.status AS application_status,
              t.id AS tenancy_id, t.stage AS tenancy_stage
         FROM enquiries e
         JOIN properties p ON p.id = e.property_id
         JOIN users owner ON owner.id = p.listed_by_user_id
         LEFT JOIN users assigned ON assigned.id = e.assigned_user_id
         LEFT JOIN applications app ON app.enquiry_id = e.id
         LEFT JOIN tenancies t ON t.application_id = app.id
        WHERE e.id = ?`,
      [enquiryId],
    );

    if (!row) throw new NotFoundException('Enquiry not found.');
    if (row.tenant_user_id !== user.id && !this.isManagement(user)) {
      throw new ForbiddenException('You are not authorized to view this enquiry.');
    }

    return {
      id: row.id,
      publicId: row.public_id,
      message: row.message,
      contactPref: row.contact_pref,
      status: row.status,
      source: row.source,
      property: {
        id: row.property_id,
        title: row.property_title,
        slug: row.property_slug,
        locality: row.locality,
        city: row.city,
        rentAmount: row.rent_amount !== null ? Number(row.rent_amount) : null,
        securityDeposit: row.security_deposit !== null ? Number(row.security_deposit) : null,
      },
      contactPerson: {
        name: row.assigned_user_name || row.lister_name,
      },
      application: row.application_id ? { id: row.application_id, status: row.application_status } : null,
      tenancy: row.tenancy_id ? { id: row.tenancy_id, stage: row.tenancy_stage } : null,
      createdAt: row.created_at,
      respondedAt: row.responded_at,
      acknowledgedAt: row.acknowledged_at,
      contactedAt: row.contacted_at,
      qualifiedAt: row.qualified_at,
      convertedAt: row.converted_at,
      nextFollowUpAt: row.next_follow_up_at,
    };
  }

  async getCustomerDashboard(user: AuthUser) {
    const [savedList, enquiriesList, applicationsList, notificationsCount] = await Promise.all([
      this.listCustomerSavedProperties(user),
      this.listCustomerEnquiries(user),
      this.db.query<any>(
        `SELECT a.id, a.public_id, a.status, a.move_in_date, a.offered_rent, a.created_at,
                p.id AS property_id, p.title AS property_title, p.city, p.locality
           FROM applications a
           JOIN properties p ON p.id = a.property_id
          WHERE a.tenant_user_id = ?
          ORDER BY a.created_at DESC LIMIT 5`,
        [user.id],
      ),
      this.db.one<any>(
        "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND read_at IS NULL AND channel = 'IN_APP'",
        [user.id],
      ),
    ]);

    const activeEnquiries = enquiriesList.filter((e) => !['CLOSED', 'LOST', 'SPAM'].includes(e.status));

    return {
      savedCount: savedList.length,
      savedProperties: savedList.slice(0, 4),
      activeEnquiriesCount: activeEnquiries.length,
      recentEnquiries: enquiriesList.slice(0, 5),
      applicationsCount: applicationsList.length,
      recentApplications: applicationsList,
      unreadNotifications: Number(notificationsCount?.c || 0),
      timestamp: new Date().toISOString(),
    };
  }

  // =========================================================================
  // 9. PROVIDER / OWNER / AGENT LEAD MANAGEMENT INBOX
  // =========================================================================
  async listProviderLeads(user: AuthUser, query: ProviderLeadsQueryDto): Promise<Paginated<any>> {
    const { page, perPage, offset } = pageParams(query.page, query.perPage, 25);
    const whereClauses: string[] = [
      '(p.listed_by_user_id = ? OR e.assigned_user_id = ?)',
      'p.deleted_at IS NULL',
    ];
    const params: any[] = [user.id, user.id];

    if (query.status && query.status !== 'ALL') {
      whereClauses.push('e.status = ?');
      params.push(query.status);
    }

    if (query.propertyId) {
      whereClauses.push('e.property_id = ?');
      params.push(query.propertyId);
    }

    if (query.source) {
      whereClauses.push('e.source = ?');
      params.push(query.source);
    }

    if (query.staleOnly === true || query.staleOnly === 'true') {
      whereClauses.push(`(
        (e.status = 'NEW' AND e.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR
        (e.status = 'ASSIGNED' AND e.assigned_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)) OR
        (e.status = 'QUALIFIED' AND e.next_follow_up_at < NOW())
      )`);
    }

    if (query.q) {
      whereClauses.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR p.title LIKE ? OR e.message LIKE ?)');
      const term = `%${query.q}%`;
      params.push(term, term, term, term, term);
    }

    const where = whereClauses.join(' AND ');

    const rows = await this.db.query<any>(
      `SELECT e.id, e.public_id, e.message, e.contact_pref, e.status, e.source,
              e.created_at, e.responded_at, e.acknowledged_at, e.contacted_at, e.qualified_at,
              e.converted_at, e.lost_at, e.lost_reason, e.next_follow_up_at, e.last_contacted_at,
              e.follow_up_notes, e.is_spam, e.is_duplicate,
              e.property_id, p.title AS property_title, p.city, p.locality, p.rent_amount,
              p.is_featured, p.visibility_tier,
              u.id AS customer_id, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS customer_kyc,
              (SELECT COUNT(*) FROM lead_follow_ups lfu WHERE lfu.enquiry_id = e.id) AS follow_up_count,
              app.id AS application_id, app.status AS application_status,
              t.id AS tenancy_id, t.stage AS tenancy_stage,
              lp.promotion_code
         FROM enquiries e
         JOIN properties p ON p.id = e.property_id
         JOIN users u ON u.id = e.tenant_user_id
         LEFT JOIN applications app ON app.enquiry_id = e.id
         LEFT JOIN tenancies t ON t.application_id = app.id
         LEFT JOIN listing_promotions lp ON lp.id = e.promotion_id
        WHERE ${where}
        ORDER BY FIELD(e.status, 'NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST', 'CLOSED', 'SPAM'), e.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM enquiries e
         JOIN properties p ON p.id = e.property_id
         JOIN users u ON u.id = e.tenant_user_id
        WHERE ${where}`,
      params,
    );

    const now = new Date();
    const items = rows.map((r) => {
      const createdAt = new Date(r.created_at);
      const isStale = (
        (r.status === 'NEW' && now.getTime() - createdAt.getTime() > 24 * 3600 * 1000) ||
        (r.status === 'ASSIGNED' && r.assigned_at && now.getTime() - new Date(r.assigned_at).getTime() > 48 * 3600 * 1000) ||
        (r.status === 'QUALIFIED' && r.next_follow_up_at && new Date(r.next_follow_up_at) < now)
      );

      return {
        id: r.id,
        publicId: r.public_id,
        status: r.status,
        source: r.source || 'ORGANIC',
        promotionCode: r.promotion_code,
        message: r.message,
        contactPref: r.contact_pref,
        isStale,
        isSpam: Boolean(r.is_spam),
        isDuplicate: Boolean(r.is_duplicate),
        followUpCount: Number(r.follow_up_count || 0),
        property: {
          id: r.property_id,
          title: r.property_title,
          city: r.city,
          locality: r.locality,
          rentAmount: r.rent_amount !== null ? Number(r.rent_amount) : null,
          visibilityTier: r.visibility_tier || 'STANDARD',
          isFeatured: Boolean(r.is_featured),
        },
        customer: {
          id: r.customer_id,
          name: r.customer_name,
          email: r.customer_email,
          phone: r.customer_phone,
          kycStatus: r.customer_kyc || 'NOT_STARTED',
        },
        application: r.application_id ? { id: r.application_id, status: r.application_status } : null,
        tenancy: r.tenancy_id ? { id: r.tenancy_id, stage: r.tenancy_stage } : null,
        createdAt: r.created_at,
        acknowledgedAt: r.acknowledged_at,
        contactedAt: r.contacted_at,
        qualifiedAt: r.qualified_at,
        convertedAt: r.converted_at,
        lostAt: r.lost_at,
        lostReason: r.lost_reason,
        lastContactedAt: r.last_contacted_at,
        nextFollowUpAt: r.next_follow_up_at,
        followUpNotes: r.follow_up_notes,
      };
    });

    return paginate(items, countRow?.total ?? 0, page, perPage);
  }

  async listMarketplaceLeads(user: AuthUser, query: MarketplaceLeadsQueryDto): Promise<Paginated<any>> {
    if (this.isManagement(user)) {
      return this.listAdminLeads(user, query as any);
    }
    return this.listProviderLeads(user, query as any);
  }

  async getProviderLeadsAnalytics(user: AuthUser) {
    const [counts, responseTimes] = await Promise.all([
      this.db.one<any>(
        `SELECT
           COUNT(e.id) AS total_leads,
           SUM(IF(e.status = 'NEW', 1, 0)) AS new_leads,
           SUM(IF(e.status = 'ASSIGNED', 1, 0)) AS assigned_leads,
           SUM(IF(e.status = 'ACKNOWLEDGED', 1, 0)) AS acknowledged_leads,
           SUM(IF(e.status = 'CONTACTED', 1, 0)) AS contacted_leads,
           SUM(IF(e.status = 'QUALIFIED', 1, 0)) AS qualified_leads,
           SUM(IF(e.status = 'CONVERTED' OR e.converted_at IS NOT NULL, 1, 0)) AS converted_leads,
           SUM(IF(e.status = 'LOST', 1, 0)) AS lost_leads,
           SUM(IF(e.status = 'CLOSED', 1, 0)) AS closed_leads,
           SUM(IF(e.status = 'SPAM', 1, 0)) AS spam_leads,
           SUM(IF(
             (e.status = 'NEW' AND e.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR
             (e.status = 'ASSIGNED' AND e.assigned_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)) OR
             (e.status = 'QUALIFIED' AND e.next_follow_up_at < NOW()), 1, 0
           )) AS stale_leads_count
          FROM enquiries e
          JOIN properties p ON p.id = e.property_id
         WHERE (p.listed_by_user_id = ? OR e.assigned_user_id = ?) AND p.deleted_at IS NULL`,
        [user.id, user.id],
      ),
      this.db.one<any>(
        `SELECT
           AVG(TIMESTAMPDIFF(MINUTE, e.created_at, e.acknowledged_at)) AS avg_ack_mins,
           AVG(TIMESTAMPDIFF(MINUTE, e.created_at, e.contacted_at)) AS avg_contact_mins
          FROM enquiries e
          JOIN properties p ON p.id = e.property_id
         WHERE (p.listed_by_user_id = ? OR e.assigned_user_id = ?)
           AND e.acknowledged_at IS NOT NULL`,
        [user.id, user.id],
      ),
    ]);

    const totalLeads = Number(counts?.total_leads || 0);
    const convertedLeads = Number(counts?.converted_leads || 0);
    const qualifiedLeads = Number(counts?.qualified_leads || 0);
    const conversionRate = totalLeads > 0 ? Number(((convertedLeads / totalLeads) * 100).toFixed(2)) : 0;

    return {
      pipeline: {
        totalLeads,
        newLeads: Number(counts?.new_leads || 0),
        assignedLeads: Number(counts?.assigned_leads || 0),
        acknowledgedLeads: Number(counts?.acknowledged_leads || 0),
        contactedLeads: Number(counts?.contacted_leads || 0),
        qualifiedLeads: Number(counts?.qualified_leads || 0),
        convertedLeads,
        lostLeads: Number(counts?.lost_leads || 0),
        closedLeads: Number(counts?.closed_leads || 0),
        spamLeads: Number(counts?.spam_leads || 0),
        staleLeadsCount: Number(counts?.stale_leads_count || 0),
      },
      performance: {
        conversionRate,
        avgAckMinutes: responseTimes?.avg_ack_mins ? Math.round(Number(responseTimes.avg_ack_mins)) : null,
        avgContactMinutes: responseTimes?.avg_contact_mins ? Math.round(Number(responseTimes.avg_contact_mins)) : null,
      },
    };
  }

  async getProviderLeadDetail(user: AuthUser, leadId: number) {
    const lead = await this.db.one<any>(
      `SELECT e.*, p.title AS property_title, p.locality, p.city, p.rent_amount, p.security_deposit,
              p.listed_by_user_id,
              u.id AS customer_user_id, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              up.occupation, up.employer,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS customer_kyc,
              app.id AS application_id, app.status AS application_status,
              t.id AS tenancy_id, t.stage AS tenancy_stage,
              lp.promotion_code
         FROM enquiries e
         JOIN properties p ON p.id = e.property_id
         JOIN users u ON u.id = e.tenant_user_id
         LEFT JOIN user_profiles up ON up.user_id = u.id
         LEFT JOIN applications app ON app.enquiry_id = e.id
         LEFT JOIN tenancies t ON t.application_id = app.id
         LEFT JOIN listing_promotions lp ON lp.id = e.promotion_id
        WHERE e.id = ? AND p.deleted_at IS NULL`,
      [leadId],
    );

    if (!lead) throw new NotFoundException('Lead not found.');

    const isAuthorized = (
      this.isManagement(user) ||
      lead.listed_by_user_id === user.id ||
      lead.assigned_user_id === user.id
    );

    if (!isAuthorized) {
      throw new ForbiddenException('You do not have access to this lead record.');
    }

    const followUps = await this.db.query<any>(
      `SELECT lfu.*, u.full_name AS author_name
         FROM lead_follow_ups lfu
         JOIN users u ON u.id = lfu.author_id
        WHERE lfu.enquiry_id = ?
        ORDER BY lfu.created_at DESC`,
      [leadId],
    );

    return {
      lead: {
        id: lead.id,
        publicId: lead.public_id,
        status: lead.status,
        source: lead.source || 'ORGANIC',
        promotionCode: lead.promotion_code,
        message: lead.message,
        contactPref: lead.contact_pref,
        isSpam: Boolean(lead.is_spam),
        isDuplicate: Boolean(lead.is_duplicate),
        createdAt: lead.created_at,
        acknowledgedAt: lead.acknowledged_at,
        contactedAt: lead.contacted_at,
        qualifiedAt: lead.qualified_at,
        convertedAt: lead.converted_at,
        lostAt: lead.lost_at,
        lostReason: lead.lost_reason,
        lastContactedAt: lead.last_contacted_at,
        nextFollowUpAt: lead.next_follow_up_at,
        followUpNotes: lead.follow_up_notes,
      },
      property: {
        id: lead.property_id,
        title: lead.property_title,
        city: lead.city,
        locality: lead.locality,
        rentAmount: lead.rent_amount !== null ? Number(lead.rent_amount) : null,
        securityDeposit: lead.security_deposit !== null ? Number(lead.security_deposit) : null,
      },
      customer: {
        id: lead.customer_user_id,
        name: lead.customer_name,
        email: lead.customer_email,
        phone: lead.customer_phone,
        occupation: lead.occupation,
        employer: lead.employer,
        kycStatus: lead.customer_kyc || 'NOT_STARTED',
      },
      application: lead.application_id ? { id: lead.application_id, status: lead.application_status } : null,
      tenancy: lead.tenancy_id ? { id: lead.tenancy_id, stage: lead.tenancy_stage } : null,
      followUps,
    };
  }

  // =========================================================================
  // 10. LEAD LIFECYCLE MUTATIONS
  // =========================================================================
  async acknowledgeLead(user: AuthUser, leadId: number, req?: Request) {
    const detail = await this.getProviderLeadDetail(user, leadId);
    const now = new Date();

    await this.db.update('enquiries', leadId, {
      status: 'ACKNOWLEDGED',
      acknowledged_at: now,
      responded_at: detail.lead.acknowledgedAt || now,
    });

    await this.audit.record({
      actor: user,
      action: 'lead.acknowledged',
      objectType: 'enquiry',
      objectId: leadId,
      req,
    });

    await this.notifications.send(detail.customer.id, 'MAINTENANCE_UPDATE', {
      title: 'Enquiry Acknowledged',
      body: `The property representative has received your enquiry for "${detail.property.title}".`,
      actionUrl: `/dashboard/enquiries`,
    });

    return { id: leadId, status: 'ACKNOWLEDGED', acknowledgedAt: now, message: 'Lead acknowledged.' };
  }

  async contactLead(user: AuthUser, leadId: number, dto: ContactLeadDto, req?: Request) {
    const detail = await this.getProviderLeadDetail(user, leadId);
    const now = new Date();
    const nextFollowUp = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null;

    await this.db.update('enquiries', leadId, {
      status: 'CONTACTED',
      contacted_at: detail.lead.contactedAt || now,
      last_contacted_at: now,
      next_follow_up_at: nextFollowUp,
      follow_up_notes: dto.notes || detail.lead.followUpNotes,
      responded_at: detail.lead.acknowledgedAt || now,
    });

    if (dto.notes) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: leadId,
        author_id: user.id,
        note: dto.notes,
        contact_channel: dto.contactChannel || 'CALL',
        completed_at: now,
      });
    }

    await this.audit.record({
      actor: user,
      action: 'lead.contacted',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { contactChannel: dto.contactChannel, nextFollowUpAt: nextFollowUp },
      req,
    });

    return { id: leadId, status: 'CONTACTED', lastContactedAt: now, nextFollowUpAt: nextFollowUp };
  }

  async qualifyLead(user: AuthUser, leadId: number, dto: QualifyLeadDto, req?: Request) {
    const detail = await this.getProviderLeadDetail(user, leadId);
    const now = new Date();
    const nextFollowUp = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null;

    await this.db.update('enquiries', leadId, {
      status: 'QUALIFIED',
      qualified_at: now,
      next_follow_up_at: nextFollowUp,
      follow_up_notes: dto.notes || detail.lead.followUpNotes,
    });

    if (dto.notes) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: leadId,
        author_id: user.id,
        note: `Qualified: ${dto.notes}`,
        contact_channel: 'OTHER',
        completed_at: now,
      });
    }

    // Update tenant profile if budget/household fields provided
    if (dto.budgetMin || dto.budgetMax || dto.householdType) {
      await this.db.execute(
        `UPDATE tenants SET
           budget_min = COALESCE(?, budget_min),
           budget_max = COALESCE(?, budget_max),
           household_type = COALESCE(?, household_type)
         WHERE user_id = ?`,
        [dto.budgetMin || null, dto.budgetMax || null, dto.householdType || null, detail.customer.id],
      );
    }

    await this.audit.record({
      actor: user,
      action: 'lead.qualified',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { notes: dto.notes, budgetMin: dto.budgetMin, budgetMax: dto.budgetMax },
      req,
    });

    return { id: leadId, status: 'QUALIFIED', qualifiedAt: now };
  }

  async addLeadFollowUp(user: AuthUser, leadId: number, dto: FollowUpLeadDto, req?: Request) {
    await this.getProviderLeadDetail(user, leadId);
    const now = new Date();
    const nextFollowUp = dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null;
    const scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;

    const followUpId = await this.db.insert('lead_follow_ups', {
      enquiry_id: leadId,
      author_id: user.id,
      note: dto.note,
      contact_channel: dto.contactChannel || 'CALL',
      scheduled_at: scheduledAt,
      completed_at: scheduledAt ? null : now,
    });

    await this.db.update('enquiries', leadId, {
      last_contacted_at: now,
      next_follow_up_at: nextFollowUp,
      follow_up_notes: dto.note,
    });

    await this.audit.record({
      actor: user,
      action: 'followup.created',
      objectType: 'lead_follow_up',
      objectId: followUpId,
      metadata: { enquiryId: leadId, note: dto.note, nextFollowUpAt: nextFollowUp },
      req,
    });

    return { id: followUpId, enquiryId: leadId, note: dto.note, nextFollowUpAt: nextFollowUp };
  }

  async markLeadLost(user: AuthUser, leadId: number, dto: MarkLeadLostDto, req?: Request) {
    await this.getProviderLeadDetail(user, leadId);
    const now = new Date();

    if (!dto.reason || dto.reason.trim().length === 0) {
      throw new BadRequestException('A reason is mandatory when marking a lead as lost.');
    }

    await this.db.update('enquiries', leadId, {
      status: 'LOST',
      lost_at: now,
      lost_reason: dto.reason.trim(),
    });

    await this.audit.record({
      actor: user,
      action: 'lead.lost',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { reason: dto.reason },
      req,
    });

    return { id: leadId, status: 'LOST', lostAt: now, reason: dto.reason };
  }

  async convertLead(user: AuthUser, leadId: number, dto: ConvertLeadDto, req?: Request) {
    const detail = await this.getProviderLeadDetail(user, leadId);
    const now = new Date();

    // Check if application already exists for this enquiry or property/tenant pair
    let applicationId = detail.application?.id;
    if (!applicationId) {
      const existingApp = await this.db.one<any>(
        'SELECT id FROM applications WHERE property_id = ? AND tenant_user_id = ?',
        [detail.property.id, detail.customer.id],
      );

      if (existingApp) {
        applicationId = existingApp.id;
        await this.db.update('applications', applicationId, { enquiry_id: leadId });
      } else {
        const publicId = newPublicId();
        applicationId = await this.db.insert('applications', {
          public_id: publicId,
          property_id: detail.property.id,
          tenant_user_id: detail.customer.id,
          enquiry_id: leadId,
          move_in_date: dto.moveInDate || null,
          tenure_months: dto.tenureMonths || 11,
          offered_rent: dto.offeredRent || detail.property.rentAmount,
          offered_deposit: dto.offeredDeposit || detail.property.securityDeposit,
          message: dto.message || 'Converted from marketplace lead enquiry.',
          status: 'SUBMITTED',
        });
      }
    }

    await this.db.update('enquiries', leadId, {
      status: 'CONVERTED',
      converted_at: now,
    });

    await this.audit.record({
      actor: user,
      action: 'lead.converted',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { applicationId, propertyId: detail.property.id },
      req,
    });

    await this.notifications.send(detail.customer.id, 'APPLICATION_SUBMITTED', {
      title: 'Application Created from Enquiry',
      body: `Your enquiry for "${detail.property.title}" has been moved to an active application.`,
      actionUrl: `/dashboard/applications`,
    });

    return { id: leadId, status: 'CONVERTED', applicationId, convertedAt: now };
  }

  async closeLead(user: AuthUser, leadId: number, req?: Request) {
    await this.getProviderLeadDetail(user, leadId);

    await this.db.update('enquiries', leadId, {
      status: 'CLOSED',
    });

    await this.audit.record({
      actor: user,
      action: 'lead.closed',
      objectType: 'enquiry',
      objectId: leadId,
      req,
    });

    return { id: leadId, status: 'CLOSED' };
  }

  // =========================================================================
  // 11. MANAGEMENT LEAD CONTROL CENTRE & GOVERNANCE
  // =========================================================================
  async listAdminLeads(user: AuthUser, query: AdminLeadsQueryDto): Promise<Paginated<any>> {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access the Admin Leads Control Centre.');
    }

    const { page, perPage, offset } = pageParams(query.page, query.perPage, 25);
    const whereClauses: string[] = ['p.deleted_at IS NULL'];
    const params: any[] = [];

    if (query.status && query.status !== 'ALL') {
      whereClauses.push('e.status = ?');
      params.push(query.status);
    }

    if (query.propertyId) {
      whereClauses.push('e.property_id = ?');
      params.push(query.propertyId);
    }

    if (query.ownerId) {
      whereClauses.push('p.listed_by_user_id = ?');
      params.push(query.ownerId);
    }

    if (query.assignedUserId) {
      whereClauses.push('e.assigned_user_id = ?');
      params.push(query.assignedUserId);
    }

    if (query.city) {
      whereClauses.push('p.city = ?');
      params.push(query.city);
    }

    if (query.source) {
      whereClauses.push('e.source = ?');
      params.push(query.source);
    }

    if (query.spamOnly === true || query.spamOnly === 'true') {
      whereClauses.push('e.is_spam = 1');
    }

    if (query.duplicateOnly === true || query.duplicateOnly === 'true') {
      whereClauses.push('e.is_duplicate = 1');
    }

    if (query.staleOnly === true || query.staleOnly === 'true') {
      whereClauses.push(`(
        (e.status = 'NEW' AND e.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR
        (e.status = 'ASSIGNED' AND e.assigned_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)) OR
        (e.status = 'QUALIFIED' AND e.next_follow_up_at < NOW())
      )`);
    }

    if (query.q) {
      whereClauses.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR p.title LIKE ? OR p.city LIKE ? OR e.message LIKE ?)');
      const term = `%${query.q}%`;
      params.push(term, term, term, term, term, term);
    }

    const where = whereClauses.join(' AND ');

    const rows = await this.db.query<any>(
      `SELECT e.id, e.public_id, e.message, e.contact_pref, e.status, e.source,
              e.created_at, e.responded_at, e.acknowledged_at, e.contacted_at, e.qualified_at,
              e.converted_at, e.lost_at, e.lost_reason, e.next_follow_up_at, e.last_contacted_at,
              e.follow_up_notes, e.is_spam, e.is_duplicate, e.duplicate_of_enquiry_id,
              e.assigned_user_id, e.assigned_at,
              p.id AS property_id, p.title AS property_title, p.city, p.locality, p.rent_amount,
              p.is_featured, p.visibility_tier,
              owner.id AS owner_user_id, owner.full_name AS owner_name, owner.email AS owner_email,
              assigned.id AS assignee_id, assigned.full_name AS assignee_name, assigned.email AS assignee_email,
              u.id AS customer_id, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS customer_kyc,
              (SELECT COUNT(*) FROM lead_follow_ups lfu WHERE lfu.enquiry_id = e.id) AS follow_up_count,
              app.id AS application_id, app.status AS application_status,
              t.id AS tenancy_id, t.stage AS tenancy_stage,
              lp.promotion_code
         FROM enquiries e
         JOIN properties p ON p.id = e.property_id
         JOIN users u ON u.id = e.tenant_user_id
         JOIN users owner ON owner.id = p.listed_by_user_id
         LEFT JOIN users assigned ON assigned.id = e.assigned_user_id
         LEFT JOIN applications app ON app.enquiry_id = e.id
         LEFT JOIN tenancies t ON t.application_id = app.id
         LEFT JOIN listing_promotions lp ON lp.id = e.promotion_id
        WHERE ${where}
        ORDER BY e.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM enquiries e
         JOIN properties p ON p.id = e.property_id
         JOIN users u ON u.id = e.tenant_user_id
        WHERE ${where}`,
      params,
    );

    const now = new Date();
    const items = rows.map((r) => {
      const createdAt = new Date(r.created_at);
      const isStale = (
        (r.status === 'NEW' && now.getTime() - createdAt.getTime() > 24 * 3600 * 1000) ||
        (r.status === 'ASSIGNED' && r.assigned_at && now.getTime() - new Date(r.assigned_at).getTime() > 48 * 3600 * 1000) ||
        (r.status === 'QUALIFIED' && r.next_follow_up_at && new Date(r.next_follow_up_at) < now)
      );

      return {
        id: r.id,
        publicId: r.public_id,
        status: r.status,
        source: r.source || 'ORGANIC',
        promotionCode: r.promotion_code,
        message: r.message,
        contactPref: r.contact_pref,
        isStale,
        isSpam: Boolean(r.is_spam),
        isDuplicate: Boolean(r.is_duplicate),
        duplicateOfEnquiryId: r.duplicate_of_enquiry_id,
        followUpCount: Number(r.follow_up_count || 0),
        property: {
          id: r.property_id,
          title: r.property_title,
          city: r.city,
          locality: r.locality,
          rentAmount: r.rent_amount !== null ? Number(r.rent_amount) : null,
          visibilityTier: r.visibility_tier || 'STANDARD',
          isFeatured: Boolean(r.is_featured),
        },
        owner: {
          id: r.owner_user_id,
          name: r.owner_name,
          email: r.owner_email,
        },
        assignee: r.assignee_id ? {
          id: r.assignee_id,
          name: r.assignee_name,
          email: r.assignee_email,
          assignedAt: r.assigned_at,
        } : null,
        customer: {
          id: r.customer_id,
          name: r.customer_name,
          email: r.customer_email,
          phone: r.customer_phone,
          kycStatus: r.customer_kyc || 'NOT_STARTED',
        },
        application: r.application_id ? { id: r.application_id, status: r.application_status } : null,
        tenancy: r.tenancy_id ? { id: r.tenancy_id, stage: r.tenancy_stage } : null,
        createdAt: r.created_at,
        acknowledgedAt: r.acknowledged_at,
        contactedAt: r.contacted_at,
        qualifiedAt: r.qualified_at,
        convertedAt: r.converted_at,
        lostAt: r.lost_at,
        lostReason: r.lost_reason,
        lastContactedAt: r.last_contacted_at,
        nextFollowUpAt: r.next_follow_up_at,
        followUpNotes: r.follow_up_notes,
      };
    });

    return paginate(items, countRow?.total ?? 0, page, perPage);
  }

  async assignLead(user: AuthUser, leadId: number, dto: AssignLeadDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can assign leads.');
    }

    const lead = await this.db.one<any>('SELECT * FROM enquiries WHERE id = ?', [leadId]);
    if (!lead) throw new NotFoundException('Lead enquiry not found.');

    const targetUser = await this.db.one<any>('SELECT id, full_name, email FROM users WHERE id = ?', [dto.assignedUserId]);
    if (!targetUser) throw new NotFoundException('Assigned user not found.');

    const now = new Date();
    await this.db.update('enquiries', leadId, {
      assigned_user_id: dto.assignedUserId,
      assigned_by: user.id,
      assigned_at: now,
      status: lead.status === 'NEW' ? 'ASSIGNED' : lead.status,
    });

    if (dto.notes) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: leadId,
        author_id: user.id,
        note: `Management Assignment: ${dto.notes}`,
        contact_channel: 'OTHER',
      });
    }

    await this.audit.record({
      actor: user,
      action: 'lead.assigned',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { assignedUserId: dto.assignedUserId, assignedBy: user.id, notes: dto.notes },
      req,
    });

    await this.notifications.send(dto.assignedUserId, 'MAINTENANCE_UPDATE', {
      title: 'New Lead Assigned to You',
      body: `Management has assigned enquiry #${leadId} to you. Please acknowledge and contact the customer.`,
      actionUrl: `/dashboard/leads`,
    });

    return {
      id: leadId,
      assignedUserId: dto.assignedUserId,
      assignedUserName: targetUser.full_name,
      assignedAt: now,
      status: lead.status === 'NEW' ? 'ASSIGNED' : lead.status,
      message: `Lead successfully assigned to ${targetUser.full_name}.`,
    };
  }

  async reassignLead(user: AuthUser, leadId: number, dto: AssignLeadDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can reassign leads.');
    }

    const lead = await this.db.one<any>('SELECT * FROM enquiries WHERE id = ?', [leadId]);
    if (!lead) throw new NotFoundException('Lead enquiry not found.');

    const previousAssigneeId = lead.assigned_user_id;
    const targetUser = await this.db.one<any>('SELECT id, full_name, email FROM users WHERE id = ?', [dto.assignedUserId]);
    if (!targetUser) throw new NotFoundException('New assigned user not found.');

    const now = new Date();
    await this.db.update('enquiries', leadId, {
      assigned_user_id: dto.assignedUserId,
      assigned_by: user.id,
      assigned_at: now,
      status: 'ASSIGNED',
    });

    await this.db.insert('lead_follow_ups', {
      enquiry_id: leadId,
      author_id: user.id,
      note: `Management Reassignment from user #${previousAssigneeId || 'unassigned'} to ${targetUser.full_name}. ${dto.notes || ''}`.trim(),
      contact_channel: 'OTHER',
    });

    await this.audit.record({
      actor: user,
      action: 'lead.reassigned',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { previousAssigneeId, newAssigneeId: dto.assignedUserId, notes: dto.notes },
      req,
    });

    await this.notifications.send(dto.assignedUserId, 'MAINTENANCE_UPDATE', {
      title: 'Lead Reassigned to You',
      body: `Management has reassigned lead #${leadId} to your queue.`,
      actionUrl: `/dashboard/leads`,
    });

    return {
      id: leadId,
      previousAssigneeId,
      newAssigneeId: dto.assignedUserId,
      assignedUserName: targetUser.full_name,
      reassignedAt: now,
      message: `Lead reassigned to ${targetUser.full_name}.`,
    };
  }

  async markLeadSpam(user: AuthUser, leadId: number, dto: MarkLeadSpamDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can classify leads as spam.');
    }

    await this.db.update('enquiries', leadId, {
      is_spam: 1,
      status: 'SPAM',
    });

    await this.audit.record({
      actor: user,
      action: 'lead.marked_spam',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { reason: dto.reason },
      req,
    });

    return { id: leadId, status: 'SPAM', isSpam: true, message: 'Lead marked as spam.' };
  }

  async markLeadDuplicate(user: AuthUser, leadId: number, dto: MarkLeadDuplicateDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can flag duplicate leads.');
    }

    await this.db.update('enquiries', leadId, {
      is_duplicate: 1,
      duplicate_of_enquiry_id: dto.duplicateOfEnquiryId,
    });

    await this.audit.record({
      actor: user,
      action: 'lead.marked_duplicate',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { duplicateOfEnquiryId: dto.duplicateOfEnquiryId, notes: dto.notes },
      req,
    });

    return { id: leadId, isDuplicate: true, duplicateOfEnquiryId: dto.duplicateOfEnquiryId };
  }

  async reopenLead(user: AuthUser, leadId: number, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can reopen leads.');
    }

    const lead = await this.db.one<any>('SELECT * FROM enquiries WHERE id = ?', [leadId]);
    if (!lead) throw new NotFoundException('Lead enquiry not found.');

    const newStatus = lead.contacted_at ? 'CONTACTED' : lead.assigned_user_id ? 'ASSIGNED' : 'NEW';

    await this.db.update('enquiries', leadId, {
      status: newStatus,
      is_spam: 0,
      lost_at: null,
      lost_reason: null,
    });

    await this.audit.record({
      actor: user,
      action: 'lead.reopened',
      objectType: 'enquiry',
      objectId: leadId,
      metadata: { previousStatus: lead.status, newStatus },
      req,
    });

    return { id: leadId, status: newStatus, message: `Lead reopened with status ${newStatus}.` };
  }

  async getAdminLeadsAnalytics(user: AuthUser) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can view admin leads analytics.');
    }

    const [funnelCounts, attributionCounts, responseTimes, topProviders, topCities] = await Promise.all([
      this.db.one<any>(`
        SELECT
          COUNT(*) AS total_enquiries,
          SUM(IF(status = 'NEW', 1, 0)) AS count_new,
          SUM(IF(status = 'ASSIGNED', 1, 0)) AS count_assigned,
          SUM(IF(status = 'ACKNOWLEDGED', 1, 0)) AS count_acknowledged,
          SUM(IF(status = 'CONTACTED', 1, 0)) AS count_contacted,
          SUM(IF(status = 'QUALIFIED', 1, 0)) AS count_qualified,
          SUM(IF(status = 'CONVERTED' OR converted_at IS NOT NULL, 1, 0)) AS count_converted,
          SUM(IF(status = 'LOST', 1, 0)) AS count_lost,
          SUM(IF(status = 'SPAM', 1, 0)) AS count_spam,
          SUM(IF(status = 'CLOSED', 1, 0)) AS count_closed,
          SUM(IF(is_duplicate = 1, 1, 0)) AS count_duplicates,
          SUM(IF(
            (status = 'NEW' AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR
            (status = 'ASSIGNED' AND assigned_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)) OR
            (status = 'QUALIFIED' AND next_follow_up_at < NOW()), 1, 0
          )) AS count_stale
        FROM enquiries
      `),
      this.db.query<any>(`
        SELECT COALESCE(source, 'ORGANIC') AS source, COUNT(*) AS count,
               SUM(IF(status = 'CONVERTED' OR converted_at IS NOT NULL, 1, 0)) AS converted_count
        FROM enquiries
        GROUP BY source
      `),
      this.db.one<any>(`
        SELECT
          AVG(TIMESTAMPDIFF(MINUTE, created_at, acknowledged_at)) AS avg_ack_mins,
          AVG(TIMESTAMPDIFF(MINUTE, created_at, contacted_at)) AS avg_contact_mins,
          AVG(TIMESTAMPDIFF(HOUR, created_at, converted_at)) AS avg_convert_hours
        FROM enquiries
        WHERE acknowledged_at IS NOT NULL
      `),
      this.db.query<any>(`
        SELECT u.id AS user_id, u.full_name, COUNT(e.id) AS total_leads,
               SUM(IF(e.status = 'CONVERTED' OR e.converted_at IS NOT NULL, 1, 0)) AS converted_leads,
               AVG(TIMESTAMPDIFF(MINUTE, e.created_at, e.acknowledged_at)) AS avg_ack_mins
          FROM users u
          JOIN properties p ON p.listed_by_user_id = u.id
          JOIN enquiries e ON e.property_id = p.id
         GROUP BY u.id, u.full_name
         ORDER BY total_leads DESC
         LIMIT 5
      `),
      this.db.query<any>(`
        SELECT p.city, COUNT(e.id) AS lead_count,
               SUM(IF(e.status = 'CONVERTED' OR e.converted_at IS NOT NULL, 1, 0)) AS converted_count
          FROM properties p
          JOIN enquiries e ON e.property_id = p.id
         GROUP BY p.city
         ORDER BY lead_count DESC
         LIMIT 5
      `),
    ]);

    const totalEnquiries = Number(funnelCounts?.total_enquiries || 0);
    const converted = Number(funnelCounts?.count_converted || 0);
    const qualified = Number(funnelCounts?.count_qualified || 0);
    const conversionRate = totalEnquiries > 0 ? Number(((converted / totalEnquiries) * 100).toFixed(2)) : 0;

    return {
      funnel: {
        totalEnquiries,
        new: Number(funnelCounts?.count_new || 0),
        assigned: Number(funnelCounts?.count_assigned || 0),
        acknowledged: Number(funnelCounts?.count_acknowledged || 0),
        contacted: Number(funnelCounts?.count_contacted || 0),
        qualified,
        converted,
        lost: Number(funnelCounts?.count_lost || 0),
        spam: Number(funnelCounts?.count_spam || 0),
        closed: Number(funnelCounts?.count_closed || 0),
        duplicates: Number(funnelCounts?.count_duplicates || 0),
        stale: Number(funnelCounts?.count_stale || 0),
      },
      conversionRates: {
        overallConversionRate: conversionRate,
        leadToQualified: totalEnquiries > 0 ? Number(((qualified / totalEnquiries) * 100).toFixed(2)) : 0,
        qualifiedToConverted: qualified > 0 ? Number(((converted / qualified) * 100).toFixed(2)) : 0,
      },
      responseAverages: {
        avgAckMinutes: responseTimes?.avg_ack_mins ? Math.round(Number(responseTimes.avg_ack_mins)) : null,
        avgContactMinutes: responseTimes?.avg_contact_mins ? Math.round(Number(responseTimes.avg_contact_mins)) : null,
        avgConvertHours: responseTimes?.avg_convert_hours ? Math.round(Number(responseTimes.avg_convert_hours)) : null,
      },
      channelAttribution: attributionCounts,
      topProviders,
      topCities,
      timestamp: new Date().toISOString(),
    };
  }

  async processSlaEscalations(user: AuthUser) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can process SLA escalations.');
    }

    const staleLeads = await this.db.query<any>(`
      SELECT e.id, e.public_id, e.status, e.created_at, e.assigned_at, e.next_follow_up_at,
             p.title AS property_title, p.listed_by_user_id,
             e.assigned_user_id
        FROM enquiries e
        JOIN properties p ON p.id = e.property_id
       WHERE (
         (e.status = 'NEW' AND e.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR
         (e.status = 'ASSIGNED' AND e.assigned_at < DATE_SUB(NOW(), INTERVAL 48 HOUR)) OR
         (e.status = 'QUALIFIED' AND e.next_follow_up_at < NOW())
       )
       LIMIT 50
    `);

    const escalatedIds: number[] = [];
    for (const lead of staleLeads) {
      escalatedIds.push(lead.id);

      // Alert assignee or owner
      const targetUserId = lead.assigned_user_id || lead.listed_by_user_id;
      if (targetUserId) {
        await this.notifications.send(targetUserId, 'MAINTENANCE_UPDATE', {
          title: 'Lead SLA Alert: Follow-up Overdue',
          body: `Enquiry for "${lead.property_title}" requires prompt contact (Status: ${lead.status}).`,
          actionUrl: `/dashboard/leads`,
        });
      }
    }

    return {
      escalatedCount: escalatedIds.length,
      escalatedLeadIds: escalatedIds,
      timestamp: new Date().toISOString(),
    };
  }

  // =========================================================================
  // 12. ADVANCED RECORD LEAD (WITH DUPLICATE & SPAM HEURISTICS)
  // =========================================================================
  async recordLead(user: AuthUser, dto: RecordLeadDto, req?: Request) {
    const property = await this.db.one<any>('SELECT * FROM properties WHERE id = ? AND deleted_at IS NULL', [dto.propertyId]);
    if (!property) throw new NotFoundException('Property listing not found.');

    if (property.status !== 'ACTIVE' && !this.isManagement(user)) {
      throw new BadRequestException('Cannot submit enquiries for non-active listings.');
    }

    if (property.listed_by_user_id === user.id) {
      throw new BadRequestException('You cannot submit an enquiry for your own listing.');
    }

    // 1. Duplicate Enquiry Heuristic: check if recent enquiry exists from same user for same property in last 24h
    const recent = await this.db.one<any>(
      `SELECT id, status, message FROM enquiries
        WHERE property_id = ? AND tenant_user_id = ?
          AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
        ORDER BY id DESC LIMIT 1`,
      [dto.propertyId, user.id],
    );

    if (recent) {
      const isExactDuplicate = (recent.message || '').trim() === (dto.message || '').trim();
      if (isExactDuplicate) {
        return {
          id: recent.id,
          status: recent.status,
          isDuplicate: true,
          message: 'You have already sent this enquiry to the property representative today.',
        };
      }
    }

    const publicId = newPublicId();
    const source = dto.source || (property.is_featured ? (property.visibility_tier || 'FEATURED') : 'ORGANIC');

    // 2. Spam heuristic: check if user sent > 10 enquiries across all listings in last 5 minutes
    const spamCheck = await this.db.one<any>(
      `SELECT COUNT(*) AS c FROM enquiries
        WHERE tenant_user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
      [user.id],
    );
    const isSpam = Number(spamCheck?.c || 0) > 10 ? 1 : 0;

    const enquiryId = await this.db.insert('enquiries', {
      public_id: publicId,
      property_id: property.id,
      tenant_user_id: user.id,
      message: dto.message || null,
      contact_pref: dto.contactPref || 'CHAT',
      status: isSpam ? 'SPAM' : 'NEW',
      source,
      promotion_id: dto.promotionId || null,
      is_spam: isSpam,
      is_duplicate: recent ? 1 : 0,
      duplicate_of_enquiry_id: recent ? recent.id : null,
    });

    // Increment property enquiry count
    await this.db.execute('UPDATE properties SET enquiry_count = enquiry_count + 1 WHERE id = ?', [property.id]);

    await this.audit.record({
      actor: user,
      action: isSpam ? 'lead.marked_spam' : 'lead.created',
      objectType: 'enquiry',
      objectId: enquiryId,
      metadata: { propertyId: property.id, source, isSpam: Boolean(isSpam), isDuplicate: Boolean(recent) },
      req,
    });

    if (!isSpam) {
      await this.notifications.send(property.listed_by_user_id, 'MAINTENANCE_UPDATE', {
        title: 'New Listing Enquiry!',
        body: `You received a new enquiry from ${user.fullName} for "${property.title}".`,
        actionUrl: `/dashboard/leads`,
      });
    }

    return {
      id: enquiryId,
      publicId,
      status: isSpam ? 'SPAM' : 'NEW',
      source,
      isSpam: Boolean(isSpam),
      isDuplicate: Boolean(recent),
      message: isSpam ? 'Enquiry submitted for review.' : 'Enquiry recorded successfully.',
    };
  }

  async getAttributionFunnel(user: AuthUser, listingId?: number) {
    if (!this.isManagement(user) && !listingId) {
      throw new ForbiddenException('Only Management can access platform-wide attribution funnel.');
    }

    let propClause = '';
    const params: any[] = [];

    if (listingId) {
      propClause = 'WHERE p.id = ?';
      params.push(listingId);
    } else if (!this.isManagement(user)) {
      propClause = 'WHERE p.listed_by_user_id = ?';
      params.push(user.id);
    }

    const [views, enquiries, apps, tenancies, revenue] = await Promise.all([
      this.db.one<any>(`SELECT COALESCE(SUM(p.view_count), 0) AS total_views FROM properties p ${propClause}`, params),
      this.db.one<any>(`
        SELECT COUNT(e.id) AS total_enquiries,
               SUM(IF(e.source IN ('FEATURED','PROMOTED','PREMIUM'), 1, 0)) AS promoted_enquiries,
               SUM(IF(e.source = 'ORGANIC' OR e.source IS NULL, 1, 0)) AS organic_enquiries
          FROM enquiries e
          JOIN properties p ON p.id = e.property_id
          ${propClause}
      `, params),
      this.db.one<any>(`
        SELECT COUNT(app.id) AS total_applications
          FROM applications app
          JOIN properties p ON p.id = app.property_id
          ${propClause}
      `, params),
      this.db.one<any>(`
        SELECT COUNT(t.id) AS active_tenancies
          FROM tenancies t
          JOIN properties p ON p.id = t.property_id
          ${propClause}
      `, params),
      this.db.one<any>(`
        SELECT COALESCE(SUM(co.total_amount), 0) AS total_revenue
          FROM commercial_obligations co
          ${listingId ? 'WHERE co.property_id = ?' : ''}
      `, listingId ? [listingId] : []),
    ]);

    const totalViews = Number(views?.total_views || 0);
    const totalEnquiries = Number(enquiries?.total_enquiries || 0);
    const totalApps = Number(apps?.total_applications || 0);
    const activeTenancies = Number(tenancies?.active_tenancies || 0);

    return {
      listingId: listingId || null,
      funnel: {
        views: totalViews,
        enquiries: totalEnquiries,
        promotedEnquiries: Number(enquiries?.promoted_enquiries || 0),
        organicEnquiries: Number(enquiries?.organic_enquiries || 0),
        applications: totalApps,
        tenancies: activeTenancies,
      },
      conversionRates: {
        viewToEnquiry: totalViews > 0 ? Number(((totalEnquiries / totalViews) * 100).toFixed(2)) : 0,
        enquiryToApp: totalEnquiries > 0 ? Number(((totalApps / totalEnquiries) * 100).toFixed(2)) : 0,
        appToTenancy: totalApps > 0 ? Number(((activeTenancies / totalApps) * 100).toFixed(2)) : 0,
        overallViewToTenancy: totalViews > 0 ? Number(((activeTenancies / totalViews) * 100).toFixed(2)) : 0,
      },
      commercialRevenueGenerated: Number(revenue?.total_revenue || 0),
      currency: 'INR',
    };
  }

  // =========================================================================
  // 12. PHASE 11: PROPERTY VISIT SCHEDULING & CONVERSION OPERATIONS
  // =========================================================================

  private validateVisitTimes(startStr: string, endStr?: string, allowPast = false): { start: Date; end: Date } {
    const start = new Date(startStr);
    if (isNaN(start.getTime())) {
      throw new BadRequestException('Invalid scheduled start time.');
    }

    let end: Date;
    if (endStr) {
      end = new Date(endStr);
      if (isNaN(end.getTime())) {
        throw new BadRequestException('Invalid scheduled end time.');
      }
    } else {
      end = new Date(start.getTime() + 45 * 60 * 1000); // default 45-minute slot
    }

    if (start.getTime() >= end.getTime()) {
      throw new BadRequestException('Scheduled start time must be before scheduled end time.');
    }

    if (!allowPast && start.getTime() < Date.now() - 60000) {
      throw new BadRequestException('Scheduled visit must be set in the future.');
    }

    return { start, end };
  }

  private async checkSchedulingConflicts(
    propertyId: number,
    hostUserId: number,
    customerUserId: number,
    start: Date,
    end: Date,
    excludeVisitId?: number,
  ) {
    const excludeClause = excludeVisitId ? 'AND id != ?' : '';
    const excludeParams = excludeVisitId ? [excludeVisitId] : [];

    // 1. Property conflict check
    const propConflict = await this.db.one<any>(
      `SELECT id, public_id, scheduled_start, scheduled_end, status FROM property_visits
        WHERE property_id = ? AND status IN ('CONFIRMED', 'PROPOSED')
          AND (scheduled_start < ? AND scheduled_end > ?)
          ${excludeClause}
        LIMIT 1`,
      [propertyId, end, start, ...excludeParams],
    );
    if (propConflict) {
      throw new ConflictException('Property already has a scheduled visit during this time slot.');
    }

    // 2. Host conflict check
    const hostConflict = await this.db.one<any>(
      `SELECT id, public_id, scheduled_start, scheduled_end, status FROM property_visits
        WHERE host_user_id = ? AND status IN ('CONFIRMED', 'PROPOSED')
          AND (scheduled_start < ? AND scheduled_end > ?)
          ${excludeClause}
        LIMIT 1`,
      [hostUserId, end, start, ...excludeParams],
    );
    if (hostConflict) {
      throw new ConflictException('Host has a scheduling conflict with another visit during this time slot.');
    }

    // 3. Customer conflict check
    const custConflict = await this.db.one<any>(
      `SELECT id, public_id, scheduled_start, scheduled_end, status FROM property_visits
        WHERE customer_user_id = ? AND status = 'CONFIRMED'
          AND (scheduled_start < ? AND scheduled_end > ?)
          ${excludeClause}
        LIMIT 1`,
      [customerUserId, end, start, ...excludeParams],
    );
    if (custConflict) {
      throw new ConflictException('You already have another confirmed property visit during this time window.');
    }
  }

  // --- Customer Visit Operations ---

  async requestVisit(user: AuthUser, dto: RequestVisitDto, req?: Request) {
    const property = await this.db.one<any>(
      'SELECT id, title, listed_by_user_id, status FROM properties WHERE id = ? AND deleted_at IS NULL',
      [dto.propertyId],
    );
    if (!property || property.status !== 'ACTIVE') {
      throw new NotFoundException('Active property listing not found.');
    }

    if (property.listed_by_user_id === user.id) {
      throw new BadRequestException('You cannot request a visit for your own property.');
    }

    const { start, end } = this.validateVisitTimes(dto.scheduledStart, dto.scheduledEnd);

    // Resolve or link existing enquiry
    let enquiryId = dto.enquiryId;
    if (enquiryId) {
      const enq = await this.db.one<any>(
        'SELECT id, tenant_user_id, property_id FROM enquiries WHERE id = ? AND tenant_user_id = ? AND property_id = ?',
        [enquiryId, user.id, property.id],
      );
      if (!enq) throw new NotFoundException('Specified enquiry not found for this property.');
    } else {
      const existingEnq = await this.db.one<any>(
        'SELECT id FROM enquiries WHERE tenant_user_id = ? AND property_id = ? ORDER BY id DESC LIMIT 1',
        [user.id, property.id],
      );
      if (existingEnq) {
        enquiryId = existingEnq.id;
      } else {
        const publicId = newPublicId();
        enquiryId = await this.db.insert('enquiries', {
          public_id: publicId,
          property_id: property.id,
          tenant_user_id: user.id,
          message: dto.customerNotes || 'Requested property visit.',
          contact_pref: 'CHAT',
          status: 'VISIT_SCHEDULED',
          source: 'ORGANIC',
        });
      }
    }

    await this.checkSchedulingConflicts(property.id, property.listed_by_user_id, user.id, start, end);

    const publicId = newPublicId();
    const visitId = await this.db.insert('property_visits', {
      public_id: publicId,
      enquiry_id: enquiryId,
      property_id: property.id,
      customer_user_id: user.id,
      host_user_id: property.listed_by_user_id,
      scheduled_start: start,
      scheduled_end: end,
      timezone: 'Asia/Kolkata',
      status: 'REQUESTED',
      visit_type: dto.visitType || 'IN_PERSON',
      customer_notes: dto.customerNotes || null,
    });

    if (enquiryId) {
      await this.db.update('enquiries', enquiryId, { status: 'VISIT_SCHEDULED' });
      await this.db.insert('lead_follow_ups', {
        enquiry_id: enquiryId,
        author_id: user.id,
        note: `Customer requested ${dto.visitType || 'IN_PERSON'} property visit for ${start.toISOString().slice(0, 16)}. ${dto.customerNotes || ''}`.trim(),
        contact_channel: 'MEETING',
        scheduled_at: start,
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.requested',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { propertyId: property.id, scheduledStart: start, scheduledEnd: end, enquiryId },
      req,
    });

    await this.notifications.send(property.listed_by_user_id, 'MAINTENANCE_UPDATE', {
      title: 'New Property Visit Requested!',
      body: `${user.fullName || 'A customer'} requested a property visit for "${property.title}" on ${start.toDateString()}.`,
      actionUrl: `/dashboard/visits`,
    });

    return {
      id: visitId,
      publicId,
      status: 'REQUESTED',
      scheduledStart: start,
      scheduledEnd: end,
      message: 'Property visit request submitted successfully.',
    };
  }

  async listCustomerVisits(user: AuthUser, query: CustomerVisitsQueryDto): Promise<Paginated<any>> {
    const { page, perPage, offset } = pageParams(query.page, query.perPage, 20);
    const whereClauses: string[] = ['v.customer_user_id = ?'];
    const params: any[] = [user.id];

    if (query.status && query.status !== 'ALL') {
      whereClauses.push('v.status = ?');
      params.push(query.status);
    }

    if (query.upcomingOnly === true || query.upcomingOnly === 'true') {
      whereClauses.push("v.scheduled_start >= NOW() AND v.status IN ('REQUESTED', 'PROPOSED', 'CONFIRMED')");
    }

    const where = whereClauses.join(' AND ');

    const rows = await this.db.query<any>(
      `SELECT v.id, v.public_id, v.scheduled_start, v.scheduled_end, v.timezone, v.status,
              v.visit_type, v.customer_notes, v.cancellation_reason, v.reschedule_reason,
              v.confirmed_at, v.completed_at, v.outcome, v.created_at,
              p.id AS property_id, p.title AS property_title, p.city, p.locality, p.rent_amount,
              p.visibility_tier, p.is_featured,
              host.id AS host_id, host.full_name AS host_name, host.email AS host_email, host.phone AS host_phone,
              v.enquiry_id,
              app.id AS application_id, app.status AS application_status
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
         JOIN users host ON host.id = v.host_user_id
         LEFT JOIN enquiries e ON e.id = v.enquiry_id
         LEFT JOIN applications app ON app.enquiry_id = v.enquiry_id
        WHERE ${where}
        ORDER BY v.scheduled_start DESC
        LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM property_visits v WHERE ${where}`,
      params,
    );

    const items = rows.map((r) => ({
      id: r.id,
      publicId: r.public_id,
      status: r.status,
      visitType: r.visit_type,
      scheduledStart: r.scheduled_start,
      scheduledEnd: r.scheduled_end,
      timezone: r.timezone,
      customerNotes: r.customer_notes,
      cancellationReason: r.cancellation_reason,
      rescheduleReason: r.reschedule_reason,
      confirmedAt: r.confirmed_at,
      completedAt: r.completed_at,
      outcome: r.outcome,
      property: {
        id: r.property_id,
        title: r.property_title,
        city: r.city,
        locality: r.locality,
        rentAmount: r.rent_amount !== null ? Number(r.rent_amount) : null,
        visibilityTier: r.visibility_tier || 'STANDARD',
        isFeatured: Boolean(r.is_featured),
      },
      host: {
        id: r.host_id,
        name: r.host_name,
        email: r.host_email,
        phone: r.host_phone,
      },
      enquiryId: r.enquiry_id,
      application: r.application_id ? { id: r.application_id, status: r.application_status } : null,
      createdAt: r.created_at,
    }));

    return paginate(items, countRow?.total ?? 0, page, perPage);
  }

  async getCustomerVisitDetail(user: AuthUser, visitId: number) {
    const row = await this.db.one<any>(
      `SELECT v.*,
              p.id AS property_id, p.title AS property_title, p.city, p.locality, p.rent_amount,
              p.security_deposit, p.visibility_tier, p.is_featured,
              host.id AS host_id, host.full_name AS host_name, host.email AS host_email, host.phone AS host_phone,
              app.id AS application_id, app.status AS application_status
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
         JOIN users host ON host.id = v.host_user_id
         LEFT JOIN applications app ON app.enquiry_id = v.enquiry_id
        WHERE v.id = ?`,
      [visitId],
    );

    if (!row) throw new NotFoundException('Property visit not found.');
    if (row.customer_user_id !== user.id && !this.isManagement(user)) {
      throw new ForbiddenException('You are not authorized to view this property visit.');
    }

    return {
      id: row.id,
      publicId: row.public_id,
      status: row.status,
      visitType: row.visit_type,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      timezone: row.timezone,
      customerNotes: row.customer_notes,
      cancellationReason: row.cancellation_reason,
      rescheduleReason: row.reschedule_reason,
      confirmedAt: row.confirmed_at,
      completedAt: row.completed_at,
      outcome: row.outcome,
      property: {
        id: row.property_id,
        title: row.property_title,
        city: row.city,
        locality: row.locality,
        rentAmount: row.rent_amount !== null ? Number(row.rent_amount) : null,
        securityDeposit: row.security_deposit !== null ? Number(row.security_deposit) : null,
        visibilityTier: row.visibility_tier || 'STANDARD',
        isFeatured: Boolean(row.is_featured),
      },
      host: {
        id: row.host_id,
        name: row.host_name,
        email: row.host_email,
        phone: row.host_phone,
      },
      enquiryId: row.enquiry_id,
      application: row.application_id ? { id: row.application_id, status: row.application_status } : null,
      createdAt: row.created_at,
    };
  }

  async confirmCustomerVisit(user: AuthUser, visitId: number, dto: ConfirmVisitDto, req?: Request) {
    const visit = await this.db.one<any>('SELECT * FROM property_visits WHERE id = ?', [visitId]);
    if (!visit) throw new NotFoundException('Property visit not found.');
    if (visit.customer_user_id !== user.id && !this.isManagement(user)) {
      throw new ForbiddenException('You are not authorized to confirm this visit.');
    }

    if (visit.status === 'CONFIRMED') {
      return { id: visitId, status: 'CONFIRMED', message: 'Visit already confirmed.' };
    }

    if (visit.status !== 'PROPOSED') {
      throw new BadRequestException('Only proposed visits can be confirmed by the customer.');
    }

    const now = new Date();
    await this.db.update('property_visits', visitId, {
      status: 'CONFIRMED',
      confirmed_at: now,
      customer_notes: dto.notes ? `${visit.customer_notes || ''}\nCustomer Confirmation: ${dto.notes}`.trim() : visit.customer_notes,
    });

    if (visit.enquiry_id) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: visit.enquiry_id,
        author_id: user.id,
        note: `Customer confirmed visit for ${new Date(visit.scheduled_start).toLocaleString()}. ${dto.notes || ''}`.trim(),
        contact_channel: 'OTHER',
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.confirmed',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { confirmedBy: 'CUSTOMER' },
      req,
    });

    await this.notifications.send(visit.host_user_id, 'MAINTENANCE_UPDATE', {
      title: 'Visit Confirmed by Customer!',
      body: `Customer confirmed property visit #${visit.id} for ${new Date(visit.scheduled_start).toDateString()}.`,
      actionUrl: `/dashboard/visits`,
    });

    return { id: visitId, status: 'CONFIRMED', confirmedAt: now, message: 'Visit confirmed successfully.' };
  }

  async cancelCustomerVisit(user: AuthUser, visitId: number, dto: CancelVisitDto, req?: Request) {
    const visit = await this.db.one<any>('SELECT * FROM property_visits WHERE id = ?', [visitId]);
    if (!visit) throw new NotFoundException('Property visit not found.');
    if (visit.customer_user_id !== user.id && !this.isManagement(user)) {
      throw new ForbiddenException('You are not authorized to cancel this visit.');
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Cancellation reason is mandatory.');
    }

    if (['COMPLETED', 'CANCELLED'].includes(visit.status)) {
      throw new BadRequestException('Cannot cancel a completed or already cancelled visit.');
    }

    const now = new Date();
    await this.db.update('property_visits', visitId, {
      status: 'CANCELLED',
      cancelled_at: now,
      cancellation_reason: dto.reason.trim(),
    });

    if (visit.enquiry_id) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: visit.enquiry_id,
        author_id: user.id,
        note: `Customer cancelled visit: ${dto.reason.trim()}`,
        contact_channel: 'OTHER',
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.cancelled',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { cancelledBy: 'CUSTOMER', reason: dto.reason },
      req,
    });

    await this.notifications.send(visit.host_user_id, 'MAINTENANCE_UPDATE', {
      title: 'Property Visit Cancelled',
      body: `Customer cancelled visit #${visit.id}. Reason: ${dto.reason}`,
      actionUrl: `/dashboard/visits`,
    });

    return { id: visitId, status: 'CANCELLED', cancellationReason: dto.reason };
  }

  async rescheduleCustomerVisit(user: AuthUser, visitId: number, dto: RescheduleVisitDto, req?: Request) {
    const visit = await this.db.one<any>('SELECT * FROM property_visits WHERE id = ?', [visitId]);
    if (!visit) throw new NotFoundException('Property visit not found.');
    if (visit.customer_user_id !== user.id && !this.isManagement(user)) {
      throw new ForbiddenException('You are not authorized to reschedule this visit.');
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Reschedule reason is mandatory.');
    }

    if (['COMPLETED', 'CANCELLED'].includes(visit.status)) {
      throw new BadRequestException('Cannot reschedule a completed or cancelled visit.');
    }

    const { start, end } = this.validateVisitTimes(dto.scheduledStart, dto.scheduledEnd);
    await this.checkSchedulingConflicts(visit.property_id, visit.host_user_id, user.id, start, end, visitId);

    await this.db.update('property_visits', visitId, {
      scheduled_start: start,
      scheduled_end: end,
      status: 'PROPOSED',
      reschedule_reason: dto.reason.trim(),
      customer_notes: dto.notes ? `${visit.customer_notes || ''}\nReschedule Note: ${dto.notes}`.trim() : visit.customer_notes,
    });

    if (visit.enquiry_id) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: visit.enquiry_id,
        author_id: user.id,
        note: `Customer requested reschedule to ${start.toLocaleString()}. Reason: ${dto.reason.trim()}`,
        contact_channel: 'MEETING',
        scheduled_at: start,
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.rescheduled',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { rescheduledBy: 'CUSTOMER', scheduledStart: start, scheduledEnd: end, reason: dto.reason },
      req,
    });

    await this.notifications.send(visit.host_user_id, 'MAINTENANCE_UPDATE', {
      title: 'Visit Reschedule Requested',
      body: `Customer requested a new time for visit #${visit.id}: ${start.toDateString()}.`,
      actionUrl: `/dashboard/visits`,
    });

    return { id: visitId, status: 'PROPOSED', scheduledStart: start, scheduledEnd: end };
  }

  // --- Provider Visit Operations ---

  async listProviderVisits(user: AuthUser, query: ProviderVisitsQueryDto): Promise<Paginated<any>> {
    const { page, perPage, offset } = pageParams(query.page, query.perPage, 20);
    const whereClauses: string[] = ['(p.listed_by_user_id = ? OR v.host_user_id = ?)', 'p.deleted_at IS NULL'];
    const params: any[] = [user.id, user.id];

    if (query.status && query.status !== 'ALL') {
      whereClauses.push('v.status = ?');
      params.push(query.status);
    }

    if (query.propertyId) {
      whereClauses.push('v.property_id = ?');
      params.push(query.propertyId);
    }

    if (query.upcomingOnly === true || query.upcomingOnly === 'true') {
      whereClauses.push("v.scheduled_start >= NOW() AND v.status IN ('REQUESTED', 'PROPOSED', 'CONFIRMED')");
    }

    if (query.staleOnly === true || query.staleOnly === 'true') {
      whereClauses.push(`(
        (v.status = 'REQUESTED' AND v.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR
        (v.status = 'CONFIRMED' AND v.scheduled_end < DATE_SUB(NOW(), INTERVAL 24 HOUR))
      )`);
    }

    if (query.q) {
      whereClauses.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.phone LIKE ? OR p.title LIKE ? OR v.customer_notes LIKE ?)');
      const term = `%${query.q}%`;
      params.push(term, term, term, term, term);
    }

    const where = whereClauses.join(' AND ');

    const rows = await this.db.query<any>(
      `SELECT v.id, v.public_id, v.scheduled_start, v.scheduled_end, v.timezone, v.status,
              v.visit_type, v.customer_notes, v.provider_notes, v.cancellation_reason, v.reschedule_reason,
              v.confirmed_at, v.completed_at, v.no_show_at, v.outcome, v.outcome_notes, v.created_at,
              p.id AS property_id, p.title AS property_title, p.city, p.locality, p.rent_amount,
              p.visibility_tier, p.is_featured,
              u.id AS customer_id, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS customer_kyc,
              v.enquiry_id,
              app.id AS application_id, app.status AS application_status
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
         JOIN users u ON u.id = v.customer_user_id
         LEFT JOIN applications app ON app.enquiry_id = v.enquiry_id
        WHERE ${where}
        ORDER BY FIELD(v.status, 'REQUESTED', 'PROPOSED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW_CUSTOMER', 'NO_SHOW_PROVIDER', 'CANCELLED', 'REJECTED', 'EXPIRED'), v.scheduled_start DESC
        LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
         JOIN users u ON u.id = v.customer_user_id
        WHERE ${where}`,
      params,
    );

    const items = rows.map((r) => ({
      id: r.id,
      publicId: r.public_id,
      status: r.status,
      visitType: r.visit_type,
      scheduledStart: r.scheduled_start,
      scheduledEnd: r.scheduled_end,
      timezone: r.timezone,
      customerNotes: r.customer_notes,
      providerNotes: r.provider_notes,
      cancellationReason: r.cancellation_reason,
      rescheduleReason: r.reschedule_reason,
      confirmedAt: r.confirmed_at,
      completedAt: r.completed_at,
      noShowAt: r.no_show_at,
      outcome: r.outcome,
      outcomeNotes: r.outcome_notes,
      property: {
        id: r.property_id,
        title: r.property_title,
        city: r.city,
        locality: r.locality,
        rentAmount: r.rent_amount !== null ? Number(r.rent_amount) : null,
        visibilityTier: r.visibility_tier || 'STANDARD',
        isFeatured: Boolean(r.is_featured),
      },
      customer: {
        id: r.customer_id,
        name: r.customer_name,
        email: r.customer_email,
        phone: r.customer_phone,
        kycStatus: r.customer_kyc || 'NOT_STARTED',
      },
      enquiryId: r.enquiry_id,
      application: r.application_id ? { id: r.application_id, status: r.application_status } : null,
      createdAt: r.created_at,
    }));

    return paginate(items, countRow?.total ?? 0, page, perPage);
  }

  async getProviderVisitDetail(user: AuthUser, visitId: number) {
    const row = await this.db.one<any>(
      `SELECT v.*,
              p.id AS property_id, p.title AS property_title, p.city, p.locality, p.rent_amount,
              p.security_deposit, p.listed_by_user_id, p.visibility_tier, p.is_featured,
              u.id AS customer_id, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS customer_kyc,
              app.id AS application_id, app.status AS application_status
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
         JOIN users u ON u.id = v.customer_user_id
         LEFT JOIN applications app ON app.enquiry_id = v.enquiry_id
        WHERE v.id = ?`,
      [visitId],
    );

    if (!row) throw new NotFoundException('Property visit not found.');
    if (row.listed_by_user_id !== user.id && row.host_user_id !== user.id && !this.isManagement(user)) {
      throw new ForbiddenException('You are not authorized to view this visit.');
    }

    const followUps = row.enquiry_id
      ? await this.db.query<any>('SELECT * FROM lead_follow_ups WHERE enquiry_id = ? ORDER BY id DESC', [row.enquiry_id])
      : [];

    return {
      id: row.id,
      publicId: row.public_id,
      status: row.status,
      visitType: row.visit_type,
      scheduledStart: row.scheduled_start,
      scheduledEnd: row.scheduled_end,
      timezone: row.timezone,
      customerNotes: row.customer_notes,
      providerNotes: row.provider_notes,
      cancellationReason: row.cancellation_reason,
      rescheduleReason: row.reschedule_reason,
      confirmedAt: row.confirmed_at,
      completedAt: row.completed_at,
      noShowAt: row.no_show_at,
      outcome: row.outcome,
      outcomeNotes: row.outcome_notes,
      property: {
        id: row.property_id,
        title: row.property_title,
        city: row.city,
        locality: row.locality,
        rentAmount: row.rent_amount !== null ? Number(row.rent_amount) : null,
        securityDeposit: row.security_deposit !== null ? Number(row.security_deposit) : null,
        visibilityTier: row.visibility_tier || 'STANDARD',
        isFeatured: Boolean(row.is_featured),
      },
      customer: {
        id: row.customer_id,
        name: row.customer_name,
        email: row.customer_email,
        phone: row.customer_phone,
        kycStatus: row.customer_kyc || 'NOT_STARTED',
      },
      enquiryId: row.enquiry_id,
      followUps,
      application: row.application_id ? { id: row.application_id, status: row.application_status } : null,
      createdAt: row.created_at,
    };
  }

  async proposeProviderVisit(user: AuthUser, enquiryId: number, dto: ProposeVisitDto, req?: Request) {
    const enq = await this.db.one<any>(
      `SELECT e.*, p.title AS property_title, p.listed_by_user_id
         FROM enquiries e
         JOIN properties p ON p.id = e.property_id
        WHERE e.id = ?`,
      [enquiryId],
    );
    if (!enq) throw new NotFoundException('Lead enquiry not found.');

    if (enq.listed_by_user_id !== user.id && enq.assigned_user_id !== user.id && !this.isManagement(user)) {
      throw new ForbiddenException('You are not authorized to propose a visit for this lead.');
    }

    const { start, end } = this.validateVisitTimes(dto.scheduledStart, dto.scheduledEnd);
    await this.checkSchedulingConflicts(enq.property_id, user.id, enq.tenant_user_id, start, end);

    const publicId = newPublicId();
    const visitId = await this.db.insert('property_visits', {
      public_id: publicId,
      enquiry_id: enquiryId,
      property_id: enq.property_id,
      customer_user_id: enq.tenant_user_id,
      host_user_id: user.id,
      scheduled_start: start,
      scheduled_end: end,
      timezone: 'Asia/Kolkata',
      status: 'PROPOSED',
      visit_type: dto.visitType || 'IN_PERSON',
      provider_notes: dto.providerNotes || null,
    });

    await this.db.update('enquiries', enquiryId, { status: 'VISIT_SCHEDULED' });

    await this.db.insert('lead_follow_ups', {
      enquiry_id: enquiryId,
      author_id: user.id,
      note: `Host proposed ${dto.visitType || 'IN_PERSON'} visit for ${start.toLocaleString()}. ${dto.providerNotes || ''}`.trim(),
      contact_channel: 'MEETING',
      scheduled_at: start,
    });

    await this.audit.record({
      actor: user,
      action: 'visit.proposed',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { enquiryId, scheduledStart: start, scheduledEnd: end },
      req,
    });

    await this.notifications.send(enq.tenant_user_id, 'MAINTENANCE_UPDATE', {
      title: 'Property Visit Proposed!',
      body: `A visit for "${enq.property_title}" was proposed for ${start.toDateString()}. Please confirm in your dashboard.`,
      actionUrl: `/dashboard/visits`,
    });

    return {
      id: visitId,
      publicId,
      status: 'PROPOSED',
      scheduledStart: start,
      scheduledEnd: end,
      message: 'Visit proposed to customer successfully.',
    };
  }

  async confirmProviderVisit(user: AuthUser, visitId: number, dto: ConfirmVisitDto, req?: Request) {
    const detail = await this.getProviderVisitDetail(user, visitId);

    if (detail.status === 'CONFIRMED') {
      return { id: visitId, status: 'CONFIRMED', message: 'Visit already confirmed.' };
    }

    if (!['REQUESTED', 'PROPOSED'].includes(detail.status)) {
      throw new BadRequestException('Only requested or proposed visits can be confirmed.');
    }

    const now = new Date();
    await this.db.update('property_visits', visitId, {
      status: 'CONFIRMED',
      confirmed_at: now,
      provider_notes: dto.notes ? `${detail.providerNotes || ''}\nConfirmation Note: ${dto.notes}`.trim() : detail.providerNotes,
    });

    if (detail.enquiryId) {
      await this.db.update('enquiries', detail.enquiryId, { status: 'VISIT_SCHEDULED' });
      await this.db.insert('lead_follow_ups', {
        enquiry_id: detail.enquiryId,
        author_id: user.id,
        note: `Host confirmed visit for ${new Date(detail.scheduledStart).toLocaleString()}. ${dto.notes || ''}`.trim(),
        contact_channel: 'MEETING',
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.confirmed',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { confirmedBy: 'PROVIDER' },
      req,
    });

    await this.notifications.send(detail.customer.id, 'MAINTENANCE_UPDATE', {
      title: 'Your Property Visit is Confirmed!',
      body: `Your visit for "${detail.property.title}" has been confirmed for ${new Date(detail.scheduledStart).toDateString()}.`,
      actionUrl: `/dashboard/visits`,
    });

    return { id: visitId, status: 'CONFIRMED', confirmedAt: now, message: 'Visit confirmed successfully.' };
  }

  async rescheduleProviderVisit(user: AuthUser, visitId: number, dto: RescheduleVisitDto, req?: Request) {
    const detail = await this.getProviderVisitDetail(user, visitId);

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Reschedule reason is mandatory.');
    }

    if (['COMPLETED', 'CANCELLED'].includes(detail.status)) {
      throw new BadRequestException('Cannot reschedule a completed or cancelled visit.');
    }

    const { start, end } = this.validateVisitTimes(dto.scheduledStart, dto.scheduledEnd);
    await this.checkSchedulingConflicts(detail.property.id, user.id, detail.customer.id, start, end, visitId);

    await this.db.update('property_visits', visitId, {
      scheduled_start: start,
      scheduled_end: end,
      status: 'PROPOSED',
      reschedule_reason: dto.reason.trim(),
      provider_notes: dto.notes ? `${detail.providerNotes || ''}\nReschedule Note: ${dto.notes}`.trim() : detail.providerNotes,
    });

    if (detail.enquiryId) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: detail.enquiryId,
        author_id: user.id,
        note: `Host rescheduled visit to ${start.toLocaleString()}. Reason: ${dto.reason.trim()}`,
        contact_channel: 'MEETING',
        scheduled_at: start,
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.rescheduled',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { rescheduledBy: 'PROVIDER', scheduledStart: start, scheduledEnd: end, reason: dto.reason },
      req,
    });

    await this.notifications.send(detail.customer.id, 'MAINTENANCE_UPDATE', {
      title: 'Property Visit Rescheduled',
      body: `The host rescheduled visit #${visitId} for "${detail.property.title}" to ${start.toDateString()}.`,
      actionUrl: `/dashboard/visits`,
    });

    return { id: visitId, status: 'PROPOSED', scheduledStart: start, scheduledEnd: end };
  }

  async cancelProviderVisit(user: AuthUser, visitId: number, dto: CancelVisitDto, req?: Request) {
    const detail = await this.getProviderVisitDetail(user, visitId);

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Cancellation reason is mandatory.');
    }

    if (['COMPLETED', 'CANCELLED'].includes(detail.status)) {
      throw new BadRequestException('Cannot cancel a completed or already cancelled visit.');
    }

    const now = new Date();
    await this.db.update('property_visits', visitId, {
      status: 'CANCELLED',
      cancelled_at: now,
      cancellation_reason: dto.reason.trim(),
    });

    if (detail.enquiryId) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: detail.enquiryId,
        author_id: user.id,
        note: `Host cancelled visit: ${dto.reason.trim()}`,
        contact_channel: 'OTHER',
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.cancelled',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { cancelledBy: 'PROVIDER', reason: dto.reason },
      req,
    });

    await this.notifications.send(detail.customer.id, 'MAINTENANCE_UPDATE', {
      title: 'Property Visit Cancelled',
      body: `The host cancelled visit #${visitId}. Reason: ${dto.reason}`,
      actionUrl: `/dashboard/visits`,
    });

    return { id: visitId, status: 'CANCELLED', cancellationReason: dto.reason };
  }

  async completeProviderVisit(user: AuthUser, visitId: number, dto: CompleteVisitDto, req?: Request) {
    const detail = await this.getProviderVisitDetail(user, visitId);

    if (!dto.outcome) {
      throw new BadRequestException('Visit outcome is mandatory.');
    }

    const now = new Date();
    await this.db.update('property_visits', visitId, {
      status: 'COMPLETED',
      completed_at: now,
      outcome: dto.outcome,
      outcome_notes: dto.outcomeNotes || null,
    });

    if (detail.enquiryId) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: detail.enquiryId,
        author_id: user.id,
        note: `Property visit completed. Outcome: ${dto.outcome}. Notes: ${dto.outcomeNotes || 'None'}`.trim(),
        contact_channel: 'MEETING',
      });

      if (['INTERESTED', 'VERY_INTERESTED', 'APPLICATION_EXPECTED'].includes(dto.outcome)) {
        await this.db.execute(
          `UPDATE enquiries SET status = 'QUALIFIED', qualified_at = COALESCE(qualified_at, NOW())
            WHERE id = ? AND status IN ('NEW', 'ASSIGNED', 'ACKNOWLEDGED', 'CONTACTED', 'VISIT_SCHEDULED')`,
          [detail.enquiryId],
        );
      }
    }

    await this.audit.record({
      actor: user,
      action: 'visit.completed',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { outcome: dto.outcome, outcomeNotes: dto.outcomeNotes },
      req,
    });

    await this.notifications.send(detail.customer.id, 'MAINTENANCE_UPDATE', {
      title: 'Property Visit Completed',
      body: `Thank you for visiting "${detail.property.title}"! You can now proceed to submit an application.`,
      actionUrl: `/dashboard/applications`,
    });

    return { id: visitId, status: 'COMPLETED', outcome: dto.outcome, completedAt: now };
  }

  async recordVisitNoShow(user: AuthUser, visitId: number, dto: NoShowVisitDto, req?: Request) {
    const detail = await this.getProviderVisitDetail(user, visitId);

    const status = dto.noShowParty === 'CUSTOMER' ? 'NO_SHOW_CUSTOMER' : 'NO_SHOW_PROVIDER';
    const now = new Date();

    await this.db.update('property_visits', visitId, {
      status,
      no_show_at: now,
      cancellation_reason: dto.reason || 'Marked as No-Show',
    });

    if (detail.enquiryId) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: detail.enquiryId,
        author_id: user.id,
        note: `Visit marked as ${status}. ${dto.reason || ''}`.trim(),
        contact_channel: 'OTHER',
      });
    }

    await this.audit.record({
      actor: user,
      action: dto.noShowParty === 'CUSTOMER' ? 'visit.no_show_customer' : 'visit.no_show_provider',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { noShowParty: dto.noShowParty, reason: dto.reason },
      req,
    });

    return { id: visitId, status, noShowAt: now };
  }

  async convertVisitToApplication(user: AuthUser, visitId: number, dto: ConvertLeadDto, req?: Request) {
    const detail = await this.getProviderVisitDetail(user, visitId);
    if (!detail.enquiryId) {
      throw new BadRequestException('This visit is not linked to a lead enquiry.');
    }

    const conv = await this.convertLead(user, detail.enquiryId, dto, req);

    await this.audit.record({
      actor: user,
      action: 'visit.application_started',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { applicationId: conv.applicationId, enquiryId: detail.enquiryId },
      req,
    });

    return {
      visitId,
      enquiryId: detail.enquiryId,
      applicationId: conv.applicationId,
      status: 'CONVERTED',
      message: 'Application initiated successfully from property visit.',
    };
  }

  // --- Admin Visit Operations ---

  async listAdminVisits(user: AuthUser, query: AdminVisitsQueryDto): Promise<Paginated<any>> {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can access the Admin Visits Control Centre.');
    }

    const { page, perPage, offset } = pageParams(query.page, query.perPage, 25);
    const whereClauses: string[] = ['p.deleted_at IS NULL'];
    const params: any[] = [];

    if (query.status && query.status !== 'ALL') {
      whereClauses.push('v.status = ?');
      params.push(query.status);
    }

    if (query.propertyId) {
      whereClauses.push('v.property_id = ?');
      params.push(query.propertyId);
    }

    if (query.hostUserId) {
      whereClauses.push('v.host_user_id = ?');
      params.push(query.hostUserId);
    }

    if (query.customerUserId) {
      whereClauses.push('v.customer_user_id = ?');
      params.push(query.customerUserId);
    }

    if (query.city) {
      whereClauses.push('p.city = ?');
      params.push(query.city);
    }

    if (query.outcome) {
      whereClauses.push('v.outcome = ?');
      params.push(query.outcome);
    }

    if (query.staleOnly === true || query.staleOnly === 'true') {
      whereClauses.push(`(
        (v.status = 'REQUESTED' AND v.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR
        (v.status = 'CONFIRMED' AND v.scheduled_end < DATE_SUB(NOW(), INTERVAL 24 HOUR))
      )`);
    }

    if (query.noShowOnly === true || query.noShowOnly === 'true') {
      whereClauses.push("v.status IN ('NO_SHOW_CUSTOMER', 'NO_SHOW_PROVIDER')");
    }

    if (query.dateFrom) {
      whereClauses.push('v.scheduled_start >= ?');
      params.push(query.dateFrom);
    }

    if (query.dateTo) {
      whereClauses.push('v.scheduled_start <= ?');
      params.push(query.dateTo);
    }

    if (query.q) {
      whereClauses.push('(u.full_name LIKE ? OR u.email LIKE ? OR host.full_name LIKE ? OR p.title LIKE ? OR p.city LIKE ?)');
      const term = `%${query.q}%`;
      params.push(term, term, term, term, term);
    }

    const where = whereClauses.join(' AND ');

    const rows = await this.db.query<any>(
      `SELECT v.id, v.public_id, v.scheduled_start, v.scheduled_end, v.timezone, v.status,
              v.visit_type, v.customer_notes, v.provider_notes, v.cancellation_reason, v.reschedule_reason,
              v.confirmed_at, v.completed_at, v.no_show_at, v.outcome, v.outcome_notes, v.sla_escalated, v.created_at,
              p.id AS property_id, p.title AS property_title, p.city, p.locality, p.rent_amount,
              p.visibility_tier, p.is_featured,
              u.id AS customer_id, u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone,
              host.id AS host_id, host.full_name AS host_name, host.email AS host_email, host.phone AS host_phone,
              v.enquiry_id, e.source AS lead_source, e.promotion_id,
              app.id AS application_id, app.status AS application_status
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
         JOIN users u ON u.id = v.customer_user_id
         JOIN users host ON host.id = v.host_user_id
         LEFT JOIN enquiries e ON e.id = v.enquiry_id
         LEFT JOIN applications app ON app.enquiry_id = v.enquiry_id
        WHERE ${where}
        ORDER BY v.scheduled_start DESC
        LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    );

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
         JOIN users u ON u.id = v.customer_user_id
         JOIN users host ON host.id = v.host_user_id
        WHERE ${where}`,
      params,
    );

    const items = rows.map((r) => ({
      id: r.id,
      publicId: r.public_id,
      status: r.status,
      visitType: r.visit_type,
      scheduledStart: r.scheduled_start,
      scheduledEnd: r.scheduled_end,
      timezone: r.timezone,
      customerNotes: r.customer_notes,
      providerNotes: r.provider_notes,
      cancellationReason: r.cancellation_reason,
      rescheduleReason: r.reschedule_reason,
      confirmedAt: r.confirmed_at,
      completedAt: r.completed_at,
      noShowAt: r.no_show_at,
      outcome: r.outcome,
      outcomeNotes: r.outcome_notes,
      slaEscalated: Boolean(r.sla_escalated),
      property: {
        id: r.property_id,
        title: r.property_title,
        city: r.city,
        locality: r.locality,
        rentAmount: r.rent_amount !== null ? Number(r.rent_amount) : null,
        visibilityTier: r.visibility_tier || 'STANDARD',
        isFeatured: Boolean(r.is_featured),
      },
      customer: {
        id: r.customer_id,
        name: r.customer_name,
        email: r.customer_email,
        phone: r.customer_phone,
      },
      host: {
        id: r.host_id,
        name: r.host_name,
        email: r.host_email,
        phone: r.host_phone,
      },
      enquiry: {
        id: r.enquiry_id,
        source: r.lead_source || 'ORGANIC',
        promotionId: r.promotion_id,
      },
      application: r.application_id ? { id: r.application_id, status: r.application_status } : null,
      createdAt: r.created_at,
    }));

    return paginate(items, countRow?.total ?? 0, page, perPage);
  }

  async getAdminVisitsAnalytics(user: AuthUser) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can view visits analytics.');
    }

    const [counts, attribution, timings, cityBreakdown, topHosts] = await Promise.all([
      this.db.one<any>(`
        SELECT
          COUNT(*) AS total_visits,
          SUM(IF(status = 'REQUESTED', 1, 0)) AS count_requested,
          SUM(IF(status = 'PROPOSED', 1, 0)) AS count_proposed,
          SUM(IF(status = 'CONFIRMED', 1, 0)) AS count_confirmed,
          SUM(IF(status = 'COMPLETED', 1, 0)) AS count_completed,
          SUM(IF(status = 'CANCELLED', 1, 0)) AS count_cancelled,
          SUM(IF(status = 'NO_SHOW_CUSTOMER', 1, 0)) AS count_noshow_customer,
          SUM(IF(status = 'NO_SHOW_PROVIDER', 1, 0)) AS count_noshow_provider,
          SUM(IF(
            (status = 'REQUESTED' AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)) OR
            (status = 'CONFIRMED' AND scheduled_end < DATE_SUB(NOW(), INTERVAL 24 HOUR)), 1, 0
          )) AS count_stale
        FROM property_visits
      `),
      this.db.query<any>(`
        SELECT COALESCE(e.source, 'ORGANIC') AS source, COUNT(v.id) AS count,
               SUM(IF(v.status = 'COMPLETED', 1, 0)) AS completed_count
          FROM property_visits v
          LEFT JOIN enquiries e ON e.id = v.enquiry_id
         GROUP BY source
      `),
      this.db.one<any>(`
        SELECT
          AVG(TIMESTAMPDIFF(HOUR, e.created_at, v.scheduled_start)) AS avg_enq_to_visit_hours,
          AVG(TIMESTAMPDIFF(HOUR, v.completed_at, app.created_at)) AS avg_visit_to_app_hours,
          COUNT(DISTINCT app.id) AS total_converted_apps
        FROM property_visits v
        LEFT JOIN enquiries e ON e.id = v.enquiry_id
        LEFT JOIN applications app ON app.enquiry_id = v.enquiry_id
        WHERE v.status = 'COMPLETED'
      `),
      this.db.query<any>(`
        SELECT p.city, COUNT(v.id) AS visit_count,
               SUM(IF(v.status = 'COMPLETED', 1, 0)) AS completed_count
          FROM property_visits v
          JOIN properties p ON p.id = v.property_id
         GROUP BY p.city
         ORDER BY visit_count DESC
         LIMIT 5
      `),
      this.db.query<any>(`
        SELECT u.id AS host_id, u.full_name AS host_name, COUNT(v.id) AS total_visits,
               SUM(IF(v.status = 'COMPLETED', 1, 0)) AS completed_visits,
               SUM(IF(v.status IN ('NO_SHOW_CUSTOMER','NO_SHOW_PROVIDER'), 1, 0)) AS no_show_count
          FROM property_visits v
          JOIN users u ON u.id = v.host_user_id
         GROUP BY u.id, u.full_name
         ORDER BY total_visits DESC
         LIMIT 5
      `),
    ]);

    const totalVisits = Number(counts?.total_visits || 0);
    const completed = Number(counts?.count_completed || 0);
    const cancelled = Number(counts?.count_cancelled || 0);
    const noShow = Number(counts?.count_noshow_customer || 0) + Number(counts?.count_noshow_provider || 0);
    const convertedApps = Number(timings?.total_converted_apps || 0);

    return {
      pipeline: {
        totalVisits,
        requested: Number(counts?.count_requested || 0),
        proposed: Number(counts?.count_proposed || 0),
        confirmed: Number(counts?.count_confirmed || 0),
        completed,
        cancelled,
        noShowCustomer: Number(counts?.count_noshow_customer || 0),
        noShowProvider: Number(counts?.count_noshow_provider || 0),
        staleVisits: Number(counts?.count_stale || 0),
      },
      rates: {
        completionRate: totalVisits > 0 ? Number(((completed / totalVisits) * 100).toFixed(2)) : 0,
        cancellationRate: totalVisits > 0 ? Number(((cancelled / totalVisits) * 100).toFixed(2)) : 0,
        noShowRate: totalVisits > 0 ? Number(((noShow / totalVisits) * 100).toFixed(2)) : 0,
        visitToApplicationRate: completed > 0 ? Number(((convertedApps / completed) * 100).toFixed(2)) : 0,
      },
      timings: {
        avgEnquiryToVisitHours: timings?.avg_enq_to_visit_hours ? Math.round(Number(timings.avg_enq_to_visit_hours)) : null,
        avgVisitToAppHours: timings?.avg_visit_to_app_hours ? Math.round(Number(timings.avg_visit_to_app_hours)) : null,
      },
      attribution,
      cityBreakdown,
      topHosts,
    };
  }

  async assignVisitHost(user: AuthUser, visitId: number, dto: AssignVisitDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Odibrick Management can assign visit hosts.');
    }

    const visit = await this.db.one<any>('SELECT * FROM property_visits WHERE id = ?', [visitId]);
    if (!visit) throw new NotFoundException('Property visit not found.');

    const newHost = await this.db.one<any>('SELECT id, full_name, email FROM users WHERE id = ?', [dto.hostUserId]);
    if (!newHost) throw new NotFoundException('Assigned host user not found.');

    const previousHostId = visit.host_user_id;
    await this.db.update('property_visits', visitId, {
      host_user_id: dto.hostUserId,
      provider_notes: dto.notes ? `${visit.provider_notes || ''}\nManagement Host Assignment: ${dto.notes}`.trim() : visit.provider_notes,
    });

    if (visit.enquiry_id) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: visit.enquiry_id,
        author_id: user.id,
        note: `Management reassigned visit host from #${previousHostId} to ${newHost.full_name}. ${dto.notes || ''}`.trim(),
        contact_channel: 'OTHER',
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.reassigned',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { previousHostId, newHostId: dto.hostUserId, notes: dto.notes },
      req,
    });

    await this.notifications.send(dto.hostUserId, 'MAINTENANCE_UPDATE', {
      title: 'Property Visit Assigned to You',
      body: `Management assigned visit #${visitId} to your schedule.`,
      actionUrl: `/dashboard/visits`,
    });

    return {
      id: visitId,
      hostUserId: dto.hostUserId,
      hostUserName: newHost.full_name,
      message: `Visit successfully assigned to ${newHost.full_name}.`,
    };
  }

  async overrideVisit(user: AuthUser, visitId: number, dto: OverrideVisitDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can execute visit overrides.');
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Management override reason is mandatory.');
    }

    const visit = await this.db.one<any>('SELECT * FROM property_visits WHERE id = ?', [visitId]);
    if (!visit) throw new NotFoundException('Property visit not found.');

    let targetStatus: string = visit.status;
    const updatePayload: any = {
      provider_notes: `${visit.provider_notes || ''}\n[Management Override: ${dto.action}] ${dto.reason}. ${dto.notes || ''}`.trim(),
    };

    if (dto.action === VisitOverrideAction.CONFIRM) {
      targetStatus = 'CONFIRMED';
      updatePayload.status = 'CONFIRMED';
      updatePayload.confirmed_at = new Date();
    } else if (dto.action === VisitOverrideAction.COMPLETE) {
      targetStatus = 'COMPLETED';
      updatePayload.status = 'COMPLETED';
      updatePayload.completed_at = new Date();
      updatePayload.outcome = VisitOutcome.INTERESTED;
    } else if (dto.action === VisitOverrideAction.CANCEL) {
      targetStatus = 'CANCELLED';
      updatePayload.status = 'CANCELLED';
      updatePayload.cancelled_at = new Date();
      updatePayload.cancellation_reason = dto.reason;
    } else if (dto.action === VisitOverrideAction.REOPEN) {
      targetStatus = 'PROPOSED';
      updatePayload.status = 'PROPOSED';
      updatePayload.cancelled_at = null;
      updatePayload.no_show_at = null;
    } else if (dto.action === VisitOverrideAction.RESCHEDULE && dto.scheduledStart) {
      const { start, end } = this.validateVisitTimes(dto.scheduledStart, dto.scheduledEnd, true);
      targetStatus = 'CONFIRMED';
      updatePayload.status = 'CONFIRMED';
      updatePayload.scheduled_start = start;
      updatePayload.scheduled_end = end;
      updatePayload.reschedule_reason = dto.reason;
    }

    await this.db.update('property_visits', visitId, updatePayload);

    if (visit.enquiry_id) {
      await this.db.insert('lead_follow_ups', {
        enquiry_id: visit.enquiry_id,
        author_id: user.id,
        note: `[Management Override] ${dto.action}: ${dto.reason}`,
        contact_channel: 'OTHER',
      });
    }

    await this.audit.record({
      actor: user,
      action: 'visit.management_override',
      objectType: 'property_visit',
      objectId: visitId,
      metadata: { action: dto.action, reason: dto.reason, previousStatus: visit.status, newStatus: targetStatus },
      req,
    });

    return {
      id: visitId,
      status: targetStatus,
      action: dto.action,
      reason: dto.reason,
      message: `Visit successfully updated by Management Override.`,
    };
  }

  async cancelAdminVisit(user: AuthUser, visitId: number, dto: CancelVisitDto, req?: Request) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can cancel visits administratively.');
    }

    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('Cancellation reason is mandatory.');
    }

    return this.overrideVisit(user, visitId, {
      action: VisitOverrideAction.CANCEL,
      reason: dto.reason,
    }, req);
  }

  async processVisitReminders(user: AuthUser) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can trigger automated visit reminders.');
    }

    // 1. 24-hour reminders: visits happening in the next 24 hours that haven't sent 24h reminder
    const due24h = await this.db.query<any>(
      `SELECT v.id, v.scheduled_start, v.customer_user_id, v.host_user_id, p.title AS property_title
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
        WHERE v.status = 'CONFIRMED'
          AND v.scheduled_start BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 24 HOUR)
          AND v.reminder_24h_sent = 0`,
    );

    let reminders24hSent = 0;
    for (const v of due24h) {
      await this.db.update('property_visits', v.id, { reminder_24h_sent: 1 });
      await this.notifications.send(v.customer_user_id, 'MAINTENANCE_UPDATE', {
        title: 'Upcoming Visit Reminder (24h)',
        body: `Reminder: You have a confirmed visit tomorrow for "${v.property_title}" at ${new Date(v.scheduled_start).toLocaleTimeString()}.`,
        actionUrl: `/dashboard/visits`,
      });
      await this.notifications.send(v.host_user_id, 'MAINTENANCE_UPDATE', {
        title: 'Upcoming Visit Reminder (24h)',
        body: `Reminder: You have a scheduled property walkthrough tomorrow for "${v.property_title}".`,
        actionUrl: `/dashboard/visits`,
      });
      reminders24hSent++;
    }

    // 2. 2-hour reminders: visits happening in the next 2 hours that haven't sent 2h reminder
    const due2h = await this.db.query<any>(
      `SELECT v.id, v.scheduled_start, v.customer_user_id, v.host_user_id, p.title AS property_title
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
        WHERE v.status = 'CONFIRMED'
          AND v.scheduled_start BETWEEN NOW() AND DATE_ADD(NOW(), INTERVAL 2 HOUR)
          AND v.reminder_2h_sent = 0`,
    );

    let reminders2hSent = 0;
    for (const v of due2h) {
      await this.db.update('property_visits', v.id, { reminder_2h_sent: 1 });
      await this.notifications.send(v.customer_user_id, 'MAINTENANCE_UPDATE', {
        title: 'Visit Starting Soon (2h)',
        body: `Your property visit for "${v.property_title}" begins in 2 hours!`,
        actionUrl: `/dashboard/visits`,
      });
      reminders2hSent++;
    }

    return {
      reminders24hSent,
      reminders2hSent,
      totalProcessed: reminders24hSent + reminders2hSent,
      timestamp: new Date(),
    };
  }

  async processVisitSlaEscalations(user: AuthUser) {
    if (!this.isManagement(user)) {
      throw new ForbiddenException('Only Management can process visit SLA escalations.');
    }

    // Stale requested visits > 24 hours unacknowledged
    const staleRequested = await this.db.query<any>(
      `SELECT v.id, v.property_id, v.host_user_id, p.title AS property_title
         FROM property_visits v
         JOIN properties p ON p.id = v.property_id
        WHERE v.status = 'REQUESTED'
          AND v.created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
          AND v.sla_escalated = 0`,
    );

    let escalatedCount = 0;
    for (const v of staleRequested) {
      await this.db.update('property_visits', v.id, { sla_escalated: 1 });
      await this.audit.record({
        actor: user,
        action: 'visit.sla_escalated',
        objectType: 'property_visit',
        objectId: v.id,
        metadata: { reason: 'Visit request unacknowledged for > 24 hours' },
      });
      escalatedCount++;
    }

    return {
      escalatedCount,
      timestamp: new Date(),
      message: `Successfully processed visit SLA escalations (${escalatedCount} visits flagged).`,
    };
  }
}


