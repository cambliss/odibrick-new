import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class RecordPaymentDto {
  @IsString() @MaxLength(120) bankReference!: string;
  @IsOptional() @IsIn(['UPI','NEFT','IMPS','RTGS','CASH','CHEQUE','CARD','NETBANKING']) method?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) amount?: number;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class RefundDto {
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) amount?: number;
  @IsOptional() @IsString() @MaxLength(120) bankReference?: string;
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
