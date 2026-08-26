import { Type } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, MaxLength,
} from 'class-validator';

export class TenantPreferencesDto {
  @IsOptional() @IsIn(['FAMILY','BACHELOR','COUPLE','COMPANY_LEASE','STUDENT']) householdType?: string;
  @IsOptional() @Type(() => Number) @IsInt() occupants?: number;
  @IsOptional() @IsBoolean() hasPets?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() monthlyIncome?: number;
  @IsOptional() @IsDateString() preferredMoveIn?: string;
  @IsOptional() @Type(() => Number) @IsNumber() budgetMin?: number;
  @IsOptional() @Type(() => Number) @IsNumber() budgetMax?: number;
}

export class AgencyDto {
  @IsOptional() @IsString() @MaxLength(190) name?: string;
  @IsOptional() @IsString() @MaxLength(64) reraNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) gstin?: string;
  @IsOptional() @IsString() @MaxLength(32) cin?: string;
  @IsOptional() @IsString() @MaxLength(190) website?: string;
  @IsOptional() @Type(() => Number) @IsInt() teamSize?: number;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MaxLength(160) fullName?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsIn(['MALE','FEMALE','OTHER','UNDISCLOSED']) gender?: string;
  @IsOptional() @IsString() @MaxLength(120) occupation?: string;
  @IsOptional() @IsString() @MaxLength(160) employer?: string;
  @IsOptional() @IsString() @MaxLength(190) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(190) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) locality?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(10) pincode?: string;
  @IsOptional() @IsString() @MaxLength(2000) about?: string;
  @IsOptional() @IsObject() @Type(() => TenantPreferencesDto) tenant?: TenantPreferencesDto;
  @IsOptional() @IsObject() @Type(() => AgencyDto) agency?: AgencyDto;
}
