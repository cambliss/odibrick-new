import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';

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

export class ProposeRenewalDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) proposedRent?: number;
  @IsOptional() @IsDateString() proposedStartDate?: string;
  @IsOptional() @IsDateString() proposedEndDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) tenureMonths?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ConfirmRenewalDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class RequestMoveOutDto {
  @IsDateString() requestedMoveOutDate!: string;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class ConfirmMoveOutDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class DeductionItemDto {
  @IsIn(['DAMAGE', 'UNPAID_RENT', 'MAINTENANCE', 'OTHER']) category!: string;
  @IsString() @MaxLength(255) description!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @IsOptional() @Type(() => Number) @IsInt() inspectionItemId?: number;
  @IsOptional() @Type(() => Number) @IsInt() maintenanceTicketId?: number;
}

export class ProposeSettlementDto {
  @IsOptional() deductions?: DeductionItemDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AcceptSettlementDto {
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class DisputeSettlementDto {
  @IsString() @MaxLength(500) summary!: string;
  @IsOptional() @IsString() @MaxLength(2000) detail?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amountClaimed?: number;
}

export class AdminTenancyOverrideDto {
  @IsIn(['HOLD', 'RESUME', 'CANCEL', 'FORCE_CLOSE']) action!: 'HOLD' | 'RESUME' | 'CANCEL' | 'FORCE_CLOSE';
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class AdminApplicationDecideDto {
  @IsIn(['CANCEL', 'REJECT']) action!: 'CANCEL' | 'REJECT';
  @IsString() @MinLength(5) @MaxLength(1000) reason!: string;
}


