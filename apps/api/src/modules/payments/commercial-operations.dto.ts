import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsPositive,
  IsBoolean,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CommercialCategory {
  COMMISSION = 'COMMISSION',
  SERVICE_FEE = 'SERVICE_FEE',
  LEGAL_FEE = 'LEGAL_FEE',
  MARKETING_PACKAGE = 'MARKETING_PACKAGE',
}

export enum CommercialAppliesTo {
  STANDARD = 'STANDARD',
  PROTECTED = 'PROTECTED',
  MANAGED = 'MANAGED',
  SALE = 'SALE',
  ALL = 'ALL',
}

export enum CommercialBasis {
  PERCENT_OF_MONTHLY_RENT = 'PERCENT_OF_MONTHLY_RENT',
  PERCENT_OF_ANNUAL_RENT = 'PERCENT_OF_ANNUAL_RENT',
  FLAT_FEE = 'FLAT_FEE',
  PERCENT_OF_TRANSACTION = 'PERCENT_OF_TRANSACTION',
}

export enum CommercialPayer {
  OWNER = 'OWNER',
  TENANT = 'TENANT',
  AGENT = 'AGENT',
  BUILDER = 'BUILDER',
  SPLIT = 'SPLIT',
}

export enum CommercialObligationStatus {
  CALCULATED = 'CALCULATED',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  PAYMENT_DUE = 'PAYMENT_DUE',
  PAID = 'PAID',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  WAIVED = 'WAIVED',
  CANCELLED = 'CANCELLED',
  DISPUTED = 'DISPUTED',
}

export class CreateCommercialRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(48)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsEnum(CommercialCategory)
  category!: CommercialCategory;

  @IsEnum(CommercialAppliesTo)
  @IsOptional()
  appliesTo: CommercialAppliesTo = CommercialAppliesTo.STANDARD;

  @IsEnum(CommercialBasis)
  basis!: CommercialBasis;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(500)
  percentValue?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  flatValue?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minAmount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  maxAmount?: number;

  @IsEnum(CommercialPayer)
  @IsOptional()
  payer: CommercialPayer = CommercialPayer.OWNER;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  taxRate: number = 18.0;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(1000)
  priority: number = 10;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  city?: string;

  @IsDateString()
  effectiveFrom!: string;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @IsBoolean()
  @IsOptional()
  isActive: boolean = true;
}

export class UpdateCommercialRuleDto {
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(500)
  percentValue?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  flatValue?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minAmount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  maxAmount?: number;

  @IsEnum(CommercialPayer)
  @IsOptional()
  payer?: CommercialPayer;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Max(100)
  taxRate?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(1000)
  priority?: number;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  city?: string;

  @IsDateString()
  @IsOptional()
  effectiveFrom?: string;

  @IsDateString()
  @IsOptional()
  effectiveTo?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class PreviewCommercialCalculationDto {
  @IsEnum(CommercialCategory)
  category!: CommercialCategory;

  @IsEnum(CommercialBasis)
  basis!: CommercialBasis;

  @IsNumber()
  @IsPositive()
  baseAmount!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  percentValue?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  flatValue?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  minAmount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  maxAmount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  taxRate: number = 18.0;
}

export class QueryCommercialObligationsDto {
  @IsEnum(CommercialCategory)
  @IsOptional()
  category?: CommercialCategory;

  @IsEnum(CommercialObligationStatus)
  @IsOptional()
  status?: CommercialObligationStatus;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  tenancyId?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  propertyId?: number;

  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  payerUserId?: number;

  @IsString()
  @IsOptional()
  search?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 25;
}

export class ApproveCommercialObligationDto {
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  notes?: string;
}

export class WaiveCommercialObligationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;

  @IsNumber()
  @IsOptional()
  @Min(0)
  waiverAmount?: number;
}

export class AdjustCommercialObligationDto {
  @IsEnum(['WAIVER', 'DISCOUNT', 'CORRECTION', 'RECALCULATION'])
  adjustmentType!: 'WAIVER' | 'DISCOUNT' | 'CORRECTION' | 'RECALCULATION';

  @IsNumber()
  amountAdjusted!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelCommercialObligationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}

export class QueryCommercialRevenueDto {
  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsEnum(CommercialCategory)
  @IsOptional()
  category?: CommercialCategory;

  @IsString()
  @IsOptional()
  groupBy?: 'month' | 'category' | 'property' | 'rule';
}
