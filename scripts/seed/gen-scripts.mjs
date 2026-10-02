// Generates realistic multi-speaker dialogue for each seed meeting with Gemini,
// one agenda segment at a time (long meetings stay coherent and within output
// limits). Each segment must make its planted decisions/action items happen in
// conversation. Output: seed/scripts/<slug>.json (committed, it's the ground truth).
// Resumable: finished meetings are skipped.
//
//   node scripts/seed/gen-scripts.mjs [slug...]
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from '../env.mjs';
import { installDnsFallback } from '../net.mjs';
import { MEETINGS, PEOPLE } from './specs.mjs';

loadEnv();
installDnsFallback();

const OUT = path.resolve('seed/scripts');
fs.mkdirSync(OUT, { recursive: true });
const MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
const WPM = 150;

const schema = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'string' },
          text: { type: 'string' },
          overlap: { type: 'boolean', description: 'true if this line cuts in before the previous speaker finished' },
        },
        required: ['speaker', 'text', 'overlap'],
      },
    },
  },
  required: ['lines'],
};

async function gemini(prompt) {
  let last;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.95, responseMimeType: 'application/json', responseJsonSchema: schema, maxOutputTokens: 32000 },
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(`${res.status} ${JSON.stringify(j.error).slice(0, 200)}`);
        const text = j.candidates[0].content.parts.map((p) => p.text ?? '').join('');
        return JSON.parse(text).lines;
      } catch (e) {
        last = e;
        console.warn(`  ${model} attempt ${attempt + 1} failed: ${e.message}`);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
  }
  throw last;
}

const only = process.argv.slice(2);
for (const m of MEETINGS) {
  if (only.length && !only.includes(m.slug)) continue;
  const file = path.join(OUT, `${m.slug}.json`);
  if (fs.existsSync(file)) { console.log('skip', m.slug); continue; }

  const cast = m.people.map((k) => `- ${PEOPLE[k].name}: ${PEOPLE[k].role}`).join('\n');
  const names = new Set(m.people.map((k) => PEOPLE[k].name));
  const lines = [];
  for (const [si, seg] of m.segments.entries()) {
    const words = seg.minutes * WPM;
    const planted = (seg.truth ?? []).map((id) => {
      const d = m.truth.decisions[id];
      if (d) return `- DECISION the group must explicitly agree on: ${d}`;
      const a = m.truth.actions[id];
      return `- ACTION ITEM: ${a.owner} commits to (or is clearly assigned): "${a.text}", due ${a.due}. The owner and the deadline must both be said out loud.`;
    });
    const recent = lines.slice(-14).map((l) => `${l.speaker}: ${l.text}`).join('\n');
    const prompt = `Write the transcript of part ${si + 1} of ${m.segments.length} of a real meeting, as spoken dialogue.

${m.context}

Participants:
${cast}

This part (~${seg.minutes} minutes, so about ${words} spoken words in total): ${seg.brief}
${planted.length ? `\nThese MUST happen naturally in this part:\n${planted.join('\n')}` : ''}
${recent ? `\nThe conversation so far ended with:\n${recent}\n\nContinue directly from there; don't re-introduce people or restart.` : ''}

How real meetings sound:
- People speak in short turns (1-4 sentences); occasionally someone talks longer to explain something.
- People address each other by first name regularly ("Lena, what's your read?", "Thanks, Arjun."), and in the first part everyone speaks early.
- Include natural spoken texture sparingly: "yeah", "I mean", a false start, a brief aside or joke, someone agreeing with "mm, right". Not every line.
- Mark overlap=true on about 1 in 12 lines, where someone cuts in.
- Use specific numbers, names and dates from the brief. No stage directions, no narration, no sound effects.
- Speaker must be exactly one of: ${[...names].join(', ')}.
- Reach about ${words} words. That is long; keep the discussion substantive and do not wrap up early${si < m.segments.length - 1 ? ' (the meeting continues after this part)' : ''}.`;

    process.stdout.write(`${m.slug} part ${si + 1}/${m.segments.length} … `);
    const out = (await gemini(prompt)).filter((l) => names.has(l.speaker) && l.text.trim());
    const wc = out.reduce((a, l) => a + l.text.split(/\s+/).length, 0);
    console.log(`${out.length} lines, ${wc} words`);
    lines.push(...out);
  }
  fs.writeFileSync(file, JSON.stringify({ slug: m.slug, title: m.title, truth: m.truth, lines }, null, 1));
  console.log('wrote', file);
}
