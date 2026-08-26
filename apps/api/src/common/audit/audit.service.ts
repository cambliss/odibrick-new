import { Injectable, Logger } from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { AuthUser } from '../auth/auth.types';

export interface AuditEntry {
  actor?: AuthUser | null;
  action: string;
  objectType?: string;
  objectId?: number | null;
  result?: 'SUCCESS' | 'FAILURE' | 'DENIED';
  metadata?: Record<string, unknown>;
  req?: Request;
}

/** Append-only audit trail. Never throws into the caller's request path. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly db: DatabaseService) {}

  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.db.insert('audit_logs', {
        actor_id: entry.actor?.id ?? null,
        actor_role: entry.actor?.roles?.[0] ?? null,
        action: entry.action,
        object_type: entry.objectType ?? null,
        object_id: entry.objectId ?? null,
        result: entry.result ?? 'SUCCESS',
        ip: entry.req ? this.ip(entry.req) : null,
        user_agent: entry.req?.headers['user-agent']?.slice(0, 250) ?? null,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      });
    } catch (error) {
      this.logger.error(`Audit write failed for ${entry.action}: ${(error as Error).message}`);
    }
  }

  private ip(req: Request): string {
    const forwarded = (req.headers['x-forwarded-for'] as string) ?? '';
    return (forwarded.split(',')[0] || req.socket.remoteAddress || '').slice(0, 45);
  }
}
