import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../../common/database/database.service';
import { AuthUser } from '../../common/auth/auth.types';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH';

export interface NotificationInput {
  title: string;
  body?: string;
  actionUrl?: string;
  severity?: 'INFO' | 'ACTION' | 'WARNING' | 'CRITICAL';
  channels?: NotificationChannel[];
  variables?: Record<string, string | number>;
}

/**
 * Single entry point for every user-facing message.
 * Email/SMS/WhatsApp adapters are deliberately thin: until a provider is
 * contracted they log and mark the row SKIPPED rather than faking delivery.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}

  async send(userId: number, eventCode: string, input: NotificationInput): Promise<void> {
    const channels = input.channels ?? ['IN_APP'];
    for (const channel of channels) {
      const template = await this.db.one<any>(
        'SELECT subject, body FROM notification_templates WHERE event_code = ? AND channel = ? AND is_active = 1',
        [eventCode, channel],
      );
      const title = input.title ?? template?.subject ?? eventCode;
      const body = this.render(input.body ?? template?.body ?? '', input.variables);
      const status = channel === 'IN_APP' ? 'SENT' : await this.dispatch(channel, userId, title, body);

      await this.db.insert('notifications', {
        user_id: userId,
        event_code: eventCode,
        channel,
        title,
        body,
        action_url: input.actionUrl ?? null,
        severity: input.severity ?? 'INFO',
        delivery_status: status,
      });
    }
  }

  async sendMany(userIds: number[], eventCode: string, input: NotificationInput): Promise<void> {
    await Promise.all(userIds.map((id) => this.send(id, eventCode, input)));
  }

  async list(user: AuthUser, unreadOnly = false, limit = 30) {
    return this.db.query(
      `SELECT id, event_code, title, body, action_url, severity, read_at, created_at
         FROM notifications
        WHERE user_id = ? AND channel = 'IN_APP' ${unreadOnly ? 'AND read_at IS NULL' : ''}
        ORDER BY created_at DESC LIMIT ?`,
      [user.id, limit],
    );
  }

  async unreadCount(user: AuthUser): Promise<{ count: number }> {
    const row = await this.db.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND channel = 'IN_APP' AND read_at IS NULL",
      [user.id],
    );
    return { count: row?.c ?? 0 };
  }

  async markRead(user: AuthUser, ids?: number[]): Promise<void> {
    if (ids?.length) {
      await this.db.execute(
        `UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL
          AND id IN (${ids.map(() => '?').join(',')})`,
        [user.id, ...ids],
      );
      return;
    }
    await this.db.execute('UPDATE notifications SET read_at = NOW() WHERE user_id = ? AND read_at IS NULL', [user.id]);
  }

  private render(template: string, vars?: Record<string, string | number>): string {
    if (!vars) return template;
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => String(vars[key] ?? ''));
  }

  private async dispatch(channel: NotificationChannel, userId: number, title: string, body: string): Promise<string> {
    const provider =
      channel === 'EMAIL' ? this.config.get('providers.email') : this.config.get('providers.sms');
    if (!provider || provider === 'log') {
      this.logger.log(`[${channel}] user=${userId} "${title}" — no provider configured, not delivered`);
      return 'SKIPPED';
    }
    // Real adapters plug in here (SES/Sendgrid/MSG91/Gupshup). Until then, never claim delivery.
    this.logger.warn(`[${channel}] provider "${provider}" is not implemented yet`);
    return 'SKIPPED';
  }
}
