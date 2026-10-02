import { error, isUuid, json } from '@/lib/api';
import { hybridSearch } from '@/lib/search';

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get('q') ?? '').trim().slice(0, 300);
  const meeting = u.searchParams.get('meeting') ?? undefined;
  if (!q) return json({ hits: [] });
  if (meeting && !isUuid(meeting)) return error('bad meeting');
  const t0 = performance.now();
  const hits = await hybridSearch(q, { meetingId: meeting, limit: 24 });
  return json({ hits, ms: Math.round(performance.now() - t0) });
}
