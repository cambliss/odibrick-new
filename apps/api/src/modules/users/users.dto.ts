import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
   registerDecorator,
  ValidateNested,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

export function isValidCalendarDateString(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function IsCalendarDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isCalendarDate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown) {
          return isValidCalendarDateString(value);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must be a valid YYYY-MM-DD calendar date.`;
        },
      },
    });
  };
}

const emptyToNull = ({ value }: { value: unknown }) =>
  value === '' ? null : value;

const optionalNumberOrNull = ({ value }: { value: unknown }) =>
  value === '' || value === null ? null : value === undefined ? undefined : Number(value);

export class TenantPreferencesDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(['FAMILY', 'BACHELOR', 'COUPLE', 'COMPANY_LEASE', 'STUDENT'])
  householdType?: string | null;

  @IsOptional()
  @Transform(optionalNumberOrNull)
  @IsInt()
  @Min(1)
  @Max(20)
  occupants?: number | null;

  @IsOptional()
  @IsBoolean()
  hasPets?: boolean;

  @IsOptional()
  @Transform(optionalNumberOrNull)
  @IsNumber()
  @Min(0)
  monthlyIncome?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsCalendarDate({ message: 'Expected move-in date must be a valid YYYY-MM-DD calendar date.' })
  preferredMoveIn?: string | null;

  @IsOptional()
  @Transform(optionalNumberOrNull)
  @IsNumber()
  @Min(1, { message: 'Minimum rental budget must be at least 1.' })
  @Max(100000000)
  budgetMin?: number | null;

  @IsOptional()
  @Transform(optionalNumberOrNull)
  @IsNumber()
  @Min(1, { message: 'Maximum rental budget must be at least 1.' })
  @Max(100000000)
  budgetMax?: number | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(10, { each: true })
  preferredBhk?: number[];

  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(['UNFURNISHED', 'SEMI_FURNISHED', 'FULLY_FURNISHED', 'FURNISHED', 'ANY'])
  furnishing?: string | null;
}

export class OwnerProfileDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  propertiesCount?: number;

  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(['INDIVIDUAL', 'HUF', 'COMPANY', 'TRUST'])
  ownerType?: string | null;
}

export class AgencyDto {
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(190)
  name?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(64)
  reraNumber?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20)
  gstin?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(32)
  cin?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(190)
  website?: string | null;

  @IsOptional()
  @Transform(optionalNumberOrNull)
  @IsInt()
  @Min(1)
  @Max(10000)
  teamSize?: number | null;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) fullName?: string;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(255) avatarPath?: string | null;
  @IsOptional()
  @Transform(emptyToNull)
  @IsCalendarDate({ message: 'Date of birth must be a valid YYYY-MM-DD calendar date.' })
  dateOfBirth?: string | null;
  @IsOptional()
  @Transform(emptyToNull)
  @IsIn(['MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED'])
  gender?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120) occupation?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(160) employer?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(190) addressLine1?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(190) addressLine2?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120) locality?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  preferredLocalities?: string[];
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(96) city?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120) state?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(10) pincode?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) about?: string | null;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => TenantPreferencesDto) tenant?: TenantPreferencesDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => OwnerProfileDto) owner?: OwnerProfileDto;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => AgencyDto) agency?: AgencyDto;
}
