import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { formatReference, newPublicId } from '../../common/util/ids';
import { pageParams, paginate } from '../../common/util/pagination';
import {
  CreateDisputeDto, CreateMaintenanceDto, CreateTicketDto, DisputeEvidenceDto,
  MaintenanceUpdateDto, TicketMessageDto,
} from './operations.dto';

@Injectable()
export class OperationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  // ----------------------------------------------------------- maintenance
  async createMaintenance(user: AuthUser, dto: CreateMaintenanceDto) {
    const tenancy = await this.db.one<any>(
      'SELECT * FROM tenancies WHERE id = ? AND (tenant_user_id = ? OR owner_user_id = ?)',
      [dto.tenancyId, user.id, user.id],
    );
    if (!tenancy) throw new NotFoundException('Tenancy not found.');

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
      status: 'OWNER_REVIEW',
    });

    if (dto.documentIds?.length) {
      await this.db.execute(
        `UPDATE documents SET entity_type = 'maintenance', entity_id = ?, category = 'MAINTENANCE'
          WHERE owner_user_id = ? AND id IN (${dto.documentIds.map(() => '?').join(',')})`,
        [id, user.id, ...dto.documentIds],
      );
    }

    const notifyUser = user.id === tenancy.tenant_user_id ? tenancy.owner_user_id : tenancy.tenant_user_id;
    await this.notify.send(notifyUser, 'MAINTENANCE_UPDATE', {
      title: dto.priority === 'EMERGENCY' ? 'Emergency maintenance request' : 'New maintenance request',
      body: dto.title,
      actionUrl: '/dashboard/maintenance',
      severity: dto.priority === 'EMERGENCY' ? 'CRITICAL' : 'ACTION',
    });
    await this.audit.record({ actor: user, action: 'maintenance.created', objectType: 'maintenance', objectId: id });
    return { id, status: 'OWNER_REVIEW' };
  }

  async listMaintenance(user: AuthUser, status?: string, page?: number) {
    const { page: p, perPage: pp, offset } = pageParams(page, 25);
    const where = ['(m.raised_by = ? OR t.owner_user_id = ? OR t.tenant_user_id = ?)'];
    const params: unknown[] = [user.id, user.id, user.id];
    if (user.permissions.includes('maintenance.manage')) {
      where.length = 0;
      params.length = 0;
    }
    if (status) {
      where.push('m.status = ?');
      params.push(status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await this.db.query(
      `SELECT m.id, m.ticket_number, m.category, m.priority, m.title, m.status, m.cost_bearer,
              m.estimated_cost, m.final_cost, m.scheduled_for, m.created_at,
              p.title AS property_title, p.locality, p.city, u.full_name AS raised_by_name
         FROM maintenance_requests m
         LEFT JOIN tenancies t ON t.id = m.tenancy_id
         JOIN properties p ON p.id = m.property_id
         JOIN users u ON u.id = m.raised_by
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
      `SELECT m.*, p.title AS property_title, p.locality, p.city,
              t.owner_user_id, t.tenant_user_id, u.full_name AS raised_by_name
         FROM maintenance_requests m
         JOIN properties p ON p.id = m.property_id
         LEFT JOIN tenancies t ON t.id = m.tenancy_id
         JOIN users u ON u.id = m.raised_by
        WHERE m.id = ?`,
      [id],
    );
    if (!request) throw new NotFoundException('Request not found.');
    const updates = await this.db.query(
      `SELECT mu.id, mu.status_from, mu.status_to, mu.message, mu.created_at, u.full_name AS author
         FROM maintenance_updates mu JOIN users u ON u.id = mu.author_id
        WHERE mu.request_id = ? ORDER BY mu.created_at`,
      [id],
    );
    return { request, updates };
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

    await this.db.update('maintenance_requests', id, {
      status: dto.status,
      cost_bearer: dto.costBearer,
      estimated_cost: dto.estimatedCost,
      final_cost: dto.finalCost,
      vendor_name: dto.vendorName,
      vendor_phone: dto.vendorPhone,
      scheduled_for: dto.scheduledFor,
      owner_decision_note: dto.note,
      completed_at: dto.status === 'COMPLETED' ? new Date() : undefined,
    });
    await this.db.insert('maintenance_updates', {
      request_id: id,
      author_id: user.id,
      status_from: request.status,
      status_to: dto.status ?? request.status,
      message: dto.note ?? null,
    });

    if (dto.status === 'COMPLETED' || dto.status === 'APPROVED' || dto.status === 'REJECTED') {
      await this.db.insert('property_timeline', {
        property_id: request.property_id,
        tenancy_id: request.tenancy_id,
        event_code: 'MAINTENANCE_EVENT',
        title: `${request.title} — ${dto.status?.toLowerCase()}`,
        actor_id: user.id,
        reference_type: 'maintenance',
        reference_id: id,
      });
    }

    const counterparty = user.id === request.tenant_user_id ? request.owner_user_id : request.tenant_user_id;
    if (counterparty) {
      await this.notify.send(counterparty, 'MAINTENANCE_UPDATE', {
        title: 'Maintenance update',
        body: `${request.ticket_number} is now ${(dto.status ?? request.status).toLowerCase().replace('_', ' ')}.`,
        actionUrl: '/dashboard/maintenance',
      });
    }
    return { id, status: dto.status ?? request.status };
  }

  // -------------------------------------------------------------- disputes
  async createDispute(user: AuthUser, dto: CreateDisputeDto) {
    const tenancy = await this.db.one<any>(
      'SELECT * FROM tenancies WHERE id = ? AND (tenant_user_id = ? OR owner_user_id = ?)',
      [dto.tenancyId, user.id, user.id],
    );
    if (!tenancy) throw new NotFoundException('Tenancy not found.');

    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM disputes');
    const id = await this.db.insert('disputes', {
      public_id: newPublicId(),
      case_number: formatReference('DSP', (seq?.c ?? 0) + 1),
      tenancy_id: tenancy.id,
      raised_by: user.id,
      against_user_id: user.id === tenancy.tenant_user_id ? tenancy.owner_user_id : tenancy.tenant_user_id,
      category: dto.category,
      amount_claimed: dto.amountClaimed ?? null,
      summary: dto.summary,
      detail: dto.detail ?? null,
      status: 'OPEN',
    });

    await this.db.insert('property_timeline', {
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      event_code: 'DISPUTE',
      title: `Dispute opened: ${dto.category.toLowerCase().replace('_', ' ')}`,
      actor_id: user.id,
      reference_type: 'dispute',
      reference_id: id,
    });
    await this.notify.send(
      user.id === tenancy.tenant_user_id ? tenancy.owner_user_id : tenancy.tenant_user_id,
      'MAINTENANCE_UPDATE',
      {
        title: 'A dispute was opened',
        body: dto.summary,
        actionUrl: '/dashboard/disputes',
        severity: 'WARNING',
      },
    );
    await this.audit.record({ actor: user, action: 'dispute.opened', objectType: 'dispute', objectId: id });
    return { id, status: 'OPEN' };
  }

  async addEvidence(user: AuthUser, disputeId: number, dto: DisputeEvidenceDto) {
    const dispute = await this.db.one<any>(
      `SELECT d.*, t.owner_user_id, t.tenant_user_id FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id WHERE d.id = ?`,
      [disputeId],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (![dispute.owner_user_id, dispute.tenant_user_id].includes(user.id) && !user.permissions.includes('dispute.manage')) {
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
    if (dispute.status === 'OPEN') {
      await this.db.update('disputes', disputeId, { status: 'EVIDENCE_SUBMITTED' });
    }
    return { id };
  }

  async listDisputes(user: AuthUser, status?: string) {
    const staff = user.permissions.includes('dispute.manage');
    const where: string[] = [];
    const params: unknown[] = [];
    if (!staff) {
      where.push('(t.owner_user_id = ? OR t.tenant_user_id = ?)');
      params.push(user.id, user.id);
    }
    if (status) {
      where.push('d.status = ?');
      params.push(status);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    return this.db.query(
      `SELECT d.id, d.case_number, d.category, d.summary, d.amount_claimed, d.status, d.created_at,
              p.title AS property_title, raiser.full_name AS raised_by_name,
              (SELECT COUNT(*) FROM dispute_evidence de WHERE de.dispute_id = d.id) AS evidence_count
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
         JOIN users raiser ON raiser.id = d.raised_by
         ${clause}
        ORDER BY d.created_at DESC LIMIT 100`,
      params,
    );
  }

  async disputeDetail(user: AuthUser, id: number) {
    const dispute = await this.db.one<any>(
      `SELECT d.*, t.owner_user_id, t.tenant_user_id, t.deposit_amount,
              p.title AS property_title, p.city,
              raiser.full_name AS raised_by_name
         FROM disputes d
         JOIN tenancies t ON t.id = d.tenancy_id
         JOIN properties p ON p.id = t.property_id
         JOIN users raiser ON raiser.id = d.raised_by
        WHERE d.id = ?`,
      [id],
    );
    if (!dispute) throw new NotFoundException('Dispute not found.');
    if (![dispute.owner_user_id, dispute.tenant_user_id].includes(user.id) && !user.permissions.includes('dispute.manage')) {
      throw new ForbiddenException('This dispute belongs to other parties.');
    }
    const evidence = await this.db.query(
      `SELECT de.id, de.evidence_type, de.description, de.created_at, de.document_id, de.inspection_id,
              de.payment_id, u.full_name AS submitted_by
         FROM dispute_evidence de JOIN users u ON u.id = de.submitted_by
        WHERE de.dispute_id = ? ORDER BY de.created_at`,
      [id],
    );
    return { dispute, evidence };
  }

  /**
   * Staff move a dispute along and record a proposed resolution. The platform
   * documents the outcome the parties reach; it does not adjudicate, and no
   * automated decision is made here.
   */
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
