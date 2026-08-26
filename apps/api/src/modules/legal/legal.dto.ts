import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';

export class ClauseInputDto {
  @IsOptional() @Type(() => Number) @IsInt() clauseId?: number;
  @IsString() @MaxLength(190) title!: string;
  @IsString() body!: string;
}

export class DraftAgreementDto {
  @IsOptional() @IsIn(['LEAVE_AND_LICENSE','RENTAL','LEASE','RENEWAL','ADDENDUM']) agreementType?: string;
  @IsString() bodyHtml!: string;
  @IsOptional() @IsString() @MaxLength(500) changeSummary?: string;
  @IsOptional() @IsObject() variables?: Record<string, unknown>;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ClauseInputDto) clauses?: ClauseInputDto[];
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  /** Set when a drafting aid produced part of this text. Recorded, never a substitute for review. */
  @IsOptional() @IsBoolean() draftedWithAi?: boolean;
}

export class ApproveAgreementDto {
  @Type(() => Number) @IsInt() version!: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class SignAgreementDto {
  @IsBoolean() consent!: boolean;
  @IsOptional() @IsString() @MaxLength(500) consentText?: string;
  @IsOptional() @IsString() @MaxLength(64) otpReference?: string;
}

export class ScheduleMeetingDto {
  @Type(() => Number) @IsInt() legalCaseId!: number;
  @IsOptional() @IsIn(['LEGAL_CONSULTATION','OWNER_TENANT_DISCUSSION','SUPPORT','PROPERTY_WALKTHROUGH']) purpose?: string;
  @IsDateString() scheduledFor!: string;
  @IsOptional() @Type(() => Number) @IsInt() durationMin?: number;
  @IsOptional() @IsString() @MaxLength(1000) agenda?: string;
}

export class AssignCaseDto {
  @IsOptional() @Type(() => Number) @IsInt() assigneeId?: number;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: string;
}

export class LegalNoteDto {
  @IsString() @MaxLength(4000) body!: string;
  @IsOptional() @IsIn(['INTERNAL','PARTIES']) visibility?: 'INTERNAL' | 'PARTIES';
}
