import type { MetadataRoute } from 'next';
import { serverApi } from '@/lib/api';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://odibrick.com';

type Listing = { slug: string; updated_at: string };

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: siteUrl, changeFrequency: 'daily', priority: 1 },
    { url: `${siteUrl}/properties`, changeFrequency: 'hourly', priority: 0.9 },
    { url: `${siteUrl}/for-agents`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${siteUrl}/how-it-works`, changeFrequency: 'monthly', priority: 0.6 },
  ];

  try {
    // Only ACTIVE listings are returned by this endpoint, so nothing private leaks.
    const result = await serverApi<{ data: Listing[] }>('/properties/sitemap');
    return [
      ...staticRoutes,
      ...result.data.map((listing) => ({
        url: `${siteUrl}/${listing.slug}`,
        lastModified: new Date(listing.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticRoutes;
  }
}
