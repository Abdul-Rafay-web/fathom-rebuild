'use client';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { lastStartAtOrBefore } from '@/lib/algo/bsearch';
import { clock, duration } from '@/lib/format';
import type { SpeakerRow, Utterance } from '@/lib/queries';
import { PlayerStore, usePlayer } from './meeting/player';
import { AvatarStack, cx } from './ui';

type Clip = { title: string; start_ms: number; end_ms: number; meeting_title: string; started_at: string; views: number; media_mime: string | null };

export function ClipView({ clip, speakers, utterances, mediaUrl }: { clip: Clip; speakers: SpeakerRow[]; utterances: Utterance[]; mediaUrl: string }) {
  const [store] = useState(() => {
    const s = new PlayerStore(clip.end_ms);
    s.bounds = [clip.start_ms, clip.end_ms];
    s.time = clip.start_ms;
    return s;
  });
  const attach = useCallback((el: HTMLMediaElement | null) => store.attach(el), [store]);
  const playing = usePlayer(store, (s) => s.playing);
  const t = usePlayer(store, (s) => Math.floor(s.time / 250) * 250);
  const starts = useMemo(() => utterances.map((u) => u.start_ms), [utterances]);
  const active = lastStartAtOrBefore(starts, t + 120);
  const byId = useMemo(() => new Map(speakers.map((s) => [s.id, s])), [speakers]);
  const len = clip.end_ms - clip.start_ms;
  const progress = Math.min(1, Math.max(0, (t - clip.start_ms) / len));
  const people = [...new Set(utterances.map((u) => u.speaker_id))].map((id) => byId.get(id ?? '')).filter(Boolean) as SpeakerRow[];
  const isVideo = clip.media_mime?.startsWith('video/');

  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-[760px] items-center justify-between px-5 pt-6">
        <Link href="/" className="font-serif text-[20px]">Afterword<span className="text-mark">.</span></Link>
        <span className="text-[12px] text-ink-3">Shared clip · no sign-in needed</span>
      </header>

      <main className="mx-auto max-w-[760px] px-5 pt-14 pb-24">
        <p className="text-[12.5px] text-ink-3">
          From <span className="text-ink-2">{clip.meeting_title}</span> · {new Date(clip.started_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · at {clock(clip.start_ms)}
        </p>
        <h1 className="mt-2 font-serif text-[34px] leading-[1.15] tracking-[-0.015em] text-balance sm:text-[42px]">{clip.title}</h1>

        <div className="mt-8 rounded-2xl border border-rule bg-card p-5 shadow-lift">
          {isVideo ? (
            <video ref={attach} src={`${mediaUrl}#t=${clip.start_ms / 1000}`} preload="metadata" playsInline className="mb-4 aspect-video w-full rounded-lg bg-sunk" />
          ) : (
            <audio ref={attach} src={`${mediaUrl}#t=${clip.start_ms / 1000}`} preload="metadata" />
          )}
          <div className="flex items-center gap-4">
            <button onClick={() => store.toggle()} aria-label={playing ? 'Pause' : 'Play'} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink text-paper transition-transform hover:scale-105">
              {playing ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" className="ml-0.5" />}
            </button>
            <div className="flex-1">
              <div
                className="relative h-2 cursor-pointer rounded-full bg-paper-2"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  store.seek(clip.start_ms + ((e.clientX - r.left) / r.width) * len, true);
                }}
              >
                <div className="absolute inset-y-0 left-0 rounded-full bg-accent" style={{ width: `${progress * 100}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[11.5px] text-ink-3 tnum">
                <span>{clock(Math.max(0, t - clip.start_ms))}</span>
                <span>{duration(len)}</span>
              </div>
            </div>
            {people.length > 0 && <AvatarStack people={people.map((p) => ({ name: p.display_name, color: p.color }))} size={26} />}
          </div>
        </div>

        <ol className="mt-10 space-y-4">
          {utterances.map((u, i) => {
            const sp = u.speaker_id ? byId.get(u.speaker_id) : undefined;
            const newSpeaker = i === 0 || utterances[i - 1].speaker_id !== u.speaker_id;
            return (
              <li key={u.id}>
                {newSpeaker && <div className="mb-1 text-[12.5px] font-medium" style={{ color: sp?.color }}>{sp?.display_name}</div>}
                <button
                  onClick={() => store.seek(Math.max(u.start_ms, clip.start_ms), true)}
                  className={cx('text-left font-serif text-[18px] leading-[1.6] transition-colors', i === active ? 'text-ink' : 'text-ink-3 hover:text-ink-2')}
                >
                  {u.text}
                </button>
              </li>
            );
          })}
        </ol>

        <footer className="mt-16 border-t border-rule pt-6 text-[13px] text-ink-3">
          Notes like these, for every meeting, with every line linked to the moment it was said.{' '}
          <Link href="/" className="text-accent underline underline-offset-4">See the workspace →</Link>
        </footer>
      </main>
    </div>
  );
}
