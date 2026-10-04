import type { APIRoute } from 'astro';
import { listIssues } from '../lib/beehiiv';

export const prerender = false;

/** Newsletter issues come live from beehiiv, so they get their own sitemap. */
export const GET: APIRoute = async ({ site, url }) => {
  const origin = site ?? new URL(url.origin);
  const issues = await listIssues();
  const entries = [
    `<url><loc>${new URL('/newsletter', origin)}</loc></url>`,
    ...issues.map(
      (i) =>
        `<url><loc>${new URL(`/newsletter/${encodeURIComponent(i.slug)}`, origin)}</loc>` +
        `<lastmod>${i.date.toISOString()}</lastmod></url>`,
    ),
  ];
  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    entries.join('') +
    '</urlset>';
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
};
