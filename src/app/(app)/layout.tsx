import { sql } from '@/lib/db';
import { getViewer } from '@/lib/auth';
import { AppShell, type ShellViewer } from '@/components/shell/AppShell';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  const v = await getViewer();
  // Light queries for the command palette and the nav badge, scoped to the current workspace.
  const [meetings, [{ open }]] = await Promise.all([
    sql<{ id: string; title: string; started_at: Date }[]>`
      select id, title, started_at from meetings
      where workspace_id = ${v.workspace.id} and status <> 'recording'
      order by started_at desc limit 300`,
    sql<{ open: number }[]>`
      select count(*)::int as open from action_items a join meetings m on m.id = a.meeting_id
      where m.workspace_id = ${v.workspace.id} and not a.done`,
  ]);
  const viewer: ShellViewer = {
    user: v.user,
    workspace: { name: v.workspace.name, isDemo: v.workspace.is_demo },
    personalName: v.personal?.name ?? null,
    canEdit: v.canEdit,
  };
  return (
    <AppShell viewer={viewer} meetings={meetings.map((m) => ({ ...m, started_at: m.started_at.toISOString() }))} openActions={open}>
      {children}
    </AppShell>
  );
}
