import { after } from 'next/server';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { body, error, isUuid, json } from '@/lib/api';
import { storageAdmin } from '@/lib/storage';
import { enqueue, syncMeetingStatus } from '@/lib/pipeline/queue';
import { runJobs } from '@/lib/pipeline/runner';
import { forbidden, meetingAccess } from '@/lib/auth';

export const maxDuration = 300;

const Complete = z.object({
  highlights: z.array(z.object({ start_ms: z.number().int().min(0), end_ms: z.number().int().min(0) })).max(200).default([]),
  duration_ms: z.number().int().min(0).optional(),
});

/** Step 2: the browser finished uploading. Verify the object exists, then start the pipeline. */
export async function POST(req: Request, ctx: RouteContext<'/api/uploads/[id]/complete'>) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return error('bad id', 404);
  const { access } = await meetingAccess(id);
  if (access !== 'write') return forbidden(access);
  const b = await body(req, Complete);
  if (b instanceof Response) return b;

  const [m] = await sql<{ media_path: string | null; status: string }[]>`select media_path, status from meetings where id = ${id}`;
  if (!m?.media_path) return error('meeting not found', 404);
  if (m.status === 'recording') {
    const dir = m.media_path.split('/').slice(0, -1).join('/');
    const { data } = await storageAdmin().list(dir);
    if (!data?.some((f) => m.media_path!.endsWith(f.name))) return error('upload not found in storage', 409);
    await sql.begin(async (tx) => {
      await tx`update meetings set status = 'uploaded', duration_ms = ${b.duration_ms ?? 0} where id = ${id} and status = 'recording'`;
      if (b.highlights.length) {
        await tx`insert into highlights ${tx(b.highlights.map((h) => ({
          meeting_id: id, start_ms: h.start_ms, end_ms: Math.max(h.end_ms, h.start_ms + 1000), created_live: true,
        })))}`;
      }
    });
    await enqueue(id, ['transcribe']);
    await syncMeetingStatus(id);
  }
  // Process in the background; the response returns immediately.
  after(() => runJobs({ meetingId: id, budgetMs: 280_000 }));
  return json({ ok: true, meetingId: id });
}
