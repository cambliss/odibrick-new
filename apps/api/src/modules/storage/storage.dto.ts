import { IsDateString, IsIn, IsNumber, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDocumentDto {
  @IsIn([
    'KYC', 'OWNERSHIP', 'PROPERTY', 'AGREEMENT', 'RECEIPT', 'INSPECTION',
    'INSURANCE', 'LEGAL', 'MAINTENANCE', 'DISPUTE', 'MARKETING', 'OTHER',
  ])
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  documentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  title?: string;

  @IsOptional()
  @IsIn(['USER', 'PROPERTY', 'APPLICATION', 'LEGAL_CASE', 'AGREEMENT', 'TENANCY', 'DISPUTE', 'MAINTENANCE', 'SUPPORT', 'KYC'])
  contextType?: string;

  @IsOptional()
  contextId?: number | string;

  @IsOptional()
  @IsIn(['PRIVATE', 'PARTIES', 'STAFF', 'PUBLIC'])
  visibility?: 'PRIVATE' | 'PARTIES' | 'STAFF' | 'PUBLIC';

  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class VerifyDocumentDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class RejectDocumentDto {
  @IsString()
  @MinLength(3, { message: 'Rejection reason is mandatory.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class RequestReplacementDto {
  @IsString()
  @MinLength(3, { message: 'Replacement reason is mandatory.' })
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  internalNotes?: string;
}

export class AssignVerifierDto {
  @IsNumber()
  verifierId!: number;
}
