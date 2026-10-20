/**
 * robots.txt — allow everything; point at the sitemap only once the
 * production domain is confirmed in src/config/site.ts.
 */
import type { APIRoute } from 'astro';
import { absoluteUrl } from '../config/site';

export const prerender = true;

export const GET: APIRoute = () => {
  const sitemap = absoluteUrl('/sitemap.xml');
  const lines = ['User-agent: *', 'Allow: /'];
  if (sitemap) lines.push(`Sitemap: ${sitemap}`);
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};
