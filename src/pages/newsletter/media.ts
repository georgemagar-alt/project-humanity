import type { APIRoute } from 'astro';
import { isMediaHost } from '../../lib/beehiiv';

export const prerender = false;

/**
 * Serves images from newsletter issues through our own domain, so a visitor's
 * browser never contacts beehiiv. Only beehiiv's image hosts are allowed.
 */
export const GET: APIRoute = async ({ url }) => {
  let target: URL;
  try {
    target = new URL(url.searchParams.get('u') ?? '');
  } catch {
    return new Response('Bad request', { status: 400 });
  }
  if (target.protocol !== 'https:' || !isMediaHost(target.hostname)) {
    return new Response('Forbidden', { status: 403 });
  }

  const res = await fetch(target.toString());
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) {
    return new Response('Not found', { status: 404 });
  }
  return new Response(res.body, {
    headers: {
      'content-type': type,
      'cache-control': 'public, max-age=604800, immutable',
    },
  });
};
