'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Badge, Button, Card, CardHeader, ErrorNote, StatusChip } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import {
  BHK_OPTIONS,
  buildUpdateProfilePayload,
  CITY_LOCALITY_SUGGESTIONS,
  computeClientProfileCompletion,
  LAUNCH_CITIES,
  normalizeLocalities,
  ProfileCompletionStatus,
  ProfileFormState,
  validateProfileForm,
} from './profile-logic';

export type ProfileApiPayload = {
  account: {
    id: number;
    public_id: string;
    full_name: string;
    email: string;
    phone: string;
    status: string;
    email_verified_at?: string | null;
    phone_verified_at?: string | null;
  };
  profile?: {
    city?: string | null;
    locality?: string | null;
    preferredLocalities?: string[];
    avatar_path?: string | null;
    occupation?: string | null;
    employer?: string | null;
    about?: string | null;
    preferences?: {
      preferredLocalities?: string[];
      preferredBhk?: number[];
      furnishing?: string | null;
    };
  } | null;
  roles: string[];
  owner?: {
    owner_type?: string | null;
    properties_count?: number | null;
  } | null;
  tenant?: {
    household_type?: string | null;
    occupants?: number | null;
    has_pets?: number | boolean | null;
    budget_min?: number | null;
    budget_max?: number | null;
    preferred_move_in?: string | null;
    preferredBhk?: number[];
    furnishing?: string | null;
  } | null;
  agent?: {
    agency_name?: string | null;
    rera_number?: string | null;
    gstin?: string | null;
    team_size?: number | null;
  } | null;
  builder?: {
    company_name?: string | null;
    rera_number?: string | null;
    gstin?: string | null;
    cin?: string | null;
    website?: string | null;
  } | null;
  kyc?: {
    status?: string | null;
    reviewed_at?: string | null;
    expires_at?: string | null;
  } | null;
  rentalPreferences?: {
    city?: string | null;
    preferredLocalities?: string[];
    budgetMin?: number | null;
    budgetMax?: number | null;
    preferredBhk?: number[];
    preferredMoveIn?: string | null;
    furnishing?: string | null;
  } | null;
  profileCompletion?: ProfileCompletionStatus;
};

function toInitialFormState(initial: ProfileApiPayload): ProfileFormState {
  const localities =
    initial.rentalPreferences?.preferredLocalities ??
    initial.profile?.preferredLocalities ??
    initial.profile?.preferences?.preferredLocalities ??
    (initial.profile?.locality ? [initial.profile.locality] : []);

  const bhkList =
    initial.rentalPreferences?.preferredBhk ??
    initial.tenant?.preferredBhk ??
    initial.profile?.preferences?.preferredBhk ??
    [];

  const budgetMin = initial.rentalPreferences?.budgetMin ?? initial.tenant?.budget_min ?? null;
  const budgetMax = initial.rentalPreferences?.budgetMax ?? initial.tenant?.budget_max ?? null;
  const moveIn =
    initial.rentalPreferences?.preferredMoveIn ?? initial.tenant?.preferred_move_in ?? '';
  const furnishing =
    initial.rentalPreferences?.furnishing ??
    initial.tenant?.furnishing ??
    initial.profile?.preferences?.furnishing ??
    'ANY';

  return {
    fullName: initial.account?.full_name ?? '',
    city: initial.rentalPreferences?.city ?? initial.profile?.city ?? 'Hyderabad',
    preferredLocalities: normalizeLocalities(localities),
    avatarPath: initial.profile?.avatar_path ?? null,
    occupation: initial.profile?.occupation ?? '',
    employer: initial.profile?.employer ?? '',
    about: initial.profile?.about ?? '',
    budgetMin: budgetMin !== null && budgetMin !== undefined ? String(budgetMin) : '',
    budgetMax: budgetMax !== null && budgetMax !== undefined ? String(budgetMax) : '',
    preferredBhk: Array.isArray(bhkList) ? bhkList.map(Number).filter((n) => n >= 1) : [],
    preferredMoveIn: moveIn ? String(moveIn).slice(0, 10) : '',
    furnishing: furnishing || 'ANY',
    householdType: initial.tenant?.household_type ?? '',
    occupants:
      initial.tenant?.occupants !== null && initial.tenant?.occupants !== undefined
        ? String(initial.tenant.occupants)
        : '',
    hasPets: Boolean(initial.tenant?.has_pets),
    propertiesCount:
      initial.owner?.properties_count !== null &&
      initial.owner?.properties_count !== undefined &&
      Number(initial.owner.properties_count) > 0
        ? String(initial.owner.properties_count)
        : '',
    ownerType: initial.owner?.owner_type ?? 'INDIVIDUAL',
    agencyName: initial.agent?.agency_name ?? initial.builder?.company_name ?? '',
    reraNumber: initial.agent?.rera_number ?? initial.builder?.rera_number ?? '',
    gstin: initial.agent?.gstin ?? initial.builder?.gstin ?? '',
    cin: initial.builder?.cin ?? '',
    website: initial.builder?.website ?? '',
    teamSize:
      initial.agent?.team_size !== null && initial.agent?.team_size !== undefined
        ? String(initial.agent.team_size)
        : '',
  };
}

export function ProfileForm({ initialData }: { initialData: ProfileApiPayload }) {
  const router = useRouter();
  const roles = useMemo(() => initialData.roles ?? [], [initialData.roles]);
  const isTenant = roles.includes('TENANT');
  const isOwner = roles.includes('OWNER');
  const isAgent = roles.includes('AGENT');
  const isBuilder = roles.includes('BUILDER');

  const [form, setForm] = useState<ProfileFormState>(() => toInitialFormState(initialData));
  const [customLocalityInput, setCustomLocalityInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const emailVerified = Boolean(initialData.account?.email_verified_at);
  const phoneVerified = Boolean(initialData.account?.phone_verified_at);

  const liveCompletion = useMemo(
    () => computeClientProfileCompletion(roles, form),
    [roles, form],
  );

  const suggestedLocalities = useMemo(() => {
    return CITY_LOCALITY_SUGGESTIONS[form.city] ?? [];
  }, [form.city]);

  const toggleLocality = (locality: string) => {
    const trimmed = locality.trim();
    if (!trimmed) return;
    setForm((prev) => {
      const exists = prev.preferredLocalities.some(
        (loc) => loc.toLowerCase() === trimmed.toLowerCase(),
      );
      const next = exists
        ? prev.preferredLocalities.filter((loc) => loc.toLowerCase() !== trimmed.toLowerCase())
        : [...prev.preferredLocalities, trimmed];
      return { ...prev, preferredLocalities: normalizeLocalities(next) };
    });
  };

  const handleAddCustomLocality = () => {
    const parts = customLocalityInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setForm((prev) => ({
      ...prev,
      preferredLocalities: normalizeLocalities([...prev.preferredLocalities, ...parts]),
    }));
    setCustomLocalityInput('');
  };

  const toggleBhk = (bhkValue: number) => {
    setForm((prev) => {
      const exists = prev.preferredBhk.includes(bhkValue);
      const next = exists
        ? prev.preferredBhk.filter((b) => b !== bhkValue)
        : [...prev.preferredBhk, bhkValue].sort((a, b) => a - b);
      return { ...prev, preferredBhk: next };
    });
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    setError(null);
    setSuccessMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const uploaded = await api<{ storageKey: string }>('/uploads', {
        method: 'POST',
        query: { folder: 'profiles' },
        body: formData,
      });
      setForm((prev) => ({ ...prev, avatarPath: uploaded.storageKey }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not upload profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const validationError = validateProfileForm(roles, form);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = buildUpdateProfilePayload(roles, form);
      const updated = await api<ProfileApiPayload>('/me/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setForm(toInitialFormState(updated));
      setSuccessMessage('Your profile and preferences have been saved.');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save profile changes. Try again.');
    } finally {
      setSaving(false);
    }
  };

  const kycStatus = initialData.kyc?.status ?? 'NOT_STARTED';

  return (
    <div className="space-y-6">
      {/* -------------------------------------- Profile Completion Summary */}
      <Card className={liveCompletion.isComplete ? 'border-seal/35' : 'border-ochre/40'}>
        <CardHeader
          title="Profile completion status"
          note={
            liveCompletion.isComplete
              ? 'All Step 4 profile fields are complete. Our locality captain and matching engine have everything needed.'
              : 'Complete the required fields below so we can match you with properties and assign your locality captain.'
          }
          action={
            <Badge tone={liveCompletion.isComplete ? 'seal' : 'ochre'}>
              {liveCompletion.percentage}% {liveCompletion.isComplete ? 'Complete' : 'Incomplete'}
            </Badge>
          }
        />
        <div className="space-y-4 p-5">
          <div className="h-2 w-full overflow-hidden rounded-pill bg-line/60">
            <div
              className={`h-full transition-all duration-300 ${
                liveCompletion.isComplete ? 'bg-seal' : 'bg-ochre'
              }`}
              style={{ width: `${liveCompletion.percentage}%` }}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {liveCompletion.fields.map((field) => (
              <div
                key={field.key}
                className={`flex items-center gap-2 rounded-card border px-3 py-2 text-[13px] ${
                  field.completed
                    ? 'border-seal/25 bg-seal-soft/40 text-seal-deep'
                    : 'border-ochre/30 bg-ochre-soft/30 text-ink'
                }`}
              >
                <span aria-hidden className="font-mono font-bold">
                  {field.completed ? '✓' : '○'}
                </span>
                <span>{field.label}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {error ? <ErrorNote id="profile-error">{error}</ErrorNote> : null}
      {successMessage ? (
        <div
          role="status"
          className="rounded-card border border-seal bg-seal-soft px-4 py-3 text-[14px] text-seal-deep"
        >
          {successMessage}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* ----------------------------------------- 1. Personal Information */}
        <Card>
          <CardHeader
            title="1. Personal information"
            note="Your verified email address and mobile number are locked to protect your account."
          />
          <div className="space-y-5 p-5">
            <div className="flex flex-wrap items-center gap-4">
              {form.avatarPath ? (
                <img
                  src={`/api/storage/${form.avatarPath}`}
                  alt="Profile avatar"
                  className="h-16 w-16 rounded-full border border-line object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-paper font-display text-xl font-semibold text-seal">
                  {(form.fullName || 'U').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="space-y-1">
                <label className="label" htmlFor="avatarUpload">
                  Profile photo (optional)
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="avatarUpload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={uploadingPhoto}
                    onChange={handleAvatarUpload}
                    className="text-xs text-muted file:mr-3 file:rounded-card file:border-0 file:bg-seal file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
                  />
                  {form.avatarPath ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setForm((prev) => ({ ...prev, avatarPath: null }))}
                    >
                      Remove photo
                    </Button>
                  ) : null}
                </div>
                {uploadingPhoto ? (
                  <p className="text-xs text-muted">Uploading photo…</p>
                ) : (
                  <p className="hint">JPEG, PNG or WebP up to 10 MB.</p>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="fullName">
                  Full name <span className="text-alert">*</span>
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  className="field"
                  value={form.fullName}
                  onChange={(e) => setForm((prev) => ({ ...prev, fullName: e.target.value }))}
                  placeholder="Enter your full name"
                />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="verifiedEmail">
                    Email address
                  </label>
                  <Badge tone={emailVerified ? 'seal' : 'ochre'}>
                    {emailVerified ? 'Verified' : 'Unverified'}
                  </Badge>
                </div>
                <input
                  id="verifiedEmail"
                  type="email"
                  readOnly
                  disabled
                  className="field cursor-not-allowed bg-paper/70 text-muted"
                  value={initialData.account?.email ?? ''}
                />
                <p className="hint">Verified during registration (read-only).</p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <label className="label" htmlFor="verifiedPhone">
                    Mobile number
                  </label>
                  <Badge tone={phoneVerified ? 'seal' : 'ochre'}>
                    {phoneVerified ? 'Verified' : 'Unverified'}
                  </Badge>
                </div>
                <input
                  id="verifiedPhone"
                  type="tel"
                  readOnly
                  disabled
                  className="field cursor-not-allowed bg-paper/70 text-muted"
                  value={initialData.account?.phone ?? ''}
                />
                <p className="hint">Verified via SMS OTP (read-only).</p>
              </div>
            </div>
          </div>
        </Card>

        {/* ----------------------------- 2. City & Preferred Localities */}
        <Card>
          <CardHeader
            title="2. City & preferred localities"
            note="Select your city and one or more localities so we can connect you with the right Locality Captain and properties."
          />
          <div className="space-y-5 p-5">
            <div className="max-w-sm">
              <label className="label" htmlFor="citySelect">
                Preferred city <span className="text-alert">*</span>
              </label>
              <select
                id="citySelect"
                className="field"
                value={LAUNCH_CITIES.includes(form.city as any) ? form.city : 'Hyderabad'}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    city: e.target.value,
                  }))
                }
              >
                {LAUNCH_CITIES.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label">
                Preferred localities in {form.city} (select one or more){' '}
                <span className="text-alert">*</span>
              </label>
              {suggestedLocalities.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {suggestedLocalities.map((locality) => {
                    const selected = form.preferredLocalities.some(
                      (loc) => loc.toLowerCase() === locality.toLowerCase(),
                    );
                    return (
                      <button
                        key={locality}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleLocality(locality)}
                        className={`rounded-pill border px-3 py-1.5 text-[13px] font-medium transition-colors ${
                          selected
                            ? 'border-seal bg-seal text-white'
                            : 'border-line bg-white text-ink hover:border-seal'
                        }`}
                      >
                        {selected ? `✓ ${locality}` : `+ ${locality}`}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2 max-w-lg">
                <input
                  id="customLocality"
                  type="text"
                  className="field flex-1"
                  placeholder="Add another locality (e.g. Tellapur, Financial District)"
                  value={customLocalityInput}
                  onChange={(e) => setCustomLocalityInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomLocality();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={handleAddCustomLocality}>
                  Add locality
                </Button>
              </div>
              <p className="hint">
                Click locality pills above or type a custom locality name and press Add.
              </p>

              {form.preferredLocalities.length > 0 ? (
                <div className="mt-3">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-muted">
                    Selected localities ({form.preferredLocalities.length})
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {form.preferredLocalities.map((locality) => (
                      <span
                        key={locality}
                        className="inline-flex items-center gap-1.5 rounded-pill border border-seal/30 bg-seal-soft px-3 py-1 text-[13px] font-medium text-seal-deep"
                      >
                        {locality}
                        <button
                          type="button"
                          aria-label={`Remove ${locality}`}
                          onClick={() => toggleLocality(locality)}
                          className="ml-1 font-mono text-xs text-seal-deep hover:text-alert"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </Card>

        {/* ----------------------------- 3A. Tenant Rental Preferences */}
        {isTenant ? (
          <Card>
            <CardHeader
              title="3. Rental preferences (Tenant)"
              note="Your budget, BHK configurations, and move-in date power property matching and recommendations."
            />
            <div className="space-y-5 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="budgetMin">
                    Minimum monthly budget (INR) <span className="text-alert">*</span>
                  </label>
                  <input
                    id="budgetMin"
                    type="number"
                    min={1000}
                    step={500}
                    className="field"
                    placeholder="e.g. 20000"
                    value={form.budgetMin}
                    onChange={(e) => setForm((prev) => ({ ...prev, budgetMin: e.target.value }))}
                  />
                </div>

                <div>
                  <label className="label" htmlFor="budgetMax">
                    Maximum monthly budget (INR) <span className="text-alert">*</span>
                  </label>
                  <input
                    id="budgetMax"
                    type="number"
                    min={1000}
                    step={500}
                    className="field"
                    placeholder="e.g. 40000"
                    value={form.budgetMax}
                    onChange={(e) => setForm((prev) => ({ ...prev, budgetMax: e.target.value }))}
                  />
                </div>
              </div>

              <div>
                <label className="label">
                  Preferred BHK configurations (select all that apply){' '}
                  <span className="text-alert">*</span>
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {BHK_OPTIONS.map((option) => {
                    const selected = form.preferredBhk.includes(option.value);
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => toggleBhk(option.value)}
                        className={`rounded-card border px-4 py-2 text-[14px] font-medium transition-colors ${
                          selected
                            ? 'border-seal bg-seal text-white'
                            : 'border-line bg-white text-ink hover:border-seal'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="preferredMoveIn">
                    Expected move-in date <span className="text-alert">*</span>
                  </label>
                  <input
                    id="preferredMoveIn"
                    type="date"
                    className="field"
                    value={form.preferredMoveIn}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, preferredMoveIn: e.target.value }))
                    }
                  />
                </div>

                <div>
                  <label className="label" htmlFor="furnishingSelect">
                    Furnishing preference (optional)
                  </label>
                  <select
                    id="furnishingSelect"
                    className="field"
                    value={form.furnishing}
                    onChange={(e) => setForm((prev) => ({ ...prev, furnishing: e.target.value }))}
                  >
                    <option value="ANY">Any furnishing</option>
                    <option value="FULLY_FURNISHED">Fully furnished</option>
                    <option value="SEMI_FURNISHED">Semi-furnished</option>
                    <option value="UNFURNISHED">Unfurnished</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                <div>
                  <label className="label" htmlFor="householdType">
                    Household type (optional)
                  </label>
                  <select
                    id="householdType"
                    className="field"
                    value={form.householdType}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, householdType: e.target.value }))
                    }
                  >
                    <option value="">Select household type</option>
                    <option value="FAMILY">Family</option>
                    <option value="COUPLE">Couple</option>
                    <option value="BACHELOR">Single / Working professionals</option>
                    <option value="COMPANY_LEASE">Company lease</option>
                    <option value="STUDENT">Student</option>
                  </select>
                </div>

                <div>
                  <label className="label" htmlFor="occupants">
                    Occupants (optional)
                  </label>
                  <input
                    id="occupants"
                    type="number"
                    min={1}
                    max={20}
                    className="field"
                    placeholder="e.g. 2"
                    value={form.occupants}
                    onChange={(e) => setForm((prev) => ({ ...prev, occupants: e.target.value }))}
                  />
                </div>

                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-[14px]">
                    <input
                      type="checkbox"
                      checked={form.hasPets}
                      onChange={(e) => setForm((prev) => ({ ...prev, hasPets: e.target.checked }))}
                      className="h-4 w-4 rounded border-line text-seal focus:ring-seal"
                    />
                    <span>Moving with pets</span>
                  </label>
                </div>
              </div>
            </div>
          </Card>
        ) : null}

        {/* ----------------------------- 3B. Owner Portfolio Details */}
        {isOwner ? (
          <Card>
            <CardHeader
              title="3. Property portfolio (Owner)"
              note="Let our city team know how many properties you own so we can assign your Locality Captain."
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="propertiesCount">
                  Number of properties <span className="text-alert">*</span>
                </label>
                <input
                  id="propertiesCount"
                  type="number"
                  min={1}
                  max={10000}
                  step={1}
                  className="field"
                  placeholder="e.g. 2"
                  value={form.propertiesCount}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, propertiesCount: e.target.value }))
                  }
                />
                <p className="hint">Total residential or commercial properties you plan to manage.</p>
              </div>

              <div>
                <label className="label" htmlFor="ownerType">
                  Ownership entity (optional)
                </label>
                <select
                  id="ownerType"
                  className="field"
                  value={form.ownerType}
                  onChange={(e) => setForm((prev) => ({ ...prev, ownerType: e.target.value }))}
                >
                  <option value="INDIVIDUAL">Individual owner</option>
                  <option value="HUF">HUF</option>
                  <option value="COMPANY">Company / LLP</option>
                  <option value="TRUST">Trust</option>
                </select>
              </div>
            </div>
          </Card>
        ) : null}

        {/* ----------------------------- 3C. Agent / Builder Optional Details */}
        {isAgent || isBuilder ? (
          <Card>
            <CardHeader
              title={`3. ${isBuilder ? 'Company' : 'Agency'} details (Optional)`}
              note="Optional business details displayed on your public lister profile."
            />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="agencyName">
                  {isBuilder ? 'Company name' : 'Agency name'} (optional)
                </label>
                <input
                  id="agencyName"
                  type="text"
                  className="field"
                  value={form.agencyName}
                  onChange={(e) => setForm((prev) => ({ ...prev, agencyName: e.target.value }))}
                />
              </div>

              <div>
                <label className="label" htmlFor="reraNumber">
                  RERA registration number (optional)
                </label>
                <input
                  id="reraNumber"
                  type="text"
                  className="field"
                  value={form.reraNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, reraNumber: e.target.value }))}
                />
              </div>

              <div>
                <label className="label" htmlFor="gstin">
                  GSTIN (optional)
                </label>
                <input
                  id="gstin"
                  type="text"
                  className="field"
                  value={form.gstin}
                  onChange={(e) => setForm((prev) => ({ ...prev, gstin: e.target.value }))}
                />
              </div>

              {isAgent ? (
                <div>
                  <label className="label" htmlFor="teamSize">
                    Team size (optional)
                  </label>
                  <input
                    id="teamSize"
                    type="number"
                    min={1}
                    className="field"
                    value={form.teamSize}
                    onChange={(e) => setForm((prev) => ({ ...prev, teamSize: e.target.value }))}
                  />
                </div>
              ) : (
                <div>
                  <label className="label" htmlFor="website">
                    Website (optional)
                  </label>
                  <input
                    id="website"
                    type="url"
                    className="field"
                    value={form.website}
                    onChange={(e) => setForm((prev) => ({ ...prev, website: e.target.value }))}
                  />
                </div>
              )}
            </div>
          </Card>
        ) : null}

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={saving || uploadingPhoto}>
            {saving ? 'Saving profile…' : 'Save profile'}
          </Button>
          <Link href="/properties" className="text-[14px] text-muted hover:text-ink">
            Browse properties →
          </Link>
        </div>
      </form>

      {/* ------------------------- Separate Step 5 Identity & KYC Notice */}
      <Card>
        <CardHeader
          title="Identity & KYC verification (Separate step)"
          note="KYC document submission and review are managed separately from your profile preferences. You can browse properties while KYC is pending or in review."
          action={<StatusChip status={kycStatus} />}
        />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="text-[14px] text-muted">
            {kycStatus === 'VERIFIED'
              ? 'Your identity is verified. You can list properties and submit rental applications.'
              : kycStatus === 'SUBMITTED' || kycStatus === 'IN_REVIEW'
                ? 'Your KYC documents are under review by our verification team. You can continue browsing homes.'
                : 'When you are ready to apply for a home or publish a property listing, complete Step 5 Identity Verification.'}
          </p>
          <Button href="/dashboard/kyc" variant="secondary" size="sm">
            {kycStatus === 'VERIFIED' ? 'View KYC status' : 'Go to Identity & KYC →'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
