import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateEnquiryDto {
  @Type(() => Number) @IsInt() propertyId!: number;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsIn(['CHAT','CALL','EMAIL','WHATSAPP']) contactPreference?: string;
  @IsOptional() @IsString() @MaxLength(48) source?: string;
}

export class CreateViewingDto {
  @Type(() => Number) @IsInt() propertyId!: number;
  @IsOptional() @Type(() => Number) @IsInt() enquiryId?: number;
  @IsOptional() @IsIn(['IN_PERSON','VIDEO']) mode?: string;
  @IsDateString() scheduledFor!: string;
}

export class ViewingResponseDto {
  @IsIn(['CONFIRMED','RESCHEDULED','COMPLETED','NO_SHOW','CANCELLED']) status!: string;
  @IsOptional() @IsDateString() scheduledFor?: string;
}

export class CreateApplicationDto {
  @Type(() => Number) @IsInt() propertyId!: number;
  @IsOptional() @Type(() => Number) @IsInt() enquiryId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) occupants?: number;
  @IsOptional() @IsIn(['FAMILY','BACHELOR','COUPLE','COMPANY_LEASE','STUDENT']) householdType?: string;
  @IsOptional() @IsDateString() moveInDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) tenureMonths?: number;
  @IsOptional() @Type(() => Number) @IsNumber() offeredRent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() offeredDeposit?: number;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}

export class ApplicationDecisionDto {
  @IsIn(['ACCEPT','REJECT','SHORTLIST']) decision!: 'ACCEPT' | 'REJECT' | 'SHORTLIST';
  @IsOptional() @IsString() @MaxLength(500) note?: string;
  @IsOptional() @IsIn(['STANDARD','PROTECTED','MANAGED']) servicePlan?: string;
}
