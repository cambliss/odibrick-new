import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskPriority, TaskSourceDomain, TaskStatus } from './operational-tasks.types';

export class CreateOperationalTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  task_type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  source_domain!: TaskSourceDomain;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  source_entity_type!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  source_entity_id!: string;

  @IsEnum(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'])
  @IsOptional()
  priority?: TaskPriority = 'NORMAL';

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  assigned_to?: number;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  assigned_team?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  due_hours?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  sla_hours?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @IsString()
  @IsOptional()
  @MaxLength(191)
  idempotency_key?: string;
}

export class AssignOperationalTaskDto {
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  assigned_to?: number | null;

  @IsString()
  @IsOptional()
  @MaxLength(64)
  assigned_team?: string | null;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateTaskPriorityDto {
  @IsEnum(['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'])
  priority!: TaskPriority;

  @IsString()
  @IsOptional()
  reason?: string;
}

export class UpdateTaskStatusDto {
  @IsEnum(['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'ESCALATED', 'RESOLVED', 'CLOSED', 'CANCELLED'])
  status!: TaskStatus;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class EscalateOperationalTaskDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsEnum(['HIGH', 'URGENT', 'CRITICAL'])
  @IsOptional()
  target_priority?: TaskPriority = 'URGENT';

  @IsString()
  @IsOptional()
  escalate_to_team?: string;
}

export class ResolveOperationalTaskDto {
  @IsString()
  @IsNotEmpty()
  resolution_notes!: string;

  @IsObject()
  @IsOptional()
  resolution_payload?: Record<string, any>;
}

export class ReopenOperationalTaskDto {
  @IsString()
  @IsNotEmpty()
  reopen_reason!: string;
}

export class AddTaskCommentDto {
  @IsString()
  @IsNotEmpty()
  comment!: string;
}

export class TaskQueryDto {
  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  priority?: string;

  @IsString()
  @IsOptional()
  domain?: string;

  @IsString()
  @IsOptional()
  task_type?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  assigned_to?: number;

  @IsString()
  @IsOptional()
  assigned_team?: string;

  @IsString()
  @IsOptional()
  unassigned?: string; // 'true' / '1'

  @IsString()
  @IsOptional()
  overdue?: string; // 'true' / '1'

  @IsString()
  @IsOptional()
  sla_breached?: string; // 'true' / '1'

  @IsString()
  @IsOptional()
  mine_only?: string; // 'true' / '1'

  @IsString()
  @IsOptional()
  q?: string;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  limit?: number = 25;
}
