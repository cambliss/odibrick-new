import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi, ApiError } from '@/lib/api';
import { PropertyEditForm, PropertyEditData } from './property-edit-form';

export const metadata: Metadata = {
  title: 'Edit Property Details | Odibrick',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function EditPropertyPage({ params }: { params: { id: string } }) {
  const propertyId = Number(params.id);
  if (!propertyId || isNaN(propertyId)) {
    notFound();
  }

  try {
    const property = await serverApi<PropertyEditData>(`/properties/mine/${propertyId}`);
    if (!property) {
      notFound();
    }

    return <PropertyEditForm initialData={property} />;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }
}
