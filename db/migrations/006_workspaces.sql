-- 006: multi-tenancy. Every meeting belongs to a workspace.
--  - One public, read-only demo workspace holds the seeded Tidewater meetings,
--    so the live link works for anyone, signed in or not.
--  - Every signed-in user gets one private personal workspace, created on first
--    visit (owner_id is unique, so concurrent first requests can't create two).
-- All child tables (speakers, utterances, chunks, action_items, ...) hang off
-- meetings, so tenancy is enforced at one join point.

create table workspaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  owner_id   uuid unique references auth.users (id) on delete cascade,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now(),
  check (is_demo or owner_id is not null)
);
alter table workspaces enable row level security;

insert into workspaces (id, name, is_demo)
values ('00000000-0000-4000-8000-00000000de30', 'Tidewater (demo)', true);

alter table meetings add column workspace_id uuid references workspaces (id) on delete cascade;
update meetings set workspace_id = '00000000-0000-4000-8000-00000000de30';
alter table meetings alter column workspace_id set not null;
-- The library, inbox and palette all read "this workspace's meetings, newest first".
create index meetings_workspace_started_idx on meetings (workspace_id, started_at desc);

-- Vocabulary becomes per-workspace: your team's names, not Tidewater's.
alter table vocabulary add column workspace_id uuid references workspaces (id) on delete cascade;
update vocabulary set workspace_id = '00000000-0000-4000-8000-00000000de30';
alter table vocabulary alter column workspace_id set not null;
alter table vocabulary drop constraint vocabulary_pkey;
alter table vocabulary add primary key (workspace_id, term);

-- 002 let the anon key read meetings/jobs for Realtime. With private
-- workspaces that would leak titles of other people's meetings. Close it.
drop policy if exists meetings_status_read on meetings;
drop policy if exists jobs_status_read on jobs;
