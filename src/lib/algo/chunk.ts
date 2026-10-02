// Retrieval chunks: consecutive utterances packed into ~30–60 s windows, cut
// preferably at a speaker change so a chunk reads as a coherent exchange.
// A search hit then lands on a *moment* rather than a whole meeting or an
// isolated half-sentence.

export type ChunkInput = { start_ms: number; end_ms: number; speaker: string; text: string };
export type Chunk = { start_ms: number; end_ms: number; speakers: string[]; text: string };

const MIN_MS = 30_000;
const MAX_MS = 60_000;
const MAX_CHARS = 1_800;

export function chunkUtterances(utts: ChunkInput[]): Chunk[] {
  const out: Chunk[] = [];
  let cur: ChunkInput[] = [];
  let chars = 0;

  const flush = () => {
    if (!cur.length) return;
    out.push({
      start_ms: cur[0].start_ms,
      end_ms: cur[cur.length - 1].end_ms,
      speakers: [...new Set(cur.map((u) => u.speaker))],
      text: cur.map((u) => `${u.speaker}: ${u.text}`).join('\n'),
    });
    cur = [];
    chars = 0;
  };

  for (let i = 0; i < utts.length; i++) {
    const u = utts[i];
    cur.push(u);
    chars += u.text.length + u.speaker.length + 2;
    const span = u.end_ms - cur[0].start_ms;
    const next = utts[i + 1];
    const speakerChange = next && next.speaker !== u.speaker;
    if (span >= MAX_MS || chars >= MAX_CHARS || (span >= MIN_MS && speakerChange)) flush();
  }
  flush();
  return out;
}
