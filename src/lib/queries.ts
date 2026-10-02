import 'server-only';
import { sql } from './db';
import type { MeetingStats } from './algo/intervals';
import type { GroundedSummary } from './pipeline/steps';

export type SpeakerRow = { id: string; label: number; display_name: string; color: string; talk_ms: number; turns: number; longest_ms: number; name_confidence: number | null };

export type MeetingListItem = {
  id: string; title: string; started_at: Date; duration_ms: number; status: string; source: string;
  gist: string | null; speaker_count: number; open_actions: number; fingerprint: number[] | null;
  speakers: { label: number; name: string; color: string; talk_ms: number }[];
};

export async function listMeetings(): Promise<MeetingListItem[]> {
  return sql<MeetingListItem[]>`
    select m.id, m.title, m.started_at, m.duration_ms, m.status, m.source, m.gist, m.speaker_count,
           m.stats->'fingerprint' as fingerprint,
           (select count(*) from action_items a where a.meeting_id = m.id and not a.done)::int as open_actions,
           coalesce((select json_agg(json_build_object('label', s.label, 'name', s.display_name, 'color', s.color, 'talk_ms', s.talk_ms)
                                      order by s.talk_ms desc)
                     from speakers s where s.meeting_id = m.id), '[]') as speakers
    from meetings m
    -- An upload that never completed (tab closed mid-upload) isn't a meeting.
    where not (m.status = 'recording' and m.created_at < now() - interval '30 minutes')
    order by m.started_at desc`;
}

export type Utterance = { id: number; speaker_id: string | null; start_ms: number; end_ms: number; text: string };
export type ActionItem = { id: string; meeting_id: string; owner_name: string | null; owner_speaker_id: string | null; text: string; due: string | null; source_ms: number | null; quote: string | null; done: boolean; version: number };
export type Decision = { id: string; text: string; source_ms: number | null; quote: string | null };
export type Highlight = { id: string; start_ms: number; end_ms: number; note: string | null; created_live: boolean };
export type Clip = { id: string; start_ms: number; end_ms: number; title: string; share_token: string; views: number };
export type JobRow = { step: string; status: string; attempts: number; duration_ms: number | null; error: string | null };
export type InsightContent = GroundedSummary & {
  chapters?: { title: string; source_ms: number }[];
  open_questions?: { text: string; source_ms: number; quote: string }[];
  grounding?: { dropped: number };
};

export async function getMeeting(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [meeting] = await sql<{
    id: string; title: string; started_at: Date; duration_ms: number; status: string; source: string;
    media_path: string | null; media_mime: string | null; gist: string | null; error: string | null; stats: MeetingStats | null;
  }[]>`select id, title, started_at, duration_ms, status, source, media_path, media_mime, gist, error, stats from meetings where id = ${id}`;
  if (!meeting) return null;

  // Independent reads run concurrently on the pool.
  const [speakers, utterances, insight, decisions, actions, highlights, clips, jobs] = await Promise.all([
    sql<SpeakerRow[]>`select id, label, display_name, color, talk_ms, turns, longest_ms, name_confidence from speakers where meeting_id = ${id} order by label`,
    sql<Utterance[]>`select id, speaker_id, start_ms, end_ms, text from utterances where meeting_id = ${id} order by start_ms, id`,
    sql<{ content: InsightContent; model: string }[]>`select content, model from insights where meeting_id = ${id} and template = 'general'`,
    sql<Decision[]>`select id, text, source_ms, quote from decisions where meeting_id = ${id} order by source_ms nulls last`,
    sql<ActionItem[]>`select id, meeting_id, owner_name, owner_speaker_id, text, due, source_ms, quote, done, version from action_items where meeting_id = ${id} order by source_ms nulls last`,
    sql<Highlight[]>`select id, start_ms, end_ms, note, created_live from highlights where meeting_id = ${id} order by start_ms`,
    sql<Clip[]>`select id, start_ms, end_ms, title, share_token, views from clips where meeting_id = ${id} order by created_at desc`,
    sql<JobRow[]>`select step, status, attempts, duration_ms, error from jobs where meeting_id = ${id} order by id`,
  ]);
  return { meeting, speakers, utterances: utterances.map((u) => ({ ...u, id: Number(u.id) })), insight: insight[0] ?? null, decisions, actions, highlights, clips, jobs };
}
export type MeetingData = NonNullable<Awaited<ReturnType<typeof getMeeting>>>;

export type InboxItem = ActionItem & { meeting_title: string; started_at: Date; owner_color: string | null };
export async function listActionItems(): Promise<InboxItem[]> {
  return sql<InboxItem[]>`
    select a.id, a.meeting_id, a.owner_name, a.owner_speaker_id, a.text, a.due, a.source_ms, a.quote, a.done, a.version,
           m.title as meeting_title, m.started_at, s.color as owner_color
    from action_items a
    join meetings m on m.id = a.meeting_id
    left join speakers s on s.id = a.owner_speaker_id
    order by a.done, m.started_at desc, a.source_ms`;
}

export async function getClip(token: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const [clip] = await sql<(Clip & { meeting_id: string; meeting_title: string; started_at: Date; media_path: string; media_mime: string | null })[]>`
    update clips c set views = views + 1
    from meetings m
    where c.share_token = ${token} and m.id = c.meeting_id
    returning c.id, c.start_ms, c.end_ms, c.title, c.share_token, c.views, c.meeting_id,
              m.title as meeting_title, m.started_at, m.media_path, m.media_mime`;
  if (!clip) return null;
  const [speakers, utterances] = await Promise.all([
    sql<SpeakerRow[]>`select id, label, display_name, color, talk_ms, turns, longest_ms, name_confidence from speakers where meeting_id = ${clip.meeting_id}`,
    // Range scan on (meeting_id, start_ms): only the clip's lines.
    sql<Utterance[]>`select id, speaker_id, start_ms, end_ms, text from utterances
                     where meeting_id = ${clip.meeting_id} and end_ms > ${clip.start_ms} and start_ms < ${clip.end_ms}
                     order by start_ms, id`,
  ]);
  return { clip, speakers, utterances: utterances.map((u) => ({ ...u, id: Number(u.id) })) };
}
