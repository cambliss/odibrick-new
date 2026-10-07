import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class PreviewPayoutDto {
  @Type(() => Number)
  @IsInt()
  ownerUserId!: number;

  @IsOptional()
  @IsString()
  periodStart?: string;

  @IsOptional()
  @IsString()
  periodEnd?: string;
}

export class CreatePayoutDto {
  @Type(() => Number)
  @IsInt()
  ownerUserId!: number;

  @IsString()
  periodStart!: string;

  @IsString()
  periodEnd!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  payoutAccountId?: number;

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Type(() => Number)
  selectedPaymentIds?: number[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ApprovePayoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RejectPayoutDto {
  @IsString()
  @MinLength(5, { message: 'Rejection reason must be at least 5 characters long.' })
  @MaxLength(255)
  reason!: string;
}

export class HoldPayoutDto {
  @IsString()
  @MinLength(5, { message: 'Hold reason must be at least 5 characters long.' })
  @MaxLength(255)
  reason!: string;
}

export class ProcessPayoutDto {
  @IsOptional()
  @IsString()
  @MaxLength(48)
  payoutMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class RecordPayoutPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  paidAmount!: number;

  @IsString()
  @MinLength(3, { message: 'External reference/UTR must be at least 3 characters long.' })
  @MaxLength(120)
  externalReference!: string;

  @IsOptional()
  @IsString()
  @MaxLength(48)
  payoutMethod?: string;

  @IsOptional()
  @IsString()
  settlementDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class ReconcilePayoutDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualAmount!: number;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  externalReference!: string;

  @IsOptional()
  @IsString()
  settlementDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class PayoutQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  @IsOptional()
  @IsIn([
    'ALL',
    'CALCULATED',
    'PENDING_REVIEW',
    'APPROVED',
    'PROCESSING',
    'PAID',
    'REJECTED',
    'ON_HOLD',
    'FAILED',
    'CANCELLED',
  ])
  status?: string;

  @IsOptional()
  @IsIn(['ALL', 'UNRECONCILED', 'MATCHED', 'PARTIALLY_MATCHED', 'MISMATCHED'])
  reconciliationStatus?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  ownerUserId?: number;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  q?: string;
}
