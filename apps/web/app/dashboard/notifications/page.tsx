import type { Metadata } from 'next';
import { serverApi } from '@/lib/api';
import { NotificationsClient, NotificationItem } from './notifications-client';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  let notifications: NotificationItem[] = [];

  try {
    notifications = await serverApi<NotificationItem[]>('/notifications');
  } catch {
    notifications = [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Notifications</h1>
        <p className="mt-1 text-[15px] text-muted">
          Operational alerts, lease milestones, payment reminders, and dispute updates.
        </p>
      </div>

      <NotificationsClient initialNotifications={notifications} />
    </div>
  );
}
