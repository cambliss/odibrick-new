import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';

export const PROPERTY_TYPES = ['APARTMENT','INDEPENDENT_HOUSE','VILLA','STUDIO','PENTHOUSE','PLOT','OFFICE','SHOP','WAREHOUSE','PG'] as const;
export const FURNISHINGS = ['UNFURNISHED','SEMI_FURNISHED','FULLY_FURNISHED'] as const;

export class CreatePropertyDto {
  @IsOptional() @IsString() @MinLength(8) @MaxLength(190) title?: string;
  @IsIn(['RENT','SALE']) listingType!: 'RENT' | 'SALE';
  @IsIn(PROPERTY_TYPES as unknown as string[]) propertyType!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) bedrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) bathrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) balconies?: number;
  @IsOptional() @Type(() => Number) @IsInt() floorNumber?: number;
  @IsOptional() @Type(() => Number) @IsInt() totalFloors?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(50) carpetAreaSqft?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(50) builtupAreaSqft?: number;
  @IsOptional() @IsIn(FURNISHINGS as unknown as string[]) furnishing?: string;
  @IsOptional() @IsIn(['N','S','E','W','NE','NW','SE','SW']) facing?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) ageYears?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) parkingCovered?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) parkingOpen?: number;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) rentAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) salePrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) securityDeposit?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maintenanceAmount?: number;
  @IsOptional() @IsIn(['MONTHLY','QUARTERLY','YEARLY','INCLUDED','NONE']) maintenancePeriod?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(60) lockInMonths?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) noticePeriodDays?: number;

  @IsOptional() @IsString() @MaxLength(190) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(190) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) locality?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(120) state?: string;
  @IsOptional() @IsString() @MaxLength(10) pincode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;

  @IsOptional() @IsDateString() availableFrom?: string;
  @IsOptional() @IsArray() preferredTenants?: string[];
  @IsOptional() @IsBoolean() petsAllowed?: boolean;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsString() @MaxLength(2000) houseRules?: string;
  @IsOptional() @IsArray() amenityCodes?: string[];
  @IsOptional() @IsArray() amenities?: string[];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10) wizardStep?: number;
  @IsOptional() @Type(() => Number) @IsInt() projectId?: number;
}

export class UpdatePropertyDto extends CreatePropertyDto {
  @IsOptional() @IsString() @MinLength(8) declare title: string;
  @IsOptional() @IsIn(['RENT','SALE']) declare listingType: 'RENT' | 'SALE';
  @IsOptional() @IsIn(PROPERTY_TYPES as unknown as string[]) declare propertyType: string;
  @IsOptional() @IsString() declare addressLine1: string;
  @IsOptional() @IsString() declare locality: string;
  @IsOptional() @IsString() declare city: string;
  @IsOptional() @IsString() declare state: string;
  @IsOptional() @IsString() declare pincode: string;
}

export class PropertySearchDto {
  @IsOptional() @IsString() @MaxLength(120) q?: string;
  @IsOptional() @IsIn(['RENT','SALE']) listingType?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() locality?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() propertyType?: string;
  @IsOptional() @IsString() furnishing?: string;
  @IsOptional() @Type(() => Number) @IsInt() minBedrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() maxBedrooms?: number;
  @IsOptional() @Type(() => Number) @IsInt() minBathrooms?: number;
  @IsOptional() @Type(() => Number) @IsNumber() minRent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxRent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() minPrice?: number;
  @IsOptional() @Type(() => Number) @IsNumber() maxPrice?: number;
  @IsOptional() @IsIn(['OWNER','AGENT','BUILDER']) listedBy?: string;
  @IsOptional() @Type(() => Boolean) @IsBoolean() verifiedOnly?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() protectedOnly?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() petsAllowed?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() parking?: boolean;
  @IsOptional() @Type(() => Boolean) @IsBoolean() availableNow?: boolean;
  @IsOptional() @IsArray() amenities?: string[];
  @IsOptional() @Type(() => Number) @IsNumber() swLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() swLng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() neLat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() neLng?: number;
  @IsOptional() @IsIn(['NEWEST','PRICE_ASC','PRICE_DESC','AREA_DESC']) sort?: 'NEWEST'|'PRICE_ASC'|'PRICE_DESC'|'AREA_DESC';
  @IsOptional() @Type(() => Number) @IsInt() page?: number;
  @IsOptional() @Type(() => Number) @IsInt() perPage?: number;
}

export class ModerateDto {
  @IsIn(['APPROVE','REJECT']) decision!: 'APPROVE' | 'REJECT';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class VerificationCheckDto {
  @IsIn(['KYC','OWNER_IDENTITY','OWNERSHIP_DOCUMENT','ADDRESS','PHOTO_AUTHENTICITY','PHYSICAL_VISIT','PROTECTED_PLAN'])
  checkType!: string;
  @IsIn(['PENDING','IN_REVIEW','VERIFIED','FAILED','EXPIRED']) status!: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}
