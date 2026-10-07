import { Metadata } from 'next';
import { CommercialClient } from './commercial-client';

export const metadata: Metadata = {
  title: 'Commercial Operations & Platform Revenue | Odibrick Management',
  description: 'Manage commercial obligations, pricing rules, revenue attribution, waivers, and analytical reports.',
};

export default function CommercialPage() {
  return <CommercialClient />;
}
