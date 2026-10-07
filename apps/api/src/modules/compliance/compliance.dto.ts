import { IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ResolveExceptionDto {
  @IsString()
  @MinLength(3, { message: 'Resolution notes are required.' })
  @MaxLength(1000)
  resolutionNotes!: string;
}

export class OverrideComplianceDto {
  @IsString()
  @MinLength(5, { message: 'Override reason is mandatory for governance compliance.' })
  @MaxLength(500)
  overrideReason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  resolutionNotes?: string;
}

export class CreateExceptionDto {
  @IsIn([
    'MISSING_REQUIRED_DOCUMENT',
    'DOCUMENT_REJECTED',
    'DOCUMENT_EXPIRED',
    'KYC_PENDING',
    'KYC_REJECTED',
    'KYC_EXPIRED',
    'PROPERTY_DOCUMENT_MISSING',
    'APPLICATION_DOCUMENT_MISSING',
    'LEGAL_DOCUMENT_MISSING',
    'OTHER',
  ])
  category!: string;

  @IsIn(['USER', 'PROPERTY', 'APPLICATION', 'LEGAL_CASE', 'AGREEMENT', 'TENANCY', 'DISPUTE', 'MAINTENANCE', 'SUPPORT', 'KYC'])
  contextType!: string;

  @IsNumber()
  contextId!: number;

  @IsOptional()
  @IsNumber()
  userId?: number;

  @IsOptional()
  @IsNumber()
  documentId?: number;

  @IsString()
  @MaxLength(190)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export class AssignExceptionDto {
  @IsNumber()
  assignedTo!: number;
}
