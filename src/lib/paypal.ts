import { PAYPAL_API_BASE, requireEnv } from './env';

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.token;
  }
  const id = requireEnv('PAYPAL_CLIENT_ID');
  const secret = requireEnv('PAYPAL_CLIENT_SECRET');
  const res = await fetch(`${PAYPAL_API_BASE}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) {
    throw new Error(`PayPal token error ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

export async function createOrder(opts: {
  amountValue: string;
  currency: string;
  campaignId: number;
  campaignTitle: string;
  brandName: string;
}): Promise<{ id: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API_BASE}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `campaign-${opts.campaignId}`,
          description: opts.campaignTitle.slice(0, 127),
          custom_id: String(opts.campaignId),
          amount: { currency_code: opts.currency, value: opts.amountValue },
        },
      ],
      application_context: {
        brand_name: opts.brandName,
        shipping_preference: 'NO_SHIPPING',
        user_action: 'PAY_NOW',
      },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`PayPal createOrder ${res.status}: ${JSON.stringify(data)}`);
  }
  return data as { id: string };
}

export async function captureOrder(orderId: string): Promise<unknown> {
  const token = await getAccessToken();
  const res = await fetch(
    `${PAYPAL_API_BASE}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    },
  );
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`PayPal captureOrder ${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

export interface CaptureInfo {
  captureId: string;
  status: string;
  grossCents: number;
  netCents: number | null;
  currency: string;
  payerEmail: string | null;
  payerName: string | null;
  campaignId: number | null;
  orderId: string | null;
}

function toCents(value: string | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

/** Extract the capture from a full order object (capture response or GET /orders). */
export function parseCaptureFromOrder(order: any): CaptureInfo | null {
  const pu = order?.purchase_units?.[0];
  const cap = pu?.payments?.captures?.[0];
  if (!cap) return null;
  const payer = order?.payer;
  const breakdown = cap.seller_receivable_breakdown;
  return {
    captureId: String(cap.id),
    status: String(cap.status ?? order?.status ?? 'UNKNOWN'),
    grossCents: toCents(cap.amount?.value) ?? 0,
    netCents: toCents(breakdown?.net_amount?.value),
    currency: String(cap.amount?.currency_code ?? 'EUR'),
    payerEmail: payer?.email_address ?? null,
    payerName: payer?.name
      ? `${payer.name.given_name ?? ''} ${payer.name.surname ?? ''}`.trim() || null
      : null,
    campaignId: pu?.custom_id ? Number(pu.custom_id) : null,
    orderId: order?.id ?? null,
  };
}

/** Extract capture info from a webhook `resource` (PAYMENT.CAPTURE.* events). */
export function parseCaptureFromWebhookResource(resource: any): CaptureInfo | null {
  if (!resource?.id) return null;
  const breakdown = resource.seller_receivable_breakdown;
  const customId = resource.custom_id ?? resource.supplementary_data?.related_ids?.order_id;
  return {
    captureId: String(resource.id),
    status: String(resource.status ?? 'UNKNOWN'),
    grossCents: toCents(resource.amount?.value) ?? 0,
    netCents: toCents(breakdown?.net_amount?.value),
    currency: String(resource.amount?.currency_code ?? 'EUR'),
    payerEmail: resource.payer?.email_address ?? null,
    payerName: null,
    campaignId: resource.custom_id ? Number(resource.custom_id) : null,
    orderId:
      resource.supplementary_data?.related_ids?.order_id ??
      (typeof customId === 'string' && /^\d+$/.test(customId) ? null : customId ?? null),
  };
}

export async function verifyWebhookSignature(
  headers: Headers,
  rawBody: string,
): Promise<boolean> {
  const token = await getAccessToken();
  const webhookId = requireEnv('PAYPAL_WEBHOOK_ID');
  const res = await fetch(
    `${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        auth_algo: headers.get('paypal-auth-algo'),
        cert_url: headers.get('paypal-cert-url'),
        transmission_id: headers.get('paypal-transmission-id'),
        transmission_sig: headers.get('paypal-transmission-sig'),
        transmission_time: headers.get('paypal-transmission-time'),
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    },
  );
  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === 'SUCCESS';
}
