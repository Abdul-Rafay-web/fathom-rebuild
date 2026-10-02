#!/usr/bin/env node
// 8x agent capture hook for Claude Code.
// Wired in .claude/settings.json to three lifecycle events:
//   SessionStart     -> remembers the session's model (prompt events don't carry it)
//   UserPromptSubmit -> appends the verbatim prompt
//   Stop             -> appends the final assistant response for the turn
// Writes one file per session to .agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md
// Entries are append-only; only the frontmatter counters are refreshed.

const fs = require('fs');
const path = require('path');

const PROJECT = 'fathom-rebuild';
const AUTHOR = 'Abdul-Rafay-web';
const TOOL = 'claude-code';

const event = process.argv[2]; // session | prompt | stop

function readStdin() {
  try { return fs.readFileSync(0, 'utf8'); } catch { return ''; }
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function readTranscript(p) {
  if (!p || !fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

// Real user prompts (not tool results, not meta/injected messages).
function isUserPrompt(e) {
  if (e.type !== 'user' || e.isMeta || !e.message) return false;
  const c = e.message.content;
  if (typeof c === 'string') return true;
  return Array.isArray(c) && c.some((b) => b.type === 'text') && !c.some((b) => b.type === 'tool_result');
}

function lastModel(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const m = entries[i].message && entries[i].message.model;
    if (entries[i].type === 'assistant' && m && m !== '<synthetic>') return m;
  }
  return null;
}

// Final response = text blocks of the last assistant message (by message.id)
// after the last real user prompt. Claude Code writes one JSONL line per block.
function finalResponse(entries) {
  let start = 0;
  for (let i = entries.length - 1; i >= 0; i--) if (isUserPrompt(entries[i])) { start = i + 1; break; }
  let lastId = null;
  for (let i = entries.length - 1; i >= start; i--) {
    const e = entries[i];
    if (e.type === 'assistant' && Array.isArray(e.message?.content) && e.message.content.some((b) => b.type === 'text' && b.text.trim())) {
      lastId = e.message.id; break;
    }
  }
  if (!lastId) return null;
  const parts = [];
  for (let i = start; i < entries.length; i++) {
    const e = entries[i];
    if (e.type === 'assistant' && e.message?.id === lastId) {
      for (const b of e.message.content) if (b.type === 'text') parts.push(b.text);
    }
  }
  return { text: parts.join('\n\n'), model: entries.find((e) => e.message?.id === lastId)?.message?.model };
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}-${p(d.getUTCMinutes())}-${p(d.getUTCSeconds())}`;
}

function main() {
  let input = {};
  try { input = JSON.parse(readStdin() || '{}'); } catch { return; }
  const sid = input.session_id || 'unknown';
  const short = sid.slice(0, 8);
  const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
  const logDir = path.join(root, '.agent-logs');
  const stateDir = path.join(root, '.claude', 'capture-state');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const stateFile = path.join(stateDir, `${sid}.json`);
  let state = {};
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  const now = new Date();
  if (!state.file) state.file = `${stamp(now)}_${sid}.md`;
  if (!state.count) state.count = 0;

  if (event === 'session') {
    if (input.model) state.model = input.model;
    fs.writeFileSync(stateFile, JSON.stringify(state));
    return;
  }

  const logFile = path.join(logDir, state.file);
  let body = '';
  if (fs.existsSync(logFile)) {
    const raw = fs.readFileSync(logFile, 'utf8');
    const idx = raw.indexOf('\n---\n', raw.indexOf('\n# Session Log'));
    body = idx >= 0 ? raw.slice(idx + 5).replace(/^\n+/, '') : '';
  }

  let entry = '';
  const ts = now.toISOString();
  if (event === 'prompt') {
    const entries = readTranscript(input.transcript_path);
    const model = lastModel(entries) || state.model || process.env.ANTHROPIC_MODEL || 'unknown';
    state.count += 1;
    state.model = model;
    state.first = state.first || ts;
    state.last = ts;
    state.responded = false;
    entry = `[LOG_ENTRY type=PROMPT num=${state.count} session=${short}]\ntimestamp: ${ts}\nmodel: ${model}\n\n${input.prompt ?? ''}\n\n\n`;
  } else if (event === 'stop') {
    if (input.stop_hook_active) return;
    // The transcript can lag the Stop event slightly; retry briefly.
    let res = null;
    for (let i = 0; i < 10; i++) {
      res = finalResponse(readTranscript(input.transcript_path));
      if (res && res.text.trim()) break;
      sleep(250);
    }
    // No prompt recorded for this turn (hook installed mid-session, or the prompt
    // hook failed): recover the prompt from the transcript and tag its source.
    if (!state.count || state.responded === undefined) {
      const entries = readTranscript(input.transcript_path);
      for (let i = entries.length - 1; i >= 0; i--) {
        if (!isUserPrompt(entries[i])) continue;
        const c = entries[i].message.content;
        const ptext = typeof c === 'string' ? c : c.filter((b) => b.type === 'text').map((b) => b.text).join('\n\n');
        const pts = entries[i].timestamp || ts;
        state.count = (state.count || 0) + 1;
        state.first = state.first || pts;
        state.last = pts;
        state.responded = false;
        body += `[LOG_ENTRY type=PROMPT num=${state.count} session=${short} source=transcript]\ntimestamp: ${pts}\nmodel: ${res?.model || state.model || 'unknown'}\n\n${ptext}\n\n\n`;
        break;
      }
    }
    let text = (input.last_assistant_message && String(input.last_assistant_message).trim()) ? input.last_assistant_message : res?.text;
    if (!text) text = '(no text response captured)';
    const model = res?.model && res.model !== '<synthetic>' ? res.model : (state.model || 'unknown');
    state.model = model;
    // Turns triggered without a new prompt (e.g. background task wake-ups) are tagged as such.
    const tag = state.responded ? ' continuation=true' : '';
    state.responded = true;
    entry = `[LOG_ENTRY type=RESPONSE num=${state.count} session=${short}${tag}]\ntimestamp: ${ts}\nmodel: ${model}\n\n${text}\n\n\n`;
  } else {
    return;
  }

  const date = (state.first || ts).slice(0, 10);
  const header = `---\nsession_id: ${sid}\ndate: ${date}\nauthor: ${AUTHOR}\nmodel: ${state.model || 'unknown'}\ntool: ${TOOL}\nproject: ${PROJECT}\ntotal_exchanges: ${state.count}\nfirst_prompt_time: ${state.first || ts}\nlast_prompt_time: ${state.last || ts}\n---\n\n# Session Log - ${date}\n\nSession: \`${short}\` | Project: \`${PROJECT}\` | Author: \`${AUTHOR}\`\n\n---\n\n`;
  fs.writeFileSync(logFile, header + body + entry);
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

try { main(); } catch (e) {
  try { fs.appendFileSync(path.join(process.env.CLAUDE_PROJECT_DIR || process.cwd(), '.agent-logs', 'hook-errors.log'), `${new Date().toISOString()} ${event} ${e.stack}\n`); } catch {}
}
process.exit(0);
