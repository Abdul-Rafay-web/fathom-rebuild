-- 003: fixed-window rate limiting shared by all serverless instances.
-- An in-memory limiter is useless on serverless (every cold start resets it);
-- an atomic upsert in Postgres gives one consistent counter per (key, window).
create table rate_limits (
  key          text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (key, window_start)
);
alter table rate_limits enable row level security;
