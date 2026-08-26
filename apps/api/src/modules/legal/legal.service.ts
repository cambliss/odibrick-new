import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
} from './legal.dto';

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
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly payments: PaymentsService,
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
      `SELECT lc.*, t.id AS tenancy_id, t.stage, t.rent_amount, t.deposit_amount, t.maintenance_amount,
              t.start_date, t.end_date, t.lock_in_months, t.notice_period_days, t.service_plan,
              t.owner_user_id, t.tenant_user_id,
              p.id AS property_id, p.title AS property_title, p.address_line1, p.locality, p.city,
              p.state, p.pincode, p.furnishing, p.bedrooms,
              own.full_name AS owner_name, own.email AS owner_email,
              ten.full_name AS tenant_name, ten.email AS tenant_email
         FROM legal_cases lc
         JOIN tenancies t ON t.id = lc.tenancy_id
         JOIN properties p ON p.id = t.property_id
         JOIN users own ON own.id = t.owner_user_id
         JOIN users ten ON ten.id = t.tenant_user_id
        WHERE lc.id = ?`,
      [id],
    );
    if (!legalCase) throw new NotFoundException('Case not found.');
    this.assertCaseAccess(user, legalCase);

    const [agreements, meetings, notes, kyc, documents] = await Promise.all([
      this.db.query(
        `SELECT id, public_id, agreement_number, status, current_version, approved_at, executed_at,
                stamp_duty_status FROM agreements WHERE legal_case_id = ? ORDER BY id DESC`, [id]),
      this.db.query(
        `SELECT id, public_id, purpose, scheduled_for, duration_min, status, provider, agenda
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
    ]);

    return { case: legalCase, agreements, meetings, notes, kyc, documents };
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

    if (agreement && ['EXECUTED', 'AWAITING_SIGNATURES', 'PARTIALLY_SIGNED'].includes(agreement.status)) {
      throw new BadRequestException('This agreement is already out for signature. Cancel it before redrafting.');
    }

    if (!agreement) {
      const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM agreements');
      const id = await this.db.insert('agreements', {
        public_id: newPublicId(),
        agreement_number: formatReference('AGR', (seq?.c ?? 0) + 1),
        tenancy_id: legalCase.tenancy_id,
        legal_case_id: caseId,
        agreement_type: dto.agreementType ?? 'LEAVE_AND_LICENSE',
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
              approver.full_name AS approved_by_name
         FROM agreements a
         JOIN tenancies t ON t.id = a.tenancy_id
         JOIN properties p ON p.id = t.property_id
         LEFT JOIN users approver ON approver.id = a.approved_by
        WHERE a.id = ?`,
      [agreementId],
    );
    if (!agreement) throw new NotFoundException('Agreement not found.');
    const isParty = [agreement.owner_user_id, agreement.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('legal.case.manage')) {
      throw new ForbiddenException('This agreement belongs to other parties.');
    }

    const [version, clauses, signatories] = await Promise.all([
      this.db.one(
        `SELECT version, body_html, variables, change_summary, drafted_with_ai, reviewed_at
           FROM agreement_versions WHERE agreement_id = ? AND version = ?`,
        [agreementId, agreement.current_version]),
      this.db.query(
        'SELECT title, body, sort_order FROM agreement_clauses WHERE agreement_id = ? ORDER BY sort_order',
        [agreementId]),
      this.db.query(
        `SELECT s.id, s.party_role, s.status, s.signed_at, s.sign_order, u.full_name, u.public_id
           FROM agreement_signatories s JOIN users u ON u.id = s.user_id
          WHERE s.agreement_id = ? ORDER BY s.sign_order`,
        [agreementId]),
    ]);

    return {
      agreement,
      version,
      clauses,
      signatories,
      // The UI must not present an unexecuted document as an enforceable contract.
      legalStatus:
        agreement.status === 'EXECUTED'
          ? 'Executed by all parties. Stamping and registration status is shown separately.'
          : 'Draft. This document is not in force until every party has signed and it is executed.',
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

    await this.db.update('agreements', agreementId, { status: 'EXECUTED', executed_at: new Date() });
    await this.db.update('legal_cases', agreement.legal_case_id, { status: 'EXECUTED', closed_at: new Date() });
    await this.db.update('tenancies', agreement.tenancy_id, { stage: 'AWAITING_PAYMENT' });

    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [agreement.tenancy_id]);
    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'AGREEMENT_SIGNED',
      title: 'Agreement executed',
      detail: agreement.agreement_number,
      actor_id: user.id,
    });

    // Raise the move-in dues so the tenant sees exactly what to pay next.
    await this.payments.raiseMoveInDues(tenancy);

    await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'PAYMENT_DUE', {
      title: 'Agreement executed',
      body: 'All parties have signed. Move-in payments are now listed in your dashboard.',
      actionUrl: '/dashboard/payments',
      severity: 'ACTION',
    });
    await this.audit.record({ actor: user, action: 'agreement.executed', objectType: 'agreement', objectId: agreementId, req });
    return { status: 'EXECUTED' };
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

  private assertCaseAccess(user: AuthUser, legalCase: any) {
    if (user.permissions.includes('legal.case.manage')) return;
    if ([legalCase.owner_user_id, legalCase.tenant_user_id].includes(user.id)) return;
    throw new ForbiddenException('This case belongs to other parties.');
  }
}
