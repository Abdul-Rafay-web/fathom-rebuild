import 'server-only';
import { headers } from 'next/headers';
import { sql } from './db';

/**
 * Fixed-window limiter: one atomic upsert per request. Returns true if allowed.
 * Old windows are pruned opportunistically (~1% of calls) instead of by a cron.
 */
export async function rateLimit(bucket: string, limit: number, windowSec: number) {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? 'local').split(',')[0].trim();
  const key = `${bucket}:${ip}`;
  const [row] = await sql<{ count: number }[]>`
    insert into rate_limits (key, window_start, count)
    values (${key}, to_timestamp(floor(extract(epoch from now()) / ${windowSec}) * ${windowSec}), 1)
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count`;
  if (Math.random() < 0.01) await sql`delete from rate_limits where window_start < now() - interval '1 day'`;
  return row.count <= limit;
}
