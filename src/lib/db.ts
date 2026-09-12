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

export interface DonorInput {
  salutation: string | null;
  title: string | null;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string;
  phone: string | null;
  street: string;
  houseNo: string;
  postalCode: string;
  city: string;
  country: string;
  newsletterOptIn: boolean;
}

/**
 * Create a donation in "pending" state with the donor details collected before
 * payment, and the PayPal order id. Returns the new donation id, which we pass
 * to PayPal as custom_id so capture/webhook can find this exact record.
 */
export async function createPendingDonation(input: {
  campaignId: number;
  grossCents: number;
  currency: string;
  locale: 'de' | 'en';
  paypalOrderId: string;
  donor: DonorInput;
}): Promise<number> {
  const d = input.donor;
  const donorName = `${d.firstName} ${d.lastName}`.trim();
  const res = await db().execute({
    sql: `INSERT INTO donations
      (campaign_id, gross_cents, currency, donor_name, donor_email,
       salutation, title, first_name, last_name, company, phone,
       street, house_no, postal_code, city, country,
       newsletter_opt_in, consent_at, paypal_order_id, status, locale)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, 'pending', ?)`,
    args: [
      input.campaignId,
      input.grossCents,
      input.currency,
      donorName,
      d.email,
      d.salutation,
      d.title,
      d.firstName,
      d.lastName,
      d.company,
      d.phone,
      d.street,
      d.houseNo,
      d.postalCode,
      d.city,
      d.country,
      d.newsletterOptIn ? 1 : 0,
      input.paypalOrderId,
      input.locale,
    ],
  });
  return Number(res.lastInsertRowid);
}

export interface CompletedDonation {
  id: number;
  campaignId: number;
  grossCents: number;
  locale: 'de' | 'en';
  donorEmail: string | null;
  donorName: string | null;
  justCompleted: boolean;
}

/**
 * Mark the pending donation for a PayPal order as completed. Idempotent: the
 * capture id is only ever set once (guarded by `paypal_capture_id IS NULL`), so
 * the browser capture and the webhook can both call this without double-counting.
 * Returns the donation with `justCompleted` telling the caller whether THIS call
 * was the one that completed it (so only it sends the thank-you email).
 */
export async function completeDonationByOrder(input: {
  paypalOrderId: string;
  paypalCaptureId: string;
  grossCents: number;
  netCents: number | null;
}): Promise<CompletedDonation | null> {
  const upd = await db().execute({
    sql: `UPDATE donations
      SET status = 'completed', paypal_capture_id = ?, gross_cents = ?, net_cents = ?,
          completed_at = datetime('now')
      WHERE paypal_order_id = ? AND paypal_capture_id IS NULL AND status = 'pending'`,
    args: [input.paypalCaptureId, input.grossCents, input.netCents, input.paypalOrderId],
  });
  const row = await db().execute({
    sql: `SELECT id, campaign_id, gross_cents, locale, donor_email, donor_name
          FROM donations WHERE paypal_order_id = ? LIMIT 1`,
    args: [input.paypalOrderId],
  });
  const r = row.rows[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    campaignId: Number(r.campaign_id),
    grossCents: Number(r.gross_cents),
    locale: (String(r.locale) as 'de' | 'en'),
    donorEmail: r.donor_email ? String(r.donor_email) : null,
    donorName: r.donor_name ? String(r.donor_name) : null,
    justCompleted: upd.rowsAffected > 0,
  };
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
