'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, CardHeader, EmptyState } from '@/components/ui';
import { inr, shortDate } from '@/lib/format';

export function SavedPropertiesClient({ initialData }: { initialData: any }) {
  const [items, setItems] = useState<any[]>(initialData?.data || []);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleUnsave = async (propertyId: number) => {
    if (!confirm('Remove this property from your saved list?')) return;
    setLoadingId(propertyId);
    try {
      const res = await fetch(`/api/customer/saved-properties/${propertyId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setItems((prev) => prev.filter((it) => it.propertyId !== propertyId));
      } else {
        setItems((prev) => prev.filter((it) => it.propertyId !== propertyId));
      }
    } catch {
      setItems((prev) => prev.filter((it) => it.propertyId !== propertyId));
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ink">Saved Properties</h1>
          <p className="text-sm text-muted">
            Track your shortlisted properties, check live availability, and schedule visits.
          </p>
        </div>
        <Link href="/properties">
          <Button variant="primary">Browse More Properties</Button>
        </Link>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No saved properties yet"
          body="Browse the marketplace and save properties you'd like to shortlist, compare, and track."
          action={
            <Link href="/properties">
              <Button variant="primary">Explore Marketplace</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {items.map(({ propertyId, note, savedAt, isAvailable, property }) => (
            <Card key={propertyId} className="flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <div>
                <div className="relative h-48 bg-slate-100 flex items-center justify-center overflow-hidden">
                  {property.coverImageUrl ? (
                    <img
                      src={property.coverImageUrl}
                      alt={property.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-slate-400 font-medium">No preview available</span>
                  )}
                  <div className="absolute top-3 right-3 flex gap-2">
                    {isAvailable ? (
                      <Badge tone="seal">Available</Badge>
                    ) : (
                      <Badge tone="alert">Unavailable</Badge>
                    )}
                    {property.isProtected && <Badge tone="neutral">Protected</Badge>}
                  </div>
                </div>

                <div className="p-5 space-y-3">
                  <div>
                    <h3 className="text-lg font-bold text-ink line-clamp-1">
                      {property.title}
                    </h3>
                    <p className="text-xs text-muted">
                      {property.locality}, {property.city}
                    </p>
                  </div>

                  <div className="flex items-baseline justify-between">
                    <div>
                      <span className="text-xl font-extrabold text-ink">
                        {inr(property.rentAmount)}
                      </span>
                      <span className="text-xs text-muted"> / month</span>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 bg-slate-100 rounded text-slate-700">
                      {property.bedrooms} BHK • {property.furnishing?.replace('_', ' ')}
                    </span>
                  </div>

                  {note && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                      <strong>Your note:</strong> {note}
                    </div>
                  )}

                  <div className="text-[11px] text-muted pt-1">
                    Saved on {shortDate(savedAt)}
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-line bg-slate-50 flex items-center justify-between gap-2">
                <Link href={`/properties/${property.slug || property.id}`} className="flex-1">
                  <Button variant="secondary" size="sm" className="w-full text-xs">
                    View Details
                  </Button>
                </Link>
                <Button
                  variant="danger"
                  size="sm"
                  className="text-xs"
                  onClick={() => handleUnsave(propertyId)}
                  disabled={loadingId === propertyId}
                >
                  {loadingId === propertyId ? 'Removing...' : 'Remove'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
