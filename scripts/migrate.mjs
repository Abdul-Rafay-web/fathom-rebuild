// Applies db/migrations/*.sql in order, each in its own transaction.
// A Postgres advisory lock makes concurrent runs (two terminals, CI + local) safe.
import fs from 'node:fs';
import path from 'node:path';
import postgres from 'postgres';
import { loadEnv } from './env.mjs';

loadEnv();
const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1, onnotice: () => {} });
const dir = path.resolve('db/migrations');
const LOCK_KEY = 8_008_001;

try {
  await sql`select pg_advisory_lock(${LOCK_KEY})`;
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    if (applied.has(f)) continue;
    const body = fs.readFileSync(path.join(dir, f), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${f})`;
    });
    console.log('applied', f);
  }
  console.log('migrations up to date');
} finally {
  await sql`select pg_advisory_unlock(${LOCK_KEY})`.catch(() => {});
  await sql.end();
}
