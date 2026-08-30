// Applies schema.sql to the configured database.
// Usage:  npm run db:schema
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';

try {
  process.loadEnvFile('.env');
} catch {
  // no .env file – rely on real environment variables
}

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error('TURSO_DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

const client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

const sql = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
await client.executeMultiple(sql);
console.log(`Schema applied to ${url}`);
