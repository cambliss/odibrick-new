import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { serverApi, ApiError } from '@/lib/api';
import { PropertyEditClient, PropertyManageData } from './property-edit-client';

export const metadata: Metadata = {
  title: 'Manage Property & Media',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PropertyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const propertyId = Number(id);
  if (!propertyId || isNaN(propertyId)) {
    notFound();
  }

  try {
    const property = await serverApi<PropertyManageData>(`/properties/mine/${propertyId}`);
    if (!property) {
      notFound();
    }

    return <PropertyEditClient initialData={property} />;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      notFound();
    }
    throw error;
  }
}
