import assert from 'node:assert/strict';
import {
  buildExploreApiQuery,
  buildPropertiesHref,
  DEFAULT_EXPLORE_FILTERS,
  hasApprovedPropertyVerification,
  resolveListingHref,
  type ExploreFilterState,
} from './explore-query';

export function runExploreQueryTests() {
  // 1. Default RENT query
  const defaultQuery = buildExploreApiQuery(DEFAULT_EXPLORE_FILTERS);
  assert.deepEqual(defaultQuery, {
    listingType: 'RENT',
    sort: 'NEWEST',
    perPage: 6,
  });
  assert.equal(buildPropertiesHref(DEFAULT_EXPLORE_FILTERS), '/properties?listingType=RENT');

  // 2. Switching to SALE (Buy) with filters
  const saleState: ExploreFilterState = {
    listingType: 'SALE',
    propertyType: 'VILLA',
    sort: 'PRICE_ASC',
    verifiedOnly: true,
    ownerOnly: true,
  };
  assert.deepEqual(buildExploreApiQuery(saleState, 6), {
    listingType: 'SALE',
    sort: 'PRICE_ASC',
    perPage: 6,
    propertyType: 'VILLA',
    verifiedOnly: true,
    listedBy: 'OWNER',
  });
  assert.equal(
    buildPropertiesHref(saleState),
    '/properties?listingType=SALE&propertyType=VILLA&sort=PRICE_ASC&verifiedOnly=true&listedBy=OWNER',
  );

  // 3. Clearing filters returns clean RENT state
  const rentFiltered: ExploreFilterState = {
    listingType: 'RENT',
    propertyType: 'APARTMENT',
    sort: 'AREA_DESC',
    verifiedOnly: false,
    ownerOnly: true,
  };
  assert.equal(
    buildPropertiesHref(rentFiltered),
    '/properties?listingType=RENT&propertyType=APARTMENT&sort=AREA_DESC&listedBy=OWNER',
  );

  // 4. Verification badge guard
  assert.equal(hasApprovedPropertyVerification(undefined), false);
  assert.equal(hasApprovedPropertyVerification([]), false);
  assert.equal(hasApprovedPropertyVerification(['PENDING']), false);
  assert.equal(hasApprovedPropertyVerification(['PROTECTED_PLAN']), false);
  assert.equal(hasApprovedPropertyVerification(['OWNERSHIP_DOCUMENT']), true);

  // 5. Role-aware listing navigation
  assert.equal(resolveListingHref(null), '/register?role=OWNER');
  assert.equal(resolveListingHref({ roles: ['TENANT'] }), '/dashboard/profile');
  assert.equal(resolveListingHref({ roles: ['OWNER'] }), '/dashboard/properties/new');
  assert.equal(resolveListingHref({ roles: ['AGENT'] }), '/dashboard/properties/new');
  assert.equal(resolveListingHref({ roles: ['BUILDER'] }), '/dashboard/properties/new');
}

runExploreQueryTests();
console.log('explore-query.spec.ts: all assertions passed');
