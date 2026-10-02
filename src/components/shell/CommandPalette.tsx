'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckSquare, CornerDownLeft, FileText, Library, Mic, Search, Sparkles, Upload } from 'lucide-react';
import { fuzzy } from '@/lib/fuzzy';
import { cx, Kbd } from '../ui';
import type { PaletteMeeting } from './AppShell';

type Item = { id: string; label: string; hint?: string; icon: ReactNode; run: () => void; group: string };

export function CommandPalette({
  onClose, meetings, onUpload,
}: { onClose: () => void; meetings: PaletteMeeting[]; onUpload: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const go = (href: string) => () => { onClose(); router.push(href); };
    const base: Item[] = [
      { id: 'nav-meetings', label: 'Meetings', icon: <Library size={15} />, run: go('/'), group: 'Go to' },
      { id: 'nav-actions', label: 'Action items', icon: <CheckSquare size={15} />, run: go('/actions'), group: 'Go to' },
      { id: 'nav-record', label: 'Record a meeting', icon: <Mic size={15} />, run: go('/record'), group: 'Go to' },
      { id: 'upload', label: 'Upload a recording', icon: <Upload size={15} />, run: onUpload, group: 'Go to' },
      ...meetings.map((m) => ({
        id: m.id,
        label: m.title,
        hint: new Date(m.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        icon: <FileText size={15} />,
        run: go(`/m/${m.id}`),
        group: 'Meetings',
      })),
    ];
    const query = q.trim();
    const ranked = query
      ? base
          .map((it) => ({ it, m: fuzzy(query, it.label) }))
          .filter((x) => x.m)
          .sort((a, b) => b.m!.score - a.m!.score)
          .map((x) => ({ ...x.it, indices: x.m!.indices }))
      : base.map((it) => ({ ...it, indices: [] as number[] }));
    if (query) {
      ranked.unshift(
        { id: 'search', label: `Search moments for “${query}”`, icon: <Search size={15} />, run: go(`/search?q=${encodeURIComponent(query)}`), group: 'Search', indices: [] },
        { id: 'ask', label: `Ask: “${query}”`, icon: <Sparkles size={15} />, run: go(`/search?q=${encodeURIComponent(query)}&ask=1`), group: 'Search', indices: [] },
      );
    }
    return ranked;
  }, [q, meetings, onClose, onUpload, router]);

  useEffect(() => {
    list.current?.querySelector(`[data-i="${sel}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [sel]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); items[sel]?.run(); }
    else if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center bg-ink/25 px-4 pt-[12vh] backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-rule bg-card shadow-lift"
      >
        <div className="flex items-center gap-2.5 border-b border-rule px-4">
          <Search size={16} className="text-ink-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            autoFocus
            onKeyDown={onKey}
            placeholder="Jump to a meeting, or search what was said…"
            className="h-12 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div ref={list} className="max-h-[52vh] overflow-y-auto p-1.5">
          {items.length === 0 && <p className="px-3 py-6 text-center text-[13px] text-ink-3">Nothing matches.</p>}
          {items.map((it, i) => {
            const header = i === 0 || items[i - 1].group !== it.group ? it.group : null;
            return (
              <div key={it.id}>
                {header && <div className="px-3 pt-2.5 pb-1 text-[10.5px] tracking-[0.14em] text-ink-3 uppercase">{header}</div>}
                <button
                  data-i={i}
                  onMouseEnter={() => setSel(i)}
                  onClick={it.run}
                  className={cx('flex h-10 w-full items-center gap-3 rounded-lg px-3 text-left text-[13.5px]', i === sel ? 'bg-paper-2 text-ink' : 'text-ink-2')}
                >
                  <span className="text-ink-3">{it.icon}</span>
                  <span className="flex-1 truncate">{highlight(it.label, it.indices)}</span>
                  {it.hint && <span className="text-[12px] text-ink-3">{it.hint}</span>}
                  {i === sel && <CornerDownLeft size={13} className="text-ink-3" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function highlight(s: string, idx: number[]) {
  if (!idx.length) return s;
  const set = new Set(idx);
  return [...s].map((c, i) => (set.has(i) ? <span key={i} className="text-accent">{c}</span> : c));
}
