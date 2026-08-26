import { ulid } from 'ulid';

export const newPublicId = (): string => ulid();

/** Human-facing reference: ODB-PAY-2026-000123 */
export const formatReference = (prefix: string, sequence: number, year = new Date().getFullYear()): string =>
  `ODB-${prefix}-${year}-${String(sequence).padStart(6, '0')}`;

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);

/** SEO path: /india/hyderabad/gachibowli/2bhk-apartment-01hx... */
export const propertySlug = (input: {
  city: string;
  locality: string;
  bedrooms?: number | null;
  propertyType: string;
  publicId: string;
}): string => {
  const bhk = input.bedrooms ? `${input.bedrooms}bhk-` : '';
  const type = slugify(input.propertyType.replace(/_/g, ' '));
  return [
    'india',
    slugify(input.city),
    slugify(input.locality),
    `${bhk}${type}-${input.publicId.slice(-8).toLowerCase()}`,
  ].join('/');
};
