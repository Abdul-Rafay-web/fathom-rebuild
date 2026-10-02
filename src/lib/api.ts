import 'server-only';
import { z } from 'zod';

export const json = (data: unknown, status = 200) => Response.json(data, { status });
export const error = (message: string, status = 400) => Response.json({ error: message }, { status });

/** Parse and validate a JSON body; returns a typed value or a 400 Response. */
export async function body<T>(req: Request, schema: z.ZodType<T>): Promise<T | Response> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return error('Body must be JSON');
  }
  const r = schema.safeParse(raw);
  return r.success ? r.data : error(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
}

export const uuid = z.string().uuid();
export const isUuid = (s: string) => uuid.safeParse(s).success;
