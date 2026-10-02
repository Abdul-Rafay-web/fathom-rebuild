-- 001_init: core schema for meetings, transcripts, insights, search and the job queue.
-- Times are integer milliseconds from the start of the recording (never floats).

create extension if not exists vector;

-- ---------------------------------------------------------------- meetings
create table meetings (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  started_at       timestamptz not null default now(),
  duration_ms      integer not null default 0,
  -- uploaded -> transcribing -> analysing -> indexing -> ready | failed
  status           text not null default 'uploaded'
                   check (status in ('recording','uploaded','transcribing','analysing','indexing','ready','failed')),
  source           text not null default 'upload' check (source in ('live','upload','seed')),
  media_path       text,                       -- object key in Supabase Storage
  media_mime       text,
  template         text not null default 'general',
  idempotency_key  text unique,                -- a double-submitted upload maps to one meeting
  error            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index meetings_started_idx on meetings (started_at desc);

-- ---------------------------------------------------------------- speakers
create table speakers (
  id               uuid primary key default gen_random_uuid(),
  meeting_id       uuid not null references meetings(id) on delete cascade,
  label            integer not null,           -- diarization index 0..n
  display_name     text not null,
  name_confidence  real,                       -- 0..1 from the speaker-naming step; null = user-set
  color            text not null,
  talk_ms          integer not null default 0,
  unique (meeting_id, label)
);

-- ---------------------------------------------------------------- utterances
create table utterances (
  id          bigint generated always as identity primary key,
  meeting_id  uuid not null references meetings(id) on delete cascade,
  speaker_id  uuid references speakers(id) on delete set null,
  start_ms    integer not null,
  end_ms      integer not null check (end_ms >= start_ms),
  text        text not null,
  tsv         tsvector generated always as (to_tsvector('english', text)) stored
);
-- Range scans: "transcript for this clip", playhead lookups, ordered transcript.
create index utterances_meeting_time_idx on utterances (meeting_id, start_ms);
create index utterances_tsv_idx on utterances using gin (tsv);

-- ---------------------------------------------------------------- chunks (retrieval units)
create table chunks (
  id          bigint generated always as identity primary key,
  meeting_id  uuid not null references meetings(id) on delete cascade,
  start_ms    integer not null,
  end_ms      integer not null,
  speakers    text[] not null default '{}',
  text        text not null,
  tsv         tsvector generated always as (to_tsvector('english', text)) stored,
  embedding   vector(768)
);
create index chunks_meeting_idx on chunks (meeting_id, start_ms);
create index chunks_tsv_idx on chunks using gin (tsv);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);

-- ---------------------------------------------------------------- AI insights (cached per template)
create table insights (
  meeting_id   uuid not null references meetings(id) on delete cascade,
  template     text not null,
  cache_key    text not null,                  -- sha256(transcript + template + prompt_version)
  content      jsonb not null,                 -- summary sections, chapters (grounded)
  model        text not null,
  created_at   timestamptz not null default now(),
  primary key (meeting_id, template)
);

create table action_items (
  id                uuid primary key default gen_random_uuid(),
  meeting_id        uuid not null references meetings(id) on delete cascade,
  owner_speaker_id  uuid references speakers(id) on delete set null,
  owner_name        text,
  text              text not null,
  due               text,                      -- as spoken ("by Friday"); not guessed into a date
  source_ms         integer,
  quote             text,
  done              boolean not null default false,
  version           integer not null default 1, -- optimistic concurrency for edits
  created_at        timestamptz not null default now()
);
create index action_items_meeting_idx on action_items (meeting_id);
create index action_items_open_idx on action_items (done, created_at desc);

create table decisions (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings(id) on delete cascade,
  text        text not null,
  source_ms   integer,
  quote       text
);
create index decisions_meeting_idx on decisions (meeting_id);

-- ---------------------------------------------------------------- highlights & clips
create table highlights (
  id            uuid primary key default gen_random_uuid(),
  meeting_id    uuid not null references meetings(id) on delete cascade,
  start_ms      integer not null,
  end_ms        integer not null,
  note          text,
  created_live  boolean not null default false,
  created_at    timestamptz not null default now()
);
create index highlights_meeting_idx on highlights (meeting_id, start_ms);

create table clips (
  id           uuid primary key default gen_random_uuid(),
  meeting_id   uuid not null references meetings(id) on delete cascade,
  start_ms     integer not null,
  end_ms       integer not null check (end_ms > start_ms),
  title        text not null,
  share_token  text not null unique,           -- 128-bit random, base64url, generated in app
  views        integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- job queue
create table jobs (
  id           bigint generated always as identity primary key,
  meeting_id   uuid not null references meetings(id) on delete cascade,
  step         text not null check (step in ('transcribe','name_speakers','analyse','index','stats')),
  status       text not null default 'queued' check (status in ('queued','running','done','failed')),
  attempts     integer not null default 0,
  max_attempts integer not null default 3,
  run_after    timestamptz not null default now(),
  locked_at    timestamptz,
  started_at   timestamptz,
  finished_at  timestamptz,
  duration_ms  integer,
  error        text,
  created_at   timestamptz not null default now(),
  unique (meeting_id, step)                    -- one row per step per meeting: re-enqueue is idempotent
);
-- Partial index: the claim query only ever looks at runnable jobs, so it stays
-- fast no matter how much finished history accumulates.
create index jobs_runnable_idx on jobs (run_after) where status = 'queued';

-- ---------------------------------------------------------------- updated_at trigger
create function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger meetings_touch before update on meetings
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------- RLS
-- The server talks to Postgres directly. The browser's anon key may only
-- read meeting status (for live pipeline progress); every other table is closed.
alter table meetings     enable row level security;
alter table speakers     enable row level security;
alter table utterances   enable row level security;
alter table chunks       enable row level security;
alter table insights     enable row level security;
alter table action_items enable row level security;
alter table decisions    enable row level security;
alter table highlights   enable row level security;
alter table clips        enable row level security;
alter table jobs         enable row level security;

create policy meetings_status_read on meetings for select to anon using (true);
create policy jobs_status_read on jobs for select to anon using (true);
