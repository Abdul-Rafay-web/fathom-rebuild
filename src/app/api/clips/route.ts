import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { sql } from '@/lib/db';
import { body, error, json, uuid } from '@/lib/api';

const Create = z.object({
  meetingId: uuid,
  start_ms: z.number().int().min(0),
  end_ms: z.number().int().min(1),
  title: z.string().trim().min(1).max(200),
});

export async function POST(req: Request) {
  const b = await body(req, Create);
  if (b instanceof Response) return b;
  if (b.end_ms - b.start_ms < 1000) return error('A clip must be at least 1 second');
  if (b.end_ms - b.start_ms > 20 * 60_000) return error('Clips are limited to 20 minutes');
  // 128 bits from the OS CSPRNG: unguessable, so the link itself is the capability.
  const token = randomBytes(16).toString('base64url');
  const [c] = await sql`
    insert into clips (meeting_id, start_ms, end_ms, title, share_token)
    values (${b.meetingId}, ${b.start_ms}, ${b.end_ms}, ${b.title}, ${token})
    returning id, start_ms, end_ms, title, share_token, views`;
  return json(c, 201);
}
