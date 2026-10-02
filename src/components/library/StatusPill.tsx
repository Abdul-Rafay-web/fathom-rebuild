'use client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export const STATUS_LABEL: Record<string, string> = {
  recording: 'Receiving upload',
  uploaded: 'Queued',
  transcribing: 'Transcribing',
  analysing: 'Writing notes',
  indexing: 'Indexing for search',
  failed: 'Needs attention',
};

/** Shown on rows still in the pipeline; nudges the worker and refreshes when done. */
export function StatusPill({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  useEffect(() => {
    if (status === 'ready' || status === 'failed') return;
    const t = setInterval(async () => {
      fetch(`/api/jobs/run?meeting=${id}`, { method: 'POST' }).catch(() => {});
      const r = await fetch(`/api/meetings/${id}`).then((r) => r.json()).catch(() => null);
      if (r && r.status !== status) router.refresh();
    }, 4000);
    return () => clearInterval(t);
  }, [id, status, router]);

  if (status === 'ready') return null;
  const failed = status === 'failed';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] ${failed ? 'bg-danger/10 text-danger' : 'bg-accent-wash text-accent-ink'}`}>
      {!failed && <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />}
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}
