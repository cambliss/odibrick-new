import { ConflictException, Injectable } from '@nestjs/common';
import { PoolConnection } from 'mysql2/promise';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { AuthUser } from '../../common/auth/auth.types';
import {
  DecisionSource,
  KycStatus,
  TransitionActor,
  isTransitionAllowed,
  normaliseStatus,
} from './kyc-state';

export interface KycRecordRef {
  id: number;
  user_id: number;
  status: string;
  decision_version: number;
}

/** Columns a transition may set alongside the status. Anything else is refused (no dynamic SQL from callers). */
const PATCHABLE = new Set([
  'legal_name',
  'id_type',
  'id_last4',
  'subject_type',
  'submitted_at',
  'reviewer_id',
  'reviewed_at',
  'rejection_reason',
  'expires_at',
  'internal_notes',
  'current_attempt_id',
  'mandatory_document_id',
  'provider',
]);

const SETS_DECISION_SOURCE: readonly KycStatus[] = ['VERIFIED', 'REJECTED', 'DOCUMENTS_PENDING', 'SUSPENDED', 'EXPIRED'];
const CLEARS_DECISION_SOURCE: readonly KycStatus[] = ['SUBMITTED', 'PROCESSING', 'UNDER_REVIEW'];

const SOURCE_BY_ACTOR: Record<TransitionActor, DecisionSource | null> = {
  USER: null,
  SYSTEM: 'AUTOMATED',
  REVIEWER: 'MANUAL',
  OVERRIDE: 'OVERRIDE',
};

export interface TransitionParams {
  record: KycRecordRef;
  to: KycStatus;
  actor: TransitionActor;
  by?: AuthUser | null;
  reason?: string | null;
  patch?: Record<string, unknown>;
  req?: Request;
  conn?: PoolConnection;
  /** Set false when the caller writes a richer audit record itself (e.g. after commit). */
  audit?: boolean;
  auditAction?: string;
  auditMetadata?: Record<string, unknown>;
}

/**
 * The single place where kyc_records.status changes. Every change is
 * (a) checked against the state machine for the acting party, and
 * (b) applied with optimistic locking (status AND decision_version must still
 *     match), so duplicate calls, late provider responses and racing reviewers
 *     cannot silently overwrite a decision that was made in the meantime.
 */
@Injectable()
export class KycTransitionService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async transition(p: TransitionParams): Promise<{ from: KycStatus; to: KycStatus; version: number }> {
    const from = normaliseStatus(p.record.status);
    if (!isTransitionAllowed(from, p.to, p.actor)) {
      throw new ConflictException({
        code: 'KYC_TRANSITION_NOT_ALLOWED',
        message: `This KYC record is ${from} and cannot move to ${p.to}.`,
      });
    }

    const assignments: string[] = ['status = ?', 'decision_version = decision_version + 1'];
    const values: unknown[] = [p.to];

    if (SETS_DECISION_SOURCE.includes(p.to) && p.actor !== 'USER') {
      assignments.push('decision_source = ?');
      values.push(SOURCE_BY_ACTOR[p.actor]);
    } else if (CLEARS_DECISION_SOURCE.includes(p.to)) {
      assignments.push('decision_source = ?');
      values.push(null);
    }

    for (const [column, value] of Object.entries(p.patch ?? {})) {
      if (value === undefined) continue;
      if (!PATCHABLE.has(column)) throw new Error(`Column ${column} cannot be patched through a KYC transition.`);
      assignments.push(`${column} = ?`);
      values.push(value);
    }

    // The raw status is matched, so a legacy IN_REVIEW row only moves from IN_REVIEW.
    values.push(p.record.id, p.record.status, p.record.decision_version);
    const sql = `UPDATE kyc_records SET ${assignments.join(', ')} WHERE id = ? AND status = ? AND decision_version = ?`;
    const result = p.conn ? (await p.conn.execute(sql, values as any[]))[0] : await this.db.execute(sql, values);
    if ((result as { affectedRows?: number }).affectedRows !== 1) {
      throw new ConflictException({
        code: 'KYC_STATE_CONFLICT',
        message: 'This KYC record was changed by someone else. Reload it and try again.',
      });
    }

    const version = p.record.decision_version + 1;
    if (p.audit !== false) {
      await this.audit.record({
        actor: p.by ?? null,
        action: p.auditAction ?? 'kyc.status_changed',
        objectType: 'kyc',
        objectId: p.record.id,
        metadata: {
          from,
          to: p.to,
          actorKind: p.actor,
          decisionSource: SOURCE_BY_ACTOR[p.actor],
          version,
          ...(p.reason ? { reason: p.reason.slice(0, 500) } : {}),
          ...(p.auditMetadata ?? {}),
        },
        req: p.req,
      });
    }
    return { from, to: p.to, version };
  }

  /**
   * Document status handling is always scoped to the identity rows of THIS
   * record that are not superseded: earlier (rejected/archived/replaced)
   * documents can never be marked VERIFIED by a later approval.
   */
  async verifyCurrentDocuments(
    recordId: number,
    reviewerId: number,
    options: { includeOptionalDocumentIds?: number[]; conn?: PoolConnection } = {},
  ): Promise<void> {
    const optional = options.includeOptionalDocumentIds ?? [];
    const optionalClause = optional.length ? `OR i.document_id IN (${optional.map(() => '?').join(',')})` : '';
    const params: unknown[] = [recordId, ...optional];
    const idocSql = `UPDATE kyc_identity_documents i SET i.status = 'VERIFIED'
        WHERE i.kyc_record_id = ? AND i.status <> 'SUPERSEDED' AND (i.is_mandatory = 1 ${optionalClause})`;
    const docSql = `UPDATE documents d JOIN kyc_identity_documents i ON i.document_id = d.id
          SET d.verification_status = 'VERIFIED', d.verified_by = ?, d.verified_at = NOW(), d.rejection_reason = NULL
        WHERE i.kyc_record_id = ? AND i.status = 'VERIFIED' AND d.is_active = 1
          AND d.verification_status = 'UNDER_REVIEW'`;
    await this.run(idocSql, params, options.conn);
    await this.run(docSql, [reviewerId, recordId], options.conn);
  }

  async rejectCurrentDocuments(recordId: number, reason: string, conn?: PoolConnection): Promise<void> {
    await this.run(
      `UPDATE kyc_identity_documents SET status = 'REJECTED' WHERE kyc_record_id = ? AND status <> 'SUPERSEDED'`,
      [recordId],
      conn,
    );
    await this.run(
      `UPDATE documents d JOIN kyc_identity_documents i ON i.document_id = d.id
          SET d.verification_status = 'REJECTED', d.rejection_reason = ?
        WHERE i.kyc_record_id = ? AND i.status = 'REJECTED' AND d.verification_status IN ('UPLOADED','UNDER_REVIEW')`,
      [reason.slice(0, 500), recordId],
      conn,
    );
  }

  private async run(sql: string, params: unknown[], conn?: PoolConnection): Promise<void> {
    if (conn) await conn.execute(sql, params as any[]);
    else await this.db.execute(sql, params);
  }
}
