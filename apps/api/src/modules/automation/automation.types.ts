export interface BusinessEvent {
  eventType: string;
  entityType: string;
  entityId: number;
  actorId?: number | null;
  actorRole?: string | null;
  correlationId?: string | null;
  idempotencyKey?: string | null;
  payload: Record<string, any>;
  occurredAt?: Date;
}

export type ActionType =
  | 'SEND_NOTIFICATION'
  | 'CREATE_SYSTEM_MESSAGE'
  | 'CREATE_AUDIT_EVENT'
  | 'ASSIGN_MANAGEMENT_HANDLER'
  | 'ESCALATE_TO_MANAGEMENT'
  | 'CREATE_TASK_OR_FOLLOW_UP'
  | 'CREATE_OPERATIONAL_TASK'
  | 'CREATE_COMPLIANCE_EXCEPTION'
  | 'MARK_SLA_BREACHED';

export type RecipientType =
  | 'ACTOR'
  | 'PAYER'
  | 'PAYEE'
  | 'OWNER'
  | 'TENANT'
  | 'CUSTOMER'
  | 'ASSIGNEE'
  | 'PARTIES'
  | 'MANAGEMENT';

export interface WorkflowAction {
  type: ActionType;
  recipient?: RecipientType;
  eventCode?: string;
  title?: string;
  body?: string;
  severity?: 'INFO' | 'ACTION' | 'WARNING' | 'CRITICAL';
  notes?: string;
  category?: string;
  actionUrl?: string;
}

export interface WorkflowRule {
  id: number;
  rule_code: string;
  name: string;
  description?: string;
  event_type: string;
  is_enabled: boolean;
  priority: number;
  conditions: Record<string, any>;
  actions: WorkflowAction[];
  created_by?: number;
  updated_by?: number;
  created_at: string;
  updated_at: string;
}

export type ExecutionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
