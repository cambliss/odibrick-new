import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId, formatReference } from '../../common/util/ids';
import { pageParams, paginate } from '../../common/util/pagination';
import { ApplicationDecisionDto, CreateApplicationDto, CreateEnquiryDto, CreateViewingDto } from './rental.dto';

@Injectable()
export class RentalService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  // ------------------------------------------------------------- enquiries
  async createEnquiry(user: AuthUser, dto: CreateEnquiryDto, req?: Request) {
    const property = await this.activeProperty(dto.propertyId);
    if (property.listed_by_user_id === user.id) {
      throw new BadRequestException('You cannot enquire about your own listing.');
    }

    const recent = await this.db.one<any>(
      `SELECT id FROM enquiries WHERE property_id = ? AND tenant_user_id = ?
         AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR) LIMIT 1`,
      [dto.propertyId, user.id],
    );
    if (recent) return { id: recent.id, status: 'ALREADY_SENT', message: 'You already contacted this listing today.' };

    const id = await this.db.insert('enquiries', {
      public_id: newPublicId(),
      property_id: dto.propertyId,
      tenant_user_id: user.id,
      message: dto.message ?? null,
      contact_pref: dto.contactPreference ?? 'CHAT',
      source: dto.source ?? 'SEARCH',
    });
    await this.db.execute('UPDATE properties SET enquiry_count = enquiry_count + 1 WHERE id = ?', [dto.propertyId]);
    await this.notify.send(property.listed_by_user_id, 'APPLICATION_SUBMITTED', {
      title: 'New enquiry',
      body: `${user.fullName} enquired about ${property.title}.`,
      actionUrl: `/dashboard/leads`,
      severity: 'ACTION',
    });
    await this.audit.record({ actor: user, action: 'enquiry.created', objectType: 'enquiry', objectId: id, req });
    return { id, status: 'NEW' };
  }

  async listLeads(user: AuthUser, status?: string, page?: number, perPage?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, perPage);
    const where = ['pr.listed_by_user_id = ?'];
    const params: unknown[] = [user.id];
    if (status) {
      where.push('e.status = ?');
      params.push(status);
    }
    const clause = where.join(' AND ');
    const rows = await this.db.query(
      `SELECT e.id, e.public_id, e.status, e.message, e.contact_pref, e.created_at,
              pr.id AS property_id, pr.title AS property_title, pr.locality, pr.city,
              u.full_name AS tenant_name, u.public_id AS tenant_public_id,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS tenant_kyc
         FROM enquiries e
         JOIN properties pr ON pr.id = e.property_id
         JOIN users u ON u.id = e.tenant_user_id
        WHERE ${clause}
        ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM enquiries e JOIN properties pr ON pr.id = e.property_id WHERE ${clause}`,
      params,
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  async updateEnquiryStatus(user: AuthUser, id: number, status: string) {
    const row = await this.db.one<any>(
      `SELECT e.id FROM enquiries e JOIN properties p ON p.id = e.property_id
        WHERE e.id = ? AND p.listed_by_user_id = ?`,
      [id, user.id],
    );
    if (!row) throw new NotFoundException('Enquiry not found.');
    await this.db.update('enquiries', id, { status, responded_at: new Date() });
    return { id, status };
  }

  // -------------------------------------------------------------- viewings
  async requestViewing(user: AuthUser, dto: CreateViewingDto) {
    const property = await this.activeProperty(dto.propertyId);
    const id = await this.db.insert('viewings', {
      property_id: dto.propertyId,
      enquiry_id: dto.enquiryId ?? null,
      tenant_user_id: user.id,
      host_user_id: property.listed_by_user_id,
      mode: dto.mode ?? 'IN_PERSON',
      scheduled_for: dto.scheduledFor,
    });
    await this.notify.send(property.listed_by_user_id, 'MEETING_SCHEDULED', {
      title: 'Visit requested',
      body: `${user.fullName} asked to visit ${property.title}.`,
      actionUrl: '/dashboard/visits',
      severity: 'ACTION',
    });
    return { id, status: 'REQUESTED' };
  }

  async respondToViewing(user: AuthUser, id: number, status: string, scheduledFor?: string) {
    const row = await this.db.one<any>(
      `SELECT v.*, p.listed_by_user_id FROM viewings v JOIN properties p ON p.id = v.property_id WHERE v.id = ?`,
      [id],
    );
    if (!row) throw new NotFoundException('Visit not found.');
    if (row.listed_by_user_id !== user.id && row.tenant_user_id !== user.id) {
      throw new ForbiddenException('This visit belongs to another account.');
    }
    await this.db.update('viewings', id, { status, scheduled_for: scheduledFor });
    await this.notify.send(
      user.id === row.tenant_user_id ? row.listed_by_user_id : row.tenant_user_id,
      'MEETING_SCHEDULED',
      { title: `Visit ${status.toLowerCase()}`, body: 'Check your visits for the latest time.', actionUrl: '/dashboard/visits' },
    );
    return { id, status };
  }

  // ----------------------------------------------------------- applications
  async apply(user: AuthUser, dto: CreateApplicationDto, req?: Request) {
    const property = await this.activeProperty(dto.propertyId);
    if (property.listed_by_user_id === user.id) {
      throw new BadRequestException('You cannot apply to your own listing.');
    }

    const kyc = await this.db.one<any>(
      "SELECT status FROM kyc_records WHERE user_id = ? ORDER BY id DESC LIMIT 1", [user.id],
    );
    if (!kyc || kyc.status !== 'VERIFIED') {
      throw new BadRequestException('Finish identity verification before applying. It takes about 5 minutes.');
    }

    const existing = await this.db.one<any>(
      'SELECT id, status FROM applications WHERE property_id = ? AND tenant_user_id = ?',
      [dto.propertyId, user.id],
    );
    if (existing) throw new BadRequestException('You have already applied for this property.');

    const id = await this.db.insert('applications', {
      public_id: newPublicId(),
      property_id: dto.propertyId,
      tenant_user_id: user.id,
      enquiry_id: dto.enquiryId ?? null,
      occupants: dto.occupants ?? null,
      household_type: dto.householdType ?? null,
      move_in_date: dto.moveInDate ?? null,
      tenure_months: dto.tenureMonths ?? null,
      offered_rent: dto.offeredRent ?? property.rent_amount,
      offered_deposit: dto.offeredDeposit ?? property.security_deposit,
      message: dto.message ?? null,
    });

    await this.notify.send(property.listed_by_user_id, 'APPLICATION_SUBMITTED', {
      title: 'New application',
      body: `${user.fullName} applied for ${property.title}.`,
      actionUrl: '/dashboard/applications',
      severity: 'ACTION',
    });
    await this.audit.record({ actor: user, action: 'application.submitted', objectType: 'application', objectId: id, req });
    return { id, status: 'SUBMITTED' };
  }

  async myApplications(user: AuthUser) {
    return this.db.query(
      `SELECT a.id, a.public_id, a.status, a.move_in_date, a.tenure_months, a.offered_rent,
              a.created_at, a.decision_note,
              p.id AS property_id, p.slug, p.title, p.locality, p.city, p.rent_amount,
              (SELECT pi.storage_key FROM property_images pi WHERE pi.property_id = p.id
                ORDER BY pi.is_cover DESC LIMIT 1) AS cover_key,
              t.id AS tenancy_id, t.stage AS tenancy_stage
         FROM applications a
         JOIN properties p ON p.id = a.property_id
         LEFT JOIN tenancies t ON t.application_id = a.id
        WHERE a.tenant_user_id = ?
        ORDER BY a.created_at DESC`,
      [user.id],
    );
  }

  async receivedApplications(user: AuthUser, status?: string) {
    const where = ['p.listed_by_user_id = ?'];
    const params: unknown[] = [user.id];
    if (status) {
      where.push('a.status = ?');
      params.push(status);
    }
    return this.db.query(
      `SELECT a.id, a.public_id, a.status, a.occupants, a.household_type, a.move_in_date,
              a.tenure_months, a.offered_rent, a.offered_deposit, a.message, a.created_at,
              p.id AS property_id, p.title AS property_title, p.locality, p.city, p.rent_amount,
              u.full_name AS tenant_name, u.public_id AS tenant_public_id,
              tp.occupation, tp.employer,
              (SELECT k.status FROM kyc_records k WHERE k.user_id = u.id ORDER BY k.id DESC LIMIT 1) AS tenant_kyc
         FROM applications a
         JOIN properties p ON p.id = a.property_id
         JOIN users u ON u.id = a.tenant_user_id
         LEFT JOIN user_profiles tp ON tp.user_id = u.id
        WHERE ${where.join(' AND ')}
        ORDER BY a.created_at DESC`,
      params,
    );
  }

  /**
   * Accepting an application opens the transaction: it creates the tenancy,
   * opens a legal case, and moves the property out of the search index.
   */
  async decide(user: AuthUser, applicationId: number, dto: ApplicationDecisionDto, req?: Request) {
    const application = await this.db.one<any>(
      `SELECT a.*, p.listed_by_user_id, p.title, p.city, p.state, p.rent_amount, p.security_deposit,
              p.maintenance_amount, p.lock_in_months, p.notice_period_days, p.owner_id, p.id AS prop_id
         FROM applications a JOIN properties p ON p.id = a.property_id WHERE a.id = ?`,
      [applicationId],
    );
    if (!application) throw new NotFoundException('Application not found.');
    if (application.listed_by_user_id !== user.id && !user.permissions.includes('application.decide')) {
      throw new ForbiddenException('Only the lister can decide on this application.');
    }
    if (application.status !== 'SUBMITTED' && application.status !== 'UNDER_REVIEW' && application.status !== 'SHORTLISTED') {
      throw new BadRequestException('This application has already been decided.');
    }

    if (dto.decision === 'REJECT') {
      await this.db.update('applications', applicationId, {
        status: 'REJECTED', decided_by: user.id, decided_at: new Date(), decision_note: dto.note ?? null,
      });
      await this.notify.send(application.tenant_user_id, 'APPLICATION_ACCEPTED', {
        title: 'Application update',
        body: `The owner could not proceed with your application for ${application.title}.`,
        actionUrl: '/dashboard/applications',
      });
      await this.audit.record({ actor: user, action: 'application.rejected', objectType: 'application', objectId: applicationId, req });
      return { status: 'REJECTED' };
    }

    if (dto.decision === 'SHORTLIST') {
      await this.db.update('applications', applicationId, { status: 'SHORTLISTED' });
      return { status: 'SHORTLISTED' };
    }

    const result = await this.db.transaction(async (conn) => {
      await conn.execute(
        `UPDATE applications SET status = 'ACCEPTED', decided_by = ?, decided_at = NOW(), decision_note = ?
          WHERE id = ?`,
        [user.id, dto.note ?? null, applicationId],
      );
      await conn.execute(
        `UPDATE applications SET status = 'REJECTED', decision_note = 'Another applicant was selected.'
          WHERE property_id = ? AND id <> ? AND status IN ('SUBMITTED','UNDER_REVIEW','SHORTLISTED')`,
        [application.property_id, applicationId],
      );

      const tenancyPublicId = newPublicId();
      const [tenancyRes]: any = await conn.execute(
        `INSERT INTO tenancies (public_id, property_id, application_id, owner_user_id, tenant_user_id,
           stage, service_plan, rent_amount, deposit_amount, maintenance_amount, start_date,
           lock_in_months, notice_period_days)
         VALUES (?, ?, ?, ?, ?, 'LEGAL_REVIEW', ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenancyPublicId,
          application.property_id,
          applicationId,
          application.listed_by_user_id,
          application.tenant_user_id,
          dto.servicePlan ?? 'STANDARD',
          application.offered_rent ?? application.rent_amount,
          application.offered_deposit ?? application.security_deposit ?? 0,
          application.maintenance_amount,
          application.move_in_date,
          application.lock_in_months,
          application.notice_period_days,
        ],
      );
      const tenancyId = tenancyRes.insertId as number;

      const [seq]: any = await conn.execute('SELECT COUNT(*) AS c FROM legal_cases');
      const caseNumber = formatReference('LGL', (seq[0].c ?? 0) + 1);
      await conn.execute(
        `INSERT INTO legal_cases (public_id, case_number, tenancy_id, case_type, status, jurisdiction)
         VALUES (?, ?, ?, 'NEW_AGREEMENT', 'QUEUED', ?)`,
        [newPublicId(), caseNumber, tenancyId, application.state],
      );

      await conn.execute("UPDATE properties SET status = 'PAUSED' WHERE id = ?", [application.property_id]);
      await conn.execute(
        `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, actor_id)
         VALUES (?, ?, 'TENANT_SELECTED', 'Tenant selected', ?, ?)`,
        [application.property_id, tenancyId, `Application ${application.public_id} accepted`, user.id],
      );
      return { tenancyId, caseNumber };
    });

    await this.notify.send(application.tenant_user_id, 'APPLICATION_ACCEPTED', {
      title: 'Application accepted',
      body: `You have been selected for ${application.title}. Legal review starts next.`,
      actionUrl: '/dashboard/tenancy',
      severity: 'ACTION',
    });
    await this.audit.record({
      actor: user, action: 'application.accepted', objectType: 'application', objectId: applicationId,
      metadata: result, req,
    });
    return { status: 'ACCEPTED', ...result };
  }

  // --------------------------------------------------------------- tenancy
  async myTenancies(user: AuthUser) {
    return this.db.query(
      `SELECT t.id, t.public_id, t.stage, t.service_plan, t.rent_amount, t.deposit_amount,
              t.start_date, t.end_date, t.renewal_due_on, t.rent_due_day,
              p.id AS property_id, p.slug, p.title, p.locality, p.city,
              (SELECT pi.storage_key FROM property_images pi WHERE pi.property_id = p.id
                ORDER BY pi.is_cover DESC LIMIT 1) AS cover_key,
              own.full_name AS owner_name, ten.full_name AS tenant_name,
              (SELECT a.id FROM agreements a WHERE a.tenancy_id = t.id ORDER BY a.id DESC LIMIT 1) AS agreement_id,
              (SELECT a.status FROM agreements a WHERE a.tenancy_id = t.id ORDER BY a.id DESC LIMIT 1) AS agreement_status,
              (SELECT COUNT(*) FROM payments pay WHERE pay.tenancy_id = t.id AND pay.status = 'DUE') AS payments_due,
              (SELECT i.id FROM inspections i WHERE i.tenancy_id = t.id AND i.kind = 'CHECK_IN' LIMIT 1) AS checkin_id
         FROM tenancies t
         JOIN properties p ON p.id = t.property_id
         JOIN users own ON own.id = t.owner_user_id
         JOIN users ten ON ten.id = t.tenant_user_id
        WHERE t.tenant_user_id = ? OR t.owner_user_id = ?
        ORDER BY t.created_at DESC`,
      [user.id, user.id],
    );
  }

  async tenancyDetail(user: AuthUser, id: number) {
    const tenancy = await this.db.one<any>(
      `SELECT t.*, p.title, p.slug, p.locality, p.city, p.state, p.address_line1, p.pincode,
              own.full_name AS owner_name, own.email AS owner_email,
              ten.full_name AS tenant_name, ten.email AS tenant_email
         FROM tenancies t
         JOIN properties p ON p.id = t.property_id
         JOIN users own ON own.id = t.owner_user_id
         JOIN users ten ON ten.id = t.tenant_user_id
        WHERE t.id = ?`,
      [id],
    );
    if (!tenancy) throw new NotFoundException('Tenancy not found.');
    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('legal.case.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('This tenancy belongs to other parties.');
    }

    const [agreement, payments, meetings, inspections, legalCase, timeline] = await Promise.all([
      this.db.one(
        `SELECT id, public_id, agreement_number, status, current_version, effective_from, effective_to,
                stamp_duty_status, approved_at, executed_at
           FROM agreements WHERE tenancy_id = ? ORDER BY id DESC LIMIT 1`, [id]),
      this.db.query(
        `SELECT id, reference_code, purpose, total_amount, status, due_date, paid_at
           FROM payments WHERE tenancy_id = ? ORDER BY due_date, id`, [id]),
      this.db.query(
        `SELECT id, public_id, purpose, scheduled_for, duration_min, status, provider
           FROM legal_meetings WHERE tenancy_id = ? ORDER BY scheduled_for DESC`, [id]),
      this.db.query(
        `SELECT id, report_number, kind, status, submitted_at, owner_ack_at, tenant_ack_at
           FROM inspections WHERE tenancy_id = ? ORDER BY created_at DESC`, [id]),
      this.db.one(
        `SELECT id, case_number, status, assigned_to, jurisdiction FROM legal_cases
          WHERE tenancy_id = ? ORDER BY id DESC LIMIT 1`, [id]),
      this.db.query(
        `SELECT event_code, title, detail, occurred_at FROM property_timeline
          WHERE tenancy_id = ? ORDER BY occurred_at DESC`, [id]),
    ]);

    return { tenancy, agreement, payments, meetings, inspections, legalCase, timeline, nextAction: this.nextAction(tenancy, agreement, payments, inspections) };
  }

  /** Powers the "what happens next / who needs to act" panel. */
  private nextAction(tenancy: any, agreement: any, payments: any[], inspections: any[]) {
    switch (tenancy.stage) {
      case 'LEGAL_REVIEW':
        return { actor: 'ODIBRICK_LEGAL', label: 'Our legal team is reviewing both parties\u2019 documents.' };
      case 'CONSULTATION':
        return { actor: 'BOTH', label: 'Attend the scheduled legal consultation.' };
      case 'AGREEMENT_DRAFT':
        return { actor: 'ODIBRICK_LEGAL', label: 'Agreement is being drafted for legal approval.' };
      case 'AWAITING_SIGNATURES':
        return { actor: 'BOTH', label: `Sign agreement ${agreement?.agreement_number ?? ''}.` };
      case 'AWAITING_PAYMENT': {
        const due = payments.find((p) => p.status === 'DUE');
        return { actor: 'TENANT', label: due ? `Pay ${due.purpose.replace('_', ' ').toLowerCase()} of INR ${due.total_amount}.` : 'Complete the pending payment.' };
      }
      case 'CHECK_IN_PENDING':
        return { actor: 'TENANT', label: 'Record the Day 1 condition report within 72 hours of moving in.' };
      case 'ACTIVE': {
        const pendingAck = inspections.find((i) => i.status === 'SUBMITTED' || i.status === 'OWNER_REVIEW');
        if (pendingAck) return { actor: 'OWNER', label: 'Review and acknowledge the condition report.' };
        return { actor: 'NONE', label: 'Nothing pending. Rent reminders are automatic.' };
      }
      case 'RENEWAL_DUE':
        return { actor: 'BOTH', label: 'Confirm renewal terms before the current term ends.' };
      case 'MOVE_OUT':
        return { actor: 'TENANT', label: 'Complete the move-out condition report.' };
      default:
        return { actor: 'NONE', label: 'This tenancy is closed.' };
    }
  }

  private async activeProperty(id: number) {
    const property = await this.db.one<any>(
      "SELECT * FROM properties WHERE id = ? AND status = 'ACTIVE' AND deleted_at IS NULL", [id],
    );
    if (!property) throw new NotFoundException('That listing is no longer accepting enquiries.');
    return property;
  }
}
