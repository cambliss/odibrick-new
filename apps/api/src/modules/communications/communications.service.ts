import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import {
  AdminConversationsQueryDto,
  AssignConversationDto,
  CloseConversationDto,
  ConversationContextType,
  ConversationStatus,
  CreateConversationDto,
  EditMessageDto,
  EscalateConversationDto,
  ListConversationsQueryDto,
  MessageType,
  ParticipantRole,
  ReopenConversationDto,
  ResolveConversationDto,
  SendInternalNoteDto,
  SendMessageDto,
} from './communications.dto';

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  private isStaffUser(user: AuthUser): boolean {
    return (
      user.roles.some((r) => ['SUPER_ADMIN', 'ADMIN'].includes(r)) ||
      user.permissions.includes('conversation.manage') ||
      user.permissions.includes('admin.access')
    );
  }

  private canManageInternalNotes(user: AuthUser): boolean {
    return (
      this.isStaffUser(user) ||
      user.permissions.includes('conversation.internal_note')
    );
  }

  /**
   * Helper to resolve related parties and title for any business context
   */
  async resolveContextMetadata(contextType: ConversationContextType, contextId: number): Promise<{
    title: string;
    propertyId?: number;
    parties: Array<{ userId: number; role: ParticipantRole }>;
  }> {
    const parties: Array<{ userId: number; role: ParticipantRole }> = [];
    let title = `${contextType} #${contextId}`;
    let propertyId: number | undefined;

    switch (contextType) {
      case ConversationContextType.ENQUIRY: {
        const row = await this.db.one<any>(
          `SELECT e.*, p.id AS prop_id, p.title AS prop_title, p.city,
                  COALESCE(o.user_id, p.listed_by_user_id) AS owner_user_id,
                  ag.user_id AS assigned_agent_id
             FROM enquiries e
             JOIN properties p ON p.id = e.property_id
             LEFT JOIN owners o ON o.id = p.owner_id
             LEFT JOIN agents ag ON ag.id = p.agent_id
            WHERE e.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Enquiry #${contextId} not found.`);
        title = `Enquiry: ${row.prop_title} (${row.city})`;
        propertyId = row.prop_id;
        const customerId = row.tenant_user_id || row.user_id;
        if (customerId) parties.push({ userId: customerId, role: ParticipantRole.CUSTOMER });
        if (row.owner_user_id) parties.push({ userId: row.owner_user_id, role: ParticipantRole.OWNER });
        if (row.assigned_user_id) parties.push({ userId: row.assigned_user_id, role: ParticipantRole.AGENT });
        else if (row.assigned_agent_id) parties.push({ userId: row.assigned_agent_id, role: ParticipantRole.AGENT });
        break;
      }

      case ConversationContextType.VISIT: {
        const row = await this.db.one<any>(
          `SELECT pv.*, p.id AS prop_id, p.title AS prop_title, p.city,
                  COALESCE(o.user_id, p.listed_by_user_id) AS owner_user_id,
                  ag.user_id AS assigned_agent_id
             FROM property_visits pv
             JOIN properties p ON p.id = pv.property_id
             LEFT JOIN owners o ON o.id = p.owner_id
             LEFT JOIN agents ag ON ag.id = p.agent_id
            WHERE pv.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Property Visit #${contextId} not found.`);
        title = `Visit: ${row.prop_title} (${row.visit_number || row.id})`;
        propertyId = row.prop_id;
        if (row.customer_user_id) parties.push({ userId: row.customer_user_id, role: ParticipantRole.CUSTOMER });
        if (row.host_user_id) parties.push({ userId: row.host_user_id, role: ParticipantRole.PROVIDER });
        if (row.owner_user_id && row.owner_user_id !== row.host_user_id) {
          parties.push({ userId: row.owner_user_id, role: ParticipantRole.OWNER });
        }
        break;
      }

      case ConversationContextType.APPLICATION: {
        const row = await this.db.one<any>(
          `SELECT a.*, p.id AS prop_id, p.title AS prop_title, p.city,
                  COALESCE(o.user_id, p.listed_by_user_id) AS owner_user_id,
                  ag.user_id AS assigned_agent_id
             FROM applications a
             JOIN properties p ON p.id = a.property_id
             LEFT JOIN owners o ON o.id = p.owner_id
             LEFT JOIN agents ag ON ag.id = p.agent_id
            WHERE a.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Application #${contextId} not found.`);
        title = `Application: ${row.prop_title} (${row.application_number || row.id})`;
        propertyId = row.prop_id;
        const customerId = row.tenant_user_id || row.user_id;
        if (customerId) parties.push({ userId: customerId, role: ParticipantRole.CUSTOMER });
        if (row.owner_user_id) parties.push({ userId: row.owner_user_id, role: ParticipantRole.OWNER });
        if (row.assigned_agent_id) parties.push({ userId: row.assigned_agent_id, role: ParticipantRole.AGENT });
        break;
      }

      case ConversationContextType.PROPERTY: {
        const row = await this.db.one<any>(
          `SELECT p.*, p.id AS prop_id, p.title AS prop_title, p.city,
                  COALESCE(o.user_id, p.listed_by_user_id) AS owner_user_id,
                  ag.user_id AS assigned_agent_id
             FROM properties p
             LEFT JOIN owners o ON o.id = p.owner_id
             LEFT JOIN agents ag ON ag.id = p.agent_id
            WHERE p.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Property #${contextId} not found.`);
        title = `Property: ${row.prop_title} (${row.city})`;
        propertyId = row.prop_id;
        if (row.owner_user_id) parties.push({ userId: row.owner_user_id, role: ParticipantRole.OWNER });
        if (row.assigned_agent_id) parties.push({ userId: row.assigned_agent_id, role: ParticipantRole.AGENT });
        break;
      }

      case ConversationContextType.TENANCY: {
        const row = await this.db.one<any>(
          `SELECT t.*, p.id AS prop_id, p.title AS prop_title, p.city,
                  ag.user_id AS assigned_agent_id
             FROM tenancies t
             JOIN properties p ON p.id = t.property_id
             LEFT JOIN agents ag ON ag.id = p.agent_id
            WHERE t.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Tenancy #${contextId} not found.`);
        title = `Tenancy: ${row.prop_title} (${row.id})`;
        propertyId = row.prop_id;
        if (row.tenant_user_id) parties.push({ userId: row.tenant_user_id, role: ParticipantRole.CUSTOMER });
        if (row.owner_user_id) parties.push({ userId: row.owner_user_id, role: ParticipantRole.OWNER });
        if (row.assigned_agent_id) parties.push({ userId: row.assigned_agent_id, role: ParticipantRole.AGENT });
        break;
      }

      case ConversationContextType.MAINTENANCE: {
        const row = await this.db.one<any>(
          `SELECT mr.*, t.tenant_user_id, t.owner_user_id AS tenancy_owner_id,
                  p.id AS prop_id, p.title AS prop_title,
                  COALESCE(o.user_id, p.listed_by_user_id) AS owner_user_id,
                  ag.user_id AS assigned_agent_id
             FROM maintenance_requests mr
             LEFT JOIN tenancies t ON t.id = mr.tenancy_id
             JOIN properties p ON p.id = mr.property_id
             LEFT JOIN owners o ON o.id = p.owner_id
             LEFT JOIN agents ag ON ag.id = p.agent_id
            WHERE mr.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Maintenance ticket #${contextId} not found.`);
        title = `Maintenance: ${row.ticket_number} - ${row.title}`;
        propertyId = row.prop_id;
        if (row.raised_by) parties.push({ userId: row.raised_by, role: ParticipantRole.CUSTOMER });
        if (row.owner_user_id) parties.push({ userId: row.owner_user_id, role: ParticipantRole.OWNER });
        else if (row.tenancy_owner_id) parties.push({ userId: row.tenancy_owner_id, role: ParticipantRole.OWNER });
        if (row.assigned_agent_id) parties.push({ userId: row.assigned_agent_id, role: ParticipantRole.AGENT });
        break;
      }

      case ConversationContextType.DISPUTE: {
        const row = await this.db.one<any>(
          `SELECT d.*, t.tenant_user_id, t.owner_user_id, p.id AS prop_id, p.title AS prop_title
             FROM disputes d
             JOIN tenancies t ON t.id = d.tenancy_id
             JOIN properties p ON p.id = t.property_id
            WHERE d.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Dispute #${contextId} not found.`);
        title = `Dispute: ${row.case_number} (${row.category})`;
        propertyId = row.prop_id;
        if (row.tenant_user_id) parties.push({ userId: row.tenant_user_id, role: ParticipantRole.CUSTOMER });
        if (row.owner_user_id) parties.push({ userId: row.owner_user_id, role: ParticipantRole.OWNER });
        if (row.assigned_to) parties.push({ userId: row.assigned_to, role: ParticipantRole.LEGAL });
        break;
      }

      case ConversationContextType.LEGAL_CASE: {
        const row = await this.db.one<any>(
          `SELECT lc.*, a.property_id, p.title AS prop_title, t.tenant_user_id, t.owner_user_id
             FROM legal_cases lc
             LEFT JOIN agreements a ON a.id = lc.agreement_id
             LEFT JOIN tenancies t ON t.id = a.tenancy_id
             LEFT JOIN properties p ON p.id = t.property_id
            WHERE lc.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Legal case #${contextId} not found.`);
        title = `Legal Case: ${row.case_number}`;
        if (row.property_id) propertyId = row.property_id;
        if (row.tenant_user_id) parties.push({ userId: row.tenant_user_id, role: ParticipantRole.CUSTOMER });
        if (row.owner_user_id) parties.push({ userId: row.owner_user_id, role: ParticipantRole.OWNER });
        if (row.assigned_to) parties.push({ userId: row.assigned_to, role: ParticipantRole.LEGAL });
        break;
      }

      case ConversationContextType.SUPPORT: {
        const row = await this.db.one<any>(
          `SELECT st.* FROM support_tickets st WHERE st.id = ?`,
          [contextId],
        );
        if (!row) throw new NotFoundException(`Support ticket #${contextId} not found.`);
        title = `Support: ${row.ticket_number} - ${row.subject}`;
        if (row.user_id) parties.push({ userId: row.user_id, role: ParticipantRole.CUSTOMER });
        if (row.assigned_to) parties.push({ userId: row.assigned_to, role: ParticipantRole.MANAGEMENT });
        break;
      }
    }

    return { title, propertyId, parties };
  }

  /**
   * Ensure a conversation exists for a given business context
   */
  async getOrCreateConversation(
    contextType: ConversationContextType,
    contextId: number,
    initialTitle?: string,
    initialMessage?: string,
    creatorUser?: AuthUser,
  ) {
    let conv = await this.db.one<any>(
      `SELECT * FROM conversations WHERE context_type = ? AND context_id = ?`,
      [contextType, contextId],
    );

    const meta = await this.resolveContextMetadata(contextType, contextId);

    if (!conv) {
      const convId = await this.db.insert('conversations', {
        context_type: contextType,
        context_id: contextId,
        title: initialTitle || meta.title,
        status: ConversationStatus.OPEN,
        created_by: creatorUser ? creatorUser.id : null,
      });

      const publicId = `ODB-CNV-2026-${String(convId).padStart(6, '0')}`;
      await this.db.execute('UPDATE conversations SET public_id = ? WHERE id = ?', [publicId, convId]);

      conv = await this.db.one<any>('SELECT * FROM conversations WHERE id = ?', [convId]);

      // Add resolved participants
      for (const p of meta.parties) {
        if (p.userId) {
          await this.db.execute(
            `INSERT IGNORE INTO conversation_participants (conversation_id, user_id, role)
             VALUES (?, ?, ?)`,
            [conv.id, p.userId, p.role],
          );
        }
      }

      if (creatorUser) {
        await this.db.execute(
          `INSERT IGNORE INTO conversation_participants (conversation_id, user_id, role)
           VALUES (?, ?, ?)`,
          [conv.id, creatorUser.id, ParticipantRole.CUSTOMER],
        );
      }

      if (creatorUser) {
        await this.audit.record({
          actor: creatorUser,
          action: 'conversation.created',
          objectType: 'conversation',
          objectId: conv.id,
          metadata: { publicId, contextType, contextId },
        });
      }

      if (initialMessage && creatorUser) {
        await this.sendMessage(creatorUser, conv.id, { body: initialMessage });
      }
    } else {
      // Ensure all current parties are participants
      for (const p of meta.parties) {
        if (p.userId) {
          await this.db.execute(
            `INSERT IGNORE INTO conversation_participants (conversation_id, user_id, role)
             VALUES (?, ?, ?)`,
            [conv.id, p.userId, p.role],
          );
        }
      }
    }

    return conv;
  }

  /**
   * Check whether user has access to a specific conversation
   */
  async assertConversationAccess(user: AuthUser, conversationId: number): Promise<any> {
    const conv = await this.db.one<any>(
      `SELECT * FROM conversations WHERE id = ?`,
      [conversationId],
    );
    if (!conv) throw new NotFoundException('Conversation not found.');

    if (this.isStaffUser(user)) {
      return conv;
    }

    // Check direct participation
    const participant = await this.db.one<any>(
      `SELECT * FROM conversation_participants WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, user.id],
    );
    if (participant) {
      return conv;
    }

    // Check context authorization fallback
    const meta = await this.resolveContextMetadata(conv.context_type, conv.context_id);
    const isParty = meta.parties.some((p) => p.userId === user.id) || conv.created_by === user.id;

    if (!isParty) {
      throw new ForbiddenException('You do not have access to this conversation.');
    }

    // Automatically register as participant if authorized party
    await this.db.execute(
      `INSERT IGNORE INTO conversation_participants (conversation_id, user_id, role)
       VALUES (?, ?, ?)`,
      [conversationId, user.id, ParticipantRole.CUSTOMER],
    );

    return conv;
  }

  /**
   * User conversation list with unread counter, last message snippet and context metadata
   */
  async listUserConversations(user: AuthUser, query: ListConversationsQueryDto) {
    const isStaff = this.isStaffUser(user);
    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const params: any[] = [];
    let whereClause = `WHERE 1=1 `;

    if (!isStaff) {
      whereClause += `AND (
        cp.user_id = ? OR c.created_by = ?
      ) `;
      params.push(user.id, user.id);
    }

    if (query.contextType) {
      whereClause += `AND c.context_type = ? `;
      params.push(query.contextType);
    }

    if (query.status) {
      whereClause += `AND c.status = ? `;
      params.push(query.status);
    }

    if (query.search) {
      whereClause += `AND (c.title LIKE ? OR c.public_id LIKE ?) `;
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    const countSql = `
      SELECT COUNT(DISTINCT c.id) AS total
        FROM conversations c
        LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
        ${whereClause}
    `;
    const countResult = await this.db.one<{ total: number }>(countSql, params);
    const total = Number(countResult?.total || 0);

    const listSql = `
      SELECT c.*,
             (SELECT m.body FROM messages m
               WHERE m.conversation_id = c.id
                 ${!this.canManageInternalNotes(user) ? 'AND m.is_internal = 0' : ''}
                 AND m.deleted_at IS NULL
               ORDER BY m.created_at DESC LIMIT 1) AS last_message_body,
             (SELECT m.created_at FROM messages m
               WHERE m.conversation_id = c.id
                 ${!this.canManageInternalNotes(user) ? 'AND m.is_internal = 0' : ''}
                 AND m.deleted_at IS NULL
               ORDER BY m.created_at DESC LIMIT 1) AS last_message_time,
             (SELECT u.full_name FROM messages m
                JOIN users u ON u.id = m.sender_id
               WHERE m.conversation_id = c.id
                 ${!this.canManageInternalNotes(user) ? 'AND m.is_internal = 0' : ''}
                 AND m.deleted_at IS NULL
               ORDER BY m.created_at DESC LIMIT 1) AS last_sender_name,
             (SELECT COUNT(*) FROM messages m
               WHERE m.conversation_id = c.id
                 ${!this.canManageInternalNotes(user) ? 'AND m.is_internal = 0' : ''}
                 AND m.deleted_at IS NULL
                 AND m.created_at > COALESCE((
                   SELECT cp2.last_read_at FROM conversation_participants cp2
                    WHERE cp2.conversation_id = c.id AND cp2.user_id = ?
                 ), '1970-01-01')
                 AND m.sender_id != ?) AS unread_count
        FROM conversations c
        LEFT JOIN conversation_participants cp ON cp.conversation_id = c.id
        ${whereClause}
       GROUP BY c.id
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT ? OFFSET ?
    `;

    const queryParams = [user.id, user.id, ...params, pageSize, offset];
    const data = await this.db.query(listSql, queryParams);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Conversation detail with participant roster and context object
   */
  async getConversationDetail(user: AuthUser, conversationId: number) {
    const conv = await this.assertConversationAccess(user, conversationId);
    const canSeeInternal = this.canManageInternalNotes(user);

    const participants = await this.db.query(
      `SELECT cp.*, u.full_name, u.email, u.phone,
              COALESCE(cp.role, (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1)) AS user_system_role
         FROM conversation_participants cp
         JOIN users u ON u.id = cp.user_id
        WHERE cp.conversation_id = ?`,
      [conversationId],
    );

    const meta = await this.resolveContextMetadata(conv.context_type, conv.context_id);

    // Update read state automatically on detail view
    await this.markAsRead(user, conversationId);

    return {
      conversation: conv,
      participants,
      context: {
        type: conv.context_type,
        id: conv.context_id,
        title: meta.title,
        propertyId: meta.propertyId,
      },
      canSeeInternal,
    };
  }

  /**
   * Fetch paginated messages with strict internal note protection
   */
  async listConversationMessages(user: AuthUser, conversationId: number, query?: any) {
    await this.assertConversationAccess(user, conversationId);
    const canSeeInternal = this.canManageInternalNotes(user);

    const page = Number(query?.page) || 1;
    const pageSize = Number(query?.pageSize) || 50;
    const offset = (page - 1) * pageSize;

    const messages = await this.db.query(
      `SELECT m.id, m.conversation_id, m.sender_id, m.message_type, m.is_internal,
              m.body, m.document_id, m.created_at, m.edited_at, m.deleted_at,
              u.full_name AS sender_name, u.email AS sender_email,
              COALESCE((SELECT cp.role FROM conversation_participants cp WHERE cp.conversation_id = m.conversation_id AND cp.user_id = u.id LIMIT 1),
                       (SELECT r.code FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id LIMIT 1)) AS sender_role
         FROM messages m
         JOIN users u ON u.id = m.sender_id
        WHERE m.conversation_id = ?
          ${!canSeeInternal ? 'AND m.is_internal = 0' : ''}
          AND m.deleted_at IS NULL
        ORDER BY m.created_at ASC
        LIMIT ? OFFSET ?`,
      [conversationId, pageSize, offset],
    );

    return { data: messages, page, pageSize };
  }

  /**
   * Send external / participant message
   */
  async sendMessage(user: AuthUser, conversationId: number, dto: SendMessageDto) {
    const conv = await this.assertConversationAccess(user, conversationId);

    if (conv.status === ConversationStatus.CLOSED) {
      throw new BadRequestException('Cannot send message to a closed conversation. Reopen it first.');
    }

    const messageType = dto.messageType || MessageType.TEXT;
    const now = new Date();

    const messageId = await this.db.insert('messages', {
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: messageType,
      is_internal: 0,
      body: dto.body,
      document_id: dto.documentId || null,
    });

    // Advance conversation activity
    await this.db.execute(
      `UPDATE conversations
          SET last_message_at = NOW(),
              status = CASE WHEN status = 'OPEN' THEN 'ACTIVE' ELSE status END,
              updated_at = NOW()
        WHERE id = ?`,
      [conversationId],
    );

    // Update sender's last_read_at
    await this.db.execute(
      `UPDATE conversation_participants
          SET last_read_at = NOW()
        WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, user.id],
    );

    // Notify recipients
    const recipients = await this.db.query<{ user_id: number }>(
      `SELECT user_id FROM conversation_participants
        WHERE conversation_id = ? AND user_id != ? AND is_muted = 0`,
      [conversationId, user.id],
    );

    for (const r of recipients) {
      await this.notify.send(r.user_id, 'MAINTENANCE_UPDATE', {
        title: `New message on ${conv.title || conv.public_id}`,
        body: `${user.fullName}: ${dto.body.slice(0, 120)}`,
        actionUrl: `/dashboard/messages?conversationId=${conversationId}`,
      });
    }

    await this.audit.record({
      actor: user,
      action: 'message.sent',
      objectType: 'conversation',
      objectId: conversationId,
      metadata: { messageId, messageType, length: dto.body.length },
    });

    return {
      id: messageId,
      conversationId,
      senderId: user.id,
      body: dto.body,
      messageType,
      isInternal: false,
      createdAt: now,
    };
  }

  /**
   * Post internal note (strictly management-only)
   */
  async sendInternalNote(user: AuthUser, conversationId: number, dto: SendInternalNoteDto) {
    if (!this.canManageInternalNotes(user)) {
      throw new ForbiddenException('Only authorized Odibrick Management can post internal notes.');
    }

    const conv = await this.assertConversationAccess(user, conversationId);

    const messageId = await this.db.insert('messages', {
      conversation_id: conversationId,
      sender_id: user.id,
      message_type: MessageType.NOTE,
      is_internal: 1,
      body: dto.body,
      document_id: dto.documentId || null,
    });

    await this.db.execute(
      `UPDATE conversations
          SET last_message_at = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [conversationId],
    );

    await this.audit.record({
      actor: user,
      action: 'conversation.internal_note_added',
      objectType: 'conversation',
      objectId: conversationId,
      metadata: { messageId, noteLength: dto.body.length },
    });

    return {
      id: messageId,
      conversationId,
      senderId: user.id,
      body: dto.body,
      messageType: MessageType.NOTE,
      isInternal: true,
      createdAt: new Date(),
    };
  }

  /**
   * System message broadcaster for business workflows
   */
  async sendSystemMessage(conversationId: number, body: string, metadata?: any) {
    const conv = await this.db.one<any>(
      `SELECT * FROM conversations WHERE id = ?`,
      [conversationId],
    );
    if (!conv) return null;

    const systemUserId = 1; // Super Admin / System User

    const messageId = await this.db.insert('messages', {
      conversation_id: conversationId,
      sender_id: systemUserId,
      message_type: MessageType.SYSTEM,
      is_internal: 0,
      body,
    });

    await this.db.execute(
      `UPDATE conversations
          SET last_message_at = NOW(),
              updated_at = NOW()
        WHERE id = ?`,
      [conversationId],
    );

    return messageId;
  }

  /**
   * Mark conversation messages as read
   */
  async markAsRead(user: AuthUser, conversationId: number) {
    const now = new Date();
    await this.db.execute(
      `UPDATE conversation_participants
          SET last_read_at = NOW()
        WHERE conversation_id = ? AND user_id = ?`,
      [conversationId, user.id],
    );
    return { success: true, conversationId, readAt: now };
  }

  /**
   * Edit message
   */
  async editMessage(user: AuthUser, messageId: number, dto: EditMessageDto) {
    const msg = await this.db.one<any>(
      `SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL`,
      [messageId],
    );
    if (!msg) throw new NotFoundException('Message not found.');

    const isAuthor = msg.sender_id === user.id;
    const isStaff = this.isStaffUser(user);

    if (!isAuthor && !isStaff) {
      throw new ForbiddenException('You can only edit your own messages.');
    }

    const now = new Date();
    await this.db.execute(
      `UPDATE messages SET body = ?, edited_at = ? WHERE id = ?`,
      [dto.body, now, messageId],
    );

    await this.audit.record({
      actor: user,
      action: 'message.edited',
      objectType: 'conversation',
      objectId: msg.conversation_id,
      metadata: { messageId },
    });

    return { id: messageId, body: dto.body, editedAt: now };
  }

  /**
   * Delete message (soft delete)
   */
  async deleteMessage(user: AuthUser, messageId: number) {
    const msg = await this.db.one<any>(
      `SELECT * FROM messages WHERE id = ? AND deleted_at IS NULL`,
      [messageId],
    );
    if (!msg) throw new NotFoundException('Message not found.');

    const isAuthor = msg.sender_id === user.id;
    const isStaff = this.isStaffUser(user);

    if (!isAuthor && !isStaff) {
      throw new ForbiddenException('You can only delete your own messages.');
    }

    const now = new Date();
    await this.db.execute(
      `UPDATE messages SET deleted_at = ? WHERE id = ?`,
      [now, messageId],
    );

    await this.audit.record({
      actor: user,
      action: 'message.deleted',
      objectType: 'conversation',
      objectId: msg.conversation_id,
      metadata: { messageId },
    });

    return { success: true, messageId, deletedAt: now };
  }

  /**
   * Assign internal handler to conversation (Management only)
   */
  async assignConversation(user: AuthUser, conversationId: number, dto: AssignConversationDto) {
    if (!this.isStaffUser(user)) {
      throw new ForbiddenException('Only Odibrick Management can assign conversations.');
    }

    const conv = await this.assertConversationAccess(user, conversationId);
    const targetUser = await this.db.one<any>('SELECT id, full_name, email FROM users WHERE id = ?', [
      dto.assignedTo,
    ]);
    if (!targetUser) throw new NotFoundException('Assigned user not found.');

    await this.db.execute(
      `UPDATE conversations
          SET assigned_to = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [dto.assignedTo, conversationId],
    );

    // Register as participant with MANAGEMENT role
    await this.db.execute(
      `INSERT INTO conversation_participants (conversation_id, user_id, role)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [conversationId, dto.assignedTo, ParticipantRole.MANAGEMENT],
    );

    await this.sendSystemMessage(
      conversationId,
      `Conversation assigned to ${targetUser.full_name} by Odibrick Management.${
        dto.notes ? ` Note: ${dto.notes}` : ''
      }`,
    );

    await this.audit.record({
      actor: user,
      action: 'conversation.assigned',
      objectType: 'conversation',
      objectId: conversationId,
      metadata: { assignedTo: dto.assignedTo, assignedName: targetUser.full_name, notes: dto.notes },
    });

    return { success: true, conversationId, assignedTo: dto.assignedTo };
  }

  /**
   * Escalate conversation to priority management queue
   */
  async escalateConversation(user: AuthUser, conversationId: number, dto: EscalateConversationDto) {
    const conv = await this.assertConversationAccess(user, conversationId);
    const now = new Date();

    await this.db.execute(
      `UPDATE conversations
          SET status = 'ESCALATED',
              sla_breached = 1,
              sla_escalated_at = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [now, conversationId],
    );

    await this.sendSystemMessage(
      conversationId,
      `Conversation escalated to Management. Reason: ${dto.reason}`,
    );

    await this.audit.record({
      actor: user,
      action: 'conversation.escalated',
      objectType: 'conversation',
      objectId: conversationId,
      metadata: { reason: dto.reason },
    });

    return { success: true, conversationId, status: ConversationStatus.ESCALATED };
  }

  /**
   * Resolve conversation
   */
  async resolveConversation(user: AuthUser, conversationId: number, dto: ResolveConversationDto) {
    await this.assertConversationAccess(user, conversationId);

    await this.db.execute(
      `UPDATE conversations
          SET status = 'RESOLVED',
              updated_at = NOW()
        WHERE id = ?`,
      [conversationId],
    );

    await this.sendSystemMessage(
      conversationId,
      `Conversation marked as RESOLVED by ${user.fullName}.${
        dto.notes ? ` Note: ${dto.notes}` : ''
      }`,
    );

    await this.audit.record({
      actor: user,
      action: 'conversation.resolved',
      objectType: 'conversation',
      objectId: conversationId,
      metadata: { notes: dto.notes },
    });

    return { success: true, conversationId, status: ConversationStatus.RESOLVED };
  }

  /**
   * Reopen conversation
   */
  async reopenConversation(user: AuthUser, conversationId: number, dto: ReopenConversationDto) {
    await this.assertConversationAccess(user, conversationId);

    await this.db.execute(
      `UPDATE conversations
          SET status = 'ACTIVE',
              closed_at = NULL,
              updated_at = NOW()
        WHERE id = ?`,
      [conversationId],
    );

    await this.sendSystemMessage(
      conversationId,
      `Conversation reopened by ${user.fullName}. Reason: ${dto.reason}`,
    );

    await this.audit.record({
      actor: user,
      action: 'conversation.reopened',
      objectType: 'conversation',
      objectId: conversationId,
      metadata: { reason: dto.reason },
    });

    return { success: true, conversationId, status: ConversationStatus.ACTIVE };
  }

  /**
   * Close conversation
   */
  async closeConversation(user: AuthUser, conversationId: number, dto: CloseConversationDto) {
    if (!this.isStaffUser(user)) {
      throw new ForbiddenException('Only Odibrick Management can formally close conversations.');
    }

    await this.assertConversationAccess(user, conversationId);
    const now = new Date();

    await this.db.execute(
      `UPDATE conversations
          SET status = 'CLOSED',
              closed_at = ?,
              updated_at = NOW()
        WHERE id = ?`,
      [now, conversationId],
    );

    await this.sendSystemMessage(
      conversationId,
      `Conversation closed by Odibrick Management.${dto.notes ? ` Note: ${dto.notes}` : ''}`,
    );

    await this.audit.record({
      actor: user,
      action: 'conversation.closed',
      objectType: 'conversation',
      objectId: conversationId,
      metadata: { notes: dto.notes },
    });

    return { success: true, conversationId, status: ConversationStatus.CLOSED };
  }

  /**
   * Global Management list of conversations with comprehensive filters
   */
  async listAdminConversations(user: AuthUser, query: AdminConversationsQueryDto) {
    if (!this.isStaffUser(user)) {
      throw new ForbiddenException('Access to Management Conversation Centre requires admin privileges.');
    }

    const page = Number(query.page) || 1;
    const pageSize = Number(query.pageSize) || 20;
    const offset = (page - 1) * pageSize;

    const params: any[] = [];
    let whereClause = `WHERE 1=1 `;

    if (query.contextType) {
      whereClause += `AND c.context_type = ? `;
      params.push(query.contextType);
    }

    if (query.status) {
      whereClause += `AND c.status = ? `;
      params.push(query.status);
    }

    if (query.assignedTo) {
      whereClause += `AND c.assigned_to = ? `;
      params.push(query.assignedTo);
    }

    if (query.slaBreached !== undefined) {
      whereClause += `AND c.sla_breached = ? `;
      params.push(query.slaBreached ? 1 : 0);
    }

    if (query.search) {
      whereClause += `AND (c.title LIKE ? OR c.public_id LIKE ?) `;
      params.push(`%${query.search}%`, `%${query.search}%`);
    }

    if (query.fromDate) {
      whereClause += `AND c.created_at >= ? `;
      params.push(query.fromDate);
    }

    if (query.toDate) {
      whereClause += `AND c.created_at <= ? `;
      params.push(query.toDate);
    }

    const countSql = `SELECT COUNT(*) AS total FROM conversations c ${whereClause}`;
    const countResult = await this.db.one<{ total: number }>(countSql, params);
    const total = Number(countResult?.total || 0);

    const listSql = `
      SELECT c.*,
             u.full_name AS assignee_name,
             u.email AS assignee_email,
             (SELECT m.body FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS last_message_body,
             (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) AS last_message_time,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS total_messages,
             (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.is_internal = 1 AND m.deleted_at IS NULL) AS internal_notes_count
        FROM conversations c
        LEFT JOIN users u ON u.id = c.assigned_to
        ${whereClause}
       ORDER BY c.sla_breached DESC, COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT ? OFFSET ?
    `;

    const data = await this.db.query(listSql, [...params, pageSize, offset]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Management Conversation Analytics
   */
  async getAdminConversationsAnalytics(user: AuthUser) {
    if (!this.isStaffUser(user)) {
      throw new ForbiddenException('Admin permissions required for communication analytics.');
    }

    const totals = await this.db.one<any>(`
      SELECT
        COUNT(*) AS total_conversations,
        SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS open_conversations,
        SUM(CASE WHEN status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_conversations,
        SUM(CASE WHEN status = 'ESCALATED' THEN 1 ELSE 0 END) AS escalated_conversations,
        SUM(CASE WHEN status = 'RESOLVED' THEN 1 ELSE 0 END) AS resolved_conversations,
        SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_conversations,
        SUM(CASE WHEN sla_breached = 1 THEN 1 ELSE 0 END) AS sla_breached_count
      FROM conversations
    `);

    const contextBreakdown = await this.db.query<any>(`
      SELECT context_type, COUNT(*) AS count
        FROM conversations
       GROUP BY context_type
       ORDER BY count DESC
    `);

    const messagesStats = await this.db.one<any>(`
      SELECT
        COUNT(*) AS total_messages,
        SUM(CASE WHEN is_internal = 1 THEN 1 ELSE 0 END) AS total_internal_notes,
        SUM(CASE WHEN message_type = 'SYSTEM' THEN 1 ELSE 0 END) AS total_system_messages
      FROM messages
      WHERE deleted_at IS NULL
    `);

    return {
      overview: {
        totalConversations: Number(totals?.total_conversations || 0),
        openConversations: Number(totals?.open_conversations || 0),
        activeConversations: Number(totals?.active_conversations || 0),
        escalatedConversations: Number(totals?.escalated_conversations || 0),
        resolvedConversations: Number(totals?.resolved_conversations || 0),
        closedConversations: Number(totals?.closed_conversations || 0),
        slaBreachedCount: Number(totals?.sla_breached_count || 0),
        resolutionRate: totals?.total_conversations
          ? Math.round(
              ((Number(totals?.resolved_conversations || 0) + Number(totals?.closed_conversations || 0)) /
                Number(totals.total_conversations)) *
                100,
            )
          : 100,
      },
      contextBreakdown,
      messagesStats: {
        totalMessages: Number(messagesStats?.total_messages || 0),
        totalInternalNotes: Number(messagesStats?.total_internal_notes || 0),
        totalSystemMessages: Number(messagesStats?.total_system_messages || 0),
      },
    };
  }

  /**
   * Process and escalate stale conversations (> 24h inactive with OPEN / WAITING status)
   */
  async processSlaEscalations() {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago
    const staleConversations = await this.db.query<any>(
      `SELECT * FROM conversations
        WHERE status IN ('OPEN', 'WAITING_FOR_CUSTOMER', 'WAITING_FOR_PROVIDER', 'ACTIVE')
          AND sla_breached = 0
          AND (last_message_at < ? OR (last_message_at IS NULL AND created_at < ?))`,
      [cutoff, cutoff],
    );

    let escalatedCount = 0;
    const now = new Date();

    for (const c of staleConversations) {
      await this.db.execute(
        `UPDATE conversations
            SET sla_breached = 1,
                sla_escalated_at = ?,
                status = 'ESCALATED',
                updated_at = NOW()
          WHERE id = ?`,
        [now, c.id],
      );

      await this.sendSystemMessage(
        c.id,
        'SLA Notice: Conversation response time threshold exceeded (>24h). Automatically escalated to Odibrick Management.',
      );

      escalatedCount++;
    }

    return { processed: staleConversations.length, escalatedCount };
  }
}
