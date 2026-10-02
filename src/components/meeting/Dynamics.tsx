'use client';
import { useState } from 'react';
import { Check, Pencil } from 'lucide-react';
import type { MeetingStats } from '@/lib/algo/intervals';
import { clock, duration, pct } from '@/lib/format';
import type { SpeakerRow } from '@/lib/queries';
import { Avatar, Cite, Empty, SectionLabel } from '../ui';
import { toast } from '../toast';

/**
 * Participation balance = normalized Shannon entropy of talk-time shares.
 * 1.0 means everyone spoke equally; it falls toward 0 as one voice dominates.
 * More honest than "talk %" alone on an 8-person call: one number for
 * "did this meeting hear from the room?"
 */
export function balance(shares: number[]) {
  const total = shares.reduce((a, b) => a + b, 0);
  const n = shares.filter((s) => s > 0).length;
  if (n < 2 || total === 0) return 1;
  let h = 0;
  for (const s of shares) if (s > 0) { const p = s / total; h -= p * Math.log(p); }
  return h / Math.log(n);
}

export function Dynamics({
  stats, speakers, onRename, onPlay, canEdit, onReadOnly,
}: { stats: MeetingStats | null; speakers: SpeakerRow[]; onRename: (id: string, name: string) => void; onPlay: (ms: number) => void; canEdit: boolean; onReadOnly: () => void }) {
  if (!stats) return <Empty title="Conversation stats aren’t ready yet" />;
  const byLabel = new Map(speakers.map((s) => [s.label, s]));
  const sorted = [...speakers].sort((a, b) => b.talk_ms - a.talk_ms);
  const totalTalk = sorted.reduce((a, s) => a + s.talk_ms, 0);
  const max = sorted[0]?.talk_ms || 1;
  const bal = balance(sorted.map((s) => s.talk_ms));
  const top = sorted[0];

  return (
    <div className="flex flex-col gap-10">
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Participation balance" value={bal.toFixed(2)} note={bal > 0.85 ? 'Even conversation' : bal > 0.65 ? 'A few voices led' : 'Dominated by one or two'} />
        <Stat label="Most airtime" value={top ? `${pct(top.talk_ms, totalTalk)}%` : '—'} note={top?.display_name ?? ''} />
        <Stat label="Cut-ins" value={String(stats.interruptions.reduce((a, i) => a + i.count, 0))} note="Floor taken mid-sentence" />
        <Stat label="Silence" value={duration(stats.silence_ms)} note={`${pct(stats.silence_ms, stats.duration_ms)}% of the meeting`} />
      </section>

      <section>
        <SectionLabel>Talk time</SectionLabel>
        <ul className="space-y-3">
          {sorted.map((s) => (
            <li key={s.id} className="grid grid-cols-[minmax(130px,190px)_1fr_auto] items-center gap-4">
              <SpeakerName s={s} onRename={onRename} canEdit={canEdit} onReadOnly={onReadOnly} />
              <div className="h-2 overflow-hidden rounded-full bg-paper-2">
                <div className="h-full rounded-full" style={{ width: `${(s.talk_ms / max) * 100}%`, background: s.color }} />
              </div>
              <div className="w-[150px] text-right text-[12.5px] text-ink-3 tnum">
                <span className="text-ink-2">{pct(s.talk_ms, totalTalk)}%</span> · {duration(s.talk_ms)} · {s.turns} turns
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[12.5px] text-ink-3">
          Names were inferred from introductions and how people addressed each other. Click a name to correct it; the fix applies to the transcript, owners and search.
        </p>
      </section>

      <section>
        <SectionLabel>Who cut in on whom</SectionLabel>
        {stats.interruptions.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">Nobody took the floor mid-sentence.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {stats.interruptions.slice(0, 8).map((x) => {
              const by = byLabel.get(x.by), of = byLabel.get(x.of);
              if (!by || !of) return null;
              return (
                <li key={`${x.by}-${x.of}`} className="flex items-center gap-2 rounded-lg border border-rule bg-card px-3 py-2 text-[13px]">
                  <Avatar name={by.display_name} color={by.color} size={20} />
                  <span className="text-ink-2">{by.display_name.split(' ')[0]}</span>
                  <span className="text-ink-3">→</span>
                  <Avatar name={of.display_name} color={of.color} size={20} />
                  <span className="flex-1 text-ink-2">{of.display_name.split(' ')[0]}</span>
                  <span className="font-mono text-[12px] text-ink-3">×{x.count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel>Monologues · 90 s or longer</SectionLabel>
        {stats.monologues.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">No one held the floor for more than a minute and a half.</p>
        ) : (
          <ul className="space-y-1.5">
            {stats.monologues.map((m) => {
              const s = byLabel.get(m.speaker);
              return (
                <li key={m.start_ms} className="flex items-center gap-2.5 text-[13.5px]">
                  {s && <Avatar name={s.display_name} color={s.color} size={18} />}
                  <span className="text-ink-2">{s?.display_name}</span>
                  <span className="text-ink-3">spoke for {duration(m.end_ms - m.start_ms)}</span>
                  <Cite ms={m.start_ms} onPlay={onPlay} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="text-[12px] text-ink-3">
        Computed with a single sweep over all {Object.values(stats.speakers).reduce((a, s) => a + s.turns, 0)} speaking turns · meeting length {clock(stats.duration_ms)}.
      </p>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-xl border border-rule bg-card px-4 py-3.5">
      <div className="text-[11px] tracking-[0.08em] text-ink-3 uppercase">{label}</div>
      <div className="mt-1 font-display text-[28px] leading-none tnum">{value}</div>
      <div className="mt-1.5 truncate text-[12px] text-ink-3">{note}</div>
    </div>
  );
}

function SpeakerName({ s, onRename, canEdit, onReadOnly }: { s: SpeakerRow; onRename: (id: string, name: string) => void; canEdit: boolean; onReadOnly: () => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(s.display_name);
  const save = async () => {
    const name = v.trim();
    setEditing(false);
    if (!name || name === s.display_name) return setV(s.display_name);
    if (!canEdit) { onRename(s.id, name); return onReadOnly(); }
    const r = await fetch(`/api/speakers/${s.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    if (r.ok) { onRename(s.id, name); toast(`Renamed to ${name} everywhere`); }
    else { setV(s.display_name); toast('Couldn’t rename', 'error'); }
  };
  if (editing) {
    return (
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex items-center gap-1.5">
        <Avatar name={v || '?'} color={s.color} size={22} />
        <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onBlur={save} className="h-7 w-full min-w-0 rounded-md border border-accent bg-paper px-2 text-[13px] outline-none" />
        <button type="submit" aria-label="Save name" className="text-accent"><Check size={14} /></button>
      </form>
    );
  }
  return (
    <button onClick={() => setEditing(true)} className="group flex min-w-0 items-center gap-2 text-left text-[13.5px]" title={s.name_confidence != null ? `Inferred with ${Math.round(s.name_confidence * 100)}% confidence` : 'Set by hand'}>
      <Avatar name={s.display_name} color={s.color} size={22} />
      <span className="truncate text-ink">{s.display_name}</span>
      <Pencil size={11} className="shrink-0 text-ink-3 opacity-0 group-hover:opacity-100" />
    </button>
  );
}
