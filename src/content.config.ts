import { defineCollection } from 'astro:content';
import { z } from 'zod';
import { glob } from 'astro/loaders';

const langField = z.enum(['de', 'en']);

const events = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/events' }),
  schema: z.object({
    title: z.string(),
    lang: langField,
    translationKey: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date().optional(),
    // All-day / multi-day events: show the date(s) without a time.
    allDay: z.boolean().default(false),
    location: z.string().default(''),
    summary: z.string().default(''),
    draft: z.boolean().default(false),
  }),
});

export const collections = { events };
