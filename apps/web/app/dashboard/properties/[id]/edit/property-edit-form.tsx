'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, ErrorNote, StatusChip } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { inr, titleCase } from '@/lib/format';

export type PropertyImage = {
  id: number;
  storage_key: string;
  caption?: string | null;
  room_tag?: string | null;
  is_cover: number;
  sort_order: number;
};

export type PropertyEditData = {
  id: number;
  publicId: string;
  slug: string;
  title: string;
  status: string;
  listingType: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  balconies?: number;
  floorNumber?: number;
  totalFloors?: number;
  carpetAreaSqft?: number;
  builtupAreaSqft?: number;
  furnishing: string;
  facing?: string;
  ageYears?: number;
  parkingCovered?: number;
  parkingOpen?: number;
  rentAmount?: number;
  salePrice?: number;
  securityDeposit?: number;
  maintenanceAmount?: number;
  maintenancePeriod?: string;
  priceNegotiable?: boolean;
  lockInMonths?: number;
  noticePeriodDays?: number;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  addressLine1?: string;
  addressLine2?: string;
  latitude?: number;
  longitude?: number;
  availableFrom?: string;
  preferredTenants?: string[];
  petsAllowed?: boolean;
  nonVegAllowed?: boolean;
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

const PROPERTY_TYPES = [
  ['APARTMENT', 'Apartment'],
  ['INDEPENDENT_HOUSE', 'Independent house'],
  ['VILLA', 'Villa'],
  ['STUDIO', 'Studio'],
  ['PENTHOUSE', 'Penthouse'],
  ['PLOT', 'Plot'],
  ['OFFICE', 'Office'],
  ['SHOP', 'Shop'],
  ['WAREHOUSE', 'Warehouse'],
  ['PG', 'PG / Co-living'],
] as const;

const FURNISHINGS = [
  ['UNFURNISHED', 'Unfurnished'],
  ['SEMI_FURNISHED', 'Semi Furnished'],
  ['FULLY_FURNISHED', 'Fully Furnished'],
] as const;

const FACING_OPTIONS = [
  ['N', 'North (N)'],
  ['S', 'South (S)'],
  ['E', 'East (E)'],
  ['W', 'West (W)'],
  ['NE', 'North-East (NE)'],
  ['NW', 'North-West (NW)'],
  ['SE', 'South-East (SE)'],
  ['SW', 'South-West (SW)'],
] as const;

const MAINTENANCE_PERIODS = [
  ['MONTHLY', 'Monthly'],
  ['QUARTERLY', 'Quarterly'],
  ['YEARLY', 'Yearly'],
  ['INCLUDED', 'Included in rent'],
  ['NONE', 'None'],
] as const;

const AMENITIES_CATALOG = [
  ['LIFT', 'Lift / Elevator'],
  ['POWER_BACKUP', 'Power Backup'],
  ['SECURITY', '24x7 Security'],
  ['GATED', 'Gated Community'],
  ['CCTV', 'CCTV Surveillance'],
  ['PARKING_COVERED', 'Covered Parking'],
  ['GYM', 'Fitness Centre / Gym'],
  ['POOL', 'Swimming Pool'],
  ['PARK', 'Children Park / Garden'],
  ['CLUBHOUSE', 'Clubhouse / Community Hall'],
  ['PIPED_GAS', 'Piped Gas (PNG)'],
  ['WATER_24X7', '24x7 Running Water'],
  ['AC', 'Air Conditioning'],
  ['MODULAR_KITCHEN', 'Modular Kitchen'],
  ['WARDROBE', 'Built-in Wardrobes'],
  ['GEYSER', 'Water Heaters / Geyser'],
  ['INTERCOM', 'Intercom Facility'],
  ['VISITOR_PARKING', 'Visitor Parking'],
] as const;

const TENANT_OPTIONS = [
  ['FAMILY', 'Families'],
  ['BACHELOR_MALE', 'Bachelors (Male)'],
  ['BACHELOR_FEMALE', 'Bachelors (Female)'],
  ['COMPANY', 'Company Lease'],
  ['STUDENT', 'Students'],
  ['ANY', 'Open to All / Anyone'],
] as const;

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

const SECTIONS = [
  { id: 'basic', label: '1. Basic Details' },
  { id: 'location', label: '2. Location & Address' },
  { id: 'config', label: '3. Configuration & Area' },
  { id: 'pricing', label: '4. Pricing & Terms' },
  { id: 'amenities', label: '5. Amenities' },
  { id: 'availability', label: '6. Availability & Rules' },
  { id: 'description', label: '7. Description' },
  { id: 'photos', label: '8. Photographs' },
] as const;

export function PropertyEditForm({ initialData }: { initialData: PropertyEditData }) {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<string>('basic');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [images, setImages] = useState<PropertyImage[]>(initialData.images || []);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Editable Form State
  const [formData, setFormData] = useState({
    title: initialData.title ?? '',
    listingType: initialData.listingType ?? 'RENT',
    propertyType: initialData.propertyType ?? 'APARTMENT',
    addressLine1: initialData.addressLine1 ?? '',
    addressLine2: initialData.addressLine2 ?? '',
    locality: initialData.locality ?? '',
    city: initialData.city ?? '',
    state: initialData.state ?? '',
    pincode: initialData.pincode ?? '',
    latitude: initialData.latitude ?? undefined,
    longitude: initialData.longitude ?? undefined,
    bedrooms: initialData.bedrooms ?? 2,
    bathrooms: initialData.bathrooms ?? 2,
    balconies: initialData.balconies ?? 1,
    floorNumber: initialData.floorNumber ?? 0,
    totalFloors: initialData.totalFloors ?? 1,
    carpetAreaSqft: initialData.carpetAreaSqft ?? undefined,
    builtupAreaSqft: initialData.builtupAreaSqft ?? undefined,
    furnishing: initialData.furnishing ?? 'UNFURNISHED',
    facing: initialData.facing ?? 'E',
    ageYears: initialData.ageYears ?? 0,
    parkingCovered: initialData.parkingCovered ?? 1,
    parkingOpen: initialData.parkingOpen ?? 0,
    rentAmount: initialData.rentAmount ?? undefined,
    salePrice: initialData.salePrice ?? undefined,
    securityDeposit: initialData.securityDeposit ?? undefined,
    maintenanceAmount: initialData.maintenanceAmount ?? undefined,
    maintenancePeriod: initialData.maintenancePeriod ?? 'MONTHLY',
    priceNegotiable: !!initialData.priceNegotiable,
    lockInMonths: initialData.lockInMonths ?? 6,
    noticePeriodDays: initialData.noticePeriodDays ?? 30,
    amenities: initialData.amenityCodes ?? [],
    availableFrom: initialData.availableFrom ? initialData.availableFrom.slice(0, 10) : '',
    preferredTenants: initialData.preferredTenants ?? ['FAMILY'],
    petsAllowed: !!initialData.petsAllowed,
    nonVegAllowed: initialData.nonVegAllowed !== undefined ? !!initialData.nonVegAllowed : true,
    description: initialData.description ?? '',
    houseRules: initialData.houseRules ?? '',
  });

  const updateField = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setSaveStatus(null);
  };

  const toggleAmenity = (code: string) => {
    setFormData((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(code)
        ? prev.amenities.filter((c) => c !== code)
        : [...prev.amenities, code],
    }));
    setSaveStatus(null);
  };

  const toggleTenant = (code: string) => {
    setFormData((prev) => ({
      ...prev,
      preferredTenants: prev.preferredTenants.includes(code)
        ? prev.preferredTenants.filter((c) => c !== code)
        : [...prev.preferredTenants, code],
    }));
    setSaveStatus(null);
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    setError(null);
    setSaveStatus(null);

    try {
      const payload: Record<string, any> = {
        title: formData.title.trim(),
        listingType: formData.listingType,
        propertyType: formData.propertyType,
        addressLine1: formData.addressLine1.trim(),
        addressLine2: formData.addressLine2.trim() || undefined,
        locality: formData.locality.trim(),
        city: formData.city.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        latitude: formData.latitude ? Number(formData.latitude) : undefined,
        longitude: formData.longitude ? Number(formData.longitude) : undefined,
        bedrooms: formData.bedrooms !== undefined ? Number(formData.bedrooms) : undefined,
        bathrooms: formData.bathrooms !== undefined ? Number(formData.bathrooms) : undefined,
        balconies: formData.balconies !== undefined ? Number(formData.balconies) : undefined,
        floorNumber: formData.floorNumber !== undefined ? Number(formData.floorNumber) : undefined,
        totalFloors: formData.totalFloors !== undefined ? Number(formData.totalFloors) : undefined,
        carpetAreaSqft: formData.carpetAreaSqft ? Number(formData.carpetAreaSqft) : undefined,
        builtupAreaSqft: formData.builtupAreaSqft ? Number(formData.builtupAreaSqft) : undefined,
        furnishing: formData.furnishing,
        facing: formData.facing || undefined,
        ageYears: formData.ageYears !== undefined ? Number(formData.ageYears) : undefined,
        parkingCovered: formData.parkingCovered !== undefined ? Number(formData.parkingCovered) : 0,
        parkingOpen: formData.parkingOpen !== undefined ? Number(formData.parkingOpen) : 0,
        rentAmount: formData.rentAmount ? Number(formData.rentAmount) : undefined,
        salePrice: formData.salePrice ? Number(formData.salePrice) : undefined,
        securityDeposit: formData.securityDeposit ? Number(formData.securityDeposit) : undefined,
        maintenanceAmount: formData.maintenanceAmount ? Number(formData.maintenanceAmount) : undefined,
        maintenancePeriod: formData.maintenancePeriod,
        priceNegotiable: formData.priceNegotiable,
        lockInMonths: formData.lockInMonths ? Number(formData.lockInMonths) : undefined,
        noticePeriodDays: formData.noticePeriodDays ? Number(formData.noticePeriodDays) : undefined,
        amenityCodes: formData.amenities,
        availableFrom: formData.availableFrom || undefined,
        preferredTenants: formData.preferredTenants,
        petsAllowed: formData.petsAllowed,
        nonVegAllowed: formData.nonVegAllowed,
        description: formData.description.trim(),
        houseRules: formData.houseRules.trim() || undefined,
      };

      await api(`/properties/${initialData.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });

      setSaveStatus(`Saved successfully at ${new Date().toLocaleTimeString('en-IN')}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to save changes. Please review the inputs.');
    } finally {
      setSaving(false);
    }
  };

  const refreshImages = async () => {
    try {
      const refreshed = await api<PropertyImage[]>(`/properties/${initialData.id}/images`);
      setImages(refreshed);
    } catch {
      // Keep existing
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files ?? []);
    if (!rawFiles.length) return;

    setError(null);
    const validFiles: File[] = [];
    const validationErrors: string[] = [];

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

    if (validationErrors.length) setError(validationErrors.join(' '));
    if (!validFiles.length) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingPhotos(true);
    try {
      for (const file of validFiles) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'properties');
        const uploadRes = await api<{ storageKey: string }>('/uploads', { method: 'POST', body: form });
        await api(`/properties/${initialData.id}/images`, {
          method: 'POST',
          body: JSON.stringify({ storageKey: uploadRes.storageKey }),
        });
      }
      await refreshImages();
      setSaveStatus('Photographs uploaded successfully.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Photo upload failed.');
    } finally {
      setUploadingPhotos(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetCover = async (imageId: number) => {
    try {
      await api(`/properties/${initialData.id}/images/${imageId}/cover`, { method: 'POST' });
      setImages((curr) => curr.map((img) => ({ ...img, is_cover: img.id === imageId ? 1 : 0 })));
      setSaveStatus('Cover photograph updated.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not set cover photo.');
    }
  };

  const handleDeletePhoto = async (imageId: number) => {
    if (!confirm('Are you sure you want to remove this photograph?')) return;
    try {
      await api(`/properties/${initialData.id}/images/${imageId}`, { method: 'DELETE' });
      await refreshImages();
      setSaveStatus('Photograph removed.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove photograph.');
    }
  };

  const handleMovePhoto = async (index: number, direction: 'left' | 'right') => {
    const targetIndex = direction === 'left' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const nextImages = [...images];
    const [moved] = nextImages.splice(index, 1);
    nextImages.splice(targetIndex, 0, moved);
    setImages(nextImages);

    try {
      await api(`/properties/${initialData.id}/images/reorder`, {
        method: 'POST',
        body: JSON.stringify({ imageIds: nextImages.map((img) => img.id) }),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reorder photographs.');
      await refreshImages();
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <nav aria-label="Breadcrumb" className="font-mono text-[11px] uppercase tracking-wider text-muted">
          <Link href="/dashboard/properties" className="hover:text-ink">
            My Properties
          </Link>
          <span aria-hidden> / </span>
          <Link href={`/dashboard/properties/${initialData.id}`} className="hover:text-ink">
            {initialData.title}
          </Link>
          <span aria-hidden> / </span>
          <span className="text-ink font-semibold">Edit Property</span>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          {initialData.status === 'ACTIVE' ? (
            <Link
              href={`/${initialData.slug}`}
              target="_blank"
              className="rounded-button border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-seal hover:text-seal transition-colors"
            >
              View public listing ↗
            </Link>
          ) : null}

          <Link
            href={`/dashboard/properties/${initialData.id}`}
            className="rounded-button border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted hover:text-ink transition-colors"
          >
            Cancel / Back
          </Link>

          <Button
            type="button"
            onClick={handleSaveChanges}
            disabled={saving}
            variant="primary"
            size="sm"
            className="shadow-sm"
          >
            {saving ? 'Saving Changes…' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Property Overview Banner */}
      <Card className="p-5 bg-surface-raised border border-line">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip status={initialData.status} />
              <Badge>{titleCase(formData.listingType)}</Badge>
              <Badge>{titleCase(formData.propertyType)}</Badge>
              <span className="font-mono text-xs text-muted">ID: #{initialData.id} • {initialData.publicId}</span>
            </div>
            <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">
              {formData.title || 'Untitled Property'}
            </h1>
            <p className="text-sm text-muted">
              {formData.locality ? `${formData.locality}, ` : ''}{formData.city || 'Location unassigned'} {formData.pincode}
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Completeness</p>
              <p className="font-display text-2xl font-semibold tabular text-seal">{initialData.qualityScore}%</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted">Photos</p>
              <p className={`font-display text-2xl font-semibold tabular ${images.length >= 4 ? 'text-seal' : 'text-ochre'}`}>
                {images.length}/4
              </p>
            </div>
          </div>
        </div>

        {/* Notifications & Status Banner */}
        {error ? (
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}

        {saveStatus ? (
          <div className="mt-4 rounded-card border border-seal/40 bg-seal-soft p-3 text-sm font-medium text-seal flex items-center justify-between">
            <span>✓ {saveStatus}</span>
            <button onClick={() => setSaveStatus(null)} className="text-xs text-muted hover:text-ink">Dismiss</button>
          </div>
        ) : null}
      </Card>

      {/* Main Layout: Left Section Navigator + Right Form Fields */}
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Section Navigation Rail */}
        <aside className="lg:sticky lg:top-6 lg:self-start space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted px-3 py-1">Sections</p>
          <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-1 pb-2 lg:pb-0">
            {SECTIONS.map((sec) => (
              <button
                key={sec.id}
                type="button"
                onClick={() => setActiveSection(sec.id)}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors ${
                  activeSection === sec.id
                    ? 'bg-seal text-white font-semibold shadow-sm'
                    : 'text-muted hover:bg-surface-raised hover:text-ink'
                }`}
              >
                {sec.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Section Form Cards */}
        <div className="space-y-6">
          {/* SECTION 1: BASIC DETAILS */}
          {activeSection === 'basic' && (
            <Card className="p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">1. Basic Details & Type</h2>
                <p className="text-xs text-muted">Specify the listing purpose, property category, and public headline.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                    Listing Purpose *
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      ['RENT', 'To Rent Out'],
                      ['SALE', 'To Sell'],
                      ['PG', 'PG / Co-Living'],
                    ].map(([val, lbl]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => updateField('listingType', val)}
                        className={`rounded-card border p-3 text-left transition-all ${
                          formData.listingType === val
                            ? 'border-seal bg-seal-soft font-semibold text-seal-deep shadow-sm'
                            : 'border-line hover:border-slate-300'
                        }`}
                      >
                        <span className="text-sm">{lbl}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                    Property Type *
                  </label>
                  <select
                    value={formData.propertyType}
                    onChange={(e) => updateField('propertyType', e.target.value)}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  >
                    {PROPERTY_TYPES.map(([val, lbl]) => (
                      <option key={val} value={val}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Property Headline / Title *
                  </label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="e.g. Spacious 3 BHK Apartment with Sea View in Bandra West"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                  <p className="mt-1 text-[11px] text-muted">
                    Clear titles with locality and configuration attract up to 3x more enquiries.
                  </p>
                </div>
              </div>
            </Card>
          )}

          {/* SECTION 2: LOCATION & ADDRESS */}
          {activeSection === 'location' && (
            <Card className="p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">2. Location & Address</h2>
                <p className="text-xs text-muted">Exact address is shared only with verified prospects and lease signatories.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Address Line 1 (Building / Street) *
                  </label>
                  <input
                    type="text"
                    value={formData.addressLine1}
                    onChange={(e) => updateField('addressLine1', e.target.value)}
                    placeholder="e.g. Flat 402, Sea Pearl Tower, Hill Road"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Address Line 2 (Landmark / Area optional)
                  </label>
                  <input
                    type="text"
                    value={formData.addressLine2}
                    onChange={(e) => updateField('addressLine2', e.target.value)}
                    placeholder="e.g. Near Mehboob Studio"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Locality / Neighborhood *
                  </label>
                  <input
                    type="text"
                    value={formData.locality}
                    onChange={(e) => updateField('locality', e.target.value)}
                    placeholder="e.g. Bandra West"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    placeholder="e.g. Mumbai"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    State *
                  </label>
                  <input
                    type="text"
                    value={formData.state}
                    onChange={(e) => updateField('state', e.target.value)}
                    placeholder="e.g. Maharashtra"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    PIN Code *
                  </label>
                  <input
                    type="text"
                    value={formData.pincode}
                    onChange={(e) => updateField('pincode', e.target.value)}
                    placeholder="e.g. 400050"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Latitude (GPS Coordinates optional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.latitude ?? ''}
                    onChange={(e) => updateField('latitude', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g. 19.0596"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Longitude (GPS Coordinates optional)
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={formData.longitude ?? ''}
                    onChange={(e) => updateField('longitude', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g. 72.8295"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* SECTION 3: CONFIGURATION & AREA */}
          {activeSection === 'config' && (
            <Card className="p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">3. Configuration & Specifications</h2>
                <p className="text-xs text-muted">Layout specs, floor details, carpet dimensions and parking provisions.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Bedrooms (BHK)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={formData.bedrooms ?? ''}
                    onChange={(e) => updateField('bedrooms', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Bathrooms
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={formData.bathrooms ?? ''}
                    onChange={(e) => updateField('bathrooms', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Balconies
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.balconies ?? ''}
                    onChange={(e) => updateField('balconies', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Carpet Area (sq. ft.)
                  </label>
                  <input
                    type="number"
                    min="50"
                    value={formData.carpetAreaSqft ?? ''}
                    onChange={(e) => updateField('carpetAreaSqft', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g. 950"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Built-up Area (sq. ft.)
                  </label>
                  <input
                    type="number"
                    min="50"
                    value={formData.builtupAreaSqft ?? ''}
                    onChange={(e) => updateField('builtupAreaSqft', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g. 1200"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Furnishing Status
                  </label>
                  <select
                    value={formData.furnishing}
                    onChange={(e) => updateField('furnishing', e.target.value)}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  >
                    {FURNISHINGS.map(([val, lbl]) => (
                      <option key={val} value={val}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Property Floor Number
                  </label>
                  <input
                    type="number"
                    value={formData.floorNumber ?? ''}
                    onChange={(e) => updateField('floorNumber', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Total Floors in Building
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formData.totalFloors ?? ''}
                    onChange={(e) => updateField('totalFloors', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Direction Facing
                  </label>
                  <select
                    value={formData.facing}
                    onChange={(e) => updateField('facing', e.target.value)}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  >
                    {FACING_OPTIONS.map(([val, lbl]) => (
                      <option key={val} value={val}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Age of Property (Years)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.ageYears ?? ''}
                    onChange={(e) => updateField('ageYears', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Covered Parking Slots
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.parkingCovered ?? 0}
                    onChange={(e) => updateField('parkingCovered', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Open Parking Slots
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.parkingOpen ?? 0}
                    onChange={(e) => updateField('parkingOpen', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* SECTION 4: PRICING & TERMS */}
          {activeSection === 'pricing' && (
            <Card className="p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">4. Pricing & Lease Terms</h2>
                <p className="text-xs text-muted">Set monthly rent or sale pricing, security deposit, maintenance, and lease conditions.</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {formData.listingType === 'SALE' ? (
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                      Sale Price (₹) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.salePrice ?? ''}
                      onChange={(e) => updateField('salePrice', e.target.value ? Number(e.target.value) : undefined)}
                      placeholder="e.g. 15000000"
                      className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                        Monthly Rent (₹ / month) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.rentAmount ?? ''}
                        onChange={(e) => updateField('rentAmount', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 45000"
                        className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm font-semibold text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                        Security Deposit (₹)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={formData.securityDeposit ?? ''}
                        onChange={(e) => updateField('securityDeposit', e.target.value ? Number(e.target.value) : undefined)}
                        placeholder="e.g. 150000"
                        className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Maintenance Amount (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.maintenanceAmount ?? ''}
                    onChange={(e) => updateField('maintenanceAmount', e.target.value ? Number(e.target.value) : undefined)}
                    placeholder="e.g. 3500"
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Maintenance Schedule
                  </label>
                  <select
                    value={formData.maintenancePeriod}
                    onChange={(e) => updateField('maintenancePeriod', e.target.value)}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  >
                    {MAINTENANCE_PERIODS.map(([val, lbl]) => (
                      <option key={val} value={val}>
                        {lbl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Lock-in Period (Months)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="60"
                    value={formData.lockInMonths ?? ''}
                    onChange={(e) => updateField('lockInMonths', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Notice Period (Days)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="365"
                    value={formData.noticePeriodDays ?? ''}
                    onChange={(e) => updateField('noticePeriodDays', Number(e.target.value))}
                    className="w-full rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div className="sm:col-span-2 pt-2">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.priceNegotiable}
                      onChange={(e) => updateField('priceNegotiable', e.target.checked)}
                      className="h-4 w-4 rounded border-line text-seal focus:ring-seal"
                    />
                    <span className="text-sm text-ink font-medium">Price is negotiable for long-term tenants</span>
                  </label>
                </div>
              </div>
            </Card>
          )}

          {/* SECTION 5: AMENITIES */}
          {activeSection === 'amenities' && (
            <Card className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">5. Amenities & Facilities</h2>
                  <p className="text-xs text-muted">Select all amenities available at the property or society.</p>
                </div>
                <span className="font-mono text-xs text-seal font-semibold">
                  {formData.amenities.length} Selected
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {AMENITIES_CATALOG.map(([code, label]) => {
                  const isChecked = formData.amenities.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleAmenity(code)}
                      className={`flex items-center gap-2.5 rounded-card border p-3 text-left transition-all ${
                        isChecked
                          ? 'border-seal bg-seal-soft text-seal-deep font-semibold shadow-xs'
                          : 'border-line hover:border-slate-300 text-ink/80'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        readOnly
                        className="h-4 w-4 rounded border-line text-seal focus:ring-seal"
                      />
                      <span className="text-xs">{label}</span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* SECTION 6: AVAILABILITY & RULES */}
          {activeSection === 'availability' && (
            <Card className="p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">6. Availability & Tenant Preferences</h2>
                <p className="text-xs text-muted">Move-in timelines, tenant eligibility, and household policies.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Available Move-in Date
                  </label>
                  <input
                    type="date"
                    value={formData.availableFrom}
                    onChange={(e) => updateField('availableFrom', e.target.value)}
                    className="w-full sm:w-64 rounded-input border border-line bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-2">
                    Preferred Tenant Profiles
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {TENANT_OPTIONS.map(([code, label]) => {
                      const isChecked = formData.preferredTenants.includes(code);
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => toggleTenant(code)}
                          className={`flex items-center gap-2 rounded-card border p-2.5 text-left text-xs transition-all ${
                            isChecked
                              ? 'border-seal bg-seal-soft text-seal-deep font-semibold'
                              : 'border-line hover:border-slate-300 text-ink'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            readOnly
                            className="h-3.5 w-3.5 rounded border-line text-seal"
                          />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-line">
                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-card border border-line hover:bg-surface-raised">
                    <input
                      type="checkbox"
                      checked={formData.petsAllowed}
                      onChange={(e) => updateField('petsAllowed', e.target.checked)}
                      className="h-4 w-4 rounded border-line text-seal focus:ring-seal"
                    />
                    <div>
                      <p className="text-sm font-semibold text-ink">Pets Allowed</p>
                      <p className="text-[11px] text-muted">Dogs, cats or household pets are welcome</p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer p-3 rounded-card border border-line hover:bg-surface-raised">
                    <input
                      type="checkbox"
                      checked={formData.nonVegAllowed}
                      onChange={(e) => updateField('nonVegAllowed', e.target.checked)}
                      className="h-4 w-4 rounded border-line text-seal focus:ring-seal"
                    />
                    <div>
                      <p className="text-sm font-semibold text-ink">Non-Vegetarian Cooking Allowed</p>
                      <p className="text-[11px] text-muted">No dietary restrictions on tenancy</p>
                    </div>
                  </label>
                </div>
              </div>
            </Card>
          )}

          {/* SECTION 7: DESCRIPTION & RULES */}
          {activeSection === 'description' && (
            <Card className="p-6 space-y-6">
              <div>
                <h2 className="font-display text-xl font-semibold text-ink">7. Property Description & House Rules</h2>
                <p className="text-xs text-muted">Describe the property highlights, sunlight, ventilation, and community rules.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    Marketing Description * (Minimum 40 characters)
                  </label>
                  <textarea
                    rows={6}
                    value={formData.description}
                    onChange={(e) => updateField('description', e.target.value)}
                    placeholder="Describe the unit layout, natural lighting, modular fittings, view from balcony, transport connectivity, nearby schools, and society amenities..."
                    className="w-full rounded-input border border-line bg-white p-3 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                  <div className="flex justify-between text-[11px] text-muted mt-1">
                    <span>Quality score increases with descriptions longer than 120 characters.</span>
                    <span>{formData.description.length} chars</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1">
                    House Rules & Society Guidelines (Optional)
                  </label>
                  <textarea
                    rows={4}
                    value={formData.houseRules}
                    onChange={(e) => updateField('houseRules', e.target.value)}
                    placeholder="e.g. Society quiet hours after 10 PM. No structural alterations. Visitor parking registration required at security gate."
                    className="w-full rounded-input border border-line bg-white p-3 text-sm text-ink focus:outline-none focus:ring-1 focus:ring-seal"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* SECTION 8: PHOTOGRAPHS */}
          {activeSection === 'photos' && (
            <Card className="p-6 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-ink">8. Property Photographs & Media</h2>
                  <p className="text-xs text-muted">
                    High-resolution photos increase qualified visit bookings. Minimum 4 photos required for publication.
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/gif,.jpg,.jpeg,.jfif,.png,.webp,.heic,.heif,.avif,.gif"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploadingPhotos}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPhotos}
                    size="sm"
                  >
                    {uploadingPhotos ? 'Uploading…' : '+ Add Photos'}
                  </Button>
                </div>
              </div>

              {/* Publication requirement banner */}
              <div className="flex items-center justify-between rounded-card bg-paper p-3 text-xs font-mono">
                <span>
                  Attached: <strong>{images.length} photos</strong>
                </span>
                {images.length >= 4 ? (
                  <span className="text-seal font-semibold">✓ 4-photo requirement met</span>
                ) : (
                  <span className="text-ochre font-semibold">
                    ⚠ Add {4 - images.length} more photo{4 - images.length > 1 ? 's' : ''} to meet publication threshold
                  </span>
                )}
              </div>

              {/* Photos Grid */}
              {images.length > 0 ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
                          alt={img.caption || `Property Photo ${idx + 1}`}
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
                                onClick={() => handleMovePhoto(idx, 'left')}
                                title="Move left"
                                className="rounded px-1.5 py-0.5 text-muted hover:bg-seal-soft hover:text-ink"
                              >
                                ←
                              </button>
                            ) : null}
                            {idx < images.length - 1 ? (
                              <button
                                type="button"
                                onClick={() => handleMovePhoto(idx, 'right')}
                                title="Move right"
                                className="rounded px-1.5 py-0.5 text-muted hover:bg-seal-soft hover:text-ink"
                              >
                                →
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => handleDeletePhoto(img.id)}
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
                <div className="rounded-card border-2 border-dashed border-line bg-paper/40 p-8 text-center">
                  <p className="text-sm font-medium text-ink">No photographs uploaded yet</p>
                  <p className="mt-1 text-xs text-muted">Upload high-res photos to showcase your property.</p>
                  <div className="mt-4">
                    <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploadingPhotos}>
                      + Add Photos
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Bottom Save Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-card border border-line bg-white p-4 shadow-subtle">
            <div>
              <p className="text-xs text-muted">
                Ensure all mandatory fields are filled. Changes are instantly reflected across Odibrick.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                onClick={handleSaveChanges}
                disabled={saving}
                variant="primary"
                size="md"
              >
                {saving ? 'Saving Changes…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
