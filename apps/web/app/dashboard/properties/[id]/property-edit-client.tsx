'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, ErrorNote, StatusChip } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { inr, titleCase } from '@/lib/format';

type PropertyImage = {
  id: number;
  storage_key: string;
  caption?: string | null;
  room_tag?: string | null;
  is_cover: number;
  sort_order: number;
};

export type PropertyManageData = {
  id: number;
  publicId: string;
  slug: string;
  title: string;
  status: string;
  listingType: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  carpetAreaSqft?: number;
  builtupAreaSqft?: number;
  furnishing: string;
  rentAmount?: number;
  salePrice?: number;
  securityDeposit?: number;
  maintenanceAmount?: number;
  maintenancePeriod?: string;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  addressLine1?: string;
  addressLine2?: string;
  description?: string;
  houseRules?: string;
  qualityScore: number;
  wizardStep: number;
  views: number;
  rejectionReason?: string;
  publishedAt?: string;
  amenityCodes: string[];
  images: PropertyImage[];
};

const ALLOWED_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.jfif',
  '.jfi',
  '.jifi',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.avif',
  '.gif',
]);

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/jfif',
  'image/png',
  'image/x-png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/avif',
  'image/gif',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function PropertyEditClient({ initialData }: { initialData: PropertyManageData }) {
  const router = useRouter();
  const [property, setProperty] = useState<PropertyManageData>(initialData);
  const [images, setImages] = useState<PropertyImage[]>(initialData.images || []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshImages = async () => {
    try {
      const refreshed = await api<PropertyImage[]>(`/properties/${property.id}/images`);
      setImages(refreshed);
    } catch {
      // Keep existing
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []);
    if (!rawFiles.length) return;

    setError(null);
    setSuccess(null);

    const validationErrors: string[] = [];
    const validFiles: File[] = [];

    for (const file of rawFiles) {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext) || (file.type && !ALLOWED_MIME_TYPES.has(file.type))) {
        validationErrors.push(
          `${file.name} cannot be uploaded. Supported formats are JPG, JPEG, JFIF, PNG, WebP, HEIC, HEIF and AVIF.`,
        );
        continue;
      }
      if (file.size > MAX_FILE_SIZE) {
        validationErrors.push(`${file.name} exceeds the 10 MB limit.`);
        continue;
      }
      validFiles.push(file);
    }

    if (validationErrors.length) {
      setError(validationErrors.join(' '));
    }

    if (!validFiles.length) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setBusy(true);

    try {
      let uploadedCount = 0;
      for (const file of validFiles) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'properties');

        const uploadRes = await api<{ storageKey: string }>('/uploads', { method: 'POST', body: form });
        await api(`/properties/${property.id}/images`, {
          method: 'POST',
          body: JSON.stringify({ storageKey: uploadRes.storageKey }),
        });
        uploadedCount++;
      }

      setSuccess(`Successfully uploaded ${uploadedCount} photograph${uploadedCount > 1 ? 's' : ''}.`);
      await refreshImages();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Please check the files and try again.');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetCover = async (imageId: number) => {
    setError(null);
    setSuccess(null);
    try {
      await api(`/properties/${property.id}/images/${imageId}/cover`, { method: 'POST' });
      setImages((curr) =>
        curr.map((img) => ({
          ...img,
          is_cover: img.id === imageId ? 1 : 0,
        })),
      );
      setSuccess('Cover photo updated.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not set cover photo.');
    }
  };

  const handleDelete = async (imageId: number) => {
    if (!confirm('Are you sure you want to remove this photograph?')) return;
    setError(null);
    setSuccess(null);
    try {
      await api(`/properties/${property.id}/images/${imageId}`, { method: 'DELETE' });
      await refreshImages();
      setSuccess('Photograph removed.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove photograph.');
    }
  };

  const handleMove = async (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const nextImages = [...images];
    const [moved] = nextImages.splice(index, 1);
    nextImages.splice(targetIndex, 0, moved);
    setImages(nextImages);

    try {
      await api(`/properties/${property.id}/images/reorder`, {
        method: 'POST',
        body: JSON.stringify({ imageIds: nextImages.map((img) => img.id) }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reorder photographs.');
      await refreshImages();
    }
  };

  const handleSubmitForVerification = async () => {
    if (images.length < 4) {
      setError('You must have at least 4 photographs attached before submitting for verification.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/properties/${property.id}/submit`, { method: 'POST' });
      setProperty((prev) => ({ ...prev, status: 'PENDING_VERIFICATION' }));
      setSuccess('Listing submitted for verification successfully!');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to submit listing for verification.');
    } finally {
      setBusy(false);
    }
  };

  const photoCount = images.length;
  const isRequirementSatisfied = photoCount >= 4;

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation */}
      <nav aria-label="Breadcrumb" className="font-mono text-[11px] uppercase tracking-wider text-muted">
        <Link href="/dashboard/properties" className="hover:text-ink">
          My Properties
        </Link>
        <span aria-hidden> / </span>
        <span>{property.title}</span>
      </nav>

      {/* Header Summary Card */}
      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={property.status} />
              <Badge>{titleCase(property.listingType)}</Badge>
              <Badge>{titleCase(property.propertyType)}</Badge>
              {isRequirementSatisfied ? (
                <Badge tone="seal">Photos: {photoCount} (Requirement Satisfied ✓)</Badge>
              ) : (
                <Badge tone="ochre">Photos: {photoCount} (Need {4 - photoCount} more)</Badge>
              )}
            </div>

            <h1 className="mt-3 font-display text-2xl font-semibold sm:text-3xl">{property.title}</h1>
            <p className="mt-1 text-muted">
              {property.locality}, {property.city} {property.pincode}
            </p>

            <div className="mt-4 flex flex-wrap items-baseline gap-4">
              <p className="font-display text-2xl font-semibold tabular">
                {inr(property.listingType === 'SALE' ? property.salePrice : property.rentAmount, true)}
                {property.listingType === 'RENT' ? (
                  <span className="ml-1 font-sans text-sm font-normal text-muted">/month</span>
                ) : null}
              </p>
              {property.bedrooms ? (
                <span className="font-mono text-[12px] uppercase tracking-wider text-muted">
                  {property.bedrooms} BHK · {property.bathrooms ?? 1} Bath
                </span>
              ) : null}
              {property.builtupAreaSqft || property.carpetAreaSqft ? (
                <span className="font-mono text-[12px] uppercase tracking-wider text-muted">
                  {property.builtupAreaSqft ?? property.carpetAreaSqft} sqft
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col items-end gap-3">
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Listing Quality</p>
              <p className="font-display text-2xl font-semibold tabular">{property.qualityScore}%</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button href={`/dashboard/properties/${property.id}/edit`} variant="primary" size="sm">
                Edit Property
              </Button>

              {property.status === 'ACTIVE' ? (
                <Button href={`/${property.slug}`} variant="secondary" size="sm">
                  View public listing ↗
                </Button>
              ) : null}

              {property.status === 'DRAFT' ? (
                <>
                  <Button href={`/dashboard/properties/new?id=${property.id}`} variant="secondary" size="sm">
                    Edit in wizard
                  </Button>
                  <Button onClick={handleSubmitForVerification} disabled={busy || !isRequirementSatisfied} size="sm">
                    {busy ? 'Submitting…' : 'Submit for verification'}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {property.rejectionReason ? (
          <div className="mt-4 rounded-card border border-alert/30 bg-alert/10 p-4 text-[13px] text-alert">
            <strong>Verification feedback:</strong> {property.rejectionReason}
          </div>
        ) : null}
      </Card>

      {/* Notifications */}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      {success ? (
        <div className="rounded-card border border-seal/30 bg-seal-soft p-3 text-[14px] text-seal">
          ✓ {success}
        </div>
      ) : null}

      {/* Property Photos Section */}
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 className="font-display text-xl font-semibold">Property Photographs</h2>
            <p className="text-[13px] text-muted">
              Photographs are verified against property registry documents. Minimum 4 photos required for publication.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/gif,.jpg,.jpeg,.jfif,.png,.webp,.heic,.heif,.avif,.gif"
              multiple
              onChange={handleFileUpload}
              disabled={busy}
              className="hidden"
            />
            <Button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              {busy ? 'Uploading…' : '+ Add Photos'}
            </Button>
          </div>
        </div>

        {/* Photos Requirements Banner */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-card bg-paper p-3 font-mono text-[12px]">
          <div>
            <span className="text-muted">Status: </span>
            <strong className="text-ink">
              {photoCount} / 4 minimum photos
            </strong>
          </div>
          <div>
            {isRequirementSatisfied ? (
              <span className="text-seal font-medium">✓ Publication requirement satisfied</span>
            ) : (
              <span className="text-ochre font-medium">
                ⚠ Needs {4 - photoCount} more photo{4 - photoCount > 1 ? 's' : ''} to meet publication threshold
              </span>
            )}
          </div>
        </div>

        {/* Photos Grid */}
        {images.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {images.map((img, idx) => (
              <div
                key={img.id}
                className={`group relative overflow-hidden rounded-card border bg-white shadow-sm transition-all ${
                  img.is_cover === 1 ? 'border-seal ring-2 ring-seal/30' : 'border-line hover:border-seal/40'
                }`}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-seal-soft">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/storage/${img.storage_key}`}
                    alt={img.caption || `Photograph ${idx + 1}`}
                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                  />

                  {img.is_cover === 1 ? (
                    <span className="absolute left-2 top-2 rounded-pill bg-seal px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white shadow">
                      COVER
                    </span>
                  ) : (
                    <span className="absolute left-2 top-2 rounded-pill bg-ink/70 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white shadow">
                      #{idx + 1}
                    </span>
                  )}
                </div>

                <div className="p-3">
                  <p className="truncate font-mono text-[11px] text-muted" title={img.storage_key}>
                    {img.caption || img.room_tag || img.storage_key.split('/').pop()?.replace(/^\d+_[a-f0-9]+_/, '')}
                  </p>

                  <div className="mt-2.5 flex items-center justify-between border-t border-line/60 pt-2 text-[12px]">
                    {img.is_cover !== 1 ? (
                      <button
                        type="button"
                        onClick={() => handleSetCover(img.id)}
                        className="font-medium text-seal hover:underline"
                      >
                        Set Cover
                      </button>
                    ) : (
                      <span className="font-mono text-[10px] uppercase tracking-wider text-seal font-semibold">
                        Primary Cover
                      </span>
                    )}

                    <div className="flex items-center gap-1">
                      {idx > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'left')}
                          title="Move left"
                          className="rounded px-1.5 py-0.5 text-muted hover:bg-seal-soft hover:text-ink"
                        >
                          ←
                        </button>
                      ) : null}
                      {idx < images.length - 1 ? (
                        <button
                          type="button"
                          onClick={() => handleMove(idx, 'right')}
                          title="Move right"
                          className="rounded px-1.5 py-0.5 text-muted hover:bg-seal-soft hover:text-ink"
                        >
                          →
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleDelete(img.id)}
                        title="Delete photograph"
                        className="rounded px-1.5 py-0.5 text-alert hover:bg-alert/10"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-card border-2 border-dashed border-line bg-paper/40 p-8 text-center">
            <p className="text-[14px] font-medium text-ink">No photographs uploaded yet</p>
            <p className="mt-1 text-[13px] text-muted">
              Add photographs to showcase this property and satisfy the 4-photo publication requirement.
            </p>
            <div className="mt-4">
              <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={busy}>
                + Add Photos
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Property Details Snapshot */}
      <Card className="p-6">
        <h2 className="font-display text-xl font-semibold">Property Specifications</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Listing Type</p>
            <p className="mt-0.5 font-medium">{titleCase(property.listingType)}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Property Type</p>
            <p className="mt-0.5 font-medium">{titleCase(property.propertyType)}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Furnishing</p>
            <p className="mt-0.5 font-medium">{titleCase(property.furnishing)}</p>
          </div>
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Bedrooms / Baths</p>
            <p className="mt-0.5 font-medium">
              {property.bedrooms ?? '—'} BHK / {property.bathrooms ?? '—'} Bath
            </p>
          </div>
        </div>

        {property.description ? (
          <div className="mt-6 border-t border-line pt-4">
            <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Description</p>
            <p className="mt-1 text-[14px] leading-relaxed text-ink/80">{property.description}</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
