/**
 * sitemap.xml — every indexable page: static routes, shape families and all
 * 145 diamond detail pages.
 *
 * Publishes only once `site.url` is set (src/config/site.ts): sitemaps need
 * absolute URLs, and guessing the domain is not an option.
 */
import type { APIRoute } from 'astro';
import { absoluteUrl, site } from '../config/site';
import { SHAPE_FAMILIES } from '../config/shapes';
import { diamonds } from '../lib/inventory';

export const prerender = true;

const STATIC_PATHS = [
  '/',
  '/diamonds/',
  '/education/',
  '/about/',
  '/contact/',
  '/privacy/',
  '/terms/',
];

const xmlEscape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const GET: APIRoute = () => {
  if (!site.url) {
    return new Response(
      'Sitemap is not published until the production domain is configured in src/config/site.ts\n',
      { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  const counts = new Map<string, number>();
  for (const d of diamonds) counts.set(d.shapeFamily, (counts.get(d.shapeFamily) ?? 0) + 1);

  const paths = [
    ...STATIC_PATHS,
    ...SHAPE_FAMILIES.filter((f) => (counts.get(f.id) ?? 0) > 0).map(
      (f) => `/diamonds/family/${f.id}/`,
    ),
    ...diamonds.map((d) => `/diamonds/${encodeURIComponent(d.id)}/`),
  ];

  const entries = paths
    .map((p) => `  <url>\n    <loc>${xmlEscape(absoluteUrl(p))}</loc>\n  </url>`)
    .join('\n');

  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;

  return new Response(body, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
