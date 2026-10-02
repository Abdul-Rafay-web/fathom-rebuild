// Renders each seed script to multi-voice audio with Deepgram Aura TTS.
// - Every line is synthesized with its speaker's voice (cached per line, so a
//   re-run only fetches what's missing).
// - Lines are laid on a timeline with natural 250-750 ms gaps; lines marked
//   `overlap` start before the previous speaker finishes and are *mixed*
//   (summed with clipping), producing real crosstalk for the diarizer.
// - The mix is encoded to 48 kbps mono MP3 (an hour is ~21 MB, under the
//   50 MB storage limit) and the true per-line timings are saved alongside,
//   which lets us score diarization later.
//
//   node scripts/seed/render-audio.mjs [slug...]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { loadEnv } from '../env.mjs';
import { installDnsFallback } from '../net.mjs';
import { PEOPLE } from './specs.mjs';

loadEnv();
installDnsFallback();

const RATE = 16000;
const SCRIPTS = path.resolve('seed/scripts');
const CACHE = path.resolve('seed/.cache');
const AUDIO = path.resolve('seed/audio');
fs.mkdirSync(AUDIO, { recursive: true });

const voiceOf = Object.fromEntries(Object.values(PEOPLE).map((p) => [p.name, p.voice]));

// Deterministic PRNG so a re-render produces identical audio.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

async function tts(text, voice, file) {
  if (fs.existsSync(file)) return fs.readFileSync(file);
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(`https://api.deepgram.com/v1/speak?model=${voice}&encoding=linear16&sample_rate=${RATE}&container=none`, {
        method: 'POST',
        headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
      const buf = Buffer.from(await res.arrayBuffer());
      fs.writeFileSync(file, buf);
      return buf;
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt + Math.random() * 500));
    }
  }
}

// Bounded concurrency pool: keeps N requests in flight without overwhelming the API.
async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      if (++done % 25 === 0) process.stdout.write(`${done}/${items.length} `);
    }
  }));
  return out;
}

const only = process.argv.slice(2);
for (const f of fs.readdirSync(SCRIPTS).filter((f) => f.endsWith('.json') && !f.endsWith('.timing.json'))) {
  const script = JSON.parse(fs.readFileSync(path.join(SCRIPTS, f), 'utf8'));
  if (only.length && !only.includes(script.slug)) continue;
  const out = path.join(AUDIO, `${script.slug}.mp3`);
  if (fs.existsSync(out)) { console.log('skip', script.slug); continue; }

  const dir = path.join(CACHE, script.slug);
  fs.mkdirSync(dir, { recursive: true });
  console.log(`${script.slug}: synthesizing ${script.lines.length} lines`);
  const clips = await pool(script.lines, 6, (l, i) => {
    const voice = voiceOf[l.speaker];
    if (!voice) throw new Error(`no voice for ${l.speaker}`);
    return tts(l.text, voice, path.join(dir, `${i}.pcm`));
  });
  console.log();

  // Lay out the timeline.
  const rand = mulberry32(hash(script.slug));
  const ms = (samples) => Math.round((samples / RATE) * 1000);
  let cursor = Math.round(RATE * 0.6);
  let prevEnd = cursor;
  const placed = clips.map((buf, i) => {
    const n = buf.length / 2;
    let start;
    if (script.lines[i].overlap && i > 0) {
      start = Math.max(prevEnd - Math.round(RATE * (0.5 + rand() * 0.6)), prevEnd - Math.floor((clips[i - 1].length / 2) * 0.5));
    } else {
      start = prevEnd + Math.round(RATE * (0.25 + rand() * 0.5));
    }
    prevEnd = Math.max(prevEnd, start + n);
    cursor = Math.max(cursor, start + n);
    return { start, n };
  });
  const total = cursor + RATE;
  const mix = new Int16Array(total);
  placed.forEach(({ start }, i) => {
    const src = new Int16Array(clips[i].buffer, clips[i].byteOffset, clips[i].length / 2);
    for (let k = 0; k < src.length; k++) {
      const v = mix[start + k] + src[k];
      mix[start + k] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
    }
  });

  const raw = path.join(dir, 'mix.pcm');
  fs.writeFileSync(raw, Buffer.from(mix.buffer));
  const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 's16le', '-ar', String(RATE), '-ac', '1', '-i', raw,
    '-c:a', 'libmp3lame', '-b:a', '48k', out], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed');
  fs.rmSync(raw);
  fs.writeFileSync(path.join(SCRIPTS, `${script.slug}.timing.json`), JSON.stringify(
    placed.map(({ start, n }, i) => ({ speaker: script.lines[i].speaker, start_ms: ms(start), end_ms: ms(start + n) })),
  ));
  console.log(`wrote ${out} (${(fs.statSync(out).size / 1e6).toFixed(1)} MB, ${(total / RATE / 60).toFixed(1)} min)`);
}
