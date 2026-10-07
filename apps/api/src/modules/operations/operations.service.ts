import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentsService } from '../payments/payments.service';
import { AuthUser } from '../../common/auth/auth.types';
import { formatReference, newPublicId } from '../../common/util/ids';
import { pageParams, paginate } from '../../common/util/pagination';
import {
  AssignDisputeDto, CloseDisputeDto, CreateDisputeDto, CreateMaintenanceDto, CreateTicketDto,
  DisputeEvidenceDto, DisputeMessageDto, DisputeUpdateDto, EscalateDisputeDto, MaintenanceFinancialApprovalDto,
  MaintenanceFinancialRejectDto, MaintenanceUpdateDto, ReopenDisputeDto, ResolveDisputeDto, TicketMessageDto,
} from './operations.dto';

@Injectable()
export class OperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
    private readonly payments: PaymentsService,
  ) {}

  // ----------------------------------------------------------- maintenance
  async createMaintenance(user: AuthUser, dto: CreateMaintenanceDto) {
    const tenancy = await this.db.one<any>(
      'SELECT * FROM tenancies WHERE id = ? AND (tenant_user_id = ? OR owner_user_id = ?)',
      [dto.tenancyId, user.id, user.id],
    );
    if (!tenancy) throw new NotFoundException('Tenancy not found.');

    if (tenancy.stage !== 'ACTIVE') {
      throw new BadRequestException('Maintenance requests can only be raised for active tenancies.');
    }

    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM maintenance_requests');
    const id = await this.db.insert('maintenance_requests', {
      public_id: newPublicId(),
      ticket_number: formatReference('MNT', (seq?.c ?? 0) + 1),
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      raised_by: user.id,
      category: dto.category,
      priority: dto.priority ?? 'NORMAL',
      title: dto.title,
      description: dto.description ?? null,
      status: 'OPEN',
    });

    if (dto.documentIds?.length) {
      await this.db.execute(
        `UPDATE documents SET entity_type = 'maintenance', entity_id = ?, category = 'MAINTENANCE'
          WHERE owner_user_id = ? AND id IN (${dto.documentIds.map(() => '?').join(',')})`,
        [id, user.id, ...dto.documentIds],
      );
    }

    await this.db.insert('maintenance_updates', {
      request_id: id,
      author_id: user.id,
      status_from: null,
      status_to: 'OPEN',
      message: dto.description ? `Request created: ${dto.description}` : 'Maintenance request created.',
    });

    const notifyUser = user.id === tenancy.tenant_user_id ? tenancy.owner_user_id : tenancy.tenant_user_id;
    await this.notify.send(notifyUser, 'MAINTENANCE_UPDATE', {
      title: dto.priority === 'EMERGENCY' ? 'Emergency maintenance request' : 'New maintenance request',
      body: `${dto.title} (${dto.category.toLowerCase()})`,
      actionUrl: `/dashboard/maintenance/${id}`,
      severity: dto.priority === 'EMERGENCY' ? 'CRITICAL' : 'ACTION',
    });
    await this.audit.record({ actor: user, action: 'maintenance.created', objectType: 'maintenance', objectId: id });
    return { id, status: 'OPEN' };
  }

  async listMaintenance(user: AuthUser, status?: string, page?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, 25);
    const where = ['(m.raised_by = ? OR t.owner_user_id = ? OR t.tenant_user_id = ?)'];
    const params: unknown[] = [user.id, user.id, user.id];
    if (user.permissions.includes('maintenance.manage')) {
      where.length = 0;
      params.length = 0;
    }
    if (status && status !== 'ALL') {
      where.push('m.status = ?');
      params.push(status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.query(
      `SELECT m.id, m.public_id, m.ticket_number, m.category, m.priority, m.title, m.status, m.cost_bearer,
              m.estimated_cost, m.final_cost, m.scheduled_for, m.completed_at, m.created_at, m.updated_at,
              m.raised_by, m.tenancy_id, m.property_id,
              p.title AS property_title, p.locality, p.city,
              u.full_name AS raised_by_name,
              own.full_name AS owner_name,
              ten.full_name AS tenant_name
         FROM maintenance_requests m
         LEFT JOIN tenancies t ON t.id = m.tenancy_id
         JOIN properties p ON p.id = m.property_id
         JOIN users u ON u.id = m.raised_by
         LEFT JOIN users own ON own.id = t.owner_user_id
         LEFT JOIN users ten ON ten.id = t.tenant_user_id
         ${clause}
        ORDER BY FIELD(m.priority,'EMERGENCY','HIGH','NORMAL','LOW'), m.created_at DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );
    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM maintenance_requests m LEFT JOIN tenancies t ON t.id = m.tenancy_id ${clause}`,
      params,
    );
    return paginate(rows, total?.total ?? 0, p, pp);
  }

  async maintenanceDetail(user: AuthUser, id: number) {
    const request = await this.db.one<any>(
      `SELECT m.*, p.title AS property_title, p.locality, p.city, p.address_line1, p.pincode, p.owner_id AS property_owner_id,
              COALESCE(t.owner_user_id, p.owner_id, p.listed_by_user_id, m.raised_by) AS owner_user_id,
              COALESCE(t.tenant_user_id, m.raised_by) AS tenant_user_id,
              u.full_name AS raised_by_name, u.email AS raised_by_email,
              own.full_name AS owner_name, own.email AS owner_email,
              ten.full_name AS tenant_name, ten.email AS tenant_email
         FROM maintenance_requests m
         JOIN properties p ON p.id = m.property_id
         LEFT JOIN tenancies t ON t.id = m.tenancy_id
         JOIN users u ON u.id = m.raised_by
         LEFT JOIN users own ON own.id = COALESCE(t.owner_user_id, p.owner_id, p.listed_by_user_id, m.raised_by)
         LEFT JOIN users ten ON ten.id = COALESCE(t.tenant_user_id, m.raised_by)
        WHERE m.id = ?`,
      [id],
    );
    if (!request) throw new NotFoundException('Request not found.');

    const isStaff =
      (user.roles && (user.roles.includes('SUPER_ADMIN') || user.roles.includes('ADMIN'))) ||
      (user.permissions && user.permissions.includes('maintenance.manage'));

    const isParty = [
      request.owner_user_id,
      request.property_owner_id,
      request.tenant_user_id,
      request.raised_by,
    ]
      .filter(Boolean)
      .includes(user.id);

    if (!isParty && !isStaff) {
      throw new ForbiddenException('This maintenance request belongs to other parties.');
    }

    const [updates, documents, payments] = await Promise.all([
      this.db.query(
        `SELECT mu.id, mu.status_from, mu.status_to, mu.message, mu.created_at, u.full_name AS author, u.id AS author_id
           FROM maintenance_updates mu JOIN users u ON u.id = mu.author_id
          WHERE mu.request_id = ? ORDER BY mu.created_at ASC`,
        [id],
      ),
      this.db.query(
        `SELECT id, title, size_bytes, mime_type, storage_key, created_at
           FROM documents WHERE entity_type = 'maintenance' AND entity_id = ? ORDER BY id ASC`,
        [id],
      ),
      this.db.query(
        `SELECT p.id, p.public_id, p.reference_code, p.purpose, p.amount, p.tax_amount, p.total_amount,
                p.currency, p.status, p.settlement_status, p.due_date, p.paid_at, p.notes,
                p.payer_user_id, p.payee_user_id,
                payer.full_name AS payer_name, payee.full_name AS payee_name
           FROM payments p
           JOIN users payer ON payer.id = p.payer_user_id
           LEFT JOIN users payee ON payee.id = p.payee_user_id
          WHERE p.purpose = 'MAINTENANCE'
            AND p.notes LIKE ?
          ORDER BY p.id ASC`,
        [`%${request.ticket_number}%`],
      ),
    ]);

    return { request, updates, documents, payments };
  }

  async updateMaintenance(user: AuthUser, id: number, dto: MaintenanceUpdateDto) {
    const request = await this.db.one<any>(
      `SELECT m.*, t.owner_user_id, t.tenant_user_id FROM maintenance_requests m
         LEFT JOIN tenancies t ON t.id = m.tenancy_id WHERE m.id = ?`,
      [id],
    );
    if (!request) throw new NotFoundException('Request not found.');
    const isParty = [request.owner_user_id, request.tenant_user_id, request.raised_by].includes(user.id);
    if (!isParty && !user.permissions.includes('maintenance.manage')) {
      throw new ForbiddenException('This request belongs to another property.');
    }

    const isOwner = user.id === request.owner_user_id;
    const isTenant = user.id === request.tenant_user_id || user.id === request.raised_by;
    const isStaff = user.permissions.includes('maintenance.manage');

    if (request.status === 'CLOSED' && !isStaff) {
      throw new BadRequestException('This maintenance request is closed and cannot be modified.');
    }

    if (dto.status && dto.status !== request.status) {
      if (['APPROVED', 'REJECTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED'].includes(dto.status)) {
        if (!isOwner && !isStaff) {
          throw new ForbiddenException('Only the property owner can accept, reject, schedule, or mark repair work complete.');
        }
        if (dto.status === 'REJECTED' && !dto.note) {
          throw new BadRequestException('A reason is required when rejecting a maintenance request.');
        }
      }

      if (['CLOSED', 'VERIFIED'].includes(dto.status)) {
        if (!isTenant && !isStaff) {
          throw new ForbiddenException('Only the tenant can confirm resolution and close the request.');
        }
        if (request.status !== 'COMPLETED' && request.status !== 'VERIFIED' && !isStaff) {
          throw new BadRequestException('Work must be marked completed before tenant can confirm resolution.');
        }
      }

      if (dto.status === 'CANCELLED') {
        if (!isTenant && !isStaff) {
          throw new ForbiddenException('Only the tenant who raised the issue can cancel it.');
        }
        if (!['OPEN', 'OWNER_REVIEW'].includes(request.status) && !isStaff) {
          throw new BadRequestException('Cannot cancel a maintenance request once work is approved or underway.');
        }
      }

      if (dto.status === 'IN_PROGRESS' && request.status === 'COMPLETED' && isTenant) {
        // Permitted: Tenant indicating issue remains
      }
    }

    const nextStatus = dto.status ?? request.status;

    await this.db.update('maintenance_requests', id, {
      status: nextStatus,
      cost_bearer: dto.costBearer ?? request.cost_bearer,
      estimated_cost: dto.estimatedCost !== undefined ? dto.estimatedCost : request.estimated_cost,
      final_cost: dto.finalCost !== undefined ? dto.finalCost : request.final_cost,
      vendor_name: dto.vendorName ?? request.vendor_name,
      vendor_phone: dto.vendorPhone ?? request.vendor_phone,
      scheduled_for: dto.scheduledFor ? new Date(dto.scheduledFor) : request.scheduled_for,
      owner_decision_note: dto.note ?? request.owner_decision_note,
      completed_at: nextStatus === 'COMPLETED' ? (request.completed_at ?? new Date()) : request.completed_at,
    });

    await this.db.insert('maintenance_updates', {
      request_id: id,
      author_id: user.id,
      status_from: request.status,
      status_to: nextStatus,
      message: dto.note ?? (dto.status ? `Status changed to ${nextStatus.toLowerCase().replace('_', ' ')}` : 'Update note added.'),
    });

    if (['COMPLETED', 'APPROVED', 'REJECTED', 'CLOSED'].includes(nextStatus)) {
      await this.db.insert('property_timeline', {
        property_id: request.property_id,
        tenancy_id: request.tenancy_id,
        event_code: 'MAINTENANCE_EVENT',
        title: `${request.title} — ${nextStatus.toLowerCase().replace('_', ' ')}`,
        actor_id: user.id,
        reference_type: 'maintenance',
        reference_id: id,
      });
    }

    const counterparty = user.id === request.tenant_user_id ? request.owner_user_id : request.tenant_user_id;
    if (counterparty) {
      await this.notify.send(counterparty, 'MAINTENANCE_UPDATE', {
        title: 'Maintenance update',
        body: `${request.ticket_number}: ${dto.note ?? `Status updated to ${nextStatus.toLowerCase().replace('_', ' ')}`}`,
        actionUrl: `/dashboard/maintenance/${id}`,
      });
    }

    await this.audit.record({
      actor: user,
      action: 'maintenance.updated',
      objectType: 'maintenance',
      objectId: id,
      metadata: { from: request.status, to: nextStatus, note: dto.note },
    });

    return { id, status: nextStatus };
  }

  // ----------------------------------------------------------- maintenance financial
  /**
   * Approves financial obligations for completed maintenance and creates payment records via PaymentsService.
   * Idempotent: repeated approvals return existing payment records rather than creating duplicates.
   */
  async approveMaintenanceFinancial(user: AuthUser, id: number, dto: MaintenanceFinancialApprovalDto) {
    const isStaff =
      user.permissions.includes('maintenance.manage') ||
      user.permissions.includes('payment.manage') ||
      user.roles.includes('SUPER_ADMIN') ||
      user.roles.includes('ADMIN');

    if (!isStaff) {
      throw new ForbiddenException('Only Odibrick Management has authority to approve maintenance financial obligations.');
    }

    const request = await this.db.one<any>(
      `SELECT m.*, 
              COALESCE(t.owner_user_id, p.owner_id, p.listed_by_user_id, m.raised_by) AS owner_user_id, 
              COALESCE(t.tenant_user_id, m.raised_by) AS tenant_user_id, 
              p.title AS property_title
         FROM maintenance_requests m
         LEFT JOIN tenancies t ON t.id = m.tenancy_id
         JOIN properties p ON p.id = m.property_id
        WHERE m.id = ?`,
      [id],
    );
    if (!request) {
      throw new NotFoundException('Maintenance request not found.');
    }

    if (!['COMPLETED', 'VERIFIED', 'CLOSED'].includes(request.status)) {
      throw new BadRequestException('Maintenance request must be marked COMPLETED before financial review and payment approval.');
    }

    if (dto.finalCost < 0) {
      throw new BadRequestException('Final cost must be non-negative.');
    }

    // Zero-cost maintenance or Platform-borne maintenance
    if (dto.finalCost === 0 || dto.costBearer === 'ODIBRICK') {
      await this.db.update('maintenance_requests', id, {
        final_cost: dto.finalCost,
        cost_bearer: dto.costBearer,
        owner_decision_note: dto.decisionNote ?? request.owner_decision_note,
      });

      await this.db.insert('maintenance_updates', {
        request_id: id,
        author_id: user.id,
        status_from: request.status,
        status_to: request.status,
        message: `Financial review completed: No payment required (Cost: INR ${dto.finalCost}, Bearer: ${dto.costBearer}).`,
      });

      await this.audit.record({
        actor: user,
        action: 'maintenance.financial_approved',
        objectType: 'maintenance',
        objectId: id,
        metadata: {
          ticketNumber: request.ticket_number,
          finalCost: dto.finalCost,
          costBearer: dto.costBearer,
          status: 'NO_PAYMENT_REQUIRED',
        },
      });

      return {
        id,
        ticketNumber: request.ticket_number,
        finalCost: dto.finalCost,
        costBearer: dto.costBearer,
        allocations: { ownerAmount: 0, tenantAmount: 0 },
        payments: [],
        status: 'NO_PAYMENT_REQUIRED',
      };
    }

    // Calculate cost allocations
    let ownerAmt = 0;
    let tenantAmt = 0;

    if (dto.costBearer === 'OWNER') {
      ownerAmt = Number(dto.finalCost);
      tenantAmt = 0;
    } else if (dto.costBearer === 'TENANT') {
      tenantAmt = Number(dto.finalCost);
      ownerAmt = 0;
    } else if (dto.costBearer === 'SHARED') {
      ownerAmt = dto.ownerAmount !== undefined ? Number(dto.ownerAmount) : 0;
      tenantAmt = dto.tenantAmount !== undefined ? Number(dto.tenantAmount) : 0;

      if (ownerAmt < 0 || tenantAmt < 0) {
        throw new BadRequestException('Allocated amounts cannot be negative.');
      }

      if (Math.abs((ownerAmt + tenantAmt) - Number(dto.finalCost)) > 0.01) {
        throw new BadRequestException(
          `Split cost allocation sum (INR ${(ownerAmt + tenantAmt).toFixed(2)}) must exactly equal total cost (INR ${Number(dto.finalCost).toFixed(2)}).`,
        );
      }
    }

    // Idempotency: Check if active payments already exist for this ticket
    const existingPayments = await this.db.query(
      `SELECT * FROM payments 
        WHERE purpose = 'MAINTENANCE' 
          AND notes LIKE ?
          AND status <> 'CANCELLED'
        ORDER BY id ASC`,
      [`%${request.ticket_number}%`],
    );

    if (existingPayments.length > 0) {
      return {
        id,
        ticketNumber: request.ticket_number,
        finalCost: dto.finalCost,
        costBearer: dto.costBearer,
        allocations: { ownerAmount: ownerAmt, tenantAmount: tenantAmt },
        message: 'Financial obligations already created for this maintenance request.',
        payments: existingPayments,
        status: 'ALREADY_APPROVED',
      };
    }

    const dueDate = dto.dueDate || new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const createdPayments: any[] = [];

    // Create Owner portion payment if applicable
    if (ownerAmt > 0 && request.owner_user_id) {
      const ownerPayId = await this.payments.createPayment({
        payerUserId: request.owner_user_id,
        payeeUserId: null, // Odibrick platform collection for repair reimbursement
        tenancyId: request.tenancy_id,
        propertyId: request.property_id,
        purpose: 'MAINTENANCE',
        amount: ownerAmt,
        dueDate,
        notes: `Maintenance ${request.ticket_number}: ${request.title} (Owner share)`,
      });
      const ownerPay = await this.db.one<any>('SELECT * FROM payments WHERE id = ?', [ownerPayId]);
      createdPayments.push(ownerPay);
    }

    // Create Tenant portion payment if applicable
    if (tenantAmt > 0 && request.tenant_user_id) {
      const tenantPayId = await this.payments.createPayment({
        payerUserId: request.tenant_user_id,
        payeeUserId: request.owner_user_id, // Tenant pays towards owner/property repair liability
        tenancyId: request.tenancy_id,
        propertyId: request.property_id,
        purpose: 'MAINTENANCE',
        amount: tenantAmt,
        dueDate,
        notes: `Maintenance ${request.ticket_number}: ${request.title} (Tenant share)`,
      });
      const tenantPay = await this.db.one<any>('SELECT * FROM payments WHERE id = ?', [tenantPayId]);
      createdPayments.push(tenantPay);
    }

    // Update maintenance request
    await this.db.update('maintenance_requests', id, {
      final_cost: dto.finalCost,
      cost_bearer: dto.costBearer,
      owner_decision_note: dto.decisionNote ?? request.owner_decision_note,
    });

    // Record timeline & updates
    await this.db.insert('maintenance_updates', {
      request_id: id,
      author_id: user.id,
      status_from: request.status,
      status_to: request.status,
      message: `Financial approval recorded: INR ${dto.finalCost} allocated (${dto.costBearer}). Payment obligations generated.`,
    });

    await this.db.insert('property_timeline', {
      property_id: request.property_id,
      tenancy_id: request.tenancy_id,
      event_code: 'MAINTENANCE_EVENT',
      title: 'Maintenance financial approval',
      detail: `Financial approval recorded for ${request.ticket_number}: INR ${dto.finalCost} (${dto.costBearer}).`,
      actor_id: user.id,
      reference_type: 'maintenance',
      reference_id: id,
    });

    await this.audit.record({
      actor: user,
      action: 'maintenance.financial_approved',
      objectType: 'maintenance',
      objectId: id,
      metadata: {
        ticketNumber: request.ticket_number,
        finalCost: dto.finalCost,
        costBearer: dto.costBearer,
        ownerAmount: ownerAmt,
        tenantAmount: tenantAmt,
        paymentIds: createdPayments.map((p) => p.id),
      },
    });

    return {
      id,
      ticketNumber: request.ticket_number,
      finalCost: dto.finalCost,
      costBearer: dto.costBearer,
      allocations: {
        ownerAmount: ownerAmt,
        tenantAmount: tenantAmt,
      },
      payments: createdPayments,
      status: 'APPROVED',
    };
  }

  /**
   * Rejects maintenance financial obligation review.
   */
  async rejectMaintenanceFinancial(user: AuthUser, id: number, dto: MaintenanceFinancialRejectDto) {
    const isStaff =
      user.permissions.includes('maintenance.manage') ||
      user.permissions.includes('payment.manage') ||
      user.roles.includes('SUPER_ADMIN') ||
      user.roles.includes('ADMIN');

    if (!isStaff) {
      throw new ForbiddenException('Only Odibrick Management has authority to reject maintenance financial obligations.');
    }

    const request = await this.db.one<any>('SELECT * FROM maintenance_requests WHERE id = ?', [id]);
    if (!request) throw new NotFoundException('Maintenance request not found.');

    await this.db.update('maintenance_requests', id, {
      owner_decision_note: dto.reason,
    });

    await this.db.insert('maintenance_updates', {
      request_id: id,
      author_id: user.id,
      status_from: request.status,
      status_to: request.status,
      message: `Financial obligation review rejected: ${dto.reason}`,
    });

    await this.audit.record({
      actor: user,
      action: 'maintenance.financial_rejected',
      objectType: 'maintenance',
      objectId: id,
      metadata: { ticketNumber: request.ticket_number, reason: dto.reason },
    });

    return { id, ticketNumber: request.ticket_number, status: 'REJECTED', reason: dto.reason };
  }

  /**
   * Retrieves financial position and payment obligations for a specific maintenance request.
   */
  async getMaintenanceFinancial(user: AuthUser, id: number) {
    const detail = await this.maintenanceDetail(user, id);
    const { request, payments } = detail;

    const totalAmount = (payments || []).reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const totalPaid = (payments || [])
      .filter((p: any) => p.status === 'PAID')
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);
    const totalOutstanding = (payments || [])
      .filter((p: any) => ['DUE', 'INITIATED', 'PROCESSING'].includes(p.status))
      .reduce((sum: number, p: any) => sum + Number(p.total_amount), 0);

    return {
      maintenanceId: request.id,
      maintenance: request,
      ticketNumber: request.ticket_number,
      title: request.title,
      status: request.status,
      costBearer: request.cost_bearer,
      estimatedCost: request.estimated_cost ? Number(request.estimated_cost) : null,
      finalCost: request.final_cost ? Number(request.final_cost) : null,
      financialStatus:
        payments && payments.length > 0
          ? totalOutstanding === 0
            ? 'SETTLED'
            : 'PAYMENT_DUE'
          : request.final_cost !== null && request.final_cost !== undefined
          ? 'PENDING_APPROVAL'
          : 'UNASSESSED',
      summary: {
        totalAmount,
        totalPaid,
        totalOutstanding,
      },
      payments: payments || [],
    };
  }

  /**
   * Lists maintenance financial obligations across the platform for Finance Control Centre.
   */
  async listMaintenanceFinancials(
    user: AuthUser,
    filters?: { status?: string; costBearer?: string; page?: number; limit?: number },
  ) {
    const isStaff =
      user.permissions.includes('maintenance.manage') ||
      user.permissions.includes('payment.manage') ||
      user.roles.includes('SUPER_ADMIN') ||
      user.roles.includes('ADMIN');

    if (!isStaff) {
      throw new ForbiddenException('Only Odibrick Management can list platform maintenance financials.');
    }

    const { page: p, perPage: pp, offset } = pageParams(filters?.page, filters?.limit || 25);
    const where: string[] = ["m.status IN ('COMPLETED', 'VERIFIED', 'CLOSED')"];
    const params: unknown[] = [];

    if (filters?.costBearer && filters.costBearer !== 'ALL') {
      where.push('m.cost_bearer = ?');
      params.push(filters.costBearer);
    }

    const rows = await this.db.query(
      `SELECT m.id, m.public_id, m.ticket_number, m.category, m.priority, m.title, m.status, m.cost_bearer,
              m.estimated_cost, m.final_cost, m.completed_at, m.created_at,
              m.tenancy_id, t.public_id AS tenancy_public_id,
              m.property_id, prop.title AS property_title,
              t.owner_user_id, own.full_name AS owner_name, own.email AS owner_email,
              t.tenant_user_id, ten.full_name AS tenant_name, ten.email AS tenant_email,
              (SELECT COUNT(*) FROM payments p WHERE p.purpose = 'MAINTENANCE' AND p.notes LIKE CONCAT('%', m.ticket_number, '%')) AS payment_count,
              (SELECT COALESCE(SUM(p.total_amount), 0) FROM payments p WHERE p.purpose = 'MAINTENANCE' AND p.notes LIKE CONCAT('%', m.ticket_number, '%') AND p.status = 'PAID') AS amount_paid,
              (SELECT COALESCE(SUM(p.total_amount), 0) FROM payments p WHERE p.purpose = 'MAINTENANCE' AND p.notes LIKE CONCAT('%', m.ticket_number, '%') AND p.status IN ('DUE', 'INITIATED', 'PROCESSING')) AS amount_outstanding
         FROM maintenance_requests m
         LEFT JOIN tenancies t ON t.id = m.tenancy_id
         JOIN properties prop ON prop.id = m.property_id
         LEFT JOIN users own ON own.id = t.owner_user_id
         LEFT JOIN users ten ON ten.id = t.tenant_user_id
        WHERE ${where.join(' AND ')}
        ORDER BY m.completed_at DESC, m.id DESC
        LIMIT ? OFFSET ?`,
      [...params, pp, offset],
    );

    const total = await this.db.one<{ total: number }>(
      `SELECT COUNT(*) AS total FROM maintenance_requests m WHERE ${where.join(' AND ')}`,
      params,
    );

    return paginate(
      rows.map((r: any) => ({
        id: r.id,
        publicId: r.public_id,
        ticketNumber: r.ticket_number,
        category: r.category,
        priority: r.priority,
        title: r.title,
        status: r.status,
        costBearer: r.cost_bearer,
        estimatedCost: r.estimated_cost ? Number(r.estimated_cost) : null,
        finalCost: r.final_cost ? Number(r.final_cost) : null,
        tenancyId: r.tenancy_id,
        tenancyPublicId: r.tenancy_public_id,
        propertyTitle: r.property_title,
        ownerName: r.owner_name,
        tenantName: r.tenant_name,
        paymentCount: Number(r.payment_count || 0),
        amountPaid: Number(r.amount_paid || 0),
        amountOutstanding: Number(r.amount_outstanding || 0),
        financialStatus:
          Number(r.payment_count || 0) > 0
            ? Number(r.amount_outstanding || 0) === 0
              ? 'SETTLED'
              : 'PAYMENT_DUE'
            : r.final_cost !== null
            ? 'PENDING_APPROVAL'
            : 'UNASSESSED',
        completedAt: r.completed_at,
        createdAt: r.created_at,
      })),
      total?.total ?? 0,
      p,
      pp,
    );
  }

  // -------------------------------------------------------------- disputes
  async createDispute(user: AuthUser, dto: CreateDisputeDto) {
    const isStaff = user.permissions.includes('dispute.manage');
    const tenancy = await this.db.one<any>(
      `SELECT t.*, p.title AS property_title, p.city
         FROM tenancies t
         JOIN properties p ON p.id = t.property_id
        WHERE t.id = ? ${isStaff ? '' : 'AND (t.tenant_user_id = ? OR t.owner_user_id = ?)'}`,
      isStaff ? [dto.tenancyId] : [dto.tenancyId, user.id, user.id],
    );
    if (!tenancy) {
      throw new NotFoundException('Tenancy not found or you are not authorized for this tenancy.');
    }

    if (dto.amountClaimed !== undefined && dto.amountClaimed < 0) {
      throw new BadRequestException('Claim amount must be non-negative.');
    }

    const againstUserId = user.id === tenancy.tenant_user_id ? tenancy.owner_user_id : tenancy.tenant_user_id;

    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM disputes');
    const initialStatus = dto.initialEvidence ? 'EVIDENCE_SUBMITTED' : 'OPEN';

    const id = await this.db.insert('disputes', {
      public_id: newPublicId(),
      case_number: formatReference('DSP', (seq?.c ?? 0) + 1),
      tenancy_id: tenancy.id,
      raised_by: user.id,
      against_user_id: againstUserId,
      category: dto.category,
      amount_claimed: dto.amountClaimed ?? null,
      summary: dto.summary,
      detail: dto.detail ?? null,
      status: initialStatus,
    });

    if (dto.initialEvidence) {
      await this.db.insert('dispute_evidence', {
        dispute_id: id,
        submitted_by: user.id,
        evidence_type: dto.initialEvidence.evidenceType,
        document_id: dto.initialEvidence.documentId ?? null,
        inspection_id: dto.initialEvidence.inspectionId ?? null,
        payment_id: dto.initialEvidence.paymentId ?? null,
        description: dto.initialEvidence.description ?? null,
      });
    }

    // Ensure conversation exists for in-platform dispute messaging
    let conv = await this.db.one<{ id: number }>(
      "SELECT id FROM conversations WHERE context_type = 'DISPUTE' AND context_id = ?",
      [id],
    );
    if (!conv) {
      const convId = await this.db.insert('conversations', {
        context_type: 'DISPUTE',
        context_id: id,
      });
      conv = { id: convId };
    }
    // Add participants
    if (tenancy.tenant_user_id) {
      await this.db.execute(
        'INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
        [conv.id, tenancy.tenant_user_id],
      );
    }
    if (tenancy.owner_user_id) {
      await this.db.execute(
        'INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
        [conv.id, tenancy.owner_user_id],
      );
    }

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'DISPUTE',
      title: `Dispute opened: ${dto.category.toLowerCase().replace(/_/g, ' ')}`,
      actor_id: user.id,
      reference_type: 'dispute',
      reference_id: id,
    });

    if (againstUserId) {
      await this.notify.send(
        againstUserId,
        'MAINTENANCE_UPDATE',
        {
          title: 'A dispute was opened',
          body: dto.summary,
          actionUrl: `/dashboard/disputes/${id}`,
          severity: 'WARNING',
        },
      );
    }

    await this.audit.record({
      actor: user,
      action: 'dispute.opened',
      objectType: 'dispute',
      objectId: id,
      metadata: { tenancyId: tenancy.id, category: dto.category, amountClaimed: dto.amountClaimed },
    });

    const caseNumber = formatReference('DSP', (seq?.c ?? 0) + 1);
    return { id, caseNumber, status: initialStatus };
  }

  async listDisputes(
    user: AuthUser,
    query?: {
      status?: string;
      category?: string;
      assignedTo?: number;
      onlyResolved?: boolean | string;
      financialOnly?: boolean | string;
      mineOnly?: boolean | string;
    },
  ) {
    const staff = user.permissions.includes('dispute.manage') || user.permissions.includes('legal.case.manage');
    const where: string[] = [];
    const params: unknown[] = [];

    if (!staff) {
      where.push('(t.owner_user_id = ? OR t.tenant_user_id = ? OR d.raised_by = ?)');
      params.push(user.id, user.id, user.id);
    }

    if (query?.status && query.status !== 'ALL') {
      where.push('d.status = ?');
      params.push(query.status);
    }

    if (query?.category && query.category !== 'ALL') {
      where.push('d.category = ?');
      params.push(query.category);
    }

    if (query?.assignedTo) {
      where.push('d.assigned_to = ?');
      params.push(Number(query.assignedTo));
    }

    if (query?.mineOnly === true || query?.mineOnly === 'true') {
      if (staff) {
        where.push('d.assigned_to = ?');
        params.push(user.id);
      } else {
        where.push('d.raised_by = ?');
        params.push(user.id);
      }
    }

    if (query?.onlyResolved === true || query?.onlyResolved === 'true') {
      where.push("d.status IN ('RESOLVED','CLOSED','WITHDRAWN')");
    } else if (query?.onlyResolved === false || query?.onlyResolved === 'false') {
      where.push("d.status NOT IN ('RESOLVED','CLOSED','WITHDRAWN')");
    }

    if (query?.financialOnly === true || query?.financialOnly === 'true') {
      where.push('d.amount_claimed > 0');
    }

    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.query(
      `SELECT d.id, d.public_id, d.case_number, d.category, d.summary, d.detail, d.amount_claimed,
              d.status, d.created_at, d.updated_at, d.resolved_at, d.resolution,
              d.tenancy_id, d.raised_by, d.against_user_id, d.assigned_to, d.legal_case_id,
              t.stage AS tenancy_stage,
              p.id AS property_id, p.title AS property_title, p.locality, p.city,
              raiser.full_name AS raised_by_name,
              against.full_name AS against_user_name,
              assignee.full_name AS assigned_to_name,
              lc.case_number AS legal_case_number, lc.status AS legal_case_status,
              (SELECT COUNT(*) FROM dispute_evidence de WHERE de.dispute_id = d.id) AS evidence_count
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
         JOIN users raiser ON raiser.id = d.raised_by
         LEFT JOIN users against ON against.id = d.against_user_id
         LEFT JOIN users assignee ON assignee.id = d.assigned_to
         LEFT JOIN legal_cases lc ON lc.id = d.legal_case_id
         ${clause}
        ORDER BY d.created_at DESC LIMIT 150`,
      params,
    );
  }

  async disputeDetail(user: AuthUser, id: number) {
    const dispute = await this.db.one<any>(
      `SELECT d.*,
              t.owner_user_id, t.tenant_user_id, t.stage AS tenancy_stage, t.rent_amount,
              t.deposit_amount, t.start_date AS tenancy_start_date, t.end_date AS tenancy_end_date,
              p.id AS property_id, p.title AS property_title, p.city, p.locality, p.address_line1,
              raiser.full_name AS raised_by_name, raiser.email AS raised_by_email,
              against.full_name AS against_user_name, against.email AS against_user_email,
              assignee.full_name AS assigned_to_name, assignee.email AS assigned_to_email,
              lc.case_number AS legal_case_number, lc.status AS legal_case_status, lc.case_type AS legal_case_type
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
         JOIN users raiser ON raiser.id = d.raised_by
         LEFT JOIN users against ON against.id = d.against_user_id
         LEFT JOIN users assignee ON assignee.id = d.assigned_to
         LEFT JOIN legal_cases lc ON lc.id = d.legal_case_id
        WHERE d.id = ?`,
      [id],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    const isParty = [dispute.owner_user_id, dispute.tenant_user_id, dispute.raised_by].includes(user.id);
    const isStaff = user.permissions.includes('dispute.manage') || user.permissions.includes('legal.case.manage');

    if (!isParty && !isStaff) {
      throw new ForbiddenException('This dispute belongs to other parties.');
    }

    const [evidence, conversation, timeline, financialPayments] = await Promise.all([
      this.db.query(
        `SELECT de.id, de.evidence_type, de.description, de.created_at, de.document_id,
                de.inspection_id, de.payment_id, u.full_name AS submitted_by_name,
                doc.title AS document_title, doc.storage_key AS document_storage_key,
                insp.report_number AS inspection_report_number,
                pay.reference_code AS payment_reference, pay.amount AS payment_amount, pay.status AS payment_status
           FROM dispute_evidence de
           JOIN users u ON u.id = de.submitted_by
           LEFT JOIN documents doc ON doc.id = de.document_id
           LEFT JOIN inspections insp ON insp.id = de.inspection_id
           LEFT JOIN payments pay ON pay.id = de.payment_id
          WHERE de.dispute_id = ? ORDER BY de.created_at ASC`,
        [id],
      ),
      this.getDisputeConversation(id),
      this.db.query(
        `SELECT pt.id, pt.event_code, pt.title, pt.occurred_at AS created_at, u.full_name AS actor_name
           FROM property_timeline pt
           LEFT JOIN users u ON u.id = pt.actor_id
          WHERE pt.reference_type = 'dispute' AND pt.reference_id = ?
          ORDER BY pt.occurred_at DESC`,
        [id],
      ),
      this.db.query(
        `SELECT p.id, p.reference_code, p.purpose, p.amount, p.total_amount, p.status, p.due_date,
                p.notes, p.created_at, payer.full_name AS payer_name, payee.full_name AS payee_name
           FROM payments p
           JOIN users payer ON payer.id = p.payer_user_id
           LEFT JOIN users payee ON payee.id = p.payee_user_id
          WHERE p.tenancy_id = ? AND (p.notes LIKE '%Dispute%' OR p.notes LIKE CONCAT('%', ?, '%'))
          ORDER BY p.created_at DESC`,
        [dispute.tenancy_id, dispute.case_number],
      ),
    ]);

    return { dispute, evidence, conversation, timeline, financialPayments };
  }

  private async getDisputeConversation(disputeId: number) {
    let conv = await this.db.one<any>(
      "SELECT * FROM conversations WHERE context_type = 'DISPUTE' AND context_id = ?",
      [disputeId],
    );
    if (!conv) {
      const convId = await this.db.insert('conversations', {
        context_type: 'DISPUTE',
        context_id: disputeId,
      });
      conv = { id: convId, context_type: 'DISPUTE', context_id: disputeId };
    }

    const messages = await this.db.query(
      `SELECT m.id, m.body, m.document_id, m.created_at, m.sender_id,
              u.full_name AS sender_name, u.email AS sender_email
         FROM messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
        ORDER BY m.created_at ASC`,
      [conv.id],
    );

    return { id: conv.id, messages };
  }

  async addEvidence(user: AuthUser, disputeId: number, dto: DisputeEvidenceDto) {
    const dispute = await this.db.one<any>(
      `SELECT d.*, t.owner_user_id, t.tenant_user_id, p.id AS property_id
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
        WHERE d.id = ?`,
      [disputeId],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    const isParty = [dispute.owner_user_id, dispute.tenant_user_id, dispute.raised_by].includes(user.id);
    const isStaff = user.permissions.includes('dispute.manage');

    if (!isParty && !isStaff) {
      throw new ForbiddenException('This dispute belongs to other parties.');
    }

    const id = await this.db.insert('dispute_evidence', {
      dispute_id: disputeId,
      submitted_by: user.id,
      evidence_type: dto.evidenceType,
      document_id: dto.documentId ?? null,
      inspection_id: dto.inspectionId ?? null,
      payment_id: dto.paymentId ?? null,
      description: dto.description ?? null,
    });

    let nextStatus = dispute.status;
    if (dispute.status === 'OPEN') {
      nextStatus = 'EVIDENCE_SUBMITTED';
      await this.db.update('disputes', disputeId, { status: nextStatus });
    }

    await this.db.insert('property_timeline', {
      property_id: dispute.property_id,
      tenancy_id: dispute.tenancy_id,
      event_code: 'DISPUTE',
      title: `Evidence submitted for dispute: ${dispute.case_number}`,
      actor_id: user.id,
      reference_type: 'dispute',
      reference_id: disputeId,
    });

    await this.audit.record({
      actor: user,
      action: 'dispute.evidence_submitted',
      objectType: 'dispute',
      objectId: disputeId,
      metadata: { evidenceId: id, evidenceType: dto.evidenceType },
    });

    const notifyUser = user.id === dispute.tenant_user_id ? dispute.owner_user_id : dispute.tenant_user_id;
    if (notifyUser) {
      await this.notify.send(notifyUser, 'MAINTENANCE_UPDATE', {
        title: 'Dispute evidence submitted',
        body: `New evidence added for dispute ${dispute.case_number}.`,
        actionUrl: `/dashboard/disputes/${disputeId}`,
      });
    }

    return { id, status: nextStatus };
  }

  async assignDispute(user: AuthUser, id: number, dto: AssignDisputeDto) {
    if (!user.permissions.includes('dispute.manage') && !user.permissions.includes('user.manage')) {
      throw new ForbiddenException('Only authorized Odibrick staff can assign disputes.');
    }

    const dispute = await this.db.one<any>(
      `SELECT d.*, p.id AS property_id FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
        WHERE d.id = ?`,
      [id],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    const targetUser = await this.db.one<any>('SELECT id, full_name, email FROM users WHERE id = ?', [dto.assignedTo]);
    if (!targetUser) throw new NotFoundException('Assigned staff user does not exist.');

    const previousAssignee = dispute.assigned_to;
    const nextStatus = ['OPEN', 'EVIDENCE_SUBMITTED'].includes(dispute.status) ? 'UNDER_REVIEW' : dispute.status;

    await this.db.update('disputes', id, {
      assigned_to: dto.assignedTo,
      status: nextStatus,
    });

    await this.audit.record({
      actor: user,
      action: previousAssignee ? 'dispute.reassigned' : 'dispute.assigned',
      objectType: 'dispute',
      objectId: id,
      metadata: { assignedTo: dto.assignedTo, previousAssignee, nextStatus },
    });

    await this.notify.send(dto.assignedTo, 'MAINTENANCE_UPDATE', {
      title: 'Dispute assigned to you',
      body: `You have been assigned to review dispute ${dispute.case_number}.`,
      actionUrl: `/dashboard/disputes/${id}`,
      severity: 'ACTION',
    });

    return { id, assignedTo: dto.assignedTo, status: nextStatus };
  }

  async escalateToLegal(user: AuthUser, id: number, dto: EscalateDisputeDto) {
    if (!user.permissions.includes('dispute.manage') && !user.permissions.includes('legal.case.manage')) {
      throw new ForbiddenException('Only Odibrick Management or Legal Lead can escalate disputes to Legal.');
    }

    const dispute = await this.db.one<any>(
      `SELECT d.*, t.id AS tenancy_id, t.tenant_user_id, t.owner_user_id, p.id AS property_id, p.city
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
        WHERE d.id = ?`,
      [id],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    let legalCaseId = dispute.legal_case_id;

    if (!legalCaseId) {
      const seq = await this.db.one<{ c: number }>('SELECT COALESCE(MAX(id), 0) AS c FROM legal_cases');
      const initialLegalStatus = dto.advocateUserId ? 'DOCUMENT_REVIEW' : 'QUEUED';
      legalCaseId = await this.db.insert('legal_cases', {
        public_id: newPublicId(),
        case_number: formatReference('LGL', (seq?.c ?? 0) + 1),
        tenancy_id: dispute.tenancy_id,
        case_type: 'DISPUTE',
        status: initialLegalStatus,
        priority: dto.priority ?? 'HIGH',
        assigned_to: dto.advocateUserId ?? null,
        jurisdiction: dispute.city ?? 'Bengaluru',
      });
    } else if (dto.advocateUserId) {
      await this.db.update('legal_cases', legalCaseId, { assigned_to: dto.advocateUserId });
    }

    await this.db.update('disputes', id, {
      legal_case_id: legalCaseId,
      status: 'LEGAL_REVIEW',
    });

    await this.db.insert('property_timeline', {
      property_id: dispute.property_id,
      tenancy_id: dispute.tenancy_id,
      event_code: 'DISPUTE',
      title: `Dispute escalated to legal review: ${dispute.case_number}`,
      actor_id: user.id,
      reference_type: 'dispute',
      reference_id: id,
    });

    await this.audit.record({
      actor: user,
      action: 'dispute.legal_escalated',
      objectType: 'dispute',
      objectId: id,
      metadata: { legalCaseId, reason: dto.reason, priority: dto.priority },
    });

    if (dispute.tenant_user_id) {
      await this.notify.send(dispute.tenant_user_id, 'MAINTENANCE_UPDATE', {
        title: 'Dispute escalated to Legal',
        body: `Dispute ${dispute.case_number} has been transferred to the Legal Review queue.`,
        actionUrl: `/dashboard/disputes/${id}`,
        severity: 'WARNING',
      });
    }

    if (dispute.owner_user_id) {
      await this.notify.send(dispute.owner_user_id, 'MAINTENANCE_UPDATE', {
        title: 'Dispute escalated to Legal',
        body: `Dispute ${dispute.case_number} has been transferred to the Legal Review queue.`,
        actionUrl: `/dashboard/disputes/${id}`,
        severity: 'WARNING',
      });
    }

    if (dto.advocateUserId) {
      await this.notify.send(dto.advocateUserId, 'LEGAL_ASSIGNMENT', {
        title: 'Legal dispute case assigned',
        body: `You have been assigned to handle legal dispute ${dispute.case_number}.`,
        actionUrl: `/dashboard/legal`,
        severity: 'ACTION',
      });
    }

    return { id, legalCaseId, status: 'LEGAL_REVIEW' };
  }

  async resolveDispute(user: AuthUser, id: number, dto: ResolveDisputeDto) {
    if (!user.permissions.includes('dispute.manage')) {
      throw new ForbiddenException('Only Odibrick Management has authority to record binding dispute resolutions.');
    }

    const dispute = await this.db.one<any>(
      `SELECT d.*, t.tenant_user_id, t.owner_user_id, p.id AS property_id
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
        WHERE d.id = ?`,
      [id],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    if (['RESOLVED', 'CLOSED'].includes(dispute.status)) {
      throw new BadRequestException(`Dispute is already ${dispute.status.toLowerCase()}. Reopen if you need to adjust.`);
    }

    let paymentId: number | undefined;

    if (dto.financialDecision) {
      const { amount, payerUserId, payeeUserId, purpose, dueDate, notes } = dto.financialDecision;
      if (amount <= 0) {
        throw new BadRequestException('Financial decision amount must be greater than zero.');
      }

      // Re-use standard PaymentsService
      paymentId = await this.payments.createPayment({
        payerUserId,
        payeeUserId: payeeUserId ?? null,
        tenancyId: dispute.tenancy_id,
        propertyId: dispute.property_id,
        purpose,
        amount,
        dueDate: dueDate ?? new Date().toISOString().slice(0, 10),
        notes: notes ?? `Financial adjustment for dispute ${dispute.case_number}: ${dto.resolution.slice(0, 100)}`,
      });

      await this.audit.record({
        actor: user,
        action: 'dispute.financial_created',
        objectType: 'dispute',
        objectId: id,
        metadata: { paymentId, amount, purpose, payerUserId, payeeUserId },
      });
    }

    const nextStatus = dto.status ?? 'RESOLVED';
    await this.db.update('disputes', id, {
      status: nextStatus,
      resolution: dto.resolution,
      resolved_at: new Date(),
    });

    await this.db.insert('property_timeline', {
      property_id: dispute.property_id,
      tenancy_id: dispute.tenancy_id,
      event_code: 'DISPUTE',
      title: `Dispute resolved by Odibrick Management: ${dispute.case_number}`,
      actor_id: user.id,
      reference_type: 'dispute',
      reference_id: id,
    });

    await this.audit.record({
      actor: user,
      action: 'dispute.resolved',
      objectType: 'dispute',
      objectId: id,
      metadata: { status: nextStatus, hasFinancialResolution: !!paymentId, paymentId },
    });

    const notifyParty = async (targetId: number) => {
      await this.notify.send(targetId, 'MAINTENANCE_UPDATE', {
        title: `Dispute ${dispute.case_number} Resolved`,
        body: `Odibrick Management has recorded a resolution: ${dto.resolution.slice(0, 120)}`,
        actionUrl: `/dashboard/disputes/${id}`,
        severity: 'ACTION',
      });
    };

    if (dispute.tenant_user_id) await notifyParty(dispute.tenant_user_id);
    if (dispute.owner_user_id) await notifyParty(dispute.owner_user_id);

    return { id, status: nextStatus, resolution: dto.resolution, paymentId };
  }

  async reopenDispute(user: AuthUser, id: number, dto: ReopenDisputeDto) {
    if (!user.permissions.includes('dispute.manage')) {
      throw new ForbiddenException('Only Odibrick Management can reopen a closed or resolved dispute.');
    }

    const dispute = await this.db.one<any>(
      `SELECT d.*, t.tenant_user_id, t.owner_user_id, p.id AS property_id
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
        WHERE d.id = ?`,
      [id],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    if (!['RESOLVED', 'CLOSED', 'WITHDRAWN'].includes(dispute.status)) {
      throw new BadRequestException('Only resolved, closed, or withdrawn disputes can be reopened.');
    }

    const updatedResolution = dispute.resolution
      ? `${dispute.resolution}\n\n[Reopened on ${new Date().toISOString().slice(0, 10)} by ${user.fullName}: ${dto.reason}]`
      : `[Reopened on ${new Date().toISOString().slice(0, 10)} by ${user.fullName}: ${dto.reason}]`;

    await this.db.update('disputes', id, {
      status: 'UNDER_REVIEW',
      resolution: updatedResolution,
    });

    await this.db.insert('property_timeline', {
      property_id: dispute.property_id,
      tenancy_id: dispute.tenancy_id,
      event_code: 'DISPUTE',
      title: `Dispute reopened for review: ${dispute.case_number}`,
      actor_id: user.id,
      reference_type: 'dispute',
      reference_id: id,
    });

    await this.audit.record({
      actor: user,
      action: 'dispute.reopened',
      objectType: 'dispute',
      objectId: id,
      metadata: { reason: dto.reason },
    });

    if (dispute.tenant_user_id) {
      await this.notify.send(dispute.tenant_user_id, 'MAINTENANCE_UPDATE', {
        title: `Dispute ${dispute.case_number} Reopened`,
        body: `Dispute has been reopened for further review: ${dto.reason}`,
        actionUrl: `/dashboard/disputes/${id}`,
      });
    }

    if (dispute.owner_user_id) {
      await this.notify.send(dispute.owner_user_id, 'MAINTENANCE_UPDATE', {
        title: `Dispute ${dispute.case_number} Reopened`,
        body: `Dispute has been reopened for further review: ${dto.reason}`,
        actionUrl: `/dashboard/disputes/${id}`,
      });
    }

    return { id, status: 'UNDER_REVIEW' };
  }

  async closeDispute(user: AuthUser, id: number, dto?: CloseDisputeDto) {
    if (!user.permissions.includes('dispute.manage')) {
      throw new ForbiddenException('Only Odibrick Management can close disputes.');
    }

    const dispute = await this.db.one<any>(
      `SELECT d.*, t.tenant_user_id, t.owner_user_id, p.id AS property_id
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
        WHERE d.id = ?`,
      [id],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    if (dispute.status === 'CLOSED') {
      throw new BadRequestException('Dispute is already closed.');
    }

    await this.db.update('disputes', id, {
      status: 'CLOSED',
      resolved_at: dispute.resolved_at ?? new Date(),
    });

    await this.audit.record({
      actor: user,
      action: 'dispute.closed',
      objectType: 'dispute',
      objectId: id,
      metadata: { reason: dto?.reason },
    });

    return { id, status: 'CLOSED' };
  }

  async getDisputeMessages(user: AuthUser, disputeId: number) {
    const dispute = await this.db.one<any>(
      `SELECT d.*, t.tenant_user_id, t.owner_user_id FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id WHERE d.id = ?`,
      [disputeId],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    const isParty = [dispute.owner_user_id, dispute.tenant_user_id, dispute.raised_by].includes(user.id);
    const isStaff = user.permissions.includes('dispute.manage') || user.permissions.includes('legal.case.manage');

    if (!isParty && !isStaff) {
      throw new ForbiddenException('This dispute conversation belongs to other parties.');
    }

    return this.getDisputeConversation(disputeId);
  }

  async sendDisputeMessage(user: AuthUser, disputeId: number, dto: DisputeMessageDto) {
    const dispute = await this.db.one<any>(
      `SELECT d.*, t.tenant_user_id, t.owner_user_id, p.id AS property_id
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
        WHERE d.id = ?`,
      [disputeId],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');

    const isParty = [dispute.owner_user_id, dispute.tenant_user_id, dispute.raised_by].includes(user.id);
    const isStaff = user.permissions.includes('dispute.manage') || user.permissions.includes('legal.case.manage');

    if (!isParty && !isStaff) {
      throw new ForbiddenException('You cannot participate in this dispute conversation.');
    }

    let conv = await this.db.one<{ id: number }>(
      "SELECT id FROM conversations WHERE context_type = 'DISPUTE' AND context_id = ?",
      [disputeId],
    );
    if (!conv) {
      const convId = await this.db.insert('conversations', {
        context_type: 'DISPUTE',
        context_id: disputeId,
      });
      conv = { id: convId };
    }

    await this.db.execute(
      'INSERT IGNORE INTO conversation_participants (conversation_id, user_id) VALUES (?, ?)',
      [conv.id, user.id],
    );

    const messageId = await this.db.insert('messages', {
      conversation_id: conv.id,
      sender_id: user.id,
      body: dto.body,
      document_id: dto.documentId ?? null,
    });

    if (dto.isEvidenceRequest) {
      await this.audit.record({
        actor: user,
        action: 'dispute.evidence_requested',
        objectType: 'dispute',
        objectId: disputeId,
        metadata: { requestType: dto.requestType, body: dto.body },
      });

      // Send action-required notification to parties
      const notifyUsers = [dispute.tenant_user_id, dispute.owner_user_id].filter(
        (uid) => uid && uid !== user.id,
      );
      for (const targetId of notifyUsers) {
        await this.notify.send(targetId, 'MAINTENANCE_UPDATE', {
          title: `Evidence Requested: Dispute ${dispute.case_number}`,
          body: dto.body.slice(0, 150),
          actionUrl: `/dashboard/disputes/${disputeId}`,
          severity: 'ACTION',
        });
      }
    } else {
      await this.audit.record({
        actor: user,
        action: 'dispute.message_sent',
        objectType: 'dispute',
        objectId: disputeId,
        metadata: { messageId },
      });

      const notifyUsers = [dispute.tenant_user_id, dispute.owner_user_id, dispute.assigned_to].filter(
        (uid) => uid && uid !== user.id,
      );
      for (const targetId of notifyUsers) {
        await this.notify.send(targetId, 'MAINTENANCE_UPDATE', {
          title: `New message on Dispute ${dispute.case_number}`,
          body: `${user.fullName}: ${dto.body.slice(0, 120)}`,
          actionUrl: `/dashboard/disputes/${disputeId}`,
        });
      }
    }

    return { id: messageId, conversationId: conv.id };
  }

  async updateDispute(user: AuthUser, id: number, status: string, resolution?: string) {
    if (!user.permissions.includes('dispute.manage')) {
      throw new ForbiddenException('Only the Odibrick disputes team can update this.');
    }
    await this.db.update('disputes', id, {
      status,
      assigned_to: user.id,
      resolution: resolution ?? undefined,
      resolved_at: ['RESOLVED', 'CLOSED'].includes(status) ? new Date() : undefined,
    });
    await this.audit.record({
      actor: user, action: 'dispute.updated', objectType: 'dispute', objectId: id, metadata: { status },
    });
    return { id, status };
  }

  // --------------------------------------------------------------- support
  async createTicket(user: AuthUser, dto: CreateTicketDto) {
    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM support_tickets');
    const id = await this.db.insert('support_tickets', {
      public_id: newPublicId(),
      ticket_number: formatReference('SUP', (seq?.c ?? 0) + 1),
      user_id: user.id,
      property_id: dto.propertyId ?? null,
      tenancy_id: dto.tenancyId ?? null,
      category: dto.category ?? 'OTHER',
      priority: dto.priority ?? 'NORMAL',
      subject: dto.subject,
      description: dto.description ?? null,
    });
    return { id, status: 'OPEN' };
  }

  async listTickets(user: AuthUser, status?: string) {
    const staff = user.permissions.includes('support.manage');
    const where: string[] = [];
    const params: unknown[] = [];
    if (!staff) {
      where.push('t.user_id = ?');
      params.push(user.id);
    }
    if (status) {
      where.push('t.status = ?');
      params.push(status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.query(
      `SELECT t.id, t.ticket_number, t.category, t.priority, t.subject, t.status, t.created_at,
              u.full_name AS requester, assignee.full_name AS assigned_to_name
         FROM support_tickets t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN users assignee ON assignee.id = t.assigned_to
         ${clause}
        ORDER BY FIELD(t.priority,'URGENT','HIGH','NORMAL','LOW'), t.created_at DESC LIMIT 100`,
      params,
    );
  }

  async ticketDetail(user: AuthUser, id: number) {
    const ticket = await this.db.one<any>(
      `SELECT t.*, u.full_name AS requester FROM support_tickets t JOIN users u ON u.id = t.user_id WHERE t.id = ?`,
      [id],
    );
    if (!ticket) throw new NotFoundException('Ticket not found.');
    const staff = user.permissions.includes('support.manage');
    if (ticket.user_id !== user.id && !staff) throw new ForbiddenException('This ticket belongs to another account.');

    const messages = await this.db.query(
      `SELECT m.id, m.body, m.is_internal, m.created_at, u.full_name AS author
         FROM ticket_messages m JOIN users u ON u.id = m.author_id
        WHERE m.ticket_id = ? ${staff ? '' : 'AND m.is_internal = 0'}
        ORDER BY m.created_at`,
      [id],
    );
    return { ticket, messages };
  }

  async replyTicket(user: AuthUser, id: number, dto: TicketMessageDto) {
    const ticket = await this.db.one<any>('SELECT * FROM support_tickets WHERE id = ?', [id]);
    if (!ticket) throw new NotFoundException('Ticket not found.');
    const staff = user.permissions.includes('support.manage');
    if (ticket.user_id !== user.id && !staff) throw new ForbiddenException('This ticket belongs to another account.');
    if (dto.isInternal && !staff) throw new BadRequestException('Internal notes are for the support team.');

    const messageId = await this.db.insert('ticket_messages', {
      ticket_id: id,
      author_id: user.id,
      is_internal: dto.isInternal ? 1 : 0,
      body: dto.body,
    });
    await this.db.update('support_tickets', id, {
      status: dto.status ?? (staff ? 'IN_PROGRESS' : 'OPEN'),
      assigned_to: staff ? user.id : ticket.assigned_to,
      first_response_at: staff && !ticket.first_response_at ? new Date() : undefined,
      resolved_at: dto.status === 'RESOLVED' ? new Date() : undefined,
    });
    if (staff && !dto.isInternal) {
      await this.notify.send(ticket.user_id, 'MAINTENANCE_UPDATE', {
        title: 'Support replied',
        body: `${ticket.ticket_number}: ${dto.body.slice(0, 120)}`,
        actionUrl: '/dashboard/support',
      });
    }
    return { id: messageId };
  }
}
