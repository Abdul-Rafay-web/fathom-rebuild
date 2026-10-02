import Link from 'next/link';
import { Compass, Mic, Search, Upload } from 'lucide-react';
import { getViewer } from '@/lib/auth';
import { listMeetings, type MeetingListItem } from '@/lib/queries';
import { duration } from '@/lib/format';
import { Fingerprint } from '@/components/library/Fingerprint';
import { StatusPill } from '@/components/library/StatusPill';
import { Reveal, RevealItem } from '@/components/Reveal';
import { Greeting, OpenUpload } from '@/components/library/Bits';
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
  const v = await getViewer();
  const meetings = await listMeetings(v.workspace.id);
  const now = new Date();
  const totalMs = meetings.reduce((a, m) => a + m.duration_ms, 0);
  const open = meetings.reduce((a, m) => a + m.open_actions, 0);
  const people = new Set(meetings.flatMap((m) => m.speakers.map((s) => s.name.split(' ')[0]))).size;

  const groups = new Map<string, MeetingListItem[]>();
  for (const m of meetings) {
    const g = groupOf(new Date(m.started_at), now);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(m);
  }

  const first = v.user?.name.split(' ')[0];

  return (
    <div className="mx-auto max-w-[1100px] px-5 pt-10 pb-24 sm:px-8 lg:pt-14">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[13px] tracking-[0.14em] text-ink-3 uppercase">
            {v.workspace.is_demo ? 'Tidewater · demo workspace' : <Greeting name={first} />}
          </p>
          <h1 className="mt-2 text-[46px] leading-[1.02] sm:text-[56px]">{v.workspace.is_demo ? 'Meetings' : 'Your meetings'}</h1>
        </div>
        <form action="/search" className="relative w-full sm:w-[340px]">
          <Search size={16} className="absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
          <input
            name="q"
            placeholder="Search everything that was said"
            className="h-12 w-full rounded-2xl border border-rule bg-card/80 pr-4 pl-11 text-[14.5px] shadow-[0_1px_2px_rgb(0_0_0/0.04)] outline-none backdrop-blur placeholder:text-ink-3 focus:border-accent focus:ring-4 focus:ring-accent/10"
          />
        </form>
      </header>

      {meetings.length > 0 && (
        <Reveal className="mt-9 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Meetings" value={String(meetings.length)} />
          <Stat label="Conversation" value={duration(totalMs)} />
          <Stat label="People" value={String(people)} />
          <Stat label="Open action items" value={String(open)} href="/actions" accent />
        </Reveal>
      )}

      {meetings.length === 0 && <FirstRun />}

      {[...groups].map(([label, items]) => (
        <section key={label} className="mt-12">
          <div className="mb-3 flex items-center gap-4">
            <h2 className="font-sans text-[11.5px] font-medium tracking-[0.16em] text-ink-3 uppercase">{label}</h2>
            <div className="rule-fade flex-1" />
          </div>
          <Reveal as="ul" className="grid gap-3">
            {items.map((m) => (
              <RevealItem as="li" key={m.id}>
                <MeetingCard m={m} />
              </RevealItem>
            ))}
          </Reveal>
        </section>
      ))}
    </div>
  );
}

function Stat({ label, value, href, accent }: { label: string; value: string; href?: string; accent?: boolean }) {
  const inner = (
    <>
      <div className="text-[11.5px] tracking-[0.1em] text-ink-3 uppercase">{label}</div>
      <div className={`mt-1.5 font-display text-[34px] leading-none tnum ${accent ? 'text-accent' : 'text-ink'}`}>{value}</div>
    </>
  );
  const cls = 'block rounded-2xl border border-rule bg-card/80 px-5 py-4 shadow-[0_1px_2px_rgb(0_0_0/0.03)] backdrop-blur';
  return (
    <RevealItem>
      {href ? <Link href={href} className={`${cls} transition-[transform,border] hover:-translate-y-0.5 hover:border-rule-2`}>{inner}</Link> : <div className={cls}>{inner}</div>}
    </RevealItem>
  );
}

function MeetingCard({ m }: { m: MeetingListItem }) {
  const d = new Date(m.started_at);
  const people = m.speakers.map((s) => ({ name: s.name, color: s.color }));
  return (
    <Link
      href={`/m/${m.id}`}
      className="group grid grid-cols-[58px_1fr] gap-5 rounded-2xl border border-rule bg-card/70 p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03)] backdrop-blur transition-[transform,border,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-rule-2 hover:shadow-lift sm:grid-cols-[64px_1fr_auto] sm:p-6"
    >
      <div className="flex h-[64px] flex-col items-center justify-center rounded-xl bg-paper-2 text-center">
        <div className="text-[10.5px] tracking-[0.14em] text-ink-3 uppercase">{d.toLocaleDateString('en-US', { month: 'short' })}</div>
        <div className="font-display text-[28px] leading-none text-ink tnum">{d.getDate()}</div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h3 className="font-display text-[23px] leading-snug text-ink transition-colors group-hover:text-accent">{m.title}</h3>
          <StatusPill id={m.id} status={m.status} />
        </div>
        <p className="mt-1 text-[12.5px] text-ink-3 tnum">
          {d.toLocaleDateString('en-US', { weekday: 'long' })} · {d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} · {m.duration_ms ? duration(m.duration_ms) : '—'}
          {m.speaker_count > 0 && ` · ${m.speaker_count} ${m.speaker_count === 1 ? 'speaker' : 'speakers'}`}
          {m.source === 'live' && ' · recorded live'}
        </p>
        {m.gist && <p className="mt-2.5 line-clamp-2 max-w-[68ch] font-serif text-[15.5px] leading-relaxed text-ink-2">{m.gist}</p>}
        <Fingerprint data={m.fingerprint} className="mt-4 max-w-[560px]" />
      </div>
      <div className="col-span-2 flex items-center gap-4 sm:col-span-1 sm:flex-col sm:items-end sm:justify-between">
        {people.length > 0 && <AvatarStack people={people} max={5} size={26} />}
        {m.open_actions > 0 && (
          <span className="rounded-full bg-accent-wash px-2.5 py-1 text-[12px] text-accent-ink tnum">
            {m.open_actions} open {m.open_actions === 1 ? 'item' : 'items'}
          </span>
        )}
      </div>
    </Link>
  );
}

function FirstRun() {
  const card = 'group h-full w-full rounded-2xl border border-rule bg-paper p-5 text-left transition-[transform,border] hover:-translate-y-0.5';
  return (
    <div className="mt-10 rounded-3xl border border-rule bg-card/70 p-8 backdrop-blur sm:p-10">
      <h2 className="text-[32px] leading-tight">Your workspace is ready.</h2>
      <p className="mt-2 max-w-[56ch] text-[15px] text-ink-2">
        Everything here is private to you. Bring in your first meeting, or look around the demo to see what you’ll get.
      </p>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <Link href="/record" className={`${card} hover:border-accent/40`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-wash text-accent"><Mic size={18} /></span>
          <div className="mt-4 text-[15px] font-medium text-ink">Record a meeting</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Live captions as you talk; notes a minute after you stop.</p>
        </Link>
        <OpenUpload className={`${card} hover:border-accent/40`}>
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-wash text-accent"><Upload size={18} /></span>
          <div className="mt-4 text-[15px] font-medium text-ink">Upload a recording</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Any audio or video file up to 50 MB (about an hour of audio).</p>
        </OpenUpload>
        <form action="/workspace" method="post">
          <button name="to" value="demo" className={`${card} hover:border-mark/60`}>
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-mark-wash text-ink"><Compass size={18} /></span>
            <div className="mt-4 text-[15px] font-medium text-ink">Explore the demo</div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">Six processed meetings, including an 8-person hour.</p>
          </button>
        </form>
      </div>
    </div>
  );
}
