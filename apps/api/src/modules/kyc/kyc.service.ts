import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { encryptField } from '../../common/util/crypto';
import { pageParams, paginate } from '../../common/util/pagination';
import { KycDecisionDto, SubmitKycDto } from './kyc.dto';

/**
 * KYC is deliberately provider-agnostic. With provider "manual" a human
 * reviewer decides; a licensed verification API can be added behind the same
 * submit/decide contract without touching callers.
 */
@Injectable()
export class KycService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  async status(user: AuthUser) {
    const record = await this.db.one<any>(
      `SELECT id, subject_type, legal_name, id_type, id_last4, status, rejection_reason,
              submitted_at, reviewed_at, expires_at
         FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1`,
      [user.id],
    );
    const documents = record
      ? await this.db.query(
          "SELECT id, title, category, created_at FROM documents WHERE entity_type = 'kyc' AND entity_id = ?",
          [record.id],
        )
      : [];
    return { record, documents, provider: this.config.get('providers.kyc') };
  }

  async submit(user: AuthUser, dto: SubmitKycDto, req?: Request) {
    const existing = await this.db.one<any>(
      'SELECT id, status FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1', [user.id],
    );
    if (existing && ['SUBMITTED', 'IN_REVIEW', 'VERIFIED'].includes(existing.status)) {
      throw new BadRequestException(
        existing.status === 'VERIFIED' ? 'Your identity is already verified.' : 'Your documents are already with our team.',
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
      provider: this.config.get('providers.kyc'),
      status: 'SUBMITTED',
      submitted_at: new Date(),
      rejection_reason: null,
    };

    const id = existing
      ? (await this.db.update('kyc_records', existing.id, payload), existing.id)
      : await this.db.insert('kyc_records', payload);

    if (dto.documentIds?.length) {
      await this.db.execute(
        `UPDATE documents SET entity_type = 'kyc', entity_id = ?, category = 'KYC'
          WHERE owner_user_id = ? AND id IN (${dto.documentIds.map(() => '?').join(',')})`,
        [id, user.id, ...dto.documentIds],
      );
    }

    await this.notify.send(user.id, 'KYC_SUBMITTED', {
      title: 'Documents received',
      body: 'Our verification team is reviewing your documents. Most checks finish within 24 hours.',
    });
    await this.audit.record({ actor: user, action: 'kyc.submitted', objectType: 'kyc', objectId: id, req });
    return { id, status: 'SUBMITTED' };
  }

  async queue(status = 'SUBMITTED', page?: number, perPage?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, perPage);
    const rows = await this.db.query(
      `SELECT k.id, k.legal_name, k.subject_type, k.id_type, k.id_last4, k.status, k.submitted_at,
              u.id AS user_id, u.public_id, u.email, u.full_name,
              (SELECT GROUP_CONCAT(r.code) FROM user_roles ur JOIN roles r ON r.id = ur.role_id
                WHERE ur.user_id = u.id) AS roles,
              (SELECT COUNT(*) FROM documents d WHERE d.entity_type = 'kyc' AND d.entity_id = k.id) AS document_count
         FROM kyc_records k JOIN users u ON u.id = k.user_id
        WHERE k.status = ? ORDER BY k.submitted_at ASC LIMIT ? OFFSET ?`,
      [status, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      'SELECT COUNT(*) AS total FROM kyc_records WHERE status = ?', [status],
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  async decide(reviewer: AuthUser, id: number, dto: KycDecisionDto, req?: Request) {
    const record = await this.db.one<any>('SELECT * FROM kyc_records WHERE id = ?', [id]);
    if (!record) throw new NotFoundException('KYC record not found.');
    if (dto.decision === 'REJECT' && !dto.reason) {
      throw new BadRequestException('Tell the applicant what to correct.');
    }

    const status = dto.decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    await this.db.update('kyc_records', id, {
      status,
      reviewer_id: reviewer.id,
      reviewed_at: new Date(),
      rejection_reason: dto.reason ?? null,
      expires_at: dto.decision === 'APPROVE' ? dto.expiresAt ?? null : null,
    });

    await this.notify.send(record.user_id, status === 'VERIFIED' ? 'KYC_APPROVED' : 'KYC_SUBMITTED', {
      title: status === 'VERIFIED' ? 'Identity verified' : 'Verification needs attention',
      body:
        status === 'VERIFIED'
          ? 'You can now list a property or apply for one.'
          : `We could not verify your documents. ${dto.reason}`,
      severity: 'ACTION',
      actionUrl: '/dashboard/kyc',
    });
    await this.audit.record({
      actor: reviewer, action: `kyc.${status.toLowerCase()}`, objectType: 'kyc', objectId: id,
      metadata: { reason: dto.reason }, req,
    });
    return { id, status };
  }
}
