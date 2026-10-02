import 'server-only';
import { cookies } from 'next/headers';
import { cache } from 'react';
import { sql } from './db';
import { supabaseServer } from './supabase/server';

export const DEMO_WORKSPACE = '00000000-0000-4000-8000-00000000de30';
export const WS_COOKIE = 'aw_ws';

export type Workspace = { id: string; name: string; is_demo: boolean };
export type Viewer = {
  user: { id: string; email: string; name: string; avatar: string | null } | null;
  /** The workspace being browsed right now. */
  workspace: Workspace;
  /** The signed-in user's private workspace (null when signed out). */
  personal: Workspace | null;
  /** Can the viewer change things in the current workspace? Never in the demo. */
  canEdit: boolean;
};

const DEMO: Workspace = { id: DEMO_WORKSPACE, name: 'Tidewater (demo)', is_demo: true };

/**
 * Who is looking, and at which workspace. Memoized per request (React cache),
 * so layout, page and helpers share one auth check and one DB round trip.
 */
export const getViewer = cache(async (): Promise<Viewer> => {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getClaims();
  const c = data?.claims;
  if (!c?.sub) return { user: null, workspace: DEMO, personal: null, canEdit: false };

  const meta = (c.user_metadata ?? {}) as { name?: string; full_name?: string; avatar_url?: string; picture?: string };
  const email = (c.email as string) ?? '';
  const name = meta.name || meta.full_name || email.split('@')[0];
  // Get-or-create the personal workspace in one statement. owner_id is unique,
  // so two simultaneous first requests converge on the same row.
  const [personal] = await sql<Workspace[]>`
    with ins as (
      insert into workspaces (name, owner_id) values (${`${name.split(' ')[0]}’s meetings`}, ${c.sub})
      on conflict (owner_id) do nothing
      returning id, name, is_demo
    )
    select id, name, is_demo from ins
    union all
    select id, name, is_demo from workspaces where owner_id = ${c.sub}
    limit 1`;

  const pref = (await cookies()).get(WS_COOKIE)?.value;
  const workspace = pref === 'demo' ? DEMO : personal;
  return {
    user: { id: c.sub, email, name, avatar: meta.avatar_url || meta.picture || null },
    workspace,
    personal,
    canEdit: !workspace.is_demo,
  };
});

/** Workspaces the viewer may read: the demo (public) and their own. */
export function readable(v: Viewer) {
  return v.personal ? [DEMO_WORKSPACE, v.personal.id] : [DEMO_WORKSPACE];
}

export type Access = 'none' | 'read' | 'write';

/** Access to one meeting. Write only in your own workspace; the demo is read-only. */
export const meetingAccess = cache(async (meetingId: string): Promise<{ access: Access; workspaceId: string | null }> => {
  const v = await getViewer();
  const [m] = await sql<{ workspace_id: string }[]>`select workspace_id from meetings where id = ${meetingId}`;
  if (!m) return { access: 'none', workspaceId: null };
  if (v.personal && m.workspace_id === v.personal.id) return { access: 'write', workspaceId: m.workspace_id };
  if (m.workspace_id === DEMO_WORKSPACE) return { access: 'read', workspaceId: m.workspace_id };
  return { access: 'none', workspaceId: m.workspace_id };
});

export const forbidden = (access: Access) =>
  access === 'none'
    ? Response.json({ error: 'Not found' }, { status: 404 })
    : Response.json({ error: 'The demo workspace is read-only. Sign in to work on your own meetings.', code: 'demo_readonly' }, { status: 403 });
