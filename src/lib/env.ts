// Central env-var access. Reads process.env first (production / Netlify),
// falling back to import.meta.env (Vite during local dev).

function read(key: string): string | undefined {
  const fromProcess = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  if (fromProcess != null && fromProcess !== '') return fromProcess;
  const fromVite = (import.meta.env as Record<string, string | undefined>)[key];
  return fromVite != null && fromVite !== '' ? fromVite : undefined;
}

export function requireEnv(key: string): string {
  const value = read(key);
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

export function optionalEnv(key: string, fallback = ''): string {
  return read(key) ?? fallback;
}

export const PAYPAL_ENV = optionalEnv('PAYPAL_ENV', 'sandbox');
export const PAYPAL_API_BASE =
  PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
