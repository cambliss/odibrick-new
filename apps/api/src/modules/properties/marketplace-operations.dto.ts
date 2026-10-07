import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum MarketplaceListingStatus {
  ALL = 'ALL',
  DRAFT = 'DRAFT',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  SUSPENDED = 'SUSPENDED',
  REJECTED = 'REJECTED',
  RENTED = 'RENTED',
  SOLD = 'SOLD',
  ARCHIVED = 'ARCHIVED',
}

export enum VisibilityTier {
  STANDARD = 'STANDARD',
  FEATURED = 'FEATURED',
  PROMOTED = 'PROMOTED',
  PREMIUM = 'PREMIUM',
}

export enum ModerationDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_CORRECTION = 'REQUEST_CORRECTION',
  SUSPEND = 'SUSPEND',
  RESTORE = 'RESTORE',
  ARCHIVE = 'ARCHIVE',
  FORCE_PUBLISH = 'FORCE_PUBLISH',
}

export enum PromotionOverrideAction {
  FEATURE = 'FEATURE',
  BOOST = 'BOOST',
  PREMIUM = 'PREMIUM',
  REMOVE_PROMOTION = 'REMOVE_PROMOTION',
  EXTEND = 'EXTEND',
}

export enum LeadStatus {
  NEW = 'NEW',
  ASSIGNED = 'ASSIGNED',
  ACKNOWLEDGED = 'ACKNOWLEDGED',
  CONTACTED = 'CONTACTED',
  VISIT_SCHEDULED = 'VISIT_SCHEDULED',
  QUALIFIED = 'QUALIFIED',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST',
  SPAM = 'SPAM',
  CLOSED = 'CLOSED',
}

export enum ContactChannel {
  CALL = 'CALL',
  EMAIL = 'EMAIL',
  CHAT = 'CHAT',
  WHATSAPP = 'WHATSAPP',
  MEETING = 'MEETING',
  OTHER = 'OTHER',
}

export class MarketplaceListingsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsEnum(VisibilityTier)
  visibilityTier?: VisibilityTier;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsOptional()
  @IsString()
  listingType?: string;

  @IsOptional()
  @IsString()
  photoFilter?: string;

  @IsOptional()
  verifiedOnly?: boolean | string;

  @IsOptional()
  duplicateFlagged?: boolean | string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

export class ModerateListingDto {
  @IsEnum(ModerationDecision)
  decision!: ModerationDecision;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ManagementPromotionOverrideDto {
  @IsEnum(PromotionOverrideAction)
  action!: PromotionOverrideAction;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  durationDays?: number;

  @IsOptional()
  @IsEnum(VisibilityTier)
  visibilityTier?: VisibilityTier;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class PreviewPackagePurchaseDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  listingId!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  packageId!: number;
}

export class PurchasePackageDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  listingId!: number;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  packageId!: number;

  @IsOptional()
  @IsString()
  startsOn?: string;
}

export class MarketplaceLeadsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  listingId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  propertyId?: number;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

export class RecordLeadDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  propertyId!: number;

  @IsOptional()
  @IsString()
  message?: string;

  @IsOptional()
  @IsString()
  contactPref?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  promotionId?: number;
}

// ------------------------------------------------------------- Phase 10 DTOs
export class AssignLeadDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  assignedUserId!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ContactLeadDto {
  @IsOptional()
  @IsString()
  contactChannel?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  nextFollowUpAt?: string;
}

export class QualifyLeadDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budgetMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  budgetMax?: number;

  @IsOptional()
  @IsString()
  householdType?: string;

  @IsOptional()
  @IsString()
  nextFollowUpAt?: string;
}

export class FollowUpLeadDto {
  @IsString()
  note!: string;

  @IsOptional()
  @IsString()
  contactChannel?: string;

  @IsOptional()
  @IsString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  nextFollowUpAt?: string;
}

export class MarkLeadLostDto {
  @IsString()
  reason!: string;
}

export class ConvertLeadDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offeredRent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  offeredDeposit?: number;

  @IsOptional()
  @IsString()
  moveInDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  tenureMonths?: number;

  @IsOptional()
  @IsString()
  message?: string;
}

export class MarkLeadSpamDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class MarkLeadDuplicateDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  duplicateOfEnquiryId!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AdminLeadsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  propertyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedUserId?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  staleOnly?: boolean | string;

  @IsOptional()
  spamOnly?: boolean | string;

  @IsOptional()
  duplicateOnly?: boolean | string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

export class ProviderLeadsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  propertyId?: number;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  staleOnly?: boolean | string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

export class SavePropertyDto {
  @IsOptional()
  @IsString()
  note?: string;
}

// =========================================================================
// PHASE 11: PROPERTY VISIT / SITE VISIT OPERATIONS DTOS & ENUMS
// =========================================================================

export enum VisitStatus {
  REQUESTED = 'REQUESTED',
  PROPOSED = 'PROPOSED',
  CONFIRMED = 'CONFIRMED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  NO_SHOW_CUSTOMER = 'NO_SHOW_CUSTOMER',
  NO_SHOW_PROVIDER = 'NO_SHOW_PROVIDER',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

export enum VisitType {
  IN_PERSON = 'IN_PERSON',
  VIDEO_TOUR = 'VIDEO_TOUR',
}

export enum VisitOutcome {
  INTERESTED = 'INTERESTED',
  VERY_INTERESTED = 'VERY_INTERESTED',
  NEEDS_MORE_INFORMATION = 'NEEDS_MORE_INFORMATION',
  NOT_INTERESTED = 'NOT_INTERESTED',
  APPLICATION_EXPECTED = 'APPLICATION_EXPECTED',
  NO_DECISION = 'NO_DECISION',
  PROPERTY_NOT_SUITABLE = 'PROPERTY_NOT_SUITABLE',
  OTHER = 'OTHER',
}

export enum VisitOverrideAction {
  CONFIRM = 'CONFIRM',
  RESCHEDULE = 'RESCHEDULE',
  CANCEL = 'CANCEL',
  COMPLETE = 'COMPLETE',
  REOPEN = 'REOPEN',
}

export class RequestVisitDto {
  @Type(() => Number)
  @IsInt()
  propertyId: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  enquiryId?: number;

  @IsDateString()
  scheduledStart: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @IsOptional()
  @IsString()
  customerNotes?: string;
}

export class ProposeVisitDto {
  @IsDateString()
  scheduledStart: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @IsOptional()
  @IsEnum(VisitType)
  visitType?: VisitType;

  @IsOptional()
  @IsString()
  providerNotes?: string;
}

export class ConfirmVisitDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RescheduleVisitDto {
  @IsDateString()
  scheduledStart: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CancelVisitDto {
  @IsString()
  reason: string;
}

export class CompleteVisitDto {
  @IsEnum(VisitOutcome)
  outcome: VisitOutcome;

  @IsOptional()
  @IsString()
  outcomeNotes?: string;
}

export class NoShowVisitDto {
  @IsEnum(['CUSTOMER', 'PROVIDER'])
  noShowParty: 'CUSTOMER' | 'PROVIDER';

  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignVisitDto {
  @Type(() => Number)
  @IsInt()
  hostUserId: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class OverrideVisitDto {
  @IsEnum(VisitOverrideAction)
  action: VisitOverrideAction;

  @IsString()
  reason: string;

  @IsOptional()
  @IsDateString()
  scheduledStart?: string;

  @IsOptional()
  @IsDateString()
  scheduledEnd?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CustomerVisitsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  upcomingOnly?: boolean | string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

export class ProviderVisitsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  propertyId?: number;

  @IsOptional()
  upcomingOnly?: boolean | string;

  @IsOptional()
  staleOnly?: boolean | string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

export class AdminVisitsQueryDto {
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  propertyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  hostUserId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  customerUserId?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  outcome?: string;

  @IsOptional()
  staleOnly?: boolean | string;

  @IsOptional()
  noShowOnly?: boolean | string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  perPage?: number;
}

