'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { clock } from '@/lib/format';
import { AskBox, renderSnippet } from './AskBox';
import { cx, Segmented } from './ui';

type Hit = {
  chunk_id: number; meeting_id: string; meeting_title: string; started_at: string;
  moment_ms: number; speakers: string[]; snippet: string; score: number; kw: boolean; sem: boolean;
};

const EXAMPLES = ['offline sync', 'who owns the hiring plan', 'Harbor Logistics security review', 'pricing change renewals', 'what went wrong in release 3.8'];

export function SearchView({ initialQ, initialAsk }: { initialQ: string; initialAsk: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<'search' | 'ask'>(initialAsk ? 'ask' : 'search');
  const [q, setQ] = useState(initialQ);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const seq = useRef(0);

  // Debounced search-as-you-type; a sequence number drops out-of-order responses.
  useEffect(() => {
    if (mode !== 'search') return;
    const query = q.trim();
    if (query.length < 2) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const j = await r.json();
        if (my !== seq.current) return;
        setHits(j.hits);
        setMs(j.ms);
        router.replace(`/search?q=${encodeURIComponent(query)}`, { scroll: false });
      } finally {
        if (my === seq.current) setBusy(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [q, mode, router]);

  // Below 2 characters nothing is shown, whatever the last response was.
  const shown = q.trim().length >= 2 ? hits : null;
  // Group hits by meeting, keeping rank order.
  const groups: { id: string; title: string; date: string; hits: Hit[] }[] = [];
  for (const h of shown ?? []) {
    let g = groups.find((x) => x.id === h.meeting_id);
    if (!g) groups.push((g = { id: h.meeting_id, title: h.meeting_title, date: h.started_at, hits: [] }));
    g.hits.push(h);
  }

  return (
    <div className="mx-auto max-w-[860px] px-5 pt-10 pb-24 sm:px-8 lg:pt-14">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-[46px] leading-[1.02] sm:text-[56px]">{mode === 'search' ? 'Search' : 'Ask'}</h1>
        <Segmented value={mode} onChange={setMode} options={[{ value: 'search', label: 'Find moments' }, { value: 'ask', label: 'Ask a question' }]} />
      </div>

      {mode === 'ask' ? (
        <>
          <p className="mb-6 max-w-[62ch] text-[13.5px] text-ink-3">
            Answers come only from your meetings, and every claim cites the moment it came from. If it isn’t in a meeting, it says so.
          </p>
          <AskBox
            autoAsk={initialAsk ? initialQ : undefined}
            suggestions={['What did we decide about SSO?', 'What does Lena own right now?', 'Why did release 3.8 break offline notes?', 'What does Harbor Logistics need before they buy?']}
          />
        </>
      ) : (
        <>
          <div className="relative">
            <Search size={17} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Words, names, or what it was about…"
              className="h-13 w-full rounded-xl border border-rule-2 bg-card pr-12 pl-11 text-[16px] outline-none placeholder:text-ink-3 focus:border-accent"
            />
            {busy && <Loader2 size={16} className="absolute top-1/2 right-4 -translate-y-1/2 animate-spin text-ink-3" />}
          </div>
          <p className="mt-2.5 text-[12px] text-ink-3">
            Hybrid search: exact keywords and meaning, fused by rank. Results are moments you can play, not just meetings.
            {ms != null && shown && <span className="tnum"> · {shown.length} moments in {ms} ms</span>}
          </p>

          {!shown && (
            <div className="mt-8 flex flex-wrap gap-2">
              {EXAMPLES.map((e) => (
                <button key={e} onClick={() => setQ(e)} className="rounded-full border border-rule bg-card px-3 py-1.5 text-[12.5px] text-ink-2 hover:border-accent hover:text-ink">{e}</button>
              ))}
            </div>
          )}

          {shown && shown.length === 0 && !busy && (
            <p className="mt-10 text-center font-serif text-[18px] text-ink-3">Nothing matches “{q}”. Try the words people would have said.</p>
          )}

          <div className="mt-8 space-y-10">
            {groups.map((g) => (
              <section key={g.id}>
                <h2 className="mb-3 flex items-baseline gap-3 border-b border-rule pb-2">
                  <Link href={`/m/${g.id}`} className="font-display text-[20px] hover:text-accent-ink">{g.title}</Link>
                  <span className="text-[12px] text-ink-3">{new Date(g.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </h2>
                <ul className="space-y-1">
                  {g.hits.map((h) => (
                    <li key={h.chunk_id}>
                      <Link href={`/m/${h.meeting_id}?t=${h.moment_ms}`} className="group -mx-3 grid grid-cols-[56px_1fr] gap-3 rounded-lg px-3 py-2.5 hover:bg-card">
                        <span className="pt-[3px] font-mono text-[11.5px] text-accent tnum">{clock(h.moment_ms)}</span>
                        <div className="min-w-0">
                          <p className="font-serif text-[15.5px] leading-[1.55] text-ink-2">{renderSnippet(h.snippet)}</p>
                          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-ink-3">
                            <span>{h.speakers.join(', ')}</span>
                            <span className={cx('rounded px-1.5 py-px', h.kw && h.sem ? 'bg-accent-wash text-accent-ink' : 'bg-paper-2')}>
                              {h.kw && h.sem ? 'words + meaning' : h.kw ? 'words' : 'meaning'}
                            </span>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
