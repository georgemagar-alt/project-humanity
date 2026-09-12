import type { APIRoute } from 'astro';

export const prerender = false;

// TEMPORARY diagnostic endpoint. Reports env presence/shape (never the secret
// values) and the exact DB error, so we can pinpoint the Netlify config problem.
// Delete this file once the DB connection works.
export const GET: APIRoute = async () => {
  const out: Record<string, unknown> = {};

  const getv = (k: string) =>
    (typeof process !== 'undefined' ? process.env?.[k] : undefined) ??
    (import.meta.env as Record<string, string | undefined>)[k];

  const url = getv('TURSO_DATABASE_URL');
  const token = getv('TURSO_AUTH_TOKEN');

  out.env = {
    TURSO_DATABASE_URL_present: !!url,
    TURSO_DATABASE_URL_len: url ? url.length : 0,
    TURSO_DATABASE_URL_startsOk: url ? url.startsWith('libsql://') || url.startsWith('https://') : false,
    TURSO_DATABASE_URL_hasWhitespace: url ? /\s/.test(url) : false,
    TURSO_DATABASE_URL_head: url ? url.slice(0, 18) : null,
    TURSO_DATABASE_URL_tail: url ? url.slice(-14) : null,
    TURSO_AUTH_TOKEN_present: !!token,
    TURSO_AUTH_TOKEN_len: token ? token.length : 0,
    TURSO_AUTH_TOKEN_hasWhitespace: token ? /\s/.test(token) : false,
    PAYPAL_CLIENT_ID_present: !!getv('PAYPAL_CLIENT_ID'),
    PAYPAL_CLIENT_SECRET_present: !!getv('PAYPAL_CLIENT_SECRET'),
    PUBLIC_PAYPAL_CLIENT_ID_present: !!getv('PUBLIC_PAYPAL_CLIENT_ID'),
    PAYPAL_ENV: getv('PAYPAL_ENV') ?? null,
    ADMIN_TOKEN_present: !!getv('ADMIN_TOKEN'),
  };

  // Try the actual DB query and capture the real error.
  try {
    const { createClient } = await import('@libsql/client/web');
    const client = createClient({ url: String(url), authToken: token ? String(token) : undefined });
    const res = await client.execute('SELECT COUNT(*) AS n FROM campaigns');
    out.db = { ok: true, campaignCount: Number(res.rows[0].n) };
  } catch (err: any) {
    out.db = {
      ok: false,
      name: err?.name ?? null,
      code: err?.code ?? null,
      message: String(err?.message ?? err).slice(0, 300),
    };
  }

  return new Response(JSON.stringify(out, null, 2), {
    headers: { 'content-type': 'application/json' },
  });
};
