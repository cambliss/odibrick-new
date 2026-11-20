export type ExploreListingType = 'RENT' | 'SALE';
export type ExploreSort = 'NEWEST' | 'PRICE_ASC' | 'PRICE_DESC' | 'AREA_DESC';

export type ExploreFilterState = {
  listingType: ExploreListingType;
  propertyType: string;
  sort: ExploreSort;
  verifiedOnly: boolean;
  ownerOnly: boolean;
};

export const DEFAULT_EXPLORE_FILTERS: ExploreFilterState = {
  listingType: 'RENT',
  propertyType: '',
  sort: 'NEWEST',
  verifiedOnly: false,
  ownerOnly: false,
};

export const EXPLORE_PROPERTY_TYPES = [
  { value: '', label: 'All types' },
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'INDEPENDENT_HOUSE', label: 'Independent house' },
  { value: 'VILLA', label: 'Villa' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'PENTHOUSE', label: 'Penthouse' },
  { value: 'PLOT', label: 'Plot' },
  { value: 'OFFICE', label: 'Office' },
] as const;

export const EXPLORE_SORT_OPTIONS: Array<{ value: ExploreSort; label: string }> = [
  { value: 'NEWEST', label: 'Recommended' },
  { value: 'PRICE_ASC', label: 'Price: low to high' },
  { value: 'PRICE_DESC', label: 'Price: high to low' },
  { value: 'AREA_DESC', label: 'Largest first' },
];

/**
 * Maps Explore UI state to the exact query parameters accepted by GET /api/properties
 * (`PropertySearchDto`).
 */
export function buildExploreApiQuery(
  state: ExploreFilterState,
  perPage = 6,
): Record<string, string | number | boolean> {
  const query: Record<string, string | number | boolean> = {
    listingType: state.listingType,
    sort: state.sort,
    perPage,
  };
  if (state.propertyType) query.propertyType = state.propertyType;
  if (state.verifiedOnly) query.verifiedOnly = true;
  if (state.ownerOnly) query.listedBy = 'OWNER';
  return query;
}

/**
 * Builds the /properties destination URL preserving active Explore filters.
 */
export function buildPropertiesHref(state: ExploreFilterState): string {
  const params = new URLSearchParams({ listingType: state.listingType });
  if (state.propertyType) params.set('propertyType', state.propertyType);
  if (state.sort && state.sort !== 'NEWEST') params.set('sort', state.sort);
  if (state.verifiedOnly) params.set('verifiedOnly', 'true');
  if (state.ownerOnly) params.set('listedBy', 'OWNER');
  return `/properties?${params.toString()}`;
}

const APPROVED_VERIFICATION_CHECKS = new Set([
  'KYC',
  'OWNER_IDENTITY',
  'OWNERSHIP_DOCUMENT',
  'ADDRESS',
  'PHOTO_AUTHENTICITY',
  'PHYSICAL_VISIT',
]);

/**
 * Returns true only when at least one approved property/identity verification
 * check is present. Prevents showing a generic Verified badge for empty,
 * unknown, or plan-only tags.
 */
export function hasApprovedPropertyVerification(checks?: string[] | null): boolean {
  if (!checks?.length) return false;
  return checks.some((check) => APPROVED_VERIFICATION_CHECKS.has(check));
}

const PROPERTY_CREATOR_ROLES = new Set(['OWNER', 'AGENT', 'BUILDER', 'ADMIN', 'SUPER_ADMIN']);

/**
 * Resolves the safe destination for "List my property" based on authentication
 * and role permissions without bypassing role-based restrictions.
 */
export function resolveListingHref(
  user?: { roles?: string[] } | null,
): string {
  if (!user) return '/register?role=OWNER';
  const canCreate = user.roles?.some((r) => PROPERTY_CREATOR_ROLES.has(r.toUpperCase()));
  return canCreate ? '/dashboard/properties/new' : '/dashboard/profile';
}
