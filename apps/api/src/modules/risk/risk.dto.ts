import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  RiskCaseStatus,
  RiskCaseType,
  RiskSeverity,
  SecurityEventSeverity,
} from './risk.types';

export class QueryRiskCasesDto {
  @IsOptional()
  @IsEnum(['OPEN', 'UNDER_REVIEW', 'EVIDENCE_REQUESTED', 'ACTION_REQUIRED', 'RESOLVED', 'CLOSED', 'FALSE_POSITIVE', 'ESCALATED'])
  status?: RiskCaseStatus;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  riskLevel?: RiskSeverity;

  @IsOptional()
  @IsString()
  caseType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedTo?: number;

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

export class QuerySecurityEventsDto {
  @IsOptional()
  @IsString()
  eventType?: string;

  @IsOptional()
  @IsEnum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: SecurityEventSeverity;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actorId?: number;

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

export class QueryRiskSignalsDto {
  @IsOptional()
  @IsString()
  signalType?: string;

  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: RiskSeverity;

  @IsOptional()
  @IsString()
  sourceDomain?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'INVESTIGATING', 'SUPPRESSED', 'RESOLVED', 'FALSE_POSITIVE'])
  status?: string;

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

export class CreateRiskCaseDto {
  @IsNotEmpty()
  @IsString()
  caseType: RiskCaseType;

  @IsNotEmpty()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  riskLevel: RiskSeverity;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  summary: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subjectUserId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subjectPropertyId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subjectPaymentId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedTo?: number;

  @IsOptional()
  evidence?: any;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class AssignRiskCaseDto {
  @IsNotEmpty()
  @Type(() => Number)
  @IsInt()
  assignedTo: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class EscalateRiskCaseDto {
  @IsNotEmpty()
  @IsString()
  reason: string;

  @IsOptional()
  @IsEnum(['HIGH', 'CRITICAL'])
  elevatedRiskLevel?: RiskSeverity;
}

export class ResolveRiskCaseDto {
  @IsNotEmpty()
  @IsString()
  resolutionNotes: string;

  @IsOptional()
  @IsEnum(['RESOLVED', 'CLOSED'])
  targetStatus?: RiskCaseStatus = 'RESOLVED';
}

export class FalsePositiveRiskCaseDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}

export class RequestEvidenceRiskCaseDto {
  @IsNotEmpty()
  @IsString()
  requestedItems: string;
}

export class ReopenRiskCaseDto {
  @IsNotEmpty()
  @IsString()
  reason: string;
}

export class LogSecurityEventDto {
  @IsNotEmpty()
  @IsString()
  eventType: string;

  @IsNotEmpty()
  @IsEnum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity: SecurityEventSeverity;

  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  summary: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  actorId?: number;

  @IsOptional()
  @IsString()
  actorRole?: string;

  @IsOptional()
  @IsString()
  actorIp?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;

  @IsOptional()
  @IsString()
  entityType?: string;

  @IsOptional()
  @IsString()
  entityId?: string;

  @IsOptional()
  metadata?: any;
}

export class CreateRiskSignalDto {
  @IsNotEmpty()
  @IsString()
  signalType: string;

  @IsNotEmpty()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity: RiskSeverity;

  @IsNotEmpty()
  @IsString()
  sourceDomain: string;

  @IsNotEmpty()
  @IsString()
  sourceEntityType: string;

  @IsNotEmpty()
  @IsString()
  sourceEntityId: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subjectUserId?: number;

  @IsNotEmpty()
  @IsString()
  detectedValue: string;

  @IsNotEmpty()
  @IsString()
  thresholdValue: string;

  @IsNotEmpty()
  @IsString()
  explanation: string;

  @IsOptional()
  metadata?: any;
}
