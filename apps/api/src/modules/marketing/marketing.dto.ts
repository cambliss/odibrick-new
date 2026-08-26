import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min,
} from 'class-validator';

export class PackageDto {
  @IsString() @MaxLength(48) code!: string;
  @IsString() @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(190) tagline?: string;
  @IsOptional() @IsIn(['AGENT','BUILDER','OWNER','ANY']) audience?: string;
  @IsOptional() @Type(() => Number) @IsInt() durationDays?: number;
  @Type(() => Number) @IsNumber() @Min(0) price!: number;
  @IsOptional() @Type(() => Number) @IsNumber() taxRate?: number;
  @IsOptional() @Type(() => Number) @IsNumber() adBudgetIncluded?: number;
  @IsOptional() @IsArray() features?: string[];
  @IsOptional() @IsArray() channels?: string[];
  @IsOptional() @Type(() => Number) @IsInt() featuredSlots?: number;
  @IsOptional() @IsBoolean() isCustomQuote?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateOrderDto {
  @Type(() => Number) @IsInt() packageId!: number;
  @IsOptional() @IsString() @MaxLength(190) campaignName?: string;
  @IsOptional() @IsIn(['LEADS','VISIBILITY','SITE_VISITS','BOOKINGS']) objective?: string;
  @IsOptional() @IsArray() propertyIds?: number[];
  @IsOptional() @IsString() @MaxLength(4000) brief?: string;
  @IsOptional() @IsDateString() startsOn?: string;
}

export class CampaignUpdateDto {
  @IsOptional() @IsIn(['REQUESTED','APPROVED','IN_PRODUCTION','SCHEDULED','LIVE','PAUSED','COMPLETED']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() managerId?: number;
  @IsOptional() @Type(() => Number) @IsNumber() budget?: number;
  @IsOptional() @Type(() => Number) @IsNumber() spend?: number;
  @IsOptional() @Type(() => Number) @IsInt() impressions?: number;
  @IsOptional() @Type(() => Number) @IsInt() clicks?: number;
  @IsOptional() @Type(() => Number) @IsInt() leads?: number;
  @IsOptional() @IsDateString() startsOn?: string;
  @IsOptional() @IsDateString() endsOn?: string;
}
