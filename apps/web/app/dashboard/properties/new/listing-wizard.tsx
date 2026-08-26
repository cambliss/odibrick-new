'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Card, ErrorNote } from '@/components/ui';
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

  const save = async (advance = true) => {
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the draft. Try again.');
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
              <PhotoUploader propertyId={id} />
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

/** Uploads go to the private vault; the storage key is what gets attached. */
function PhotoUploader({ propertyId }: { propertyId?: number }) {
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handle = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    if (!propertyId) {
      setError('Save the draft first, then add photographs.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        form.append('folder', 'properties');
        const result = await api<{ storageKey: string }>('/uploads', { method: 'POST', body: form });
        await api(`/properties/${propertyId}/images`, {
          method: 'POST',
          body: JSON.stringify({ storageKey: result.storageKey, isCover: uploaded.length === 0 }),
        });
        setUploaded((current) => [...current, file.name]);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed. Check the file type and size.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label className="label" htmlFor="photos">
        Add photographs
      </label>
      <input
        id="photos"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={handle}
        disabled={busy || !propertyId}
        className="field file:mr-3 file:rounded-card file:border-0 file:bg-seal file:px-3 file:py-1.5 file:text-white"
      />
      <p className="hint">JPEG, PNG or WebP, up to 10 MB each.</p>

      {uploaded.length ? (
        <ul className="mt-4 space-y-1 text-[14px]">
          {uploaded.map((name) => (
            <li key={name} className="flex items-center gap-2 text-muted">
              <span aria-hidden className="text-seal">
                ✓
              </span>
              {name}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <div className="mt-3">{<ErrorNote>{error}</ErrorNote>}</div> : null}
    </div>
  );
}
