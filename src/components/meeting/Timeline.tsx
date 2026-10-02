'use client';
import { memo, useMemo, useRef, useState } from 'react';
import { mergeIntervals } from '@/lib/algo/intervals';
import { clock } from '@/lib/format';
import type { Highlight, SpeakerRow, Utterance } from '@/lib/queries';
import { usePlayer, type PlayerStore } from './player';

export type Range = { start_ms: number; end_ms: number };

type Props = {
  store: PlayerStore;
  duration: number;
  speakers: SpeakerRow[];
  utterances: Utterance[];
  chapters: { title: string; source_ms: number }[];
  highlights: Highlight[];
  selection: Range | null;
  onSelect: (r: Range | null) => void;
};

/**
 * The meeting map: one lane per speaker (who talked when), chapter ticks and
 * highlights on a rail above. Click to seek; drag to select a range for a clip.
 * Each speaker's utterances are merged (gaps < 1.5 s) so an hour renders as a
 * few hundred bars, not ~1,500.
 */
export const Timeline = memo(function Timeline({ store, duration, speakers, utterances, chapters, highlights, selection, onSelect }: Props) {
  const area = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const drag = useRef<{ x0: number; ms0: number; moved: boolean } | null>(null);

  const lanes = useMemo(() => {
    const first = new Map<string, number>();
    for (const u of utterances) if (u.speaker_id && !first.has(u.speaker_id)) first.set(u.speaker_id, u.start_ms);
    return [...speakers]
      .sort((a, b) => (first.get(a.id) ?? Infinity) - (first.get(b.id) ?? Infinity))
      .map((s) => ({
        s,
        bars: mergeIntervals(utterances.filter((u) => u.speaker_id === s.id), 1500),
      }));
  }, [speakers, utterances]);

  const pct = (ms: number) => `${Math.min(100, Math.max(0, (ms / duration) * 100))}%`;
  const msAt = (clientX: number) => {
    const r = area.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * duration);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x0: e.clientX, ms0: msAt(e.clientX), moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    setHover(msAt(e.clientX));
    const d = drag.current;
    if (!d) return;
    if (!d.moved && Math.abs(e.clientX - d.x0) > 4) d.moved = true;
    if (d.moved) {
      const ms = msAt(e.clientX);
      onSelect({ start_ms: Math.min(d.ms0, ms), end_ms: Math.max(d.ms0, ms) });
    }
  };
  const onUp = (e: React.PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (!d.moved) {
      onSelect(null);
      store.seek(msAt(e.clientX), true);
    }
  };

  const laneH = speakers.length > 6 ? 11 : 14;

  return (
    <div className="select-none">
      <div className="flex">
        {/* Lane labels */}
        <div className="w-[92px] shrink-0 pt-[18px] pr-2">
          {lanes.map(({ s }) => (
            <div key={s.id} className="flex items-center gap-1.5 truncate text-[11px] text-ink-3" style={{ height: laneH + 3 }} title={s.display_name}>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.display_name.split(' ')[0]}</span>
            </div>
          ))}
        </div>

        <div
          ref={area}
          className="relative min-w-0 flex-1 cursor-pointer touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={() => setHover(null)}
          role="slider"
          aria-label="Meeting timeline"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration / 1000)}
          aria-valuenow={Math.round(store.time / 1000)}
          tabIndex={0}
        >
          {/* Rail: chapters + highlights */}
          <div className="relative h-[18px]">
            {chapters.map((c) => (
              <span key={c.source_ms} className="group/ch absolute top-[3px] h-[9px] w-px bg-ink-3/50" style={{ left: pct(c.source_ms) }}>
                <span className="pointer-events-none absolute -top-7 left-0 z-20 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-paper group-hover/ch:block">
                  {c.title}
                </span>
              </span>
            ))}
            {highlights.map((h) => (
              <span
                key={h.id}
                title={`Highlight at ${clock(h.start_ms)}`}
                className="absolute top-[4px] h-[7px] rounded-sm bg-mark"
                style={{ left: pct(h.start_ms), width: `max(4px, ${pct(h.end_ms - h.start_ms)})` }}
              />
            ))}
          </div>

          {/* Lanes */}
          {lanes.map(({ s, bars }) => (
            <div key={s.id} className="relative rounded-[3px] bg-paper-2" style={{ height: laneH, marginBottom: 3 }}>
              {bars.map((b) => (
                <span
                  key={b.start_ms}
                  className="absolute inset-y-0 rounded-[2px]"
                  style={{ left: pct(b.start_ms), width: `max(1.5px, ${pct(b.end_ms - b.start_ms)})`, background: s.color, opacity: 0.85 }}
                />
              ))}
            </div>
          ))}

          {selection && (
            <div
              className="pointer-events-none absolute top-0 bottom-0 rounded-sm border-x-2 border-accent bg-accent/12"
              style={{ left: pct(selection.start_ms), width: pct(selection.end_ms - selection.start_ms) }}
            />
          )}
          <Playhead store={store} duration={duration} />
          {hover != null && (
            <>
              <div className="pointer-events-none absolute top-[18px] bottom-0 w-px bg-ink-3/40" style={{ left: pct(hover) }} />
              <div className="pointer-events-none absolute -bottom-5 -translate-x-1/2 font-mono text-[10.5px] text-ink-3 tnum" style={{ left: pct(hover) }}>
                {clock(hover)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

function Playhead({ store, duration }: { store: PlayerStore; duration: number }) {
  // Quantize to 0.1% steps: smooth to the eye, ~1,000 renders max per meeting.
  const pos = usePlayer(store, (s) => Math.round((s.time / duration) * 1000) / 10);
  return (
    <div className="pointer-events-none absolute top-[14px] bottom-0 z-10 w-0" style={{ left: `${pos}%` }}>
      <div className="absolute -left-[4px] top-0 h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-ink" />
      <div className="absolute -left-px top-0 bottom-0 w-[2px] bg-ink" />
    </div>
  );
}
