import type { APIRoute } from 'astro';
import {
  getPublicCampaign,
  markDonationEmailSent,
  markDonationRefunded,
  completeDonationByOrder,
} from '../../../lib/db';
import {
  parseCaptureFromWebhookResource,
  verifyWebhookSignature,
} from '../../../lib/paypal';
import { sendDonationThankYou } from '../../../lib/email';

export const prerender = false;

/** For PAYMENT.CAPTURE.REFUNDED/REVERSED, the original capture id is in links[rel=up]. */
function originalCaptureId(resource: any): string | null {
  const up = (resource?.links as any[] | undefined)?.find((l) => l.rel === 'up');
  const m = typeof up?.href === 'string' ? up.href.match(/\/captures\/([^/]+)$/) : null;
  return m ? m[1] : null;
}

export const POST: APIRoute = async ({ request }) => {
  const raw = await request.text();

  let verified = false;
  try {
    verified = await verifyWebhookSignature(request.headers, raw);
  } catch (err) {
    console.error('webhook verify threw', err);
  }
  if (!verified) return new Response('invalid signature', { status: 400 });

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }

  const type = String(event?.event_type ?? '');
  const resource = event?.resource;

  try {
    if (type === 'PAYMENT.CAPTURE.COMPLETED') {
      const info = parseCaptureFromWebhookResource(resource);
      const orderId = info?.orderId;
      if (info?.captureId && orderId) {
        // Idempotent: completes the pending donation created at checkout time,
        // matched by the PayPal order id. Safe to run after the browser already
        // captured (justCompleted will be false then).
        const donation = await completeDonationByOrder({
          paypalOrderId: orderId,
          paypalCaptureId: info.captureId,
          grossCents: info.grossCents,
          netCents: info.netCents,
        });
        if (donation?.justCompleted && donation.donorEmail) {
          const campaign = await getPublicCampaign(donation.campaignId);
          await sendDonationThankYou({
            toEmail: donation.donorEmail,
            toName: donation.donorName,
            locale: donation.locale,
            amountCents: donation.grossCents,
            campaignTitle: campaign?.title[donation.locale] ?? campaign?.title.de ?? 'Kampagne',
          });
          await markDonationEmailSent(donation.id);
        }
      }
    } else if (type === 'PAYMENT.CAPTURE.REFUNDED' || type === 'PAYMENT.CAPTURE.REVERSED') {
      const captureId = originalCaptureId(resource);
      if (captureId) await markDonationRefunded(captureId);
    }
  } catch (err) {
    console.error(`webhook handler error for ${type}`, err);
    // Still 200: PayPal retries on non-2xx, and the browser flow is the primary
    // path. Errors are logged for manual reconciliation.
  }

  return new Response('ok');
};
