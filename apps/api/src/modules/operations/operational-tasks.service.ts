import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import {
  CreateOperationalTaskDto,
  AssignOperationalTaskDto,
  UpdateTaskPriorityDto,
  UpdateTaskStatusDto,
  EscalateOperationalTaskDto,
  ResolveOperationalTaskDto,
  ReopenOperationalTaskDto,
  AddTaskCommentDto,
  TaskQueryDto,
} from './operational-tasks.dto';
import {
  OperationalTask,
  OperationalTaskEvent,
  TaskOverviewSummary,
  TaskPriority,
  TaskSourceDomain,
  TaskStatus,
  SlaStatus,
} from './operational-tasks.types';

@Injectable()
export class OperationalTasksService {
  private readonly logger = new Logger(OperationalTasksService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  /**
   * Get KPI metrics and high-level summary for the Management Operations Control Tower.
   */
  async getOverview(user: AuthUser): Promise<TaskOverviewSummary> {
    const counts = await this.db.query<any>(
      `SELECT
         COUNT(*) as totalTasks,
         SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) as openTasks,
         SUM(CASE WHEN status = 'ASSIGNED' THEN 1 ELSE 0 END) as assignedTasks,
         SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) as inProgressTasks,
         SUM(CASE WHEN status = 'ESCALATED' THEN 1 ELSE 0 END) as escalatedTasks,
         SUM(CASE WHEN priority = 'CRITICAL' AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') THEN 1 ELSE 0 END) as criticalTasks,
         SUM(CASE WHEN priority = 'URGENT' AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') THEN 1 ELSE 0 END) as urgentTasks,
         SUM(CASE WHEN due_at < NOW() AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') THEN 1 ELSE 0 END) as overdueTasks,
         SUM(CASE WHEN assigned_to IS NULL AND status IN ('OPEN', 'ESCALATED') THEN 1 ELSE 0 END) as unassignedTasks,
         SUM(CASE WHEN sla_due_at < NOW() AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') THEN 1 ELSE 0 END) as slaBreachedTasks,
         SUM(CASE WHEN assigned_to = ? AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') THEN 1 ELSE 0 END) as myAssignedTasks,
         SUM(CASE WHEN status = 'RESOLVED' AND completed_at >= CURDATE() THEN 1 ELSE 0 END) as resolvedToday
       FROM operational_tasks`,
      [user.id],
    );

    const row = counts[0] || {};

    const domainRows = await this.db.query<any>(
      `SELECT
         source_domain as domain,
         COUNT(*) as count,
         SUM(CASE WHEN priority IN ('URGENT', 'CRITICAL') AND status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED') THEN 1 ELSE 0 END) as urgentCount
       FROM operational_tasks
       WHERE status NOT IN ('CLOSED', 'CANCELLED')
       GROUP BY source_domain
       ORDER BY count DESC`,
    );

    const priorityRows = await this.db.query<any>(
      `SELECT priority, COUNT(*) as count
       FROM operational_tasks
       WHERE status NOT IN ('RESOLVED', 'CLOSED', 'CANCELLED')
       GROUP BY priority`,
    );

    const statusRows = await this.db.query<any>(
      `SELECT status, COUNT(*) as count
       FROM operational_tasks
       GROUP BY status`,
    );

    return {
      totalTasks: Number(row.totalTasks || 0),
      openTasks: Number(row.openTasks || 0),
      assignedTasks: Number(row.assignedTasks || 0),
      inProgressTasks: Number(row.inProgressTasks || 0),
      escalatedTasks: Number(row.escalatedTasks || 0),
      criticalTasks: Number(row.criticalTasks || 0),
      urgentTasks: Number(row.urgentTasks || 0),
      overdueTasks: Number(row.overdueTasks || 0),
      unassignedTasks: Number(row.unassignedTasks || 0),
      slaBreachedTasks: Number(row.slaBreachedTasks || 0),
      myAssignedTasks: Number(row.myAssignedTasks || 0),
      resolvedToday: Number(row.resolvedToday || 0),
      domainBreakdown: domainRows.map((r: any) => ({
        domain: r.domain,
        count: Number(r.count || 0),
        urgentCount: Number(r.urgentCount || 0),
      })),
      priorityBreakdown: priorityRows.map((r: any) => ({
        priority: r.priority as TaskPriority,
        count: Number(r.count || 0),
      })),
      statusBreakdown: statusRows.map((r: any) => ({
        status: r.status as TaskStatus,
        count: Number(r.count || 0),
      })),
    };
  }

  /**
   * List and filter operational tasks with pagination and computed metadata.
   */
  async getTasks(
    user: AuthUser,
    query: TaskQueryDto,
  ): Promise<{
    data: OperationalTask[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 25)));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (query.status && query.status !== 'ALL') {
      conditions.push('t.status = ?');
      params.push(query.status);
    }

    if (query.priority && query.priority !== 'ALL') {
      conditions.push('t.priority = ?');
      params.push(query.priority);
    }

    if (query.domain && query.domain !== 'ALL') {
      conditions.push('t.source_domain = ?');
      params.push(query.domain);
    }

    if (query.task_type) {
      conditions.push('t.task_type = ?');
      params.push(query.task_type);
    }

    if (query.assigned_to) {
      conditions.push('t.assigned_to = ?');
      params.push(query.assigned_to);
    }

    if (query.assigned_team) {
      conditions.push('t.assigned_team = ?');
      params.push(query.assigned_team);
    }

    if (query.unassigned === 'true' || query.unassigned === '1') {
      conditions.push('t.assigned_to IS NULL');
    }

    if (query.overdue === 'true' || query.overdue === '1') {
      conditions.push('t.due_at < NOW() AND t.status NOT IN ("RESOLVED", "CLOSED", "CANCELLED")');
    }

    if (query.sla_breached === 'true' || query.sla_breached === '1') {
      conditions.push('t.sla_due_at < NOW() AND t.status NOT IN ("RESOLVED", "CLOSED", "CANCELLED")');
    }

    if (query.mine_only === 'true' || query.mine_only === '1') {
      conditions.push('t.assigned_to = ?');
      params.push(user.id);
    }

    if (query.q) {
      const search = `%${query.q.trim()}%`;
      conditions.push('(t.public_id LIKE ? OR t.title LIKE ? OR t.description LIKE ? OR t.source_entity_id LIKE ?)');
      params.push(search, search, search, search);
    }

    const whereClause = conditions.join(' AND ');

    const countRes = await this.db.query<any>(
      `SELECT COUNT(*) as total FROM operational_tasks t WHERE ${whereClause}`,
      params,
    );
    const total = Number(countRes[0]?.total || 0);

    const rows = await this.db.query<any>(
      `SELECT
         t.*,
         u_assign.full_name as assignee_name,
         u_assign.email as assignee_email,
         u_create.full_name as creator_name
       FROM operational_tasks t
       LEFT JOIN users u_assign ON u_assign.id = t.assigned_to
       LEFT JOIN users u_create ON u_create.id = t.created_by
       WHERE ${whereClause}
       ORDER BY
         CASE t.priority
           WHEN 'CRITICAL' THEN 1
           WHEN 'URGENT' THEN 2
           WHEN 'HIGH' THEN 3
           WHEN 'NORMAL' THEN 4
           WHEN 'LOW' THEN 5
           ELSE 6
         END ASC,
         t.sla_due_at ASC,
         t.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const tasks: OperationalTask[] = rows.map((r: any) => this.formatTaskRow(r));

    return {
      data: tasks,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single operational task with full timeline, context, and linked domain entity details.
   */
  async getTaskById(user: AuthUser, id: number): Promise<{
    task: OperationalTask;
    events: OperationalTaskEvent[];
    domainContext: Record<string, any>;
  }> {
    const rows = await this.db.query<any>(
      `SELECT
         t.*,
         u_assign.full_name as assignee_name,
         u_assign.email as assignee_email,
         u_create.full_name as creator_name
       FROM operational_tasks t
       LEFT JOIN users u_assign ON u_assign.id = t.assigned_to
       LEFT JOIN users u_create ON u_create.id = t.created_by
       WHERE t.id = ?`,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException(`Operational task #${id} not found`);
    }

    const task = this.formatTaskRow(rows[0]);

    // Fetch timeline events
    const eventRows = await this.db.query<any>(
      `SELECT
         e.*,
         u.full_name as actor_name,
         r.code as actor_role
       FROM operational_task_events e
       LEFT JOIN users u ON u.id = e.actor_id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r ON r.id = ur.role_id
       WHERE e.task_id = ?
       ORDER BY e.id ASC`,
      [id],
    );

    const events: OperationalTaskEvent[] = eventRows.map((e: any) => ({
      id: e.id,
      task_id: e.task_id,
      actor_id: e.actor_id,
      event_type: e.event_type,
      previous_state: typeof e.previous_state === 'string' ? JSON.parse(e.previous_state) : e.previous_state,
      new_state: typeof e.new_state === 'string' ? JSON.parse(e.new_state) : e.new_state,
      notes: e.notes,
      created_at: e.created_at,
      actor_name: e.actor_name || (e.actor_id ? `User #${e.actor_id}` : 'SYSTEM'),
      actor_role: e.actor_role || 'STAFF',
    }));

    // Fetch linked domain contextual snapshot
    const domainContext = await this.fetchDomainContext(task.source_domain, task.source_entity_type, task.source_entity_id);

    return {
      task,
      events,
      domainContext,
    };
  }

  /**
   * Create a new operational task with SLA computation and deterministic idempotency.
   */
  async createTask(
    actor: AuthUser | null,
    dto: CreateOperationalTaskDto,
  ): Promise<{ task: OperationalTask; created: boolean }> {
    // 1. Check idempotency
    if (dto.idempotency_key) {
      const existing = await this.db.query<any>(
        `SELECT id FROM operational_tasks WHERE idempotency_key = ?`,
        [dto.idempotency_key],
      );
      if (existing.length > 0) {
        const fullTask = await this.getTaskById(actor || { id: 1 } as any, existing[0].id);
        return { task: fullTask.task, created: false };
      }
    }

    const publicId = `TSK-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(
      100000 + Math.random() * 900000,
    )}`;

    const priority: TaskPriority = dto.priority || 'NORMAL';
    const status: TaskStatus = dto.assigned_to ? 'ASSIGNED' : 'OPEN';

    // Calculate SLAs based on priority
    const slaHours = dto.sla_hours || this.getDefaultSlaHours(priority);
    const dueHours = dto.due_hours || this.getDefaultDueHours(priority);

    const now = new Date();
    const slaDueAt = new Date(now.getTime() + slaHours * 3600 * 1000);
    const dueAt = new Date(now.getTime() + dueHours * 3600 * 1000);

    const team = dto.assigned_team || this.inferDefaultTeam(dto.source_domain);

    const taskId = await this.db.insert('operational_tasks', {
      public_id: publicId,
      task_type: dto.task_type,
      title: dto.title,
      description: dto.description || null,
      source_domain: dto.source_domain,
      source_entity_type: dto.source_entity_type,
      source_entity_id: String(dto.source_entity_id),
      priority,
      status,
      assigned_to: dto.assigned_to || null,
      assigned_team: team,
      created_by: actor?.id || null,
      due_at: dueAt,
      sla_due_at: slaDueAt,
      sla_status: 'ON_TRACK',
      metadata: dto.metadata ? JSON.stringify(dto.metadata) : null,
      idempotency_key: dto.idempotency_key || null,
      created_at: now,
      updated_at: now,
    });

    // Record creation event
    await this.db.insert('operational_task_events', {
      task_id: taskId,
      actor_id: actor?.id || null,
      event_type: 'TASK_CREATED',
      previous_state: null,
      new_state: JSON.stringify({
        priority,
        status,
        assigned_to: dto.assigned_to,
        assigned_team: team,
      }),
      notes: `Operational task created with ${priority} priority and ${slaHours}h SLA.`,
      created_at: now,
    });

    // Audit log
    await this.audit.record({
      actor: actor || null,
      action: 'operation.task_created',
      objectType: 'operational_tasks',
      objectId: taskId,
      metadata: {
        publicId,
        taskType: dto.task_type,
        sourceDomain: dto.source_domain,
        priority,
      },
    });

    // If assigned to user, send notification
    if (dto.assigned_to) {
      await this.notify.send(dto.assigned_to, 'TASK_ASSIGNED', {
        title: `Assigned: ${dto.title}`,
        body: `You have been assigned operational task ${publicId} (${priority}).`,
        severity: priority === 'CRITICAL' ? 'CRITICAL' : 'ACTION',
        actionUrl: `/dashboard/admin/operations/${taskId}`,
      });
    }

    const result = await this.getTaskById(actor || { id: 1 } as any, taskId);
    return { task: result.task, created: true };
  }

  /**
   * Assign or reassign an operational task to a staff member or operational team.
   */
  async assignTask(
    actor: AuthUser,
    taskId: number,
    dto: AssignOperationalTaskDto,
  ): Promise<OperationalTask> {
    const existing = await this.db.query<any>(
      `SELECT * FROM operational_tasks WHERE id = ?`,
      [taskId],
    );
    if (!existing.length) {
      throw new NotFoundException(`Operational task #${taskId} not found`);
    }

    const task = existing[0];
    const prevAssignedTo = task.assigned_to;
    const prevTeam = task.assigned_team;
    const prevStatus = task.status;

    let newStatus: TaskStatus = task.status;
    if (dto.assigned_to && task.status === 'OPEN') {
      newStatus = 'ASSIGNED';
    } else if (!dto.assigned_to && task.status === 'ASSIGNED') {
      newStatus = 'OPEN';
    }

    await this.db.query(
      `UPDATE operational_tasks
       SET assigned_to = ?, assigned_team = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [dto.assigned_to || null, dto.assigned_team || task.assigned_team, newStatus, taskId],
    );

    const eventType = prevAssignedTo ? 'TASK_REASSIGNED' : 'TASK_ASSIGNED';

    await this.db.insert('operational_task_events', {
      task_id: taskId,
      actor_id: actor.id,
      event_type: eventType,
      previous_state: JSON.stringify({ assigned_to: prevAssignedTo, assigned_team: prevTeam, status: prevStatus }),
      new_state: JSON.stringify({ assigned_to: dto.assigned_to, assigned_team: dto.assigned_team || prevTeam, status: newStatus }),
      notes: dto.notes || `Assigned to user #${dto.assigned_to || 'None'} (${dto.assigned_team || prevTeam})`,
    });

    await this.audit.record({
      actor,
      action: 'operation.task_assigned',
      objectType: 'operational_tasks',
      objectId: taskId,
      metadata: {
        taskId,
        publicId: task.public_id,
        assignedTo: dto.assigned_to,
        assignedTeam: dto.assigned_team,
      },
    });

    if (dto.assigned_to && dto.assigned_to !== actor.id) {
      await this.notify.send(dto.assigned_to, 'TASK_ASSIGNED', {
        title: `Task Assigned: ${task.title}`,
        body: `You were assigned operational task ${task.public_id} by ${actor.fullName}.`,
        severity: task.priority === 'CRITICAL' ? 'CRITICAL' : 'ACTION',
        actionUrl: `/dashboard/admin/operations/${taskId}`,
      });
    }

    const updated = await this.getTaskById(actor, taskId);
    return updated.task;
  }

  /**
   * Update task priority and optionally recalibrate SLA thresholds.
   */
  async updatePriority(
    actor: AuthUser,
    taskId: number,
    dto: UpdateTaskPriorityDto,
  ): Promise<OperationalTask> {
    const existing = await this.db.query<any>(
      `SELECT * FROM operational_tasks WHERE id = ?`,
      [taskId],
    );
    if (!existing.length) {
      throw new NotFoundException(`Operational task #${taskId} not found`);
    }

    const task = existing[0];
    const prevPriority = task.priority;

    await this.db.query(
      `UPDATE operational_tasks SET priority = ?, updated_at = NOW() WHERE id = ?`,
      [dto.priority, taskId],
    );

    await this.db.insert('operational_task_events', {
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'TASK_PRIORITY_CHANGED',
      previous_state: JSON.stringify({ priority: prevPriority }),
      new_state: JSON.stringify({ priority: dto.priority }),
      notes: dto.reason || `Priority adjusted from ${prevPriority} to ${dto.priority}`,
    });

    await this.audit.record({
      actor,
      action: 'operation.task_priority_changed',
      objectType: 'operational_tasks',
      objectId: taskId,
      metadata: {
        publicId: task.public_id,
        previousPriority: prevPriority,
        newPriority: dto.priority,
        reason: dto.reason,
      },
    });

    const updated = await this.getTaskById(actor, taskId);
    return updated.task;
  }

  /**
   * Update task status across governed workflow lifecycle states.
   */
  async updateStatus(
    actor: AuthUser,
    taskId: number,
    dto: UpdateTaskStatusDto,
  ): Promise<OperationalTask> {
    const existing = await this.db.query<any>(
      `SELECT * FROM operational_tasks WHERE id = ?`,
      [taskId],
    );
    if (!existing.length) {
      throw new NotFoundException(`Operational task #${taskId} not found`);
    }

    const task = existing[0];
    const prevStatus = task.status;

    let completedAt = task.completed_at;
    if (['RESOLVED', 'CLOSED'].includes(dto.status) && !completedAt) {
      completedAt = new Date();
    } else if (!['RESOLVED', 'CLOSED', 'CANCELLED'].includes(dto.status)) {
      completedAt = null;
    }

    await this.db.query(
      `UPDATE operational_tasks SET status = ?, completed_at = ?, updated_at = NOW() WHERE id = ?`,
      [dto.status, completedAt, taskId],
    );

    await this.db.insert('operational_task_events', {
      task_id: taskId,
      actor_id: actor.id,
      event_type: `TASK_STATUS_${dto.status}`,
      previous_state: JSON.stringify({ status: prevStatus }),
      new_state: JSON.stringify({ status: dto.status }),
      notes: dto.notes || `Status transition from ${prevStatus} to ${dto.status}`,
    });

    await this.audit.record({
      actor,
      action: 'operation.task_status_changed',
      objectType: 'operational_tasks',
      objectId: taskId,
      metadata: {
        publicId: task.public_id,
        previousStatus: prevStatus,
        newStatus: dto.status,
        notes: dto.notes,
      },
    });

    const updated = await this.getTaskById(actor, taskId);
    return updated.task;
  }

  /**
   * Escalate an operational task to High/Urgent/Critical priority and alert Management.
   */
  async escalateTask(
    actor: AuthUser,
    taskId: number,
    dto: EscalateOperationalTaskDto,
  ): Promise<OperationalTask> {
    const existing = await this.db.query<any>(
      `SELECT * FROM operational_tasks WHERE id = ?`,
      [taskId],
    );
    if (!existing.length) {
      throw new NotFoundException(`Operational task #${taskId} not found`);
    }

    const task = existing[0];
    const prevPriority = task.priority;
    const prevStatus = task.status;
    const targetPriority = dto.target_priority || 'URGENT';

    await this.db.query(
      `UPDATE operational_tasks
       SET status = 'ESCALATED', priority = ?, assigned_team = COALESCE(?, assigned_team), updated_at = NOW()
       WHERE id = ?`,
      [targetPriority, dto.escalate_to_team || null, taskId],
    );

    await this.db.insert('operational_task_events', {
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'TASK_ESCALATED',
      previous_state: JSON.stringify({ status: prevStatus, priority: prevPriority }),
      new_state: JSON.stringify({ status: 'ESCALATED', priority: targetPriority, team: dto.escalate_to_team }),
      notes: `Escalation Reason: ${dto.reason}`,
    });

    await this.audit.record({
      actor,
      action: 'operation.task_escalated',
      objectType: 'operational_tasks',
      objectId: taskId,
      metadata: {
        publicId: task.public_id,
        targetPriority,
        reason: dto.reason,
      },
    });

    // Alert admins
    const admins = await this.db.query<any>(
      `SELECT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
       WHERE r.code IN ('SUPER_ADMIN', 'ADMIN')`,
    );
    for (const a of admins) {
      await this.notify.send(a.id, 'OPERATIONAL_ESCALATION_MANAGEMENT', {
        title: `🚨 Operational Task Escalated: ${task.public_id}`,
        body: `${actor.fullName} escalated task "${task.title}". Reason: ${dto.reason}`,
        severity: targetPriority === 'CRITICAL' ? 'CRITICAL' : 'WARNING',
        actionUrl: `/dashboard/admin/operations/${taskId}`,
      });
    }

    const updated = await this.getTaskById(actor, taskId);
    return updated.task;
  }

  /**
   * Resolve an operational task with governance resolution notes.
   * INVARIANT: Zero mutation to underlying financial/legal/KYC domain state.
   */
  async resolveTask(
    actor: AuthUser,
    taskId: number,
    dto: ResolveOperationalTaskDto,
  ): Promise<OperationalTask> {
    const existing = await this.db.query<any>(
      `SELECT * FROM operational_tasks WHERE id = ?`,
      [taskId],
    );
    if (!existing.length) {
      throw new NotFoundException(`Operational task #${taskId} not found`);
    }

    const task = existing[0];
    const prevStatus = task.status;

    await this.db.query(
      `UPDATE operational_tasks
       SET status = 'RESOLVED', resolution_notes = ?, completed_at = NOW(), updated_at = NOW()
       WHERE id = ?`,
      [dto.resolution_notes, taskId],
    );

    await this.db.insert('operational_task_events', {
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'TASK_RESOLVED',
      previous_state: JSON.stringify({ status: prevStatus }),
      new_state: JSON.stringify({ status: 'RESOLVED', resolution_notes: dto.resolution_notes }),
      notes: `Resolution Notes: ${dto.resolution_notes}`,
    });

    await this.audit.record({
      actor,
      action: 'operation.task_resolved',
      objectType: 'operational_tasks',
      objectId: taskId,
      metadata: {
        publicId: task.public_id,
        resolutionNotes: dto.resolution_notes,
      },
    });

    const updated = await this.getTaskById(actor, taskId);
    return updated.task;
  }

  /**
   * Reopen a resolved or closed operational task.
   */
  async reopenTask(
    actor: AuthUser,
    taskId: number,
    dto: ReopenOperationalTaskDto,
  ): Promise<OperationalTask> {
    const existing = await this.db.query<any>(
      `SELECT * FROM operational_tasks WHERE id = ?`,
      [taskId],
    );
    if (!existing.length) {
      throw new NotFoundException(`Operational task #${taskId} not found`);
    }

    const task = existing[0];
    const prevStatus = task.status;

    await this.db.query(
      `UPDATE operational_tasks
       SET status = 'OPEN', completed_at = NULL, updated_at = NOW()
       WHERE id = ?`,
      [taskId],
    );

    await this.db.insert('operational_task_events', {
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'TASK_REOPENED',
      previous_state: JSON.stringify({ status: prevStatus }),
      new_state: JSON.stringify({ status: 'OPEN' }),
      notes: `Reopen Reason: ${dto.reopen_reason}`,
    });

    await this.audit.record({
      actor,
      action: 'operation.task_reopened',
      objectType: 'operational_tasks',
      objectId: taskId,
      metadata: {
        publicId: task.public_id,
        reason: dto.reopen_reason,
      },
    });

    const updated = await this.getTaskById(actor, taskId);
    return updated.task;
  }

  /**
   * Add a comment/audit note to the operational task timeline.
   */
  async addComment(
    actor: AuthUser,
    taskId: number,
    dto: AddTaskCommentDto,
  ): Promise<OperationalTaskEvent> {
    const existing = await this.db.query<any>(
      `SELECT id FROM operational_tasks WHERE id = ?`,
      [taskId],
    );
    if (!existing.length) {
      throw new NotFoundException(`Operational task #${taskId} not found`);
    }

    const eventId = await this.db.insert('operational_task_events', {
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'COMMENT_ADDED',
      previous_state: null,
      new_state: null,
      notes: dto.comment,
    });

    return {
      id: eventId,
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'COMMENT_ADDED',
      previous_state: null,
      new_state: null,
      notes: dto.comment,
      created_at: new Date().toISOString(),
      actor_name: actor.fullName,
      actor_role: actor.roles?.[0] || 'STAFF',
    };
  }

  /**
   * Unified exception aggregator across all platform business systems.
   */
  async getExceptionsOverview(): Promise<{
    financialExceptions: number;
    complianceExceptions: number;
    legalEscalations: number;
    disputeReviews: number;
    maintenanceEscalations: number;
    moderationPending: number;
    slaBreachedLeads: number;
    slaBreachedVisits: number;
    automationFailures: number;
    items: {
      category: string;
      title: string;
      sourceDomain: string;
      entityId: string;
      severity: string;
      createdAt: string;
      actionUrl: string;
    }[];
  }> {
    const items: any[] = [];

    // 1. Financial: overdue payments >= 7 days
    const overdue = await this.db.query<any>(
      `SELECT id, reference_code, total_amount, due_date, created_at
       FROM payments
       WHERE status = 'DUE' AND due_date < DATE_SUB(NOW(), INTERVAL 7 DAY)
       LIMIT 10`,
    );
    overdue.forEach((p: any) => {
      items.push({
        category: 'FINANCE_OVERDUE',
        title: `Overdue Payment: ${p.reference_code} (INR ${p.total_amount})`,
        sourceDomain: 'FINANCE',
        entityId: String(p.id),
        severity: 'URGENT',
        createdAt: p.created_at,
        actionUrl: `/dashboard/admin/finance`,
      });
    });

    // 2. Compliance: pending KYC submissions
    const kycPending = await this.db.query<any>(
      `SELECT k.id, k.legal_name, k.id_type, k.created_at, u.full_name
       FROM kyc_records k
       JOIN users u ON u.id = k.user_id
       WHERE k.status = 'SUBMITTED'
       LIMIT 10`,
    );
    kycPending.forEach((k: any) => {
      items.push({
        category: 'KYC_SUBMITTED',
        title: `KYC Review Pending: ${k.legal_name || k.full_name} (${k.id_type})`,
        sourceDomain: 'COMPLIANCE',
        entityId: String(k.id),
        severity: 'NORMAL',
        createdAt: k.created_at,
        actionUrl: `/dashboard/admin/compliance`,
      });
    });

    // 3. Legal: escalated legal cases
    const legalCases = await this.db.query<any>(
      `SELECT id, case_number, case_type, status, opened_at
       FROM legal_cases
       WHERE status IN ('QUEUED', 'DOCUMENT_REVIEW', 'DRAFTING', 'CONSULTATION_SCHEDULED', 'AWAITING_PARTY_INPUT')
       LIMIT 10`,
    );
    legalCases.forEach((l: any) => {
      items.push({
        category: 'LEGAL_ESCALATION',
        title: `Legal Case In Review: ${l.case_number} (${l.case_type})`,
        sourceDomain: 'LEGAL',
        entityId: String(l.id),
        severity: 'CRITICAL',
        createdAt: l.opened_at,
        actionUrl: `/dashboard/legal/${l.id}`,
      });
    });

    // 4. Disputes: open / escalated disputes
    const openDisputes = await this.db.query<any>(
      `SELECT id, case_number, category, status, created_at
       FROM disputes
       WHERE status IN ('OPEN', 'UNDER_REVIEW', 'EVIDENCE_SUBMITTED')
       LIMIT 10`,
    );
    openDisputes.forEach((d: any) => {
      items.push({
        category: 'DISPUTE_REVIEW',
        title: `Active Dispute: ${d.case_number} (${d.category})`,
        sourceDomain: 'DISPUTES',
        entityId: String(d.id),
        severity: 'HIGH',
        createdAt: d.created_at,
        actionUrl: `/dashboard/disputes/${d.id}`,
      });
    });

    // 5. Automation Failures
    const autoFailures = await this.db.query<any>(
      `SELECT e.id, r.rule_code, e.action_type, e.last_error, e.created_at
       FROM workflow_executions e
       LEFT JOIN workflow_rules r ON r.id = e.rule_id
       WHERE e.status = 'FAILED' AND e.acknowledged = 0
       LIMIT 10`,
    );
    autoFailures.forEach((f: any) => {
      items.push({
        category: 'AUTOMATION_FAILURE',
        title: `Failed Automation Action: ${f.rule_code || 'RULE'} (${f.action_type})`,
        sourceDomain: 'AUTOMATION',
        entityId: String(f.id),
        severity: 'HIGH',
        createdAt: f.created_at,
        actionUrl: `/dashboard/admin/automation`,
      });
    });

    return {
      financialExceptions: overdue.length,
      complianceExceptions: kycPending.length,
      legalEscalations: legalCases.length,
      disputeReviews: openDisputes.length,
      maintenanceEscalations: 0,
      moderationPending: 0,
      slaBreachedLeads: 0,
      slaBreachedVisits: 0,
      automationFailures: autoFailures.length,
      items,
    };
  }

  // --- Helper Methods ---

  private formatTaskRow(r: any): OperationalTask {
    const now = new Date();
    const slaDue = r.sla_due_at ? new Date(r.sla_due_at) : null;
    const due = r.due_at ? new Date(r.due_at) : null;

    let computedSlaStatus: SlaStatus = r.sla_status || 'ON_TRACK';
    if (!['RESOLVED', 'CLOSED', 'CANCELLED'].includes(r.status)) {
      if (slaDue && slaDue < now) {
        computedSlaStatus = 'BREACHED';
      } else if (due && due < now) {
        computedSlaStatus = 'OVERDUE';
      } else if (slaDue && slaDue.getTime() - now.getTime() < 4 * 3600 * 1000) {
        computedSlaStatus = 'DUE_SOON';
      } else {
        computedSlaStatus = 'ON_TRACK';
      }
    }

    return {
      id: r.id,
      public_id: r.public_id,
      task_type: r.task_type,
      title: r.title,
      description: r.description,
      source_domain: r.source_domain as TaskSourceDomain,
      source_entity_type: r.source_entity_type,
      source_entity_id: String(r.source_entity_id),
      priority: r.priority as TaskPriority,
      status: r.status as TaskStatus,
      assigned_to: r.assigned_to,
      assigned_team: r.assigned_team,
      created_by: r.created_by,
      due_at: r.due_at,
      sla_due_at: r.sla_due_at,
      sla_status: computedSlaStatus,
      completed_at: r.completed_at,
      resolution_notes: r.resolution_notes,
      metadata: typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata,
      idempotency_key: r.idempotency_key,
      created_at: r.created_at,
      updated_at: r.updated_at,
      assignee_name: r.assignee_name || null,
      assignee_email: r.assignee_email || null,
      creator_name: r.creator_name || 'SYSTEM',
      entity_url: this.resolveEntityUrl(r.source_domain, r.source_entity_type, r.source_entity_id),
    };
  }

  private resolveEntityUrl(domain: string, entityType: string, entityId: string): string {
    const type = (entityType || '').toLowerCase();
    if (type.includes('pay') || domain === 'FINANCE') return `/dashboard/admin/finance`;
    if (type.includes('legal') || domain === 'LEGAL') return `/dashboard/legal/${entityId}`;
    if (type.includes('dispute') || domain === 'DISPUTES') return `/dashboard/disputes/${entityId}`;
    if (type.includes('maint') || domain === 'MAINTENANCE') return `/dashboard/maintenance/${entityId}`;
    if (type.includes('doc') || type.includes('kyc') || domain === 'COMPLIANCE') return `/dashboard/admin/compliance`;
    if (type.includes('prop') || domain === 'MARKETPLACE') return `/dashboard/admin/marketplace`;
    if (type.includes('visit') || domain === 'VISITS') return `/dashboard/admin/visits`;
    if (type.includes('lead') || domain === 'LEADS') return `/dashboard/admin/leads`;
    if (type.includes('comm') || type.includes('conv') || domain === 'COMMUNICATION') return `/dashboard/admin/messages`;
    if (domain === 'AUTOMATION') return `/dashboard/admin/automation`;
    return `/dashboard/admin`;
  }

  private async fetchDomainContext(domain: string, entityType: string, entityId: string): Promise<Record<string, any>> {
    try {
      const type = (entityType || '').toLowerCase();
      if (type === 'payment' || (domain === 'FINANCE' && !isNaN(Number(entityId)))) {
        const rows = await this.db.query<any>(`SELECT * FROM payments WHERE id = ?`, [Number(entityId)]);
        if (rows.length) return { type: 'payment', data: rows[0] };
      }
      if (type === 'legal_case' || (domain === 'LEGAL' && !isNaN(Number(entityId)))) {
        const rows = await this.db.query<any>(`SELECT * FROM legal_cases WHERE id = ?`, [Number(entityId)]);
        if (rows.length) return { type: 'legal_case', data: rows[0] };
      }
      if (type === 'dispute' || (domain === 'DISPUTES' && !isNaN(Number(entityId)))) {
        const rows = await this.db.query<any>(`SELECT * FROM disputes WHERE id = ?`, [Number(entityId)]);
        if (rows.length) return { type: 'dispute', data: rows[0] };
      }
      if (type === 'property' || (domain === 'MARKETPLACE' && !isNaN(Number(entityId)))) {
        const rows = await this.db.query<any>(`SELECT * FROM properties WHERE id = ?`, [Number(entityId)]);
        if (rows.length) return { type: 'property', data: rows[0] };
      }
      if (type === 'document' || (domain === 'COMPLIANCE' && !isNaN(Number(entityId)))) {
        const rows = await this.db.query<any>(`SELECT * FROM compliance_documents WHERE id = ?`, [Number(entityId)]);
        if (rows.length) return { type: 'compliance_document', data: rows[0] };
      }
    } catch {
      // Gracefully return empty object if context table lookup fails
    }
    return { type: entityType, entityId };
  }

  private getDefaultSlaHours(priority: TaskPriority): number {
    switch (priority) {
      case 'CRITICAL':
        return 4;
      case 'URGENT':
        return 12;
      case 'HIGH':
        return 24;
      case 'NORMAL':
        return 48;
      case 'LOW':
        return 96;
      default:
        return 48;
    }
  }

  private getDefaultDueHours(priority: TaskPriority): number {
    switch (priority) {
      case 'CRITICAL':
        return 12;
      case 'URGENT':
        return 24;
      case 'HIGH':
        return 48;
      case 'NORMAL':
        return 96;
      case 'LOW':
        return 168;
      default:
        return 96;
    }
  }

  private inferDefaultTeam(domain: TaskSourceDomain): string {
    switch (domain) {
      case 'FINANCE':
      case 'PAYMENTS':
        return 'FINANCE';
      case 'LEGAL':
        return 'LEGAL';
      case 'COMPLIANCE':
        return 'COMPLIANCE';
      case 'MARKETPLACE':
        return 'MARKETPLACE';
      case 'DISPUTES':
      case 'MAINTENANCE':
      case 'TENANCY':
        return 'OPERATIONS';
      case 'VISITS':
      case 'LEADS':
      case 'COMMUNICATION':
        return 'SUPPORT';
      default:
        return 'OPERATIONS';
    }
  }
}
