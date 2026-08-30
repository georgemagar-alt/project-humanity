// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import netlify from '@astrojs/netlify';

// Content pages are static; only /api/* and /admin opt into on-demand rendering
// via `export const prerender = false`.
// Fonts are downloaded at build time and self-hosted from our own domain —
// the visitor's browser never contacts Google.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://example.org',
  output: 'static',
  adapter: netlify(),
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Fraunces',
      cssVariable: '--font-display',
      weights: [400, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Georgia', 'serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--font-sans',
      weights: [400, 500, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],
  i18n: {
    locales: ['de', 'en'],
    defaultLocale: 'de',
    routing: {
      prefixDefaultLocale: false,
    },
  },
});
