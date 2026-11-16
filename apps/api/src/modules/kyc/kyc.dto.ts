import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * Document types that may be supplied alongside the mandatory passport.
 * AADHAAR is deliberately absent: it stays disabled until a separate legal and
 * privacy review authorises collecting it.
 */
export const OPTIONAL_IDENTITY_TYPES = ['PAN', 'VOTER_ID', 'DRIVING_LICENCE', 'OTHER'] as const;
export type OptionalIdentityType = (typeof OPTIONAL_IDENTITY_TYPES)[number];

export const KYC_CONSENT_PURPOSES = ['KYC_PROCESSING', 'BIOMETRIC_PROCESSING'] as const;
export type KycConsentPurpose = (typeof KYC_CONSENT_PURPOSES)[number];

export class PassportDetailsDto {
  @IsInt()
  @Min(1)
  documentId!: number;

  /** Number as printed. Validated generically; never stored in full by default. */
  @IsString()
  @Matches(/^[A-Za-z0-9 \-/.]{5,24}$/, { message: 'Enter the passport number exactly as printed.' })
  number!: string;

  @IsString()
  @Matches(/^[A-Za-z<]{1,3}$/, { message: 'Enter the issuing country code printed on the passport.' })
  issuingCountry!: string;

  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z<]{1,3}$/, { message: 'Enter a valid nationality code.' })
  nationality?: string;

  @IsDateString({ strict: true })
  dateOfBirth!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  issueDate?: string;

  @IsDateString({ strict: true })
  expiryDate!: string;

  /** Optional machine-readable zone lines, validated locally and discarded (never stored). */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(3)
  @IsString({ each: true })
  @MaxLength(44, { each: true })
  mrzLines?: string[];
}

export class SupportingDocumentDto {
  @IsInt()
  @Min(1)
  documentId!: number;

  @IsIn([...OPTIONAL_IDENTITY_TYPES], {
    message: 'Unsupported supporting document type. Aadhaar is not accepted at this time.',
  })
  type!: OptionalIdentityType;

  /** Optional. Only the last four characters and a keyed hash are kept. */
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9 \-/]{4,24}$/, { message: 'Enter the document number as printed.' })
  number?: string;
}

export class ConsentDto {
  @IsIn([...KYC_CONSENT_PURPOSES])
  purpose!: KycConsentPurpose;

  @IsString()
  @MaxLength(32)
  version!: string;

  @IsBoolean()
  accepted!: boolean;
}

export class SubmitKycDto {
  /** Full name exactly as printed on the passport. */
  @IsString()
  @MinLength(2)
  @MaxLength(190)
  legalName!: string;

  @ValidateNested()
  @Type(() => PassportDetailsDto)
  passport!: PassportDetailsDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => SupportingDocumentDto)
  supportingDocuments?: SupportingDocumentDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => ConsentDto)
  consents!: ConsentDto[];
}

/** Legacy reviewer endpoint payload (kept for the /decision alias). */
export class KycDecisionDto {
  @IsIn(['APPROVE', 'REJECT', 'REQUEST_DOCUMENTS', 'SUSPEND', 'REOPEN'])
  decision!: 'APPROVE' | 'REJECT' | 'REQUEST_DOCUMENTS' | 'SUSPEND' | 'REOPEN';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;
}

export class VerifyKycDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;

  /** Optional supporting documents the reviewer is also verifying (never the passport slot). */
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  verifyOptionalDocumentIds?: number[];
}

export class RejectKycDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsString()
  @MinLength(10, { message: 'Give the user a clear reason of at least 10 characters.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  reasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class RequestAdditionalDocsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsString()
  @MinLength(10, { message: 'Explain what is needed in at least 10 characters.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class SuspendKycDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsString()
  @MinLength(10, { message: 'Suspension reason must be at least 10 characters.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class ReopenKycDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  expectedVersion?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class OverrideKycDto {
  @IsIn(['VERIFIED', 'REJECTED', 'UNDER_REVIEW', 'SUSPENDED'])
  targetStatus!: 'VERIFIED' | 'REJECTED' | 'UNDER_REVIEW' | 'SUSPENDED';

  @IsInt()
  @Min(0)
  expectedVersion!: number;

  @IsString()
  @MinLength(15, { message: 'An override needs a documented reason of at least 15 characters.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsDateString({ strict: true })
  expiresAt?: string;
}

export class ReverifyKycDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AssignKycVerifierDto {
  @IsNumber()
  verifierId!: number;
}
