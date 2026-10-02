import { error, isUuid, json } from '@/lib/api';
import { hybridSearch } from '@/lib/search';
import { getViewer, meetingAccess } from '@/lib/auth';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') ?? '').trim().slice(0, 300);
  const meeting = u.searchParams.get('meeting') ?? undefined;
  if (!q) return json({ hits: [] });
  if (meeting && !isUuid(meeting)) return error('bad meeting');
  if (meeting && (await meetingAccess(meeting)).access === 'none') return error('not found', 404);
  const v = await getViewer();
  if (!v.user) return error('Sign in first', 401);
  const t0 = performance.now();
  const hits = await hybridSearch(q, { workspaceId: v.workspace.id, meetingId: meeting, limit: 24 });
  return json({ hits, ms: Math.round(performance.now() - t0) });
}
