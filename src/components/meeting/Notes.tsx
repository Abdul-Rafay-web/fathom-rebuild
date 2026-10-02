'use client';
import { useState } from 'react';
import { BadgeCheck, Bookmark, CircleHelp, Loader2, ShieldCheck, Trash2 } from 'lucide-react';
import { lastStartAtOrBefore } from '@/lib/algo/bsearch';
import { clock } from '@/lib/format';
import type { ActionItem, Decision, Highlight, InsightContent, SpeakerRow, Utterance } from '@/lib/queries';
import type { GroundedSummary } from '@/lib/pipeline/steps';
import { TEMPLATES, type TemplateId } from '@/lib/pipeline/prompts';
import { Avatar, Cite, cx, Empty, Segmented, SectionLabel } from '../ui';
import { toast } from '../toast';

type Props = {
  meetingId: string;
  insight: { content: InsightContent; model: string } | null;
  decisions: Decision[];
  actions: ActionItem[];
  setActions: (f: (a: ActionItem[]) => ActionItem[]) => void;
  canEdit: boolean;
  onReadOnly: () => void;
  highlights: Highlight[];
  onDeleteHighlight: (id: string) => void;
  speakers: Map<string, SpeakerRow>;
  utterances: Utterance[];
  onPlay: (ms: number) => void;
};

const TEMPLATE_OPTIONS = (Object.keys(TEMPLATES) as TemplateId[]).map((k) => ({ value: k, label: TEMPLATES[k].label, hint: TEMPLATES[k].hint }));

export function Notes(p: Props) {
  const [template, setTemplate] = useState<TemplateId>('general');
  const [cache, setCache] = useState<Partial<Record<TemplateId, GroundedSummary>>>(() =>
    p.insight ? { general: p.insight.content } : {},
  );
  const [loading, setLoading] = useState<TemplateId | null>(null);

  const pick = async (t: TemplateId) => {
    setTemplate(t);
    if (cache[t]) return;
    setLoading(t);
    try {
      const r = await fetch(`/api/meetings/${p.meetingId}/summary?template=${t}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      setCache((c) => ({ ...c, [t]: j }));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not generate that template', 'error');
      setTemplate('general');
    } finally {
      setLoading(null);
    }
  };

  if (!p.insight) return <Empty title="Notes aren’t ready yet">They’ll appear here as soon as analysis finishes.</Empty>;

  const content = p.insight.content;
  const summary = cache[template];
  const chapters = content.chapters ?? [];
  const questions = content.open_questions ?? [];

  return (
    <div className="flex flex-col gap-10">
      {chapters.length > 1 && (
        <section>
          <SectionLabel>Contents</SectionLabel>
          <ol className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
            {chapters.map((c, i) => (
              <li key={c.source_ms}>
                <button onClick={() => p.onPlay(c.source_ms)} className="group flex w-full items-baseline gap-2.5 py-1 text-left">
                  <span className="w-4 font-mono text-[11px] text-ink-3 tnum">{i + 1}</span>
                  <span className="flex-1 text-[14px] text-ink-2 group-hover:text-ink">{c.title}</span>
                  <span className="font-mono text-[11px] text-ink-3 tnum group-hover:text-accent">{clock(c.source_ms)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section>
        <SectionLabel right={<Segmented size="sm" value={template} options={TEMPLATE_OPTIONS} onChange={pick} />}>Summary</SectionLabel>
        {loading === template || !summary ? (
          <div className="space-y-5 pt-2" aria-busy>
            <div className="flex items-center gap-2 text-[13px] text-ink-3"><Loader2 size={14} className="animate-spin" /> Writing the {TEMPLATES[template].label} version…</div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <div className="skeleton h-5 w-48" />
                <div className="skeleton h-4 w-full" />
                <div className="skeleton h-4 w-[85%]" />
              </div>
            ))}
          </div>
        ) : summary.sections.length === 0 ? (
          <Empty title="Nothing to report in this format">This meeting didn’t cover what the {TEMPLATES[template].label} template looks for.</Empty>
        ) : (
          <div className="space-y-7">
            {summary.sections.map((s) => (
              <div key={s.heading}>
                <h4 className="mb-2 font-display text-[20px] leading-snug tracking-[-0.005em]">{s.heading}</h4>
                <ul className="space-y-2">
                  {s.points.map((pt, i) => (
                    <li key={i} className="prose-read relative pl-4 text-ink before:absolute before:top-[0.72em] before:left-0 before:h-[5px] before:w-[5px] before:rounded-full before:bg-rule-2">
                      {pt.text}
                      <Cite ms={pt.source_ms} quote={pt.quote} onPlay={p.onPlay} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionLabel>Decisions</SectionLabel>
        {p.decisions.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">No explicit decisions were made.</p>
        ) : (
          <ul className="space-y-2.5">
            {p.decisions.map((d) => (
              <li key={d.id} className="flex gap-3 rounded-xl border border-rule bg-card px-4 py-3">
                <BadgeCheck size={17} strokeWidth={1.6} className="mt-[3px] shrink-0 text-accent" />
                <p className="prose-read text-[16px]">
                  {d.text}
                  {d.source_ms != null && <Cite ms={d.source_ms} quote={d.quote} onPlay={p.onPlay} />}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionLabel right={<span className="text-[12px] text-ink-3 tnum">{p.actions.filter((a) => a.done).length}/{p.actions.length} done</span>}>
          Action items
        </SectionLabel>
        {p.actions.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">No commitments were made in this meeting.</p>
        ) : (
          <ul className="divide-y divide-rule rounded-xl border border-rule bg-card">
            {p.actions.map((a) => (
              <ActionRow key={a.id} a={a} speakers={p.speakers} setActions={p.setActions} onPlay={p.onPlay} canEdit={p.canEdit} onReadOnly={p.onReadOnly} />
            ))}
          </ul>
        )}
      </section>

      {questions.length > 0 && (
        <section>
          <SectionLabel>Left open</SectionLabel>
          <ul className="space-y-2">
            {questions.map((q, i) => (
              <li key={i} className="flex gap-3">
                <CircleHelp size={16} strokeWidth={1.6} className="mt-[4px] shrink-0 text-ink-3" />
                <p className="prose-read text-[16px] text-ink-2">
                  {q.text}
                  <Cite ms={q.source_ms} quote={q.quote} onPlay={p.onPlay} />
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionLabel right={<span className="text-[12px] text-ink-3">Press <span className="font-mono">H</span> while listening</span>}>Highlights</SectionLabel>
        {p.highlights.length === 0 ? (
          <p className="text-[13.5px] text-ink-3">Mark a moment as you listen and it lands here and on the timeline.</p>
        ) : (
          <ul className="space-y-2">
            {p.highlights.map((h) => {
              const i = lastStartAtOrBefore(p.utterances.map((u) => u.start_ms), h.end_ms - 1);
              const u = p.utterances[Math.max(0, i)];
              const sp = u?.speaker_id ? p.speakers.get(u.speaker_id) : undefined;
              return (
                <li key={h.id} className="group flex items-start gap-3 rounded-xl border-l-[3px] border-mark bg-mark-wash/40 py-2.5 pr-3 pl-4">
                  <Bookmark size={15} className="mt-[3px] shrink-0 text-ink-3" />
                  <div className="min-w-0 flex-1">
                    <p className="font-serif text-[15px] leading-snug text-ink-2">
                      {sp && <span className="font-sans text-[12.5px] font-medium" style={{ color: sp.color }}>{sp.display_name}: </span>}
                      {u?.text}
                    </p>
                    <span className="text-[11.5px] text-ink-3">{h.created_live ? 'Marked live' : 'Marked on replay'}</span>
                  </div>
                  <Cite ms={h.start_ms} onPlay={p.onPlay} />
                  <button aria-label="Remove highlight" onClick={() => p.onDeleteHighlight(h.id)} className="invisible rounded p-1 text-ink-3 group-hover:visible hover:text-danger">
                    <Trash2 size={13} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <footer className="flex items-start gap-2.5 border-t border-rule pt-5 text-[12.5px] leading-relaxed text-ink-3">
        <ShieldCheck size={15} className="mt-[2px] shrink-0 text-accent" />
        <p>
          Every line above links to the transcript moment it came from; hover a timestamp to see the exact words.
          {content.grounding?.dropped ? ` ${content.grounding.dropped} AI claim${content.grounding.dropped === 1 ? '' : 's'} couldn’t be matched to the transcript and ${content.grounding.dropped === 1 ? 'was' : 'were'} left out.` : ' Nothing had to be discarded.'}{' '}
          <span className="text-ink-3/80">Model: {p.insight.model}</span>
        </p>
      </footer>
    </div>
  );
}

function ActionRow({ a, speakers, setActions, onPlay, canEdit, onReadOnly }: { a: ActionItem; speakers: Map<string, SpeakerRow>; setActions: Props['setActions']; onPlay: (ms: number) => void; canEdit: boolean; onReadOnly: () => void }) {
  const owner = a.owner_speaker_id ? speakers.get(a.owner_speaker_id) : undefined;
  const toggle = async () => {
    const next = !a.done;
    setActions((xs) => xs.map((x) => (x.id === a.id ? { ...x, done: next } : x))); // optimistic
    if (!canEdit) return onReadOnly();
    const r = await fetch(`/api/action-items/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: next, version: a.version }),
    });
    const j = await r.json();
    if (r.ok) setActions((xs) => xs.map((x) => (x.id === a.id ? { ...x, done: j.done, version: j.version } : x)));
    else if (r.status === 409) {
      setActions((xs) => xs.map((x) => (x.id === a.id ? { ...x, ...j.current } : x)));
      toast('Someone else just changed this item. Showing the latest.');
    } else {
      setActions((xs) => xs.map((x) => (x.id === a.id ? { ...x, done: a.done } : x)));
      toast('Couldn’t save that', 'error');
    }
  };
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <button
        role="checkbox"
        aria-checked={a.done}
        onClick={toggle}
        className={cx(
          'mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
          a.done ? 'border-accent bg-accent text-paper' : 'border-rule-2 bg-paper hover:border-accent',
        )}
      >
        {a.done && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cx('text-[14.5px] leading-snug', a.done ? 'text-ink-3 line-through decoration-rule-2' : 'text-ink')}>{a.text}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-3">
          <span className="flex items-center gap-1.5">
            {owner ? <Avatar name={owner.display_name} color={owner.color} size={16} /> : null}
            {a.owner_name ?? 'Unassigned'}
          </span>
          {a.due && <span className="rounded-full bg-paper-2 px-2 py-px">Due {a.due}</span>}
          {a.source_ms != null && <Cite ms={a.source_ms} quote={a.quote} onPlay={onPlay} />}
        </div>
      </div>
    </li>
  );
}
