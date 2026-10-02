'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Check, Copy, Link2, Pause, Play, RotateCcw, RotateCw, Scissors, X } from 'lucide-react';
import { lastStartAtOrBefore } from '@/lib/algo/bsearch';
import { clock, duration as fmtDuration } from '@/lib/format';
import type { ActionItem, Clip, Highlight, MeetingData, SpeakerRow } from '@/lib/queries';
import { AskBox } from '../AskBox';
import { toast } from '../toast';
import { Avatar, AvatarStack, Button, cx, Kbd } from '../ui';
import { Dynamics } from './Dynamics';
import { Notes } from './Notes';
import { PlayerStore, usePlayer } from './player';
import { Processing } from './Processing';
import { Timeline, type Range } from './Timeline';
import { Transcript, type TranscriptHandle } from './Transcript';

type Tab = 'notes' | 'dynamics' | 'ask';

export function Workspace({ data, mediaUrl, initialT }: { data: MeetingData; mediaUrl: string | null; initialT: number | null }) {
  const { meeting } = data;
  const dur = Math.max(meeting.duration_ms, data.utterances.at(-1)?.end_ms ?? 0, 1);
  const [store] = useState(() => new PlayerStore(dur));
  const [speakers, setSpeakers] = useState<SpeakerRow[]>(data.speakers);
  const [actions, setActions] = useState<ActionItem[]>(data.actions);
  const [highlights, setHighlights] = useState<Highlight[]>(data.highlights);
  const [clips, setClips] = useState<Clip[]>(data.clips);
  const [selection, setSelection] = useState<Range | null>(null);
  const [tab, setTab] = useState<Tab>('notes');
  const [mobilePane, setMobilePane] = useState<'notes' | 'transcript'>('notes');
  const transcript = useRef<TranscriptHandle>(null);
  const media = useRef<HTMLMediaElement | null>(null);

  const speakerMap = useMemo(() => new Map(speakers.map((s) => [s.id, s])), [speakers]);
  const starts = useMemo(() => data.utterances.map((u) => u.start_ms), [data.utterances]);
  const chapters = data.insight?.content.chapters ?? [];
  const isVideo = meeting.media_mime?.startsWith('video/') ?? false;
  const ready = meeting.status === 'ready' || !!data.insight;

  const attach = useCallback((el: HTMLMediaElement | null) => {
    media.current = el;
    store.attach(el);
  }, [store]);

  useEffect(() => {
    if (initialT != null) {
      store.seek(initialT);
      requestAnimationFrame(() => transcript.current?.reveal(initialT));
    }
  }, [initialT, store]);

  const play = useCallback((ms: number) => {
    store.seek(ms, true);
    transcript.current?.reveal(ms);
    setMobilePane('transcript');
  }, [store]);

  const addHighlight = useCallback(async () => {
    const t = store.time;
    const h = { start_ms: Math.max(0, t - 12_000), end_ms: Math.max(t, 1000) };
    const r = await fetch('/api/highlights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meetingId: meeting.id, ...h }) });
    if (!r.ok) return toast('Couldn’t save highlight', 'error');
    const row: Highlight = await r.json();
    setHighlights((xs) => [...xs, row].sort((a, b) => a.start_ms - b.start_ms));
    toast(`Highlighted ${clock(h.start_ms)}–${clock(h.end_ms)}`);
  }, [meeting.id, store]);

  const deleteHighlight = useCallback(async (id: string) => {
    setHighlights((xs) => xs.filter((h) => h.id !== id));
    await fetch(`/api/highlights/${id}`, { method: 'DELETE' });
  }, []);

  // Keyboard: the player is the document's primary object.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, [contenteditable="true"]') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === ' ' || k === 'k') { e.preventDefault(); store.toggle(); }
      else if (k === 'j') store.skip(-10_000);
      else if (k === 'l') store.skip(10_000);
      else if (k === 'arrowleft') { e.preventDefault(); store.skip(-5_000); }
      else if (k === 'arrowright') { e.preventDefault(); store.skip(5_000); }
      else if (k === 'h') addHighlight();
      else if (k === '/') { e.preventDefault(); transcript.current?.focusSearch(); }
      else if (k === 'escape') setSelection(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store, addHighlight]);

  const createClip = async () => {
    if (!selection) return;
    const i = Math.max(0, lastStartAtOrBefore(starts, selection.start_ms));
    const first = data.utterances[i]?.text ?? meeting.title;
    const title = first.split(/\s+/).slice(0, 9).join(' ').replace(/[,.;:]$/, '') + (first.split(/\s+/).length > 9 ? '…' : '');
    const r = await fetch('/api/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetingId: meeting.id, start_ms: selection.start_ms, end_ms: selection.end_ms, title }),
    });
    const j = await r.json();
    if (!r.ok) return toast(j.error ?? 'Couldn’t create clip', 'error');
    setClips((c) => [j, ...c]);
    const url = `${location.origin}/c/${j.share_token}`;
    try { await navigator.clipboard.writeText(url); toast('Clip link copied. Anyone with it can watch, no sign-in.'); }
    catch { toast(url); }
    setSelection(null);
  };

  const copyNotes = async () => {
    const md = notesMarkdown(data, speakers, actions, location.origin);
    await navigator.clipboard.writeText(md);
    toast('Notes copied as Markdown, with timestamp links');
  };

  const rename = (id: string, name: string) => {
    setSpeakers((xs) => xs.map((s) => (s.id === id ? { ...s, display_name: name, name_confidence: null } : s)));
    setActions((xs) => xs.map((a) => (a.owner_speaker_id === id ? { ...a, owner_name: name } : a)));
  };

  const started = new Date(meeting.started_at);

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.9fr)]">
      {/* ------------------------------------------------ left: the document */}
      <div className={cx('min-w-0 px-5 pt-8 pb-32 sm:px-8 lg:px-12 lg:pt-10', mobilePane === 'transcript' && 'hidden lg:block')}>
        <Link href="/" className="mb-6 inline-flex items-center gap-1.5 text-[12.5px] text-ink-3 hover:text-ink">
          <ArrowLeft size={13} /> Meetings
        </Link>
        <EditableTitle id={meeting.id} initial={meeting.title} />
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-ink-3 tnum">
          <span>{started.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })} · {started.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
          <span>{fmtDuration(dur)}</span>
          {speakers.length > 0 && <AvatarStack people={speakers.map((s) => ({ name: s.display_name, color: s.color }))} max={8} size={22} />}
        </div>
        {meeting.gist && <p className="prose-read mt-5 max-w-[64ch] text-[18px] leading-relaxed text-ink-2">{meeting.gist}</p>}

        {ready && (
          <div className="sticky top-14 z-20 -mx-2 mt-8 mb-8 flex items-center justify-between gap-3 border-b border-rule bg-paper/92 px-2 py-2 backdrop-blur lg:top-0">
            <div className="flex gap-1">
              {(['notes', 'dynamics', 'ask'] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cx('rounded-lg px-3 py-1.5 text-[13.5px] capitalize transition-colors', tab === t ? 'bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]' : 'text-ink-3 hover:text-ink')}
                >
                  {t === 'dynamics' ? 'Dynamics' : t === 'ask' ? 'Ask' : 'Notes'}
                </button>
              ))}
            </div>
            <Button size="sm" variant="ghost" onClick={copyNotes}><Copy size={13} /> Copy notes</Button>
          </div>
        )}

        {!ready ? (
          <Processing meetingId={meeting.id} status={meeting.status} error={meeting.error} jobs={data.jobs} />
        ) : tab === 'notes' ? (
          <Notes
            meetingId={meeting.id}
            insight={data.insight}
            decisions={data.decisions}
            actions={actions}
            setActions={setActions}
            highlights={highlights}
            onDeleteHighlight={deleteHighlight}
            speakers={speakerMap}
            utterances={data.utterances}
            onPlay={play}
          />
        ) : tab === 'dynamics' ? (
          <Dynamics stats={meeting.stats} speakers={speakers} onRename={rename} onPlay={play} />
        ) : (
          <AskBox
            meetingId={meeting.id}
            onSeek={play}
            suggestions={['What did we decide?', 'What are the risks?', `What does ${speakers[0]?.display_name.split(' ')[0] ?? 'everyone'} own?`, 'What was left unresolved?']}
          />
        )}

        {clips.length > 0 && tab === 'notes' && (
          <section className="mt-10">
            <h3 className="mb-3 text-[11px] tracking-[0.14em] text-ink-3 uppercase">Shared clips</h3>
            <ul className="space-y-1.5">
              {clips.map((c) => (
                <li key={c.id} className="flex items-center gap-3 text-[13.5px]">
                  <Scissors size={13} className="text-ink-3" />
                  <a href={`/c/${c.share_token}`} target="_blank" className="flex-1 truncate text-ink-2 hover:text-ink">{c.title}</a>
                  <span className="font-mono text-[11px] text-ink-3">{clock(c.start_ms)}–{clock(c.end_ms)}</span>
                  <span className="text-[12px] text-ink-3 tnum">{c.views} views</span>
                  <button aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(`${location.origin}/c/${c.share_token}`); toast('Link copied'); }} className="text-ink-3 hover:text-ink"><Link2 size={13} /></button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* ------------------------------------------------ right: the source */}
      <aside className={cx('flex flex-col border-rule bg-card/50 lg:sticky lg:top-0 lg:h-screen lg:border-l', mobilePane === 'notes' ? 'max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-30 max-lg:border-t max-lg:bg-card' : 'max-lg:h-[calc(100dvh-56px)]')}>
        <div className="border-b border-rule px-4 pt-4 pb-6 lg:px-5">
          {mediaUrl ? (
            isVideo ? (
              <video ref={attach} src={mediaUrl} preload="metadata" playsInline className={cx('mb-4 aspect-video w-full rounded-lg bg-sunk', mobilePane === 'notes' && 'max-lg:hidden')} />
            ) : (
              <audio ref={attach} src={mediaUrl} preload="metadata" />
            )
          ) : null}
          <Controls store={store} dur={dur} utterances={data.utterances} starts={starts} speakers={speakerMap} onHighlight={addHighlight} />
          <div className={cx('mt-4', mobilePane === 'notes' && 'max-lg:hidden')}>
            <Timeline
              store={store}
              duration={dur}
              speakers={speakers}
              utterances={data.utterances}
              chapters={chapters}
              highlights={highlights}
              selection={selection}
              onSelect={setSelection}
            />
          </div>
          <button onClick={() => setMobilePane((p) => (p === 'notes' ? 'transcript' : 'notes'))} className="mt-3 w-full rounded-lg border border-rule py-1.5 text-[12.5px] text-ink-2 lg:hidden">
            {mobilePane === 'notes' ? 'Show transcript' : 'Back to notes'}
          </button>
        </div>

        <div className={cx('relative min-h-0 flex-1', mobilePane === 'notes' && 'max-lg:hidden')}>
          {data.utterances.length ? (
            <Transcript ref={transcript} store={store} utterances={data.utterances} speakers={speakerMap} selection={selection} onSelect={setSelection} />
          ) : (
            <div className="p-6 text-[13.5px] text-ink-3">The transcript appears here once transcription finishes.</div>
          )}

          {selection && (
            <div className="absolute inset-x-3 bottom-3 z-20 flex items-center gap-2 rounded-xl border border-rule-2 bg-card px-3 py-2.5 shadow-lift">
              <Scissors size={14} className="text-accent" />
              <span className="flex-1 text-[13px] text-ink-2 tnum">
                {clock(selection.start_ms)}–{clock(selection.end_ms)} <span className="text-ink-3">· {fmtDuration(selection.end_ms - selection.start_ms)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => play(selection.start_ms)}><Play size={12} /> Preview</Button>
              <Button size="sm" variant="primary" onClick={createClip}><Link2 size={12} /> Share clip</Button>
              <button aria-label="Clear selection" onClick={() => setSelection(null)} className="p-1 text-ink-3 hover:text-ink"><X size={14} /></button>
            </div>
          )}
        </div>

        <div className="hidden items-center gap-3 border-t border-rule px-5 py-2 text-[11.5px] text-ink-3 lg:flex">
          <span><Kbd>Space</Kbd> play</span>
          <span><Kbd>J</Kbd><Kbd>L</Kbd> ±10s</span>
          <span><Kbd>H</Kbd> highlight</span>
          <span><Kbd>/</Kbd> find</span>
          <span className="ml-auto">Drag the timeline or shift-click lines to clip</span>
        </div>
      </aside>
    </div>
  );
}

function Controls({
  store, dur, utterances, starts, speakers, onHighlight,
}: {
  store: PlayerStore; dur: number; utterances: MeetingData['utterances']; starts: number[];
  speakers: Map<string, SpeakerRow>; onHighlight: () => void;
}) {
  const playing = usePlayer(store, (s) => s.playing);
  const sec = usePlayer(store, (s) => Math.floor(s.time / 1000));
  const rate = usePlayer(store, (s) => s.rate);
  const idx = usePlayer(store, (s) => lastStartAtOrBefore(starts, s.time + 120));
  const u = idx >= 0 ? utterances[idx] : undefined;
  const now = u && store.time <= u.end_ms + 1500 && u.speaker_id ? speakers.get(u.speaker_id) : undefined;
  const RATES = [1, 1.25, 1.5, 1.75, 2];

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => store.toggle()}
        aria-label={playing ? 'Pause' : 'Play'}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-transform hover:scale-[1.04] active:scale-95"
      >
        {playing ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
      </button>
      <button aria-label="Back 10 seconds" onClick={() => store.skip(-10_000)} className="rounded-md p-1.5 text-ink-3 hover:bg-paper-2 hover:text-ink"><RotateCcw size={15} /></button>
      <button aria-label="Forward 10 seconds" onClick={() => store.skip(10_000)} className="rounded-md p-1.5 text-ink-3 hover:bg-paper-2 hover:text-ink"><RotateCw size={15} /></button>
      <div className="ml-1 font-mono text-[12.5px] text-ink-2 tnum">
        {clock(sec * 1000)} <span className="text-ink-3">/ {clock(dur)}</span>
      </div>
      <div className="mx-2 flex min-w-0 flex-1 items-center gap-2 text-[12.5px] text-ink-3">
        {now && playing && (
          <>
            <Avatar name={now.display_name} color={now.color} size={18} />
            <span className="truncate">{now.display_name}</span>
          </>
        )}
      </div>
      <button
        onClick={() => store.setRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length])}
        className="rounded-md px-2 py-1 font-mono text-[12px] text-ink-2 hover:bg-paper-2"
        aria-label="Playback speed"
      >
        {rate}×
      </button>
      <button onClick={onHighlight} aria-label="Highlight this moment" title="Highlight (H)" className="rounded-md p-1.5 text-ink-3 hover:bg-mark-wash hover:text-ink">
        <Bookmark size={15} />
      </button>
    </div>
  );
}

function EditableTitle({ id, initial }: { id: string; initial: string }) {
  const [title, setTitle] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const save = async (v: string) => {
    setEditing(false);
    const t = v.trim();
    if (!t || t === initial) return setTitle(initial);
    setTitle(t);
    const r = await fetch(`/api/meetings/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: t }) });
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 1500); }
  };
  return editing ? (
    <input
      autoFocus
      defaultValue={title}
      onBlur={(e) => save(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditing(false); }}
      className="w-full rounded-lg bg-card px-2 py-1 -mx-2 font-serif text-[38px] leading-tight tracking-[-0.015em] outline-none ring-1 ring-rule-2"
    />
  ) : (
    <h1 onClick={() => setEditing(true)} title="Click to rename" className="cursor-text font-serif text-[34px] leading-[1.12] tracking-[-0.015em] text-balance sm:text-[40px]">
      {title}
      {saved && <Check size={18} className="ml-2 inline text-ok" />}
    </h1>
  );
}

function notesMarkdown(d: MeetingData, speakers: SpeakerRow[], actions: ActionItem[], origin: string) {
  const link = (ms: number | null) => (ms == null ? '' : ` ([${clock(ms)}](${origin}/m/${d.meeting.id}?t=${ms}))`);
  const L: string[] = [`# ${d.meeting.title}`, '', `${new Date(d.meeting.started_at).toDateString()} · ${speakers.map((s) => s.display_name).join(', ')}`, ''];
  if (d.meeting.gist) L.push(`> ${d.meeting.gist}`, '');
  for (const s of d.insight?.content.sections ?? []) {
    L.push(`## ${s.heading}`);
    for (const p of s.points) L.push(`- ${p.text}${link(p.source_ms)}`);
    L.push('');
  }
  if (d.decisions.length) { L.push('## Decisions'); for (const x of d.decisions) L.push(`- ${x.text}${link(x.source_ms)}`); L.push(''); }
  if (actions.length) {
    L.push('## Action items');
    for (const a of actions) L.push(`- [${a.done ? 'x' : ' '}] **${a.owner_name ?? 'Unassigned'}**: ${a.text}${a.due ? ` (due ${a.due})` : ''}${link(a.source_ms)}`);
  }
  return L.join('\n');
}
