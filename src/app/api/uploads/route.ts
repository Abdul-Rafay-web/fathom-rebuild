import { z } from 'zod';
import { sql } from '@/lib/db';
import { body, error, json } from '@/lib/api';
import { rateLimit } from '@/lib/ratelimit';
import { signedUploadUrl } from '@/lib/storage';
import { getViewer } from '@/lib/auth';

const MAX_BYTES = 50 * 1024 * 1024; // Supabase free-tier object limit

const Upload = z.object({
  filename: z.string().min(1).max(200),
  mime: z.string().regex(/^(audio|video)\//, 'must be an audio or video file'),
  size: z.number().int().positive().max(MAX_BYTES, 'file is larger than 50 MB'),
  title: z.string().max(200).optional(),
  source: z.enum(['upload', 'live']).default('upload'),
  // Client-generated per file selection; a retried request maps to the same meeting.
  idempotencyKey: z.string().min(8).max(100),
});

/** Step 1 of an upload: create the meeting and hand back a one-time direct-to-storage URL. */
export async function POST(req: Request) {
  const b = await body(req, Upload);
  if (b instanceof Response) return b;
  const v = await getViewer();
  if (!v.personal) return error('Sign in to upload or record your own meetings.', 401);
  if (!(await rateLimit('upload', 12, 3600))) return error('Upload limit reached, try again in an hour', 429);

  const title = b.title?.trim() || 'Untitled recording';
  const [m] = await sql<{ id: string; status: string }[]>`
    insert into meetings (title, source, status, media_mime, idempotency_key, workspace_id)
    values (${title}, ${b.source}, 'recording', ${b.mime}, ${b.idempotencyKey}, ${v.personal.id})
    on conflict (idempotency_key) do update set updated_at = now()
    returning id, status`;
  if (m.status !== 'recording') return json({ meetingId: m.id, alreadyUploaded: true });

  const ext = (b.filename.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? 'bin').toLowerCase();
  const path = `uploads/${m.id}/recording.${ext}`;
  const signed = await signedUploadUrl(path);
  await sql`update meetings set media_path = ${path} where id = ${m.id}`;
  return json({ meetingId: m.id, path, token: signed.token, signedUrl: signed.signedUrl });
}
