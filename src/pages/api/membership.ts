import type { APIRoute } from 'astro';
import { insertMembershipRequest } from '../../lib/db';
import { sendMembershipAck, sendMembershipNotification } from '../../lib/email';
import { fail, json } from '../../lib/http';

export const prerender = false;

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body) return fail('invalid_json');

  // Honeypot: bots fill hidden fields. Pretend everything is fine.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return json({ ok: true });
  }

  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim();
  const locale: 'de' | 'en' = body.locale === 'en' ? 'en' : 'de';
  if (name.length < 2 || name.length > 120 || !EMAIL_RE.test(email)) {
    return fail('invalid_input', 422);
  }
  const phone = body.phone ? String(body.phone).trim().slice(0, 40) || null : null;
  const message = body.message ? String(body.message).trim().slice(0, 4000) || null : null;

  try {
    await insertMembershipRequest({ name, email, phone, message, locale });
  } catch (err) {
    console.error('membership insert failed', err);
    return fail('storage_error', 500);
  }

  try {
    await sendMembershipNotification({ name, email, phone, message, locale });
    await sendMembershipAck({ toEmail: email, toName: name, locale });
  } catch (err) {
    console.error('membership email failed', err); // request still succeeds
  }

  return json({ ok: true });
};
