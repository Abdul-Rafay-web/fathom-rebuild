'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2 } from 'lucide-react';
import type { JobRow } from '@/lib/queries';
import { cx } from '../ui';

const STEPS = [
  { step: 'transcribe', label: 'Transcribing', detail: 'Speech to text, separating each voice' },
  { step: 'name_speakers', label: 'Identifying speakers', detail: 'Matching voices to names from introductions' },
  { step: 'stats', label: 'Measuring the conversation', detail: 'Talk time, cut-ins, monologues' },
  { step: 'analyse', label: 'Writing grounded notes', detail: 'Summary, decisions and action items, each tied to a quote' },
  { step: 'index', label: 'Indexing for search', detail: 'Keyword and semantic indexes' },
];

/** Live pipeline progress. Polls the job table and nudges the worker; refreshes the page when done. */
export function Processing({ meetingId, status, error, jobs: initial }: { meetingId: string; status: string; error: string | null; jobs: JobRow[] }) {
  const router = useRouter();
  const [jobs, setJobs] = useState(initial);
  const [st, setSt] = useState(status);
  const [err, setErr] = useState(error);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    let alive = true;
    let n = 0;
    const poll = async () => {
      if (n++ % 4 === 0) fetch(`/api/jobs/run?meeting=${meetingId}`, { method: 'POST' }).catch(() => {});
      const r = await fetch(`/api/meetings/${meetingId}`).then((r) => r.json()).catch(() => null);
      if (!alive || !r) return;
      setJobs(r.jobs);
      setSt(r.status);
      setErr(r.error);
      if (r.status === 'ready') router.refresh();
    };
    poll();
    const id = setInterval(poll, 2500);
    const t0 = Date.now();
    const clock = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => { alive = false; clearInterval(id); clearInterval(clock); };
  }, [meetingId, router]);

  const byStep = new Map(jobs.map((j) => [j.step, j]));

  return (
    <div className="mt-10 max-w-[520px]">
      <h2 className="font-serif text-[24px]">{st === 'failed' ? 'Processing hit a problem' : st === 'recording' ? 'Waiting for the upload' : 'Working on your notes'}</h2>
      <p className="mt-1.5 text-[13.5px] text-ink-3">
        {st === 'failed'
          ? 'One step failed after several retries. The details are below.'
          : `An hour of audio usually takes about two minutes. You can leave this page; it carries on without you.${elapsed > 3 ? ` (${elapsed}s)` : ''}`}
      </p>
      <ol className="mt-7 space-y-4">
        {STEPS.map((s) => {
          const j = byStep.get(s.step);
          const state = j?.status ?? 'waiting';
          return (
            <li key={s.step} className="flex gap-3.5">
              <span className={cx('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                state === 'done' ? 'border-accent bg-accent text-paper' : state === 'running' ? 'border-accent text-accent' : state === 'failed' ? 'border-danger text-danger' : 'border-rule-2 text-ink-3')}>
                {state === 'done' ? <Check size={12} /> : state === 'running' ? <Loader2 size={12} className="animate-spin" /> : state === 'failed' ? <AlertTriangle size={11} /> : null}
              </span>
              <div>
                <div className={cx('text-[14px]', state === 'waiting' || state === 'queued' ? 'text-ink-3' : 'text-ink')}>
                  {s.label}
                  {j?.duration_ms != null && state === 'done' && <span className="ml-2 font-mono text-[11px] text-ink-3">{(j.duration_ms / 1000).toFixed(1)}s</span>}
                  {j && j.attempts > 1 && state !== 'done' && <span className="ml-2 text-[11.5px] text-ink-3">retry {j.attempts - 1}</span>}
                </div>
                <div className="text-[12.5px] text-ink-3">{state === 'failed' ? j?.error : s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
      {err && st === 'failed' && <p className="mt-6 rounded-lg bg-danger/8 p-3 font-mono text-[12px] text-danger">{err}</p>}
    </div>
  );
}
