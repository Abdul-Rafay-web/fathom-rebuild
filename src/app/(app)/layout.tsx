import { sql } from '@/lib/db';
import { AppShell } from '@/components/shell/AppShell';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  // Light query for the command palette and the nav badge.
  const [meetings, [{ open }]] = await Promise.all([
    sql<{ id: string; title: string; started_at: Date }[]>`select id, title, started_at from meetings order by started_at desc limit 300`,
    sql<{ open: number }[]>`select count(*)::int as open from action_items where not done`,
  ]);
  return (
    <AppShell meetings={meetings.map((m) => ({ ...m, started_at: m.started_at.toISOString() }))} openActions={open}>
      {children}
    </AppShell>
  );
}
