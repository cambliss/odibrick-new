import { Metadata } from 'next';
import { MessagesClient } from './messages-client';

export const metadata: Metadata = {
  title: 'Messages & Communications | Odibrick',
  description: 'Contextual communication workspace for customers, owners, agents, and management.',
};

export default function MessagesPage() {
  return <MessagesClient />;
}
