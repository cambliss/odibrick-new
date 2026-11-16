export const LAUNCH_CITIES = ['Hyderabad', 'Bengaluru', 'Pune'] as const;

export const CITY_LOCALITY_SUGGESTIONS: Record<string, string[]> = {
  Hyderabad: [
    'Gachibowli',
    'Madhapur',
    'Kondapur',
    'Hitech City',
    'Jubilee Hills',
    'Banjara Hills',
    'Manikonda',
    'Kukatpally',
    'Kokapet',
    'Financial District',
  ],
  Bengaluru: [
    'Whitefield',
    'Indiranagar',
    'Koramangala',
    'HSR Layout',
    'Bellandur',
    'Sarjapur Road',
    'Marathahalli',
    'JP Nagar',
    'Hebbal',
    'Electronic City',
  ],
  Pune: [
    'Baner',
    'Wakad',
    'Kharadi',
    'Hinjewadi',
    'Koregaon Park',
    'Viman Nagar',
    'Kalyani Nagar',
    'Aundh',
    'Magarpatta',
    'Balewadi',
  ],
};

export const BHK_OPTIONS = [
  { value: 1, label: '1 BHK' },
  { value: 2, label: '2 BHK' },
  { value: 3, label: '3 BHK' },
  { value: 4, label: '4 BHK' },
  { value: 5, label: '5+ BHK' },
] as const;

export interface ProfileCompletionField {
  key: string;
  label: string;
  completed: boolean;
}

export interface ProfileCompletionStatus {
  isComplete: boolean;
  percentage: number;
  completedCount: number;
  totalRequired: number;
  missingFields: string[];
  fields: ProfileCompletionField[];
}

export interface ProfileFormState {
  fullName: string;
  city: string;
  preferredLocalities: string[];
  avatarPath: string | null;
  occupation: string;
  employer: string;
  about: string;
  // Tenant Step 4 & optional fields
  budgetMin: string;
  budgetMax: string;
  preferredBhk: number[];
  preferredMoveIn: string;
  furnishing: string;
  householdType: string;
  occupants: string;
  hasPets: boolean;
  // Owner Step 4 & optional fields
  propertiesCount: string;
  ownerType: string;
  // Agent / Builder optional fields
  agencyName: string;
  reraNumber: string;
  gstin: string;
  cin: string;
  website: string;
  teamSize: string;
}

export function isValidCalendarDate(value: string): boolean {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1900 || year > 2100) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function normalizeLocalities(localities: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of localities) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  }
  return result;
}

export function computeClientProfileCompletion(
  roles: string[],
  state: ProfileFormState,
): ProfileCompletionStatus {
  const cleanLocalities = normalizeLocalities(state.preferredLocalities);
  const fields: ProfileCompletionField[] = [
    {
      key: 'fullName',
      label: 'Full name',
      completed: state.fullName.trim().length >= 2,
    },
    {
      key: 'city',
      label: 'City',
      completed: state.city.trim().length > 0,
    },
    {
      key: 'preferredLocalities',
      label: 'Preferred localities',
      completed: cleanLocalities.length > 0,
    },
  ];

  if (roles.includes('TENANT')) {
    const min = state.budgetMin.trim() !== '' ? Number(state.budgetMin) : NaN;
    const max = state.budgetMax.trim() !== '' ? Number(state.budgetMax) : NaN;
    const hasValidBudget = Number.isFinite(min) && Number.isFinite(max) && min >= 1 && max >= min;

    fields.push(
      {
        key: 'budget',
        label: 'Minimum and maximum rental budget',
        completed: hasValidBudget,
      },
      {
        key: 'preferredBhk',
        label: 'Preferred BHK configurations',
        completed: state.preferredBhk.length > 0,
      },
      {
        key: 'preferredMoveIn',
        label: 'Expected move-in date',
        completed: isValidCalendarDate(state.preferredMoveIn),
      },
    );
  }

  if (roles.includes('OWNER')) {
    const count = state.propertiesCount.trim() !== '' ? Number(state.propertiesCount) : NaN;
    fields.push({
      key: 'propertiesCount',
      label: 'Number of properties',
      completed: Number.isInteger(count) && count >= 1,
    });
  }

  const totalRequired = fields.length;
  const completedCount = fields.filter((f) => f.completed).length;
  const percentage = totalRequired > 0 ? Math.round((completedCount / totalRequired) * 100) : 100;
  const missingFields = fields.filter((f) => !f.completed).map((f) => f.label);

  return {
    isComplete: missingFields.length === 0,
    percentage,
    completedCount,
    totalRequired,
    missingFields,
    fields,
  };
}

export function validateProfileForm(roles: string[], state: ProfileFormState): string | null {
  const fullName = state.fullName.trim();
  if (fullName.length < 2) {
    return 'Please enter your full name (at least 2 characters).';
  }
  if (!state.city.trim()) {
    return 'Please select or enter your preferred city.';
  }
  const localities = normalizeLocalities(state.preferredLocalities);
  if (localities.length === 0) {
    return 'Please select or add at least one preferred locality.';
  }
  if (localities.some((loc) => loc.length > 120)) {
    return 'Each locality name must be 120 characters or fewer.';
  }
  if (localities.join(', ').length > 190) {
    return 'Combined preferred localities cannot exceed 190 characters. Please remove one or more localities.';
  }

  if (roles.includes('TENANT')) {
    const min = state.budgetMin.trim() !== '' ? Number(state.budgetMin) : NaN;
    const max = state.budgetMax.trim() !== '' ? Number(state.budgetMax) : NaN;
    if (!Number.isFinite(min) || min < 1) {
      return 'Please enter a valid minimum monthly rental budget of at least 1.';
    }
    if (!Number.isFinite(max) || max < 1) {
      return 'Please enter a valid maximum monthly rental budget of at least 1.';
    }
    if (max < min) {
      return 'Maximum rental budget must be greater than or equal to minimum rental budget.';
    }
    if (state.preferredBhk.length === 0) {
      return 'Please select at least one preferred BHK configuration.';
    }
    if (!isValidCalendarDate(state.preferredMoveIn)) {
      return 'Please enter a valid expected move-in calendar date (YYYY-MM-DD).';
    }
  }

  if (roles.includes('OWNER')) {
    const count = state.propertiesCount.trim() !== '' ? Number(state.propertiesCount) : NaN;
    if (!Number.isInteger(count) || count < 1) {
      return 'Please enter the number of properties you own (at least 1).';
    }
  }

  return null;
}

export function buildUpdateProfilePayload(roles: string[], state: ProfileFormState) {
  const preferredLocalities = normalizeLocalities(state.preferredLocalities);
  const payload: Record<string, any> = {
    fullName: state.fullName.trim(),
    city: state.city.trim(),
    locality: preferredLocalities[0] ?? null,
    preferredLocalities,
    avatarPath: state.avatarPath,
    occupation: state.occupation.trim() || null,
    employer: state.employer.trim() || null,
    about: state.about.trim() || null,
  };

  if (roles.includes('TENANT')) {
    payload.tenant = {
      budgetMin: state.budgetMin.trim() !== '' ? Number(state.budgetMin) : null,
      budgetMax: state.budgetMax.trim() !== '' ? Number(state.budgetMax) : null,
      preferredBhk: [...state.preferredBhk].sort((a, b) => a - b),
      preferredMoveIn: state.preferredMoveIn.trim() || null,
      furnishing: state.furnishing || 'ANY',
      householdType: state.householdType.trim() || null,
      occupants: state.occupants.trim() !== '' ? Number(state.occupants) : null,
      hasPets: state.hasPets,
    };
  }

  if (roles.includes('OWNER')) {
    payload.owner = {
      propertiesCount: state.propertiesCount.trim() !== '' ? Number(state.propertiesCount) : 0,
      ownerType: state.ownerType || 'INDIVIDUAL',
    };
  }

  if (roles.includes('AGENT') || roles.includes('BUILDER')) {
    payload.agency = {
      name: state.agencyName.trim() || null,
      reraNumber: state.reraNumber.trim() || null,
      gstin: state.gstin.trim() || null,
      cin: state.cin.trim() || null,
      website: state.website.trim() || null,
      teamSize: state.teamSize.trim() !== '' ? Number(state.teamSize) : null,
    };
  }

  return payload;
}
