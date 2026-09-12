import type { APIRoute } from 'astro';
import {
  getPublicCampaign,
  markDonationEmailSent,
  completeDonationByOrder,
} from '../../../lib/db';
import { captureOrder, parseCaptureFromOrder } from '../../../lib/paypal';
import { sendDonationThankYou } from '../../../lib/email';
import { fail, json } from '../../../lib/http';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const orderId = String(body?.orderId ?? '').trim();
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

  const donation = await completeDonationByOrder({
    paypalOrderId: orderId,
    paypalCaptureId: info.captureId,
    grossCents: info.grossCents,
    netCents: info.netCents,
  });
  if (!donation) return fail('donation_not_found', 404);

  // Only the call that actually flipped it to completed sends the thank-you.
  if (donation.justCompleted && donation.donorEmail) {
    try {
      const campaign = await getPublicCampaign(donation.campaignId);
      await sendDonationThankYou({
        toEmail: donation.donorEmail,
        toName: donation.donorName,
        locale: donation.locale,
        amountCents: donation.grossCents,
        campaignTitle: campaign?.title[donation.locale] ?? campaign?.title.de ?? 'Kampagne',
      });
      await markDonationEmailSent(donation.id);
    } catch (err) {
      console.error('thank-you email failed', err);
    }
  }

  return json({ ok: true, campaignId: donation.campaignId, amountCents: donation.grossCents });
};
