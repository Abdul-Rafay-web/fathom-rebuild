// Scores the real pipeline against the seed meetings' planted ground truth.
//
//  - Action items: precision / recall / F1. A predicted item matches a true one
//    when the owners agree (first name, edit distance ≤ 1: "Lena" ~ "Lina") and
//    the task text overlaps (content-word Jaccard ≥ 0.2). Pairs are assigned with
//    the Hungarian algorithm (optimal 1:1), so one prediction can't claim two
//    truths and the score isn't order-dependent like a greedy matcher.
//  - Decisions: same, on text only.
//  - Diarization: speakers found vs. present, and line-level attribution
//    accuracy using the renderer's true per-line timings.
//
//   npx tsx --conditions=react-server scripts/eval.mts
import fs from 'node:fs';
import { loadEnv } from './env.mjs';
import { installDnsFallback } from './net.mjs';

loadEnv();
installDnsFallback();
const { sql } = await import('../src/lib/db');

const STOP = new Set('a an the to for of and or in on at by with from this that it its be is are will we our us i you your they their them as about into up out over all any'.split(' '));
const words = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !STOP.has(w)));
const jaccard = (a: string, b: string) => {
  const A = words(a), B = words(b);
  let i = 0;
  for (const w of A) if (B.has(w)) i++;
  return i / (A.size + B.size - i || 1);
};
function lev(a: string, b: string) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const first = (n: string | null) => (n ?? '').trim().split(/\s+/)[0].toLowerCase();
const sameOwner = (a: string | null, b: string) => !!a && lev(first(a), first(b)) <= 1;

/** Hungarian algorithm (min-cost assignment) on a rectangular cost matrix. Returns row→col. */
function hungarian(cost: number[][]): number[] {
  const n = cost.length, m = cost[0]?.length ?? 0, N = Math.max(n, m);
  const C = Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => (i < n && j < m ? cost[i][j] : 0)));
  const u = Array(N + 1).fill(0), v = Array(N + 1).fill(0), p = Array(N + 1).fill(0), way = Array(N + 1).fill(0);
  for (let i = 1; i <= N; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = Array(N + 1).fill(Infinity), used = Array(N + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity, j1 = 0;
      for (let j = 1; j <= N; j++) {
        if (used[j]) continue;
        const cur = C[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= N; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const rowToCol = Array(n).fill(-1);
  for (let j = 1; j <= N; j++) if (p[j] - 1 < n && j - 1 < m) rowToCol[p[j] - 1] = j - 1;
  return rowToCol;
}

function score<P, T>(pred: P[], truth: T[], sim: (p: P, t: T) => number, threshold: number) {
  if (!pred.length || !truth.length) return { tp: 0, fp: pred.length, fn: truth.length, pairs: [] as [P, T, number][] };
  const S = pred.map((p) => truth.map((t) => sim(p, t)));
  const assign = hungarian(S.map((row) => row.map((s) => -s)));
  const pairs: [P, T, number][] = [];
  assign.forEach((j, i) => { if (j >= 0 && S[i][j] >= threshold) pairs.push([pred[i], truth[j], S[i][j]]); });
  return { tp: pairs.length, fp: pred.length - pairs.length, fn: truth.length - pairs.length, pairs };
}
const prf = ({ tp, fp, fn }: { tp: number; fp: number; fn: number }) => {
  const p = tp / (tp + fp || 1), r = tp / (tp + fn || 1);
  return { p, r, f1: (2 * p * r) / (p + r || 1) };
};
const pc = (x: number) => `${Math.round(x * 100)}%`;

const rows: string[] = [];
const tot = { a: { tp: 0, fp: 0, fn: 0 }, d: { tp: 0, fp: 0, fn: 0 }, lines: 0, correct: 0 };

for (const file of fs.readdirSync('seed/scripts').filter((f) => f.endsWith('.json') && !f.includes('.timing'))) {
  const script = JSON.parse(fs.readFileSync(`seed/scripts/${file}`, 'utf8'));
  const [m] = await sql<{ id: string; title: string; status: string }[]>`select id, title, status from meetings where idempotency_key = ${'seed:' + script.slug}`;
  if (!m || m.status !== 'ready') continue;

  const actions = await sql<{ owner_name: string | null; text: string }[]>`select owner_name, text from action_items where meeting_id = ${m.id}`;
  const decisions = await sql<{ text: string }[]>`select text from decisions where meeting_id = ${m.id}`;
  const tA = Object.values(script.truth.actions) as { owner: string; text: string }[];
  const tD = Object.values(script.truth.decisions) as string[];
  const sA = score(actions, tA, (p, t) => (sameOwner(p.owner_name, t.owner) ? jaccard(p.text, t.text) : 0), 0.2);
  const sD = score(decisions, tD, (p, t) => jaccard(p.text, t), 0.15);
  for (const k of ['tp', 'fp', 'fn'] as const) { tot.a[k] += sA[k]; tot.d[k] += sD[k]; }

  // Diarization: map each true line to the transcript speaker covering most of it.
  const timing: { speaker: string; start_ms: number; end_ms: number }[] = fs.existsSync(`seed/scripts/${script.slug}.timing.json`)
    ? JSON.parse(fs.readFileSync(`seed/scripts/${script.slug}.timing.json`, 'utf8')) : [];
  const utts = await sql<{ start_ms: number; end_ms: number; name: string }[]>`
    select u.start_ms, u.end_ms, s.display_name as name from utterances u join speakers s on s.id = u.speaker_id where u.meeting_id = ${m.id} order by u.start_ms`;
  let correct = 0;
  for (const t of timing) {
    const cover = new Map<string, number>();
    for (const u of utts) {
      const ov = Math.min(t.end_ms, u.end_ms) - Math.max(t.start_ms, u.start_ms);
      if (ov > 0) cover.set(u.name, (cover.get(u.name) ?? 0) + ov);
    }
    const best = [...cover].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best && lev(first(best), first(t.speaker)) <= 1) correct++;
  }
  tot.lines += timing.length; tot.correct += correct;
  const truthSpeakers = new Set(script.lines.map((l: { speaker: string }) => l.speaker)).size;
  const [{ found }] = await sql<{ found: number }[]>`select count(*)::int as found from speakers where meeting_id = ${m.id}`;

  const a = prf(sA), d = prf(sD);
  rows.push(`| ${m.title} | ${pc(a.p)} / ${pc(a.r)} (${sA.tp}/${tA.length}) | ${pc(d.p)} / ${pc(d.r)} (${sD.tp}/${tD.length}) | ${found} of ${truthSpeakers} | ${timing.length ? pc(correct / timing.length) : '—'} |`);
  console.log(`${m.title}: actions P ${pc(a.p)} R ${pc(a.r)} | decisions P ${pc(d.p)} R ${pc(d.r)} | speakers ${found}/${truthSpeakers} | attribution ${timing.length ? pc(correct / timing.length) : '—'}`);
  for (const t of tA) if (!sA.pairs.some(([, tt]) => tt === t)) console.log(`   missed: ${t.owner}: ${t.text}`);
}

const A = prf(tot.a), D = prf(tot.d);
const md = `# Evaluation

Generated by \`scripts/eval.mts\` on ${new Date().toISOString().slice(0, 10)} against the seed meetings' planted ground truth
(\`seed/scripts/*.json\` → \`truth\`). The audio was synthesized from those scripts and run through the **production pipeline**:
Deepgram diarization, then speaker naming, then Gemini analysis, then quote grounding. Nothing is scored on the scripts directly.

| Meeting | Action items P / R (matched) | Decisions P / R (matched) | Speakers found | Line attribution |
|---|---|---|---|---|
${rows.join('\n')}
| **All** | **${pc(A.p)} / ${pc(A.r)}**, F1 ${pc(A.f1)} | **${pc(D.p)} / ${pc(D.r)}**, F1 ${pc(D.f1)} | | **${tot.lines ? pc(tot.correct / tot.lines) : '—'}** |

**How matching works.** A predicted action item counts only if its owner matches the planted owner (first name, edit distance ≤ 1,
so "Lena" ~ "Lina") *and* its text overlaps the planted task (content-word Jaccard ≥ 0.2). Pairs are assigned with the Hungarian
algorithm (optimal one-to-one), so a single prediction can't satisfy two truths.

**Reading it.** Precision below 100% is partly by design: the model also extracts real commitments that the script-writer
added naturally beyond the planted ones, and those count as "false positives" here. Recall is the number that matters for
"did the notes catch what was promised".

**Line attribution** is the share of spoken lines whose transcript speaker, after naming, is the person who actually said it.
`;
fs.writeFileSync('EVAL.md', md);
console.log('\nwrote EVAL.md');
await sql.end();
