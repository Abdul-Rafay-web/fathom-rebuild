import 'server-only';
import { createHmac } from 'node:crypto';
import { cache } from 'react';
import { sql } from './db';
import { supabaseServer } from './supabase/server';

export const DEMO_WORKSPACE = '00000000-0000-4000-8000-00000000de30';
/** The shared, read-only demo account. Signing in as it opens the Tidewater workspace. */
export const DEMO_EMAIL = 'demo@afterword.app';

/**
 * The demo account's password is derived from a server-only secret, so it
 * never needs to be stored, typed or shared: the "Try the demo" button signs in
 * server-side. Rotating the service key rotates it too.
 */
export function demoPassword() {
  return createHmac('sha256', process.env.SUPABASE_SERVICE_ROLE_KEY!).update('afterword-demo-account').digest('base64url');
}

export type Workspace = { id: string; name: string; is_demo: boolean };
export type Viewer = {
  user: { id: string; email: string; name: string; avatar: string | null; isDemo: boolean } | null;
  /** The workspace being browsed (demo account → Tidewater; everyone else → their own). */
  workspace: Workspace;
  /** The user's private workspace (null for the demo account and for visitors). */
  personal: Workspace | null;
  /** May the viewer change things here? Never in the demo. */
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
  const email = ((c.email as string) ?? '').toLowerCase();
  const name = meta.name || meta.full_name || email.split('@')[0];
  const avatar = meta.avatar_url || meta.picture || null;

  if (email === DEMO_EMAIL) {
    return { user: { id: c.sub, email, name: 'Demo account', avatar: null, isDemo: true }, workspace: DEMO, personal: null, canEdit: false };
  }

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
  return { user: { id: c.sub, email, name, avatar, isDemo: false }, workspace: personal, personal, canEdit: true };
});

export type Access = 'none' | 'read' | 'write';

/**
 * Access to one meeting: write in your own workspace; read-only in the demo for
 * the demo account; nothing otherwise. Someone else's meeting is a 404.
 */
export const meetingAccess = cache(async (meetingId: string): Promise<{ access: Access; workspaceId: string | null }> => {
  const v = await getViewer();
  const [m] = await sql<{ workspace_id: string }[]>`select workspace_id from meetings where id = ${meetingId}`;
  if (!m || !v.user) return { access: 'none', workspaceId: m?.workspace_id ?? null };
  if (v.personal && m.workspace_id === v.personal.id) return { access: 'write', workspaceId: m.workspace_id };
  if (v.user.isDemo && m.workspace_id === DEMO_WORKSPACE) return { access: 'read', workspaceId: m.workspace_id };
  return { access: 'none', workspaceId: m.workspace_id };
});

export const forbidden = (access: Access) =>
  access === 'none'
    ? Response.json({ error: 'Not found' }, { status: 404 })
    : Response.json({ error: 'The demo account is read-only. Create an account to work on your own meetings.', code: 'demo_readonly' }, { status: 403 });
