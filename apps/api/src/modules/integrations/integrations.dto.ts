import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  IntegrationCapability,
  IntegrationHealthStatus,
  WebhookProcessingStatus,
} from './integrations.types';

export class QueryIntegrationsDto {
  @IsOptional()
  @IsEnum(['EMAIL', 'SMS', 'WHATSAPP', 'PAYMENT_GATEWAY', 'STORAGE', 'KYC', 'ESIGN', 'MAPS', 'CALENDAR'])
  capability?: IntegrationCapability;

  @IsOptional()
  @IsEnum(['HEALTHY', 'DEGRADED', 'FAILING', 'DISABLED', 'NOT_CONFIGURED'])
  healthStatus?: IntegrationHealthStatus;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class QueryWebhooksDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsEnum(['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'SKIPPED'])
  processingStatus?: WebhookProcessingStatus;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = 20;
}

export class ToggleIntegrationDto {
  @IsNotEmpty()
  @IsBoolean()
  isEnabled: boolean;
}

export class ExecuteTestActionDto {
  @IsNotEmpty()
  @IsString()
  action: string;

  @IsOptional()
  payload?: any;
}
