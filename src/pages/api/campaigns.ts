import type { APIRoute } from 'astro';
import { getPublicCampaigns } from '../../lib/db';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const campaigns = await getPublicCampaigns();
    return new Response(JSON.stringify({ campaigns }), {
      headers: {
        'content-type': 'application/json',
        'cache-control': 'public, max-age=5',
      },
    });
  } catch (err) {
    console.error('GET /api/campaigns failed', err);
    // Soft-fail so the client poller keeps its last known values.
    return new Response(JSON.stringify({ campaigns: [], error: 'db_unavailable' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
};
