import type { APIRoute } from 'astro';
import { optionalEnv } from '../../lib/env';
import { fail, json } from '../../lib/http';

export const prerender = false;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Not a secret: identifies the beehiiv publication. Can be overridden via env.
const DEFAULT_PUBLICATION_ID = 'pub_c442fdb5-36fd-438e-aed4-dd54cb7f2431';

/**
 * Newsletter sign-up. The visitor's browser only ever talks to our own server;
 * we forward the address to beehiiv with the secret API key. beehiiv then sends
 * the double-opt-in confirmation email.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body) return fail('invalid_json');

  // Honeypot: bots fill hidden fields. Pretend everything is fine.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true });
  }

  const email = String(body.email ?? '').trim().slice(0, 200);
  const locale: 'de' | 'en' = body.locale === 'en' ? 'en' : 'de';
  if (!EMAIL_RE.test(email)) return fail('invalid_email', 422);
  if (body.consent !== true && body.consent !== 'on') return fail('consent_required', 422);

  const apiKey = optionalEnv('BEEHIIV_API_KEY');
  if (!apiKey) {
    console.error('newsletter: BEEHIIV_API_KEY is not set');
    return fail('not_configured', 503);
  }
  const publicationId = optionalEnv('BEEHIIV_PUBLICATION_ID', DEFAULT_PUBLICATION_ID);

  try {
    const res = await fetch(
      `https://api.beehiiv.com/v2/publications/${encodeURIComponent(publicationId)}/subscriptions`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          reactivate_existing: false,
          send_welcome_email: true,
          double_opt_override: 'on',
          utm_source: 'website',
          utm_medium: 'signup-form',
          utm_campaign: locale,
          referring_site: 'https://project-humanity.org',
        }),
      },
    );
    if (!res.ok) {
      console.error('newsletter: beehiiv responded', res.status, await res.text());
      return fail('provider_error', 502);
    }
  } catch (err) {
    console.error('newsletter: beehiiv request failed', err);
    return fail('provider_error', 502);
  }

  // Same answer whether the address was new or already subscribed, so the form
  // can't be used to find out who is on the list.
  return json({ ok: true });
};
