'use client';

import { useState } from 'react';
import { Badge, Button, Card, EmptyState } from '@/components/ui';
import { shortDate } from '@/lib/format';
import { api } from '@/lib/api';

export interface NotificationItem {
  id: number;
  event_code: string;
  title: string;
  body: string;
  action_url?: string;
  severity: 'INFO' | 'ACTION' | 'WARNING' | 'CRITICAL';
  read_at?: string | null;
  created_at: string;
}

export function NotificationsClient({
  initialNotifications,
}: {
  initialNotifications: NotificationItem[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [marking, setMarking] = useState(false);

  async function markAllAsRead() {
    const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setMarking(true);
    try {
      await api('/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({ ids: unreadIds }),
      });
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() })),
      );
    } catch (err) {
      console.error('Failed to mark notifications read:', err);
    } finally {
      setMarking(false);
    }
  }

  async function markSingleRead(id: number) {
    try {
      await api('/notifications/mark-read', {
        method: 'POST',
        body: JSON.stringify({ ids: [id] }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
      );
    } catch (err) {
      console.error('Failed to mark notification read:', err);
    }
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const severityTone = (severity: string): 'neutral' | 'seal' | 'ochre' | 'alert' | 'info' => {
    switch (severity) {
      case 'CRITICAL':
        return 'alert';
      case 'WARNING':
        return 'ochre';
      case 'ACTION':
        return 'info';
      default:
        return 'neutral';
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-line pb-3">
        <span className="text-xs text-muted">
          Showing {notifications.length} notification{notifications.length === 1 ? '' : 's'}
          {unreadCount > 0 ? ` (${unreadCount} unread)` : ' (all caught up)'}
        </span>
        {unreadCount > 0 && (
          <Button size="sm" variant="ghost" onClick={markAllAsRead} disabled={marking}>
            {marking ? 'Marking...' : 'Mark all as read'}
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          title="No notifications"
          body="You do not have any operational updates or messages at this time."
          action={<Button href="/dashboard">Return to dashboard</Button>}
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => {
            const isUnread = !item.read_at;
            return (
              <Card
                key={item.id}
                className={`p-4 transition ${
                  isUnread
                    ? 'border-seal/40 bg-surface shadow-sm'
                    : 'border-line/60 bg-white opacity-85 hover:opacity-100'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {isUnread && <span className="h-2 w-2 rounded-full bg-accent" />}
                      <h2 className="font-medium text-seal">{item.title}</h2>
                      <Badge tone={severityTone(item.severity)}>{item.severity}</Badge>
                    </div>
                    {item.body && <p className="text-[13px] text-muted">{item.body}</p>}
                    <span className="font-mono text-[11px] text-muted">
                      {shortDate(item.created_at)}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {item.action_url && (
                      <Button
                        size="sm"
                        variant="secondary"
                        href={item.action_url}
                        onClick={() => markSingleRead(item.id)}
                      >
                        View Details
                      </Button>
                    )}
                    {isUnread && (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Mark "${item.title}" as read`}
                        onClick={() => markSingleRead(item.id)}
                      >
                        ✓ Mark read
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
