// Reads published newsletter issues from beehiiv, so an issue appears on the
// website as soon as it is published there. The API key stays on the server.
import { optionalEnv } from './env';

// Not a secret: identifies the beehiiv publication. Can be overridden via env.
export const DEFAULT_PUBLICATION_ID = 'pub_c442fdb5-36fd-438e-aed4-dd54cb7f2431';

const API = 'https://api.beehiiv.com/v2';
// How long one Worker instance reuses a beehiiv answer before asking again.
const CACHE_MS = 5 * 60 * 1000;

export interface Issue {
  id: string;
  slug: string;
  title: string;
  summary: string;
  date: Date;
  /** Thumbnail served through our own media proxy, if set in beehiiv. */
  image?: string;
  /** Sanitized HTML of the web version; only set by getIssue(). */
  html?: string;
}

interface BeehiivPost {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  preview_text?: string | null;
  meta_default_description?: string | null;
  publish_date?: number | null;
  displayed_date?: number | null;
  thumbnail_url?: string | null;
  platform?: string;
  hidden_from_feed?: boolean;
  content?: { free?: { web?: string | null } | null } | null;
}

const cache = new Map<string, { at: number; value: unknown }>();

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const value = await load();
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function api<T>(path: string): Promise<T | null> {
  const apiKey = optionalEnv('BEEHIIV_API_KEY');
  if (!apiKey) {
    console.error('beehiiv: BEEHIIV_API_KEY is not set');
    return null;
  }
  const pub = encodeURIComponent(optionalEnv('BEEHIIV_PUBLICATION_ID', DEFAULT_PUBLICATION_ID));
  try {
    const res = await fetch(`${API}/publications/${pub}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      console.error('beehiiv: GET', path, 'responded', res.status, await res.text());
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.error('beehiiv: GET', path, 'failed', err);
    return null;
  }
}

const toIssue = (p: BeehiivPost): Issue => ({
  id: p.id,
  slug: p.slug,
  title: p.title,
  summary: p.subtitle || p.preview_text || p.meta_default_description || '',
  date: new Date(((p.displayed_date || p.publish_date) ?? 0) * 1000),
  image: mediaUrl(p.thumbnail_url) ?? undefined,
});

// Only issues that are published and meant for the web archive.
const isPublic = (p: BeehiivPost) =>
  p.platform !== 'email' && !p.hidden_from_feed && !!p.slug;

/** Published issues, newest first. Empty if beehiiv can't be reached. */
export function listIssues(): Promise<Issue[]> {
  return cached('list', async () => {
    const res = await api<{ data: BeehiivPost[] }>(
      '/posts?status=confirmed&order_by=publish_date&direction=desc&limit=100',
    );
    return (res?.data ?? []).filter(isPublic).map(toIssue);
  });
}

/** One issue including its sanitized web content, or null if not found. */
export async function getIssue(slug: string): Promise<Issue | null> {
  const meta = (await listIssues()).find((i) => i.slug === slug);
  if (!meta) return null;
  return cached(`post:${meta.id}`, async () => {
    const res = await api<{ data: BeehiivPost }>(
      `/posts/${encodeURIComponent(meta.id)}?expand[]=free_web_content`,
    );
    const raw = res?.data.content?.free?.web;
    return { ...meta, html: raw ? stripPostHeader(await sanitize(raw), meta.image) : '' };
  });
}

// --- HTML clean-up ---------------------------------------------------------

// Cloudflare's streaming HTML parser (built into the Workers runtime).
interface Rewriter {
  on(selector: string, handlers: { element?(el: RewriterElement): void }): Rewriter;
  transform(res: Response): Response;
}
declare const HTMLRewriter: { new (): Rewriter };
interface RewriterElement {
  tagName: string;
  attributes: Iterable<[string, string]>;
  getAttribute(name: string): string | null;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
  remove(): void;
  removeAndKeepContent(): void;
}

/** Hosts we fetch newsletter images from (via our own /newsletter/media proxy). */
export const MEDIA_HOSTS = [/(^|\.)beehiiv\.com$/, /^beehiiv-images-production\.s3\.amazonaws\.com$/];
export const isMediaHost = (host: string) => MEDIA_HOSTS.some((re) => re.test(host));

/** Rewrites a beehiiv image URL to our own /newsletter/media proxy, or null if not allowed. */
function mediaUrl(src: string | null | undefined): string | null {
  let url: URL;
  try {
    url = new URL(src ?? '');
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !isMediaHost(url.hostname)) return null;
  return `/newsletter/media?u=${encodeURIComponent(url.toString())}`;
}

const KEEP_ATTRS = new Set(['href', 'src', 'alt', 'title', 'colspan', 'rowspan']);

/**
 * Turns beehiiv's web HTML into plain content that inherits the site's own
 * typography: no scripts, styles, embeds or tracking, and images are loaded
 * through our own server so visitors never contact beehiiv directly.
 */
async function sanitize(html: string): Promise<string> {
  // beehiiv may deliver a full document; only the body is content.
  const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html;

  const rewriter = new HTMLRewriter()
    .on('script, style, link, meta, iframe, object, embed, form, input, button, noscript, svg', {
      element: (el) => el.remove(),
    })
    // Layout wrappers: keep what's inside, drop the box.
    .on('div, span, section, center, font, table, tbody, thead, tr, td, th, mark', {
      element: (el) => el.removeAndKeepContent(),
    })
    .on('*', {
      element: (el) => {
        for (const [name] of [...el.attributes]) {
          if (!KEEP_ATTRS.has(name)) el.removeAttribute(name);
        }
        const href = el.getAttribute('href');
        if (href && !/^(https?:|mailto:|\/|#)/i.test(href)) el.removeAttribute('href');
        if (href && /^https?:/i.test(href)) el.setAttribute('rel', 'noopener');
      },
    })
    .on('img', {
      element: (el) => {
        const src = mediaUrl(el.getAttribute('src'));
        if (!src) {
          el.remove();
          return;
        }
        el.setAttribute('src', src);
        el.setAttribute('loading', 'lazy');
        if (el.getAttribute('alt') == null) el.setAttribute('alt', '');
      },
    });

  const clean = await rewriter
    .transform(new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } }))
    .text();
  // Decorative quote marks from beehiiv's quote block.
  return clean.replace(/\s*[❝❞]\s*/g, ' ');
}

/**
 * beehiiv's web content starts with its own post header (title, subtitle,
 * author, date, share buttons, thumbnail). Our page renders title, date and
 * thumbnail itself, so everything up to the last share link – and the
 * thumbnail right after it – is dropped.
 */
function stripPostHeader(html: string, thumbnail?: string): string {
  const head = html.slice(0, 15000);
  // beehiiv quotes attributes with ' or ", so accept both.
  const share = /<a\b[^>]*href=["'][^"']*(?:sharer|intent\/(?:tweet|post)|share-offsite)[^"']*["'][^>]*>[\s\S]*?<\/a>/g;
  let end = 0;
  for (const m of head.matchAll(share)) end = m.index! + m[0].length;
  if (end === 0) return html;

  let rest = html.slice(end);
  // Thumbnails are matched by their upload id; the image size params differ.
  const thumbId = thumbnail && decodeURIComponent(thumbnail).match(/uploads\/asset\/file\/[0-9a-f-]+/)?.[0];
  const firstImg = rest.match(/^\s*<img[^>]*>/);
  if (thumbId && firstImg && decodeURIComponent(firstImg[0]).includes(thumbId)) {
    rest = rest.slice(firstImg[0].length);
  }
  return rest;
}
