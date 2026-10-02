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

## What we build (in priority order)

1. **Meeting workspace** (the core screen). Use the full width: player and **speaker timeline** on the left (one row per speaker, showing who talked when), a **live transcript** in the middle (speaker + timestamp per line, follows playback, click any line to seek), and an **insights panel** on the right (summary, decisions, action items, all with clickable timestamps). Keyboard: space to play/pause, J/L to skip back/forward, / to search inside the meeting.
2. **Processing pipeline (real, not faked).** Upload or record audio in the browser → transcription with speaker labels → AI pass (summary, chapters, decisions, action items) → search indexing. Status is shown live: *Uploaded → Transcribing → Analysing → Ready*.
3. **Search across all meetings**: hybrid keyword + semantic search over the transcript, returning timestamped moments.
4. **Clips + public share**: select transcript lines → clip. The share link opens for anyone logged out and plays just that range with its transcript.
5. **Action-item inbox**: every action item from every meeting, grouped by owner, with checkboxes.
6. **Ask**: per meeting and across meetings. Answers must cite timestamps.
7. **Highlights**: mark a moment during playback; it appears on the timeline and in the insights panel.
8. **Templates**, cut to 4: General, Standup, 1:1, Sales. Switching regenerates the summary, and results are cached.

## What we cut, and why

| Cut | Why |
|---|---|
| Live meeting bot (Zoom/Meet/Teams) | The brief allows stubbing it. It's days of infrastructure work for no product insight. Upload and browser recording run the same pipeline. Said openly in the walkthrough. |
| Calendar sync | Only needed to schedule the bot. |
| Deals / CRM, Alerts, Playlists, Refer, credits | Sales add-ons, not the core loop. |
| 15 sales-methodology templates | Choice overload. 4 cover most meetings. |
| Sign-up wall | Reviewers must get in with one click, so the app opens straight into a seeded demo workspace. |

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | **Next.js (App Router) + TypeScript** | One codebase for UI and API; deploys to Vercel in minutes. |
| UI | **Tailwind + shadcn/ui** | Fast, consistent, accessible components. |
| Database | **Postgres (Supabase)** + **pgvector** | Relational data, full-text search (`tsvector` + GIN index) and vector search (HNSW index) in one DB. |
| File storage | **Supabase Storage** | Audio files, served with HTTP range requests so the player can seek. |
| Background jobs | **Postgres job queue** (`FOR UPDATE SKIP LOCKED`), retries with backoff, idempotent steps | Processing an hour of audio can't block a web request. Workers claim jobs safely, even several at once. |
| Speech-to-text | **Deepgram Nova-3** with diarization | Labels *who* is speaking, which is essential for 8 people. Free credit on sign-up. |
| LLM | **Gemini Flash** (long context, free tier) or **Groq**; behind a provider interface so they can be swapped | An hour of transcript is ~15k tokens; one call handles it. |
| Embeddings | Gemini embeddings → pgvector | Semantic search and Ask. |
| Hosting | **Vercel** + Supabase | Free, public link. |

### The computer-science parts (worth calling out in the walkthrough)
- **Information retrieval:** hybrid search. BM25-style Postgres full-text search plus vector similarity, merged with **Reciprocal Rank Fusion**. The transcript is chunked on speaker turns into ~45s windows, so results are moments, not whole files.
- **RAG with grounding:** Ask retrieves chunks, and the model must cite chunk timestamps. Citations are checked against the retrieved set, so an answer can't cite a moment it never saw.
- **Structured LLM output:** summaries, decisions and action items come back as JSON validated against a **Zod schema**, and are retried on validation failure. Every item must carry a `source_ms` timestamp.
- **Concurrency / OS:** a job queue using row-level locks (`SKIP LOCKED`), a state machine per meeting, and idempotent pipeline steps (safe to re-run after a crash).
- **Media:** HTTP range requests for seeking; the playhead and transcript are synced with binary search over utterance start times (O(log n) per frame, not a linear scan of ~1,500 lines).
- **Caching:** AI outputs are stored per (meeting, template), so switching templates twice costs one LLM call.

## Data model (first cut)

```
meetings      id, title, started_at, duration_ms, status, media_url, template
speakers      id, meeting_id, label, display_name, color
utterances    id, meeting_id, speaker_id, start_ms, end_ms, text, tsv (GIN)
chunks        id, meeting_id, start_ms, end_ms, text, embedding vector (HNSW)
summaries     meeting_id, template, content jsonb, created_at   (cache)
action_items  id, meeting_id, owner_speaker_id, text, due, source_ms, done
decisions     id, meeting_id, text, source_ms
highlights    id, meeting_id, start_ms, end_ms, note
clips         id, meeting_id, start_ms, end_ms, title, share_token
jobs          id, meeting_id, step, status, attempts, run_after, locked_at, error
```

## Seed data

The meeting list must not be empty, and it should include the 8-person, 1-hour case. Options are listed in the open questions below.

## Build order and timebox

| # | Phase | Est. |
|---|---|---|
| 1 | Scaffold, DB schema, **deploy an empty app to Vercel first** | 1.5h |
| 2 | Pipeline: upload → transcribe → analyse → index; seed script | 3h |
| 3 | Meeting workspace (player, speaker timeline, synced transcript, insights) | 4h |
| 4 | Search + Ask | 2h |
| 5 | Clips + public share page | 2h |
| 6 | Home library + action-item inbox | 1.5h |
| 7 | Polish: loading/empty/error states, mobile, README | 2h |

We deploy at the end of every phase, so there is always a working live link.
