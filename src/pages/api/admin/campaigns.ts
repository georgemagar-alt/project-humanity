import type { APIRoute } from 'astro';
import { timingSafeEqual } from 'node:crypto';
import {
  adminCreateCampaign,
  adminListCampaigns,
  adminUpdateCampaign,
  listRecentDonations,
  type CampaignStatus,
} from '../../../lib/db';
import { requireEnv } from '../../../lib/env';
import { fail, json } from '../../../lib/http';

export const prerender = false;

const STATUSES: CampaignStatus[] = ['active', 'paused', 'completed', 'archived'];

function authorized(request: Request): boolean {
  const header = request.headers.get('authorization') ?? '';
  const provided = header.replace(/^Bearer\s+/i, '');
  let expected: string;
  try {
    expected = requireEnv('ADMIN_TOKEN');
  } catch {
    return false;
  }
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const GET: APIRoute = async ({ request }) => {
  if (!authorized(request)) return fail('unauthorized', 401);
  const [campaigns, donations] = await Promise.all([
    adminListCampaigns(),
    listRecentDonations(50),
  ]);
  return json({ campaigns, donations });
};

export const POST: APIRoute = async ({ request }) => {
  if (!authorized(request)) return fail('unauthorized', 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return fail('invalid_json');

  const goalCents = Number(body.goal_cents);
  const sortOrder = Number(body.sort_order ?? 0);
  const status: CampaignStatus = STATUSES.includes(body.status) ? body.status : 'paused';

  const fields = {
    title_de: String(body.title_de ?? '').trim(),
    title_en: String(body.title_en ?? '').trim(),
    description_de: String(body.description_de ?? '').trim(),
    description_en: String(body.description_en ?? '').trim(),
    goal_cents: goalCents,
    sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
    status,
  };

  if (!fields.title_de || !fields.title_en) return fail('missing_title', 422);
  if (!Number.isInteger(goalCents) || goalCents <= 0) return fail('invalid_goal', 422);

  try {
    if (body.action === 'update') {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return fail('invalid_id', 422);
      await adminUpdateCampaign(id, fields);
    } else {
      const slug = String(body.slug ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      if (!slug) return fail('missing_slug', 422);
      await adminCreateCampaign({ ...fields, slug });
    }
  } catch (err) {
    console.error('admin campaign write failed', err);
    return fail('write_failed', 500);
  }

  return json({ ok: true });
};
