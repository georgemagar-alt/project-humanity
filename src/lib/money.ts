// Money helpers. Everything is stored and compared in integer cents.

export const MIN_DONATION_CENTS = 100; //     1,00 €
export const MAX_DONATION_CENTS = 500000; // 5.000,00 € safety cap

/** Parse a user-entered euro amount ("12", "12,50", "12.50") into cents. NaN if invalid. */
export function eurosToCents(input: string | number): number {
  const n =
    typeof input === 'number'
      ? input
      : Number(String(input).replace(/\s/g, '').replace(',', '.'));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/** Format cents as a localized currency string, e.g. "1.980,00 €". */
export function formatCents(cents: number, locale: 'de' | 'en' = 'de'): string {
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-IE', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100);
}

/** Plain "12.34" string for the PayPal API `amount.value` field. */
export function centsToPlainAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function isValidDonationCents(cents: number): boolean {
  return (
    Number.isInteger(cents) &&
    cents >= MIN_DONATION_CENTS &&
    cents <= MAX_DONATION_CENTS
  );
}

/** Clamp a raised amount so a progress bar never exceeds 100%. */
export function progressPercent(raisedCents: number, goalCents: number): number {
  if (goalCents <= 0) return 0;
  return Math.max(0, Math.min(100, (raisedCents / goalCents) * 100));
}
