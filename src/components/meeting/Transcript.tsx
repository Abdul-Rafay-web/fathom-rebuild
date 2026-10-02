'use client';
import { useVirtualizer } from '@tanstack/react-virtual';
import { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Crosshair, Play, Search, X } from 'lucide-react';
import { lastStartAtOrBefore } from '@/lib/algo/bsearch';
import { clock } from '@/lib/format';
import type { SpeakerRow, Utterance } from '@/lib/queries';
import { cx } from '../ui';
import { usePlayer, type PlayerStore } from './player';
import type { Range } from './Timeline';

export type TranscriptHandle = { reveal: (ms: number) => void; focusSearch: () => void };

type Props = {
  store: PlayerStore;
  utterances: Utterance[];
  speakers: Map<string, SpeakerRow>;
  selection: Range | null;
  onSelect: (r: Range | null) => void;
};

export const Transcript = forwardRef<TranscriptHandle, Props>(function Transcript({ store, utterances, speakers, selection, onSelect }, ref) {
  const scroller = useRef<HTMLDivElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const starts = useMemo(() => Int32Array.from(utterances, (u) => u.start_ms), [utterances]);
  const active = usePlayer(store, (s) => lastStartAtOrBefore(starts, s.time + 120));
  const playing = usePlayer(store, (s) => s.playing);
  const [following, setFollowing] = useState(true);
  const [flash, setFlash] = useState<{ i: number; n: number } | null>(null);
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const anchor = useRef<number | null>(null);

  const virt = useVirtualizer({
    count: utterances.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 58,
    overscan: 12,
  });

  // Matches for in-meeting search.
  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (needle.length < 2) return [];
    const out: number[] = [];
    utterances.forEach((u, i) => u.text.toLowerCase().includes(needle) && out.push(i));
    return out;
  }, [q, utterances]);

  useEffect(() => {
    if (matches.length) virt.scrollToIndex(matches[Math.min(cursor, matches.length - 1)], { align: 'center' });
  }, [matches, cursor, virt]);

  // Follow the playhead unless the reader has scrolled away.
  useEffect(() => {
    if (following && active >= 0 && !q) virt.scrollToIndex(active, { align: 'center' });
  }, [active, following, q, virt]);

  useImperativeHandle(ref, () => ({
    reveal(ms: number) {
      const i = Math.max(0, lastStartAtOrBefore(starts, ms));
      setFollowing(true);
      virt.scrollToIndex(i, { align: 'center' });
      setFlash({ i, n: Date.now() });
    },
    focusSearch() {
      searchBox.current?.focus();
    },
  }));

  const stopFollowing = () => following && setFollowing(false);

  const selected = (u: Utterance) => selection && u.start_ms >= selection.start_ms && u.end_ms <= selection.end_ms + 1;

  const onLineClick = (i: number, e: React.MouseEvent) => {
    const u = utterances[i];
    if (e.shiftKey && anchor.current != null) {
      const a = utterances[anchor.current];
      onSelect({ start_ms: Math.min(a.start_ms, u.start_ms), end_ms: Math.max(a.end_ms, u.end_ms) });
      return;
    }
    anchor.current = i;
    onSelect(null);
    store.seek(u.start_ms, true);
    setFollowing(true);
  };

  const items = virt.getVirtualItems();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-rule px-4 py-2.5">
        <div className="relative flex-1">
          <Search size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
          <input
            ref={searchBox}
            value={q}
            onChange={(e) => { setQ(e.target.value); setCursor(0); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && matches.length) setCursor((c) => (c + (e.shiftKey ? -1 + matches.length : 1)) % matches.length);
              if (e.key === 'Escape') { setQ(''); (e.target as HTMLInputElement).blur(); }
            }}
            placeholder="Find in transcript"
            className="h-8 w-full rounded-md bg-paper-2 pr-2 pl-8 text-[13px] outline-none placeholder:text-ink-3 focus:bg-card focus:ring-1 focus:ring-rule-2"
          />
        </div>
        {q.trim().length >= 2 && (
          <div className="flex items-center gap-0.5 text-[12px] text-ink-3 tnum">
            <span className="mr-1">{matches.length ? `${Math.min(cursor, matches.length - 1) + 1}/${matches.length}` : '0'}</span>
            <button aria-label="Previous match" className="rounded p-1 hover:bg-paper-2" onClick={() => setCursor((c) => (c - 1 + matches.length) % Math.max(1, matches.length))}><ChevronUp size={14} /></button>
            <button aria-label="Next match" className="rounded p-1 hover:bg-paper-2" onClick={() => setCursor((c) => (c + 1) % Math.max(1, matches.length))}><ChevronDown size={14} /></button>
            <button aria-label="Clear search" className="rounded p-1 hover:bg-paper-2" onClick={() => setQ('')}><X size={14} /></button>
          </div>
        )}
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scroller}
          onWheel={stopFollowing}
          onTouchMove={stopFollowing}
          className="h-full overflow-y-auto overscroll-contain"
        >
          <div className="relative w-full" style={{ height: virt.getTotalSize() }}>
            {items.map((vi) => {
              const i = vi.index;
              const u = utterances[i];
              const sp = u.speaker_id ? speakers.get(u.speaker_id) : undefined;
              const newSpeaker = i === 0 || utterances[i - 1].speaker_id !== u.speaker_id;
              return (
                <div
                  key={vi.key}
                  data-index={i}
                  ref={virt.measureElement}
                  className="absolute left-0 w-full"
                  style={{ transform: `translateY(${vi.start}px)` }}
                >
                  <Line
                    u={u}
                    speaker={sp}
                    showSpeaker={newSpeaker}
                    isActive={i === active}
                    isSelected={!!selected(u)}
                    flashKey={flash?.i === i ? flash.n : 0}
                    query={q.trim().length >= 2 ? q.trim() : ''}
                    onClick={(e) => onLineClick(i, e)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        {!following && playing && (
          <button
            onClick={() => setFollowing(true)}
            className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12.5px] text-paper shadow-lift"
          >
            <Crosshair size={13} /> Follow playback
          </button>
        )}
      </div>
    </div>
  );
});

const Line = memo(function Line({
  u, speaker, showSpeaker, isActive, isSelected, flashKey, query, onClick,
}: {
  u: Utterance; speaker?: SpeakerRow; showSpeaker: boolean; isActive: boolean; isSelected: boolean; flashKey: number; query: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <div className={cx('px-4', showSpeaker ? 'pt-4' : 'pt-0.5')}>
      {showSpeaker && (
        <div className="mb-1 flex items-center gap-2 pl-[52px] text-[12px] font-medium" style={{ color: speaker?.color }}>
          {speaker?.display_name ?? 'Unknown speaker'}
        </div>
      )}
      <div
        key={flashKey}
        onClick={onClick}
        className={cx(
          'group grid cursor-pointer grid-cols-[44px_1fr] gap-2 rounded-lg py-1.5 pr-2 pl-1 transition-colors',
          flashKey ? 'flash' : '',
          isSelected ? 'bg-accent-wash' : isActive ? 'bg-paper-2' : 'hover:bg-paper-2/60',
        )}
      >
        <span className="relative pt-[3px] text-right font-mono text-[11px] text-ink-3 tnum">
          <span className="group-hover:invisible">{clock(u.start_ms)}</span>
          <Play size={12} className="invisible absolute top-[5px] right-0 text-accent group-hover:visible" />
        </span>
        <p
          className={cx('font-serif text-[15.5px] leading-[1.55] transition-colors', isActive ? 'text-ink' : 'text-ink-2')}
          style={isActive ? { boxShadow: `inset 2px 0 0 ${speaker?.color ?? 'var(--ink)'}`, paddingLeft: 10, marginLeft: -12 } : undefined}
        >
          {query ? mark(u.text, query) : u.text}
        </p>
      </div>
    </div>
  );
});

function mark(text: string, q: string) {
  const parts: React.ReactNode[] = [];
  const lower = text.toLowerCase();
  const n = q.toLowerCase();
  let i = 0;
  for (let j = lower.indexOf(n); j !== -1; j = lower.indexOf(n, i)) {
    parts.push(text.slice(i, j), <mark key={j} className="marker bg-transparent text-ink">{text.slice(j, j + n.length)}</mark>);
    i = j + n.length;
  }
  parts.push(text.slice(i));
  return parts;
}
