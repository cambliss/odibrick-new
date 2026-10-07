import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { serverApi, serverApiOrNull, ApiError } from '@/lib/api';
import { AgreementDrafter, type MasterClause, type AgreementData, type LegalCaseContext } from './agreement-drafter';

export const metadata: Metadata = { title: 'Agreement Drafting · Odibrick Legal', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

type Me = {
  id: number;
  fullName: string;
  email: string;
  roles: string[];
  permissions: string[];
};

export default async function AgreementDraftingPage({ params }: { params: { id: string } }) {
  const me = await serverApiOrNull<Me>('/auth/me');
  if (!me) redirect(`/login?next=/dashboard/legal/${params.id}/agreement`);

  // RBAC check: Must hold agreement.draft or legal.case.manage
  if (!me.permissions.includes('agreement.draft') && !me.permissions.includes('legal.case.manage')) {
    redirect(`/dashboard/legal/${params.id}`);
  }

  let caseResponse: {
    case: LegalCaseContext;
    agreements: Array<{ id: number }>;
  };

  try {
    caseResponse = await serverApi<any>(`/legal/cases/${params.id}`);
  } catch (error) {
    if (error instanceof ApiError && [403, 404].includes(error.status)) notFound();
    throw error;
  }

  const { case: legalCase, agreements } = caseResponse;

  // Fetch Master Clause Library
  const masterClauses = await serverApi<MasterClause[]>('/legal/clauses');

  // If an agreement already exists for this case, fetch its details
  let initialAgreement: AgreementData | null = null;
  const existingAgreementId = agreements[0]?.id;
  if (existingAgreementId) {
    try {
      initialAgreement = await serverApi<AgreementData>(`/agreements/${existingAgreementId}`);
    } catch {
      initialAgreement = null;
    }
  }

  return (
    <AgreementDrafter
      legalCase={legalCase}
      initialAgreement={initialAgreement}
      masterClauses={masterClauses}
      userPermissions={me.permissions}
    />
  );
}
