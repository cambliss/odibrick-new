import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum ConversationContextType {
  PROPERTY = 'PROPERTY',
  ENQUIRY = 'ENQUIRY',
  VISIT = 'VISIT',
  APPLICATION = 'APPLICATION',
  LEGAL_CASE = 'LEGAL_CASE',
  TENANCY = 'TENANCY',
  MAINTENANCE = 'MAINTENANCE',
  DISPUTE = 'DISPUTE',
  SUPPORT = 'SUPPORT',
}

export enum ConversationStatus {
  OPEN = 'OPEN',
  ACTIVE = 'ACTIVE',
  WAITING_FOR_CUSTOMER = 'WAITING_FOR_CUSTOMER',
  WAITING_FOR_PROVIDER = 'WAITING_FOR_PROVIDER',
  ESCALATED = 'ESCALATED',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum MessageType {
  TEXT = 'TEXT',
  SYSTEM = 'SYSTEM',
  NOTE = 'NOTE',
  STATUS_UPDATE = 'STATUS_UPDATE',
}

export enum ParticipantRole {
  CUSTOMER = 'CUSTOMER',
  OWNER = 'OWNER',
  PROVIDER = 'PROVIDER',
  AGENT = 'AGENT',
  LEGAL = 'LEGAL',
  MANAGEMENT = 'MANAGEMENT',
  VENDOR = 'VENDOR',
  OBSERVER = 'OBSERVER',
}

export class CreateConversationDto {
  @IsEnum(ConversationContextType)
  contextType: ConversationContextType;

  @Type(() => Number)
  @IsInt()
  @IsPositive()
  contextId: number;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  initialMessage?: string;
}

export class SendMessageDto {
  @IsString()
  body: string;

  @IsOptional()
  @IsEnum(MessageType)
  messageType?: MessageType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  documentId?: number;
}

export class SendInternalNoteDto {
  @IsString()
  body: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  documentId?: number;
}

export class EditMessageDto {
  @IsString()
  body: string;
}

export class AssignConversationDto {
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  assignedTo: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class EscalateConversationDto {
  @IsString()
  reason: string;
}

export class ResolveConversationDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReopenConversationDto {
  @IsString()
  reason: string;
}

export class CloseConversationDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListConversationsQueryDto {
  @IsOptional()
  @IsEnum(ConversationContextType)
  contextType?: ConversationContextType;

  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

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

export class AdminConversationsQueryDto {
  @IsOptional()
  @IsEnum(ConversationContextType)
  contextType?: ConversationContextType;

  @IsOptional()
  @IsEnum(ConversationStatus)
  status?: ConversationStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  assignedTo?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  slaBreached?: boolean;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  fromDate?: string;

  @IsOptional()
  @IsString()
  toDate?: string;

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
