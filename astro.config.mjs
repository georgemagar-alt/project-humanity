// @ts-check
import { defineConfig, fontProviders } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Content pages are static; only /api/* and /admin opt into on-demand rendering
// via `export const prerender = false`.
// Fonts are downloaded at build time and self-hosted from our own domain —
// the visitor's browser never contacts Google.
export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://example.org',
  output: 'static',
  adapter: cloudflare({
    // Optimize images at build time (Workers has no sharp at runtime).
    imageService: 'compile',
  }),
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Zilla Slab',
      cssVariable: '--ff-display',
      weights: [500, 600, 700],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['Rockwell', 'Georgia', 'serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--ff-sans',
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
