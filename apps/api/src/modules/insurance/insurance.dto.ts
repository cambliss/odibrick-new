import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class QuoteRequestDto {
  @Type(() => Number) @IsInt() productId!: number;
  @Type(() => Number) @IsNumber() @Min(1000) sumInsured!: number;
  @IsOptional() @Type(() => Number) @IsInt() propertyId?: number;
  @IsOptional() @Type(() => Number) @IsInt() tenancyId?: number;
}

export class ConfirmPolicyDto {
  @IsString() @MaxLength(120) policyNumber!: string;
  @IsDateString() startsOn!: string;
  @IsDateString() expiresOn!: string;
}
