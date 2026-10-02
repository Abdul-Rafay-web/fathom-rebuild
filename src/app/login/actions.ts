'use server';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { rateLimit } from '@/lib/ratelimit';
import { supabaseAdmin, supabaseServer } from '@/lib/supabase/server';

export type AuthState = { error?: string; field?: 'email' | 'password' | 'name' } | undefined;

// Only same-site relative paths: never redirect to an attacker-supplied URL.
const safeNext = (n: FormDataEntryValue | null) => {
  const s = typeof n === 'string' ? n : '/';
  return s.startsWith('/') && !s.startsWith('//') ? s : '/';
};

const Creds = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(8, 'Use at least 8 characters').max(72),
});

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = Creds.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: i.message, field: i.path[0] as 'email' | 'password' };
  }
  if (!(await rateLimit('signin', 20, 600))) return { error: 'Too many attempts. Wait a few minutes.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // One message for both cases: don't reveal which emails have accounts.
  if (error) return { error: 'That email and password don’t match.', field: 'password' };
  redirect(safeNext(form.get('next')));
}

/**
 * Accounts are created server-side with the admin API and confirmed
 * immediately, then signed in. No confirmation email round trip: Supabase's
 * built-in mailer allows only a few emails per hour, which would block a demo.
 * Trade-off: emails aren't verified (noted in the README).
 */
export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  if (!name) return { error: 'Tell us what to call you', field: 'name' };
  const parsed = Creds.safeParse({ email: form.get('email'), password: form.get('password') });
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    return { error: i.message, field: i.path[0] as 'email' | 'password' };
  }
  if (!(await rateLimit('signup', 6, 3600))) return { error: 'Too many sign-ups from this network. Try again later.' };

  const { error } = await supabaseAdmin().auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) {
    return /already|registered|exists/i.test(error.message)
      ? { error: 'An account with this email already exists. Sign in instead.', field: 'email' }
      : { error: 'Couldn’t create the account. Try again.' };
  }
  const supabase = await supabaseServer();
  const { error: e2 } = await supabase.auth.signInWithPassword(parsed.data);
  if (e2) return { error: 'Account created. Please sign in.' };
  redirect(safeNext(form.get('next')));
}

export async function signInWithGoogle(form: FormData) {
  const h = await headers();
  const origin = h.get('origin') ?? `https://${h.get('host')}`;
  const next = safeNext(form.get('next'));
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

export async function signOut() {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  redirect('/');
}
