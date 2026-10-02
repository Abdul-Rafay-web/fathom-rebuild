import { claim, complete, fail } from './queue';
import { RUNNERS } from './steps';

/**
 * Drain runnable jobs until the queue is empty or the time budget is spent.
 * Safe to call from many places at once (upload completion, status polls,
 * scripts): SKIP LOCKED guarantees each job runs in exactly one worker.
 */
export async function runJobs({ budgetMs = 240_000, meetingId }: { budgetMs?: number; meetingId?: string } = {}) {
  const deadline = Date.now() + budgetMs;
  const ran: { step: string; ok: boolean; ms: number; error?: string }[] = [];
  while (Date.now() < deadline) {
    const job = await claim(meetingId);
    if (!job) break;
    const t0 = Date.now();
    try {
      await RUNNERS[job.step](job.meeting_id);
      await complete(job, t0);
      ran.push({ step: job.step, ok: true, ms: Date.now() - t0 });
    } catch (e) {
      await fail(job, e, t0);
      ran.push({ step: job.step, ok: false, ms: Date.now() - t0, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return ran;
}
