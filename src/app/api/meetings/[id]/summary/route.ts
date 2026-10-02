import { sql } from '@/lib/db';
import { error, isUuid, json } from '@/lib/api';
import { rateLimit } from '@/lib/ratelimit';
import { isTemplate } from '@/lib/pipeline/prompts';
import { templateSummary } from '@/lib/pipeline/steps';
import { forbidden, meetingAccess } from '@/lib/auth';

export const maxDuration = 120;

/** Summary in another template. Cached by content hash: only the first request per template calls the model. */
export async function GET(req: Request, ctx: RouteContext<'/api/meetings/[id]/summary'>) {
  const { id } = await ctx.params;
  const template = new URL(req.url).searchParams.get('template') ?? 'general';
  if (!isUuid(id) || !isTemplate(template)) return error('bad request');
  const { access } = await meetingAccess(id);
  if (access === 'none') return forbidden(access);
  if (template === 'general') {
    const [r] = await sql`select content from insights where meeting_id = ${id} and template = 'general'`;
    return r ? json(r.content) : error('not ready', 409);
  }
  const [cached] = await sql`select 1 from insights where meeting_id = ${id} and template = ${template}`;
  if (!cached && !(await rateLimit('summary', 20, 600))) return error('Too many requests, slow down a little', 429);
  try {
    return json(await templateSummary(id, template));
  } catch (e) {
    return error(e instanceof Error ? e.message : 'failed', 502);
  }
}
