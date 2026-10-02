import { NextResponse } from 'next/server';
import { WS_COOKIE } from '@/lib/auth';

/** Switch between your private workspace and the public demo (a preference cookie, not a permission). */
export async function POST(req: Request) {
  const form = await req.formData();
  const to = form.get('to') === 'demo' ? 'demo' : 'mine';
  const res = NextResponse.redirect(new URL('/', req.url), 303);
  res.cookies.set(WS_COOKIE, to, { path: '/', httpOnly: true, sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
  return res;
}
