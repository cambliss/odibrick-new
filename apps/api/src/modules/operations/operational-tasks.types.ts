export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT' | 'CRITICAL';

export type TaskStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'WAITING'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'CANCELLED';

export type SlaStatus = 'ON_TRACK' | 'DUE_SOON' | 'OVERDUE' | 'BREACHED';

export type TaskSourceDomain =
  | 'FINANCE'
  | 'PAYMENTS'
  | 'LEGAL'
  | 'COMPLIANCE'
  | 'MARKETPLACE'
  | 'VISITS'
  | 'LEADS'
  | 'COMMUNICATION'
  | 'MAINTENANCE'
  | 'DISPUTES'
  | 'TENANCY'
  | 'AUTOMATION'
  | 'GENERAL';

export interface OperationalTask {
  id: number;
  public_id: string;
  task_type: string;
  title: string;
  description: string | null;
  source_domain: TaskSourceDomain;
  source_entity_type: string;
  source_entity_id: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_to: number | null;
  assigned_team: string | null;
  created_by: number | null;
  due_at: string | null;
  sla_due_at: string | null;
  sla_status: SlaStatus;
  completed_at: string | null;
  resolution_notes: string | null;
  metadata: Record<string, any> | null;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
  // Computed / joined fields
  assignee_name?: string | null;
  assignee_email?: string | null;
  creator_name?: string | null;
  entity_url?: string | null;
}

export interface OperationalTaskEvent {
  id: number;
  task_id: number;
  actor_id: number | null;
  event_type: string;
  previous_state: Record<string, any> | null;
  new_state: Record<string, any> | null;
  notes: string | null;
  created_at: string;
  actor_name?: string | null;
  actor_role?: string | null;
}

export interface TaskOverviewSummary {
  totalTasks: number;
  openTasks: number;
  assignedTasks: number;
  inProgressTasks: number;
  escalatedTasks: number;
  criticalTasks: number;
  urgentTasks: number;
  overdueTasks: number;
  unassignedTasks: number;
  slaBreachedTasks: number;
  myAssignedTasks: number;
  resolvedToday: number;
  domainBreakdown: {
    domain: string;
    count: number;
    urgentCount: number;
  }[];
  priorityBreakdown: {
    priority: TaskPriority;
    count: number;
  }[];
  statusBreakdown: {
    status: TaskStatus;
    count: number;
  }[];
}

export interface CreateTaskInput {
  task_type: string;
  title: string;
  description?: string;
  source_domain: TaskSourceDomain;
  source_entity_type: string;
  source_entity_id: string;
  priority?: TaskPriority;
  assigned_to?: number;
  assigned_team?: string;
  due_hours?: number;
  sla_hours?: number;
  metadata?: Record<string, any>;
  idempotency_key?: string;
}
