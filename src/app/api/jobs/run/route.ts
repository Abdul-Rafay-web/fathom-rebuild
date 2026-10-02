import { after } from 'next/server';
import { sql } from '@/lib/db';
import { isUuid, json } from '@/lib/api';
import { runJobs } from '@/lib/pipeline/runner';

export const maxDuration = 300;

/**
 * Kick the worker. Called by clients watching a processing meeting, and safe to
 * call any number of times: claims use SKIP LOCKED, so extra invocations find
 * nothing to do. Only spawns work when a runnable job exists and none is running.
 */
export async function POST(req: Request) {
  const meetingId = new URL(req.url).searchParams.get('meeting') ?? undefined;
  if (meetingId && !isUuid(meetingId)) return json({ started: false });
  const [q] = await sql<{ runnable: number; running: number }[]>`
    select count(*) filter (where status = 'queued' and run_after <= now())::int as runnable,
           count(*) filter (where status = 'running' and locked_at > now() - interval '6 minutes')::int as running
    from jobs ${meetingId ? sql`where meeting_id = ${meetingId}` : sql``}`;
  if (q.runnable === 0 || q.running > 0) return json({ started: false, ...q });
  after(() => runJobs({ meetingId, budgetMs: 280_000 }));
  return json({ started: true, ...q }, 202);
}
