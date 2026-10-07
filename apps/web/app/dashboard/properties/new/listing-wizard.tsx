'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, ErrorNote } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { inr } from '@/lib/format';

/**
 * The listing wizard.
 *
 * Ten steps, each of which saves to the same draft. Nothing is published until
 * the owner explicitly submits for verification, and the API re-checks
 * completeness there rather than trusting this form.
 */
const STEPS = [
  'Purpose',
  'Property type',
  'Location',
  'Configuration',
  'Area & floor',
  'Pricing',
  'Amenities',
  'Availability',
  'Description',
  'Photographs',
] as const;

const PROPERTY_TYPES = [
  ['APARTMENT', 'Apartment'],
  ['INDEPENDENT_HOUSE', 'Independent house'],
  ['VILLA', 'Villa'],
  ['STUDIO', 'Studio'],
  ['PENTHOUSE', 'Penthouse'],
  ['PLOT', 'Plot'],
  ['COMMERCIAL', 'Commercial'],
];

const AMENITIES = [
  ['LIFT', 'Lift'], ['POWER_BACKUP', 'Power backup'], ['SECURITY', '24x7 security'],
  ['GATED', 'Gated community'], ['CCTV', 'CCTV'], ['PARKING_COVERED', 'Covered parking'],
  ['GYM', 'Gym'], ['POOL', 'Swimming pool'], ['PARK', 'Park'], ['CLUBHOUSE', 'Clubhouse'],
  ['PIPED_GAS', 'Piped gas'], ['WATER_24X7', '24x7 water'], ['AC', 'Air conditioning'],
  ['MODULAR_KITCHEN', 'Modular kitchen'], ['WARDROBE', 'Wardrobes'], ['GEYSER', 'Geyser'],
  ['INTERCOM', 'Intercom'], ['VISITOR_PARKING', 'Visitor parking'],
];

const TENANT_TYPES = [
  ['FAMILY', 'Families'], ['BACHELOR_MALE', 'Bachelors (male)'],
  ['BACHELOR_FEMALE', 'Bachelors (female)'], ['COMPANY', 'Company lease'], ['ANY', 'Anyone'],
];

type Draft = Record<string, any>;

export function ListingWizard({ initial, propertyId }: { initial?: Draft; propertyId?: number }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [id, setId] = useState<number | undefined>(propertyId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>({
    listingType: 'RENT',
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 2,
    balconies: 1,
    furnishing: 'SEMI_FURNISHED',
    parkingCovered: 1,
    parkingOpen: 0,
    petsAllowed: false,
    preferredTenants: ['FAMILY'],
    amenities: [] as string[],
    noticePeriodDays: 30,
    lockInMonths: 6,
    ...initial,
  });

  const set = (key: string, value: unknown) => setDraft((d) => ({ ...d, [key]: value }));

  const toggleAmenity = (code: string) =>
    setDraft((d) => ({
      ...d,
      amenities: d.amenities.includes(code)
        ? d.amenities.filter((a: string) => a !== code)
        : [...d.amenities, code],
    }));

  const toggleTenant = (code: string) =>
    setDraft((d) => ({
      ...d,
      preferredTenants: d.preferredTenants.includes(code)
        ? d.preferredTenants.filter((a: string) => a !== code)
        : [...d.preferredTenants, code],
    }));

  const save = async (advance = true): Promise<number | null> => {
    setBusy(true);
    setError(null);
    try {
      const payload = { ...draft };
      const result = id
        ? await api<{ id: number }>(`/properties/${id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await api<{ id: number }>('/properties', { method: 'POST', body: JSON.stringify(payload) });
      setId(result.id);
      setSaved(`Draft saved at ${new Date().toLocaleTimeString('en-IN')}`);
      if (advance && step < STEPS.length - 1) setStep(step + 1);
      return result.id;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the draft. Try again.');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!id) {
      setError('Save the draft first.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api(`/properties/${id}/submit`, { method: 'POST' });
      router.push('/dashboard/properties?status=PENDING_VERIFICATION');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit for verification.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[200px_1fr]">
      {/* step rail — reuses the spine language from the rest of the product */}
      <nav aria-label="Listing steps" className="lg:sticky lg:top-6 lg:self-start">
        <ol className="spine hidden lg:block">
          {STEPS.map((label, index) => (
            <li
              key={label}
              data-state={index < step ? 'done' : index === step ? 'current' : 'pending'}
              className="spine-node pb-3 last:pb-0"
            >
              <button
                type="button"
                onClick={() => setStep(index)}
                className={`text-left text-[14px] ${index === step ? 'font-medium text-ink' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            </li>
          ))}
        </ol>
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted lg:hidden">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
      </nav>

      <Card className="p-6">
        <p className="eyebrow">
          Step {step + 1} of {STEPS.length}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold">{STEPS[step]}</h2>

        <div className="mt-6 space-y-5">
          {step === 0 ? (
            <fieldset>
              <legend className="label">What are you listing this for?</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  ['RENT', 'To rent out'],
                  ['SALE', 'To sell'],
                  ['PG', 'PG / co-living'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('listingType', value)}
                    aria-pressed={draft.listingType === value}
                    className={`rounded-card border px-4 py-3 text-left ${
                      draft.listingType === value ? 'border-seal bg-seal-soft font-medium' : 'border-line'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="hint">
                Renting runs the full Odibrick process: verification, legal review, agreement, payments and
                condition reports.
              </p>
            </fieldset>
          ) : null}

          {step === 1 ? (
            <fieldset>
              <legend className="label">Property type</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {PROPERTY_TYPES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => set('propertyType', value)}
                    aria-pressed={draft.propertyType === value}
                    className={`rounded-card border px-4 py-3 text-left ${
                      draft.propertyType === value ? 'border-seal bg-seal-soft font-medium' : 'border-line'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          {step === 2 ? (
            <>
              <div>
                <label className="label" htmlFor="address1">
                  Address line 1
                </label>
                <input
                  id="address1"
                  className="field"
                  value={draft.addressLine1 ?? ''}
                  onChange={(e) => set('addressLine1', e.target.value)}
                  placeholder="Flat 402, Sunrise Residency"
                />
                <p className="hint">
                  The exact address is shown only to you, our verification team and a tenant you have
                  accepted. Search results show the locality.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="locality">
                    Locality
                  </label>
                  <input
                    id="locality"
                    className="field"
                    value={draft.locality ?? ''}
                    onChange={(e) => set('locality', e.target.value)}
                    placeholder="Gachibowli"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="city">
                    City
                  </label>
                  <input
                    id="city"
                    className="field"
                    value={draft.city ?? ''}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder="Hyderabad"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="state">
                    State
                  </label>
                  <input
                    id="state"
                    className="field"
                    value={draft.state ?? ''}
                    onChange={(e) => set('state', e.target.value)}
                    placeholder="Telangana"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="pincode">
                    PIN code
                  </label>
                  <input
                    id="pincode"
                    className="field"
                    inputMode="numeric"
                    maxLength={6}
                    value={draft.pincode ?? ''}
                    onChange={(e) => set('pincode', e.target.value)}
                    placeholder="500032"
                  />
                </div>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="grid gap-4 sm:grid-cols-3">
                {[
                  ['bedrooms', 'Bedrooms'],
                  ['bathrooms', 'Bathrooms'],
                  ['balconies', 'Balconies'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <label className="label" htmlFor={key}>
                      {label}
                    </label>
                    <input
                      id={key}
                      type="number"
                      min={0}
                      className="field"
                      value={draft[key] ?? ''}
                      onChange={(e) => set(key, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
              <fieldset>
                <legend className="label">Furnishing</legend>
                <div className="flex flex-wrap gap-2">
                  {[
                    ['UNFURNISHED', 'Unfurnished'],
                    ['SEMI_FURNISHED', 'Semi-furnished'],
                    ['FULLY_FURNISHED', 'Fully furnished'],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => set('furnishing', value)}
                      aria-pressed={draft.furnishing === value}
                      className={`rounded-card border px-4 py-2.5 ${
                        draft.furnishing === value ? 'border-seal bg-seal-soft font-medium' : 'border-line'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="parkingCovered">
                    Covered parking
                  </label>
                  <input
                    id="parkingCovered"
                    type="number"
                    min={0}
                    className="field"
                    value={draft.parkingCovered ?? 0}
                    onChange={(e) => set('parkingCovered', Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="parkingOpen">
                    Open parking
                  </label>
                  <input
                    id="parkingOpen"
                    type="number"
                    min={0}
                    className="field"
                    value={draft.parkingOpen ?? 0}
                    onChange={(e) => set('parkingOpen', Number(e.target.value))}
                  />
                </div>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="carpet">
                  Carpet area (sqft)
                </label>
                <input
                  id="carpet"
                  type="number"
                  className="field"
                  value={draft.carpetAreaSqft ?? ''}
                  onChange={(e) => set('carpetAreaSqft', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="builtup">
                  Built-up area (sqft)
                </label>
                <input
                  id="builtup"
                  type="number"
                  className="field"
                  value={draft.builtupAreaSqft ?? ''}
                  onChange={(e) => set('builtupAreaSqft', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="floor">
                  Floor number
                </label>
                <input
                  id="floor"
                  type="number"
                  className="field"
                  value={draft.floorNumber ?? ''}
                  onChange={(e) => set('floorNumber', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="totalFloors">
                  Total floors
                </label>
                <input
                  id="totalFloors"
                  type="number"
                  className="field"
                  value={draft.totalFloors ?? ''}
                  onChange={(e) => set('totalFloors', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="age">
                  Age of property (years)
                </label>
                <input
                  id="age"
                  type="number"
                  min={0}
                  className="field"
                  value={draft.ageYears ?? ''}
                  onChange={(e) => set('ageYears', Number(e.target.value))}
                />
              </div>
              <div>
                <label className="label" htmlFor="facing">
                  Facing
                </label>
                <select
                  id="facing"
                  className="field"
                  value={draft.facing ?? ''}
                  onChange={(e) => set('facing', e.target.value)}
                >
                  <option value="">Not specified</option>
                  {['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW'].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <>
              {draft.listingType === 'SALE' ? (
                <div>
                  <label className="label" htmlFor="salePrice">
                    Asking price
                  </label>
                  <input
                    id="salePrice"
                    type="number"
                    className="field"
                    value={draft.salePrice ?? ''}
                    onChange={(e) => set('salePrice', Number(e.target.value))}
                  />
                  <p className="hint">{inr(draft.salePrice)}</p>
                </div>
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="rent">
                        Monthly rent
                      </label>
                      <input
                        id="rent"
                        type="number"
                        className="field"
                        value={draft.rentAmount ?? ''}
                        onChange={(e) => set('rentAmount', Number(e.target.value))}
                      />
                      <p className="hint">{inr(draft.rentAmount)}</p>
                    </div>
                    <div>
                      <label className="label" htmlFor="deposit">
                        Security deposit
                      </label>
                      <input
                        id="deposit"
                        type="number"
                        className="field"
                        value={draft.securityDeposit ?? ''}
                        onChange={(e) => set('securityDeposit', Number(e.target.value))}
                      />
                      <p className="hint">{inr(draft.securityDeposit)}</p>
                    </div>
                    <div>
                      <label className="label" htmlFor="maintenance">
                        Maintenance
                      </label>
                      <input
                        id="maintenance"
                        type="number"
                        className="field"
                        value={draft.maintenanceAmount ?? ''}
                        onChange={(e) => set('maintenanceAmount', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="maintenancePeriod">
                        Maintenance billed
                      </label>
                      <select
                        id="maintenancePeriod"
                        className="field"
                        value={draft.maintenancePeriod ?? 'MONTHLY'}
                        onChange={(e) => set('maintenancePeriod', e.target.value)}
                      >
                        <option value="MONTHLY">Monthly</option>
                        <option value="QUARTERLY">Quarterly</option>
                        <option value="YEARLY">Yearly</option>
                        <option value="INCLUDED">Included in rent</option>
                      </select>
                    </div>
                    <div>
                      <label className="label" htmlFor="lockIn">
                        Lock-in (months)
                      </label>
                      <input
                        id="lockIn"
                        type="number"
                        min={0}
                        className="field"
                        value={draft.lockInMonths ?? ''}
                        onChange={(e) => set('lockInMonths', Number(e.target.value))}
                      />
                    </div>
                    <div>
                      <label className="label" htmlFor="notice">
                        Notice period (days)
                      </label>
                      <input
                        id="notice"
                        type="number"
                        min={0}
                        className="field"
                        value={draft.noticePeriodDays ?? ''}
                        onChange={(e) => set('noticePeriodDays', Number(e.target.value))}
                      />
                    </div>
                  </div>
                  <p className="rounded-card border border-line bg-paper px-4 py-3 text-[13px] text-muted">
                    Lock-in and notice go into the agreement, and the legal team will walk both parties
                    through them before anyone signs. Anything you set here is a starting position, not a
                    binding term.
                  </p>
                </>
              )}
            </>
          ) : null}

          {step === 6 ? (
            <fieldset>
              <legend className="label">Amenities</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {AMENITIES.map(([code, label]) => (
                  <label key={code} className="flex cursor-pointer items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      checked={draft.amenities.includes(code)}
                      onChange={() => toggleAmenity(code)}
                      className="accent-seal"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}

          {step === 7 ? (
            <>
              <div>
                <label className="label" htmlFor="availableFrom">
                  Available from
                </label>
                <input
                  id="availableFrom"
                  type="date"
                  className="field"
                  value={draft.availableFrom ?? ''}
                  onChange={(e) => set('availableFrom', e.target.value)}
                />
              </div>
              <fieldset>
                <legend className="label">Preferred tenants</legend>
                <div className="flex flex-wrap gap-2">
                  {TENANT_TYPES.map(([code, label]) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleTenant(code)}
                      aria-pressed={draft.preferredTenants.includes(code)}
                      className={`rounded-pill border px-3 py-1.5 text-[13px] ${
                        draft.preferredTenants.includes(code)
                          ? 'border-seal bg-seal-soft font-medium'
                          : 'border-line text-muted'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  Preferences help match the right applicants. Note that refusing tenants on grounds such as
                  religion or caste is unlawful, and listings that do so are removed.
                </p>
              </fieldset>
              <label className="flex cursor-pointer items-center gap-2 text-[14px]">
                <input
                  type="checkbox"
                  checked={!!draft.petsAllowed}
                  onChange={(e) => set('petsAllowed', e.target.checked)}
                  className="accent-seal"
                />
                Pets allowed
              </label>
            </>
          ) : null}

          {step === 8 ? (
            <>
              <div>
                <label className="label" htmlFor="title">
                  Listing title
                </label>
                <input
                  id="title"
                  className="field"
                  maxLength={190}
                  value={draft.title ?? ''}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="2 BHK apartment in Gachibowli with covered parking"
                />
              </div>
              <div>
                <label className="label" htmlFor="description">
                  Description
                </label>
                <textarea
                  id="description"
                  rows={7}
                  className="field"
                  value={draft.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="What is the flat actually like? Light, ventilation, water supply, what is nearby, what the society is like."
                />
                <p className="hint">
                  {(draft.description ?? '').length} characters. At least 80 are needed to publish — vague
                  listings get far fewer serious enquiries.
                </p>
              </div>
              <div>
                <label className="label" htmlFor="houseRules">
                  House rules <span className="font-normal text-muted">(optional)</span>
                </label>
                <textarea
                  id="houseRules"
                  rows={3}
                  className="field"
                  value={draft.houseRules ?? ''}
                  onChange={(e) => set('houseRules', e.target.value)}
                />
              </div>
            </>
          ) : null}

          {step === 9 ? (
            <>
              <p className="rounded-card border border-line bg-paper px-4 py-3 text-[14px]">
                Photographs are uploaded to your private document vault and attached to this listing. You
                need at least four to publish. Our team checks them against the ownership documents.
              </p>
              <PhotoUploader
                propertyId={id}
                onEnsureDraftId={async () => {
                  const savedId = await save(false);
                  return savedId;
                }}
              />
            </>
          ) : null}
        </div>

        {error ? <div className="mt-5">{<ErrorNote>{error}</ErrorNote>}</div> : null}
        {saved && !error ? <p className="mt-5 text-[13px] text-seal">{saved}</p> : null}

        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-5">
          {step > 0 ? (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}

          {step < STEPS.length - 1 ? (
            <Button onClick={() => save(true)} disabled={busy}>
              {busy ? 'Saving…' : 'Save and continue'}
            </Button>
          ) : (
            <Button onClick={submit} disabled={busy || !id}>
              {busy ? 'Submitting…' : 'Submit for verification'}
            </Button>
          )}

          <Button variant="ghost" onClick={() => save(false)} disabled={busy}>
            Save draft
          </Button>
        </div>
      </Card>
    </div>
  );
}

type PropertyImageItem = {
  id?: number;
  storageKey: string;
  isCover: boolean;
  sortOrder: number;
  fileName?: string;
  fileSize?: number;
  previewUrl?: string;
  status: 'uploading' | 'uploaded' | 'error';
  errorMessage?: string;
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

/** Uploads go to the private vault; the storage key is what gets attached. */
function PhotoUploader({
  propertyId,
  onEnsureDraftId,
}: {
  propertyId?: number;
  onEnsureDraftId: () => Promise<number | null>;
}) {
  const [images, setImages] = useState<PropertyImageItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load existing images if property already exists
  useEffect(() => {
    if (!propertyId) return;
    let cancelled = false;
    api<Array<{ id: number; storage_key: string; is_cover: number; sort_order: number; caption?: string }>>(
      `/properties/${propertyId}/images`,
    )
      .then((data) => {
        if (cancelled) return;
        setImages(
          data.map((item) => ({
            id: item.id,
            storageKey: item.storage_key,
            isCover: item.is_cover === 1,
            sortOrder: item.sort_order,
            previewUrl: `/api/storage/${item.storage_key}`,
            fileName: item.storage_key.split('/').pop()?.replace(/^\d+_[a-f0-9]+_/, ''),
            status: 'uploaded',
          })),
        );
      })
      .catch(() => {
        // Silently ignore initial fetch errors
      });
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(event.target.files ?? []);
    if (!rawFiles.length) return;

    setError(null);
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
      let targetId = propertyId;
      if (!targetId) {
        const ensured = await onEnsureDraftId();
        if (!ensured) {
          setError('Could not auto-save draft. Please save the draft first.');
          setBusy(false);
          return;
        }
        targetId = ensured;
      }

      for (const file of validFiles) {
        const localPreview = URL.createObjectURL(file);
        const tempKey = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        
        // Add optimistic item
        setImages((curr) => [
          ...curr,
          {
            storageKey: tempKey,
            isCover: curr.length === 0,
            sortOrder: curr.length,
            fileName: file.name,
            fileSize: file.size,
            previewUrl: localPreview,
            status: 'uploading',
          },
        ]);

        try {
          const form = new FormData();
          form.append('file', file);
          form.append('folder', 'properties');
          const result = await api<{ storageKey: string }>('/uploads', { method: 'POST', body: form });

          const attached = await api<{ id: number; storageKey: string; isCover: boolean; sortOrder: number }>(
            `/properties/${targetId}/images`,
            {
              method: 'POST',
              body: JSON.stringify({ storageKey: result.storageKey }),
            },
          );

          setImages((curr) =>
            curr.map((img) =>
              img.storageKey === tempKey
                ? {
                    ...img,
                    id: attached.id,
                    storageKey: attached.storageKey,
                    isCover: attached.isCover,
                    sortOrder: attached.sortOrder,
                    status: 'uploaded',
                    previewUrl: `/api/storage/${attached.storageKey}`,
                  }
                : img,
            ),
          );
        } catch (uploadErr) {
          const msg = uploadErr instanceof ApiError ? uploadErr.message : `Failed to upload ${file.name}.`;
          setImages((curr) =>
            curr.map((img) => (img.storageKey === tempKey ? { ...img, status: 'error', errorMessage: msg } : img)),
          );
        }
      }
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSetCover = async (image: PropertyImageItem) => {
    if (!propertyId || !image.id) return;
    try {
      await api(`/properties/${propertyId}/images/${image.id}/cover`, { method: 'POST' });
      setImages((curr) =>
        curr.map((img) => ({
          ...img,
          isCover: img.id === image.id,
        })),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not set cover photo.');
    }
  };

  const handleDelete = async (image: PropertyImageItem) => {
    if (!propertyId || !image.id) {
      setImages((curr) => curr.filter((img) => img !== image));
      return;
    }
    try {
      await api(`/properties/${propertyId}/images/${image.id}`, { method: 'DELETE' });
      setImages((curr) => {
        const remaining = curr.filter((img) => img.id !== image.id);
        if (image.isCover && remaining.length > 0) {
          remaining[0].isCover = true;
        }
        return remaining;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove photograph.');
    }
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= images.length) return;

    const nextImages = [...images];
    const [moved] = nextImages.splice(index, 1);
    nextImages.splice(targetIndex, 0, moved);
    setImages(nextImages);

    if (propertyId) {
      const validIds = nextImages.map((img) => img.id).filter((id): id is number => typeof id === 'number');
      if (validIds.length === nextImages.length) {
        try {
          await api(`/properties/${propertyId}/images/reorder`, {
            method: 'POST',
            body: JSON.stringify({ imageIds: validIds }),
          });
        } catch {
          // Reorder sync fail silent
        }
      }
    }
  };

  const uploadedCount = images.filter((img) => img.status === 'uploaded').length;
  const satisfiesRequirement = uploadedCount >= 4;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <label className="label mb-0" htmlFor="photos">
            Add photographs
          </label>
          <p className="hint mt-0.5">JPG, JPEG, JFIF, PNG, WebP, HEIC, HEIF or AVIF, up to 10 MB each.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-muted">
            Photos: <strong>{uploadedCount}</strong> / Min required: 4
          </span>
          {satisfiesRequirement ? (
            <Badge tone="seal">Requirement Satisfied ✓</Badge>
          ) : (
            <Badge tone="ochre">Need {4 - uploadedCount} more</Badge>
          )}
        </div>
      </div>

      <div className="rounded-card border-2 border-dashed border-line bg-paper/60 p-5 text-center transition-colors hover:border-seal/40">
        <input
          ref={fileInputRef}
          id="photos"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/avif,image/gif,.jpg,.jpeg,.jfif,.png,.webp,.heic,.heif,.avif,.gif"
          multiple
          onChange={handleFileChange}
          disabled={busy}
          className="hidden"
        />
        <div className="flex flex-col items-center justify-center gap-2">
          <p className="text-[14px] font-medium text-ink">Drag and drop photos here, or click below</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
          >
            {busy ? 'Uploading photographs…' : 'Choose files'}
          </Button>
          <p className="text-[12px] text-muted">Select one or multiple images at once (up to 10 MB each)</p>
        </div>
      </div>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {images.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {images.map((img, idx) => (
            <div
              key={img.storageKey || idx}
              className={`group relative overflow-hidden rounded-card border bg-white shadow-sm transition-all ${
                img.isCover ? 'border-seal ring-2 ring-seal/20' : 'border-line'
              }`}
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-seal-soft">
                {img.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={img.previewUrl}
                    alt={img.fileName || `Photo ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-[11px] text-muted">
                    No preview
                  </div>
                )}

                {img.isCover ? (
                  <span className="absolute left-2 top-2 rounded-pill bg-seal px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-white shadow">
                    Cover
                  </span>
                ) : null}

                {img.status === 'uploading' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-ink/50 text-[12px] font-medium text-white">
                    Uploading…
                  </div>
                ) : null}

                {img.status === 'error' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-alert/80 p-2 text-center text-[11px] text-white">
                    {img.errorMessage || 'Upload failed'}
                  </div>
                ) : null}
              </div>

              <div className="p-2.5">
                <p className="truncate text-[12px] font-medium text-ink" title={img.fileName}>
                  {img.fileName || `Photo ${idx + 1}`}
                </p>
                {img.fileSize ? (
                  <p className="text-[11px] text-muted">{(img.fileSize / (1024 * 1024)).toFixed(1)} MB</p>
                ) : null}

                <div className="mt-2 flex items-center justify-between gap-1 border-t border-line/60 pt-2">
                  {!img.isCover && img.status === 'uploaded' ? (
                    <button
                      type="button"
                      onClick={() => handleSetCover(img)}
                      className="text-[11px] font-medium text-seal hover:underline"
                    >
                      Set cover
                    </button>
                  ) : (
                    <span className="text-[11px] text-muted">{img.isCover ? 'Primary' : ''}</span>
                  )}

                  <div className="flex items-center gap-1">
                    {idx > 0 ? (
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 'up')}
                        title="Move left"
                        className="rounded px-1 text-[11px] text-muted hover:bg-seal-soft hover:text-ink"
                      >
                        ←
                      </button>
                    ) : null}
                    {idx < images.length - 1 ? (
                      <button
                        type="button"
                        onClick={() => handleMove(idx, 'down')}
                        title="Move right"
                        className="rounded px-1 text-[11px] text-muted hover:bg-seal-soft hover:text-ink"
                      >
                        →
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => handleDelete(img)}
                      title="Remove photograph"
                      className="rounded px-1 text-[11px] text-alert hover:bg-alert/10"
                    >
                      ×
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

