'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Sparkles } from 'lucide-react';
import { clock } from '@/lib/format';
import { cx } from './ui';

type Source = { n: number; meeting_id: string; meeting_title: string; moment_ms: number; speakers: string[]; snippet: string };
type Answer = { q: string; answer: string; answerable: boolean; sources: Source[] };

/**
 * Ask questions of one meeting (meetingId) or all of them. Citations [S#] are
 * rendered as chips: within a meeting they seek the player; across meetings
 * they deep-link to the moment.
 */
export function AskBox({
  meetingId, suggestions, onSeek, autoAsk,
}: { meetingId?: string; suggestions: string[]; onSeek?: (ms: number) => void; autoAsk?: string }) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<Answer[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const asked = useRef<string | null>(null);

  const run = async (question: string) => {
    const text = question.trim();
    if (text.length < 2 || busy) return;
    setBusy(true);
    setErr(null);
    setQ('');
    try {
      const r = await fetch('/api/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: text, meetingId }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setThread((t) => [{ q: text, ...j }, ...t]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong');
      setQ(text);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (autoAsk && asked.current !== autoAsk) { asked.current = autoAsk; run(autoAsk); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoAsk]);

  return (
    <div>
      <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="relative">
        <Sparkles size={15} className="absolute top-1/2 left-3.5 -translate-y-1/2 text-accent" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={meetingId ? 'Ask about this meeting…' : 'Ask across all your meetings…'}
          className="h-12 w-full rounded-xl border border-rule-2 bg-card pr-12 pl-10 text-[14.5px] shadow-[0_1px_2px_rgb(0_0_0/0.04)] outline-none placeholder:text-ink-3 focus:border-accent"
        />
        <button type="submit" disabled={busy || q.trim().length < 2} aria-label="Ask" className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg bg-accent text-paper disabled:opacity-40">
          {busy ? <Loader2 size={15} className="animate-spin" /> : <ArrowUp size={15} />}
        </button>
      </form>

      {thread.length === 0 && !busy && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => run(s)} className="rounded-full border border-rule bg-card px-3 py-1.5 text-[12.5px] text-ink-2 transition-colors hover:border-accent hover:text-ink">
              {s}
            </button>
          ))}
        </div>
      )}
      {err && <p className="mt-3 text-[13px] text-danger">{err}</p>}

      <div className="mt-6 space-y-8">
        {busy && (
          <div className="space-y-2" aria-busy>
            <div className="skeleton h-4 w-2/3" />
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-5/6" />
          </div>
        )}
        {thread.map((a, i) => (
          <article key={i}>
            <p className="mb-2 text-[13px] text-ink-3">{a.q}</p>
            <div className={cx('prose-read whitespace-pre-line', !a.answerable && 'text-ink-2')}>
              {renderCitations(a.answer, a.sources, meetingId, onSeek)}
            </div>
            {a.sources.length > 0 && (
              <ol className="mt-4 space-y-2 border-l-2 border-rule pl-4">
                {a.sources.map((s) => (
                  <li key={s.n} className="text-[13px]">
                    <SourceLink s={s} meetingId={meetingId} onSeek={onSeek}>
                      <span className="font-mono text-[11px] text-accent">S{s.n}</span>{' '}
                      {!meetingId && <span className="text-ink-2">{s.meeting_title} · </span>}
                      <span className="font-mono text-[11px] text-ink-3">{clock(s.moment_ms)}</span>
                      <span className="mt-0.5 block font-serif text-[14px] leading-snug text-ink-3">{renderSnippet(s.snippet)}</span>
                    </SourceLink>
                  </li>
                ))}
              </ol>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function SourceLink({ s, meetingId, onSeek, children, inline }: { s: Source; meetingId?: string; onSeek?: (ms: number) => void; children: React.ReactNode; inline?: boolean }) {
  const cls = inline ? 'inline' : 'block text-left hover:text-ink';
  if (meetingId && onSeek && s.meeting_id === meetingId) {
    return <button onClick={() => onSeek(s.moment_ms)} className={cls}>{children}</button>;
  }
  return <Link href={`/m/${s.meeting_id}?t=${s.moment_ms}`} className={cls}>{children}</Link>;
}

function renderCitations(text: string, sources: Source[], meetingId?: string, onSeek?: (ms: number) => void) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  return text.split(/(\[S\d+\])/g).map((part, i) => {
    const m = part.match(/^\[S(\d+)\]$/);
    const s = m ? byN.get(Number(m[1])) : undefined;
    if (!s) return <span key={i}>{part}</span>;
    return (
      <SourceLink key={i} s={s} meetingId={meetingId} onSeek={onSeek} inline>
        <sup className="mx-0.5 inline-block rounded bg-accent-wash px-1 font-mono text-[10.5px] text-accent-ink">S{s.n}</sup>
      </SourceLink>
    );
  });
}

/** ts_headline marks matches with «»; render them as highlighter strokes. */
export function renderSnippet(s: string) {
  return s.split(/(«[^»]*»)/g).map((p, i) =>
    p.startsWith('«') ? <span key={i} className="marker text-ink-2">{p.slice(1, -1)}</span> : <span key={i}>{p}</span>,
  );
}
