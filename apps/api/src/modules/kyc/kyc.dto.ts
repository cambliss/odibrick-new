import { IsArray, IsDateString, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SubmitKycDto {
  @IsOptional() @IsIn(['INDIVIDUAL','BUSINESS']) subjectType?: string;
  @IsString() @MaxLength(190) legalName!: string;
  @IsIn(['AADHAAR','PAN','PASSPORT','DL','VOTER_ID','GSTIN','CIN','OTHER']) idType!: string;
  @IsOptional() @Matches(/^[A-Za-z0-9-]{6,24}$/, { message: 'Enter the document number as printed.' })
  idNumber?: string;
  @IsOptional() @IsArray() documentIds?: number[];
}

export class KycDecisionDto {
  @IsIn(['APPROVE','REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}
