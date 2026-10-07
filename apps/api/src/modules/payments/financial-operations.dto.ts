import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StartReconciliationRunDto {
  @IsOptional()
  @IsString()
  periodStart?: string;

  @IsOptional()
  @IsString()
  periodEnd?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryReconciliationRunsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;
}

export class QueryExceptionsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  severity?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  runId?: number;

  @IsOptional()
  @IsString()
  search?: string;
}

export class AcknowledgeExceptionDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class AssignExceptionDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsNumber()
  assignedTo!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ResolveExceptionDto {
  @IsNotEmpty()
  @IsString()
  resolutionNotes!: string;

  @IsOptional()
  @IsString()
  resolutionType?: string;
}

export class ReopenExceptionDto {
  @IsNotEmpty()
  @IsString()
  notes!: string;
}

export class CreatePeriodDto {
  @IsNotEmpty()
  @IsString()
  periodCode!: string; // e.g. '2026-10'

  @IsNotEmpty()
  @IsString()
  periodStart!: string; // '2026-10-01'

  @IsNotEmpty()
  @IsString()
  periodEnd!: string; // '2026-10-31'

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReviewPeriodDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ClosePeriodDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class QueryPeriodsDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  pageSize?: number = 20;

  @IsOptional()
  @IsString()
  status?: string;
}

export class QuerySourceCoverageDto {
  @IsOptional()
  @IsString()
  periodStart?: string;

  @IsOptional()
  @IsString()
  periodEnd?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  ownerUserId?: number;

  @IsOptional()
  @IsString()
  coverageStatus?: string;
}
