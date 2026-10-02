import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getViewer } from '@/lib/auth';
import { LogoMark } from '@/components/Logo';
import { AuthForm } from './AuthForm';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

/** Which OAuth providers are switched on in Supabase (public endpoint; cached 5 min). */
async function googleEnabled() {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      next: { revalidate: 300 },
    });
    return !!(await r.json()).external?.google;
  } catch {
    return false;
  }
}

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams;
  const next = typeof sp.next === 'string' && sp.next.startsWith('/') && !sp.next.startsWith('//') ? sp.next : '/';
  if ((await getViewer()).user) redirect(next);
  const mode = sp.mode === 'signup' ? 'signup' : 'signin';
  const intent = typeof sp.intent === 'string' ? sp.intent : null;
  const googleError = sp.error === 'google';
  const google = await googleEnabled();

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-rail px-14 py-12 text-rail-ink lg:flex lg:flex-col">
        <div aria-hidden className="pointer-events-none absolute -top-40 -right-40 h-[520px] w-[520px] rounded-full bg-accent/25 blur-[120px]" />
        <div aria-hidden className="pointer-events-none absolute -bottom-48 -left-32 h-[460px] w-[460px] rounded-full bg-mark/15 blur-[120px]" />
        <Link href="/" className="relative flex items-center gap-3">
          <LogoMark size={34} className="rounded-[10px] ring-1 ring-white/10" />
          <span className="font-display text-[24px]">Afterword</span>
        </Link>

        <div className="relative my-auto max-w-[520px]">
          <h1 className="text-[54px] leading-[1.02] tracking-[-0.02em]">
            Notes you can <span className="italic text-mark">trust</span> the day after.
          </h1>
          <p className="mt-5 max-w-[46ch] text-[15.5px] leading-relaxed text-rail-ink-2">
            Every summary line, decision and action item links to the exact moment it was said. Hover to read the quote, click to hear it.
          </p>

          <figure className="mt-10 rounded-2xl bg-white/[0.04] p-5 ring-1 ring-white/10 backdrop-blur">
            <div className="text-[10.5px] tracking-[0.16em] text-rail-ink-2 uppercase">Decision · Q4 planning</div>
            <p className="mt-2 font-serif text-[18px] leading-snug">
              Delay the per-technician pricing change until January, after the November renewals.
              <span className="ml-1.5 rounded bg-white/8 px-1.5 py-0.5 font-mono text-[11px] text-mark">45:31</span>
            </p>
            <blockquote className="mt-3 border-l-2 border-mark pl-3 font-serif text-[14.5px] text-rail-ink-2 italic">
              “Then the decision is made. We will officially delay the per technician pricing change…”
              <span className="mt-1 block font-sans text-[11.5px] not-italic">Maya Chen, matched to the transcript</span>
            </blockquote>
          </figure>
        </div>

        <ul className="relative grid grid-cols-3 gap-6 text-[12.5px] text-rail-ink-2">
          <li><span className="block font-display text-[26px] text-rail-ink">100%</span>of action items found on an 8-person, 70-min call</li>
          <li><span className="block font-display text-[26px] text-rail-ink">8 / 8</span>speakers told apart and named</li>
          <li><span className="block font-display text-[26px] text-rail-ink">0</span>claims without a source</li>
        </ul>
      </section>

      {/* Form */}
      <section className="flex flex-col px-5 py-10 sm:px-10">
        <Link href="/" className="flex items-center gap-2.5 lg:hidden">
          <LogoMark size={30} />
          <span className="font-display text-[22px]">Afterword</span>
        </Link>
        <div className="mx-auto my-auto w-full max-w-[400px] py-10">
          <AuthForm initialMode={mode} next={next} intent={intent} googleError={googleError} google={google} />
        </div>
        <p className="text-center text-[12.5px] text-ink-3">
          Just looking? <Link href="/" className="text-accent underline-offset-4 hover:underline">Explore the demo workspace</Link>, no account needed.
        </p>
      </section>
    </div>
  );
}
