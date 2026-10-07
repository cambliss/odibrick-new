import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FurnishingStatus, InteractionType, PropertyType, RecommendationCategory } from './personalization.types';

export class UpsertPreferencesDto {
  @IsOptional()
  @IsString()
  preferredCity?: string;

  @IsOptional()
  @IsString()
  preferredLocality?: string;

  @IsOptional()
  @IsString()
  propertyType?: PropertyType;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minBhk?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxBhk?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minRent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxRent?: number;

  @IsOptional()
  @IsString()
  furnishing?: FurnishingStatus;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  preferredAmenities?: string[];

  @IsOptional()
  @IsNumber()
  minCarpetAreaSqft?: number;

  @IsOptional()
  @IsNumber()
  preferredLeaseDurationMonths?: number;

  @IsOptional()
  @IsString()
  moveInTimeframe?: string;

  @IsOptional()
  @IsString()
  tenantType?: string;
}

export class CreateSavedSearchDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  locality?: string;

  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsOptional()
  @IsNumber()
  minBhk?: number;

  @IsOptional()
  @IsNumber()
  maxBhk?: number;

  @IsOptional()
  @IsNumber()
  minRent?: number;

  @IsOptional()
  @IsNumber()
  maxRent?: number;

  @IsOptional()
  @IsString()
  furnishing?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isAlertEnabled?: boolean;

  @IsOptional()
  @IsEnum(['INSTANT', 'DAILY', 'WEEKLY'])
  frequency?: 'INSTANT' | 'DAILY' | 'WEEKLY';
}

export class UpdateSavedSearchDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  locality?: string;

  @IsOptional()
  @IsString()
  propertyType?: string;

  @IsOptional()
  @IsNumber()
  minBhk?: number;

  @IsOptional()
  @IsNumber()
  maxBhk?: number;

  @IsOptional()
  @IsNumber()
  minRent?: number;

  @IsOptional()
  @IsNumber()
  maxRent?: number;

  @IsOptional()
  @IsString()
  furnishing?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  amenities?: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  isAlertEnabled?: boolean;

  @IsOptional()
  @IsEnum(['INSTANT', 'DAILY', 'WEEKLY'])
  frequency?: 'INSTANT' | 'DAILY' | 'WEEKLY';
}

export class TrackInteractionDto {
  @IsNumber()
  propertyId: number;

  @IsEnum(['VIEW', 'SAVE', 'UNSAVE', 'ENQUIRY', 'VISIT_REQUEST', 'APPLICATION', 'SHARE'])
  interactionType: InteractionType;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class RecommendationQueryDto {
  @IsOptional()
  @IsEnum(['FOR_YOU', 'SIMILAR_TO_SAVED', 'SIMILAR_TO_VIEWED', 'NEW_MATCHES', 'TRENDING_IN_AREA'])
  category?: RecommendationCategory;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}
