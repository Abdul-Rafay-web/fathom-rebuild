import Link from 'next/link';
import { Mic, Search } from 'lucide-react';
import { listMeetings, type MeetingListItem } from '@/lib/queries';
import { duration } from '@/lib/format';
import { Fingerprint } from '@/components/library/Fingerprint';
import { StatusPill } from '@/components/library/StatusPill';
import { AvatarStack } from '@/components/ui';

export const dynamic = 'force-dynamic';

const DAY = 86_400_000;

function groupOf(d: Date, now: Date) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - DAY) return 'Yesterday';
  const dow = (now.getDay() + 6) % 7; // Monday = 0
  if (t >= startOfToday - dow * DAY) return 'Earlier this week';
  if (t >= startOfToday - (dow + 7) * DAY) return 'Last week';
  return 'Earlier';
}

export default async function Library() {
  const meetings = await listMeetings();
  const now = new Date();
  const totalMs = meetings.reduce((a, m) => a + m.duration_ms, 0);
  const open = meetings.reduce((a, m) => a + m.open_actions, 0);

  const groups = new Map<string, MeetingListItem[]>();
  for (const m of meetings) {
    const g = groupOf(new Date(m.started_at), now);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(m);
  }

  return (
    <div className="mx-auto max-w-[920px] px-5 pt-10 pb-24 sm:px-8 lg:pt-14">
      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-serif text-[40px] leading-none tracking-[-0.015em]">Meetings</h1>
          <p className="mt-3 text-[13.5px] text-ink-3 tnum">
            {meetings.length} recorded · {duration(totalMs)} of conversation ·{' '}
            <Link href="/actions" className="text-ink-2 underline decoration-rule-2 underline-offset-4 hover:decoration-ink-3">
              {open} open action items
            </Link>
          </p>
        </div>
        <form action="/search" className="relative w-full sm:w-[300px]">
          <Search size={15} className="absolute top-1/2 left-3 -translate-y-1/2 text-ink-3" />
          <input
            name="q"
            placeholder="Search everything that was said"
            className="h-10 w-full rounded-lg border border-rule bg-card pr-3 pl-9 text-[13.5px] outline-none placeholder:text-ink-3 focus:border-accent"
          />
        </form>
      </header>

      {meetings.length === 0 && (
        <div className="rounded-2xl border border-dashed border-rule-2 px-6 py-16 text-center">
          <p className="font-serif text-[22px]">No meetings yet</p>
          <p className="mt-2 text-[13.5px] text-ink-3">Record one in the browser or upload a file to get grounded notes.</p>
          <Link href="/record" className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-accent px-4 text-[13.5px] text-paper">
            <Mic size={15} /> Record a meeting
          </Link>
        </div>
      )}

      {[...groups].map(([label, items]) => (
        <section key={label} className="mb-10">
          <h2 className="mb-2 border-b border-rule pb-2 text-[11px] tracking-[0.14em] text-ink-3 uppercase">{label}</h2>
          <ul>
            {items.map((m) => (
              <li key={m.id}>
                <MeetingRow m={m} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MeetingRow({ m }: { m: MeetingListItem }) {
  const d = new Date(m.started_at);
  const people = m.speakers.map((s) => ({ name: s.name, color: s.color }));
  return (
    <Link
      href={`/m/${m.id}`}
      className="group -mx-4 grid grid-cols-[52px_1fr] gap-4 rounded-xl px-4 py-5 transition-colors hover:bg-card sm:grid-cols-[56px_1fr_auto]"
    >
      <div className="pt-0.5 text-center">
        <div className="text-[10.5px] tracking-[0.12em] text-ink-3 uppercase">{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
        <div className="font-serif text-[26px] leading-tight text-ink-2 tnum">{d.getDate()}</div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-serif text-[21px] leading-snug tracking-[-0.005em] text-ink group-hover:text-accent-ink">{m.title}</h3>
          <StatusPill id={m.id} status={m.status} />
        </div>
        <p className="mt-1 text-[12.5px] text-ink-3 tnum">
          {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {m.duration_ms ? duration(m.duration_ms) : '—'}
          {m.speaker_count > 0 && ` · ${m.speaker_count} ${m.speaker_count === 1 ? 'speaker' : 'speakers'}`}
          {m.source === 'live' && ' · recorded live'}
        </p>
        {m.gist && <p className="mt-2 line-clamp-2 max-w-[62ch] text-[14px] leading-relaxed text-ink-2">{m.gist}</p>}
        <Fingerprint data={m.fingerprint} className="mt-3.5 max-w-[520px]" />
      </div>
      <div className="col-span-2 flex items-center gap-4 sm:col-span-1 sm:flex-col sm:items-end sm:justify-between">
        {people.length > 0 && <AvatarStack people={people} max={5} size={24} />}
        {m.open_actions > 0 && (
          <span className="text-[12px] text-ink-3 tnum">
            <span className="text-ink-2">{m.open_actions}</span> open {m.open_actions === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
    </Link>
  );
}
