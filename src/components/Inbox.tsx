'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { clock } from '@/lib/format';
import type { InboxItem } from '@/lib/queries';
import { Avatar, cx, Empty, Segmented } from './ui';
import { toast } from './toast';
import { demoNotice, useViewer } from './shell/AppShell';

type Item = Omit<InboxItem, 'started_at'> & { started_at: string };
type Filter = 'open' | 'done' | 'all';
type Group = 'owner' | 'meeting';

// Owner names come from different meetings' transcripts ("Lena", "Lena Novak");
// group them by first name, case-insensitively, so one person is one group.
const ownerKey = (n: string | null) => (n ? n.trim().split(/\s+/)[0].toLowerCase() : '~unassigned');

export function Inbox({ initial }: { initial: Item[] }) {
  const [items, setItems] = useState(initial);
  const viewer = useViewer();
  const [filter, setFilter] = useState<Filter>('open');
  const [group, setGroup] = useState<Group>('owner');
  const [who, setWho] = useState<string | null>(null);

  const visible = items.filter((i) => (filter === 'all' ? true : filter === 'done' ? i.done : !i.done));
  const owners = useMemo(() => {
    const m = new Map<string, { name: string; color: string | null; open: number }>();
    for (const i of items) {
      const k = ownerKey(i.owner_name);
      const cur = m.get(k) ?? { name: i.owner_name?.split(' ')[0] ?? 'Unassigned', color: i.owner_color, open: 0 };
      if (!i.done) cur.open++;
      m.set(k, cur);
    }
    return [...m].sort((a, b) => b[1].open - a[1].open);
  }, [items]);

  const groups = useMemo(() => {
    const m = new Map<string, { title: string; sub?: string; color?: string | null; href?: string; items: Item[] }>();
    for (const i of visible) {
      if (who && ownerKey(i.owner_name) !== who) continue;
      const k = group === 'owner' ? ownerKey(i.owner_name) : i.meeting_id;
      if (!m.has(k)) {
        m.set(k, group === 'owner'
          ? { title: i.owner_name?.split(' ')[0] ?? 'Unassigned', color: i.owner_color, items: [] }
          : { title: i.meeting_title, sub: new Date(i.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), href: `/m/${i.meeting_id}`, items: [] });
      }
      m.get(k)!.items.push(i);
    }
    return [...m.values()].sort((a, b) => (group === 'owner' ? b.items.length - a.items.length : 0));
  }, [visible, group, who]);

  const toggle = async (it: Item) => {
    const next = !it.done;
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: next } : x)));
    if (!viewer.canEdit) return demoNotice(!!viewer.user);
    const r = await fetch(`/api/action-items/${it.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: next, version: it.version }),
    });
    const j = await r.json();
    if (r.ok) setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, version: j.version, done: j.done } : x)));
    else if (r.status === 409) { setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, ...j.current } : x))); toast('Changed elsewhere, showing the latest'); }
    else { setItems((xs) => xs.map((x) => (x.id === it.id ? it : x))); toast('Couldn’t save', 'error'); }
    if (r.ok && next) toast('Done. Nice.');
  };

  const openCount = items.filter((i) => !i.done).length;

  return (
    <div className="mt-8">
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'open', label: `Open · ${openCount}` },
          { value: 'done', label: 'Done' },
          { value: 'all', label: 'All' },
        ]} />
        <Segmented value={group} onChange={setGroup} options={[{ value: 'owner', label: 'By owner' }, { value: 'meeting', label: 'By meeting' }]} />
      </div>

      <div className="mb-8 flex flex-wrap gap-1.5">
        <button onClick={() => setWho(null)} className={cx('rounded-full border px-3 py-1 text-[12.5px]', who === null ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-2 hover:border-ink-3')}>Everyone</button>
        {owners.map(([k, o]) => (
          <button key={k} onClick={() => setWho(who === k ? null : k)} className={cx('flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-[12.5px]', who === k ? 'border-ink bg-ink text-paper' : 'border-rule text-ink-2 hover:border-ink-3')}>
            <Avatar name={o.name} color={o.color ?? 'var(--ink-3)'} size={18} />
            {o.name}
            <span className="tnum opacity-60">{o.open}</span>
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <Empty title={filter === 'open' ? 'Nothing open. Inbox zero.' : 'Nothing here yet'} />
      ) : (
        <div className="space-y-9">
          {groups.map((g) => (
            <section key={g.title + (g.sub ?? '')}>
              <h2 className="mb-2 flex items-center gap-2.5 border-b border-rule pb-2">
                {group === 'owner' && <Avatar name={g.title} color={g.color ?? 'var(--ink-3)'} size={22} />}
                <span className="font-display text-[20px]">{g.href ? <Link href={g.href} className="hover:text-accent-ink">{g.title}</Link> : g.title}</span>
                {g.sub && <span className="text-[12.5px] text-ink-3">{g.sub}</span>}
                <span className="ml-auto text-[12px] text-ink-3 tnum">{g.items.length}</span>
              </h2>
              <ul>
                {g.items.map((i) => (
                  <li key={i.id} className="group flex items-start gap-3 rounded-lg px-2 py-2.5 -mx-2 hover:bg-card">
                    <button
                      role="checkbox"
                      aria-checked={i.done}
                      onClick={() => toggle(i)}
                      className={cx('mt-[3px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors', i.done ? 'border-accent bg-accent text-paper' : 'border-rule-2 bg-paper hover:border-accent')}
                    >
                      {i.done && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M2.5 6.2 5 8.5 9.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={cx('text-[14.5px] leading-snug', i.done ? 'text-ink-3 line-through decoration-rule-2' : 'text-ink')}>{i.text}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-ink-3">
                        {group === 'meeting' && <span>{i.owner_name ?? 'Unassigned'}</span>}
                        {i.due && <span className="rounded-full bg-paper-2 px-2 py-px">Due {i.due}</span>}
                        {group === 'owner' && <span className="truncate">{i.meeting_title}</span>}
                      </div>
                    </div>
                    {i.source_ms != null && (
                      <Link
                        href={`/m/${i.meeting_id}?t=${i.source_ms}`}
                        title={i.quote ? `“${i.quote}”` : undefined}
                        className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-[11px] text-ink-3 hover:bg-accent-wash hover:text-accent"
                      >
                        {clock(i.source_ms)} <ArrowUpRight size={11} />
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
