import 'server-only';
import postgres from 'postgres';

// One pool per server instance. In dev, HMR re-evaluates modules, so the pool
// is parked on globalThis to avoid leaking connections on every edit.
// prepare: false — Supabase's transaction pooler (port 6543) can't hold
// prepared statements across pooled connections.
const g = globalThis as unknown as { __sql?: postgres.Sql };

export const sql =
  g.__sql ??
  postgres(process.env.DATABASE_URL!, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== 'production') g.__sql = sql;
