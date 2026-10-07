import { IsEnum, IsOptional, IsString } from 'class-validator';
import { AnalyticsDateRange } from './analytics.types';

export class AnalyticsQueryDto {
  @IsOptional()
  @IsEnum(['TODAY', '7D', '30D', '90D', '6M', '1Y', 'CUSTOM'])
  range?: AnalyticsDateRange;

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  property_id?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class ExportReportDto extends AnalyticsQueryDto {
  @IsOptional()
  @IsString()
  format?: 'csv' | 'json';
}
