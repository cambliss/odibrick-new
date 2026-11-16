import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { AuthUser } from '../../common/auth/auth.types';
import { formatReference, newPublicId } from '../../common/util/ids';
import { randomToken } from '../../common/util/crypto';
import { pageParams, paginate } from '../../common/util/pagination';
import {
  ApproveAgreementDto, AssignCaseDto, DraftAgreementDto, ScheduleMeetingDto, SignAgreementDto,
  SubmitStampingCertificateDto, VerifyStampingDto, RejectStampingDto, StampingNotApplicableDto,
} from './legal.dto';
import { StorageService } from '../storage/storage.service';

/**
 * The legal workspace.
 *
 * Two rules are enforced here rather than left to the UI:
 *  1. A draft can only be produced by a signed-in member of the legal team, and
 *     `drafted_with_ai` records when a generation aid was used. Nothing is
 *     auto-approved.
 *  2. An agreement cannot move to AWAITING_SIGNATURES until a user holding
 *     `agreement.approve` has explicitly approved that exact version.
 */
@Injectable()
export class LegalService {
  private readonly logger = new Logger(LegalService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly payments: PaymentsService,
    private readonly storage: StorageService,
  ) {}

  // ----------------------------------------------------------------- cases
  async caseQueue(user: AuthUser, status?: string, mineOnly = false, page?: number, perPage?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, perPage);
    const where: string[] = [];
    const params: unknown[] = [];
    if (status) {
      where.push('lc.status = ?');
      params.push(status);
    }
    if (mineOnly) {
      where.push('lc.assigned_to = ?');
      params.push(user.id);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.query(
      `SELECT lc.id, lc.case_number, lc.case_type, lc.status, lc.priority, lc.jurisdiction, lc.opened_at,
              lc.assigned_to, assignee.full_name AS assignee_name,
              t.id AS tenancy_id, t.stage AS tenancy_stage, t.rent_amount, t.deposit_amount, t.service_plan,
              p.title AS property_title, p.locality, p.city,
              own.full_name AS owner_name, ten.full_name AS tenant_name,
              (SELECT a.id FROM agreements a WHERE a.legal_case_id = lc.id ORDER BY a.id DESC LIMIT 1) AS agreement_id,
              (SELECT a.status FROM agreements a WHERE a.legal_case_id = lc.id ORDER BY a.id DESC LIMIT 1) AS agreement_status,
              (SELECT COUNT(*) FROM legal_meetings m WHERE m.legal_case_id = lc.id AND m.status = 'SCHEDULED') AS meetings_scheduled
         FROM legal_cases lc
         JOIN tenancies t ON t.id = lc.tenancy_id
         JOIN properties p ON p.id = t.property_id
         JOIN users own ON own.id = t.owner_user_id
         JOIN users ten ON ten.id = t.tenant_user_id
         LEFT JOIN users assignee ON assignee.id = lc.assigned_to
         ${clause}
        ORDER BY FIELD(lc.priority,'URGENT','HIGH','NORMAL','LOW'), lc.opened_at ASC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM legal_cases lc ${clause}`, params,
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  async caseDetail(user: AuthUser, id: number) {
    const legalCase = await this.db.one<any>(
      `SELECT lc.*, assignee.full_name AS assignee_name, assignee.email AS assignee_email,
              t.id AS tenancy_id, t.stage, t.rent_amount, t.deposit_amount, t.maintenance_amount,
              t.start_date, t.end_date, t.lock_in_months, t.notice_period_days, t.service_plan,
              t.owner_user_id, t.tenant_user_id,
              p.id AS property_id, p.title AS property_title, p.address_line1, p.locality, p.city,
              p.state, p.pincode, p.furnishing, p.bedrooms,
              own.full_name AS owner_name, own.email AS owner_email, own.phone AS owner_phone,
              ten.full_name AS tenant_name, ten.email AS tenant_email, ten.phone AS tenant_phone
         FROM legal_cases lc
         JOIN tenancies t ON t.id = lc.tenancy_id
         JOIN properties p ON p.id = t.property_id
         JOIN users own ON own.id = t.owner_user_id
         JOIN users ten ON ten.id = t.tenant_user_id
         LEFT JOIN users assignee ON assignee.id = lc.assigned_to
        WHERE lc.id = ?`,
      [id],
    );
    if (!legalCase) throw new NotFoundException('Case not found.');
    this.assertCaseAccess(user, legalCase);

    const [agreements, meetings, notes, kyc, documents, timeline, advocates, signatories, feePayment] = await Promise.all([
      this.db.query(
        `SELECT a.id, a.public_id, a.agreement_number, a.status, a.current_version, a.approved_at, a.executed_at,
                a.stamp_duty_status, a.stamp_reference, a.stamp_document_id, a.stamp_verified_at,
                a.stamp_amount, a.stamp_state, a.stamp_rejection_reason,
                verifier.full_name AS stamp_verified_by_name,
                doc.title AS stamp_document_title,
                doc.public_id AS stamp_document_public_id,
                doc.verification_status AS stamp_document_verification_status
           FROM agreements a
           LEFT JOIN users verifier ON verifier.id = a.stamp_verified_by
           LEFT JOIN documents doc ON doc.id = a.stamp_document_id
          WHERE a.legal_case_id = ? ORDER BY a.id DESC`, [id]),
      this.db.query(
        `SELECT id, public_id, purpose, scheduled_for, duration_min, status, provider, agenda, outcome_notes
           FROM legal_meetings WHERE legal_case_id = ? ORDER BY scheduled_for DESC`, [id]),
      this.db.query(
        `SELECT ln.id, ln.body, ln.visibility, ln.created_at, u.full_name AS author
           FROM legal_notes ln JOIN users u ON u.id = ln.author_id
          WHERE ln.legal_case_id = ? ORDER BY ln.created_at DESC`, [id]),
      this.db.query(
        `SELECT user_id, legal_name, id_type, id_last4, status, reviewed_at
           FROM kyc_records WHERE user_id IN (?, ?) ORDER BY id DESC`,
        [legalCase.owner_user_id, legalCase.tenant_user_id]),
      this.db.query(
        `SELECT id, title, category, mime_type, created_at, owner_user_id
           FROM documents WHERE (entity_type = 'tenancy' AND entity_id = ?)
              OR (entity_type = 'property' AND entity_id = ?)
          ORDER BY created_at DESC`,
        [legalCase.tenancy_id, legalCase.property_id]),
      this.db.query(
        `SELECT event_code, title, detail, occurred_at FROM property_timeline
          WHERE tenancy_id = ? OR property_id = ?
          ORDER BY occurred_at DESC LIMIT 30`,
        [legalCase.tenancy_id, legalCase.property_id]),
      this.db.query(
        `SELECT u.id, u.full_name, u.email FROM users u
           JOIN user_roles ur ON ur.user_id = u.id
           JOIN roles r ON r.id = ur.role_id
          WHERE r.code = 'LEGAL_TEAM' AND u.status = 'ACTIVE'
          ORDER BY u.full_name ASC`),
      this.db.query(
        `SELECT s.id, s.agreement_id, s.party_role, s.status, s.signed_at, s.sign_order, u.full_name
           FROM agreement_signatories s
           JOIN users u ON u.id = s.user_id
           JOIN agreements a ON a.id = s.agreement_id
          WHERE a.legal_case_id = ?
          ORDER BY s.sign_order`, [id]),
      this.db.one(
        `SELECT id, reference_code, purpose, total_amount, status, paid_at FROM payments
          WHERE tenancy_id = ? AND purpose IN ('SERVICE_FEE', 'COMMISSION') ORDER BY id DESC LIMIT 1`,
        [legalCase.tenancy_id]),
    ]);

    const agreementsWithSignatories = agreements.map((agr: any) => ({
      ...agr,
      signatories: (signatories as any[]).filter((s) => s.agreement_id === agr.id),
    }));

    return { case: legalCase, agreements: agreementsWithSignatories, feePayment: feePayment || null, meetings, notes, kyc, documents, timeline, advocates };
  }

  async assign(user: AuthUser, id: number, dto: AssignCaseDto, req?: Request) {
    await this.db.update('legal_cases', id, {
      assigned_to: dto.assigneeId ?? user.id,
      status: 'DOCUMENT_REVIEW',
      priority: dto.priority,
    });
    await this.audit.record({ actor: user, action: 'legal.case_assigned', objectType: 'legal_case', objectId: id, req });
    return { id, assignedTo: dto.assigneeId ?? user.id };
  }

  async addNote(user: AuthUser, caseId: number, body: string, visibility: 'INTERNAL' | 'PARTIES') {
    const id = await this.db.insert('legal_notes', {
      legal_case_id: caseId, author_id: user.id, body, visibility,
    });
    return { id };
  }

  async clauseLibrary(category?: string) {
    const params: unknown[] = [];
    let clause = 'WHERE is_active = 1';
    if (category) {
      clause += ' AND category = ?';
      params.push(category);
    }
    return this.db.query(
      `SELECT id, code, title, category, body_template, is_mandatory, jurisdiction, version
         FROM clause_library ${clause} ORDER BY is_mandatory DESC, category, title`,
      params,
    );
  }

  // ------------------------------------------------------------ agreements
  async draft(user: AuthUser, caseId: number, dto: DraftAgreementDto, req?: Request) {
    const legalCase = await this.db.one<any>(
      `SELECT lc.*, t.rent_amount, t.deposit_amount, t.maintenance_amount, t.lock_in_months,
              t.notice_period_days, t.rent_due_day, t.start_date, t.end_date,
              t.owner_user_id, t.tenant_user_id, p.state
         FROM legal_cases lc JOIN tenancies t ON t.id = lc.tenancy_id
         JOIN properties p ON p.id = t.property_id WHERE lc.id = ?`,
      [caseId],
    );
    if (!legalCase) throw new NotFoundException('Case not found.');

    let agreement = await this.db.one<any>(
      "SELECT * FROM agreements WHERE legal_case_id = ? AND status <> 'CANCELLED' ORDER BY id DESC LIMIT 1",
      [caseId],
    );

    if (agreement && ['EXECUTED', 'AWAITING_SIGNATURES', 'PARTIALLY_SIGNED', 'APPROVED_BY_LEGAL'].includes(agreement.status)) {
      throw new BadRequestException('This agreement is already out for signature or signed. Cancel it before redrafting.');
    }

    if (!agreement) {
      const seq = await this.db.nextSequence('AGR');
      const id = await this.db.insert('agreements', {
        public_id: newPublicId(),
        agreement_number: formatReference('AGR', seq),
        tenancy_id: legalCase.tenancy_id,
        legal_case_id: caseId,
        agreement_type: dto.agreementType ?? (legalCase.case_type === 'RENEWAL' ? 'RENEWAL' : 'LEAVE_AND_LICENSE'),
        status: 'DRAFT',
        current_version: 0,
        effective_from: dto.effectiveFrom ?? legalCase.start_date,
        effective_to: dto.effectiveTo ?? legalCase.end_date,
      });
      agreement = await this.db.one<any>('SELECT * FROM agreements WHERE id = ?', [id]);

      await this.db.insert('agreement_signatories', {
        agreement_id: id, user_id: legalCase.owner_user_id, party_role: 'OWNER', sign_order: 1,
      });
      await this.db.insert('agreement_signatories', {
        agreement_id: id, user_id: legalCase.tenant_user_id, party_role: 'TENANT', sign_order: 2,
      });
    }

    const version = agreement.current_version + 1;
    const variables = {
      rent_amount: legalCase.rent_amount,
      deposit_amount: legalCase.deposit_amount,
      maintenance_amount: legalCase.maintenance_amount ?? 0,
      lock_in_months: legalCase.lock_in_months ?? 0,
      notice_period_days: legalCase.notice_period_days ?? 30,
      rent_due_day: legalCase.rent_due_day ?? 5,
      ...dto.variables,
    };

    await this.db.insert('agreement_versions', {
      agreement_id: agreement.id,
      version,
      body_html: dto.bodyHtml,
      variables: JSON.stringify(variables),
      change_summary: dto.changeSummary ?? null,
      drafted_by: user.id,
      drafted_with_ai: dto.draftedWithAi ? 1 : 0,
    });

    if (dto.clauses?.length) {
      await this.db.execute('DELETE FROM agreement_clauses WHERE agreement_id = ?', [agreement.id]);
      for (const [index, clause] of dto.clauses.entries()) {
        await this.db.insert('agreement_clauses', {
          agreement_id: agreement.id,
          clause_id: clause.clauseId ?? null,
          sort_order: index,
          title: clause.title,
          body: this.fill(clause.body, variables),
          is_custom: clause.clauseId ? 0 : 1,
        });
      }
    }

    // A new draft always invalidates any earlier approval.
    await this.db.update('agreements', agreement.id, {
      current_version: version,
      status: 'LEGAL_REVIEW',
      approved_by: null,
      approved_at: null,
      effective_from: dto.effectiveFrom ?? agreement.effective_from,
      effective_to: dto.effectiveTo ?? agreement.effective_to,
    });
    await this.db.update('legal_cases', caseId, { status: 'DRAFTING' });
    await this.db.update('tenancies', legalCase.tenancy_id, { stage: 'AGREEMENT_DRAFT' });

    await this.audit.record({
      actor: user, action: 'agreement.drafted', objectType: 'agreement', objectId: agreement.id,
      metadata: { version, draftedWithAi: !!dto.draftedWithAi }, req,
    });
    return { agreementId: agreement.id, version, status: 'LEGAL_REVIEW' };
  }

  /** Only a holder of agreement.approve can do this, and only for the current version. */
  async approve(user: AuthUser, agreementId: number, dto: ApproveAgreementDto, req?: Request) {
    const agreement = await this.db.one<any>('SELECT * FROM agreements WHERE id = ?', [agreementId]);
    if (!agreement) throw new NotFoundException('Agreement not found.');
    if (agreement.current_version !== dto.version) {
      throw new BadRequestException('The draft changed since you opened it. Review the latest version.');
    }
    if (!agreement.current_version) throw new BadRequestException('There is no draft to approve yet.');

    await this.db.transaction(async (conn) => {
      await conn.execute(
        `UPDATE agreement_versions SET reviewed_by = ?, reviewed_at = NOW()
          WHERE agreement_id = ? AND version = ?`,
        [user.id, agreementId, dto.version],
      );
      await conn.execute(
        `UPDATE agreements SET status = 'AWAITING_SIGNATURES', approved_by = ?, approved_at = NOW()
          WHERE id = ?`,
        [user.id, agreementId],
      );
      await conn.execute("UPDATE legal_cases SET status = 'APPROVED' WHERE id = ?", [agreement.legal_case_id]);
      await conn.execute("UPDATE tenancies SET stage = 'AWAITING_SIGNATURES' WHERE id = ?", [agreement.tenancy_id]);
    });

    const signatories = await this.db.query<any>(
      'SELECT user_id FROM agreement_signatories WHERE agreement_id = ?', [agreementId],
    );
    await this.notify.sendMany(
      signatories.map((s) => s.user_id),
      'AGREEMENT_READY',
      {
        title: 'Agreement ready to sign',
        body: `Agreement ${agreement.agreement_number} has been approved by our legal team and is waiting for your signature.`,
        actionUrl: '/dashboard/agreements',
        severity: 'ACTION',
      },
    );
    await this.audit.record({
      actor: user, action: 'agreement.approved', objectType: 'agreement', objectId: agreementId,
      metadata: { version: dto.version }, req,
    });
    return { id: agreementId, status: 'AWAITING_SIGNATURES' };
  }

  async agreementDetail(user: AuthUser, agreementId: number) {
    const agreement = await this.db.one<any>(
      `SELECT a.*, t.owner_user_id, t.tenant_user_id, t.rent_amount, t.deposit_amount,
              p.title AS property_title, p.address_line1, p.locality, p.city, p.state, p.pincode,
              approver.full_name AS approved_by_name,
              verifier.full_name AS stamp_verified_by_name,
              doc.title AS stamp_document_title,
              doc.public_id AS stamp_document_public_id,
              doc.verification_status AS stamp_document_verification_status
         FROM agreements a
         JOIN tenancies t ON t.id = a.tenancy_id
         JOIN properties p ON p.id = t.property_id
         LEFT JOIN users approver ON approver.id = a.approved_by
         LEFT JOIN users verifier ON verifier.id = a.stamp_verified_by
         LEFT JOIN documents doc ON doc.id = a.stamp_document_id
        WHERE a.id = ?`,
      [agreementId],
    );
    if (!agreement) throw new NotFoundException('Agreement not found.');
    const isParty = [agreement.owner_user_id, agreement.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('legal.case.manage') && !user.permissions.includes('agreement.draft') && !user.permissions.includes('agreement.approve')) {
      throw new ForbiddenException('This agreement belongs to other parties.');
    }

    const [version, clauses, signatories, versions, feePayment] = await Promise.all([
      this.db.one(
        `SELECT version, body_html, variables, change_summary, drafted_with_ai, reviewed_at
           FROM agreement_versions WHERE agreement_id = ? AND version = ?`,
        [agreementId, agreement.current_version]),
      this.db.query(
        'SELECT title, body, sort_order FROM agreement_clauses WHERE agreement_id = ? ORDER BY sort_order',
        [agreementId]),
      this.db.query(
        `SELECT s.id, s.user_id, s.party_role, s.status, s.signed_at, s.sign_order, u.full_name, u.public_id
           FROM agreement_signatories s JOIN users u ON u.id = s.user_id
          WHERE s.agreement_id = ? ORDER BY s.sign_order`,
        [agreementId]),
      this.db.query(
        `SELECT av.version, av.change_summary, av.drafted_with_ai, av.reviewed_at, av.created_at,
                drafter.full_name AS drafter_name
           FROM agreement_versions av
           LEFT JOIN users drafter ON drafter.id = av.drafted_by
          WHERE av.agreement_id = ? ORDER BY av.version DESC`,
        [agreementId]),
      this.db.one(
        `SELECT id, reference_code, purpose, total_amount, status, paid_at FROM payments
          WHERE tenancy_id = ? AND purpose IN ('SERVICE_FEE', 'COMMISSION') ORDER BY id DESC LIMIT 1`,
        [agreement.tenancy_id]),
    ]);

    return {
      agreement,
      version,
      clauses,
      signatories,
      versions,
      feePayment: feePayment || null,
      // The UI must not present an unexecuted document as an enforceable contract.
      legalStatus:
        agreement.status === 'EXECUTED'
          ? 'Executed by all parties. E-stamp duty verified and initial platform fee confirmed.'
          : 'Draft. This document is not in force until every party has signed, e-stamp duty is verified, and initial payment is confirmed.',
    };
  }

  /**
   * Records a party's signature. The OTP/e-sign provider is abstracted: with no
   * provider configured this records a click-wrap consent with IP and timestamp,
   * which is what it is, and says so.
   */
  async sign(user: AuthUser, agreementId: number, dto: SignAgreementDto, req?: Request) {
    const agreement = await this.db.one<any>('SELECT * FROM agreements WHERE id = ?', [agreementId]);
    if (!agreement) throw new NotFoundException('Agreement not found.');
    if (!['AWAITING_SIGNATURES', 'PARTIALLY_SIGNED'].includes(agreement.status)) {
      throw new BadRequestException('This agreement is not open for signature.');
    }
    if (!agreement.approved_by) {
      throw new BadRequestException('This draft has not been approved by the legal team yet.');
    }

    // Verify the current agreement version has been approved and matches the requested version
    const currentVer = await this.db.one<any>(
      'SELECT version, reviewed_at FROM agreement_versions WHERE agreement_id = ? AND version = ?',
      [agreementId, agreement.current_version],
    );
    if (!currentVer) {
      throw new BadRequestException('Agreement version not found.');
    }
    if (!currentVer.reviewed_at) {
      throw new BadRequestException('The current agreement version has not been approved by the legal team.');
    }
    if (dto.version !== undefined && dto.version !== agreement.current_version) {
      throw new BadRequestException(
        `Cannot sign version ${dto.version}; current approved version is ${agreement.current_version}.`,
      );
    }

    const signatory = await this.db.one<any>(
      'SELECT * FROM agreement_signatories WHERE agreement_id = ? AND user_id = ?', [agreementId, user.id],
    );
    if (!signatory) throw new ForbiddenException('You are not a party to this agreement.');
    if (signatory.status === 'SIGNED') throw new BadRequestException('You have already signed.');
    if (!dto.consent) throw new BadRequestException('Confirm that you have read and accept the agreement.');

    const ip = ((req?.headers['x-forwarded-for'] as string) ?? req?.socket.remoteAddress ?? '').split(',')[0];
    await this.db.update('agreement_signatories', signatory.id, {
      status: 'SIGNED',
      signed_at: new Date(),
      signed_ip: ip.slice(0, 45),
      consent_text: dto.consentText ?? 'I have read the agreement and accept its terms.',
      provider: 'CLICKWRAP',
      otp_reference: dto.otpReference ?? null,
    });

    const pending = await this.db.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM agreement_signatories WHERE agreement_id = ? AND status <> 'SIGNED'",
      [agreementId],
    );

    if ((pending?.c ?? 0) > 0) {
      await this.db.update('agreements', agreementId, { status: 'PARTIALLY_SIGNED' });
      await this.audit.record({ actor: user, action: 'agreement.signed', objectType: 'agreement', objectId: agreementId, req });
      return { status: 'PARTIALLY_SIGNED', pendingSignatures: pending?.c ?? 0 };
    }

    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [agreement.tenancy_id]);
    const isRenewal = agreement.agreement_type === 'RENEWAL';

    if (isRenewal) {
      await this.db.update('agreements', agreementId, { status: 'EXECUTED', executed_at: new Date() });
      if (agreement.legal_case_id) {
        await this.db.update('legal_cases', agreement.legal_case_id, { status: 'EXECUTED', closed_at: new Date() });
      }
      const currentVerRenewal = await this.db.one<any>(
        'SELECT variables FROM agreement_versions WHERE agreement_id = ? AND version = ?',
        [agreementId, agreement.current_version],
      );
      let vars: any = {};
      if (currentVerRenewal?.variables) {
        vars = typeof currentVerRenewal.variables === 'string' ? JSON.parse(currentVerRenewal.variables) : currentVerRenewal.variables;
      }
      const newRent = Number(vars.rent_amount ?? tenancy.rent_amount);
      const newEndDate = agreement.effective_to ? agreement.effective_to : (vars.effective_to ?? tenancy.end_date);
      const newRenewalDueOn = newEndDate;

      await this.db.update('tenancies', agreement.tenancy_id, {
        stage: 'ACTIVE',
        rent_amount: newRent,
        end_date: newEndDate,
        renewal_due_on: newRenewalDueOn,
      });

      await this.db.insert('property_timeline', {
        property_id: tenancy.property_id,
        tenancy_id: tenancy.id,
        event_code: 'RENEWAL',
        title: 'Lease renewal executed',
        detail: `Renewal agreement ${agreement.agreement_number} executed. Term renewed until ${newEndDate}.`,
        actor_id: user.id,
      });

      await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'AGREEMENT_READY', {
        title: 'Lease renewal executed',
        body: `Renewal agreement ${agreement.agreement_number} has been executed by all parties. Your tenancy continues seamlessly.`,
        actionUrl: `/dashboard/tenancy/${tenancy.id}`,
        severity: 'INFO',
      });
      await this.audit.record({ actor: user, action: 'agreement.renewal_executed', objectType: 'agreement', objectId: agreementId, req });
      return { status: 'EXECUTED' };
    }

    // Initial tenancy agreements: both parties signed, but agreement execution must wait for payment.
    await this.db.update('agreements', agreementId, { status: 'APPROVED_BY_LEGAL' });
    await this.db.update('tenancies', agreement.tenancy_id, { stage: 'AWAITING_PAYMENT' });

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'AGREEMENT_SIGNED',
      title: 'Agreement signed by all parties',
      detail: `All parties have signed agreement ${agreement.agreement_number}. Execution pending initial payment confirmation.`,
      actor_id: user.id,
    });

    // Raise the move-in dues so the tenant sees exactly what to pay next.
    await this.payments.raiseMoveInDues(tenancy);

    await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'PAYMENT_DUE', {
      title: 'Agreement signed by all parties',
      body: 'All parties have signed. Move-in payments are now listed in your dashboard.',
      actionUrl: '/dashboard/payments',
      severity: 'ACTION',
    });
    await this.audit.record({ actor: user, action: 'agreement.signed_pending_payment', objectType: 'agreement', objectId: agreementId, req });
    return { status: 'AWAITING_PAYMENT', pendingSignatures: 0 };
  }

  // -------------------------------------------------------------- meetings
  async scheduleMeeting(user: AuthUser, dto: ScheduleMeetingDto, req?: Request) {
    const legalCase = await this.db.one<any>(
      `SELECT lc.id, lc.tenancy_id, t.owner_user_id, t.tenant_user_id
         FROM legal_cases lc JOIN tenancies t ON t.id = lc.tenancy_id WHERE lc.id = ?`,
      [dto.legalCaseId],
    );
    if (!legalCase) throw new NotFoundException('Case not found.');

    const id = await this.db.insert('legal_meetings', {
      public_id: newPublicId(),
      legal_case_id: legalCase.id,
      tenancy_id: legalCase.tenancy_id,
      purpose: dto.purpose ?? 'LEGAL_CONSULTATION',
      provider: 'PENDING_PROVIDER',
      join_token: randomToken(32),
      scheduled_for: dto.scheduledFor,
      duration_min: dto.durationMin ?? 30,
      host_user_id: user.id,
      agenda: dto.agenda ?? null,
    });

    const participants = [
      { user_id: legalCase.owner_user_id, party_role: 'OWNER' },
      { user_id: legalCase.tenant_user_id, party_role: 'TENANT' },
      { user_id: user.id, party_role: 'LEGAL' },
    ];
    for (const p of participants) {
      await this.db.execute(
        'INSERT IGNORE INTO meeting_participants (meeting_id, user_id, party_role) VALUES (?, ?, ?)',
        [id, p.user_id, p.party_role],
      );
    }

    await this.db.update('legal_cases', legalCase.id, { status: 'CONSULTATION_SCHEDULED' });
    await this.db.update('tenancies', legalCase.tenancy_id, { stage: 'CONSULTATION' });
    await this.notify.sendMany([legalCase.owner_user_id, legalCase.tenant_user_id], 'MEETING_SCHEDULED', {
      title: 'Legal consultation scheduled',
      body: `Your session with the Odibrick legal team is on ${new Date(dto.scheduledFor).toLocaleString('en-IN')}.`,
      actionUrl: '/dashboard/consultations',
      severity: 'ACTION',
    });
    await this.audit.record({ actor: user, action: 'legal.meeting_scheduled', objectType: 'meeting', objectId: id, req });
    return { id, status: 'SCHEDULED' };
  }

  async myMeetings(user: AuthUser) {
    return this.db.query(
      `SELECT m.id, m.public_id, m.purpose, m.scheduled_for, m.duration_min, m.status, m.agenda,
              m.provider, mp.party_role, host.full_name AS host_name,
              lc.case_number, p.title AS property_title
         FROM meeting_participants mp
         JOIN legal_meetings m ON m.id = mp.meeting_id
         JOIN users host ON host.id = m.host_user_id
         LEFT JOIN legal_cases lc ON lc.id = m.legal_case_id
         LEFT JOIN tenancies t ON t.id = m.tenancy_id
         LEFT JOIN properties p ON p.id = t.property_id
        WHERE mp.user_id = ?
        ORDER BY m.scheduled_for DESC LIMIT 50`,
      [user.id],
    );
  }

  async completeMeeting(user: AuthUser, id: number, outcomeNotes: string) {
    await this.db.update('legal_meetings', id, { status: 'COMPLETED', outcome_notes: outcomeNotes });
    await this.audit.record({ actor: user, action: 'legal.meeting_completed', objectType: 'meeting', objectId: id });
    return { id, status: 'COMPLETED' };
  }

  // ------------------------------------------------------------- internals
  private fill(template: string, vars: Record<string, unknown>): string {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => String(vars[key] ?? `{{${key}}}`));
  }

  // ------------------------------------------------------------- stamping workflow
  async submitStampingCertificate(user: AuthUser, agreementId: number, dto: SubmitStampingCertificateDto, req?: Request) {
    const agreement = await this.db.one<any>(
      `SELECT a.*, t.owner_user_id, t.tenant_user_id, t.property_id
         FROM agreements a
         JOIN tenancies t ON t.id = a.tenancy_id
        WHERE a.id = ?`,
      [agreementId],
    );
    if (!agreement) throw new NotFoundException('Agreement not found.');
    if (['EXECUTED', 'CANCELLED', 'SUPERSEDED'].includes(agreement.status)) {
      throw new BadRequestException(`Cannot submit stamping certificate for an agreement in '${agreement.status}' status.`);
    }

    const isParty = [agreement.owner_user_id, agreement.tenant_user_id].includes(user.id);
    const isStaff = this.isStampingStaff(user);
    if (!isParty && !isStaff) {
      throw new ForbiddenException('You are not authorized to submit stamping for this agreement.');
    }

    const docId = dto.documentId ?? null;
    if (docId) {
      const doc = await this.db.one<any>(
        'SELECT * FROM documents WHERE id = ? AND deleted_at IS NULL',
        [docId],
      );
      if (!doc) {
        throw new BadRequestException('The referenced document was not found.');
      }
      const isDocMatch =
        doc.owner_user_id === user.id ||
        doc.uploaded_by === user.id ||
        (doc.context_type === 'AGREEMENT' && Number(doc.context_id) === agreementId) ||
        (doc.context_type === 'TENANCY' && Number(doc.context_id) === agreement.tenancy_id);

      if (!isDocMatch && !isStaff) {
        throw new BadRequestException('This document does not belong to this agreement or user.');
      }
    }

    await this.db.update('agreements', agreementId, {
      stamp_reference: dto.certificateNumber.trim(),
      stamp_document_id: docId ?? agreement.stamp_document_id,
      stamp_amount: dto.stampAmount ?? agreement.stamp_amount,
      stamp_state: dto.state ?? agreement.stamp_state,
      stamp_duty_status: 'PENDING',
      stamp_rejection_reason: null,
      stamp_verified_by: null,
      stamp_verified_at: null,
    });

    await this.audit.record({
      actor: user,
      action: 'agreement.stamping_submitted',
      objectType: 'agreement',
      objectId: agreementId,
      metadata: {
        certificateNumber: dto.certificateNumber,
        state: dto.state,
        stampAmount: dto.stampAmount,
        documentId: docId,
      },
      req,
    });

    return {
      id: agreementId,
      stampDutyStatus: 'PENDING',
      stampReference: dto.certificateNumber.trim(),
      stampDocumentId: docId ?? agreement.stamp_document_id,
    };
  }

  async uploadStampingCertificate(user: AuthUser, agreementId: number, file: Express.Multer.File, dto: SubmitStampingCertificateDto, req?: Request) {
    const agreement = await this.db.one<any>(
      `SELECT a.*, t.owner_user_id, t.tenant_user_id, t.property_id
         FROM agreements a
         JOIN tenancies t ON t.id = a.tenancy_id
        WHERE a.id = ?`,
      [agreementId],
    );
    if (!agreement) throw new NotFoundException('Agreement not found.');
    if (['EXECUTED', 'CANCELLED', 'SUPERSEDED'].includes(agreement.status)) {
      throw new BadRequestException(`Cannot upload stamping certificate for an agreement in '${agreement.status}' status.`);
    }

    const isParty = [agreement.owner_user_id, agreement.tenant_user_id].includes(user.id);
    const isStaff = this.isStampingStaff(user);
    if (!isParty && !isStaff) {
      throw new ForbiddenException('You are not authorized to upload stamping for this agreement.');
    }

    if (!file || !file.buffer) {
      throw new BadRequestException('A certificate file is required.');
    }

    const stored = await this.storage.store(file, `vault/${user.publicId}/agreements`);
    const doc = await this.storage.registerDocument(
      {
        user,
        file: stored,
        category: 'AGREEMENT',
        documentType: 'STAMPING_DOCUMENT',
        title: `E-Stamp Certificate - ${dto.certificateNumber}`,
        contextType: 'AGREEMENT',
        contextId: agreementId,
        visibility: 'PARTIES',
      },
      req,
    );

    await this.db.update('agreements', agreementId, {
      stamp_reference: dto.certificateNumber.trim(),
      stamp_document_id: doc.id,
      stamp_amount: dto.stampAmount ?? null,
      stamp_state: dto.state ?? null,
      stamp_duty_status: 'PENDING',
      stamp_rejection_reason: null,
      stamp_verified_by: null,
      stamp_verified_at: null,
    });

    await this.audit.record({
      actor: user,
      action: 'agreement.stamping_uploaded',
      objectType: 'agreement',
      objectId: agreementId,
      metadata: {
        certificateNumber: dto.certificateNumber,
        state: dto.state,
        stampAmount: dto.stampAmount,
        documentId: doc.id,
      },
      req,
    });

    return {
      id: agreementId,
      stampDutyStatus: 'PENDING',
      stampReference: dto.certificateNumber.trim(),
      stampDocumentId: doc.id,
    };
  }

  async verifyStamping(user: AuthUser, agreementId: number, dto: VerifyStampingDto, req?: Request) {
    if (!this.isStampingStaff(user)) {
      throw new ForbiddenException('Only authorized legal or city manager staff can verify stamping.');
    }

    const agreement = await this.db.one<any>(
      `SELECT a.*, t.owner_user_id, t.tenant_user_id, t.property_id
         FROM agreements a
         JOIN tenancies t ON t.id = a.tenancy_id
        WHERE a.id = ?`,
      [agreementId],
    );
    if (!agreement) throw new NotFoundException('Agreement not found.');

    const docId = dto.documentId ?? agreement.stamp_document_id ?? null;
    const certNumber = dto.certificateNumber?.trim();
    if (!certNumber) {
      throw new BadRequestException('Certificate reference number is required.');
    }

    if (agreement.status === 'EXECUTED') {
      // Idempotent retry: if already verified and executed with matching certificate reference, return success
      if (agreement.stamp_duty_status === 'PAID' && agreement.stamp_reference === certNumber) {
        this.logger.log(`Idempotent verifyStamping: Agreement #${agreementId} is already EXECUTED with certificate '${certNumber}'.`);
        return {
          id: agreementId,
          stampDutyStatus: 'PAID',
          stampReference: agreement.stamp_reference,
          stampVerifiedBy: agreement.stamp_verified_by,
          stampVerifiedAt: agreement.stamp_verified_at,
          executed: true,
        };
      }
      throw new BadRequestException(`Cannot verify stamping on an agreement in '${agreement.status}' status.`);
    }

    if (['CANCELLED', 'SUPERSEDED'].includes(agreement.status)) {
      throw new BadRequestException(`Cannot verify stamping on an agreement in '${agreement.status}' status.`);
    }

    const executionResult = await this.db.transaction(async (conn) => {
      // 1. Establish uniform lock hierarchy across services: lock tenancy FIRST
      const [tenancyRows]: any = await conn.execute(
        `SELECT id, property_id, stage, owner_user_id, tenant_user_id FROM tenancies WHERE id = ? FOR UPDATE`,
        [agreement.tenancy_id],
      );
      const tenancyRow = tenancyRows[0];

      // 2. Lock agreement SECOND
      const [lockedAgrs]: any = await conn.execute(
        `SELECT a.* FROM agreements a WHERE a.id = ? FOR UPDATE`,
        [agreementId],
      );
      const lockedAgr = lockedAgrs[0];
      if (!lockedAgr || ['EXECUTED', 'CANCELLED', 'SUPERSEDED'].includes(lockedAgr.status)) {
        throw new BadRequestException(`Agreement cannot be verified in '${lockedAgr?.status}' status.`);
      }

      // 3. Update agreement stamping details
      await conn.execute(
        `UPDATE agreements
            SET stamp_duty_status = 'PAID',
                stamp_reference = ?,
                stamp_verified_by = ?,
                stamp_verified_at = NOW(),
                stamp_amount = COALESCE(?, stamp_amount),
                stamp_state = COALESCE(?, stamp_state),
                stamp_document_id = COALESCE(?, stamp_document_id),
                stamp_rejection_reason = NULL
          WHERE id = ?`,
        [certNumber, user.id, dto.stampAmount ?? null, dto.state ?? null, docId, agreementId],
      );

      if (docId) {
        await conn.execute(
          `UPDATE documents
              SET verification_status = 'VERIFIED',
                  verified_by = ?,
                  verified_at = NOW(),
                  internal_notes = COALESCE(?, internal_notes)
            WHERE id = ?`,
          [user.id, dto.notes ?? null, docId],
        );
      }

      await conn.execute(
        `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, actor_id)
         VALUES (?, ?, 'STAMPING_VERIFIED', 'E-Stamp certificate verified', ?, ?)`,
        [agreement.property_id, agreement.tenancy_id, `E-Stamp certificate ${certNumber} verified by ${user.fullName}.`, user.id],
      );

      return await this.tryExecuteAgreement(conn, agreementId, agreement.tenancy_id, user, tenancyRow);
    });

    let notificationError: string | null = null;
    if (executionResult.executed) {
      try {
        await this.dispatchExecutionNotifications(executionResult);
      } catch (err: any) {
        notificationError = err?.message || 'Notification service error';
        this.logger.error(
          `Post-commit execution notification delivery failed for agreement #${agreementId} (tenancy #${executionResult.tenancyId}): ${notificationError}`,
          err?.stack,
        );
      }
    }

    await this.audit.record({
      actor: user,
      action: 'agreement.stamping_verified',
      objectType: 'agreement',
      objectId: agreementId,
      metadata: {
        certificateNumber: certNumber,
        state: dto.state,
        stampAmount: dto.stampAmount,
        documentId: docId,
        executed: executionResult.executed,
        notificationsDelivered: executionResult.executed ? notificationError === null : false,
        ...(notificationError ? { notificationError } : {}),
      },
      req,
    });

    return {
      id: agreementId,
      stampDutyStatus: 'PAID',
      stampReference: certNumber,
      stampVerifiedBy: user.id,
      stampVerifiedAt: new Date(),
      executed: executionResult.executed,
      ...(notificationError ? { notificationWarning: 'Execution completed, but party notification delivery failed.' } : {}),
    };
  }

  async rejectStamping(user: AuthUser, agreementId: number, dto: RejectStampingDto, req?: Request) {
    if (!this.isStampingStaff(user)) {
      throw new ForbiddenException('Only authorized legal or city manager staff can reject stamping.');
    }

    const agreement = await this.db.one<any>(
      `SELECT a.*, t.owner_user_id, t.tenant_user_id, t.property_id
         FROM agreements a
         JOIN tenancies t ON t.id = a.tenancy_id
        WHERE a.id = ?`,
      [agreementId],
    );
    if (!agreement) throw new NotFoundException('Agreement not found.');

    if (['EXECUTED', 'CANCELLED', 'SUPERSEDED'].includes(agreement.status)) {
      throw new BadRequestException(`Cannot reject stamping for an agreement in '${agreement.status}' status.`);
    }

    const reason = dto.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException('A clear rejection reason is required.');
    }

    const docId = agreement.stamp_document_id ?? null;

    await this.db.transaction(async (conn) => {
      // 1. Lock tenancy FIRST
      await conn.execute(
        `SELECT id FROM tenancies WHERE id = ? FOR UPDATE`,
        [agreement.tenancy_id],
      );

      // 2. Lock agreement SECOND
      const [lockedAgrs]: any = await conn.execute(
        `SELECT id, status FROM agreements WHERE id = ? FOR UPDATE`,
        [agreementId],
      );
      if (!lockedAgrs.length || ['EXECUTED', 'CANCELLED', 'SUPERSEDED'].includes(lockedAgrs[0].status)) {
        throw new BadRequestException(`Cannot reject stamping on an agreement in '${lockedAgrs?.[0]?.status}' status.`);
      }

      // 3. Update agreement
      await conn.execute(
        `UPDATE agreements
            SET stamp_duty_status = 'PENDING',
                stamp_rejection_reason = ?,
                stamp_verified_by = ?,
                stamp_verified_at = NOW()
          WHERE id = ?`,
        [reason, user.id, agreementId],
      );

      if (docId) {
        await conn.execute(
          `UPDATE documents
              SET verification_status = 'REJECTED',
                  rejection_reason = ?,
                  verified_by = ?,
                  verified_at = NOW(),
                  internal_notes = COALESCE(?, internal_notes)
            WHERE id = ?`,
          [reason, user.id, dto.notes ?? null, docId],
        );
      }

      await conn.execute(
        `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, actor_id)
         VALUES (?, ?, 'STAMPING_REJECTED', 'E-Stamp certificate rejected', ?, ?)`,
        [agreement.property_id, agreement.tenancy_id, `E-Stamp certificate rejected by ${user.fullName}: ${reason}`, user.id],
      );
    });

    await this.audit.record({
      actor: user,
      action: 'agreement.stamping_rejected',
      objectType: 'agreement',
      objectId: agreementId,
      metadata: { reason, rejectedBy: user.id },
      req,
    });

    await this.notify.sendMany([agreement.owner_user_id, agreement.tenant_user_id], 'STAMPING_REJECTED', {
      title: 'E-Stamp certificate rejected',
      body: `Your submitted e-stamp certificate was rejected: ${reason}. Please upload a valid certificate.`,
      actionUrl: `/dashboard/agreements/${agreementId}`,
      severity: 'ACTION',
    });

    return {
      id: agreementId,
      stampDutyStatus: 'PENDING',
      stampRejectionReason: reason,
    };
  }

  async markStampingNotApplicable(user: AuthUser, agreementId: number, dto: StampingNotApplicableDto, req?: Request) {
    if (!this.isStampingStaff(user)) {
      throw new ForbiddenException('Only authorized legal or city manager staff can mark stamping as not applicable.');
    }

    const agreement = await this.db.one<any>(
      `SELECT a.*, t.owner_user_id, t.tenant_user_id, t.property_id
         FROM agreements a
         JOIN tenancies t ON t.id = a.tenancy_id
        WHERE a.id = ?`,
      [agreementId],
    );
    if (!agreement) throw new NotFoundException('Agreement not found.');

    if (agreement.status === 'EXECUTED') {
      if (agreement.stamp_duty_status === 'NOT_APPLICABLE') {
        this.logger.log(`Idempotent markStampingNotApplicable: Agreement #${agreementId} is already EXECUTED with NOT_APPLICABLE.`);
        return {
          id: agreementId,
          stampDutyStatus: 'NOT_APPLICABLE',
          stampReference: 'NOT_APPLICABLE',
          stampVerifiedBy: agreement.stamp_verified_by,
          executed: true,
        };
      }
      throw new BadRequestException(`Cannot mark stamping not applicable on an agreement in '${agreement.status}' status.`);
    }

    if (['CANCELLED', 'SUPERSEDED'].includes(agreement.status)) {
      throw new BadRequestException(`Cannot mark stamping not applicable on an agreement in '${agreement.status}' status.`);
    }

    const reason = dto.reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException('A clear justification reason is required.');
    }

    const executionResult = await this.db.transaction(async (conn) => {
      // 1. Establish uniform lock hierarchy: lock tenancy FIRST
      const [tenancyRows]: any = await conn.execute(
        `SELECT id, property_id, stage, owner_user_id, tenant_user_id FROM tenancies WHERE id = ? FOR UPDATE`,
        [agreement.tenancy_id],
      );
      const tenancyRow = tenancyRows[0];

      // 2. Lock agreement SECOND
      const [lockedAgrs]: any = await conn.execute(
        `SELECT a.* FROM agreements a WHERE a.id = ? FOR UPDATE`,
        [agreementId],
      );
      const lockedAgr = lockedAgrs[0];
      if (!lockedAgr || ['EXECUTED', 'CANCELLED', 'SUPERSEDED'].includes(lockedAgr.status)) {
        throw new BadRequestException(`Cannot mark stamping not applicable on an agreement in '${lockedAgr?.status}' status.`);
      }

      // 3. Update agreement
      await conn.execute(
        `UPDATE agreements
            SET stamp_duty_status = 'NOT_APPLICABLE',
                stamp_reference = 'NOT_APPLICABLE',
                stamp_verified_by = ?,
                stamp_verified_at = NOW(),
                stamp_rejection_reason = NULL
          WHERE id = ?`,
        [user.id, agreementId],
      );

      await conn.execute(
        `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, actor_id)
         VALUES (?, ?, 'STAMPING_NOT_APPLICABLE', 'Stamping marked not applicable', ?, ?)`,
        [agreement.property_id, agreement.tenancy_id, `Stamping marked NOT_APPLICABLE by ${user.fullName}: ${reason}`, user.id],
      );

      return await this.tryExecuteAgreement(conn, agreementId, agreement.tenancy_id, user, tenancyRow);
    });

    let notificationError: string | null = null;
    if (executionResult.executed) {
      try {
        await this.dispatchExecutionNotifications(executionResult);
      } catch (err: any) {
        notificationError = err?.message || 'Notification service error';
        this.logger.error(
          `Post-commit execution notification delivery failed for agreement #${agreementId} (tenancy #${executionResult.tenancyId}): ${notificationError}`,
          err?.stack,
        );
      }
    }

    await this.audit.record({
      actor: user,
      action: 'agreement.stamping_marked_not_applicable',
      objectType: 'agreement',
      objectId: agreementId,
      metadata: {
        reason,
        markedBy: user.id,
        executed: executionResult.executed,
        notificationsDelivered: executionResult.executed ? notificationError === null : false,
        ...(notificationError ? { notificationError } : {}),
      },
      req,
    });

    return {
      id: agreementId,
      stampDutyStatus: 'NOT_APPLICABLE',
      stampReference: 'NOT_APPLICABLE',
      stampVerifiedBy: user.id,
      executed: executionResult.executed,
      ...(notificationError ? { notificationWarning: 'Execution completed, but party notification delivery failed.' } : {}),
    };
  }

  private isStampingStaff(user: AuthUser): boolean {
    return Boolean(
      user.permissions.includes('legal.case.manage') ||
      user.permissions.includes('agreement.approve') ||
      user.permissions.includes('document.verify') ||
      user.roles.includes('ADMIN') ||
      user.roles.includes('SUPER_ADMIN') ||
      user.roles.includes('PROPERTY_MANAGER') ||
      user.roles.includes('LEGAL_TEAM'),
    );
  }

  private async tryExecuteAgreement(
    conn: any,
    agreementId: number,
    tenancyId: number,
    actor: AuthUser,
    lockedTenancyRow?: any,
  ): Promise<{ executed: boolean; tenancyId?: number; ownerUserId?: number; tenantUserId?: number }> {
    // 1. Establish uniform lock hierarchy: tenancy FIRST
    const tenancyRow =
      lockedTenancyRow ||
      (await conn.execute(
        `SELECT id, property_id, stage, owner_user_id, tenant_user_id FROM tenancies WHERE id = ? FOR UPDATE`,
        [tenancyId],
      ))[0]?.[0];
    if (!tenancyRow || tenancyRow.stage !== 'AWAITING_PAYMENT') return { executed: false };

    // 2. Lock agreement SECOND
    const [agrs]: any = await conn.execute(
      `SELECT a.* FROM agreements a WHERE a.id = ? FOR UPDATE`,
      [agreementId],
    );
    const agr = agrs[0];
    if (!agr || agr.status === 'EXECUTED') return { executed: false };

    // 1. Version approval check
    const [currVer]: any = await conn.execute(
      `SELECT reviewed_at FROM agreement_versions WHERE agreement_id = ? AND version = ? LIMIT 1`,
      [agr.id, agr.current_version],
    );
    const isVersionApproved = agr.approved_by !== null && currVer.length > 0 && currVer[0].reviewed_at !== null;

    // 2. Signatories check: total >= 2, pending === 0
    const [sigStats]: any = await conn.execute(
      `SELECT COUNT(*) AS total_sigs,
              SUM(CASE WHEN status = 'SIGNED' THEN 1 ELSE 0 END) AS signed_sigs,
              SUM(CASE WHEN status <> 'SIGNED' THEN 1 ELSE 0 END) AS pending_sigs
         FROM agreement_signatories WHERE agreement_id = ?`,
      [agr.id],
    );
    const totalSigs = Number(sigStats[0]?.total_sigs || 0);
    const pendingSigs = Number(sigStats[0]?.pending_sigs || 0);
    const areSignatoriesComplete = totalSigs >= 2 && pendingSigs === 0;

    // 3. Odibrick fee check: ALL fee obligations must be confirmed PAID (exact parity with PaymentsService)
    const [feeRows]: any = await conn.execute(
      `SELECT id, status FROM payments
        WHERE tenancy_id = ? AND purpose IN ('SERVICE_FEE', 'COMMISSION')
        FOR UPDATE`,
      [tenancyId],
    );
    const hasFeeObligation = feeRows.length > 0;
    const isFeePaid = hasFeeObligation && feeRows.every((f: any) => f.status === 'PAID');

    // 4. Stamping check: verified as PAID or REGISTERED, or marked NOT_APPLICABLE by staff
    const isStampingSatisfied =
      (agr.stamp_duty_status === 'PAID' &&
        agr.stamp_verified_by != null &&
        agr.stamp_verified_at != null &&
        Boolean(agr.stamp_reference && String(agr.stamp_reference).trim())) ||
      (agr.stamp_duty_status === 'REGISTERED' &&
        agr.stamp_verified_by != null &&
        agr.stamp_verified_at != null &&
        Boolean((agr.registration_ref && String(agr.registration_ref).trim()) || (agr.stamp_reference && String(agr.stamp_reference).trim()))) ||
      (agr.stamp_duty_status === 'NOT_APPLICABLE' &&
        agr.stamp_verified_by != null &&
        agr.stamp_verified_at != null &&
        agr.stamp_reference === 'NOT_APPLICABLE');

    if (isVersionApproved && areSignatoriesComplete && isFeePaid && isStampingSatisfied && tenancyRow.stage === 'AWAITING_PAYMENT') {
      await conn.execute(
        `UPDATE agreements SET status = 'EXECUTED', executed_at = NOW() WHERE id = ?`,
        [agr.id],
      );
      if (agr.legal_case_id) {
        await conn.execute(
          `UPDATE legal_cases SET status = 'EXECUTED', closed_at = NOW() WHERE id = ?`,
          [agr.legal_case_id],
        );
      }
      await conn.execute(
        `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail)
         VALUES (?, ?, 'AGREEMENT_EXECUTED', 'Agreement executed', ?)`,
        [tenancyRow.property_id, tenancyId, `Agreement #${agr.id} (v${agr.current_version}) legally executed following stamping verification and Odibrick service fee confirmation.`],
      );
      await conn.execute(`UPDATE tenancies SET stage = 'CHECK_IN_PENDING' WHERE id = ?`, [tenancyId]);
      await conn.execute(`UPDATE properties SET status = 'RENTED' WHERE id = ?`, [tenancyRow.property_id]);
      await conn.execute(
        `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title)
         VALUES (?, ?, 'PAYMENT_COMPLETED', 'Stamping verified & fee paid; move-in scheduled')`,
        [tenancyRow.property_id, tenancyId],
      );
      return {
        executed: true,
        tenancyId,
        ownerUserId: tenancyRow.owner_user_id,
        tenantUserId: tenancyRow.tenant_user_id,
      };
    }
    return { executed: false };
  }

  private async dispatchExecutionNotifications(execResult: {
    executed: boolean;
    tenancyId?: number;
    ownerUserId?: number;
    tenantUserId?: number;
  }) {
    if (!execResult.executed || !execResult.ownerUserId || !execResult.tenantUserId || !execResult.tenancyId) {
      return;
    }
    await this.notify.sendMany([execResult.ownerUserId, execResult.tenantUserId], 'AGREEMENT_READY', {
      title: 'Agreement executed',
      body: 'Initial payment confirmed and e-stamp verified. The agreement has been formally executed and move-in check-in is pending.',
      actionUrl: `/dashboard/tenancy/${execResult.tenancyId}`,
      severity: 'INFO',
    });
    await this.notify.send(execResult.tenantUserId, 'CHECK_IN_PENDING', {
      title: 'Document your home',
      body: 'Record the Day 1 condition report as soon as you take possession. It protects your deposit.',
      actionUrl: `/dashboard/tenancy/${execResult.tenancyId}/check-in`,
      severity: 'ACTION',
    });
  }

  // ------------------------------------------------------------- internals

  private assertCaseAccess(user: AuthUser, legalCase: any) {
    if (user.permissions.includes('legal.case.manage')) return;
    if ([legalCase.owner_user_id, legalCase.tenant_user_id].includes(user.id)) return;
    throw new ForbiddenException('This case belongs to other parties.');
  }
}
