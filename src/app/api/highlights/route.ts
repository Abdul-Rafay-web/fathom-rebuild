import { z } from 'zod';
import { sql } from '@/lib/db';
import { body, json, uuid } from '@/lib/api';
import { forbidden, meetingAccess } from '@/lib/auth';

const Create = z.object({
  meetingId: uuid,
  start_ms: z.number().int().min(0),
  end_ms: z.number().int().min(0),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const b = await body(req, Create);
  if (b instanceof Response) return b;
  const { access } = await meetingAccess(b.meetingId);
  if (access !== 'write') return forbidden(access);
  const [h] = await sql`
    insert into highlights (meeting_id, start_ms, end_ms, note)
    values (${b.meetingId}, ${b.start_ms}, ${Math.max(b.end_ms, b.start_ms + 1000)}, ${b.note ?? null})
    returning id, start_ms, end_ms, note, created_live`;
  return json(h, 201);
}
