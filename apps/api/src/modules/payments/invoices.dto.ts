import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class InvoiceLineItemDto {
  @IsString()
  @MaxLength(255)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  hsnSac?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  quantity?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPrice!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxRate?: number;
}

export class GenerateInvoiceDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineItemDto)
  lineItems?: InvoiceLineItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  placeOfSupply?: string;
}

export class CancelInvoiceDto {
  @IsString()
  @MinLength(5, { message: 'Cancellation reason must be at least 5 characters long.' })
  @MaxLength(255)
  reason!: string;
}

export class UpdateIssuerConfigDto {
  @IsString()
  @MaxLength(190)
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tradeName?: string;

  @IsString()
  @MaxLength(255)
  address!: string;

  @IsString()
  @MaxLength(100)
  city!: string;

  @IsString()
  @MaxLength(100)
  state!: string;

  @IsString()
  @MaxLength(10)
  stateCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  @MaxLength(12)
  pincode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  gstin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pan?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  invoicePrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  terms?: string;
}

export class InvoiceQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  @IsOptional()
  @IsIn(['ALL', 'DRAFT', 'ISSUED', 'PAID', 'VOID'])
  status?: string;

  @IsOptional()
  @IsString()
  purpose?: string;

  @IsOptional()
  @IsString()
  q?: string;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;
}
