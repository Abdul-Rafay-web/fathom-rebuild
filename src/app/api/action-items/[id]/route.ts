import { z } from 'zod';
import { sql } from '@/lib/db';
import { body, error, isUuid, json } from '@/lib/api';
import { forbidden, meetingAccess } from '@/lib/auth';

const Patch = z.object({
  version: z.number().int(),
  done: z.boolean().optional(),
  text: z.string().trim().min(1).max(500).optional(),
});

/**
 * Optimistic concurrency: the update only applies if the row is still at the
 * version the client saw. Two people ticking the same item can't silently
 * overwrite each other; the loser gets 409 plus the current row.
 */
export async function PATCH(req: Request, ctx: RouteContext<'/api/action-items/[id]'>) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return error('not found', 404);
  const [a] = await sql<{ meeting_id: string }[]>`select meeting_id from action_items where id = ${id}`;
  if (!a) return error('not found', 404);
  const { access } = await meetingAccess(a.meeting_id);
  if (access !== 'write') return forbidden(access);
  const b = await body(req, Patch);
  if (b instanceof Response) return b;
  const [row] = await sql`
    update action_items set
      done = coalesce(${b.done ?? null}::boolean, done),
      text = coalesce(${b.text ?? null}::text, text),
      version = version + 1
    where id = ${id} and version = ${b.version}
    returning id, done, text, version`;
  if (row) return json(row);
  const [current] = await sql`select id, done, text, version from action_items where id = ${id}`;
  return current ? Response.json({ error: 'conflict', current }, { status: 409 }) : error('not found', 404);
}
