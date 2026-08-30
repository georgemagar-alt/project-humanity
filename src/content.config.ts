import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';

const langField = z.enum(['de', 'en']);

const news = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/news' }),
  schema: z.object({
    title: z.string(),
    lang: langField,
    // Same value on the DE and EN version of one post, to link translations.
    translationKey: z.string(),
    date: z.coerce.date(),
    summary: z.string().default(''),
    draft: z.boolean().default(false),
  }),
});

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    lang: langField,
    translationKey: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date().optional(),
    location: z.string().default(''),
    summary: z.string().default(''),
    draft: z.boolean().default(false),
  }),
});

export const collections = { news, events };
