# Afterword

**Meeting notes you can trust the day after.** A rebuild of [Fathom](https://fathom.video) for the 8x engineering assessment, built around the case the brief says matters most: *an eight-person call that runs an hour.*

- **Live app:** https://fathom-rebuild-iota.vercel.app (opens straight into the demo workspace, no sign-in)
- **Repository:** https://github.com/Abdul-Rafay-web/fathom-rebuild
- **Capture log:** [`CAPTURE-TEST.md`](CAPTURE-TEST.md) · prompts and responses in [`.agent-logs/`](.agent-logs/)
- **Product plan & recon:** [`PLAN.md`](PLAN.md) · screenshots of Fathom in [`recon/`](recon/)
- **Measured accuracy:** [`EVAL.md`](EVAL.md)

---

## The idea

Fathom is excellent at *capture*. After using it end to end ([`recon/`](recon/)), what I kept running into was the **day after**: nobody re-watches an hour, and the notes can't be checked against what was said. On a big call, people come back with three questions:

| Question | What Afterword does | What Fathom does |
|---|---|---|
| **"What do I have to do?"** | Action items with owner, due date and the exact moment, plus a cross-meeting inbox grouped by owner | Action items per call, no cross-meeting view (and "None detected" on my test call) |
| **"Can I trust the summary?"** | **Every** summary line, decision and action item cites the transcript moment. Hover to see the verbatim quote, click to hear it. Claims the model can't back with a quote are dropped. | Summary with no links back to the source |
| **"Where did we talk about X?"** | Hybrid keyword + semantic search returning **moments** (speaker + timestamp), and Ask with cited answers across all meetings | Search returns calls |

## What I built, kept, changed and cut

**Built**
- **Meeting workspace.** It's laid out as *a document with its sources*: notes on the left; player, speaker map and transcript on the right. Fathom uses a narrow centre column and leaves ~40% of the screen empty.
  - **Speaker timeline:** one lane per person, with chapter ticks and highlights. You can see who talked when on an 8-person call at a glance.
  - **Transcript:** speaker and timestamp on every line (Fathom's bubbles show neither). It follows playback, clicking a line seeks, and it's virtualized, so a 70-minute meeting with 300+ lines scrolls smoothly.
  - **Templates:** General, Standup, 1:1 and Sales. Each is generated on demand and cached by content hash.
  - **Dynamics:** participation balance (normalized entropy of talk time), who cut in on whom, and monologues.
  - **Keyboard:** <kbd>Space</kbd>/<kbd>K</kbd>, <kbd>J</kbd>/<kbd>L</kbd>, <kbd>H</kbd> highlight, <kbd>/</kbd> find. <kbd>Ctrl</kbd>+<kbd>K</kbd> opens the command palette everywhere.
- **Clips.** Drag across the timeline or shift-click transcript lines, then **Share clip**. The public page needs no sign-in and plays only that range.
- **Real pipeline.** Upload or record → Deepgram (diarized) → speaker naming → stats → grounded analysis → hybrid index. Pipeline progress is shown live.
- **Live recording in the browser.** Live captions, live action items and <kbd>H</kbd> highlights while you talk, then the same post-call pipeline.
- **Workspace vocabulary.** Team names and jargon are passed to the speech model. On the 8-person meeting this took speaker naming from 7/8 to **8/8** and fixed "Lena" being heard as "Lina".

**Changed**
- **Library rows instead of identical thumbnails.** Every meeting gets a *fingerprint*: who held the floor across the meeting, in 96 slices. A standup looks nothing like a 1:1.
- **Templates cut from 15+ sales methodologies to 4.**
- **No "Awaiting Attendees" limbo** (my main complaint in [`recon/notes.txt`](recon/notes.txt)): press record and words appear.

**Cut**, deliberately:

| Cut | Why |
|---|---|
| The bot that joins Zoom/Meet/Teams | The brief allows stubbing it. It's days of infrastructure work for no product insight, so the capture layer is browser recording + upload, feeding the same pipeline. |
| Calendar sync | It only exists to schedule the bot. |
| CRM, Deals, Alerts, Playlists, Refer, credits | Sales add-ons, not the core loop. |
| Sign-up | Reviewers get in with one click into a seeded demo workspace. |

## Accounts and private workspaces

- **Visitors (no account)** land in the public **Tidewater demo**, which satisfies "the live link opens for somebody who is not signed in". The demo is **read-only**: ticking a task or renaming a speaker works in your tab, with a note that it isn't saved. Sharing a clip still works, because it only adds data.
- **Signed-in users** (email + password, or Google) get a **private workspace**, created on first visit. Recording, upload, search, Ask and the action-item inbox are scoped to it. A switcher in the sidebar flips to the demo and back.
- **How:**
  - **Sessions:** Supabase Auth sessions in httpOnly cookies, kept fresh by [`proxy.ts`](src/proxy.ts).
  - **Authorization:** checked on the server for every route and query via [`lib/auth.ts`](src/lib/auth.ts). `meetingAccess()` returns `none | read | write`. Someone else's private meeting is a 404, indistinguishable from a missing one.
  - **Database:** every meeting has a `workspace_id` ([`006_workspaces.sql`](db/migrations/006_workspaces.sql)). Search filters candidates by workspace in **both** retrieval arms *before* ranking, so other tenants' data can't surface or skew the fusion.
  - **Closed a leak:** the old anonymous Realtime read policies were dropped.
- **Sign-up, without email friction.** Accounts are created server-side and confirmed immediately, then signed in: one step. Supabase's built-in mailer allows only a few emails an hour, which would block a demo. The trade-off is that emails aren't verified.
- **Google sign-in** turns on by itself once the provider is enabled in Supabase: the login page reads `/auth/v1/settings`.

## Seed data: honest version

There are six meetings for one fictional company, Tidewater, including **Q4 planning: 8 people, 70 minutes**. Story threads run across meetings (an offline-sync bug, a big deal, a hiring plan), so search and Ask have something real to connect. How they were made:

1. Dialogue was generated per agenda segment from specs with **planted** decisions and action items ([`scripts/seed/specs.mjs`](scripts/seed/specs.mjs)).
2. Each line was voiced with a distinct Deepgram Aura voice and mixed, with real overlaps, into one audio file ([`render-audio.mjs`](scripts/seed/render-audio.mjs)).
3. That audio went through **the production pipeline**, the same code path as an upload ([`ingest.mts`](scripts/seed/ingest.mts)).

The transcripts, speaker names, notes and stats you see are genuine pipeline output, not hand-written fixtures. Because the truth is known, the pipeline is **scored** ([`EVAL.md`](EVAL.md)).

| | All six meetings | The 8-person hour |
|---|---|---|
| Action-item recall | **92%** (F1 82%) | **100%** |
| Decision recall | **89%** | **100%** |
| Speaker count detected | correct in every meeting | **8 of 8** |

## Architecture

```
Browser ──upload (signed URL, direct to storage)──► Supabase Storage
   │                                                    │
   │ POST /api/uploads/:id/complete                     │ Deepgram fetches media by signed URL
   ▼                                                    ▼
jobs (Postgres) ─claim: FOR UPDATE SKIP LOCKED─► worker: transcribe → name_speakers → { stats, analyse, index }
   ▲                                                         │  Gemini (schema-constrained JSON) + quote grounding
   │ pg_cron (every min, only if work exists) / after()       ▼
   └──────────────────────────────────────────── utterances · speakers · insights · action_items · chunks(pgvector, tsvector)
```

- **Next.js 16** (App Router, React 19, Turbopack) on **Vercel**, pinned to `syd1`, next to the database.
- **Supabase**: Postgres 17 + pgvector, plus Storage.
- **Deepgram Nova-3**: batch diarization + streaming captions. **Aura-2** voices the seed audio.
- **Gemini**: Flash for analysis, Flash-Lite for the hot path, `gemini-embedding-001` (768-d) for search.
- No ORM: SQL via `postgres`. No UI kit: Tailwind v4 + hand-built components. Fonts are self-hosted: Newsreader (reading), Schibsted Grotesk (UI), Fragment Mono (timestamps).

## Engineering decisions, and where they live

**Databases**
- **Job queue in Postgres.** Workers claim with `FOR UPDATE SKIP LOCKED`, so serverless invocations never double-process. Completing a step and enqueuing its successors in the DAG happens in **one transaction**. A visibility timeout reclaims jobs whose worker died. Rate limits (429) get linear backoff and more attempts; real errors get exponential backoff. → [`pipeline/queue.ts`](src/lib/pipeline/queue.ts)
- **Indexes chosen for the access pattern:**
  - B-tree `(meeting_id, start_ms)`, so a clip's transcript is a range scan
  - generated `tsvector` + GIN for keyword search
  - HNSW for vectors
  - a **partial index** on queued jobs, so claims stay fast however much history accumulates

  → [`001_init.sql`](db/migrations/001_init.sql)
- **Idempotency everywhere:**
  - upload idempotency keys
  - `unique (meeting_id, step)` jobs
  - every pipeline step replaces its own outputs in a transaction, so retries converge instead of duplicating
- **Optimistic concurrency** on action items (`version` column; a stale write gets 409 plus the current row). → [`api/action-items/[id]`](src/app/api/action-items/[id]/route.ts)
- **A rate limiter in Postgres:** a fixed window via an atomic upsert. In-memory limiters reset on every serverless cold start. → [`ratelimit.ts`](src/lib/ratelimit.ts)
- **Advisory-locked migrations** ([`scripts/migrate.mjs`](scripts/migrate.mjs)), plus RLS on every table. The browser can't read the database directly.
- **A bug worth knowing about:** Supabase's transaction pooler can route pipelined statements to different backends, so one query got *another query's rows back*. The fix is `max_pipeline: 1`, with concurrency coming from the pool instead. → [`db.ts`](src/lib/db.ts)

**AI / ML**
- **Grounding.** The model must cite a line *and* copy a short quote. A [`Grounder`](src/lib/algo/align.ts) checks the quote against a ±3-line window around the cited line (models are often off by one or two), then the whole transcript, using word-bigram containment. Claims whose quote can't be found are **dropped**, never shown with a made-up timestamp. The notes footer says how many were discarded.
- **Schema-constrained JSON.** The Zod schema is converted to JSON Schema for constrained decoding, then used again to validate the output. A validation failure gets one retry with the error fed back, then the model chain falls through. → [`gemini.ts`](src/lib/ai/gemini.ts)
- **Speaker naming.** Diarization gives anonymous labels. The LLM maps labels to names from introductions and addressing cues, with a confidence score. Only confident, unique names are accepted, and a name set by hand is never overwritten.
- **Hybrid retrieval.** Postgres full-text search and pgvector are fused with **Reciprocal Rank Fusion**. The semantic arm has a distance cut-off **calibrated on this corpus**: relevant queries' best matches sit at 0.29–0.41, unrelated ones never get below 0.475. Chunks follow speaker turns (30–60 s), and each hit is pinned to its exact line. → [`search.ts`](src/lib/search.ts), [`chunk.ts`](src/lib/algo/chunk.ts)
- **RAG with validated citations.** Ask sees only retrieved excerpts, and any citation outside the retrieved set is stripped. → [`ask.ts`](src/lib/ask.ts)
- **Evaluation.** Precision/recall/F1 against planted truth, with **Hungarian-algorithm** matching (optimal 1:1), plus line-level diarization accuracy against the renderer's true timings. → [`scripts/eval.mts`](scripts/eval.mts), [`EVAL.md`](EVAL.md)
- **Caching.** Template summaries are keyed by `sha256(prompt_version, template, transcript)`, so a prompt change can never serve stale output.

**Algorithms**
- **Sweep line** over all speech intervals for crosstalk and interruptions, plus a serialized **cut-in** detector, because diarized transcripts rarely keep true overlap. → [`intervals.ts`](src/lib/algo/intervals.ts)
- **Binary search** maps the playhead to the active line: O(log n) per frame. → [`bsearch.ts`](src/lib/algo/bsearch.ts)
- **Interval merging** (timeline bars, talk time as a union), a **fingerprint** bucketing pass, and **fuzzy subsequence matching** with word-start and consecutive-run bonuses for the command palette. → [`fuzzy.ts`](src/lib/fuzzy.ts)
- 12 unit tests: `npm test`. Lint is clean under the React Compiler rules.

**OS / systems / frontend runtime**
- **Playback state lives outside React** ([`player.ts`](src/components/meeting/player.ts)). A requestAnimationFrame loop feeds `useSyncExternalStore` selectors, so the transcript re-renders when the *active line* changes, not 60 times a second. The transcript is **virtualized** (~30 DOM rows for a 300+ line meeting).
- **Recorder** ([`Recorder.tsx`](src/components/Recorder.tsx)): one Opus encoder, two sinks.
  - **Streaming socket:** it gets a 30 s token, so the API key never reaches the browser. It handles **backpressure** by watching `bufferedAmount`, then dropping the oldest slices, never the WebM header.
  - **IndexedDB:** chunks are written as a **write-ahead log**, so a closed tab never loses a meeting; [`recorder-store.ts`](src/lib/recorder-store.ts) handles recovery.
  - Timestamps use the **monotonic clock** (`performance.now()`), not wall time.
  - WebM duration headers are patched, so recordings are seekable.
- **Media never transits a serverless function.** Uploads go directly to storage via signed URLs (Vercel caps request bodies at 4.5 MB), and Deepgram fetches the file by signed URL.
- **Lessons from a flaky network.** Each of these is a fix that ships:
  - Hung `getaddrinfo` calls occupy **libuv's 4-thread pool** and starve everything else that uses it, including file I/O. Fixes: a development-only public-DNS resolver with stale-while-revalidate caching ([`instrumentation-node.ts`](src/instrumentation-node.ts)), and self-hosted fonts, so builds never depend on Google Fonts.
  - Pooled TCP connections were silently dropped by NAT. With one query in flight per connection, the pool wedged while a fresh client worked fine. Fix: **10 s TCP keepalive** and a **5-minute connection lifetime**.
  - A worker that died mid-job left it `running`. The visibility timeout reclaims it, and the kick endpoint now counts stale locks as runnable work. That endpoint had a bug, and this incident found it.
  - Two-phase uploads abandoned between their two steps are hidden after 30 minutes and garbage-collected after a day.

## Running it

```bash
npm install
cp .env.example .env.local      # Deepgram, Gemini, Supabase keys
npm run migrate                 # applies db/migrations/*.sql
npm run dev
```

Seed data (optional; needs API quota):

```bash
node scripts/seed/gen-scripts.mjs        # dialogue from specs (Gemini)
node scripts/seed/render-audio.mjs       # multi-voice audio (Deepgram Aura + ffmpeg)
npx tsx --conditions=react-server scripts/seed/ingest.mts   # through the real pipeline
npx tsx --conditions=react-server scripts/eval.mts          # score it → EVAL.md
```

After deploying: `node scripts/schedule-worker.mjs https://<your-app>` points the database's every-minute cron at the worker.

## Trade-offs and what I'd do next

- **No meeting bot.** I'd add a Recall.ai-style bot behind the same `uploads/complete` entry point; nothing downstream changes.
- **No auth.** It's a single demo workspace by design. Next would be Supabase Auth plus RLS policies keyed on workspace membership. The schema already isolates everything per meeting.
- **Diarization can merge similar voices.** An early render of the Harbor call merged two male voices, and action-item recall there was 33%. It reached 100% after two changes:
  - **A real-world fix:** owners now come from explicit naming in the conversation whenever it disagrees with the diarized label.
  - **A seed-data fix:** more distinct voices.

  Per-workspace voice-print enrolment would be the proper long-term fix.
- **Polling, not Realtime,** for pipeline progress. It's 2.5 s polls that also nudge the worker; simpler and robust. Supabase Realtime is already enabled on `meetings`/`jobs` (migration 002) for a later switch.
- **Live captions need a Deepgram key with token-grant permission.** Without one, recording still works and the transcript arrives after stop. The UI says so instead of failing.

### Deviations from [`PLAN.md`](PLAN.md)

- **Recorder input.** The plan said AudioWorklet → PCM. I switched to a single MediaRecorder (Opus) feeding both sinks: one encoder instead of two, Deepgram accepts WebM/Opus directly, and the stored recording is byte-identical to what was streamed.
- **Progress updates.** The plan said Realtime; I used polling (see above).
