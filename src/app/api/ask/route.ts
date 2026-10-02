import { z } from 'zod';
import { body, error, json, uuid } from '@/lib/api';
import { rateLimit } from '@/lib/ratelimit';
import { ask } from '@/lib/ask';

export const maxDuration = 60;

const Ask = z.object({ q: z.string().trim().min(2).max(500), meetingId: uuid.optional() });

export async function POST(req: Request) {
  const b = await body(req, Ask);
  if (b instanceof Response) return b;
  if (!(await rateLimit('ask', 30, 600))) return error('Too many questions, give it a minute', 429);
  try {
    return json(await ask(b.q, b.meetingId));
  } catch (e) {
    return error(e instanceof Error ? e.message : 'failed', 502);
  }
}
