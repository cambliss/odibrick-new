import Link from 'next/link';
import { inr, shortDate, titleCase } from '@/lib/format';
import { Badge } from './ui';
import { VerificationSeals } from './verification-seal';

export type PropertyCardData = {
  id: number;
  slug: string;
  title: string;
  listingType: string;
  propertyType: string;
  bedrooms?: number | null;
  bathrooms?: number | null;
  areaSqft?: number | null;
  furnishing?: string;
  rent?: number | null;
  price?: number | null;
  deposit?: number | null;
  locality: string;
  city: string;
  availableFrom?: string | null;
  isProtected?: boolean;
  isFeatured?: boolean;
  listedByRole?: string;
  coverKey?: string | null;
  verifiedChecks?: string[];
};

export function PropertyCard({ property }: { property: PropertyCardData }) {
  const price = property.listingType === 'SALE' ? property.price : property.rent;

  return (
    <article className="group overflow-hidden rounded-card border border-line bg-white shadow-card transition-shadow hover:shadow-lift">
      <Link href={`/${property.slug}`} className="block">
        <div className="relative aspect-[4/3] overflow-hidden bg-seal-soft">
          {/* Photographs are served from private storage; the placeholder keeps
              the card honest when a listing has no usable image yet. */}
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-seal/50">
              {titleCase(property.propertyType)}
            </span>
          </div>
          {property.isFeatured ? (
            <span className="absolute left-3 top-3 rounded-pill bg-ochre px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white">
              Promoted
            </span>
          ) : null}
          {property.isProtected ? (
            <span className="absolute right-3 top-3 rounded-pill bg-seal px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-white">
              Protected
            </span>
          ) : null}
        </div>

        <div className="p-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-display text-xl font-semibold tabular">
              {inr(price, true)}
              {property.listingType === 'RENT' ? (
                <span className="ml-1 font-sans text-[13px] font-normal text-muted">/month</span>
              ) : null}
            </p>
            <Badge>{titleCase(property.listedByRole)}</Badge>
          </div>

          <h3 className="mt-1.5 line-clamp-1 text-[15px] font-medium">{property.title}</h3>
          <p className="mt-0.5 text-sm text-muted">
            {property.locality}, {property.city}
          </p>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[11px] uppercase tracking-wider text-muted">
            {property.bedrooms ? <span>{property.bedrooms} bhk</span> : null}
            {property.bathrooms ? <span>{property.bathrooms} bath</span> : null}
            {property.areaSqft ? <span>{property.areaSqft} sqft</span> : null}
            {property.furnishing ? <span>{titleCase(property.furnishing)}</span> : null}
          </div>

          <div className="mt-3 border-t border-line pt-3">
            <VerificationSeals checks={property.verifiedChecks ?? []} compact />
            {property.listingType === 'RENT' && property.deposit ? (
              <p className="mt-2 text-[13px] text-muted">
                Deposit {inr(property.deposit, true)}
                {property.availableFrom ? ` · available ${shortDate(property.availableFrom)}` : ''}
              </p>
            ) : null}
          </div>
        </div>
      </Link>
    </article>
  );
}
