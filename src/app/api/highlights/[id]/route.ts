import { sql } from '@/lib/db';
import { error, isUuid, json } from '@/lib/api';

export async function DELETE(_req: Request, ctx: RouteContext<'/api/highlights/[id]'>) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return error('not found', 404);
  await sql`delete from highlights where id = ${id}`;
  return json({ ok: true });
}
