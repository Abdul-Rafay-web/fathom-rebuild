-- 002: per-meeting conversation stats + one-line gist for the library, and
-- Realtime publication so the browser sees pipeline progress without polling.

alter table meetings add column stats jsonb;          -- crosstalk, monologues, turn counts (sweep-line output)
alter table meetings add column gist text;            -- one-sentence summary shown in the library
alter table meetings add column speaker_count integer not null default 0;

alter table speakers add column turns integer not null default 0;
alter table speakers add column longest_ms integer not null default 0;

-- Library ordering + inbox lookups by owner.
create index action_items_owner_idx on action_items (owner_name) where not done;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table meetings, jobs;
  end if;
end $$;
