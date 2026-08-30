import type { APIRoute } from 'astro';
import {
  getPublicCampaign,
  markDonationEmailSent,
  markDonationRefunded,
  recordCompletedDonation,
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
      if (info?.campaignId && info.captureId) {
        const rec = await recordCompletedDonation({
          campaignId: info.campaignId,
          grossCents: info.grossCents,
          netCents: info.netCents,
          currency: info.currency,
          donorName: info.payerName,
          donorEmail: info.payerEmail,
          paypalOrderId: info.orderId ?? '',
          paypalCaptureId: info.captureId,
          locale: 'de',
        });
        // Only reachable if the browser capture flow never completed. Send the
        // thank-you here too, if the webhook carried a payer email.
        if (rec.inserted && rec.id && info.payerEmail) {
          const campaign = await getPublicCampaign(info.campaignId);
          await sendDonationThankYou({
            toEmail: info.payerEmail,
            toName: info.payerName,
            locale: 'de',
            amountCents: info.grossCents,
            campaignTitle: campaign?.title.de ?? 'Kampagne',
          });
          await markDonationEmailSent(rec.id);
        } else if (rec.inserted) {
          console.warn('donation recorded via webhook without payer email', info.captureId);
        }
      }
    } else if (
      type === 'PAYMENT.CAPTURE.REFUNDED' ||
      type === 'PAYMENT.CAPTURE.REVERSED'
    ) {
      const captureId = originalCaptureId(resource);
      if (captureId) await markDonationRefunded(captureId);
    }
  } catch (err) {
    console.error(`webhook handler error for ${type}`, err);
    // 200 anyway: PayPal retries on non-2xx, and the browser flow is the
    // primary path. Errors are logged for manual reconciliation.
  }

  return new Response('ok');
};
