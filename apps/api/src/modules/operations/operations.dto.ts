import { Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested,
} from 'class-validator';

export class CreateMaintenanceDto {
  @Type(() => Number) @IsInt() tenancyId!: number;
  @IsIn(['PLUMBING','ELECTRICAL','APPLIANCE','LEAKAGE','AC','STRUCTURAL','PEST','CARPENTRY','PAINTING','OTHER'])
  category!: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','EMERGENCY']) priority?: string;
  @IsString() @MaxLength(190) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @IsArray() documentIds?: number[];
}

export class MaintenanceUpdateDto {
  @IsOptional() @IsIn(['OPEN','OWNER_REVIEW','APPROVED','REJECTED','SCHEDULED','IN_PROGRESS','COMPLETED','VERIFIED','CLOSED','CANCELLED'])
  status?: string;
  @IsOptional() @IsIn(['OWNER','TENANT','SHARED','ODIBRICK','UNDECIDED']) costBearer?: string;
  @IsOptional() @Type(() => Number) @IsNumber() estimatedCost?: number;
  @IsOptional() @Type(() => Number) @IsNumber() finalCost?: number;
  @IsOptional() @IsString() @MaxLength(160) vendorName?: string;
  @IsOptional() @IsString() @MaxLength(20) vendorPhone?: string;
  @IsOptional() @IsDateString() scheduledFor?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class MaintenanceFinancialApprovalDto {
  @IsIn(['OWNER', 'TENANT', 'SHARED', 'ODIBRICK'])
  costBearer!: 'OWNER' | 'TENANT' | 'SHARED' | 'ODIBRICK';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  finalCost!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ownerAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  tenantAmount?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  decisionNote?: string;
}

export class MaintenanceFinancialRejectDto {
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class DisputeEvidenceDto {
  @IsIn(['DOCUMENT','INSPECTION_REPORT','PAYMENT_RECORD','PHOTO','VIDEO','MESSAGE','OTHER']) evidenceType!: string;
  @IsOptional() @Type(() => Number) @IsInt() documentId?: number;
  @IsOptional() @Type(() => Number) @IsInt() inspectionId?: number;
  @IsOptional() @Type(() => Number) @IsInt() paymentId?: number;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
}

export class CreateDisputeDto {
  @Type(() => Number) @IsInt() tenancyId!: number;
  @IsIn(['DEPOSIT','PROPERTY_DAMAGE','MAINTENANCE','PAYMENT','AGREEMENT','NOTICE_PERIOD','ACCESS','OTHER'])
  category!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) amountClaimed?: number;
  @IsString() @MaxLength(500) summary!: string;
  @IsOptional() @IsString() @MaxLength(6000) detail?: string;
  @IsOptional() initialEvidence?: DisputeEvidenceDto;
}

export class DisputeUpdateDto {
  @IsIn(['OPEN','EVIDENCE_SUBMITTED','UNDER_REVIEW','LEGAL_REVIEW','RESOLUTION_PROPOSED','RESOLVED','ESCALATED_EXTERNALLY','CLOSED','WITHDRAWN'])
  status!: string;
  @IsOptional() @IsString() @MaxLength(4000) resolution?: string;
}

export class AssignDisputeDto {
  @Type(() => Number) @IsInt() assignedTo!: number;
}

export class EscalateDisputeDto {
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: string;
  @IsOptional() @Type(() => Number) @IsInt() advocateUserId?: number;
}

export class DisputeFinancialDecisionDto {
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @Type(() => Number) @IsInt() payerUserId!: number;
  @IsOptional() @Type(() => Number) @IsInt() payeeUserId?: number;
  @IsIn(['SECURITY_DEPOSIT','ADVANCE_RENT','MONTHLY_RENT','MAINTENANCE','SERVICE_FEE','LEGAL_FEE','COMMISSION','REFUND','PENALTY','OTHER'])
  purpose!: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ResolveDisputeDto {
  @IsString() @MaxLength(4000) resolution!: string;
  @IsOptional() @IsIn(['RESOLVED','CLOSED']) status?: string;
  @IsOptional() @ValidateNested() @Type(() => DisputeFinancialDecisionDto) financialDecision?: DisputeFinancialDecisionDto;
}

export class ReopenDisputeDto {
  @IsString() @MaxLength(1000) reason!: string;
}

export class CloseDisputeDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class DisputeMessageDto {
  @IsString() @MaxLength(6000) body!: string;
  @IsOptional() @Type(() => Number) @IsInt() documentId?: number;
  @IsOptional() @IsBoolean() isEvidenceRequest?: boolean;
  @IsOptional() @IsString() @MaxLength(100) requestType?: string;
}

export class CreateTicketDto {
  @IsOptional() @IsIn(['ACCOUNT','KYC','LISTING','PAYMENT','AGREEMENT','MAINTENANCE','INSURANCE','MARKETING','TECHNICAL','OTHER'])
  category?: string;
  @IsOptional() @IsIn(['LOW','NORMAL','HIGH','URGENT']) priority?: string;
  @IsString() @MaxLength(190) subject!: string;
  @IsOptional() @IsString() @MaxLength(6000) description?: string;
  @IsOptional() @Type(() => Number) @IsInt() propertyId?: number;
  @IsOptional() @Type(() => Number) @IsInt() tenancyId?: number;
}

export class TicketMessageDto {
  @IsString() @MaxLength(6000) body!: string;
  @IsOptional() @IsBoolean() isInternal?: boolean;
  @IsOptional() @IsIn(['OPEN','ASSIGNED','WAITING_ON_USER','IN_PROGRESS','RESOLVED','CLOSED']) status?: string;
}
