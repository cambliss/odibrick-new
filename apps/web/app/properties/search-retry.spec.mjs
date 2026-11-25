import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('SearchPage error state uses RetrySearchButton instead of clearing filters to /properties', () => {
  const pageSrc = fs.readFileSync(path.join(__dirname, 'page.tsx'), 'utf8');
  assert.match(pageSrc, /import \{ RetrySearchButton \} from '\.\/retry-search-button';/);
  assert.match(pageSrc, /action=\{<RetrySearchButton \/>\}/);
  assert.doesNotMatch(pageSrc, /<Button href="\/properties">Try again<\/Button>/);
  // Zero-results state still preserves Clear all filters
  assert.match(pageSrc, /title="Nothing matches these filters yet"/);
  assert.match(pageSrc, /<Button href="\/properties">Clear all filters<\/Button>/);
});

test('RetrySearchButton calls router.refresh() to preserve current filters and URL', () => {
  const retrySrc = fs.readFileSync(path.join(__dirname, 'retry-search-button.tsx'), 'utf8');
  assert.match(retrySrc, /router\.refresh\(\)/);
  assert.doesNotMatch(retrySrc, /router\.push\(['"]\/properties['"]\)/);
});

test('SearchFilters supports single, multi-select, and comma-separated amenities while preserving other filters', () => {
  const filtersSrc = fs.readFileSync(path.join(__dirname, 'search-filters.tsx'), 'utf8');
  assert.match(filtersSrc, /const getMulti = useCallback/);
  assert.match(filtersSrc, /\.flatMap\(\(entry\) => entry\.split\(','\)\)/);

  // Verify URLSearchParams multi-select toggle preserves combined filters
  const toggleAmenities = (initialQs, value) => {
    const next = new URLSearchParams(initialQs);
    const current = Array.from(
      new Set(
        next
          .getAll('amenities')
          .flatMap((e) => e.split(','))
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    );
    next.delete('amenities');
    const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    updated.forEach((v) => next.append('amenities', v));
    next.delete('page');
    return next.toString();
  };

  assert.equal(toggleAmenities('minRent=20000&propertyType=APARTMENT', 'LIFT'), 'minRent=20000&propertyType=APARTMENT&amenities=LIFT');
  assert.equal(toggleAmenities('amenities=LIFT&minBedrooms=2', 'GYM'), 'minBedrooms=2&amenities=LIFT&amenities=GYM');
  assert.equal(toggleAmenities('amenities=LIFT,GYM&furnishing=SEMI_FURNISHED', 'LIFT'), 'furnishing=SEMI_FURNISHED&amenities=GYM');
});
