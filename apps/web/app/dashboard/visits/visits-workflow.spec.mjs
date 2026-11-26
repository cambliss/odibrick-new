import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const actionsPath = path.resolve(__dirname, '../../india/[...slug]/property-actions.tsx');
const visitsClientPath = path.join(__dirname, 'visits-client.tsx');
const visitsPagePath = path.join(__dirname, 'page.tsx');

test('PropertyActions adds Schedule a visit posting to /customer/visits without altering enquiry or application flows', () => {
  const src = fs.readFileSync(actionsPath, 'utf8');

  assert.match(src, /Schedule a visit/);
  assert.match(src, /!isOwnListing/);
  assert.match(src, /api\('\/customer\/visits'/);
  assert.match(src, /scheduledStart:\s*parsed\.toISOString\(\)/);
  assert.match(src, /IN_PERSON/);
  assert.match(src, /VIDEO_TOUR/);
  assert.match(src, /setDoneHref\('\/dashboard\/visits'\)/);
  assert.match(src, /if \(busy\) return;/);

  // Existing enquiry and application endpoints preserved
  assert.match(src, /\/enquiries/);
  assert.match(src, /\/applications/);
});

test('VisitsPage passes authenticated user roles to VisitsClient', () => {
  const src = fs.readFileSync(visitsPagePath, 'utf8');
  assert.match(src, /serverApiOrNull<Me>\('\/auth\/me'\)/);
  assert.match(src, /<VisitsClient userRoles=\{roles\} \/>/);
});

test('VisitsClient uses api() client, removes /marketplace/my-visits, and enforces role-specific routing and actions', () => {
  const src = fs.readFileSync(visitsClientPath, 'utf8');

  // Uses shared api() client, never raw fetch('/api/...') or nonexistent /marketplace/my-visits
  assert.match(src, /import \{ api, ApiError \} from '@\/lib\/api';/);
  assert.doesNotMatch(src, /fetch\(['"]\/api\//);
  assert.doesNotMatch(src, /\/marketplace\/my-visits/);

  // Role-specific endpoints
  assert.match(src, /const endpoint = isProviderView \? '\/provider\/visits' : '\/customer\/visits';/);
  assert.match(src, /const basePath = isProviderView \? `\/provider\/visits\/\$\{selectedVisit\.id\}` : `\/customer\/visits\/\$\{selectedVisit\.id\}`;/);

  // Multi-role support
  assert.match(src, /const isMultiRole = hasProviderRole && hasTenantRole;/);

  // Distinct loadError vs empty state
  assert.match(src, /loadError \? \(/);
  assert.match(src, /Could not load property visits/);

  // Provider-only actions gated behind isProviderView
  assert.match(src, /isProviderView && modalType === 'COMPLETE'/);
  assert.match(src, /isProviderView && modalType === 'NO_SHOW'/);
  assert.match(src, /isProviderView && modalType === 'CONVERT'/);

  // Tenant can only confirm PROPOSED visits
  assert.match(src, /isProposed && \([\s\S]*?Confirm Proposed Time/);
});
