import * as assert from 'node:assert/strict';
import {
  buildUpdateProfilePayload,
  computeClientProfileCompletion,
  isValidCalendarDate,
  normalizeLocalities,
  ProfileFormState,
  validateProfileForm,
} from './profile-logic';

const baseState: ProfileFormState = {
  fullName: 'Arjun Verma',
  city: 'Hyderabad',
  preferredLocalities: ['Gachibowli', 'Madhapur'],
  avatarPath: null,
  occupation: 'Software Engineer',
  employer: 'Odibrick Tech',
  about: '',
  budgetMin: '22000',
  budgetMax: '38000',
  preferredBhk: [2, 3],
  preferredMoveIn: '2026-12-01',
  furnishing: 'SEMI_FURNISHED',
  householdType: 'FAMILY',
  occupants: '3',
  hasPets: false,
  propertiesCount: '',
  ownerType: 'INDIVIDUAL',
  agencyName: '',
  reraNumber: '',
  gstin: '',
  cin: '',
  website: '',
  teamSize: '',
};

export function runFrontendProfileLogicTests() {
  // 1. Deduplicates and trims localities case-insensitively
  assert.deepEqual(
    normalizeLocalities([' Gachibowli ', 'gachibowli', 'Madhapur', '']),
    ['Gachibowli', 'Madhapur'],
  );

  // 2. Strict calendar date validation
  assert.equal(isValidCalendarDate('2026-12-01'), true);
  assert.equal(isValidCalendarDate('2028-02-29'), true); // leap year
  assert.equal(isValidCalendarDate('2026-02-29'), false); // non-leap year
  assert.equal(isValidCalendarDate('2026-02-31'), false); // impossible Feb date
  assert.equal(isValidCalendarDate('2026-13-01'), false); // impossible month

  // 3. Tenant completion requires all 6 Step 4 fields with valid calendar date and positive budget
  const completeTenant = computeClientProfileCompletion(['TENANT'], baseState);
  assert.equal(completeTenant.isComplete, true);
  assert.equal(completeTenant.percentage, 100);
  assert.equal(completeTenant.totalRequired, 6);

  const incompleteTenant = computeClientProfileCompletion(['TENANT'], {
    ...baseState,
    preferredBhk: [],
    preferredMoveIn: '2026-02-31',
  });
  assert.equal(incompleteTenant.isComplete, false);
  assert.deepEqual(incompleteTenant.missingFields, [
    'Preferred BHK configurations',
    'Expected move-in date',
  ]);

  // 4. Owner completion requires fullName, city, preferredLocalities, and propertiesCount >= 1
  const incompleteOwner = computeClientProfileCompletion(['OWNER'], {
    ...baseState,
    propertiesCount: '0',
  });
  assert.equal(incompleteOwner.isComplete, false);
  assert.deepEqual(incompleteOwner.missingFields, ['Number of properties']);

  const completeOwner = computeClientProfileCompletion(['OWNER'], {
    ...baseState,
    propertiesCount: '2',
  });
  assert.equal(completeOwner.isComplete, true);
  assert.equal(completeOwner.percentage, 100);
  assert.equal(completeOwner.totalRequired, 4);

  // 5. Agent & Builder completion requires only fullName, city, preferredLocalities
  const completeAgent = computeClientProfileCompletion(['AGENT'], {
    ...baseState,
    agencyName: '',
    reraNumber: '',
  });
  assert.equal(completeAgent.isComplete, true);
  assert.equal(completeAgent.totalRequired, 3);

  // 6. Validation catches invalid dates, zero/negative budgets, budgetMax < budgetMin, and missing fields
  assert.equal(validateProfileForm(['TENANT'], baseState), null);
  assert.match(
    validateProfileForm(['TENANT'], { ...baseState, preferredMoveIn: '2026-02-31' }) ?? '',
    /valid expected move-in calendar date/i,
  );
  assert.match(
    validateProfileForm(['TENANT'], { ...baseState, budgetMin: '0', budgetMax: '25000' }) ?? '',
    /at least 1/i,
  );
  assert.match(
    validateProfileForm(['TENANT'], { ...baseState, budgetMin: '-5000', budgetMax: '25000' }) ?? '',
    /at least 1/i,
  );
  assert.match(
    validateProfileForm(['TENANT'], { ...baseState, budgetMin: '20000', budgetMax: '0' }) ?? '',
    /at least 1/i,
  );
  assert.match(
    validateProfileForm(['TENANT'], { ...baseState, budgetMin: '45000', budgetMax: '25000' }) ?? '',
    /greater than or equal to minimum/i,
  );
  assert.match(
    validateProfileForm(['OWNER'], { ...baseState, propertiesCount: '0' }) ?? '',
    /at least 1/i,
  );

  // 7. Payload builder formats tenant, owner, and cleared optional fields (as null) cleanly
  const clearedOptionalState: ProfileFormState = {
    ...baseState,
    occupation: '',
    employer: '',
    about: '',
    householdType: '',
    occupants: '',
  };
  const tenantPayload = buildUpdateProfilePayload(['TENANT'], clearedOptionalState);
  assert.deepEqual(tenantPayload.preferredLocalities, ['Gachibowli', 'Madhapur']);
  assert.deepEqual(tenantPayload.tenant.preferredBhk, [2, 3]);
  assert.equal(tenantPayload.tenant.budgetMin, 22000);
  assert.equal(tenantPayload.tenant.budgetMax, 38000);
  assert.equal(tenantPayload.occupation, null);
  assert.equal(tenantPayload.employer, null);
  assert.equal(tenantPayload.about, null);
  assert.equal(tenantPayload.tenant.householdType, null);
  assert.equal(tenantPayload.tenant.occupants, null);
  assert.equal(tenantPayload.owner, undefined);
}
