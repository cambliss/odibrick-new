import { Metadata } from 'next';
import { LeadsInboxClient } from './leads-inbox-client';

export const metadata: Metadata = {
  title: 'Leads & Enquiries Inbox | Odibrick Provider Operations',
  description: 'Manage incoming customer leads, follow-ups, qualifications, and application conversions for your property listings.',
};

export default function LeadsPage() {
  return <LeadsInboxClient />;
}
