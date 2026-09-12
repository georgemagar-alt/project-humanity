// Use the web build (pure HTTP over fetch — no native bindings, no WebSocket),
// which is what works reliably inside Netlify's serverless functions. It talks to
// the same Turso database via libsql:// / https:// URLs; it does NOT support
// file: URLs, so local dev must also point at a hosted Turso database.
import { createClient } from '@libsql/client/web';
import type { Client, Row } from '@libsql/client';
import { requireEnv, optionalEnv } from './env';

let client: Client | null = null;

export function db(): Client {
  if (client) return client;
  client = createClient({
    url: requireEnv('TURSO_DATABASE_URL'),
    authToken: optionalEnv('TURSO_AUTH_TOKEN') || undefined,
  });
  return client;
}

export type CampaignStatus = 'active' | 'paused' | 'completed' | 'archived';

export interface CampaignRow {
  id: number;
  slug: string;
  title_de: string;
  title_en: string;
  description_de: string;
  description_en: string;
  goal_cents: number;
  currency: string;
  starts_at: string | null;
  ends_at: string | null;
  status: CampaignStatus;
  sort_order: number;
}

export interface CampaignPublic {
  id: number;
  slug: string;
  title: { de: string; en: string };
  description: { de: string; en: string };
  goalCents: number;
  raisedCents: number;
  donorCount: number;
  currency: string;
  status: CampaignStatus;
}

function toPublic(r: Row): CampaignPublic {
  return {
    id: Number(r.id),
    slug: String(r.slug),
    title: { de: String(r.title_de), en: String(r.title_en) },
    description: { de: String(r.description_de), en: String(r.description_en) },
    goalCents: Number(r.goal_cents),
    raisedCents: Number(r.raised_cents ?? 0),
    donorCount: Number(r.donor_count ?? 0),
    currency: String(r.currency),
    status: String(r.status) as CampaignStatus,
  };
}

const PUBLIC_SELECT = `
  SELECT c.*,
    COALESCE((SELECT SUM(d.gross_cents) FROM donations d
              WHERE d.campaign_id = c.id AND d.status = 'completed'), 0) AS raised_cents,
    (SELECT COUNT(*) FROM donations d
     WHERE d.campaign_id = c.id AND d.status = 'completed') AS donor_count
  FROM campaigns c
`;

/** Campaigns to show publicly (active + already completed), with live totals. */
export async function getPublicCampaigns(): Promise<CampaignPublic[]> {
  const res = await db().execute(
    `${PUBLIC_SELECT} WHERE c.status IN ('active','completed')
     ORDER BY c.sort_order ASC, c.id ASC`,
  );
  return res.rows.map(toPublic);
}

export async function getPublicCampaign(id: number): Promise<CampaignPublic | null> {
  const res = await db().execute({
    sql: `${PUBLIC_SELECT} WHERE c.id = ? LIMIT 1`,
    args: [id],
  });
  return res.rows[0] ? toPublic(res.rows[0]) : null;
}

export async function getCampaignRow(id: number): Promise<CampaignRow | null> {
  const res = await db().execute({
    sql: 'SELECT * FROM campaigns WHERE id = ? LIMIT 1',
    args: [id],
  });
  return (res.rows[0] as unknown as CampaignRow) ?? null;
}

/**
 * Insert a completed donation. Idempotent on paypal_capture_id, so calling it
 * again for the same PayPal capture (e.g. from the webhook after the browser
 * flow) does not double-count.
 */
export async function recordCompletedDonation(input: {
  campaignId: number;
  grossCents: number;
  netCents: number | null;
  currency: string;
  donorName: string | null;
  donorEmail: string | null;
  paypalOrderId: string;
  paypalCaptureId: string;
  locale: 'de' | 'en';
}): Promise<{ inserted: boolean; id: number | null }> {
  const res = await db().execute({
    sql: `INSERT INTO donations
      (campaign_id, gross_cents, net_cents, currency, donor_name, donor_email,
       paypal_order_id, paypal_capture_id, status, locale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
      ON CONFLICT(paypal_capture_id) DO NOTHING`,
    args: [
      input.campaignId,
      input.grossCents,
      input.netCents,
      input.currency,
      input.donorName,
      input.donorEmail,
      input.paypalOrderId,
      input.paypalCaptureId,
      input.locale,
    ],
  });
  if (res.rowsAffected > 0) {
    const row = await db().execute({
      sql: 'SELECT id FROM donations WHERE paypal_capture_id = ?',
      args: [input.paypalCaptureId],
    });
    return { inserted: true, id: Number(row.rows[0].id) };
  }
  return { inserted: false, id: null };
}

export async function markDonationRefunded(paypalCaptureId: string): Promise<void> {
  await db().execute({
    sql: `UPDATE donations SET status = 'refunded' WHERE paypal_capture_id = ?`,
    args: [paypalCaptureId],
  });
}

export async function markDonationEmailSent(id: number): Promise<void> {
  await db().execute({
    sql: `UPDATE donations SET email_sent_at = datetime('now') WHERE id = ?`,
    args: [id],
  });
}

export async function insertMembershipRequest(input: {
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  locale: 'de' | 'en';
}): Promise<void> {
  await db().execute({
    sql: `INSERT INTO membership_requests (name, email, phone, message, locale)
          VALUES (?, ?, ?, ?, ?)`,
    args: [input.name, input.email, input.phone, input.message, input.locale],
  });
}

// --- Admin -----------------------------------------------------------

export async function adminListCampaigns(): Promise<CampaignPublic[]> {
  const res = await db().execute(
    `${PUBLIC_SELECT} ORDER BY c.sort_order ASC, c.id ASC`,
  );
  return res.rows.map(toPublic);
}

export async function adminCreateCampaign(input: {
  slug: string;
  title_de: string;
  title_en: string;
  description_de: string;
  description_en: string;
  goal_cents: number;
  sort_order: number;
  status: CampaignStatus;
}): Promise<void> {
  await db().execute({
    sql: `INSERT INTO campaigns
      (slug, title_de, title_en, description_de, description_en, goal_cents, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      input.slug,
      input.title_de,
      input.title_en,
      input.description_de,
      input.description_en,
      input.goal_cents,
      input.sort_order,
      input.status,
    ],
  });
}

export async function adminUpdateCampaign(
  id: number,
  input: {
    title_de: string;
    title_en: string;
    description_de: string;
    description_en: string;
    goal_cents: number;
    sort_order: number;
    status: CampaignStatus;
  },
): Promise<void> {
  await db().execute({
    sql: `UPDATE campaigns SET
      title_de = ?, title_en = ?, description_de = ?, description_en = ?,
      goal_cents = ?, sort_order = ?, status = ?, updated_at = datetime('now')
      WHERE id = ?`,
    args: [
      input.title_de,
      input.title_en,
      input.description_de,
      input.description_en,
      input.goal_cents,
      input.sort_order,
      input.status,
      id,
    ],
  });
}

export async function listRecentDonations(limit = 50): Promise<Row[]> {
  const res = await db().execute({
    sql: `SELECT d.*, c.title_de AS campaign_title
          FROM donations d JOIN campaigns c ON c.id = d.campaign_id
          ORDER BY d.created_at DESC LIMIT ?`,
    args: [limit],
  });
  return res.rows;
}
