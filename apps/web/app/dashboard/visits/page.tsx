import { Metadata } from 'next';
import { serverApiOrNull } from '@/lib/api';
import { VisitsClient } from './visits-client';

export const metadata: Metadata = {
  title: 'Property Visits & Walkthroughs | Odibrick',
  description: 'Schedule, confirm, reschedule, and manage property visits and walkthroughs for customers and providers.',
};

type Me = {
  id: number;
  roles: string[];
};

export default async function VisitsPage() {
  const me = await serverApiOrNull<Me>('/auth/me');
  const roles = me?.roles ?? [];
  return <VisitsClient userRoles={roles} />;
}
