import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { newPublicId, formatReference } from '../../common/util/ids';
import { pageParams, paginate } from '../../common/util/pagination';
import {
  AcceptSettlementDto, AdminApplicationDecideDto, AdminTenancyOverrideDto, ApplicationDecisionDto,
  ConfirmMoveOutDto, ConfirmRenewalDto, CreateApplicationDto, CreateEnquiryDto,
  CreateViewingDto, DisputeSettlementDto, ProposeRenewalDto, ProposeSettlementDto, RequestMoveOutDto,
} from './rental.dto';

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
      move_in_date: dto.moveInDate ? dto.moveInDate.split('T')[0] : null,
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

    const [agreements, payments, meetings, inspections, legalCases, timeline, maintenance, disputes] = await Promise.all([
      this.db.query(
        `SELECT id, public_id, agreement_number, agreement_type, status, current_version, effective_from, effective_to,
                stamp_duty_status, approved_at, executed_at
           FROM agreements WHERE tenancy_id = ? ORDER BY id DESC`, [id]),
      this.db.query(
        `SELECT id, reference_code, purpose, total_amount, status, due_date, paid_at
           FROM payments WHERE tenancy_id = ? ORDER BY due_date, id`, [id]),
      this.db.query(
        `SELECT id, public_id, purpose, scheduled_for, duration_min, status, provider
           FROM legal_meetings WHERE tenancy_id = ? ORDER BY scheduled_for DESC`, [id]),
      this.db.query(
        `SELECT id, report_number, kind, status, submitted_at, owner_ack_at, tenant_ack_at,
                (SELECT COUNT(*) FROM inspection_media im WHERE im.inspection_id = inspections.id) AS media_count
           FROM inspections WHERE tenancy_id = ? ORDER BY created_at DESC`, [id]),
      this.db.query(
        `SELECT id, case_number, case_type, status, assigned_to, jurisdiction FROM legal_cases
          WHERE tenancy_id = ? ORDER BY id DESC`, [id]),
      this.db.query(
        `SELECT event_code, title, detail, occurred_at FROM property_timeline
          WHERE tenancy_id = ? ORDER BY occurred_at DESC`, [id]),
      this.db.query(
        `SELECT id, ticket_number, title, status, priority, category, created_at
           FROM maintenance_requests WHERE tenancy_id = ? ORDER BY created_at DESC`, [id]),
      this.db.query(
        `SELECT id, case_number, category, amount_claimed, summary, status, resolution, created_at
           FROM disputes WHERE tenancy_id = ? ORDER BY created_at DESC`, [id]),
    ]);

    const agreement = agreements[0] ?? null;
    const legalCase = legalCases[0] ?? null;

    // Find latest renewal proposal if any
    const latestRenewalEvent = timeline.find((t: any) => t.event_code === 'RENEWAL' && t.title === 'Lease renewal proposed');
    let renewalProposal: any = null;
    if (latestRenewalEvent) {
      try {
        renewalProposal = JSON.parse(latestRenewalEvent.detail);
      } catch {
        renewalProposal = null;
      }
    }

    // Find latest move-out notice if any
    const latestMoveOutEvent = timeline.find(
      (t: any) => t.event_code === 'MOVE_OUT_REPORT' && (t.title.includes('Move-out notice') || t.title.includes('move-out notice'))
    );
    let moveOutNotice: any = null;
    if (latestMoveOutEvent) {
      try {
        moveOutNotice = {
          title: latestMoveOutEvent.title,
          ...JSON.parse(latestMoveOutEvent.detail),
        };
      } catch {
        moveOutNotice = { title: latestMoveOutEvent.title };
      }
    }

    // Find latest settlement proposal if any
    const latestSettlementEvent = timeline.find(
      (t: any) => t.event_code === 'MOVE_OUT_REPORT' && (t.title.includes('settlement') || t.title.includes('Settlement'))
    );
    let settlementProposal: any = null;
    if (latestSettlementEvent) {
      try {
        settlementProposal = {
          title: latestSettlementEvent.title,
          ...JSON.parse(latestSettlementEvent.detail),
        };
      } catch {
        settlementProposal = null;
      }
    }

    return {
      tenancy,
      agreement,
      agreements,
      payments,
      meetings,
      inspections,
      legalCase,
      legalCases,
      timeline,
      maintenance,
      disputes,
      renewalProposal,
      moveOutNotice,
      settlementProposal,
      nextAction: this.nextAction(
        tenancy,
        agreement,
        payments,
        inspections,
        maintenance,
        renewalProposal,
        legalCase,
        timeline,
        disputes,
        settlementProposal,
      ),
    };
  }

  /**
   * Dynamic Tenancy Financial Position & Balance Sheet
   * Calculates real-time financial standing from payments, transactions, agreements, maintenance, and disputes.
   */
  async tenancyFinancialSummary(user: AuthUser, id: number) {
    const tenancy = await this.db.one<any>(
      `SELECT t.*, p.title AS property_title, p.slug AS property_slug, p.locality, p.city, p.state, p.address_line1,
              own.id AS owner_id, own.full_name AS owner_name, own.email AS owner_email,
              ten.id AS tenant_id, ten.full_name AS tenant_name, ten.email AS tenant_email
         FROM tenancies t
         JOIN properties p ON p.id = t.property_id
         JOIN users own ON own.id = t.owner_user_id
         JOIN users ten ON ten.id = t.tenant_user_id
        WHERE t.id = ?`,
      [id],
    );
    if (!tenancy) throw new NotFoundException('Tenancy not found.');

    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    const isManagement =
      user.roles?.includes('SUPER_ADMIN') ||
      user.roles?.includes('ADMIN') ||
      user.permissions?.includes('tenancy.manage') ||
      user.permissions?.includes('user.manage') ||
      user.permissions?.includes('payment.manage') ||
      user.permissions?.includes('legal.case.manage');

    if (!isParty && !isManagement) {
      throw new ForbiddenException('You are not authorized to view the financial position of this tenancy.');
    }

    const [payments, transactions, agreements, maintenanceRequests, disputes, timeline] = await Promise.all([
      this.db.query(
        `SELECT p.id, p.public_id, p.reference_code, p.purpose, p.amount, p.tax_amount, p.total_amount, p.currency,
                p.status, p.settlement_status, p.settlement_mode, p.due_date, p.paid_at, p.settled_at, p.notes, p.created_at,
                p.payer_user_id, payer.full_name AS payer_name, payer.email AS payer_email,
                p.payee_user_id, payee.full_name AS payee_name, payee.email AS payee_email,
                (SELECT pt.txn_reference FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS txn_reference,
                (SELECT pt.provider FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS provider,
                (SELECT pt.method FROM payment_transactions pt WHERE pt.payment_id = p.id ORDER BY pt.id DESC LIMIT 1) AS method
           FROM payments p
           JOIN users payer ON payer.id = p.payer_user_id
           LEFT JOIN users payee ON payee.id = p.payee_user_id
          WHERE p.tenancy_id = ?
          ORDER BY p.due_date ASC, p.id ASC`,
        [id],
      ),
      this.db.query(
        `SELECT pt.id, pt.payment_id, pt.txn_reference, pt.direction, pt.provider, pt.method,
                pt.amount, pt.currency, pt.status, pt.occurred_at,
                p.reference_code AS payment_reference, p.purpose
           FROM payment_transactions pt
           JOIN payments p ON p.id = pt.payment_id
          WHERE p.tenancy_id = ?
          ORDER BY pt.occurred_at DESC`,
        [id],
      ),
      this.db.query(
        `SELECT id, public_id, agreement_number, agreement_type, status, current_version, effective_from, effective_to,
                approved_at, executed_at
           FROM agreements
          WHERE tenancy_id = ?
          ORDER BY id ASC`,
        [id],
      ),
      this.db.query(
        `SELECT id, ticket_number, title, status, priority, category, cost_bearer, estimated_cost, final_cost, created_at
           FROM maintenance_requests
          WHERE tenancy_id = ?
          ORDER BY created_at DESC`,
        [id],
      ),
      this.db.query(
        `SELECT id, case_number, category, amount_claimed, summary, status, resolution, created_at
           FROM disputes
          WHERE tenancy_id = ?
          ORDER BY created_at DESC`,
        [id],
      ),
      this.db.query(
        `SELECT id, event_code, title, detail, occurred_at
           FROM property_timeline
          WHERE tenancy_id = ?
          ORDER BY occurred_at DESC`,
        [id],
      ),
    ]);

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // 1. Rent position calculations
    const rentPayments = payments.filter((p: any) => p.purpose === 'MONTHLY_RENT');
    const advanceRentPayments = payments.filter((p: any) => p.purpose === 'ADVANCE_RENT');

    const totalRentAccrued = rentPayments.reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const totalRentPaid = rentPayments
      .filter((p: any) => p.status === 'PAID')
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const outstandingRent = rentPayments
      .filter((p: any) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const overdueRentList = rentPayments.filter(
      (p: any) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status) && p.due_date && p.due_date.toString().slice(0, 10) < todayStr,
    );
    const overdueRent = overdueRentList.reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const overdueRentCount = overdueRentList.length;

    const advanceRentPaid = advanceRentPayments
      .filter((p: any) => p.status === 'PAID')
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const advanceRentOutstanding = advanceRentPayments
      .filter((p: any) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    const rentSchedule = rentPayments.map((p: any) => {
      let daysOverdue = 0;
      let isOverdue = false;
      const dueDateStr = p.due_date ? p.due_date.toString().slice(0, 10) : '';
      if (['DUE', 'INITIATED', 'PROCESSING'].includes(p.status) && dueDateStr && dueDateStr < todayStr) {
        isOverdue = true;
        const diffMs = now.getTime() - new Date(dueDateStr).getTime();
        daysOverdue = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
      }
      return {
        id: p.id,
        referenceCode: p.reference_code,
        periodName: p.notes || `Rent due ${dueDateStr}`,
        amount: Number(p.amount),
        totalAmount: Number(p.total_amount),
        status: p.status,
        settlementStatus: p.settlement_status,
        dueDate: p.due_date,
        paidAt: p.paid_at,
        daysOverdue,
        isOverdue,
        notes: p.notes,
      };
    });

    // 2. Deposit position calculations
    const depositRequired = Number(tenancy.deposit_amount);
    const depositPayments = payments.filter((p: any) => p.purpose === 'SECURITY_DEPOSIT');
    const depositPaid = depositPayments
      .filter((p: any) => p.status === 'PAID')
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    const refundPayments = payments.filter((p: any) => p.purpose === 'REFUND');
    const depositRefundDue = refundPayments
      .filter((p: any) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const depositRefundPaid = refundPayments
      .filter((p: any) => p.status === 'PAID')
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    // Find move-out settlement details from timeline
    const settlementEvent = timeline.find(
      (t: any) =>
        t.event_code === 'MOVE_OUT_REPORT' &&
        (t.title.includes('settlement accepted') || t.title.includes('settlement proposed') || t.title.includes('Settlement')),
    );
    let deductionsList: any[] = [];
    let deductionsTotal = 0;
    if (settlementEvent) {
      try {
        const parsed = JSON.parse(settlementEvent.detail);
        if (Array.isArray(parsed.deductions)) {
          deductionsList = parsed.deductions;
        }
        deductionsTotal = Number(parsed.totalDeductions ?? 0);
      } catch {}
    }

    let depositHeld = depositPaid;
    if (tenancy.stage === 'MOVE_OUT') {
      depositHeld = Math.max(0, depositPaid - deductionsTotal);
    } else if (tenancy.stage === 'CLOSED') {
      depositHeld = Math.max(0, depositPaid - deductionsTotal - depositRefundPaid);
    }

    let refundStatus = 'NOT_APPLICABLE';
    let refundPaymentId: number | undefined;
    let refundReferenceCode: string | undefined;
    if (refundPayments.length > 0) {
      const latestRefund = refundPayments[refundPayments.length - 1];
      refundStatus = latestRefund.status;
      refundPaymentId = latestRefund.id;
      refundReferenceCode = latestRefund.reference_code;
    } else if (tenancy.stage === 'CLOSED' || (settlementEvent && deductionsTotal === depositPaid)) {
      refundStatus = 'ZERO_REFUND';
    }

    // 3. Maintenance calculations
    const completedMaint = maintenanceRequests.filter((m: any) => ['COMPLETED', 'RESOLVED'].includes(m.status));
    const ownerBorneMaint = completedMaint
      .filter((m: any) => m.cost_bearer === 'OWNER')
      .reduce((sum: number, m: any) => sum + Number(m.final_cost ?? 0), 0);
    const tenantBorneMaint = completedMaint
      .filter((m: any) => m.cost_bearer === 'TENANT')
      .reduce((sum: number, m: any) => sum + Number(m.final_cost ?? 0), 0);
    const sharedMaint = completedMaint
      .filter((m: any) => m.cost_bearer === 'SHARED')
      .reduce((sum: number, m: any) => sum + Number(m.final_cost ?? 0), 0);

    const maintPayments = payments.filter((p: any) => p.purpose === 'MAINTENANCE');
    const maintenanceCharges = maintPayments.reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const maintenancePaid = maintPayments
      .filter((p: any) => p.status === 'PAID')
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const maintenanceOutstanding = maintPayments
      .filter((p: any) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    // 4. Other Adjustments
    const otherPaymentsList = payments.filter(
      (p: any) => !['MONTHLY_RENT', 'SECURITY_DEPOSIT', 'ADVANCE_RENT', 'REFUND', 'MAINTENANCE'].includes(p.purpose),
    );
    const otherCharges = otherPaymentsList.reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const otherPaid = otherPaymentsList
      .filter((p: any) => p.status === 'PAID')
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const otherOutstanding = otherPaymentsList
      .filter((p: any) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    const adjustments = otherPaymentsList.map((p: any) => {
      const linkedDispute = disputes.find((d: any) => d.case_number && p.notes && p.notes.includes(d.case_number));
      return {
        id: p.id,
        referenceCode: p.reference_code,
        purpose: p.purpose,
        amount: Number(p.amount),
        totalAmount: Number(p.total_amount),
        status: p.status,
        settlementStatus: p.settlement_status,
        payerName: p.payer_name,
        payeeName: p.payee_name || 'Odibrick',
        dueDate: p.due_date,
        paidAt: p.paid_at,
        notes: p.notes,
        disputeId: linkedDispute?.id,
        disputeCaseNumber: linkedDispute?.case_number,
      };
    });

    // 5. Net Summary
    const totalOutstanding = payments
      .filter((p: any) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    const netTenantLiability = payments
      .filter(
        (p: any) =>
          p.payer_user_id === tenancy.tenant_user_id && ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status),
      )
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    const netOwnerReceivable = payments
      .filter(
        (p: any) =>
          p.payee_user_id === tenancy.owner_user_id && ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status),
      )
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    return {
      tenancyId: tenancy.id,
      publicId: tenancy.public_id,
      stage: tenancy.stage,
      currency: 'INR',
      rentAmount: Number(tenancy.rent_amount),
      depositAmount: Number(tenancy.deposit_amount),
      maintenanceAmount: tenancy.maintenance_amount ? Number(tenancy.maintenance_amount) : undefined,
      rentDueDay: tenancy.rent_due_day || 5,
      startDate: tenancy.start_date,
      endDate: tenancy.end_date,
      renewalDueOn: tenancy.renewal_due_on,
      closedAt: tenancy.closed_at,

      parties: {
        owner: { id: tenancy.owner_id, fullName: tenancy.owner_name, email: tenancy.owner_email },
        tenant: { id: tenancy.tenant_id, fullName: tenancy.tenant_name, email: tenancy.tenant_email },
      },

      property: {
        id: tenancy.property_id,
        title: tenancy.property_title,
        slug: tenancy.property_slug,
        locality: tenancy.locality,
        city: tenancy.city,
      },

      summary: {
        totalRentAccrued,
        totalRentPaid,
        outstandingRent,
        overdueRent,
        overdueRentCount,

        securityDepositRequired: depositRequired,
        securityDepositPaid: depositPaid,
        securityDepositHeld: depositHeld,

        depositDeductions: deductionsTotal,
        depositRefundDue,
        depositRefundPaid,
        refundStatus,

        advanceRentPaid,
        advanceRentOutstanding,

        maintenanceCharges,
        maintenancePaid,
        maintenanceOutstanding,

        otherCharges,
        otherPayments: otherPaid,
        otherOutstanding,

        totalOutstanding,
        netTenantLiability,
        netOwnerReceivable,
      },

      rent: {
        monthlyRent: Number(tenancy.rent_amount),
        rentDueDay: tenancy.rent_due_day || 5,
        totalAccrued: totalRentAccrued,
        totalPaid: totalRentPaid,
        outstanding: outstandingRent,
        overdue: overdueRent,
        overdueCount: overdueRentCount,
        schedule: rentSchedule,
      },

      deposit: {
        required: depositRequired,
        paid: depositPaid,
        held: depositHeld,
        deductionsTotal,
        deductions: deductionsList,
        refundDue: depositRefundDue,
        refundPaid: depositRefundPaid,
        refundStatus,
        refundPaymentId,
        refundReferenceCode,
      },

      maintenance: {
        ownerBorne: ownerBorneMaint,
        tenantBorne: tenantBorneMaint,
        shared: sharedMaint,
        obligationsTotal: maintenanceCharges,
        obligationsPaid: maintenancePaid,
        obligationsOutstanding: maintenanceOutstanding,
        tickets: maintenanceRequests.map((m: any) => ({
          id: m.id,
          ticketNumber: m.ticket_number,
          title: m.title,
          status: m.status,
          costBearer: m.cost_bearer,
          estimatedCost: m.estimated_cost ? Number(m.estimated_cost) : undefined,
          finalCost: m.final_cost ? Number(m.final_cost) : undefined,
          createdAt: m.created_at,
        })),
      },

      adjustments,

      payments: payments.map((p: any) => ({
        id: p.id,
        publicId: p.public_id,
        referenceCode: p.reference_code,
        purpose: p.purpose,
        amount: Number(p.amount),
        taxAmount: Number(p.tax_amount),
        totalAmount: Number(p.total_amount),
        currency: p.currency,
        status: p.status,
        settlementStatus: p.settlement_status,
        settlementMode: p.settlement_mode,
        dueDate: p.due_date,
        paidAt: p.paid_at,
        notes: p.notes,
        payerId: p.payer_user_id,
        payerName: p.payer_name,
        payeeId: p.payee_user_id,
        payeeName: p.payee_name,
        txnReference: p.txn_reference,
        method: p.method,
        provider: p.provider,
      })),

      transactions: transactions.map((t: any) => ({
        id: t.id,
        paymentId: t.payment_id,
        paymentReference: t.payment_reference,
        purpose: t.purpose,
        txnReference: t.txn_reference,
        direction: t.direction,
        provider: t.provider,
        method: t.method,
        amount: Number(t.amount),
        currency: t.currency,
        status: t.status,
        occurredAt: t.occurred_at,
      })),

      timeline: timeline.map((tl: any) => ({
        eventCode: tl.event_code,
        title: tl.title,
        detail: tl.detail,
        occurredAt: tl.occurred_at,
      })),
    };
  }

  /** Powers the "what happens next / who needs to act" panel. */
  private nextAction(
    tenancy: any,
    agreement: any,
    payments: any[],
    inspections: any[],
    maintenance: any[] = [],
    renewalProposal?: any,
    legalCase?: any,
    timeline: any[] = [],
    disputes: any[] = [],
    settlementProposal?: any,
  ) {
    switch (tenancy.stage) {
      case 'LEGAL_REVIEW':
        return { actor: 'ODIBRICK_LEGAL', label: 'Our legal team is reviewing both parties’ documents.' };
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

        const dueRent = payments.find((p) => ['DUE', 'INITIATED'].includes(p.status) && ['MONTHLY_RENT', 'ADVANCE_RENT'].includes(p.purpose));
        if (dueRent) {
          const isOverdue = dueRent.due_date && new Date(dueRent.due_date) < new Date();
          const periodName = dueRent.notes ? dueRent.notes.split('(')[0].trim() : 'monthly rent';
          return {
            actor: 'TENANT',
            label: isOverdue
              ? `Overdue: Pay ${periodName} of INR ${Number(dueRent.total_amount).toLocaleString('en-IN')}.`
              : `Pay ${periodName} of INR ${Number(dueRent.total_amount).toLocaleString('en-IN')}.`,
          };
        }

        // Check for active maintenance requests
        const pendingMntReview = maintenance.find((m) => ['OPEN', 'OWNER_REVIEW'].includes(m.status));
        if (pendingMntReview) {
          return { actor: 'OWNER', label: `Review maintenance request ${pendingMntReview.ticket_number} (${pendingMntReview.title}).` };
        }

        const pendingMntConfirmation = maintenance.find((m) => m.status === 'COMPLETED');
        if (pendingMntConfirmation) {
          return { actor: 'TENANT', label: `Confirm resolution of maintenance ${pendingMntConfirmation.ticket_number}.` };
        }

        const inProgressMnt = maintenance.find((m) => ['APPROVED', 'SCHEDULED', 'IN_PROGRESS'].includes(m.status));
        if (inProgressMnt) {
          return { actor: 'NONE', label: `Maintenance ${inProgressMnt.ticket_number} is in progress.` };
        }

        const recentPaidRent = payments.find((p) => p.status === 'PAID' && p.purpose === 'MONTHLY_RENT');
        if (recentPaidRent) {
          const periodName = recentPaidRent.notes ? recentPaidRent.notes.split('(')[0].trim() : 'Monthly rent';
          return { actor: 'NONE', label: `${periodName} is paid. Rent reminders are automatic.` };
        }

        return { actor: 'NONE', label: 'Rental is active. Rent reminders are automatic.' };
      }
      case 'RENEWAL_DUE': {
        if (legalCase && legalCase.case_type === 'RENEWAL' && !['EXECUTED', 'CLOSED', 'REJECTED'].includes(legalCase.status)) {
          if (legalCase.status === 'APPROVED' || agreement?.status === 'AWAITING_SIGNATURES') {
            return { actor: 'BOTH', label: `Sign renewal agreement ${agreement?.agreement_number ?? ''}.` };
          }
          return { actor: 'ODIBRICK_LEGAL', label: `Renewal agreement is under legal review (Case ${legalCase.case_number}).` };
        }
        if (renewalProposal) {
          return {
            actor: renewalProposal.proposerRole === 'OWNER' ? 'TENANT' : 'OWNER',
            label: `Review and confirm renewal terms proposed by ${renewalProposal.proposerRole?.toLowerCase()} (INR ${Number(renewalProposal.proposedRent).toLocaleString('en-IN')}/mo).`,
          };
        }
        return { actor: 'BOTH', label: 'Renewal decision required. Confirm renewal terms before expiry.' };
      }
      case 'MOVE_OUT': {
        // 1. Move-out notice confirmation
        const noticeConfirmed = timeline.some((t: any) => t.event_code === 'MOVE_OUT_REPORT' && t.title === 'Move-out notice confirmed');
        const noticeReq = timeline.find((t: any) => t.event_code === 'MOVE_OUT_REPORT' && t.title === 'Move-out notice requested');
        if (!noticeConfirmed && noticeReq) {
          let notice: any = {};
          try { notice = JSON.parse(noticeReq.detail); } catch {}
          const reqRole = notice.initiatorRole ?? 'TENANT';
          return {
            actor: reqRole === 'TENANT' ? 'OWNER' : 'TENANT',
            label: `Review and confirm the move-out notice (${notice.requestedDate ? notice.requestedDate : 'requested'}).`,
          };
        }

        // 2. Open refund payment due
        const dueRefund = payments.find((p) => p.purpose === 'REFUND' && p.status !== 'PAID');
        if (dueRefund) {
          return {
            actor: 'OWNER',
            label: `Security deposit refund of INR ${Number(dueRefund.total_amount).toLocaleString('en-IN')} is due to the tenant.`,
          };
        }

        // 3. Dispute check
        const activeDispute = disputes.find((d: any) => ['OPEN', 'EVIDENCE_SUBMITTED', 'UNDER_REVIEW', 'LEGAL_REVIEW'].includes(d.status));
        if (activeDispute) {
          return {
            actor: 'ODIBRICK_LEGAL',
            label: `Deposit settlement dispute ${activeDispute.case_number} is under review.`,
          };
        }

        // 4. Settlement review (if proposed)
        if (settlementProposal && settlementProposal.status === 'PROPOSED') {
          const isOwnerProposer = settlementProposal.proposedBy === tenancy.owner_user_id;
          return {
            actor: isOwnerProposer ? 'TENANT' : 'OWNER',
            label: `Review and accept the proposed deposit settlement (Refund: INR ${Number(settlementProposal.refundAmount).toLocaleString('en-IN')}).`,
          };
        }

        // 5. Move-out inspection condition report
        const moveOutInspection = inspections.find((i: any) => i.kind === 'MOVE_OUT');
        if (!moveOutInspection || moveOutInspection.status === 'DRAFT') {
          return {
            actor: 'TENANT',
            label: 'Complete and submit the move-out condition report.',
          };
        }

        return {
          actor: 'OWNER',
          label: 'Assess move-out condition and propose security deposit settlement.',
        };
      }
      case 'CLOSED':
        return { actor: 'NONE', label: 'Tenancy closed. Final settlement record preserved.' };
      default:
        return { actor: 'NONE', label: 'This tenancy is closed.' };
    }
  }

  // --------------------------------------------------------------- renewals
  async proposeRenewal(user: AuthUser, tenancyId: number, dto: ProposeRenewalDto, req?: Request) {
    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    if (!tenancy) throw new NotFoundException('Tenancy not found.');
    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('legal.case.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You are not authorized to propose renewal for this tenancy.');
    }
    if (!['ACTIVE', 'RENEWAL_DUE'].includes(tenancy.stage)) {
      throw new BadRequestException('Renewal can only be initiated for an active tenancy.');
    }

    const activeRenewalCase = await this.db.one<any>(
      `SELECT id, case_number, status FROM legal_cases 
        WHERE tenancy_id = ? AND case_type = 'RENEWAL' AND status NOT IN ('EXECUTED', 'CLOSED', 'REJECTED')
        LIMIT 1`,
      [tenancyId],
    );
    if (activeRenewalCase) {
      throw new BadRequestException(`A renewal case (${activeRenewalCase.case_number}) is already in progress.`);
    }

    const originalAgreement = await this.db.one<any>(
      `SELECT * FROM agreements WHERE tenancy_id = ? AND status = 'EXECUTED' ORDER BY id DESC LIMIT 1`,
      [tenancyId],
    );
    if (!originalAgreement) {
      throw new BadRequestException('The current agreement must be executed before renewing.');
    }

    const proposedRent = dto.proposedRent ?? Number(tenancy.rent_amount);
    
    let baseStartDate = originalAgreement.effective_to ? new Date(originalAgreement.effective_to) : (tenancy.end_date ? new Date(tenancy.end_date) : new Date());
    baseStartDate.setDate(baseStartDate.getDate() + 1);
    const defaultStartStr = baseStartDate.toISOString().slice(0, 10);
    const startDate = dto.proposedStartDate ?? defaultStartStr;

    const months = dto.tenureMonths ?? 11;
    let baseEndDate = new Date(startDate);
    baseEndDate.setMonth(baseEndDate.getMonth() + months);
    baseEndDate.setDate(baseEndDate.getDate() - 1);
    const defaultEndStr = baseEndDate.toISOString().slice(0, 10);
    const endDate = dto.proposedEndDate ?? defaultEndStr;

    const proposalData = {
      proposedRent,
      proposedStartDate: startDate,
      proposedEndDate: endDate,
      tenureMonths: months,
      proposedBy: user.id,
      proposerRole: user.id === tenancy.owner_user_id ? 'OWNER' : 'TENANT',
      notes: dto.notes ?? null,
      proposedAt: new Date().toISOString(),
    };

    await this.db.update('tenancies', tenancyId, { stage: 'RENEWAL_DUE' });

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'RENEWAL',
      title: 'Lease renewal proposed',
      detail: JSON.stringify(proposalData),
      actor_id: user.id,
    });

    const recipientUserId = user.id === tenancy.owner_user_id ? tenancy.tenant_user_id : tenancy.owner_user_id;
    await this.notify.send(recipientUserId, 'RENEWAL_DUE', {
      title: 'Lease renewal proposal received',
      body: `${user.fullName} proposed lease renewal at INR ${proposedRent.toLocaleString('en-IN')}/mo from ${startDate} to ${endDate}. Review and confirm to proceed.`,
      actionUrl: `/dashboard/tenancy/${tenancyId}`,
      severity: 'ACTION',
    });

    await this.audit.record({
      actor: user,
      action: 'tenancy.renewal_proposed',
      objectType: 'tenancy',
      objectId: tenancyId,
      metadata: proposalData,
      req,
    });

    return { status: 'PROPOSED', proposal: proposalData };
  }

  async confirmRenewal(user: AuthUser, tenancyId: number, dto: ConfirmRenewalDto, req?: Request) {
    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    if (!tenancy) throw new NotFoundException('Tenancy not found.');
    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('legal.case.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You are not authorized to confirm renewal for this tenancy.');
    }
    if (!['ACTIVE', 'RENEWAL_DUE'].includes(tenancy.stage)) {
      throw new BadRequestException('Renewal can only be confirmed for an active tenancy.');
    }

    const activeRenewalCase = await this.db.one<any>(
      `SELECT id, case_number, status FROM legal_cases 
        WHERE tenancy_id = ? AND case_type = 'RENEWAL' AND status NOT IN ('EXECUTED', 'CLOSED', 'REJECTED')
        LIMIT 1`,
      [tenancyId],
    );
    if (activeRenewalCase) {
      throw new BadRequestException(`A renewal case (${activeRenewalCase.case_number}) is already in progress.`);
    }

    const latestProposalEvent = await this.db.one<any>(
      `SELECT * FROM property_timeline 
        WHERE tenancy_id = ? AND event_code = 'RENEWAL' AND title = 'Lease renewal proposed'
        ORDER BY id DESC LIMIT 1`,
      [tenancyId],
    );
    if (!latestProposalEvent) {
      throw new BadRequestException('No pending renewal proposal found to confirm.');
    }

    let proposal: any = {};
    try {
      proposal = JSON.parse(latestProposalEvent.detail);
    } catch {
      proposal = {};
    }

    if (proposal.proposedBy === user.id && !user.permissions.includes('legal.case.manage') && !user.permissions.includes('user.manage')) {
      throw new BadRequestException('The counterparty must review and confirm the proposed renewal terms.');
    }

    const property = await this.db.one<any>('SELECT * FROM properties WHERE id = ?', [tenancy.property_id]);

    const result = await this.db.transaction(async (conn) => {
      const [seq]: any = await conn.execute('SELECT COUNT(*) AS c FROM legal_cases');
      const caseNumber = formatReference('LGL', (seq[0].c ?? 0) + 1);
      const casePublicId = newPublicId();

      const [caseRes]: any = await conn.execute(
        `INSERT INTO legal_cases (public_id, case_number, tenancy_id, case_type, status, jurisdiction, priority)
         VALUES (?, ?, ?, 'RENEWAL', 'QUEUED', ?, 'NORMAL')`,
        [casePublicId, caseNumber, tenancyId, property?.state ?? 'Karnataka'],
      );
      const caseId = caseRes.insertId as number;

      await conn.execute(
        `INSERT INTO legal_notes (legal_case_id, author_id, visibility, body)
         VALUES (?, ?, 'PARTIES', ?)`,
        [
          caseId,
          user.id,
          `Renewal terms confirmed by both parties:\n- Proposed Rent: INR ${proposal.proposedRent ?? tenancy.rent_amount}\n- Start Date: ${proposal.proposedStartDate}\n- End Date: ${proposal.proposedEndDate}\n- Notes: ${dto.notes || proposal.notes || 'None'}`,
        ],
      );

      await conn.execute(
        `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, actor_id)
         VALUES (?, ?, 'RENEWAL', 'Renewal terms confirmed', ?, ?)`,
        [
          tenancy.property_id,
          tenancyId,
          `Both parties agreed to renewal terms. Renewal legal case ${caseNumber} created.`,
          user.id,
        ],
      );

      return { caseId, caseNumber };
    });

    await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'RENEWAL_DUE', {
      title: 'Renewal terms confirmed',
      body: `Renewal terms confirmed. Legal case ${result.caseNumber} is now queued for legal drafting.`,
      actionUrl: `/dashboard/tenancy/${tenancyId}`,
      severity: 'INFO',
    });

    await this.audit.record({
      actor: user,
      action: 'tenancy.renewal_confirmed',
      objectType: 'tenancy',
      objectId: tenancyId,
      metadata: { caseId: result.caseId, caseNumber: result.caseNumber, proposal },
      req,
    });

    return { status: 'CONFIRMED', caseNumber: result.caseNumber, caseId: result.caseId };
  }

  // -------------------------------------------------------------- move out
  async requestMoveOut(user: AuthUser, tenancyId: number, dto: RequestMoveOutDto, req?: Request) {
    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    if (!tenancy) throw new NotFoundException('Tenancy not found.');
    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('tenancy.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You are not authorized to request move-out for this tenancy.');
    }
    if (tenancy.stage !== 'ACTIVE') {
      throw new BadRequestException('Move-out notice can only be initiated for an active tenancy.');
    }

    const activeRenewalCase = await this.db.one<any>(
      `SELECT id, case_number, status FROM legal_cases 
        WHERE tenancy_id = ? AND case_type = 'RENEWAL' AND status NOT IN ('EXECUTED', 'CLOSED', 'REJECTED')
        LIMIT 1`,
      [tenancyId],
    );
    if (activeRenewalCase) {
      throw new BadRequestException(`Cannot initiate move-out while a lease renewal (Case ${activeRenewalCase.case_number}) is in progress.`);
    }

    const executedAgreement = await this.db.one<any>(
      `SELECT a.*, v.variables FROM agreements a
         LEFT JOIN agreement_versions v ON v.agreement_id = a.id AND v.version = a.current_version
        WHERE a.tenancy_id = ? AND a.status = 'EXECUTED'
        ORDER BY a.id DESC LIMIT 1`,
      [tenancyId],
    );
    if (!executedAgreement) {
      throw new BadRequestException('An executed agreement is required before initiating move-out.');
    }

    let vars: any = {};
    if (executedAgreement.variables) {
      vars = typeof executedAgreement.variables === 'string' ? JSON.parse(executedAgreement.variables) : executedAgreement.variables;
    }

    const lockInMonths = Number(vars.lock_in_months ?? tenancy.lock_in_months ?? 0);
    const noticeDays = Number(vars.notice_period_days ?? tenancy.notice_period_days ?? 30);
    const effectiveFrom = executedAgreement.effective_from ? new Date(executedAgreement.effective_from) : (tenancy.start_date ? new Date(tenancy.start_date) : new Date());

    const requestedDate = new Date(dto.requestedMoveOutDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Validate lock-in period
    if (lockInMonths > 0) {
      const lockInEnd = new Date(effectiveFrom);
      lockInEnd.setMonth(lockInEnd.getMonth() + lockInMonths);
      lockInEnd.setDate(lockInEnd.getDate() - 1);
      const lockInEndStr = lockInEnd.toISOString().slice(0, 10);
      if (requestedDate < lockInEnd) {
        throw new BadRequestException(`Cannot request move-out before the contractual lock-in period ends on ${lockInEndStr}.`);
      }
    }

    // Validate notice period
    const minNoticeDate = new Date(today);
    minNoticeDate.setDate(minNoticeDate.getDate() + noticeDays);
    const minNoticeStr = minNoticeDate.toISOString().slice(0, 10);
    if (requestedDate < minNoticeDate) {
      throw new BadRequestException(`Requested move-out date (${dto.requestedMoveOutDate}) must satisfy the contractual notice period of ${noticeDays} days (earliest valid date is ${minNoticeStr}).`);
    }

    const initiatorRole = user.id === tenancy.owner_user_id ? 'OWNER' : 'TENANT';
    const noticeData = {
      requestedDate: dto.requestedMoveOutDate,
      noticeDays,
      reason: dto.reason ?? null,
      initiatedBy: user.id,
      initiatorRole,
      status: 'REQUESTED',
      requestedAt: new Date().toISOString(),
    };

    await this.db.update('tenancies', tenancyId, { stage: 'MOVE_OUT' });

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'MOVE_OUT_REPORT',
      title: 'Move-out notice requested',
      detail: JSON.stringify(noticeData),
      actor_id: user.id,
    });

    const recipientUserId = user.id === tenancy.owner_user_id ? tenancy.tenant_user_id : tenancy.owner_user_id;
    await this.notify.send(recipientUserId, 'CHECK_IN_PENDING', {
      title: 'Move-out notice received',
      body: `${user.fullName} submitted a move-out notice for ${dto.requestedMoveOutDate}. Review and confirm schedule.`,
      actionUrl: `/dashboard/tenancy/${tenancyId}`,
      severity: 'ACTION',
    });

    await this.audit.record({
      actor: user,
      action: 'tenancy.move_out_requested',
      objectType: 'tenancy',
      objectId: tenancyId,
      metadata: noticeData,
      req,
    });

    return { status: 'REQUESTED', notice: noticeData };
  }

  async confirmMoveOut(user: AuthUser, tenancyId: number, dto: ConfirmMoveOutDto, req?: Request) {
    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    if (!tenancy) throw new NotFoundException('Tenancy not found.');
    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('tenancy.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You are not authorized to confirm move-out for this tenancy.');
    }
    if (tenancy.stage !== 'MOVE_OUT') {
      throw new BadRequestException('Tenancy is not in move-out stage.');
    }

    const noticeEvent = await this.db.one<any>(
      `SELECT * FROM property_timeline 
        WHERE tenancy_id = ? AND event_code = 'MOVE_OUT_REPORT' AND title = 'Move-out notice requested'
        ORDER BY id DESC LIMIT 1`,
      [tenancyId],
    );
    if (!noticeEvent) {
      throw new BadRequestException('No pending move-out notice request found.');
    }

    let notice: any = {};
    try { notice = JSON.parse(noticeEvent.detail); } catch {}

    if (notice.initiatedBy === user.id && !user.permissions.includes('tenancy.manage') && !user.permissions.includes('user.manage')) {
      throw new BadRequestException('The counterparty must review and confirm the move-out notice.');
    }

    const confirmedData = {
      confirmedMoveOutDate: notice.requestedDate,
      confirmedBy: user.id,
      notes: dto.notes ?? null,
      confirmedAt: new Date().toISOString(),
    };

    if (notice.requestedDate) {
      await this.db.update('tenancies', tenancyId, { end_date: notice.requestedDate });
    }

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'MOVE_OUT_REPORT',
      title: 'Move-out notice confirmed',
      detail: JSON.stringify(confirmedData),
      actor_id: user.id,
    });

    await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'CHECK_IN_PENDING', {
      title: 'Move-out notice confirmed',
      body: `Move-out confirmed for ${notice.requestedDate}. Move-out condition report and inspection is scheduled next.`,
      actionUrl: `/dashboard/tenancy/${tenancyId}`,
      severity: 'INFO',
    });

    await this.audit.record({
      actor: user,
      action: 'tenancy.move_out_confirmed',
      objectType: 'tenancy',
      objectId: tenancyId,
      metadata: confirmedData,
      req,
    });

    return { status: 'CONFIRMED', moveOutDate: notice.requestedDate };
  }

  // ------------------------------------------------------- deposit settlement
  async proposeSettlement(user: AuthUser, tenancyId: number, dto: ProposeSettlementDto, req?: Request) {
    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    if (!tenancy) throw new NotFoundException('Tenancy not found.');
    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('tenancy.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You are not authorized to propose settlement for this tenancy.');
    }
    if (tenancy.stage !== 'MOVE_OUT') {
      throw new BadRequestException('Deposit settlement can only be proposed during move-out.');
    }

    const moveOutInspection = await this.db.one<any>(
      `SELECT * FROM inspections WHERE tenancy_id = ? AND kind = 'MOVE_OUT' AND status IN ('SUBMITTED', 'OWNER_REVIEW', 'ACKNOWLEDGED') LIMIT 1`,
      [tenancyId],
    );
    if (!moveOutInspection) {
      throw new BadRequestException('A submitted move-out condition report is required before deposit settlement.');
    }

    const depositAmount = Number(tenancy.deposit_amount);
    const deductions = dto.deductions ?? [];
    let totalDeductions = 0;
    for (const d of deductions) {
      const amt = Number(d.amount);
      if (isNaN(amt) || amt < 0) throw new BadRequestException('Deduction amount must be a non-negative number.');
      totalDeductions += amt;
    }
    totalDeductions = Number(totalDeductions.toFixed(2));

    if (totalDeductions > depositAmount) {
      throw new BadRequestException(`Total deductions (INR ${totalDeductions}) cannot exceed the original security deposit of INR ${depositAmount}.`);
    }

    const refundAmount = Number((depositAmount - totalDeductions).toFixed(2));
    if (refundAmount < 0) {
      throw new BadRequestException('Refund amount cannot be negative.');
    }

    const settlementData = {
      depositAmount,
      deductions,
      totalDeductions,
      refundAmount,
      proposedBy: user.id,
      proposerRole: user.id === tenancy.owner_user_id ? 'OWNER' : 'TENANT',
      notes: dto.notes ?? null,
      status: 'PROPOSED',
      proposedAt: new Date().toISOString(),
    };

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'MOVE_OUT_REPORT',
      title: 'Security deposit settlement proposed',
      detail: JSON.stringify(settlementData),
      actor_id: user.id,
    });

    const recipientUserId = user.id === tenancy.owner_user_id ? tenancy.tenant_user_id : tenancy.owner_user_id;
    await this.notify.send(recipientUserId, 'PAYMENT_DUE', {
      title: 'Deposit settlement proposed',
      body: `Deposit settlement proposed: Refund INR ${refundAmount.toLocaleString('en-IN')} (Deductions: INR ${totalDeductions.toLocaleString('en-IN')}). Review and accept to close tenancy.`,
      actionUrl: `/dashboard/tenancy/${tenancyId}`,
      severity: 'ACTION',
    });

    await this.audit.record({
      actor: user,
      action: 'deposit.settlement_proposed',
      objectType: 'tenancy',
      objectId: tenancyId,
      metadata: settlementData,
      req,
    });

    return { status: 'PROPOSED', settlement: settlementData };
  }

  async acceptSettlement(user: AuthUser, tenancyId: number, dto: AcceptSettlementDto, req?: Request) {
    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    if (!tenancy) throw new NotFoundException('Tenancy not found.');
    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('tenancy.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You are not authorized to accept settlement for this tenancy.');
    }
    if (tenancy.stage !== 'MOVE_OUT') {
      throw new BadRequestException('Deposit settlement can only be accepted during move-out.');
    }

    const settlementEvent = await this.db.one<any>(
      `SELECT * FROM property_timeline 
        WHERE tenancy_id = ? AND event_code = 'MOVE_OUT_REPORT' AND title = 'Security deposit settlement proposed'
        ORDER BY id DESC LIMIT 1`,
      [tenancyId],
    );
    if (!settlementEvent) {
      throw new BadRequestException('No pending deposit settlement proposal found.');
    }

    let settlement: any = {};
    try { settlement = JSON.parse(settlementEvent.detail); } catch {}

    if (settlement.proposedBy === user.id && !user.permissions.includes('tenancy.manage') && !user.permissions.includes('user.manage')) {
      throw new BadRequestException('The counterparty must review and accept the deposit settlement proposal.');
    }

    const alreadyAccepted = await this.db.one<any>(
      `SELECT * FROM property_timeline 
        WHERE tenancy_id = ? AND event_code = 'MOVE_OUT_REPORT' AND title = 'Security deposit settlement accepted'
        ORDER BY id DESC LIMIT 1`,
      [tenancyId],
    );
    if (alreadyAccepted) {
      throw new BadRequestException('Settlement proposal has already been accepted.');
    }

    const refundAmount = Number(settlement.refundAmount ?? 0);
    const totalDeductions = Number(settlement.totalDeductions ?? 0);

    let paymentId: number | null = null;
    let finalStage = 'MOVE_OUT';

    await this.db.transaction(async (conn) => {
      if (refundAmount > 0) {
        const [seq]: any = await conn.execute('SELECT COUNT(*) AS c FROM payments');
        const refCode = formatReference('PAY', (seq[0].c ?? 0) + 1);
        const [payRes]: any = await conn.execute(
          `INSERT INTO payments (public_id, reference_code, payer_user_id, payee_user_id, tenancy_id, property_id,
             purpose, amount, tax_amount, total_amount, status, due_date, notes)
           VALUES (?, ?, ?, ?, ?, ?, 'REFUND', ?, 0.00, ?, 'DUE', CURDATE(), ?)`,
          [
            newPublicId(),
            refCode,
            tenancy.owner_user_id,
            tenancy.tenant_user_id,
            tenancy.id,
            tenancy.property_id,
            refundAmount,
            refundAmount,
            `Security deposit refund after move-out deductions (INR ${totalDeductions})`,
          ],
        );
        paymentId = payRes.insertId;

        await conn.execute(
          `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, actor_id)
           VALUES (?, ?, 'MOVE_OUT_REPORT', 'Security deposit settlement accepted', ?, ?)`,
          [
            tenancy.property_id,
            tenancyId,
            JSON.stringify({
              ...settlement,
              status: 'ACCEPTED',
              paymentId,
              refundAmount,
              totalDeductions,
              acceptedBy: user.id,
              acceptedAt: new Date().toISOString(),
            }),
            user.id,
          ],
        );
      } else {
        finalStage = 'CLOSED';
        await conn.execute(
          `UPDATE tenancies SET stage = 'CLOSED', closed_at = NOW() WHERE id = ?`,
          [tenancyId],
        );

        await conn.execute(
          `INSERT INTO property_timeline (property_id, tenancy_id, event_code, title, detail, actor_id)
           VALUES (?, ?, 'TENANCY_CLOSED', 'Tenancy closed', ?, ?)`,
          [
            tenancy.property_id,
            tenancyId,
            `Deposit settlement accepted with zero refund due (Deductions: INR ${totalDeductions}). Tenancy closed.`,
            user.id,
          ],
        );
      }

      // Resolve any open deposit disputes upon settlement acceptance
      await conn.execute(
        `UPDATE disputes SET status = 'RESOLVED', resolved_at = NOW(), resolution = 'Settlement terms accepted'
         WHERE tenancy_id = ? AND category = 'DEPOSIT' AND status NOT IN ('RESOLVED', 'CLOSED', 'WITHDRAWN')`,
        [tenancyId],
      );
    });

    if (refundAmount > 0) {
      await this.notify.send(tenancy.owner_user_id, 'PAYMENT_DUE', {
        title: 'Deposit settlement accepted',
        body: `Security deposit settlement accepted. Refund of INR ${refundAmount.toLocaleString('en-IN')} is due to the tenant.`,
        actionUrl: `/dashboard/payments`,
        severity: 'ACTION',
      });

      await this.audit.record({
        actor: user,
        action: 'deposit.settlement_accepted',
        objectType: 'tenancy',
        objectId: tenancyId,
        metadata: { refundAmount, totalDeductions, paymentId },
        req,
      });

      await this.audit.record({
        actor: user,
        action: 'deposit.refund_due',
        objectType: 'payment',
        objectId: paymentId!,
        metadata: { tenancyId, refundAmount, payerUserId: tenancy.owner_user_id, payeeUserId: tenancy.tenant_user_id },
        req,
      });

      return { status: 'ACCEPTED', stage: 'MOVE_OUT', refundAmount, totalDeductions, paymentId };
    } else {
      await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'INFO', {
        title: 'Tenancy closed & settlement finalized',
        body: `Deposit settlement accepted with zero refund due. Tenancy is now closed.`,
        actionUrl: `/dashboard/tenancy/${tenancyId}`,
        severity: 'INFO',
      });

      await this.audit.record({
        actor: user,
        action: 'deposit.settlement_accepted',
        objectType: 'tenancy',
        objectId: tenancyId,
        metadata: { refundAmount: 0, totalDeductions, paymentId: null },
        req,
      });

      await this.audit.record({
        actor: user,
        action: 'tenancy.closed',
        objectType: 'tenancy',
        objectId: tenancyId,
        metadata: { refundAmount: 0, totalDeductions },
        req,
      });

      return { status: 'CLOSED', stage: 'CLOSED', refundAmount: 0, totalDeductions, paymentId: null };
    }
  }

  async disputeSettlement(user: AuthUser, tenancyId: number, dto: DisputeSettlementDto, req?: Request) {
    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [tenancyId]);
    if (!tenancy) throw new NotFoundException('Tenancy not found.');
    const isParty = [tenancy.owner_user_id, tenancy.tenant_user_id].includes(user.id);
    if (!isParty && !user.permissions.includes('tenancy.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You are not authorized to dispute settlement for this tenancy.');
    }
    if (tenancy.stage !== 'MOVE_OUT') {
      throw new BadRequestException('Dispute can only be raised during move-out settlement.');
    }

    const againstUserId = user.id === tenancy.owner_user_id ? tenancy.tenant_user_id : tenancy.owner_user_id;

    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM disputes');
    const caseNumber = formatReference('DSP', (seq?.c ?? 0) + 1);

    const disputeSummary = dto.summary || (dto as any).reason || 'Deposit settlement dispute';
    const disputeDetail = dto.detail || (dto as any).reason || null;

    const disputeId = await this.db.insert('disputes', {
      public_id: newPublicId(),
      case_number: caseNumber,
      tenancy_id: tenancyId,
      raised_by: user.id,
      against_user_id: againstUserId,
      category: 'DEPOSIT',
      amount_claimed: dto.amountClaimed ?? 0,
      summary: disputeSummary,
      detail: disputeDetail,
      status: 'OPEN',
    });

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'DISPUTE',
      title: 'Deposit settlement disputed',
      detail: JSON.stringify({ disputeId, caseNumber, summary: disputeSummary, amountClaimed: dto.amountClaimed }),
      actor_id: user.id,
    });

    await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'CHECK_IN_PENDING', {
      title: 'Deposit settlement dispute raised',
      body: `Dispute ${caseNumber} opened regarding deposit deductions: "${disputeSummary}". Our team is reviewing the record.`,
      actionUrl: `/dashboard/tenancy/${tenancyId}`,
      severity: 'ACTION',
    });

    await this.audit.record({
      actor: user,
      action: 'deposit.settlement_disputed',
      objectType: 'tenancy',
      objectId: tenancyId,
      metadata: { disputeId, caseNumber, summary: dto.summary },
      req,
    });

    return { status: 'DISPUTED', disputeId, caseNumber };
  }

  async adminDecideApplication(user: AuthUser, applicationId: number, dto: AdminApplicationDecideDto, req?: Request) {
    if (!user.permissions.includes('application.decide') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You do not have administrative authority to decide applications.');
    }
    const app = await this.db.one<any>(
      `SELECT a.*, p.title AS property_title, p.listed_by_user_id FROM applications a
         JOIN properties p ON p.id = a.property_id
        WHERE a.id = ?`,
      [applicationId],
    );
    if (!app) throw new NotFoundException('Application not found.');
    if (['ACCEPTED', 'REJECTED', 'WITHDRAWN', 'EXPIRED'].includes(app.status)) {
      throw new BadRequestException(`Application is already ${app.status.toLowerCase()}.`);
    }

    const newStatus = dto.action === 'CANCEL' ? 'WITHDRAWN' : 'REJECTED';
    await this.db.update('applications', applicationId, {
      status: newStatus,
      decision_note: `[Management Intervention] ${dto.reason}`.slice(0, 500),
      decided_by: user.id,
      decided_at: new Date(),
    });

    await this.notify.sendMany([app.tenant_user_id, app.listed_by_user_id], 'INFO', {
      title: `Application ${newStatus.toLowerCase()} by management`,
      body: `Application for ${app.property_title} was marked ${newStatus.toLowerCase()} by Odibrick Management. Reason: ${dto.reason}`,
      actionUrl: `/dashboard/applications`,
    });

    await this.audit.record({
      actor: user,
      action: 'management.application.decided',
      objectType: 'application',
      objectId: applicationId,
      metadata: { previousStatus: app.status, newStatus, reason: dto.reason },
      req,
    });

    return { id: applicationId, status: newStatus, reason: dto.reason };
  }

  async adminOverrideTenancy(user: AuthUser, tenancyId: number, dto: AdminTenancyOverrideDto, req?: Request) {
    if (!user.permissions.includes('tenancy.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('You do not have administrative authority to manage tenancies.');
    }
    const tenancy = await this.db.one<any>(
      `SELECT t.*, p.title AS property_title FROM tenancies t
         JOIN properties p ON p.id = t.property_id
        WHERE t.id = ?`,
      [tenancyId],
    );
    if (!tenancy) throw new NotFoundException('Tenancy not found.');

    const previousStage = tenancy.stage;
    let newStage = previousStage;
    let timelineEventCode = 'DISPUTE';
    let timelineTitle = 'Tenancy management intervention';
    let auditAction = 'management.tenancy.override';

    if (dto.action === 'HOLD') {
      if (['CLOSED', 'CANCELLED'].includes(tenancy.stage)) {
        throw new BadRequestException(`Cannot put a ${tenancy.stage.toLowerCase()} tenancy on hold.`);
      }
      timelineTitle = 'Tenancy placed on administrative hold';
      auditAction = 'management.tenancy.hold';
    } else if (dto.action === 'RESUME') {
      timelineTitle = 'Tenancy administrative hold resumed';
      auditAction = 'management.tenancy.resumed';
    } else if (dto.action === 'CANCEL') {
      if (['CLOSED', 'CANCELLED'].includes(tenancy.stage)) {
        throw new BadRequestException(`Tenancy is already ${tenancy.stage.toLowerCase()}.`);
      }
      newStage = 'CANCELLED';
      timelineEventCode = 'TENANCY_CLOSED';
      timelineTitle = 'Tenancy cancelled by management';
      auditAction = 'management.tenancy.cancelled';
      await this.db.update('tenancies', tenancyId, { stage: 'CANCELLED', closed_at: new Date() });
    } else if (dto.action === 'FORCE_CLOSE') {
      if (tenancy.stage === 'CLOSED') {
        throw new BadRequestException('Tenancy is already closed.');
      }
      newStage = 'CLOSED';
      timelineEventCode = 'TENANCY_CLOSED';
      timelineTitle = 'Tenancy closed by management override';
      auditAction = 'management.tenancy.closed';
      await this.db.update('tenancies', tenancyId, { stage: 'CLOSED', closed_at: new Date() });
    }

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: timelineEventCode,
      title: timelineTitle,
      detail: JSON.stringify({
        action: dto.action,
        reason: dto.reason,
        notes: dto.notes ?? null,
        previousStage,
        newStage,
        managementUserId: user.id,
        timestamp: new Date().toISOString(),
      }),
      actor_id: user.id,
    });

    await this.notify.sendMany([tenancy.owner_user_id, tenancy.tenant_user_id], 'INFO', {
      title: timelineTitle,
      body: `Notice for tenancy at ${tenancy.property_title}: ${dto.reason}`,
      actionUrl: `/dashboard/tenancy/${tenancyId}`,
      severity: 'ACTION',
    });

    await this.audit.record({
      actor: user,
      action: auditAction,
      objectType: 'tenancy',
      objectId: tenancyId,
      metadata: {
        action: dto.action,
        previousStage,
        newStage,
        reason: dto.reason,
        notes: dto.notes,
      },
      req,
    });

    return {
      tenancyId,
      action: dto.action,
      previousStage,
      stage: newStage,
      reason: dto.reason,
    };
  }

  private async activeProperty(id: number) {
    const property = await this.db.one<any>(
      "SELECT * FROM properties WHERE id = ? AND status = 'ACTIVE' AND deleted_at IS NULL", [id],
    );
    if (!property) throw new NotFoundException('That listing is no longer accepting enquiries.');
    return property;
  }
}
