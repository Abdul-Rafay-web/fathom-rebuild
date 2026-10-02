import { sql } from '@/lib/db';
import { error, isUuid, json } from '@/lib/api';
import { forbidden, meetingAccess } from '@/lib/auth';

export async function DELETE(_req: Request, ctx: RouteContext<'/api/highlights/[id]'>) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return error('not found', 404);
  const [h] = await sql<{ meeting_id: string }[]>`select meeting_id from highlights where id = ${id}`;
  if (!h) return error('not found', 404);
  const { access } = await meetingAccess(h.meeting_id);
  if (access !== 'write') return forbidden(access);
  await sql`delete from highlights where id = ${id}`;
  return json({ ok: true });
}
