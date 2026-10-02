// Uploads rendered seed audio and runs it through the production pipeline
// (same code path as a user upload: storage → jobs → transcribe → … → index).
// Idempotent: a meeting is keyed by `seed:<slug>`; re-running re-processes it.
//
//   npx tsx --conditions=react-server scripts/seed/ingest.mts [slug...]
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../env.mjs';
import { installDnsFallback } from '../net.mjs';

loadEnv();
installDnsFallback();

const { MEETINGS } = await import('./specs.mjs');
const { sql } = await import('../../src/lib/db');
const { storageAdmin } = await import('../../src/lib/storage');
const { reset } = await import('../../src/lib/pipeline/queue');
const { runJobs } = await import('../../src/lib/pipeline/runner');

const only = process.argv.slice(2);
for (const m of MEETINGS as { slug: string; title: string; started_at: string }[]) {
  if (only.length && !only.includes(m.slug)) continue;
  const file = path.resolve('seed/audio', `${m.slug}.mp3`);
  if (!fs.existsSync(file)) { console.log('no audio yet for', m.slug); continue; }

  const key = `seed/${m.slug}.mp3`;
  const { error } = await storageAdmin().upload(key, fs.readFileSync(file), { contentType: 'audio/mpeg', upsert: true });
  if (error) throw error;

  const [row] = await sql<{ id: string }[]>`
    insert into meetings (title, started_at, source, media_path, media_mime, idempotency_key, workspace_id)
    values (${m.title}, ${m.started_at}, 'seed', ${key}, 'audio/mpeg', ${'seed:' + m.slug}, '00000000-0000-4000-8000-00000000de30')
    on conflict (idempotency_key) do update
      set title = excluded.title, started_at = excluded.started_at, media_path = excluded.media_path
    returning id`;
  await reset(row.id);
  console.log(`${m.slug} → ${row.id}`);
  const t0 = Date.now();
  const ran = await runJobs({ meetingId: row.id, budgetMs: 15 * 60_000 });
  for (const r of ran) console.log(`  ${r.ok ? '✓' : '✗'} ${r.step.padEnd(14)} ${(r.ms / 1000).toFixed(1)}s ${r.error ?? ''}`);
  const [st] = await sql`select status, error, title, speaker_count, duration_ms from meetings where id = ${row.id}`;
  console.log(`  → ${st.status} in ${((Date.now() - t0) / 1000).toFixed(0)}s`, st.error ?? '', `| ${st.speaker_count} speakers, ${(st.duration_ms / 60000).toFixed(1)} min`);
}
await sql.end();
