import 'server-only';
import { sql } from './db';
import { embed, toPgVector } from './ai/gemini';

// Hybrid retrieval over transcript chunks.
//
// Keyword search (Postgres full text, GIN index) is precise for names, numbers
// and jargon ("SSO", "3.8 release"). Semantic search (pgvector HNSW) catches
// paraphrase ("who's on the hook for hiring?" → "open the job postings").
// Their scores live on different scales, so they're merged with Reciprocal
// Rank Fusion: score = Σ 1/(k + rank). RRF needs no score normalization or
// tuning and is robust when one retriever returns nothing.

const RRF_K = 60;
const CANDIDATES = 40;
// Cosine-distance cut-off for the semantic arm, calibrated on this corpus:
// relevant queries' best matches sit at 0.29–0.41, unrelated queries ("banana
// bread recipe") never get below 0.475. Without it, vector search always returns
// its top-k, however irrelevant.
const MAX_DISTANCE = 0.43;

export type Hit = {
  chunk_id: number;
  meeting_id: string;
  meeting_title: string;
  started_at: Date;
  start_ms: number;
  end_ms: number;
  speakers: string[];
  text: string;
  snippet: string;
  moment_ms: number;
  score: number;
  kw: boolean;
  sem: boolean;
};

// Query embeddings are cached per instance: repeated and paginated searches
// skip the embedding round trip. A Map keeps insertion order, so evicting the
// first key gives LRU behaviour when entries are re-inserted on hit.
const qcache = new Map<string, number[]>();
async function queryVector(q: string) {
  const k = q.trim().toLowerCase();
  const hit = qcache.get(k);
  if (hit) { qcache.delete(k); qcache.set(k, hit); return hit; }
  const [v] = await embed([q], 'RETRIEVAL_QUERY');
  qcache.set(k, v);
  if (qcache.size > 500) qcache.delete(qcache.keys().next().value!);
  return v;
}

export async function hybridSearch(q: string, opts: { workspaceId: string; meetingId?: string; limit?: number }): Promise<Hit[]> {
  const limit = opts.limit ?? 20;
  let vec: string | null = null;
  try {
    vec = toPgVector(await queryVector(q));
  } catch {
    vec = null; // embeddings unavailable: degrade to keyword-only rather than fail
  }
  // Tenancy: candidates are restricted to the workspace's meetings in BOTH arms,
  // before ranking, so another workspace's chunks can never surface or skew RRF.
  const scope = opts.meetingId
    ? sql`and c.meeting_id = ${opts.meetingId}`
    : sql`and c.meeting_id in (select id from meetings where workspace_id = ${opts.workspaceId})`;

  const rows = await sql<Omit<Hit, 'moment_ms'>[]>`
    with q as (select websearch_to_tsquery('english', ${q}) as tsq),
    kw as (
      select c.id, row_number() over (order by ts_rank_cd(c.tsv, q.tsq, 32) desc) as r
      from chunks c, q
      where c.tsv @@ q.tsq ${scope}
      order by ts_rank_cd(c.tsv, q.tsq, 32) desc
      limit ${CANDIDATES}
    ),
    sem as (
      ${vec
        ? sql`select c.id, row_number() over (order by c.embedding <=> ${vec}::vector) as r
              from chunks c where c.embedding is not null ${scope}
                and (c.embedding <=> ${vec}::vector) < ${MAX_DISTANCE}
              order by c.embedding <=> ${vec}::vector
              limit ${CANDIDATES}`
        : sql`select null::bigint as id, null::bigint as r where false`}
    ),
    fused as (
      select coalesce(kw.id, sem.id) as id,
             coalesce(1.0 / (${RRF_K} + kw.r), 0) + coalesce(1.0 / (${RRF_K} + sem.r), 0) as score,
             kw.id is not null as kw, sem.id is not null as sem
      from kw full outer join sem on kw.id = sem.id
    )
    select c.id as chunk_id, c.meeting_id, m.title as meeting_title, m.started_at,
           c.start_ms, c.end_ms, c.speakers, c.text, f.score, f.kw, f.sem,
           ts_headline('english', c.text, q.tsq,
             'StartSel=«, StopSel=», MaxWords=38, MinWords=18, ShortWord=2, MaxFragments=1') as snippet
    from fused f
    join chunks c on c.id = f.id
    join meetings m on m.id = c.meeting_id
    cross join q
    order by f.score desc
    limit ${limit}`;

  if (!rows.length) return [];

  // Pin each hit to the exact line inside its chunk: the first utterance that
  // matches the keywords, else the chunk start.
  const moments = await sql<{ chunk_id: number; moment_ms: number }[]>`
    with q as (select websearch_to_tsquery('english', ${q}) as tsq)
    select c.id as chunk_id,
           coalesce((select min(u.start_ms) from utterances u
                     where u.meeting_id = c.meeting_id and u.start_ms between c.start_ms and c.end_ms
                       and u.tsv @@ q.tsq), c.start_ms) as moment_ms
    from chunks c, q
    where c.id = any(${rows.map((r) => r.chunk_id)})`;
  const mm = new Map(moments.map((m) => [Number(m.chunk_id), m.moment_ms]));
  return rows.map((r) => ({ ...r, chunk_id: Number(r.chunk_id), moment_ms: mm.get(Number(r.chunk_id)) ?? r.start_ms }));
}
