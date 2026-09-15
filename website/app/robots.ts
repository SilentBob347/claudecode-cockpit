import type { MetadataRoute } from 'next';

const SITE_URL = 'https://opencockpit.dev';

// Required for `output: 'export'` (Cloudflare Pages static export).
export const dynamic = 'force-static';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Crawlers must reach the confirmation page to read its noindex.
        // Sandbox creation remains behind the Function's bot filter.
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
