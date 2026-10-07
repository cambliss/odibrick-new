import { Metadata } from 'next';
import { DocumentsClient } from './documents-client';

export const metadata: Metadata = {
  title: 'Documents & Vault | Odibrick',
  description: 'Manage verified compliance documents, identity proof, and property vault.',
  robots: { index: false, follow: false },
};

export default function DocumentsPage() {
  return <DocumentsClient />;
}
