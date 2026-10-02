# Fathom rebuild — product plan

## What I saw using Fathom (from `recon/`)

| Observation | Screenshot |
|---|---|
| Onboarding is good: one sentence ("Take notes on ___ and share with ___") plus a consent checkbox. | 103528 |
| In-call the bot shows **"Awaiting Attendees"** even though I am in the call. It is unclear whether it is recording. My notes: "confusing where it had to wait for attendees". | 114355 |
| Post-call card: Talk Time 100%, Monologues 0, plus a feedback ask. Nice moment, but nobody can act on it. | 114535 |
| The meeting page is a **narrow centre column**. The right ~40% of the screen holds only "Action Items: None detected". | 114630 |
| The transcript is chat bubbles: **no speaker name, no timestamp** on each line, and nothing follows the playhead. | 114653 |
| The summary is good (my notes: "AI generation was on point"), but **no bullet links back to the moment it came from**, so you can't verify it. | 114708 |
| 15+ summary templates, mostly sales methodologies (Sandler, SPICED, MEDDPICC, BANT…). Choice overload for most users. | 114719 |
| Ask Fathom works per call, with suggested prompts. | 114732 |
| Share is **whole recording or nothing**. | 114747 |
| The home page is a grid of thumbnails. Every one looks the same ("R" avatar on teal), so meetings are told apart only by title. | 115117 |

## The thesis

Fathom is very good at **capture**. Where it falls short is the **day after**, and that is the case the brief calls out: an hour-long, 8-person call.

Nobody re-watches an hour. People come back with one of three questions:

1. **"What do I have to do?"** → action items with an owner, a due date and the exact moment, collected across meetings.
2. **"What did we decide, and can I trust the summary?"** → every summary line and decision cites a timestamp, and one click plays that moment.
3. **"Where did we talk about X?"** → search that returns **moments** (speaker + timestamp + text), not just meetings.

Everything we build serves one of those three. Anything that doesn't gets cut.

## Two layers: live during the call, definitive after it

This is how Fathom works too, and the split is deliberate:

| | **Live layer** (during the call) | **Post-call pipeline** (after the call) |
|---|---|---|
| Goal | Speed: see words appear as they're spoken | Accuracy: the version you keep, share and search |
| Transcript | Deepgram **streaming** over WebSocket, ~300 ms latency, interim results that get corrected in place | Deepgram **pre-recorded**: whole-file diarization, better punctuation and speaker separation |
| AI | **Live action items**: a small model runs on each new ~60 s window of final text | Full-context summary, chapters, decisions, action items with an owner, speaker naming |
| Why both | You can't summarise a meeting that hasn't finished, and offline diarization is more accurate than streaming. The live transcript is shown instantly, then **swapped** for the definitive one when processing finishes. | |

This replaces the confusing "Awaiting Attendees" state from the recon: when you hit record, words appear. That is the proof that it's working.

### Live capture data path

```
Mic ─► AudioWorklet (audio thread) ─► ring buffer ─► main thread
         │ 48 kHz float → 16 kHz PCM16 downsample
         ├─► WebSocket ─► Deepgram streaming  (short-lived token, 30 s TTL,
         │                  ▲                   minted by our server; the
         │                  └ interim + final   real API key never reaches
         │                    results           the browser)
         └─► MediaRecorder ─► 5 s chunks ─► IndexedDB (crash-safe) ─► upload
                                                                 │
Highlight key (H) ─► timestamp from monotonic clock ─────────────┤
                                                                 ▼
                                               Stop ─► enqueue post-call job
```

### Post-call pipeline

```
upload complete
  └► jobs table (Postgres)  ◄── workers claim with FOR UPDATE SKIP LOCKED
       1. transcribe   Deepgram, diarize → utterances
       2. name speakers   LLM reads intros/addressing ("thanks, Priya") → map speaker 0..7 to names, with confidence
       3. analyse     Gemini, JSON schema → summary, chapters, decisions, action items (each with a supporting quote)
       4. ground      fuzzy-match every quote back to the transcript → exact source timestamp (model timestamps are never trusted)
       5. index       chunk on speaker turns (~45 s), embed, write tsvector + vector
       6. stats       talk time, crosstalk, monologues (sweep-line over intervals)
  └► meeting status pushed to the UI live (Supabase Realtime: Postgres changes → WebSocket)
```

Each step is **idempotent** (safe to re-run) and records its duration and error. A crash mid-pipeline resumes from the failed step, never from zero.

## What we build, in tiers

**Must** (this is the submission):
1. **Meeting workspace** using the full width:
   - Left: player and a **speaker timeline**, one row per speaker, showing who spoke when and where people talked over each other.
   - Centre: the **transcript**, with speaker and timestamp on every line. It follows playback, and clicking a line seeks to it.
   - Right: **insights**, meaning summary, decisions and action items, all with clickable timestamps.
   - Keyboard: Space, J/L, H to highlight, / to search.
2. **Real pipeline**: upload a recording → definitive transcript and AI insights, with live status.
3. **Search across all meetings**: hybrid keyword + semantic search, returning timestamped moments.
4. **Clips + public share link**: select transcript lines → clip. The link works logged out and plays only that range.
5. **Seeded workspace** of ~6 meetings, including the 8-person, 60-minute one. Opens with no sign-in.

**Should**:

6. **Live recording in the browser**: streaming transcript, live highlights, live action items.
7. **Action-item inbox**: every task from every meeting, by owner, with checkboxes.
8. **Ask**: per meeting and across meetings, with cited timestamps.
9. **Templates**, cut to 4: General, Standup, 1:1, Sales.

**Could**:

10. Rename speakers inline (applies everywhere). Waveform in the player. Command palette (Ctrl+K).

## What we cut, and why

| Cut | Why |
|---|---|
| A bot that joins Zoom/Meet/Teams | The brief allows stubbing it. Days of infrastructure for no product insight. Browser recording and upload run the same pipeline. Said openly in the walkthrough. |
| Calendar sync | Only needed to schedule the bot. |
| Deals / CRM, Alerts, Playlists, Refer, credits | Sales add-ons, not the core loop. |
| 15 sales-methodology templates | Choice overload. 4 cover most meetings. |
| Sign-up wall | Reviewers must get in with one click, so the app opens straight into a seeded demo workspace. |

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js 16 (App Router) + TypeScript** | UI and API in one codebase; Vercel deploy. |
| UI | **Tailwind v4** + hand-built components | Fast, consistent. |
| Database | **Supabase Postgres** + **pgvector** | Relational data, full-text search and vector search in one DB, with one consistency model. |
| Realtime | **Supabase Realtime** | Pipeline status pushed to the browser without polling. |
| Storage | **Supabase Storage** | Media served with HTTP range requests (seekable); signed, expiring URLs. |
| Scheduling | **pg_cron + pg_net** in Postgres | Retries every minute. Vercel's free cron only runs daily, so the database schedules the work itself. |
| Speech-to-text | **Deepgram Nova-3**: streaming (live) + pre-recorded (definitive), with diarization | Knows *who* spoke, which is essential for 8 people. |
| LLM | **Gemini 3.x Flash** (analysis) and **Flash-Lite** (live action items), behind a provider interface | Long context: one call covers an hour. The cheap model handles the hot path. |
| Embeddings | **gemini-embedding-001**, 768 dims, separate document/query task types | Semantic search and Ask. |
| Seed audio | **Deepgram Aura TTS**, a distinct voice per speaker | Gives the 8-person script real multi-voice audio to push through the real pipeline. |
| Hosting | **Vercel** + Supabase | Free, public link. |

## Engineering concepts, and where each one lives

### Databases
- **Schema**: normalized, foreign keys, `ON DELETE CASCADE`. Times are stored as integer milliseconds, never as floats.
- **Indexes chosen for the access pattern**:
  - B-tree on `(meeting_id, start_ms)`, so getting a clip's transcript is a range scan.
  - GIN on a **generated, weighted `tsvector`** column.
  - **HNSW** on embeddings.
  - A **partial index** on `jobs WHERE status = 'queued'`, so the queue stays fast however long the job history grows.
- **Transactions and concurrency**:
  - The job queue uses `FOR UPDATE SKIP LOCKED`, so many workers never pick the same job.
  - **Optimistic concurrency** (a `version` column) on action-item edits.
  - **Idempotency keys** on upload, so a double-submit doesn't create two meetings.
- **Security**: Row Level Security on every table. Public clips are read through a server route using an unguessable 128-bit token, never by exposing the tables.

### AI / ML
- **Structured output**: Gemini returns JSON against a schema, validated with **Zod**. On a validation failure it retries once, with the error fed back to the model.
- **Grounding, so the summary can be trusted**:
  - Every summary line, decision and action item must carry a supporting **quote**.
  - The quote is aligned to the transcript by n-gram overlap, and that alignment, not the model, supplies the timestamp.
  - An item that can't be grounded is dropped. This answers the recon point "can't verify the summary".
- **Speaker naming**: diarization gives anonymous speakers 0–7. The LLM maps them to names from intros and how people address each other, with a confidence score. The user can override with a click.
- **Retrieval**: hybrid search, combining Postgres full-text (keyword) and vector similarity (meaning) with **Reciprocal Rank Fusion**. Chunks follow speaker turns, so a result is a moment.
- **RAG for Ask**: the model may only cite retrieved chunks, and citations are checked against the retrieved set.
- **Evaluation**: we wrote the seed scripts, so we **know the true action items and decisions**. We measure **precision/recall** of extraction against them and report the numbers in the README.
- **Caching**: AI outputs are keyed by `sha256(transcript + template + prompt_version)`. Switching templates back and forth costs nothing after the first run.
- **Safety**: transcripts are passed as delimited data, never as instructions (prompt-injection hygiene).

### Algorithms
- **Binary search** over utterance start times maps the playhead to a transcript line: O(log n) per frame across ~1,500 lines.
- **Sweep line over speech intervals** gives talk time, **crosstalk** (two or more people talking at once) and monologues. These are the 8-person stats.
- **Interval merging** for overlapping highlights and clips.
- A **virtualized transcript list**: only the visible rows are in the DOM, so an hour-long meeting scrolls smoothly.

### OS / systems
- The **AudioWorklet** runs on the real-time audio thread, with a **ring buffer** handing samples to the main thread.
- **Backpressure**: if the WebSocket's `bufferedAmount` grows, audio is queued and then dropped oldest-first rather than freezing the tab.
- A **monotonic clock** (`performance.now()`) is used for all recording timestamps. The wall clock can jump (NTP sync, sleep), so it isn't used.
- **Web Worker** for CPU work (waveform peaks), off the UI thread.
- **Crash safety**: recording chunks go to IndexedDB *before* upload, like a write-ahead log. Closing the tab mid-call loses nothing.

### Backend
- Every API input is validated with Zod; errors are typed.
- A **token-bucket rate limit** on the public share and Ask endpoints.
- Secrets live on the server only. The browser gets 30-second Deepgram tokens.
- The `jobs` table is the audit log. A **pipeline panel** on each meeting shows every step, its duration and any error.

## Data model

```
meetings      id, title, started_at, duration_ms, status, media_path, source(live|upload|seed), idempotency_key
speakers      id, meeting_id, label, display_name, name_confidence, color, talk_ms
utterances    id, meeting_id, speaker_id, start_ms, end_ms, text, tsv (generated, GIN)   idx(meeting_id,start_ms)
chunks        id, meeting_id, start_ms, end_ms, text, embedding vector(768) (HNSW)
insights      meeting_id, template, cache_key, content jsonb, model, created_at
action_items  id, meeting_id, owner_speaker_id, text, due, source_ms, quote, done, version
decisions     id, meeting_id, text, source_ms, quote
highlights    id, meeting_id, start_ms, end_ms, note, created_live
clips         id, meeting_id, start_ms, end_ms, title, share_token (unique), views
jobs          id, meeting_id, step, status, attempts, run_after, locked_at, duration_ms, error   partial idx(status='queued')
```

## Seed data

We write ~6 realistic meeting scripts with known ground truth:

| Meeting | People | Length |
|---|---|---|
| Quarterly planning | 8 | 60 min |
| Standup | 5 | 10 min |
| 1:1 | 2 | 25 min |
| Sales discovery | 3 | 30 min |
| Design review | 4 | 30 min |
| Incident retro | 6 | 35 min |

Each script is rendered to multi-voice audio with Deepgram Aura, then run through **the same real pipeline** as any upload. Plus your real Google Meet test call. We say exactly this in the walkthrough.

## Build order

| # | Phase | Est. |
|---|---|---|
| 1 | DB schema + migrations, Supabase wiring, **first deploy to Vercel** | 1.5h |
| 2 | Post-call pipeline (job queue, transcribe, name, analyse, ground, index, stats) | 3.5h |
| 3 | Seed scripts → TTS audio → run the pipeline; evaluation numbers | 2h |
| 4 | Meeting workspace (player, speaker timeline, synced transcript, insights) | 4h |
| 5 | Search + clips + public share page | 3h |
| 6 | Live recording (streaming transcript, live highlights, live action items) | 3h |
| 7 | Inbox, Ask, templates | 2h |
| 8 | Polish: loading/empty/error states, mobile, README, walkthrough | 2h |

We deploy after every phase, so there is always a working live link. If time runs short, everything from phase 7 down is what gets cut, never the core loop.
