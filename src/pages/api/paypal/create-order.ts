import type { APIRoute } from 'astro';
import { getCampaignRow, createPendingDonation, type DonorInput } from '../../../lib/db';
import { createOrder } from '../../../lib/paypal';
import { centsToPlainAmount, isValidDonationCents } from '../../../lib/money';
import { optionalEnv } from '../../../lib/env';
import { fail, json } from '../../../lib/http';

export const prerender = false;

function brandName(): string {
  return optionalEnv('EMAIL_FROM', 'Project Humanity').replace(/\s*<.*>$/, '').trim() || 'Project Humanity';
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const opt = (v: unknown, max = 200) => {
  const s = str(v, max);
  return s === '' ? null : s;
};

/** Validate + normalize the donor block. Returns null if required fields are missing. */
function parseDonor(body: any): DonorInput | null {
  const firstName = str(body?.firstName, 100);
  const lastName = str(body?.lastName, 100);
  const email = str(body?.email, 200);
  const street = str(body?.street, 200);
  const houseNo = str(body?.houseNo, 30);
  const postalCode = str(body?.postalCode, 20);
  const city = str(body?.city, 120);
  const country = str(body?.country, 80) || 'Deutschland';
  if (
    firstName.length < 1 ||
    lastName.length < 1 ||
    !EMAIL_RE.test(email) ||
    street.length < 1 ||
    houseNo.length < 1 ||
    postalCode.length < 1 ||
    city.length < 1
  ) {
    return null;
  }
  return {
    salutation: opt(body?.salutation, 30),
    title: opt(body?.title, 40),
    firstName,
    lastName,
    company: opt(body?.company, 160),
    email,
    phone: opt(body?.phone, 40),
    street,
    houseNo,
    postalCode,
    city,
    country,
    newsletterOptIn: body?.newsletterOptIn === true,
  };
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
  const locale: 'de' | 'en' = body?.locale === 'en' ? 'en' : 'de';

  if (!Number.isInteger(campaignId) || campaignId <= 0) return fail('invalid_campaign');
  if (!isValidDonationCents(amountCents)) return fail('invalid_amount');
  if (body?.consent !== true) return fail('consent_required', 422);

  const donor = parseDonor(body);
  if (!donor) return fail('invalid_donor', 422);

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
    // Persist the donor details now (pending), keyed by the PayPal order id.
    await createPendingDonation({
      campaignId,
      grossCents: amountCents,
      currency: campaign.currency || 'EUR',
      locale,
      paypalOrderId: order.id,
      donor,
    });
    return json({ id: order.id });
  } catch (err) {
    console.error('create-order failed', err);
    return fail('paypal_error', 502);
  }
};
