import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi } from '@/lib/api';
import { TaskDetailClient } from './task-detail-client';

export const metadata: Metadata = {
  title: 'Task Workspace — Operations Control Tower',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const taskId = parseInt(params.id, 10);
  if (isNaN(taskId)) {
    notFound();
  }

  const detail = await serverApi<any>(`/admin/operations/tasks/${taskId}`).catch(() => null);
  if (!detail || !detail.task) {
    notFound();
  }

  return <TaskDetailClient initialDetail={detail} />;
}
