import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase/server';

/** OAuth (Google) lands here with a one-time code; exchange it for a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const nextParam = url.searchParams.get('next') ?? '/';
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/';
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL(`/login?error=google&next=${encodeURIComponent(next)}`, url.origin));
}
