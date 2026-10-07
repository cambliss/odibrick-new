import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId } from '../../common/util/ids';
import { OperationalTasksService } from '../operations/operational-tasks.service';
import { AutomationService } from '../automation/automation.service';
import {
  AssignRiskCaseDto,
  CreateRiskCaseDto,
  CreateRiskSignalDto,
  EscalateRiskCaseDto,
  FalsePositiveRiskCaseDto,
  LogSecurityEventDto,
  QueryRiskCasesDto,
  QueryRiskSignalsDto,
  QuerySecurityEventsDto,
  ReopenRiskCaseDto,
  RequestEvidenceRiskCaseDto,
  ResolveRiskCaseDto,
} from './risk.dto';
import {
  RiskCaseEventRecord,
  RiskCaseRecord,
  RiskOverviewKpis,
  RiskSignalRecord,
  SecurityEventRecord,
  SuspiciousAccountItem,
  SuspiciousListingItem,
  SuspiciousPaymentItem,
} from './risk.types';

@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly operationalTasks: OperationalTasksService,
    private readonly automation: AutomationService,
  ) {}

  // ------------------------------------------------------------------ SECURITY EVENTS
  async logSecurityEvent(dto: LogSecurityEventDto, req?: any): Promise<SecurityEventRecord> {
    const publicId = newPublicId();
    const [res]: any = await this.db.execute(
      `INSERT INTO security_events (
        public_id, event_type, severity, actor_id, actor_role, actor_ip, user_agent,
        entity_type, entity_id, summary, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        publicId,
        dto.eventType,
        dto.severity,
        dto.actorId ?? null,
        dto.actorRole ?? null,
        dto.actorIp ?? (req?.ip || null),
        dto.userAgent ?? (req?.headers ? req.headers['user-agent'] : null),
        dto.entityType ?? null,
        dto.entityId ?? null,
        dto.summary,
        dto.metadata ? JSON.stringify(dto.metadata) : null,
      ],
    );

    return this.getSecurityEventById(res.insertId);
  }

  async getSecurityEventById(id: number): Promise<SecurityEventRecord> {
    const row = await this.db.one<any>(
      `SELECT se.*, u.full_name AS actor_name, u.email AS actor_email
       FROM security_events se
       LEFT JOIN users u ON u.id = se.actor_id
       WHERE se.id = ? LIMIT 1`,
      [id],
    );
    if (!row) throw new NotFoundException(`Security event with ID ${id} not found.`);
    return this.formatSecurityEvent(row);
  }

  async getSecurityEvents(query: QuerySecurityEventsDto): Promise<{ data: SecurityEventRecord[]; total: number; page: number; pageSize: number }> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (query.eventType) {
      conditions.push('se.event_type = ?');
      params.push(query.eventType);
    }
    if (query.severity) {
      conditions.push('se.severity = ?');
      params.push(query.severity);
    }
    if (query.actorId) {
      conditions.push('se.actor_id = ?');
      params.push(query.actorId);
    }
    if (query.search) {
      conditions.push('(se.summary LIKE ? OR se.event_type LIKE ? OR se.public_id LIKE ?)');
      const term = `%${query.search}%`;
      params.push(term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM security_events se WHERE ${whereClause}`,
      params,
    );
    const total = Number(countRow?.total || 0);

    const rows = await this.db.query<any>(
      `SELECT se.*, u.full_name AS actor_name, u.email AS actor_email
       FROM security_events se
       LEFT JOIN users u ON u.id = se.actor_id
       WHERE ${whereClause}
       ORDER BY se.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      data: rows.map((r) => this.formatSecurityEvent(r)),
      total,
      page,
      pageSize,
    };
  }

  // ------------------------------------------------------------------ RISK SIGNALS
  async detectRiskSignal(dto: CreateRiskSignalDto): Promise<RiskSignalRecord> {
    const publicId = newPublicId();
    const [res]: any = await this.db.execute(
      `INSERT INTO risk_signals (
        public_id, signal_type, severity, source_domain, source_entity_type, source_entity_id,
        subject_user_id, detected_value, threshold_value, explanation, status, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?)`,
      [
        publicId,
        dto.signalType,
        dto.severity,
        dto.sourceDomain,
        dto.sourceEntityType,
        dto.sourceEntityId,
        dto.subjectUserId ?? null,
        dto.detectedValue,
        dto.thresholdValue,
        dto.explanation,
        dto.metadata ? JSON.stringify(dto.metadata) : null,
      ],
    );

    return this.getRiskSignalById(res.insertId);
  }

  async getRiskSignalById(id: number): Promise<RiskSignalRecord> {
    const row = await this.db.one<any>(
      `SELECT rs.*, u.full_name AS subject_name, u.email AS subject_email
       FROM risk_signals rs
       LEFT JOIN users u ON u.id = rs.subject_user_id
       WHERE rs.id = ? LIMIT 1`,
      [id],
    );
    if (!row) throw new NotFoundException(`Risk signal with ID ${id} not found.`);
    return this.formatRiskSignal(row);
  }

  async getRiskSignals(query: QueryRiskSignalsDto): Promise<{ data: RiskSignalRecord[]; total: number; page: number; pageSize: number }> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (query.signalType) {
      conditions.push('rs.signal_type = ?');
      params.push(query.signalType);
    }
    if (query.severity) {
      conditions.push('rs.severity = ?');
      params.push(query.severity);
    }
    if (query.sourceDomain) {
      conditions.push('rs.source_domain = ?');
      params.push(query.sourceDomain);
    }
    if (query.status) {
      conditions.push('rs.status = ?');
      params.push(query.status);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM risk_signals rs WHERE ${whereClause}`,
      params,
    );
    const total = Number(countRow?.total || 0);

    const rows = await this.db.query<any>(
      `SELECT rs.*, u.full_name AS subject_name, u.email AS subject_email
       FROM risk_signals rs
       LEFT JOIN users u ON u.id = rs.subject_user_id
       WHERE ${whereClause}
       ORDER BY rs.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      data: rows.map((r) => this.formatRiskSignal(r)),
      total,
      page,
      pageSize,
    };
  }

  // ------------------------------------------------------------------ RISK CASES
  async createRiskCase(dto: CreateRiskCaseDto, actor?: AuthUser): Promise<RiskCaseRecord> {
    if (dto.idempotencyKey) {
      const existing = await this.db.one<any>(
        'SELECT id FROM risk_cases WHERE idempotency_key = ? LIMIT 1',
        [dto.idempotencyKey],
      );
      if (existing) {
        return this.getCaseById(existing.id);
      }
    }

    const nextNumRow = await this.db.one<{ maxId: number }>(
      'SELECT IFNULL(MAX(id), 0) + 1 AS maxId FROM risk_cases',
    );
    const seq = nextNumRow?.maxId || 1;
    const caseNumber = `ODB-RSK-2026-${String(seq).padStart(6, '0')}`;
    const publicId = newPublicId();

    const caseId = await this.db.transaction(async (conn) => {
      const [res]: any = await conn.execute(
        `INSERT INTO risk_cases (
          public_id, case_number, case_type, subject_user_id, subject_property_id, subject_payment_id,
          risk_level, status, assigned_to, summary, evidence, idempotency_key
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?)`,
        [
          publicId,
          caseNumber,
          dto.caseType,
          dto.subjectUserId ?? null,
          dto.subjectPropertyId ?? null,
          dto.subjectPaymentId ?? null,
          dto.riskLevel,
          dto.assignedTo ?? null,
          dto.summary,
          dto.evidence ? JSON.stringify(dto.evidence) : null,
          dto.idempotencyKey ?? null,
        ],
      );
      const insertedId = res.insertId;

      await conn.execute(
        `INSERT INTO risk_case_events (case_id, actor_id, event_type, new_state, notes)
         VALUES (?, ?, 'CASE_CREATED', ?, ?)`,
        [
          insertedId,
          actor?.id ?? null,
          JSON.stringify({ status: 'OPEN', risk_level: dto.riskLevel, case_number: caseNumber }),
          `Risk case ${caseNumber} created with ${dto.riskLevel} risk level.`,
        ],
      );

      return insertedId;
    });

    // Phase 15 Operational Control Tower Integration:
    // When HIGH or CRITICAL risk case requires Management attention, auto-create an operational task
    if (dto.riskLevel === 'CRITICAL' || dto.riskLevel === 'HIGH') {
      try {
        await this.operationalTasks.createTask(
          actor ?? null,
          {
            task_type: 'RISK_INVESTIGATION',
            title: `[Risk ${dto.riskLevel}] ${dto.summary}`,
            description: `Automated high-priority fraud/risk investigation triggered for case ${caseNumber}.`,
            source_domain: 'RISK' as any,
            source_entity_type: 'risk_case',
            source_entity_id: String(caseId),
            priority: dto.riskLevel === 'CRITICAL' ? 'CRITICAL' : 'URGENT',
            assigned_team: 'SECURITY',
            assigned_to: dto.assignedTo ?? undefined,
            due_hours: dto.riskLevel === 'CRITICAL' ? 4 : 12,
            idempotency_key: `TASK:RISK:CASE:${caseId}:AUTO`,
            metadata: {
              caseNumber,
              riskLevel: dto.riskLevel,
              caseType: dto.caseType,
              subjectUserId: dto.subjectUserId,
              subjectPropertyId: dto.subjectPropertyId,
              subjectPaymentId: dto.subjectPaymentId,
            },
          },
        );
      } catch (err: any) {
        this.logger.warn(`Failed to spawn operational task for risk case ${caseId}: ${err.message}`);
      }
    }

    // Phase 14 Workflow Automation Integration:
    try {
      await this.automation.emit(
        {
          eventType: 'RISK_CASE_CREATED',
          entityType: 'risk_case',
          entityId: Number(caseId),
          payload: {
            caseNumber,
            riskLevel: dto.riskLevel,
            caseType: dto.caseType,
            summary: dto.summary,
            subjectUserId: dto.subjectUserId,
          },
          idempotencyKey: `EVENT:RISK:CASE:${caseId}:CREATED`,
        },
        actor,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to emit automation event for risk case ${caseId}: ${err.message}`);
    }

    // Audit record
    await this.audit.record({
      actor,
      action: 'risk.case_created',
      objectType: 'risk_case',
      objectId: caseId,
      metadata: { caseNumber, riskLevel: dto.riskLevel, caseType: dto.caseType },
    });

    return this.getCaseById(caseId);
  }

  async getCases(query: QueryRiskCasesDto): Promise<{ data: RiskCaseRecord[]; total: number; page: number; pageSize: number }> {
    const page = query.page || 1;
    const pageSize = query.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (query.status) {
      conditions.push('rc.status = ?');
      params.push(query.status);
    }
    if (query.riskLevel) {
      conditions.push('rc.risk_level = ?');
      params.push(query.riskLevel);
    }
    if (query.caseType) {
      conditions.push('rc.case_type = ?');
      params.push(query.caseType);
    }
    if (query.assignedTo) {
      conditions.push('rc.assigned_to = ?');
      params.push(query.assignedTo);
    }
    if (query.search) {
      conditions.push('(rc.case_number LIKE ? OR rc.summary LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)');
      const term = `%${query.search}%`;
      params.push(term, term, term, term);
    }

    const whereClause = conditions.join(' AND ');

    const countRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM risk_cases rc
       LEFT JOIN users u ON u.id = rc.subject_user_id
       WHERE ${whereClause}`,
      params,
    );
    const total = Number(countRow?.total || 0);

    const rows = await this.db.query<any>(
      `SELECT rc.*,
              u.full_name AS subject_name, u.email AS subject_email,
              au.full_name AS assigned_name,
              ru.full_name AS resolved_by_name,
              p.title AS property_title, p.public_id AS property_code,
              pay.reference_code AS payment_reference, pay.total_amount AS payment_amount
       FROM risk_cases rc
       LEFT JOIN users u ON u.id = rc.subject_user_id
       LEFT JOIN users au ON au.id = rc.assigned_to
       LEFT JOIN users ru ON ru.id = rc.resolved_by
       LEFT JOIN properties p ON p.id = rc.subject_property_id
       LEFT JOIN payments pay ON pay.id = rc.subject_payment_id
       WHERE ${whereClause}
       ORDER BY
         CASE rc.risk_level
           WHEN 'CRITICAL' THEN 1
           WHEN 'HIGH' THEN 2
           WHEN 'MEDIUM' THEN 3
           ELSE 4
         END,
         rc.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset],
    );

    return {
      data: rows.map((r) => this.formatRiskCase(r)),
      total,
      page,
      pageSize,
    };
  }

  async getCaseById(id: number | string): Promise<RiskCaseRecord & { timeline: RiskCaseEventRecord[]; signals: RiskSignalRecord[]; operationalTask?: any }> {
    const isNum = !isNaN(Number(id));
    const row = await this.db.one<any>(
      `SELECT rc.*,
              u.full_name AS subject_name, u.email AS subject_email,
              au.full_name AS assigned_name,
              ru.full_name AS resolved_by_name,
              p.title AS property_title, p.property_code,
              pay.reference_code AS payment_reference, pay.total_amount AS payment_amount
       FROM risk_cases rc
       LEFT JOIN users u ON u.id = rc.subject_user_id
       LEFT JOIN users au ON au.id = rc.assigned_to
       LEFT JOIN users ru ON ru.id = rc.resolved_by
       LEFT JOIN properties p ON p.id = rc.subject_property_id
       LEFT JOIN payments pay ON pay.id = rc.subject_payment_id
       WHERE ${isNum ? 'rc.id = ?' : 'rc.public_id = ? OR rc.case_number = ?'} LIMIT 1`,
      isNum ? [id] : [id, id],
    );

    if (!row) throw new NotFoundException(`Risk case ${id} not found.`);

    // Fetch timeline events
    const timelineRows = await this.db.query<any>(
      `SELECT rce.*, u.full_name AS actor_name,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS actor_role
       FROM risk_case_events rce
       LEFT JOIN users u ON u.id = rce.actor_id
       WHERE rce.case_id = ?
       ORDER BY rce.created_at ASC`,
      [row.id],
    );

    // Fetch linked signals
    const signalRows = await this.db.query<any>(
      `SELECT rs.*, u.full_name AS subject_name, u.email AS subject_email
       FROM risk_signals rs
       LEFT JOIN users u ON u.id = rs.subject_user_id
       WHERE (rs.subject_user_id = ? AND rs.subject_user_id IS NOT NULL)
          OR (rs.source_entity_type = 'risk_case' AND rs.source_entity_id = ?)
          OR (rs.source_entity_type = 'payment' AND rs.source_entity_id = ?)
          OR (rs.source_entity_type = 'property' AND rs.source_entity_id = ?)
       ORDER BY rs.created_at DESC
       LIMIT 20`,
      [row.subject_user_id ?? 0, String(row.id), String(row.subject_payment_id ?? 0), String(row.subject_property_id ?? 0)],
    );

    // Fetch linked operational task if any
    const opTaskRow = await this.db.one<any>(
      `SELECT id, public_id, title, priority, status, assigned_team, sla_status, due_at
       FROM operational_tasks
       WHERE source_domain = 'RISK' AND source_entity_id = ? LIMIT 1`,
      [String(row.id)],
    );

    const formattedCase = this.formatRiskCase(row);
    return {
      ...formattedCase,
      timeline: timelineRows.map((e) => this.formatRiskCaseEvent(e)),
      signals: signalRows.map((s) => this.formatRiskSignal(s)),
      operationalTask: opTaskRow || undefined,
    };
  }

  // ------------------------------------------------------------------ CASE WORKFLOW ACTIONS
  async assignCase(id: number | string, dto: AssignRiskCaseDto, actor?: AuthUser): Promise<RiskCaseRecord> {
    const caseRecord = await this.getCaseById(id);

    const assignee = await this.db.one<{ id: number; full_name: string }>(
      'SELECT id, full_name FROM users WHERE id = ? LIMIT 1',
      [dto.assignedTo],
    );
    if (!assignee) throw new NotFoundException(`User with ID ${dto.assignedTo} not found.`);

    const newStatus = caseRecord.status === 'OPEN' ? 'UNDER_REVIEW' : caseRecord.status;

    await this.db.transaction(async (conn) => {
      await conn.execute(
        'UPDATE risk_cases SET assigned_to = ?, status = ? WHERE id = ?',
        [dto.assignedTo, newStatus, caseRecord.id],
      );

      await conn.execute(
        `INSERT INTO risk_case_events (case_id, actor_id, event_type, previous_state, new_state, notes)
         VALUES (?, ?, 'CASE_ASSIGNED', ?, ?, ?)`,
        [
          caseRecord.id,
          actor?.id ?? null,
          JSON.stringify({ assigned_to: caseRecord.assigned_to, status: caseRecord.status }),
          JSON.stringify({ assigned_to: dto.assignedTo, status: newStatus }),
          dto.notes ?? `Case assigned to ${assignee.full_name}.`,
        ],
      );
    });

    await this.audit.record({
      actor,
      action: 'risk.case_assigned',
      objectType: 'risk_case',
      objectId: caseRecord.id,
      metadata: { caseNumber: caseRecord.case_number, assignedTo: dto.assignedTo, assigneeName: assignee.full_name },
    });

    return this.getCaseById(caseRecord.id);
  }

  async escalateCase(id: number | string, dto: EscalateRiskCaseDto, actor?: AuthUser): Promise<RiskCaseRecord> {
    const caseRecord = await this.getCaseById(id);
    const elevatedLevel = dto.elevatedRiskLevel || (caseRecord.risk_level === 'CRITICAL' ? 'CRITICAL' : 'HIGH');

    await this.db.transaction(async (conn) => {
      await conn.execute(
        `UPDATE risk_cases SET status = 'ESCALATED', risk_level = ? WHERE id = ?`,
        [elevatedLevel, caseRecord.id],
      );

      await conn.execute(
        `INSERT INTO risk_case_events (case_id, actor_id, event_type, previous_state, new_state, notes)
         VALUES (?, ?, 'CASE_ESCALATED', ?, ?, ?)`,
        [
          caseRecord.id,
          actor?.id ?? null,
          JSON.stringify({ status: caseRecord.status, risk_level: caseRecord.risk_level }),
          JSON.stringify({ status: 'ESCALATED', risk_level: elevatedLevel }),
          dto.reason,
        ],
      );
    });

    // Spawn / Escalate Phase 15 Operational Task
    try {
      await this.operationalTasks.createTask(
        actor ?? null,
        {
          task_type: 'RISK_ESCALATION',
          title: `[ESCALATED RISK] Case ${caseRecord.case_number}: ${caseRecord.summary}`,
          description: `Management escalation: ${dto.reason}`,
          source_domain: 'RISK' as any,
          source_entity_type: 'risk_case',
          source_entity_id: String(caseRecord.id),
          priority: 'CRITICAL',
          assigned_team: 'SECURITY',
          due_hours: 4,
          idempotency_key: `TASK:RISK:ESCALATE:${caseRecord.id}:${Date.now()}`,
        },
      );
    } catch (err: any) {
      this.logger.warn(`Failed to link escalated task: ${err.message}`);
    }

    // Automation notification
    try {
      await this.automation.emit(
        {
          eventType: 'RISK_CASE_ESCALATED',
          entityType: 'risk_case',
          entityId: Number(caseRecord.id),
          payload: { caseNumber: caseRecord.case_number, reason: dto.reason, riskLevel: elevatedLevel },
        },
        actor,
      );
    } catch (err: any) {
      this.logger.warn(`Failed to emit automation event: ${err.message}`);
    }

    await this.audit.record({
      actor,
      action: 'risk.case_escalated',
      objectType: 'risk_case',
      objectId: caseRecord.id,
      metadata: { caseNumber: caseRecord.case_number, reason: dto.reason, elevatedLevel },
    });

    return this.getCaseById(caseRecord.id);
  }

  async requestEvidence(id: number | string, dto: RequestEvidenceRiskCaseDto, actor?: AuthUser): Promise<RiskCaseRecord> {
    const caseRecord = await this.getCaseById(id);

    await this.db.transaction(async (conn) => {
      await conn.execute(
        `UPDATE risk_cases SET status = 'EVIDENCE_REQUESTED' WHERE id = ?`,
        [caseRecord.id],
      );

      await conn.execute(
        `INSERT INTO risk_case_events (case_id, actor_id, event_type, previous_state, new_state, notes)
         VALUES (?, ?, 'EVIDENCE_REQUESTED', ?, ?, ?)`,
        [
          caseRecord.id,
          actor?.id ?? null,
          JSON.stringify({ status: caseRecord.status }),
          JSON.stringify({ status: 'EVIDENCE_REQUESTED' }),
          `Evidence requested: ${dto.requestedItems}`,
        ],
      );
    });

    await this.audit.record({
      actor,
      action: 'risk.evidence_requested',
      objectType: 'risk_case',
      objectId: caseRecord.id,
      metadata: { caseNumber: caseRecord.case_number, requestedItems: dto.requestedItems },
    });

    return this.getCaseById(caseRecord.id);
  }

  async resolveCase(id: number | string, dto: ResolveRiskCaseDto, actor?: AuthUser): Promise<RiskCaseRecord> {
    const caseRecord = await this.getCaseById(id);
    const targetStatus = dto.targetStatus || 'RESOLVED';

    await this.db.transaction(async (conn) => {
      await conn.execute(
        `UPDATE risk_cases
         SET status = ?, resolution_notes = ?, resolved_by = ?, resolved_at = NOW()
         WHERE id = ?`,
        [targetStatus, dto.resolutionNotes, actor?.id ?? null, caseRecord.id],
      );

      await conn.execute(
        `INSERT INTO risk_case_events (case_id, actor_id, event_type, previous_state, new_state, notes)
         VALUES (?, ?, 'CASE_RESOLVED', ?, ?, ?)`,
        [
          caseRecord.id,
          actor?.id ?? null,
          JSON.stringify({ status: caseRecord.status }),
          JSON.stringify({ status: targetStatus, resolutionNotes: dto.resolutionNotes }),
          dto.resolutionNotes,
        ],
      );
    });

    await this.audit.record({
      actor,
      action: 'risk.case_resolved',
      objectType: 'risk_case',
      objectId: caseRecord.id,
      metadata: { caseNumber: caseRecord.case_number, targetStatus, resolutionNotes: dto.resolutionNotes },
    });

    return this.getCaseById(caseRecord.id);
  }

  async markFalsePositive(id: number | string, dto: FalsePositiveRiskCaseDto, actor?: AuthUser): Promise<RiskCaseRecord> {
    const caseRecord = await this.getCaseById(id);

    await this.db.transaction(async (conn) => {
      await conn.execute(
        `UPDATE risk_cases
         SET status = 'FALSE_POSITIVE', resolution_notes = ?, resolved_by = ?, resolved_at = NOW()
         WHERE id = ?`,
        [dto.reason, actor?.id ?? null, caseRecord.id],
      );

      // Also update linked signals to FALSE_POSITIVE
      if (caseRecord.subject_user_id) {
        await conn.execute(
          `UPDATE risk_signals SET status = 'FALSE_POSITIVE' WHERE subject_user_id = ? AND status = 'ACTIVE'`,
          [caseRecord.subject_user_id],
        );
      }

      await conn.execute(
        `INSERT INTO risk_case_events (case_id, actor_id, event_type, previous_state, new_state, notes)
         VALUES (?, ?, 'FALSE_POSITIVE_MARKED', ?, ?, ?)`,
        [
          caseRecord.id,
          actor?.id ?? null,
          JSON.stringify({ status: caseRecord.status }),
          JSON.stringify({ status: 'FALSE_POSITIVE', reason: dto.reason }),
          `Marked false positive: ${dto.reason}`,
        ],
      );
    });

    await this.audit.record({
      actor,
      action: 'risk.case_false_positive',
      objectType: 'risk_case',
      objectId: caseRecord.id,
      metadata: { caseNumber: caseRecord.case_number, reason: dto.reason },
    });

    return this.getCaseById(caseRecord.id);
  }

  async reopenCase(id: number | string, dto: ReopenRiskCaseDto, actor?: AuthUser): Promise<RiskCaseRecord> {
    const caseRecord = await this.getCaseById(id);

    await this.db.transaction(async (conn) => {
      await conn.execute(
        `UPDATE risk_cases
         SET status = 'UNDER_REVIEW', resolved_at = NULL, resolved_by = NULL
         WHERE id = ?`,
        [caseRecord.id],
      );

      await conn.execute(
        `INSERT INTO risk_case_events (case_id, actor_id, event_type, previous_state, new_state, notes)
         VALUES (?, ?, 'CASE_REOPENED', ?, ?, ?)`,
        [
          caseRecord.id,
          actor?.id ?? null,
          JSON.stringify({ status: caseRecord.status }),
          JSON.stringify({ status: 'UNDER_REVIEW', reason: dto.reason }),
          `Case reopened: ${dto.reason}`,
        ],
      );
    });

    await this.audit.record({
      actor,
      action: 'risk.case_reopened',
      objectType: 'risk_case',
      objectId: caseRecord.id,
      metadata: { caseNumber: caseRecord.case_number, reason: dto.reason },
    });

    return this.getCaseById(caseRecord.id);
  }

  // ------------------------------------------------------------------ EXECUTIVE OVERVIEW & INTELLIGENCE
  async getOverview(): Promise<RiskOverviewKpis> {
    // Risk cases breakdown
    const casesSummary = await this.db.one<any>(
      `SELECT
         COUNT(CASE WHEN status IN ('OPEN', 'UNDER_REVIEW', 'EVIDENCE_REQUESTED', 'ACTION_REQUIRED', 'ESCALATED') THEN 1 END) AS openCases,
         COUNT(CASE WHEN risk_level = 'CRITICAL' AND status NOT IN ('RESOLVED', 'CLOSED', 'FALSE_POSITIVE') THEN 1 END) AS criticalRisks,
         COUNT(CASE WHEN risk_level = 'HIGH' AND status NOT IN ('RESOLVED', 'CLOSED', 'FALSE_POSITIVE') THEN 1 END) AS highRisks,
         COUNT(CASE WHEN risk_level = 'MEDIUM' AND status NOT IN ('RESOLVED', 'CLOSED', 'FALSE_POSITIVE') THEN 1 END) AS mediumRisks,
         COUNT(CASE WHEN risk_level = 'LOW' AND status NOT IN ('RESOLVED', 'CLOSED', 'FALSE_POSITIVE') THEN 1 END) AS lowRisks,
         IFNULL(AVG(CASE WHEN resolved_at IS NOT NULL THEN TIMESTAMPDIFF(HOUR, created_at, resolved_at) END), 0) AS avgResolutionHours
       FROM risk_cases`,
    );

    // Unresolved security events
    const secEventsSummary = await this.db.one<any>(
      `SELECT
         COUNT(CASE WHEN severity IN ('HIGH', 'CRITICAL') OR created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) AS unresolvedSecurityEvents,
         COUNT(CASE WHEN event_type LIKE '%LOGIN_FAILURE%' AND created_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR) THEN 1 END) AS failedAuthSpikes
       FROM security_events`,
    );

    // Suspicious payments count (payments with failed status, or multiple retries)
    const paySummary = await this.db.one<any>(
      `SELECT COUNT(DISTINCT id) AS cnt FROM payments WHERE status = 'FAILED' OR status = 'OVERDUE'`,
    );

    // Suspicious accounts count (locked, high failed attempts, or suspended)
    const accSummary = await this.db.one<any>(
      `SELECT COUNT(DISTINCT id) AS cnt FROM users WHERE failed_attempts >= 3 OR locked_until > NOW() OR status IN ('SUSPENDED', 'DISABLED')`,
    );

    // Suspicious listings count (suspended or duplicate flagged)
    const propSummary = await this.db.one<any>(
      `SELECT COUNT(DISTINCT id) AS cnt FROM properties WHERE status IN ('SUSPENDED', 'REJECTED')`,
    );

    // Active signals
    const sigSummary = await this.db.one<any>(
      `SELECT COUNT(DISTINCT id) AS cnt FROM risk_signals WHERE status = 'ACTIVE'`,
    );

    return {
      openCases: Number(casesSummary?.openCases || 0),
      criticalRisks: Number(casesSummary?.criticalRisks || 0),
      highRisks: Number(casesSummary?.highRisks || 0),
      mediumRisks: Number(casesSummary?.mediumRisks || 0),
      lowRisks: Number(casesSummary?.lowRisks || 0),
      unresolvedSecurityEvents: Number(secEventsSummary?.unresolvedSecurityEvents || 0),
      suspiciousPaymentsCount: Number(paySummary?.cnt || 0),
      suspiciousAccountsCount: Number(accSummary?.cnt || 0),
      suspiciousListingsCount: Number(propSummary?.cnt || 0),
      failedAuthSpikes: Number(secEventsSummary?.failedAuthSpikes || 0),
      activeSignalsCount: Number(sigSummary?.cnt || 0),
      avgResolutionHours: Math.round(Number(casesSummary?.avgResolutionHours || 0) * 10) / 10,
    };
  }

  async getSuspiciousPayments(): Promise<SuspiciousPaymentItem[]> {
    const rows = await this.db.query<any>(
      `SELECT pay.id AS paymentId, pay.reference_code AS referenceCode, pay.total_amount AS amount,
              pay.purpose, pay.status, pay.created_at AS lastAttemptAt,
              u.id AS payerId, u.full_name AS payerName, u.email AS payerEmail
       FROM payments pay
       JOIN users u ON u.id = pay.payer_user_id
       WHERE pay.status IN ('FAILED', 'OVERDUE')
       ORDER BY pay.created_at DESC
       LIMIT 25`,
    );

    return rows.map((r) => ({
      paymentId: r.paymentId,
      referenceCode: r.referenceCode,
      payerId: r.payerId,
      payerName: r.payerName,
      payerEmail: this.maskEmail(r.payerEmail),
      amount: Number(r.amount || 0),
      purpose: r.purpose,
      status: r.status,
      failureCount: r.status === 'FAILED' ? 3 : 1,
      riskReason: r.status === 'FAILED' ? 'Repeated transaction decline / payment failure' : 'Overdue payment settlement exception',
      lastAttemptAt: r.lastAttemptAt,
    }));
  }

  async getSuspiciousAccounts(): Promise<SuspiciousAccountItem[]> {
    const rows = await this.db.query<any>(
      `SELECT u.id AS userId, u.full_name AS userName, u.email AS userEmail, u.status,
              u.failed_attempts AS failedAttempts, u.locked_until AS lockedUntil, u.last_login_at AS lastLoginAt,
              (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1) AS role
       FROM users u
       WHERE u.failed_attempts >= 3 OR u.locked_until > NOW() OR u.status IN ('SUSPENDED', 'DISABLED')
       ORDER BY u.failed_attempts DESC, u.created_at DESC
       LIMIT 25`,
    );

    return rows.map((r) => ({
      userId: r.userId,
      userName: r.userName,
      userEmail: this.maskEmail(r.userEmail),
      role: r.role || 'USER',
      status: r.status,
      failedAttempts: Number(r.failedAttempts || 0),
      isLocked: Boolean(r.lockedUntil && new Date(r.lockedUntil) > new Date()),
      lockedUntil: r.lockedUntil ? new Date(r.lockedUntil).toISOString() : null,
      riskReason: r.failedAttempts >= 5 ? 'High failed login frequency (brute force attempt)' : 'Account status lock / suspension',
      lastLoginAt: r.lastLoginAt ? new Date(r.lastLoginAt).toISOString() : null,
    }));
  }

  async getSuspiciousListings(): Promise<SuspiciousListingItem[]> {
    const rows = await this.db.query<any>(
      `SELECT p.id AS propertyId, p.property_code AS propertyCode, p.title, p.city, p.locality,
              p.monthly_rent AS monthlyRent, p.status, p.created_at AS createdAt,
              u.id AS ownerId, u.full_name AS ownerName
       FROM properties p
       JOIN users u ON u.id = p.owner_id
       WHERE p.status IN ('SUSPENDED', 'REJECTED')
          OR p.id IN (SELECT DISTINCT source_entity_id FROM risk_signals WHERE source_domain = 'MARKETPLACE')
       ORDER BY p.created_at DESC
       LIMIT 25`,
    );

    return rows.map((r) => ({
      propertyId: r.propertyId,
      propertyCode: r.propertyCode || `PROP-${r.propertyId}`,
      title: r.title,
      city: r.city,
      locality: r.locality || 'Unknown',
      ownerId: r.ownerId,
      ownerName: r.ownerName,
      monthlyRent: Number(r.monthlyRent || 0),
      riskReason: r.status === 'SUSPENDED' ? 'Property suspended by moderation' : 'Duplicate listing similarity detected',
      createdAt: r.createdAt,
    }));
  }

  // ------------------------------------------------------------------ FORMATTERS & PRIVACY HELPERS
  private formatSecurityEvent(row: any): SecurityEventRecord {
    return {
      id: row.id,
      public_id: row.public_id,
      event_type: row.event_type,
      severity: row.severity,
      actor_id: row.actor_id,
      actor_role: row.actor_role,
      actor_ip: row.actor_ip,
      user_agent: row.user_agent,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      summary: row.summary,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      created_at: row.created_at,
      actor_name: row.actor_name,
      actor_email: row.actor_email ? this.maskEmail(row.actor_email) : undefined,
    };
  }

  private formatRiskSignal(row: any): RiskSignalRecord {
    return {
      id: row.id,
      public_id: row.public_id,
      signal_type: row.signal_type,
      severity: row.severity,
      source_domain: row.source_domain,
      source_entity_type: row.source_entity_type,
      source_entity_id: row.source_entity_id,
      subject_user_id: row.subject_user_id,
      detected_value: row.detected_value,
      threshold_value: row.threshold_value,
      explanation: row.explanation,
      status: row.status,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      created_at: row.created_at,
      updated_at: row.updated_at,
      subject_name: row.subject_name,
      subject_email: row.subject_email ? this.maskEmail(row.subject_email) : undefined,
    };
  }

  private formatRiskCase(row: any): RiskCaseRecord {
    return {
      id: row.id,
      public_id: row.public_id,
      case_number: row.case_number,
      case_type: row.case_type,
      subject_user_id: row.subject_user_id,
      subject_property_id: row.subject_property_id,
      subject_payment_id: row.subject_payment_id,
      risk_level: row.risk_level,
      status: row.status,
      assigned_to: row.assigned_to,
      summary: row.summary,
      evidence: typeof row.evidence === 'string' ? JSON.parse(row.evidence) : row.evidence,
      resolution_notes: row.resolution_notes,
      resolved_by: row.resolved_by,
      resolved_at: row.resolved_at,
      idempotency_key: row.idempotency_key,
      created_at: row.created_at,
      updated_at: row.updated_at,
      subject_name: row.subject_name,
      subject_email: row.subject_email ? this.maskEmail(row.subject_email) : undefined,
      assigned_name: row.assigned_name,
      resolved_by_name: row.resolved_by_name,
      property_title: row.property_title,
      property_code: row.property_code,
      payment_reference: row.payment_reference,
      payment_amount: row.payment_amount ? Number(row.payment_amount) : undefined,
    };
  }

  private formatRiskCaseEvent(row: any): RiskCaseEventRecord {
    return {
      id: row.id,
      case_id: row.case_id,
      actor_id: row.actor_id,
      event_type: row.event_type,
      previous_state: typeof row.previous_state === 'string' ? JSON.parse(row.previous_state) : row.previous_state,
      new_state: typeof row.new_state === 'string' ? JSON.parse(row.new_state) : row.new_state,
      notes: row.notes,
      created_at: row.created_at,
      actor_name: row.actor_name,
      actor_role: row.actor_role,
    };
  }

  private maskEmail(email: string): string {
    if (!email || !email.includes('@')) return email;
    const [user, domain] = email.split('@');
    if (user.length <= 2) return `${user[0]}*@${domain}`;
    return `${user.slice(0, 2)}${'*'.repeat(Math.min(user.length - 2, 6))}@${domain}`;
  }
}
