import 'server-only';
import postgres from 'postgres';

// One pool per server instance. In dev, HMR re-evaluates modules, so the pool
// is parked on globalThis to avoid leaking connections on every edit.
// prepare: false — Supabase's transaction pooler (port 6543) can't hold
// prepared statements across pooled connections.
// max_pipeline: 1 — the transaction pooler may route each statement to a
// different backend, so pipelined queries on one client connection can get
// each other's results back (observed: a query returned another query's rows).
// One in-flight query per connection; concurrency comes from the pool instead.
const g = globalThis as unknown as { __sql?: postgres.Sql };

export const sql =
  g.__sql ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max_pipeline: 1,
    max: 6,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== 'production') g.__sql = sql;
