import { z } from 'zod';
import { sql } from '@/lib/db';
import { body, error, isUuid, json } from '@/lib/api';

export async function GET(_req: Request, ctx: RouteContext<'/api/meetings/[id]'>) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return error('not found', 404);
  const [m] = await sql`select id, title, status, error, duration_ms from meetings where id = ${id}`;
  if (!m) return error('not found', 404);
  const jobs = await sql`select step, status, attempts, duration_ms, error from jobs where meeting_id = ${id} order by id`;
  return json({ ...m, jobs });
}

const Patch = z.object({ title: z.string().trim().min(1).max(200) });

export async function PATCH(req: Request, ctx: RouteContext<'/api/meetings/[id]'>) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return error('not found', 404);
  const b = await body(req, Patch);
  if (b instanceof Response) return b;
  const [m] = await sql`update meetings set title = ${b.title} where id = ${id} returning id, title`;
  return m ? json(m) : error('not found', 404);
}
