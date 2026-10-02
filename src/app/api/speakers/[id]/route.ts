import { z } from 'zod';
import { sql } from '@/lib/db';
import { body, error, isUuid, json } from '@/lib/api';
import { enqueue } from '@/lib/pipeline/queue';
import { forbidden, meetingAccess } from '@/lib/auth';

const Rename = z.object({ name: z.string().trim().min(1).max(80) });

/** Rename a speaker everywhere: transcript, action-item owners, and (re-queued) the search index. */
export async function PATCH(req: Request, ctx: RouteContext<'/api/speakers/[id]'>) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return error('not found', 404);
  const [sp] = await sql<{ meeting_id: string }[]>`select meeting_id from speakers where id = ${id}`;
  if (!sp) return error('not found', 404);
  const { access } = await meetingAccess(sp.meeting_id);
  if (access !== 'write') return forbidden(access);
  const b = await body(req, Rename);
  if (b instanceof Response) return b;
  const res = await sql.begin(async (tx) => {
    const [s] = await tx<{ meeting_id: string; display_name: string }[]>`
      update speakers set display_name = ${b.name}, name_confidence = null
      where id = ${id} returning meeting_id, display_name`;
    if (!s) return null;
    await tx`update action_items set owner_name = ${b.name} where owner_speaker_id = ${id}`;
    // Chunk text embeds speaker names: rebuild this meeting's index in the background.
    await tx`delete from jobs where meeting_id = ${s.meeting_id} and step = 'index'`;
    return s;
  });
  if (!res) return error('not found', 404);
  await enqueue(res.meeting_id, ['index']);
  return json({ id, name: res.display_name });
}
