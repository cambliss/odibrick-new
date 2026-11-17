import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { Request } from 'express';
import { PoolConnection } from 'mysql2/promise';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { pageParams, paginate } from '../../common/util/pagination';
import { KycCryptoService } from './kyc-crypto.service';
import { KycTransitionService } from './kyc-transition.service';
import { consentTextHash, isCurrentConsentVersion } from './kyc-consent';
import { canResubmit, IN_PROGRESS_STATUSES, normaliseStatus } from './kyc-state';
import { normalisePassportNumber, validatePassport } from './passport/passport.validator';
import { VerificationOrchestrator } from './verification/verification.orchestrator';
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
    private readonly kycCrypto: KycCryptoService,
    private readonly transitions: KycTransitionService,
    private readonly orchestrator: VerificationOrchestrator,
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

  isSubmissionEnabled(): boolean {
    return this.config.get<boolean>('kyc.submissionEnabled') === true;
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
      submissionEnabled: this.isSubmissionEnabled(),
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

  private assertContactVerifiedUser(user: AuthUser): void {
    if (user.emailVerified === false && user.phoneVerified === false) {
      throw new ForbiddenException(
        'Verify both your email address and mobile number via OTP before submitting KYC.',
      );
    }
    if (user.emailVerified === false) {
      throw new ForbiddenException('Verify your email address via OTP before submitting KYC.');
    }
    if (user.phoneVerified === false) {
      throw new ForbiddenException('Verify your mobile number via OTP before submitting KYC.');
    }
    if (user.contactVerified === false) {
      throw new ForbiddenException(
        'Verify both your email address and mobile number via OTP before submitting KYC.',
      );
    }
  }

  private validateSubmissionConsents(consents: SubmitKycDto['consents']) {
    if (!Array.isArray(consents) || !consents.length) {
      throw new BadRequestException('Accepted KYC processing consent is required.');
    }
    const seen = new Set<string>();
    const validated: Array<{ purpose: string; version: string; textSha256: string }> = [];

    for (const c of consents) {
      if (seen.has(c.purpose)) {
        throw new BadRequestException(`Duplicate consent entry for ${c.purpose}.`);
      }
      seen.add(c.purpose);

      if (!c.accepted) {
        if (c.purpose === 'KYC_PROCESSING') {
          throw new BadRequestException('You must accept KYC processing consent to submit verification.');
        }
        continue;
      }

      const hash = isCurrentConsentVersion(c.version) ? consentTextHash(c.purpose, c.version) : null;
      if (!hash) {
        throw new BadRequestException(`Unsupported or outdated consent wording version for ${c.purpose}.`);
      }
      validated.push({ purpose: c.purpose, version: c.version, textSha256: hash });
    }

    if (!validated.some((c) => c.purpose === 'KYC_PROCESSING')) {
      throw new BadRequestException('You must accept KYC processing consent to submit verification.');
    }

    return validated;
  }

  private async assertOwnedActiveDocuments(userId: number, documentIds: number[]): Promise<void> {
    if (!documentIds.length) return;
    const unique = [...new Set(documentIds)];
    if (unique.length !== documentIds.length) {
      throw new BadRequestException('Each uploaded document may only be referenced once per submission.');
    }

    const placeholders = unique.map(() => '?').join(',');
    const docs = await this.db.query<{ id: number; owner_user_id: number; is_active?: number | boolean }>(
      `SELECT id, owner_user_id, is_active FROM documents WHERE id IN (${placeholders})`,
      unique,
    );

    if (docs.length !== unique.length) {
      throw new BadRequestException('One or more uploaded documents could not be found.');
    }
    for (const doc of docs) {
      if (doc.owner_user_id !== userId) {
        throw new ForbiddenException('You can only submit KYC documents that you own.');
      }
      if (doc.is_active === 0 || doc.is_active === false) {
        throw new BadRequestException('One or more uploaded documents are inactive.');
      }
    }
  }

  private async execTx(conn: PoolConnection, sql: string, params: unknown[]): Promise<any> {
    const [result] = await conn.execute(sql, params as any[]);
    return result;
  }

  async submit(user: AuthUser, dto: SubmitKycDto, req?: Request) {
    if (!this.isSubmissionEnabled()) {
      throw new ServiceUnavailableException({
        code: 'KYC_SUBMISSION_DISABLED',
        message: 'Identity verification submissions are temporarily unavailable. Please check back soon.',
      });
    }
    this.assertContactVerifiedUser(user);
    this.kycCrypto.assertConfigured();
    const consents = this.validateSubmissionConsents(dto.consents);

    const existing = await this.db.one<any>(
      'SELECT id, user_id, status, decision_version FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1',
      [user.id],
    );

    if (existing) {
      const currentStatus = normaliseStatus(existing.status);
      if (existing.status === 'VERIFIED') {
        throw new BadRequestException('Your identity is already verified.');
      }
      if (IN_PROGRESS_STATUSES.includes(currentStatus)) {
        throw new BadRequestException('Your documents are already under review by our compliance team.');
      }
      if (!canResubmit(currentStatus)) {
        throw new ConflictException({
          code: 'KYC_TRANSITION_NOT_ALLOWED',
          message: `This KYC record is ${currentStatus} and cannot be resubmitted.`,
        });
      }
    }

    const supporting = dto.supportingDocuments ?? [];
    const allDocumentIds = [dto.passport.documentId, ...supporting.map((d) => d.documentId)];
    await this.assertOwnedActiveDocuments(user.id, allDocumentIds);

    const profile = await this.db.one<{ date_of_birth?: string | Date | null }>(
      'SELECT date_of_birth FROM user_profiles WHERE user_id = ? LIMIT 1',
      [user.id],
    );
    const profileDob =
      profile?.date_of_birth instanceof Date
        ? profile.date_of_birth.toISOString().slice(0, 10)
        : profile?.date_of_birth
          ? String(profile.date_of_birth).slice(0, 10)
          : null;

    const validation = validatePassport(
      {
        number: dto.passport.number,
        legalName: dto.legalName,
        issuingCountry: dto.passport.issuingCountry,
        nationality: dto.passport.nationality,
        dateOfBirth: dto.passport.dateOfBirth,
        issueDate: dto.passport.issueDate,
        expiryDate: dto.passport.expiryDate,
        mrzLines: dto.passport.mrzLines,
      },
      { accountName: user.fullName, profileDob },
    );

    if (!validation.ok) {
      throw new BadRequestException({
        code: 'PASSPORT_VALIDATION_FAILED',
        message: validation.errors[0]?.message ?? 'Passport details are invalid.',
        errors: validation.errors,
      });
    }

    const passport = validation.value;
    const passportHmac = this.kycCrypto.numberHmac('PASSPORT', passport.issuingCountry, passport.number);
    const hmacCandidates = this.kycCrypto.numberHmacCandidates('PASSPORT', passport.issuingCountry, passport.number);
    const dupRows = await this.db.query<{ id: number }>(
      `SELECT i.id
         FROM kyc_identity_documents i
         JOIN kyc_records k ON k.id = i.kyc_record_id
        WHERE i.doc_type = 'PASSPORT'
          AND i.status <> 'SUPERSEDED'
          AND k.user_id <> ?
          AND i.number_hmac IN (${hmacCandidates.map(() => '?').join(',')})
        LIMIT 1`,
      [user.id, ...hmacCandidates],
    );
    const flags = dupRows.length ? [...passport.flags, 'DUPLICATE_NUMBER'] : passport.flags;

    const supportingRows = supporting.map((doc) => {
      const normalised = doc.number ? normalisePassportNumber(doc.number) : '';
      const last4 = normalised ? this.kycCrypto.last4(normalised) : null;
      const hmac = normalised ? this.kycCrypto.numberHmac(doc.type, null, normalised) : null;
      return {
        documentId: doc.documentId,
        type: doc.type,
        last4,
        hmac: hmac?.value ?? null,
        hmacKeyVer: hmac?.keyVersion ?? null,
      };
    });

    const providerKey = this.orchestrator.providerKey;
    const captureMeta = this.config.get<boolean>('kyc.captureConsentMetadata') === true;
    const consentIp = captureMeta ? req?.ip ?? null : null;
    const consentUa = captureMeta ? req?.get('user-agent')?.slice(0, 255) ?? null : null;

    const { recordId, attemptId } = await this.db.transaction(async (conn) => {
      let id: number;
      if (existing) {
        await this.transitions.transition({
          record: existing,
          to: 'SUBMITTED',
          actor: 'USER',
          by: user,
          patch: {
            subject_type: 'INDIVIDUAL',
            legal_name: passport.holderName,
            id_type: 'PASSPORT',
            id_last4: passport.last4,
            provider: providerKey,
            submitted_at: new Date(),
            rejection_reason: null,
            mandatory_document_id: dto.passport.documentId,
          },
          conn,
          audit: false,
        });
        id = existing.id;
        await this.execTx(
          conn,
          `UPDATE kyc_identity_documents SET status = 'SUPERSEDED' WHERE kyc_record_id = ? AND status <> 'SUPERSEDED'`,
          [id],
        );
      } else {
        const ins = await this.execTx(
          conn,
          `INSERT INTO kyc_records
             (user_id, subject_type, legal_name, id_type, id_last4, id_reference, provider, status, submitted_at, mandatory_document_id)
           VALUES (?, 'INDIVIDUAL', ?, 'PASSPORT', ?, NULL, ?, 'SUBMITTED', NOW(), ?)`,
          [user.id, passport.holderName, passport.last4, providerKey, dto.passport.documentId],
        );
        id = Number(ins.insertId);
      }

      await this.execTx(
        conn,
        `INSERT INTO kyc_identity_documents
           (kyc_record_id, document_id, doc_type, is_mandatory, issuing_country, nationality, holder_name,
            date_of_birth, issue_date, expiry_date, number_last4, number_hmac, number_hmac_key_ver,
            mrz_present, mrz_format, mrz_checks, name_match, dob_match, validation_flags, extraction_source, status)
         VALUES (?, ?, 'PASSPORT', 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXTRACTED')`,
        [
          id,
          dto.passport.documentId,
          passport.issuingCountry,
          passport.nationality,
          passport.holderName,
          passport.dateOfBirth,
          passport.issueDate,
          passport.expiryDate,
          passport.last4,
          passportHmac.value,
          passportHmac.keyVersion,
          passport.mrz ? 1 : 0,
          passport.mrz?.format ?? null,
          passport.mrz ? JSON.stringify(passport.mrz.checks) : null,
          passport.nameMatch,
          passport.dobMatch,
          JSON.stringify(flags),
          passport.extractionSource,
        ],
      );

      for (const s of supportingRows) {
        await this.execTx(
          conn,
          `INSERT INTO kyc_identity_documents
             (kyc_record_id, document_id, doc_type, is_mandatory, number_last4, number_hmac, number_hmac_key_ver, status)
           VALUES (?, ?, ?, 0, ?, ?, ?, 'PENDING')`,
          [id, s.documentId, s.type, s.last4, s.hmac, s.hmacKeyVer],
        );
      }

      await this.execTx(
        conn,
        `UPDATE documents
            SET entity_type = 'kyc', entity_id = ?, context_type = 'KYC', context_id = ?, category = 'KYC',
                verification_status = 'UNDER_REVIEW'
          WHERE owner_user_id = ? AND id IN (${allDocumentIds.map(() => '?').join(',')})`,
        [id, id, user.id, ...allDocumentIds],
      );

      for (const c of consents) {
        await this.execTx(
          conn,
          `INSERT INTO kyc_consents
             (user_id, kyc_record_id, purpose, event_type, consent_version, text_sha256, ip, user_agent)
           VALUES (?, ?, ?, 'GRANT', ?, ?, ?, ?)`,
          [user.id, id, c.purpose, c.version, c.textSha256, consentIp, consentUa],
        );
      }

      const [maxRows] = await conn.query<any[]>(
        'SELECT COALESCE(MAX(attempt_no), 0) AS max_no FROM kyc_verification_attempts WHERE kyc_record_id = ?',
        [id],
      );
      const nextAttemptNo = Number(maxRows?.[0]?.max_no ?? 0) + 1;
      const attemptIns = await this.execTx(
        conn,
        `INSERT INTO kyc_verification_attempts
           (kyc_record_id, attempt_no, trigger_type, provider, idempotency_key, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'QUEUED', ?)`,
        [id, nextAttemptNo, existing ? 'RESUBMIT' : 'SUBMIT', providerKey, randomUUID(), user.id],
      );
      const createdAttemptId = Number(attemptIns.insertId);

      await this.execTx(conn, 'UPDATE kyc_records SET current_attempt_id = ? WHERE id = ?', [
        createdAttemptId,
        id,
      ]);

      return { recordId: id, attemptId: createdAttemptId };
    });

    const outcome = await this.orchestrator.run(recordId, attemptId);
    const finalStatus = outcome.applied ? outcome.status : 'SUBMITTED';

    if (finalStatus !== 'REJECTED') {
      await this.notify.send(user.id, 'KYC_SUBMITTED', {
        title: 'KYC documents submitted',
        body: 'Our verification team is reviewing your documents. Most checks finish within 24 hours.',
        severity: 'INFO',
        actionUrl: '/dashboard/documents',
      });
    }

    await this.audit.record({
      actor: user,
      action: 'kyc.submitted',
      objectType: 'kyc',
      objectId: recordId,
      metadata: {
        idType: 'PASSPORT',
        subjectType: 'INDIVIDUAL',
        attemptId,
        supportingCount: supportingRows.length,
        status: finalStatus,
      },
      req,
    });

    return { id: recordId, status: finalStatus, attemptId };
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
