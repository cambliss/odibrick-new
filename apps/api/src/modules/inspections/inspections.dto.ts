import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, ValidateNested,
} from 'class-validator';

export const ROOMS = ['LIVING_ROOM','BEDROOM','KITCHEN','BATHROOM','BALCONY','ENTRANCE','UTILITY','PARKING','COMMON','OTHER'] as const;
export const ELEMENTS = ['WALLS','FLOORING','CEILING','DOORS','WINDOWS','ELECTRICAL','PLUMBING','APPLIANCES','FURNITURE','FIXTURES','PAINT','METER','OTHER'] as const;

export class StartInspectionDto {
  @Type(() => Number) @IsInt() tenancyId!: number;
  @IsOptional() @IsIn(['CHECK_IN','PERIODIC','MAINTENANCE','MOVE_OUT']) kind?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @IsString() @MaxLength(64) deviceHash?: string;
}

export class InspectionItemDto {
  @IsIn(ROOMS as unknown as string[]) room!: string;
  @IsOptional() @IsString() @MaxLength(64) roomLabel?: string;
  @IsIn(ELEMENTS as unknown as string[]) element!: string;
  @IsOptional() @IsIn(['NEW','GOOD','FAIR','DAMAGED','MISSING']) conditionRating?: string;
  @IsOptional() @IsIn(['NONE','SCRATCH','CRACK','STAIN','LEAKAGE','DENT','BROKEN','WEAR']) damageType?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @Type(() => Number) @IsInt() quantity?: number;
}

export class SaveItemsDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => InspectionItemDto) items!: InspectionItemDto[];
}

export class AddMediaDto {
  @IsString() @MaxLength(400) storageKey!: string;
  @IsOptional() @Type(() => Number) @IsInt() itemId?: number;
  @IsOptional() @IsIn(['PHOTO','VIDEO','VOICE_NOTE']) mediaType?: string;
  @IsOptional() @IsString() @MaxLength(64) checksum?: string;
  @IsOptional() @IsDateString() capturedAt?: string;
  @IsOptional() @Type(() => Number) @IsNumber() latitude?: number;
  @IsOptional() @Type(() => Number) @IsNumber() longitude?: number;
  @IsOptional() @IsString() @MaxLength(255) caption?: string;
}

export class SubmitInspectionDto {
  @IsOptional() @IsIn(['EXCELLENT','GOOD','FAIR','POOR']) overallCondition?: string;
  @IsOptional() @IsString() @MaxLength(32) electricityReading?: string;
  @IsOptional() @IsString() @MaxLength(32) waterReading?: string;
  @IsOptional() @IsString() @MaxLength(32) gasReading?: string;
}

export class AcknowledgeDto {
  @IsIn(['ACKNOWLEDGE','DISPUTE']) decision!: 'ACKNOWLEDGE' | 'DISPUTE';
  @IsOptional() @IsString() @MaxLength(1000) comments?: string;
}
