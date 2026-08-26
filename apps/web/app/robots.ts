import type { MetadataRoute } from 'next';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://odibrick.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/properties', '/india'],
        // Signed-in surfaces and anything with personal data stays out of the index.
        disallow: ['/dashboard', '/login', '/register', '/api'],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
