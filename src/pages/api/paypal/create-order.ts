import type { APIRoute } from 'astro';
import { getCampaignRow } from '../../../lib/db';
import { createOrder } from '../../../lib/paypal';
import { centsToPlainAmount, isValidDonationCents } from '../../../lib/money';
import { optionalEnv } from '../../../lib/env';
import { fail, json } from '../../../lib/http';

export const prerender = false;

function brandName(): string {
  return optionalEnv('EMAIL_FROM', 'Project Humanity').replace(/\s*<.*>$/, '').trim() || 'Project Humanity';
}

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('invalid_json');
  }

  const campaignId = Number(body?.campaignId);
  const amountCents = Number(body?.amountCents);

  if (!Number.isInteger(campaignId) || campaignId <= 0) return fail('invalid_campaign');
  if (!isValidDonationCents(amountCents)) return fail('invalid_amount');

  const campaign = await getCampaignRow(campaignId);
  if (!campaign) return fail('campaign_not_found', 404);
  if (campaign.status !== 'active') return fail('campaign_not_active', 409);

  try {
    const order = await createOrder({
      amountValue: centsToPlainAmount(amountCents),
      currency: campaign.currency || 'EUR',
      campaignId,
      campaignTitle: campaign.title_de,
      brandName: brandName(),
    });
    return json({ id: order.id });
  } catch (err) {
    console.error('create-order failed', err);
    return fail('paypal_error', 502);
  }
};
