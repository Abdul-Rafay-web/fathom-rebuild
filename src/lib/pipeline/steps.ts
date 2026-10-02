// Pipeline steps. Each one is idempotent: it replaces its own outputs inside a
// transaction, so a retry after a crash (or a manual re-run) converges to the
// same state instead of duplicating rows.
import { createHash } from 'node:crypto';
import { sql } from '../db';
import { transcribeUrl } from '../ai/deepgram';
import { embed, generateJSON, MODELS, toPgVector } from '../ai/gemini';
import { signedReadUrl } from '../storage';
import { Grounder } from '../algo/align';
import { chunkUtterances } from '../algo/chunk';
import { computeStats, fingerprint } from '../algo/intervals';
import { clock, speakerColor } from '../format';
import {
  ANALYSIS_SYSTEM, AnalysisSchema, analysisPrompt, PROMPT_VERSION, SPEAKER_SYSTEM, SpeakerNamesSchema,
  SummarySchema, templatePrompt, type Summary, type TemplateId,
} from './prompts';
import type { Step } from './queue';

type Meeting = { id: string; title: string; media_path: string | null; source: string; started_at: Date; duration_ms: number };
export type TLine = { id: number; start_ms: number; end_ms: number; text: string; speaker_id: string | null; label: number; name: string };

async function meeting(id: string) {
  const [m] = await sql<Meeting[]>`select id, title, media_path, source, started_at, duration_ms from meetings where id = ${id}`;
  if (!m) throw new Error(`meeting ${id} not found`);
  return m;
}

export async function loadLines(meetingId: string): Promise<TLine[]> {
  return sql<TLine[]>`
    select u.id, u.start_ms, u.end_ms, u.text, u.speaker_id, s.label, s.display_name as name
    from utterances u left join speakers s on s.id = u.speaker_id
    where u.meeting_id = ${meetingId}
    order by u.start_ms, u.id`;
}

const renderTranscript = (lines: TLine[]) =>
  lines.map((l, i) => `L${i} [${clock(l.start_ms)}] ${l.name}: ${l.text}`).join('\n');

// ------------------------------------------------------------------ transcribe
async function transcribe(meetingId: string) {
  const m = await meeting(meetingId);
  if (!m.media_path) throw new Error('meeting has no media');
  const url = await signedReadUrl(m.media_path, 60 * 30);
  const vocab = await sql<{ term: string }[]>`select term from vocabulary order by kind, term limit 100`;
  const dg = await transcribeUrl(url, vocab.map((v) => v.term));
  if (!dg.utterances.length) throw new Error('no speech detected in the recording');

  const labels = [...new Set(dg.utterances.map((u) => u.speaker))].sort((a, b) => a - b);
  await sql.begin(async (tx) => {
    await tx`delete from utterances where meeting_id = ${meetingId}`;
    await tx`delete from speakers where meeting_id = ${meetingId}`;
    const spk = await tx<{ id: string; label: number }[]>`
      insert into speakers ${tx(labels.map((label) => ({
        meeting_id: meetingId, label, display_name: `Speaker ${label + 1}`, color: speakerColor(label),
      })))}
      returning id, label`;
    const idOf = new Map(spk.map((s) => [s.label, s.id]));
    // Batched multi-row inserts: one round trip per 500 rows instead of per line.
    for (let i = 0; i < dg.utterances.length; i += 500) {
      await tx`insert into utterances ${tx(dg.utterances.slice(i, i + 500).map((u) => ({
        meeting_id: meetingId, speaker_id: idOf.get(u.speaker)!, start_ms: u.start_ms, end_ms: u.end_ms, text: u.text,
      })))}`;
    }
    await tx`update meetings set duration_ms = ${dg.duration_ms}, speaker_count = ${labels.length} where id = ${meetingId}`;
  });
}

// ------------------------------------------------------------------ name_speakers
async function nameSpeakers(meetingId: string) {
  const lines = await loadLines(meetingId);
  const labels = [...new Set(lines.map((l) => l.label))];
  if (labels.length === 0) return;

  // Keep the prompt small even for an hour-long meeting: the opening (where
  // intros happen) plus every line containing a capitalized vocative-ish word,
  // plus the line right after it (the reply that identifies the addressee).
  const keep = new Set<number>();
  lines.forEach((l, i) => {
    if (l.start_ms < 4 * 60_000) keep.add(i);
    if (/\b(I'm|I am|this is|my name)\b|,\s*[A-Z][a-z]+[?.!,]|\b(thanks|thank you|over to you|go ahead)\s*,?\s*[A-Z][a-z]+/i.test(l.text)) {
      keep.add(i);
      if (i + 1 < lines.length) keep.add(i + 1);
    }
  });
  const excerpt = [...keep].sort((a, b) => a - b).slice(0, 400)
    .map((i) => `L${i} [${clock(lines[i].start_ms)}] Speaker ${lines[i].label}: ${lines[i].text}`).join('\n');

  const { data } = await generateJSON({
    models: MODELS.fast,
    system: SPEAKER_SYSTEM,
    prompt: `Labels present: ${labels.map((l) => `Speaker ${l}`).join(', ')}\n\n<transcript>\n${excerpt}\n</transcript>`,
    schema: SpeakerNamesSchema,
    temperature: 0,
  });

  // Accept confident, unique names only; a wrong name is worse than "Speaker 3".
  const seen = new Set<string>();
  const accepted = data.speakers
    .filter((s) => labels.includes(s.label) && s.name.trim() && s.confidence >= 0.6)
    .sort((a, b) => b.confidence - a.confidence)
    .filter((s) => {
      const k = s.name.trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  await sql.begin(async (tx) => {
    for (const s of accepted) {
      await tx`
        update speakers set display_name = ${s.name.trim()}, name_confidence = ${s.confidence}
        where meeting_id = ${meetingId} and label = ${s.label}
          -- a name set by hand (no confidence, not a placeholder) is never overwritten
          and (display_name like 'Speaker %' or name_confidence is not null)`;
    }
  });
}

// ------------------------------------------------------------------ stats
async function stats(meetingId: string) {
  const m = await meeting(meetingId);
  const lines = await loadLines(meetingId);
  const duration = Math.max(m.duration_ms, lines.at(-1)?.end_ms ?? 0);
  const ivs = lines.map((l) => ({ start_ms: l.start_ms, end_ms: l.end_ms, speaker: l.label, text: l.text }));
  const s = { ...computeStats(ivs, duration), fingerprint: fingerprint(ivs, duration) };
  await sql.begin(async (tx) => {
    for (const [label, v] of Object.entries(s.speakers)) {
      await tx`update speakers set talk_ms = ${v.talk_ms}, turns = ${v.turns}, longest_ms = ${v.longest_ms}
               where meeting_id = ${meetingId} and label = ${Number(label)}`;
    }
    await tx`update meetings set stats = ${tx.json(s as never)} where id = ${meetingId}`;
  });
}

// ------------------------------------------------------------------ analyse
const cacheKey = (transcript: string, template: string) =>
  createHash('sha256').update(PROMPT_VERSION).update('\0').update(template).update('\0').update(transcript).digest('hex');

function metaLine(m: Meeting, lines: TLine[]) {
  const names = [...new Set(lines.map((l) => l.name))];
  return `Meeting: "${m.title}" on ${m.started_at.toISOString().slice(0, 10)}, ${clock(lines.at(-1)?.end_ms ?? 0)} long. Participants: ${names.join(', ')}.`;
}

type Grounded<T> = T & { source_ms: number; line: number };
function groundAll<T extends { line: number; quote: string }>(g: Grounder, lines: TLine[], xs: T[]): Grounded<T>[] {
  const out: Grounded<T>[] = [];
  for (const x of xs) {
    const i = g.ground(x.line, x.quote);
    if (i != null) out.push({ ...x, line: i, source_ms: lines[i].start_ms });
  }
  return out;
}

export type GroundedSummary = { sections: { heading: string; points: Grounded<Summary['sections'][number]['points'][number]>[] }[] };

function groundSummary(g: Grounder, lines: TLine[], s: Summary): GroundedSummary {
  return {
    sections: s.sections
      .map((sec) => ({ heading: sec.heading, points: groundAll(g, lines, sec.points) }))
      .filter((sec) => sec.points.length),
  };
}

async function analyse(meetingId: string) {
  const m = await meeting(meetingId);
  const lines = await loadLines(meetingId);
  const transcript = renderTranscript(lines);
  const { data, model } = await generateJSON({
    models: MODELS.analysis,
    system: ANALYSIS_SYSTEM,
    prompt: analysisPrompt(transcript, metaLine(m, lines), 'general'),
    schema: AnalysisSchema,
  });

  const g = new Grounder(lines);
  const summary = groundSummary(g, lines, data);
  const decisions = groundAll(g, lines, data.decisions);
  const actions = groundAll(g, lines, data.action_items);
  const questions = groundAll(g, lines, data.open_questions);
  const chapters = data.chapters
    .filter((c) => c.line >= 0 && c.line < lines.length)
    .map((c) => ({ title: c.title, source_ms: lines[c.line].start_ms }))
    .sort((a, b) => a.source_ms - b.source_ms);
  const dropped =
    data.sections.reduce((a, s) => a + s.points.length, 0) - summary.sections.reduce((a, s) => a + s.points.length, 0) +
    (data.decisions.length - decisions.length) + (data.action_items.length - actions.length);

  const speakers = await sql<{ id: string; display_name: string }[]>`
    select id, display_name from speakers where meeting_id = ${meetingId}`;
  const ownerId = (name: string) => {
    const n = name.trim().toLowerCase();
    return speakers.find((s) => s.display_name.toLowerCase() === n || s.display_name.toLowerCase().split(' ')[0] === n.split(' ')[0])?.id ?? null;
  };

  await sql.begin(async (tx) => {
    await tx`
      insert into insights (meeting_id, template, cache_key, content, model)
      values (${meetingId}, 'general', ${cacheKey(transcript, 'general')},
              ${tx.json({ ...summary, chapters, open_questions: questions, grounding: { dropped } } as never)}, ${model})
      on conflict (meeting_id, template) do update
        set cache_key = excluded.cache_key, content = excluded.content, model = excluded.model, created_at = now()`;
    await tx`delete from decisions where meeting_id = ${meetingId}`;
    if (decisions.length) {
      await tx`insert into decisions ${tx(decisions.map((d) => ({
        meeting_id: meetingId, text: d.text, source_ms: d.source_ms, quote: d.quote,
      })))}`;
    }
    await tx`delete from action_items where meeting_id = ${meetingId}`;
    if (actions.length) {
      await tx`insert into action_items ${tx(actions.map((a) => ({
        meeting_id: meetingId, text: a.text, due: a.due || null, source_ms: a.source_ms, quote: a.quote,
        owner_name: a.owner === 'Unassigned' ? null : a.owner, owner_speaker_id: a.owner === 'Unassigned' ? null : ownerId(a.owner),
      })))}`;
    }
    // Uploads get an AI title unless the user named the meeting.
    await tx`
      update meetings set gist = ${data.gist},
        title = case when source <> 'seed' and title like 'Untitled%' then ${data.title} else title end
      where id = ${meetingId}`;
  });
}

/** Summary for a non-default template, generated on demand and cached by content hash. */
export async function templateSummary(meetingId: string, template: TemplateId) {
  const lines = await loadLines(meetingId);
  const transcript = renderTranscript(lines);
  const key = cacheKey(transcript, template);
  const [hit] = await sql<{ content: GroundedSummary }[]>`
    select content from insights where meeting_id = ${meetingId} and template = ${template} and cache_key = ${key}`;
  if (hit) return hit.content;

  const m = await meeting(meetingId);
  const { data, model } = await generateJSON({
    models: MODELS.analysis,
    system: ANALYSIS_SYSTEM,
    prompt: templatePrompt(transcript, metaLine(m, lines), template),
    schema: SummarySchema,
  });
  const content = groundSummary(new Grounder(lines), lines, data);
  await sql`
    insert into insights (meeting_id, template, cache_key, content, model)
    values (${meetingId}, ${template}, ${key}, ${sql.json(content as never)}, ${model})
    on conflict (meeting_id, template) do update
      set cache_key = excluded.cache_key, content = excluded.content, model = excluded.model, created_at = now()`;
  return content;
}

// ------------------------------------------------------------------ index
async function index(meetingId: string) {
  const lines = await loadLines(meetingId);
  const chunks = chunkUtterances(lines.map((l) => ({ start_ms: l.start_ms, end_ms: l.end_ms, speaker: l.name, text: l.text })));
  const vectors = await embed(chunks.map((c) => c.text), 'RETRIEVAL_DOCUMENT');
  await sql.begin(async (tx) => {
    await tx`delete from chunks where meeting_id = ${meetingId}`;
    for (let i = 0; i < chunks.length; i += 200) {
      await tx`insert into chunks ${tx(chunks.slice(i, i + 200).map((c, j) => ({
        meeting_id: meetingId, start_ms: c.start_ms, end_ms: c.end_ms, speakers: c.speakers, text: c.text,
        embedding: toPgVector(vectors[i + j]),
      })))}`;
    }
  });
}

export const RUNNERS: Record<Step, (meetingId: string) => Promise<void>> = {
  transcribe,
  name_speakers: nameSpeakers,
  stats,
  analyse,
  index,
};
