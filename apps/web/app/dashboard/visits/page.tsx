import { Metadata } from 'next';
import { VisitsClient } from './visits-client';

export const metadata: Metadata = {
  title: 'Property Visits & Walkthroughs | Odibrick',
  description: 'Schedule, confirm, reschedule, and manage property visits and walkthroughs for customers and providers.',
};

export default function VisitsPage() {
  return <VisitsClient />;
}
