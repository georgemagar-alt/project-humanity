// Inserts two demo campaigns if the campaigns table is empty.
// Usage:  npm run db:seed
import { createClient } from '@libsql/client';

try {
  process.loadEnvFile('.env');
} catch {
  // rely on real environment variables
}

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error('TURSO_DATABASE_URL is not set.');
  process.exit(1);
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const { rows } = await client.execute('SELECT COUNT(*) AS n FROM campaigns');
if (Number(rows[0].n) > 0) {
  console.log('campaigns table already has rows – skipping seed.');
  process.exit(0);
}

await client.batch([
  {
    sql: `INSERT INTO campaigns
      (slug, title_de, title_en, description_de, description_en, goal_cents, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    args: [
      'winterhilfe-2026',
      'Winterhilfe 2026',
      'Winter Relief 2026',
      'Wir stellen 400 Schlafsäcke und warme Mahlzeiten für Menschen ohne Obdach bereit.',
      'We provide 400 sleeping bags and warm meals for people without shelter.',
      200000, // 2.000,00 €
      1,
    ],
  },
  {
    sql: `INSERT INTO campaigns
      (slug, title_de, title_en, description_de, description_en, goal_cents, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')`,
    args: [
      'schulmaterial',
      'Schulmaterial für alle',
      'School supplies for everyone',
      'Ranzen, Hefte und Stifte für 120 Kinder zum Schuljahresbeginn.',
      'Backpacks, notebooks and pens for 120 children at the start of the school year.',
      350000, // 3.500,00 €
      2,
    ],
  },
]);

console.log('Seeded 2 demo campaigns.');
