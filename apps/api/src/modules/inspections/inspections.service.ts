import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../common/database/database.service';
import { AuditService } from '../../common/audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuthUser } from '../../common/auth/auth.types';
import { formatReference, newPublicId } from '../../common/util/ids';
import { AcknowledgeDto, AddMediaDto, InspectionItemDto, StartInspectionDto, SubmitInspectionDto } from './inspections.dto';

/** Room/element checklist the wizard walks through so nothing gets skipped. */
const DEFAULT_CHECKLIST: Array<{ room: string; elements: string[] }> = [
  { room: 'ENTRANCE', elements: ['DOORS', 'WALLS', 'FLOORING', 'ELECTRICAL'] },
  { room: 'LIVING_ROOM', elements: ['WALLS', 'FLOORING', 'CEILING', 'WINDOWS', 'ELECTRICAL', 'FIXTURES', 'FURNITURE'] },
  { room: 'KITCHEN', elements: ['WALLS', 'FLOORING', 'PLUMBING', 'ELECTRICAL', 'APPLIANCES', 'FIXTURES'] },
  { room: 'BEDROOM', elements: ['WALLS', 'FLOORING', 'CEILING', 'WINDOWS', 'DOORS', 'ELECTRICAL', 'FURNITURE'] },
  { room: 'BATHROOM', elements: ['WALLS', 'FLOORING', 'PLUMBING', 'FIXTURES', 'DOORS'] },
  { room: 'BALCONY', elements: ['WALLS', 'FLOORING', 'DOORS', 'PAINT'] },
  { room: 'UTILITY', elements: ['PLUMBING', 'ELECTRICAL', 'METER'] },
];

@Injectable()
export class InspectionsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly audit: AuditService,
    private readonly notify: NotificationsService,
  ) {}

  checklist() {
    return DEFAULT_CHECKLIST;
  }

  /** Opens a draft report. The tenant does this on the day they take possession. */
  async start(user: AuthUser, dto: StartInspectionDto, req?: Request) {
    const tenancy = await this.db.one<any>(
      'SELECT * FROM tenancies WHERE id = ? AND (tenant_user_id = ? OR owner_user_id = ?)',
      [dto.tenancyId, user.id, user.id],
    );
    if (!tenancy) throw new NotFoundException('Tenancy not found.');

    const kind = dto.kind ?? 'CHECK_IN';
    const existing = await this.db.one<any>(
      "SELECT id, status FROM inspections WHERE tenancy_id = ? AND kind = ? AND status <> 'SUPERSEDED' ORDER BY id DESC LIMIT 1",
      [dto.tenancyId, kind],
    );
    if (existing && existing.status !== 'DRAFT') {
      throw new BadRequestException('A report of this type has already been submitted for this tenancy.');
    }
    if (existing) return { id: existing.id, status: 'DRAFT', resumed: true };

    const seq = await this.db.one<{ c: number }>('SELECT COUNT(*) AS c FROM inspections');
    const compareWith =
      kind === 'MOVE_OUT'
        ? await this.db.one<any>(
            "SELECT id FROM inspections WHERE tenancy_id = ? AND kind = 'CHECK_IN' AND status = 'ACKNOWLEDGED' LIMIT 1",
            [dto.tenancyId],
          )
        : null;

    const id = await this.db.insert('inspections', {
      public_id: newPublicId(),
      report_number: formatReference('CR', (seq?.c ?? 0) + 1),
      property_id: tenancy.property_id,
      tenancy_id: tenancy.id,
      kind,
      conducted_by: user.id,
      conducted_role: user.id === tenancy.tenant_user_id ? 'TENANT' : 'OWNER',
      status: 'DRAFT',
      started_at: new Date(),
      gps_latitude: dto.latitude ?? null,
      gps_longitude: dto.longitude ?? null,
      device_hash: dto.deviceHash ?? null,
      compared_with_id: compareWith?.id ?? null,
    });

    await this.audit.record({ actor: user, action: 'inspection.started', objectType: 'inspection', objectId: id, req });
    return { id, status: 'DRAFT', checklist: DEFAULT_CHECKLIST };
  }

  async detail(user: AuthUser, id: number) {
    const inspection = await this.db.one<any>(
      `SELECT i.*, t.owner_user_id, t.tenant_user_id, p.title AS property_title, p.locality, p.city,
              u.full_name AS conducted_by_name
         FROM inspections i
         LEFT JOIN tenancies t ON t.id = i.tenancy_id
         JOIN properties p ON p.id = i.property_id
         JOIN users u ON u.id = i.conducted_by
        WHERE i.id = ?`,
      [id],
    );
    if (!inspection) throw new NotFoundException('Condition report not found.');
    this.assertParty(user, inspection);

    const items = await this.db.query(
      `SELECT id, room, room_label, element, condition_rating, damage_type, notes, quantity, flagged, sort_order
         FROM inspection_items WHERE inspection_id = ? ORDER BY room, sort_order`,
      [id],
    );
    const media = await this.db.query(
      `SELECT id, inspection_item_id, media_type, storage_key, captured_at, received_at, caption
         FROM inspection_media WHERE inspection_id = ? ORDER BY id`,
      [id],
    );

    const comparison = inspection.compared_with_id ? await this.compare(inspection.compared_with_id, id) : null;
    return { inspection, items, media, comparison };
  }

  async saveItems(user: AuthUser, id: number, items: InspectionItemDto[]) {
    const inspection = await this.assertEditable(user, id);
    await this.db.transaction(async (conn) => {
      await conn.execute('DELETE FROM inspection_items WHERE inspection_id = ?', [inspection.id]);
      for (const [index, item] of items.entries()) {
        await conn.execute(
          `INSERT INTO inspection_items (inspection_id, room, room_label, element, condition_rating,
             damage_type, notes, quantity, flagged, sort_order)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            inspection.id, item.room, item.roomLabel ?? null, item.element,
            item.conditionRating ?? 'GOOD', item.damageType ?? 'NONE', item.notes ?? null,
            item.quantity ?? null,
            item.conditionRating === 'DAMAGED' || item.conditionRating === 'MISSING' ? 1 : 0,
            index,
          ],
        );
      }
    });
    return { id, itemCount: items.length };
  }

  /**
   * Media carries two timestamps: the device's and the server's. Only the
   * server timestamp is trustworthy, and both are shown in the report.
   */
  async addMedia(user: AuthUser, id: number, dto: AddMediaDto) {
    const inspection = await this.assertEditable(user, id);
    const mediaId = await this.db.insert('inspection_media', {
      inspection_id: inspection.id,
      inspection_item_id: dto.itemId ?? null,
      media_type: dto.mediaType ?? 'PHOTO',
      storage_key: dto.storageKey,
      checksum_sha256: dto.checksum ?? null,
      captured_at: dto.capturedAt ?? null,
      gps_latitude: dto.latitude ?? null,
      gps_longitude: dto.longitude ?? null,
      caption: dto.caption ?? null,
    });
    return { id: mediaId };
  }

  async submit(user: AuthUser, id: number, dto: SubmitInspectionDto, req?: Request) {
    const inspection = await this.assertEditable(user, id);

    const counts = await this.db.one<any>(
      `SELECT (SELECT COUNT(*) FROM inspection_items WHERE inspection_id = ?) AS items,
              (SELECT COUNT(*) FROM inspection_media WHERE inspection_id = ?) AS media,
              (SELECT COUNT(DISTINCT room) FROM inspection_items WHERE inspection_id = ?) AS rooms`,
      [id, id, id],
    );
    if ((counts?.items ?? 0) < 5) throw new BadRequestException('Record at least five items before submitting.');
    if ((counts?.media ?? 0) < 5) throw new BadRequestException('Add at least five photographs before submitting.');

    await this.db.update('inspections', id, {
      status: 'SUBMITTED',
      submitted_at: new Date(),
      tenant_ack_at: inspection.conducted_role === 'TENANT' ? new Date() : null,
      owner_ack_at: inspection.conducted_role === 'OWNER' ? new Date() : null,
      overall_condition: dto.overallCondition ?? null,
      electricity_reading: dto.electricityReading ?? null,
      water_reading: dto.waterReading ?? null,
      gas_reading: dto.gasReading ?? null,
    });

    const tenancy = await this.db.one<any>('SELECT * FROM tenancies WHERE id = ?', [inspection.tenancy_id]);
    const counterparty = user.id === tenancy.tenant_user_id ? tenancy.owner_user_id : tenancy.tenant_user_id;

    await this.db.insert('property_timeline', {
      property_id: inspection.property_id,
      tenancy_id: inspection.tenancy_id,
      event_code: inspection.kind === 'MOVE_OUT' ? 'MOVE_OUT_REPORT' : 'CHECK_IN_REPORT',
      title: inspection.kind === 'MOVE_OUT' ? 'Move-out condition report submitted' : 'Day 1 condition report submitted',
      detail: `${counts.rooms} rooms, ${counts.media} attachments`,
      actor_id: user.id,
      reference_type: 'inspection',
      reference_id: id,
    });

    if (inspection.kind === 'CHECK_IN' && tenancy.stage === 'CHECK_IN_PENDING') {
      await this.db.update('tenancies', inspection.tenancy_id, { stage: 'ACTIVE' });
    }
    if (inspection.kind === 'MOVE_OUT') {
      await this.db.update('tenancies', inspection.tenancy_id, { stage: 'MOVE_OUT' });
    }

    await this.notify.send(counterparty, 'CHECK_IN_PENDING', {
      title: 'Condition report ready for review',
      body: `${user.fullName} submitted the ${inspection.kind === 'MOVE_OUT' ? 'move-out' : 'Day 1'} condition report. Review and acknowledge it.`,
      actionUrl: `/dashboard/condition-report/${id}`,
      severity: 'ACTION',
    });
    await this.audit.record({ actor: user, action: 'inspection.submitted', objectType: 'inspection', objectId: id, req });
    return { id, status: 'SUBMITTED' };
  }

  /** Both parties acknowledge; a disagreement opens a dispute rather than silently overwriting. */
  async acknowledge(user: AuthUser, id: number, dto: AcknowledgeDto, req?: Request) {
    const inspection = await this.db.one<any>(
      `SELECT i.*, t.owner_user_id, t.tenant_user_id FROM inspections i
         JOIN tenancies t ON t.id = i.tenancy_id WHERE i.id = ?`,
      [id],
    );
    if (!inspection) throw new NotFoundException('Condition report not found.');
    this.assertParty(user, inspection);
    if (inspection.status === 'DRAFT') throw new BadRequestException('This report has not been submitted yet.');

    if (dto.decision === 'DISPUTE') {
      await this.db.update('inspections', id, { status: 'DISPUTED', owner_comments: dto.comments ?? null });
      await this.audit.record({ actor: user, action: 'inspection.disputed', objectType: 'inspection', objectId: id, req });
      return { id, status: 'DISPUTED', next: 'Raise a dispute from the tenancy page to have our team review it.' };
    }

    const isOwner = user.id === inspection.owner_user_id;
    await this.db.update('inspections', id, {
      owner_ack_at: isOwner ? new Date() : inspection.owner_ack_at,
      tenant_ack_at: !isOwner ? new Date() : inspection.tenant_ack_at,
      owner_comments: isOwner ? dto.comments ?? null : inspection.owner_comments,
    });

    const fresh = await this.db.one<any>('SELECT owner_ack_at, tenant_ack_at FROM inspections WHERE id = ?', [id]);
    if (fresh?.owner_ack_at && fresh?.tenant_ack_at) {
      await this.db.update('inspections', id, { status: 'ACKNOWLEDGED' });
    } else {
      await this.db.update('inspections', id, { status: 'OWNER_REVIEW' });
    }
    await this.audit.record({ actor: user, action: 'inspection.acknowledged', objectType: 'inspection', objectId: id, req });
    return { id, status: fresh?.owner_ack_at && fresh?.tenant_ack_at ? 'ACKNOWLEDGED' : 'OWNER_REVIEW' };
  }

  /** Diff between the Day-1 record and the move-out record, element by element. */
  async compare(checkInId: number, moveOutId: number) {
    const [before, after] = await Promise.all([
      this.db.query<any>('SELECT * FROM inspection_items WHERE inspection_id = ?', [checkInId]),
      this.db.query<any>('SELECT * FROM inspection_items WHERE inspection_id = ?', [moveOutId]),
    ]);
    const rank = { NEW: 4, GOOD: 3, FAIR: 2, DAMAGED: 1, MISSING: 0 } as Record<string, number>;
    const key = (i: any) => `${i.room}|${i.room_label ?? ''}|${i.element}`;
    const beforeMap = new Map(before.map((i) => [key(i), i]));

    const changes = after.map((item) => {
      const original = beforeMap.get(key(item));
      const delta = original ? rank[original.condition_rating] - rank[item.condition_rating] : null;
      return {
        room: item.room,
        roomLabel: item.room_label,
        element: item.element,
        before: original?.condition_rating ?? 'NOT_RECORDED',
        after: item.condition_rating,
        beforeDamage: original?.damage_type ?? null,
        afterDamage: item.damage_type,
        deteriorated: delta !== null && delta > 0,
        notes: item.notes,
      };
    });

    return {
      checkInId,
      moveOutId,
      total: changes.length,
      deteriorated: changes.filter((c) => c.deteriorated),
      unchanged: changes.filter((c) => !c.deteriorated).length,
      note: 'This comparison is a record, not a determination of liability. Deposit deductions are agreed between the parties or decided through the dispute process.',
    };
  }

  async listForTenancy(user: AuthUser, tenancyId: number) {
    const tenancy = await this.db.one<any>(
      'SELECT * FROM tenancies WHERE id = ? AND (owner_user_id = ? OR tenant_user_id = ?)',
      [tenancyId, user.id, user.id],
    );
    if (!tenancy) throw new ForbiddenException('This tenancy belongs to other parties.');
    return this.db.query(
      `SELECT i.id, i.report_number, i.kind, i.status, i.submitted_at, i.owner_ack_at, i.tenant_ack_at,
              i.overall_condition,
              (SELECT COUNT(*) FROM inspection_media m WHERE m.inspection_id = i.id) AS media_count,
              (SELECT COUNT(*) FROM inspection_items it WHERE it.inspection_id = i.id AND it.flagged = 1) AS flagged_count
         FROM inspections i WHERE i.tenancy_id = ? ORDER BY i.created_at DESC`,
      [tenancyId],
    );
  }

  // ------------------------------------------------------------ internals
  private async assertEditable(user: AuthUser, id: number) {
    const inspection = await this.db.one<any>(
      `SELECT i.*, t.owner_user_id, t.tenant_user_id FROM inspections i
         LEFT JOIN tenancies t ON t.id = i.tenancy_id WHERE i.id = ?`,
      [id],
    );
    if (!inspection) throw new NotFoundException('Condition report not found.');
    if (inspection.conducted_by !== user.id) {
      throw new ForbiddenException('Only the person who started this report can edit it.');
    }
    if (inspection.status !== 'DRAFT') {
      throw new BadRequestException('A submitted report cannot be edited. Add a new report instead.');
    }
    return inspection;
  }

  private assertParty(user: AuthUser, inspection: any) {
    if ([inspection.owner_user_id, inspection.tenant_user_id, inspection.conducted_by].includes(user.id)) return;
    if (user.permissions.includes('inspection.acknowledge') || user.permissions.includes('dispute.manage')) return;
    throw new ForbiddenException('This report belongs to other parties.');
  }
}
