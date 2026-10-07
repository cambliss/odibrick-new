import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ToggleRuleDto {
  @IsBoolean()
  isEnabled!: boolean;
}

export class AcknowledgeFailureDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

export class EmitEventDto {
  @IsString()
  @MaxLength(64)
  eventType!: string;

  @IsString()
  @MaxLength(48)
  entityType!: string;

  @IsNumber()
  entityId!: number;

  @IsOptional()
  @IsNumber()
  actorId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  actorRole?: string;

  @IsOptional()
  @IsString()
  occurredAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  correlationId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  idempotencyKey?: string;

  @IsObject()
  payload!: Record<string, any>;
}

export class UpdateNotificationPreferenceDto {
  @IsString()
  category!: string;

  @IsIn(['IN_APP', 'EMAIL', 'SMS', 'WHATSAPP', 'PUSH'])
  channel!: 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

  @IsBoolean()
  isEnabled!: boolean;
}
