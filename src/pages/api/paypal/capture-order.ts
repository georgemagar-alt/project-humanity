import type { APIRoute } from 'astro';
import {
  getPublicCampaign,
  markDonationEmailSent,
  recordCompletedDonation,
} from '../../../lib/db';
import { captureOrder, parseCaptureFromOrder } from '../../../lib/paypal';
import { sendDonationThankYou } from '../../../lib/email';
import { fail, json } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const orderId = String(body?.orderId ?? '').trim();
  const locale: 'de' | 'en' = body?.locale === 'en' ? 'en' : 'de';
  if (!orderId) return fail('missing_order');

  let captured: unknown;
  try {
    captured = await captureOrder(orderId);
  } catch (err) {
    console.error('captureOrder failed', err);
    return fail('capture_failed', 502);
  }

  const info = parseCaptureFromOrder(captured);
  if (!info) return fail('capture_unparseable', 502);
  if (info.status !== 'COMPLETED') return fail('capture_not_completed', 409);
  if (!info.campaignId) return fail('missing_campaign_reference', 422);

  const rec = await recordCompletedDonation({
    campaignId: info.campaignId,
    grossCents: info.grossCents,
    netCents: info.netCents,
    currency: info.currency,
    donorName: info.payerName,
    donorEmail: info.payerEmail,
    paypalOrderId: info.orderId ?? orderId,
    paypalCaptureId: info.captureId,
    locale,
  });

  if (rec.inserted && rec.id && info.payerEmail) {
    try {
      const campaign = await getPublicCampaign(info.campaignId);
      await sendDonationThankYou({
        toEmail: info.payerEmail,
        toName: info.payerName,
        locale,
        amountCents: info.grossCents,
        campaignTitle: campaign?.title[locale] ?? campaign?.title.de ?? 'Kampagne',
      });
      await markDonationEmailSent(rec.id);
    } catch (err) {
      console.error('thank-you email failed', err);
    }
  }

  return json({ ok: true, campaignId: info.campaignId, amountCents: info.grossCents });
};
