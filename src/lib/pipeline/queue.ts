// A durable job queue in Postgres.
//
// Claiming uses FOR UPDATE SKIP LOCKED: concurrent workers (several serverless
// invocations at once) each lock a different row and never block on each
// other or process the same job twice. Completing a step and enqueuing its
// successors happen in one transaction, so a crash can't leave the DAG half-advanced.
// A job whose worker died (lock older than the visibility timeout) is reclaimed,
// like an SQS visibility timeout.
import { sql } from '../db';

export const STEPS = ['transcribe', 'name_speakers', 'stats', 'analyse', 'index'] as const;
export type Step = (typeof STEPS)[number];

// The pipeline DAG. Speaker names feed both analysis (owners) and the index
// (chunk text carries names); stats only needs the raw transcript.
export const NEXT: Record<Step, Step[]> = {
  transcribe: ['name_speakers', 'stats'],
  name_speakers: ['analyse', 'index'],
  stats: [],
  analyse: [],
  index: [],
};

export type Job = { id: number; meeting_id: string; step: Step; attempts: number; max_attempts: number };

const VISIBILITY_TIMEOUT = '6 minutes';

export async function enqueue(meetingId: string, steps: Step[] = ['transcribe']) {
  if (!steps.length) return;
  await sql`
    insert into jobs ${sql(steps.map((step) => ({ meeting_id: meetingId, step })))}
    on conflict (meeting_id, step) do nothing`;
}

/** Re-run a meeting's pipeline from scratch (e.g. after a prompt change). */
export async function reset(meetingId: string, from: Step = 'transcribe') {
  await sql.begin(async (tx) => {
    await tx`delete from jobs where meeting_id = ${meetingId}`;
    await tx`insert into jobs (meeting_id, step) values (${meetingId}, ${from})`;
    await tx`update meetings set status = 'uploaded', error = null where id = ${meetingId}`;
  });
}

export async function claim(meetingId?: string): Promise<Job | null> {
  // Reap jobs whose worker vanished. Kept separate from the claim so the claim
  // query can use the partial index on queued jobs.
  await sql`
    update jobs set status = 'queued', locked_at = null
    where status = 'running' and locked_at < now() - ${VISIBILITY_TIMEOUT}::interval`;
  const rows = await sql<Job[]>`
    with next as (
      select id from jobs
      where status = 'queued' and run_after <= now()
        ${meetingId ? sql`and meeting_id = ${meetingId}` : sql``}
      order by run_after
      for update skip locked
      limit 1
    )
    update jobs j
       set status = 'running', locked_at = now(), started_at = now(), attempts = j.attempts + 1
      from next
     where j.id = next.id
    returning j.id, j.meeting_id, j.step, j.attempts, j.max_attempts`;
  return rows[0] ?? null;
}

export async function complete(job: Job, startedAt: number) {
  await sql.begin(async (tx) => {
    await tx`
      update jobs set status = 'done', finished_at = now(), locked_at = null,
             duration_ms = ${Date.now() - startedAt}, error = null
      where id = ${job.id}`;
    const next = NEXT[job.step];
    if (next.length) {
      await tx`
        insert into jobs ${tx(next.map((step) => ({ meeting_id: job.meeting_id, step })))}
        on conflict (meeting_id, step) do nothing`;
    }
  });
  await syncMeetingStatus(job.meeting_id);
}

export async function fail(job: Job, err: unknown, startedAt: number) {
  const msg = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
  const final = job.attempts >= job.max_attempts;
  // Exponential backoff between attempts: 20s, 40s, 80s...
  const delay = `${20 * 2 ** (job.attempts - 1)} seconds`;
  await sql`
    update jobs set
      status = ${final ? 'failed' : 'queued'},
      run_after = now() + ${delay}::interval,
      locked_at = null, error = ${msg}, duration_ms = ${Date.now() - startedAt}
    where id = ${job.id}`;
  await syncMeetingStatus(job.meeting_id);
}

/** Derive the meeting's user-facing status from its jobs. */
export async function syncMeetingStatus(meetingId: string) {
  const jobs = await sql<{ step: Step; status: string; error: string | null }[]>`
    select step, status, error from jobs where meeting_id = ${meetingId}`;
  const st = new Map(jobs.map((j) => [j.step, j]));
  const done = (s: Step) => st.get(s)?.status === 'done';
  const failed = jobs.find((j) => j.status === 'failed');
  const status = failed
    ? 'failed'
    : STEPS.every(done)
      ? 'ready'
      : !done('transcribe')
        ? 'transcribing'
        : !done('analyse') || !done('name_speakers')
          ? 'analysing'
          : 'indexing';
  await sql`
    update meetings set status = ${status}, error = ${failed ? `${failed.step}: ${failed.error}` : null}
    where id = ${meetingId} and status <> ${status}`;
}
