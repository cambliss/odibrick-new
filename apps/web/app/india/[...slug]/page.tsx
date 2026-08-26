import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { VerificationSeals, Seal } from '@/components/verification-seal';
import { RecordSpine, JourneyBar } from '@/components/record-spine';
import { Badge, Card, DataRow } from '@/components/ui';
import { PropertyActions } from './property-actions';
import { serverApi, serverApiOrNull, ApiError } from '@/lib/api';
import { inr, shortDate, titleCase } from '@/lib/format';

export const dynamic = 'force-dynamic';

type PropertyDetail = {
  id: number;
  publicId: string;
  slug: string;
  title: string;
  status: string;
  listingType: string;
  propertyType: string;
  bedrooms?: number;
  bathrooms?: number;
  balconies?: number;
  floorNumber?: number;
  totalFloors?: number;
  carpetAreaSqft?: number;
  builtupAreaSqft?: number;
  furnishing: string;
  facing?: string;
  ageYears?: number;
  parkingCovered: number;
  parkingOpen: number;
  rentAmount?: number;
  salePrice?: number;
  securityDeposit?: number;
  maintenanceAmount?: number;
  maintenancePeriod?: string;
  lockInMonths?: number;
  noticePeriodDays?: number;
  locality: string;
  city: string;
  state: string;
  pincode: string;
  availableFrom?: string;
  preferredTenants: string[];
  petsAllowed: boolean;
  description?: string;
  houseRules?: string;
  isProtected: boolean;
  listedByRole: string;
  listerName?: string;
  agencyName?: string;
  projectName?: string;
  publishedAt?: string;
  images: Array<{ id: number; storage_key: string; caption?: string; room_tag?: string }>;
  amenities: Array<{ code: string; name: string; category: string }>;
  verifications: Array<{ check_type: string; status: string; verified_at?: string }>;
  timeline: Array<{ event_code: string; title: string; detail?: string; occurred_at: string }>;
};

async function load(slug: string[]): Promise<PropertyDetail | null> {
  try {
    return await serverApi<PropertyDetail>(`/properties/${encodeURIComponent(['india', ...slug].join('/'))}`);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function generateMetadata({ params }: { params: { slug: string[] } }): Promise<Metadata> {
  const property = await load(params.slug);
  if (!property) return { title: 'Listing not found' };

  const price = property.listingType === 'SALE' ? inr(property.salePrice, true) : `${inr(property.rentAmount, true)}/month`;
  return {
    title: `${property.title} — ${price}`,
    description:
      property.description?.slice(0, 155) ??
      `${property.bedrooms} BHK ${titleCase(property.propertyType)} in ${property.locality}, ${property.city}.`,
    alternates: { canonical: `/${property.slug}` },
    openGraph: {
      title: `${property.title} — ${price}`,
      description: `${property.locality}, ${property.city}`,
      type: 'website',
    },
  };
}

export default async function PropertyPage({ params }: { params: { slug: string[] } }) {
  const property = await load(params.slug);
  if (!property) notFound();

  const me = await serverApiOrNull<{ id: number; roles: string[] }>('/auth/me');
  const verified = property.verifications.filter((v) => v.status === 'VERIFIED').map((v) => v.check_type);
  const price = property.listingType === 'SALE' ? property.salePrice : property.rentAmount;

  // Structured data so the listing is legible to search engines.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Residence',
    name: property.title,
    address: {
      '@type': 'PostalAddress',
      addressLocality: property.locality,
      addressRegion: property.state,
      postalCode: property.pincode,
      addressCountry: 'IN',
    },
    numberOfRooms: property.bedrooms,
    floorSize: property.builtupAreaSqft
      ? { '@type': 'QuantitativeValue', value: property.builtupAreaSqft, unitCode: 'FTK' }
      : undefined,
  };

  return (
    <>
      <SiteHeader />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <main className="mx-auto max-w-[1180px] px-5 py-8">
        <nav aria-label="Breadcrumb" className="font-mono text-[11px] uppercase tracking-wider text-muted">
          <Link href="/properties" className="hover:text-ink">
            Homes
          </Link>
          <span aria-hidden> / </span>
          <Link href={`/properties?city=${property.city}`} className="hover:text-ink">
            {property.city}
          </Link>
          <span aria-hidden> / </span>
          <span>{property.locality}</span>
        </nav>

        {/* gallery */}
        <div className="mt-4 grid gap-2 overflow-hidden rounded-card sm:grid-cols-[2fr_1fr]">
          <div className="flex aspect-[16/10] items-center justify-center bg-seal-soft">
            <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-seal/50">
              {property.images.length
                ? `${property.images.length} photographs`
                : 'No photographs uploaded'}
            </span>
          </div>
          <div className="hidden grid-rows-2 gap-2 sm:grid">
            {[0, 1].map((index) => (
              <div key={index} className="flex items-center justify-center bg-seal-soft/70">
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-seal/40">
                  {property.images[index + 1]?.room_tag
                    ? titleCase(property.images[index + 1].room_tag!)
                    : 'Photo'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{titleCase(property.listingType)}</Badge>
              <Badge>{titleCase(property.propertyType)}</Badge>
              {property.isProtected ? <Badge tone="ochre">Odibrick Protected</Badge> : null}
              {property.status !== 'ACTIVE' ? <Badge tone="alert">{titleCase(property.status)}</Badge> : null}
            </div>

            <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">{property.title}</h1>
            <p className="mt-1 text-muted">
              {property.locality}, {property.city} {property.pincode}
            </p>

            <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-2">
              <p className="font-display text-4xl font-semibold tabular">
                {inr(price)}
                {property.listingType === 'RENT' ? (
                  <span className="ml-1 font-sans text-base font-normal text-muted">per month</span>
                ) : null}
              </p>
              {property.securityDeposit ? (
                <p className="text-[15px] text-muted">
                  Deposit <span className="tabular font-medium text-ink">{inr(property.securityDeposit)}</span>
                </p>
              ) : null}
              {property.maintenanceAmount ? (
                <p className="text-[15px] text-muted">
                  Maintenance{' '}
                  <span className="tabular font-medium text-ink">{inr(property.maintenanceAmount)}</span>
                  <span className="text-[13px]"> / {property.maintenancePeriod?.toLowerCase()}</span>
                </p>
              ) : null}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
              {[
                ['Bedrooms', property.bedrooms ?? '—'],
                ['Bathrooms', property.bathrooms ?? '—'],
                ['Built-up', property.builtupAreaSqft ? `${property.builtupAreaSqft} sqft` : '—'],
                ['Furnishing', titleCase(property.furnishing)],
              ].map(([label, value]) => (
                <div key={String(label)} className="bg-white px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted">{label}</p>
                  <p className="mt-0.5 font-medium tabular">{value}</p>
                </div>
              ))}
            </div>

            {/* verification */}
            <section className="mt-10">
              <h2 className="font-display text-xl font-semibold">What has been verified</h2>
              <div className="mt-3">
                <VerificationSeals checks={verified} />
              </div>
              {verified.length < 4 ? (
                <p className="mt-3 text-[13px] text-muted">
                  Checks not listed above have not been completed. A missing badge is not a red flag on its own —
                  it means we have not confirmed that item ourselves.
                </p>
              ) : null}
            </section>

            {property.description ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-semibold">About this home</h2>
                <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-muted">
                  {property.description}
                </p>
              </section>
            ) : null}

            {property.amenities.length ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-semibold">Amenities</h2>
                <ul className="mt-4 grid grid-cols-2 gap-2 text-[15px] sm:grid-cols-3">
                  {property.amenities.map((amenity) => (
                    <li key={amenity.code} className="flex items-center gap-2">
                      <span aria-hidden className="text-seal">
                        ✓
                      </span>
                      {amenity.name}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-semibold">Details</h2>
              <dl className="mt-3">
                <DataRow label="Carpet area" value={property.carpetAreaSqft ? `${property.carpetAreaSqft} sqft` : '—'} />
                <DataRow
                  label="Floor"
                  value={property.floorNumber ? `${property.floorNumber} of ${property.totalFloors ?? '—'}` : '—'}
                />
                <DataRow label="Age" value={property.ageYears !== undefined ? `${property.ageYears} years` : '—'} />
                <DataRow label="Facing" value={property.facing ?? '—'} />
                <DataRow
                  label="Parking"
                  value={`${property.parkingCovered} covered · ${property.parkingOpen} open`}
                />
                <DataRow label="Available from" value={shortDate(property.availableFrom)} />
                <DataRow
                  label="Preferred tenants"
                  value={property.preferredTenants.map((t) => titleCase(t)).join(', ') || 'Any'}
                />
                <DataRow label="Pets" value={property.petsAllowed ? 'Allowed' : 'Not allowed'} />
                <DataRow label="Lock-in" value={property.lockInMonths ? `${property.lockInMonths} months` : '—'} />
                <DataRow
                  label="Notice period"
                  value={property.noticePeriodDays ? `${property.noticePeriodDays} days` : '—'}
                />
              </dl>
            </section>

            {property.houseRules ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-semibold">House rules</h2>
                <p className="mt-3 whitespace-pre-line text-[15px] text-muted">{property.houseRules}</p>
              </section>
            ) : null}

            <section className="mt-10">
              <h2 className="font-display text-xl font-semibold">How renting this home works</h2>
              <p className="mt-2 text-[15px] text-muted">
                Six steps, and you can see where you are at every point.
              </p>
              <div className="mt-4">
                <JourneyBar />
              </div>
              <ol className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ['Apply', 'Send your details and preferred move-in date. The owner reviews and responds.'],
                  ['Verify', 'Both sides complete identity checks before anything is drafted.'],
                  ['Legal review', 'Our legal team drafts the agreement and walks both parties through it on a video call.'],
                  ['Agreement', 'Each party signs after a qualified professional has approved the final version.'],
                  ['Payment', 'Deposit and first month are raised on the ledger with a reference and a receipt.'],
                  ['Check-in', 'You photograph the property room by room. Both parties acknowledge the record.'],
                ].map(([title, body], index) => (
                  <li key={title} className="rounded-card border border-line bg-white p-4">
                    <p className="font-mono text-[11px] uppercase tracking-wider text-seal">Step {index + 1}</p>
                    <p className="mt-1 font-medium">{title}</p>
                    <p className="mt-1 text-[14px] text-muted">{body}</p>
                  </li>
                ))}
              </ol>
            </section>

            {property.timeline.length ? (
              <section className="mt-10">
                <h2 className="font-display text-xl font-semibold">Property record</h2>
                <p className="mt-1 text-[15px] text-muted">Everything Odibrick has recorded about this property.</p>
                <div className="mt-5">
                  <RecordSpine events={property.timeline} dense />
                </div>
              </section>
            ) : null}
          </div>

          {/* -------------------------------------------------------------- rail */}
          <aside className="lg:sticky lg:top-6">
            <Card className="p-5">
              <p className="eyebrow">Listed by</p>
              <p className="mt-1.5 font-display text-lg font-semibold">
                {property.agencyName ?? property.listerName ?? 'Odibrick user'}
              </p>
              <p className="text-[13px] text-muted">
                {titleCase(property.listedByRole)}
                {property.projectName ? ` · ${property.projectName}` : ''}
                {property.publishedAt ? ` · listed ${shortDate(property.publishedAt)}` : ''}
              </p>

              <div className="mt-5">
                <PropertyActions
                  propertyId={property.id}
                  slug={property.slug}
                  signedIn={!!me}
                  isOwnListing={me?.id !== undefined && property.listedByRole !== undefined && false}
                  listingActive={property.status === 'ACTIVE'}
                />
              </div>

              <p className="mt-4 text-[13px] leading-relaxed text-muted">
                Enquiries and visits run through Odibrick so there is a record of who asked for what, and when.
              </p>
            </Card>

            {property.isProtected ? (
              <Card className="mt-4 p-5 text-center">
                <div className="flex justify-center">
                  <Seal label="Protected" sub="Annual plan" />
                </div>
                <p className="mt-4 text-left text-[13px] leading-relaxed text-muted">
                  This tenancy runs on the Protected plan: payment records, condition reports, legal support and
                  eligible partner insurance products. Insurance, where taken, is issued by a licensed insurer —
                  not by Odibrick.
                </p>
              </Card>
            ) : null}

            <Card className="mt-4 p-5">
              <p className="eyebrow">Move-in cost</p>
              <dl className="mt-2">
                <DataRow label="First month" value={inr(property.rentAmount)} />
                <DataRow label="Deposit" value={inr(property.securityDeposit)} />
                <DataRow
                  label="Total to move in"
                  value={inr((property.rentAmount ?? 0) + (property.securityDeposit ?? 0))}
                />
              </dl>
              <p className="mt-3 text-[13px] text-muted">
                Odibrick service fees are billed separately and shown before you commit to anything.
              </p>
            </Card>
          </aside>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
