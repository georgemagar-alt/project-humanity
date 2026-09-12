import { optionalEnv, requireEnv } from './env';
import { formatCents } from './money';

type Locale = 'de' | 'en';
interface Address {
  email: string;
  name?: string;
}

function parseFrom(raw: string): Address {
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1] || undefined, email: m[2].trim() };
  return { email: raw.trim() };
}

async function sendBrevo(opts: {
  to: Address[];
  subject: string;
  html: string;
  text: string;
  replyTo?: Address;
}): Promise<void> {
  const apiKey = requireEnv('BREVO_API_KEY');
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({
      sender: parseFrom(requireEnv('EMAIL_FROM')),
      to: opts.to,
      replyTo: opts.replyTo,
      subject: opts.subject,
      htmlContent: opts.html,
      textContent: opts.text,
    }),
  });
  if (!res.ok) {
    throw new Error(`Brevo send error ${res.status}: ${await res.text()}`);
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

const ORG_NAME = optionalEnv('EMAIL_FROM', 'Project Humanity').replace(/\s*<.*>$/, '') || 'Project Humanity';

export async function sendDonationThankYou(input: {
  toEmail: string;
  toName: string | null;
  locale: Locale;
  amountCents: number;
  campaignTitle: string;
}): Promise<void> {
  const amount = formatCents(input.amountCents, input.locale);
  const campaign = escapeHtml(input.campaignTitle);
  const greeting = input.toName ? escapeHtml(input.toName) : null;

  const copy =
    input.locale === 'en'
      ? {
          subject: `Thank you for your donation to ${ORG_NAME}`,
          hello: greeting ? `Hello ${greeting},` : 'Hello,',
          body: `thank you very much for your donation of <strong>${amount}</strong> to the campaign “${campaign}”. Your contribution goes directly into this project.`,
          note: 'This email confirms your donation. For donations up to €300 you can claim it together with your PayPal receipt. If you would like a formal donation receipt, simply reply to this email.',
          regards: 'Warm regards',
        }
      : {
          subject: `Danke für deine Spende an ${ORG_NAME}`,
          hello: greeting ? `Hallo ${greeting},` : 'Hallo,',
          body: `vielen Dank für deine Spende von <strong>${amount}</strong> für die Kampagne „${campaign}“. Dein Beitrag fließt direkt in dieses Projekt.`,
          note: 'Diese E-Mail bestätigt deine Spende. Für Spenden bis 300 € kannst du sie zusammen mit deinem PayPal-Beleg beim Finanzamt geltend machen. Wenn du eine förmliche Zuwendungsbestätigung möchtest, antworte einfach auf diese E-Mail.',
          regards: 'Herzliche Grüße',
        };

  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">
    <p>${copy.hello}</p>
    <p>${copy.body}</p>
    <p style="color:#555;font-size:14px">${copy.note}</p>
    <p>${copy.regards}<br>${escapeHtml(ORG_NAME)}</p>
  </div>`;
  const text = `${copy.hello}\n\n${copy.body.replace(/<[^>]+>/g, '')}\n\n${copy.note}\n\n${copy.regards}\n${ORG_NAME}`;

  await sendBrevo({ to: [{ email: input.toEmail, name: input.toName ?? undefined }], subject: copy.subject, html, text });
}

export async function sendMembershipNotification(input: {
  name: string;
  email: string;
  phone: string | null;
  message: string | null;
  locale: Locale;
}): Promise<void> {
  const to = optionalEnv('MEMBERSHIP_NOTIFY_EMAIL');
  if (!to) return;
  const rows = [
    ['Name', input.name],
    ['E-Mail', input.email],
    ['Telefon', input.phone ?? '—'],
    ['Sprache', input.locale],
    ['Nachricht', input.message ?? '—'],
  ]
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#555">${k}</td><td>${escapeHtml(String(v))}</td></tr>`)
    .join('');
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:15px">
    <p>Neue Anfrage über das Formular „Mitglied werden“:</p>
    <table>${rows}</table>
  </div>`;
  const text = `Neue Mitgliedsanfrage:\nName: ${input.name}\nE-Mail: ${input.email}\nTelefon: ${input.phone ?? '—'}\nSprache: ${input.locale}\nNachricht: ${input.message ?? '—'}`;
  await sendBrevo({
    to: [{ email: to }],
    subject: `Mitglied werden – Anfrage von ${input.name}`,
    html,
    text,
    replyTo: { email: input.email, name: input.name },
  });
}

export async function sendMembershipAck(input: {
  toEmail: string;
  toName: string;
  locale: Locale;
}): Promise<void> {
  const name = escapeHtml(input.toName);
  const copy =
    input.locale === 'en'
      ? {
          subject: `We received your request – ${ORG_NAME}`,
          body: `Hello ${name},\n\nthank you for your interest in joining ${ORG_NAME}. We have received your request and will get back to you soon.`,
        }
      : {
          subject: `Deine Anfrage ist angekommen – ${ORG_NAME}`,
          body: `Hallo ${name},\n\ndanke für dein Interesse an einer Mitgliedschaft bei ${ORG_NAME}. Wir haben deine Anfrage erhalten und melden uns bald bei dir.`,
        };
  const html = `<div style="font-family:system-ui,Arial,sans-serif;font-size:16px;line-height:1.5">${copy.body
    .split('\n')
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join('')}</div>`;
  await sendBrevo({ to: [{ email: input.toEmail, name: input.toName }], subject: copy.subject, html, text: copy.body });
}
