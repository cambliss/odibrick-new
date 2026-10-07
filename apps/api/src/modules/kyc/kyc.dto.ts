import {
  IsArray,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SubmitKycDto {
  @IsOptional()
  @IsIn(['INDIVIDUAL', 'BUSINESS'])
  subjectType?: 'INDIVIDUAL' | 'BUSINESS';

  @IsString()
  @MaxLength(190)
  legalName!: string;

  @IsIn(['AADHAAR', 'PAN', 'PASSPORT', 'DL', 'VOTER_ID', 'GSTIN', 'CIN', 'OTHER'])
  idType!: 'AADHAAR' | 'PAN' | 'PASSPORT' | 'DL' | 'VOTER_ID' | 'GSTIN' | 'CIN' | 'OTHER';

  @IsOptional()
  @Matches(/^[A-Za-z0-9-]{6,24}$/, { message: 'Enter the document number as printed.' })
  idNumber?: string;

  @IsOptional()
  @IsArray()
  documentIds?: number[];
}

export class KycDecisionDto {
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_DOCUMENTS', 'SUSPEND', 'REOPEN'])
  decision!: 'APPROVE' | 'REJECT' | 'REQUEST_DOCUMENTS' | 'SUSPEND' | 'REOPEN';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class VerifyKycDto {
  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class RejectKycDto {
  @IsString()
  @MinLength(3, { message: 'Rejection reason is required.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class RequestAdditionalDocsDto {
  @IsString()
  @MinLength(3, { message: 'Correction / additional details reason is required.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class SuspendKycDto {
  @IsString()
  @MinLength(3, { message: 'Suspension reason is required.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class ReopenKycDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class AssignKycVerifierDto {
  @IsNumber()
  verifierId!: number;
}
