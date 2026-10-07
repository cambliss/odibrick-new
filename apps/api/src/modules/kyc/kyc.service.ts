import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { encryptField } from '../../common/util/crypto';
import { pageParams, paginate } from '../../common/util/pagination';
import {
  AssignKycVerifierDto,
  KycDecisionDto,
  RejectKycDto,
  ReopenKycDto,
  RequestAdditionalDocsDto,
  SubmitKycDto,
  SuspendKycDto,
  VerifyKycDto,
} from './kyc.dto';

@Injectable()
export class KycService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  isStaff(user: AuthUser): boolean {
    if (!user) return false;
    return (
      user.roles?.some((r) =>
        ['SUPER_ADMIN', 'ADMIN', 'KYC_TEAM', 'LEGAL_TEAM', 'PROPERTY_MANAGER'].includes(r),
      ) ||
      user.permissions?.some((p) =>
        ['kyc.review', 'kyc.verify', 'kyc.manage', 'compliance.manage'].includes(p),
      )
    );
  }

  async status(user: AuthUser) {
    const record = await this.db.one<any>(
      `SELECT k.id, k.user_id, k.subject_type, k.legal_name, k.id_type, k.id_last4, k.status,
              k.rejection_reason, ${this.isStaff(user) ? 'k.internal_notes,' : ''}
              k.submitted_at, k.reviewed_at, k.expires_at, k.created_at, k.updated_at,
              r.full_name AS reviewer_name, v.full_name AS assigned_verifier_name
         FROM kyc_records k
         LEFT JOIN users r ON r.id = k.reviewer_id
         LEFT JOIN users v ON v.id = k.assigned_verifier_id
        WHERE k.user_id = ? ORDER BY k.id DESC LIMIT 1`,
      [user.id],
    );

    const documents = record
      ? await this.db.query(
          `SELECT d.id, d.public_id, d.title, d.category, d.document_type, d.verification_status,
                  d.version, d.expiry_date, d.created_at
             FROM documents d
            WHERE (d.entity_type = 'kyc' AND d.entity_id = ?)
               OR (d.context_type = 'KYC' AND d.context_id = ?)
               OR (d.owner_user_id = ? AND d.category = 'KYC')
            ORDER BY d.created_at DESC`,
          [record.id, record.id, user.id],
        )
      : await this.db.query(
          `SELECT d.id, d.public_id, d.title, d.category, d.document_type, d.verification_status,
                  d.version, d.expiry_date, d.created_at
             FROM documents d
            WHERE d.owner_user_id = ? AND d.category = 'KYC'
            ORDER BY d.created_at DESC`,
          [user.id],
        );

    return {
      status: record?.status || 'NOT_STARTED',
      record: record || null,
      documents,
      provider: this.config.get('providers.kyc') || 'manual',
    };
  }

  async getUserKyc(actor: AuthUser, userId: number) {
    if (actor.id !== userId && !actor.permissions.includes('kyc.read') && !this.isStaff(actor)) {
      throw new ForbiddenException('You are not authorized to view this KYC profile.');
    }

    const record = await this.db.one<any>(
      `SELECT k.id, k.user_id, k.subject_type, k.legal_name, k.id_type, k.id_last4, k.status,
              k.rejection_reason, ${this.isStaff(actor) ? 'k.internal_notes,' : ''}
              k.submitted_at, k.reviewed_at, k.expires_at, k.created_at, k.updated_at,
              u.full_name AS user_name, u.email AS user_email,
              r.full_name AS reviewer_name, v.full_name AS assigned_verifier_name
         FROM kyc_records k
         JOIN users u ON u.id = k.user_id
         LEFT JOIN users r ON r.id = k.reviewer_id
         LEFT JOIN users v ON v.id = k.assigned_verifier_id
        WHERE k.user_id = ? ORDER BY k.id DESC LIMIT 1`,
      [userId],
    );

    const documents = await this.db.query(
      `SELECT d.id, d.public_id, d.title, d.category, d.document_type, d.verification_status,
              d.version, d.expiry_date, d.created_at
         FROM documents d
        WHERE d.owner_user_id = ? AND (d.category = 'KYC' OR d.context_type = 'KYC' OR d.entity_type = 'kyc')
        ORDER BY d.created_at DESC`,
      [userId],
    );

    return {
      status: record?.status || 'NOT_STARTED',
      record: record || null,
      documents,
    };
  }

  async submit(user: AuthUser, dto: SubmitKycDto, req?: Request) {
    const existing = await this.db.one<any>(
      'SELECT id, status FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [user.id],
    );

    if (existing && ['UNDER_REVIEW', 'SUBMITTED', 'IN_REVIEW', 'VERIFIED'].includes(existing.status)) {
      throw new BadRequestException(
        existing.status === 'VERIFIED'
          ? 'Your identity is already verified.'
          : 'Your documents are already under review by our compliance team.',
      );
    }

    const key = this.config.get<string>('auth.fieldKey');
    const encrypted = key && dto.idNumber ? encryptField(dto.idNumber, key) : null;

    const payload = {
      user_id: user.id,
      subject_type: dto.subjectType ?? 'INDIVIDUAL',
      legal_name: dto.legalName,
      id_type: dto.idType,
      id_last4: dto.idNumber ? dto.idNumber.slice(-4) : null,
      id_reference: encrypted,
      provider: this.config.get('providers.kyc') || 'manual',
      status: 'UNDER_REVIEW',
      submitted_at: new Date(),
      rejection_reason: null,
    };

    const id = existing
      ? (await this.db.update('kyc_records', existing.id, payload), existing.id)
      : await this.db.insert('kyc_records', payload);

    if (dto.documentIds?.length) {
      await this.db.execute(
        `UPDATE documents SET entity_type = 'kyc', entity_id = ?, context_type = 'KYC', context_id = ?, category = 'KYC',
                verification_status = 'UNDER_REVIEW'
          WHERE owner_user_id = ? AND id IN (${dto.documentIds.map(() => '?').join(',')})`,
        [id, id, user.id, ...dto.documentIds],
      );
    }

    await this.notify.send(user.id, 'KYC_SUBMITTED', {
      title: 'KYC documents submitted',
      body: 'Our verification team is reviewing your documents. Most checks finish within 24 hours.',
      severity: 'INFO',
      actionUrl: '/dashboard/documents',
    });

    await this.audit.record({
      actor: user,
      action: 'kyc.submitted',
      objectType: 'kyc',
      objectId: id,
      metadata: { idType: dto.idType, subjectType: dto.subjectType },
      req,
    });

    return { id, status: 'UNDER_REVIEW' };
  }

  async queue(
    status = 'UNDER_REVIEW',
    filters?: { search?: string; verifierId?: number; role?: string },
    page?: number,
    perPage?: number,
  ) {
    const { page: p, perPage: pp, offset } = pageParams(page, perPage);
    const where: string[] = [];
    const params: unknown[] = [];

    if (status === 'ALL') {
      where.push('1=1');
    } else if (status === 'UNDER_REVIEW' || status === 'SUBMITTED') {
      where.push("k.status IN ('UNDER_REVIEW', 'SUBMITTED', 'IN_REVIEW')");
    } else {
      where.push('k.status = ?');
      params.push(status);
    }

    if (filters?.verifierId) {
      where.push('k.assigned_verifier_id = ?');
      params.push(filters.verifierId);
    }

    if (filters?.search) {
      where.push('(k.legal_name LIKE ? OR u.email LIKE ? OR u.full_name LIKE ?)');
      params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
    }

    const totalRow = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total
         FROM kyc_records k
         JOIN users u ON u.id = k.user_id
        WHERE ${where.join(' AND ')}`,
      params,
    );

    const rows = await this.db.query(
      `SELECT k.id, k.legal_name, k.subject_type, k.id_type, k.id_last4, k.status, k.submitted_at,
              k.reviewed_at, k.expires_at, k.rejection_reason, k.internal_notes,
              u.id AS user_id, u.public_id, u.email, u.full_name,
              r.full_name AS reviewer_name, v.full_name AS assigned_verifier_name,
              (SELECT GROUP_CONCAT(rol.code) FROM user_roles ur JOIN roles rol ON rol.id = ur.role_id
                WHERE ur.user_id = u.id) AS roles,
              (SELECT COUNT(*) FROM documents d WHERE (d.entity_type = 'kyc' AND d.entity_id = k.id) OR (d.owner_user_id = u.id AND d.category = 'KYC')) AS document_count
         FROM kyc_records k
         JOIN users u ON u.id = k.user_id
         LEFT JOIN users r ON r.id = k.reviewer_id
         LEFT JOIN users v ON v.id = k.assigned_verifier_id
        WHERE ${where.join(' AND ')}
        ORDER BY k.submitted_at DESC, k.id DESC LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );

    return paginate(rows, totalRow?.total ?? 0, p, pp);
  }

  async verify(reviewer: AuthUser, id: number, dto: VerifyKycDto, req?: Request) {
    const record = await this.db.one<any>('SELECT * FROM kyc_records WHERE id = ?', [id]);
    if (!record) throw new NotFoundException('KYC record not found.');

    await this.db.update('kyc_records', id, {
      status: 'VERIFIED',
      reviewer_id: reviewer.id,
      reviewed_at: new Date(),
      rejection_reason: null,
      internal_notes: dto.internalNotes ?? record.internal_notes,
      expires_at: dto.expiresAt ?? null,
    });

    // Also mark linked KYC documents as VERIFIED
    await this.db.execute(
      `UPDATE documents SET verification_status = 'VERIFIED', verified_by = ?, verified_at = NOW()
        WHERE (entity_type = 'kyc' AND entity_id = ?) OR (owner_user_id = ? AND category = 'KYC' AND verification_status = 'UNDER_REVIEW')`,
      [reviewer.id, id, record.user_id],
    );

    await this.notify.send(record.user_id, 'KYC_APPROVED', {
      title: 'Identity verified successfully',
      body: 'Your identity verification is approved. You have full access to transactions, listings, and applications.',
      severity: 'INFO',
      actionUrl: '/dashboard/documents',
    });

    await this.audit.record({
      actor: reviewer,
      action: 'kyc.verified',
      objectType: 'kyc',
      objectId: id,
      metadata: { expiresAt: dto.expiresAt },
      req,
    });

    return { id, status: 'VERIFIED' };
  }

  async reject(reviewer: AuthUser, id: number, dto: RejectKycDto, req?: Request) {
    const record = await this.db.one<any>('SELECT * FROM kyc_records WHERE id = ?', [id]);
    if (!record) throw new NotFoundException('KYC record not found.');
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('A reason for rejection is mandatory.');
    }

    await this.db.update('kyc_records', id, {
      status: 'REJECTED',
      reviewer_id: reviewer.id,
      reviewed_at: new Date(),
      rejection_reason: dto.reason.trim(),
      internal_notes: dto.internalNotes ?? record.internal_notes,
    });

    await this.notify.send(record.user_id, 'KYC_REJECTED', {
      title: 'Identity verification needs correction',
      body: `We could not verify your KYC: ${dto.reason.trim()}. Please review and re-submit.`,
      severity: 'ACTION',
      actionUrl: '/dashboard/documents',
    });

    await this.audit.record({
      actor: reviewer,
      action: 'kyc.rejected',
      objectType: 'kyc',
      objectId: id,
      metadata: { reason: dto.reason.trim() },
      req,
    });

    return { id, status: 'REJECTED', rejectionReason: dto.reason.trim() };
  }

  async requestAdditionalDocuments(
    reviewer: AuthUser,
    id: number,
    dto: RequestAdditionalDocsDto,
    req?: Request,
  ) {
    const record = await this.db.one<any>('SELECT * FROM kyc_records WHERE id = ?', [id]);
    if (!record) throw new NotFoundException('KYC record not found.');
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('Reason for requesting additional documents is mandatory.');
    }

    await this.db.update('kyc_records', id, {
      status: 'DOCUMENTS_PENDING',
      reviewer_id: reviewer.id,
      reviewed_at: new Date(),
      rejection_reason: dto.reason.trim(),
      internal_notes: dto.internalNotes ?? record.internal_notes,
    });

    await this.notify.send(record.user_id, 'KYC_ADDITIONAL_DOCS_REQUESTED', {
      title: 'Additional documents required for verification',
      body: `Compliance team requested additional documentation: ${dto.reason.trim()}`,
      severity: 'ACTION',
      actionUrl: '/dashboard/documents',
    });

    await this.audit.record({
      actor: reviewer,
      action: 'kyc.additional_documents_requested',
      objectType: 'kyc',
      objectId: id,
      metadata: { reason: dto.reason.trim() },
      req,
    });

    return { id, status: 'DOCUMENTS_PENDING', rejectionReason: dto.reason.trim() };
  }

  async suspend(reviewer: AuthUser, id: number, dto: SuspendKycDto, req?: Request) {
    const record = await this.db.one<any>('SELECT * FROM kyc_records WHERE id = ?', [id]);
    if (!record) throw new NotFoundException('KYC record not found.');
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw new BadRequestException('Reason for KYC suspension is mandatory.');
    }

    await this.db.update('kyc_records', id, {
      status: 'SUSPENDED',
      reviewer_id: reviewer.id,
      reviewed_at: new Date(),
      rejection_reason: dto.reason.trim(),
      internal_notes: dto.internalNotes ?? record.internal_notes,
    });

    await this.notify.send(record.user_id, 'KYC_SUSPENDED', {
      title: 'KYC status suspended',
      body: `Your verification status has been suspended: ${dto.reason.trim()}. Please contact support.`,
      severity: 'CRITICAL',
      actionUrl: '/dashboard/documents',
    });

    await this.audit.record({
      actor: reviewer,
      action: 'kyc.suspended',
      objectType: 'kyc',
      objectId: id,
      metadata: { reason: dto.reason.trim() },
      req,
    });

    return { id, status: 'SUSPENDED', rejectionReason: dto.reason.trim() };
  }

  async reopen(reviewer: AuthUser, id: number, dto: ReopenKycDto, req?: Request) {
    const record = await this.db.one<any>('SELECT * FROM kyc_records WHERE id = ?', [id]);
    if (!record) throw new NotFoundException('KYC record not found.');

    await this.db.update('kyc_records', id, {
      status: 'UNDER_REVIEW',
      rejection_reason: null,
      internal_notes: dto.internalNotes ?? record.internal_notes,
    });

    await this.audit.record({
      actor: reviewer,
      action: 'kyc.reopened',
      objectType: 'kyc',
      objectId: id,
      req,
    });

    return { id, status: 'UNDER_REVIEW' };
  }

  async assignVerifier(reviewer: AuthUser, id: number, dto: AssignKycVerifierDto, req?: Request) {
    const record = await this.db.one<any>('SELECT * FROM kyc_records WHERE id = ?', [id]);
    if (!record) throw new NotFoundException('KYC record not found.');

    await this.db.update('kyc_records', id, {
      assigned_verifier_id: dto.verifierId,
    });

    await this.audit.record({
      actor: reviewer,
      action: 'kyc.assigned',
      objectType: 'kyc',
      objectId: id,
      metadata: { assignedVerifierId: dto.verifierId },
      req,
    });

    return { id, assignedVerifierId: dto.verifierId };
  }

  async decide(reviewer: AuthUser, id: number, dto: KycDecisionDto, req?: Request) {
    if (dto.decision === 'APPROVE') {
      return this.verify(reviewer, id, { expiresAt: dto.expiresAt, internalNotes: dto.internalNotes }, req);
    }
    if (dto.decision === 'REJECT') {
      return this.reject(reviewer, id, { reason: dto.reason ?? 'Documents did not meet criteria.', internalNotes: dto.internalNotes }, req);
    }
    if (dto.decision === 'REQUEST_DOCUMENTS') {
      return this.requestAdditionalDocuments(reviewer, id, { reason: dto.reason ?? 'Additional documentation required.', internalNotes: dto.internalNotes }, req);
    }
    if (dto.decision === 'SUSPEND') {
      return this.suspend(reviewer, id, { reason: dto.reason ?? 'Suspended due to compliance policy.', internalNotes: dto.internalNotes }, req);
    }
    if (dto.decision === 'REOPEN') {
      return this.reopen(reviewer, id, { internalNotes: dto.internalNotes }, req);
    }
    throw new BadRequestException('Unsupported KYC decision.');
  }
}
