-- 004: workspace vocabulary. Names and jargon passed to the speech model as
-- key terms, so "Lena" isn't heard as "Lina" and "CRDT" isn't "C or D T".
-- A team roster is the single highest-leverage accuracy fix for transcripts.
create table vocabulary (
  term       text primary key,
  kind       text not null default 'term' check (kind in ('person', 'term', 'company')),
  created_at timestamptz not null default now()
);
alter table vocabulary enable row level security;

insert into vocabulary (term, kind) values
  ('Maya', 'person'), ('Daniel', 'person'), ('Priya', 'person'), ('Tom', 'person'),
  ('Sofia', 'person'), ('Marcus', 'person'), ('Lena', 'person'), ('Arjun', 'person'),
  ('Okafor', 'person'), ('Raman', 'person'), ('Novak', 'person'), ('Mehta', 'person'),
  ('Tidewater', 'company'), ('Harbor Logistics', 'company'),
  ('CRDT', 'term'), ('SSO', 'term'), ('ARR', 'term'), ('Intune', 'term'), ('Azure AD', 'term')
on conflict do nothing;
