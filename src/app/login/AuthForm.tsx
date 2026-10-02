'use client';
import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { signIn, signInWithGoogle, signUp, type AuthState } from './actions';
import { cx } from '@/components/ui';

type Mode = 'signin' | 'signup';

const INTENT_COPY: Record<string, string> = {
  upload: 'Sign in to upload a recording into your private workspace.',
  record: 'Sign in to record a meeting.',
};

export function AuthForm({ initialMode, next, intent, googleError, google }: { initialMode: Mode; next: string; intent: string | null; googleError: boolean; google: boolean }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [inState, inAction] = useActionState<AuthState, FormData>(signIn, undefined);
  const [upState, upAction] = useActionState<AuthState, FormData>(signUp, undefined);
  const state = mode === 'signin' ? inState : upState;
  const [showPw, setShowPw] = useState(false);

  const hint = intent ? INTENT_COPY[intent] : next === '/record' ? INTENT_COPY.record : null;

  return (
    <div>
      <h2 className="text-[38px] leading-tight">{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</h2>
      <p className="mt-2 text-[14.5px] text-ink-2">
        {hint ?? (mode === 'signin' ? 'Your meetings are private to your account.' : 'Free, private, and ready in seconds. No email confirmation step.')}
      </p>

      <div role="tablist" className="mt-7 grid grid-cols-2 rounded-xl border border-rule bg-paper-2 p-1">
        {(['signin', 'signup'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            type="button"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cx('relative h-9 rounded-lg text-[13.5px] transition-colors', mode === m ? 'text-ink' : 'text-ink-3 hover:text-ink')}
          >
            {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-lg bg-card shadow-[0_1px_3px_rgb(0_0_0/0.08)]" />}
            <span className="relative">{m === 'signin' ? 'Sign in' : 'Create account'}</span>
          </button>
        ))}
      </div>

      <form action={signInWithGoogle} className="mt-5">
        <input type="hidden" name="next" value={next} />
        <GoogleButton enabled={google} />
      </form>
      {!google && <p className="mt-2 text-center text-[12px] text-ink-3">Google sign-in is being set up. Email works now.</p>}
      {googleError && (
        <p className="mt-2 text-[12.5px] text-danger">Google sign-in isn’t available right now. Use email and password instead.</p>
      )}

      <div className="my-5 flex items-center gap-3 text-[11.5px] tracking-[0.12em] text-ink-3 uppercase">
        <span className="h-px flex-1 bg-rule" /> or with email <span className="h-px flex-1 bg-rule" />
      </div>

      <form action={mode === 'signin' ? inAction : upAction} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <AnimatePresence initial={false}>
          {mode === 'signup' && (
            <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <Field label="Your name" name="name" autoComplete="name" placeholder="Rafay" error={state?.field === 'name' ? state.error : undefined} />
            </motion.div>
          )}
        </AnimatePresence>
        <Field label="Email" name="email" type="email" autoComplete="email" placeholder="you@company.com" error={state?.field === 'email' ? state.error : undefined} />
        <div className="relative">
          <Field
            label="Password"
            name="password"
            type={showPw ? 'text' : 'password'}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            placeholder={mode === 'signup' ? 'At least 8 characters' : ''}
            error={state?.field === 'password' ? state.error : undefined}
          />
          <button
            type="button"
            onClick={() => setShowPw((v) => !v)}
            aria-label={showPw ? 'Hide password' : 'Show password'}
            className="absolute top-[30px] right-1.5 flex h-9 w-9 items-center justify-center rounded-lg text-ink-3 hover:text-ink"
          >
            {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {state?.error && !state.field && <p className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{state.error}</p>}
        <Submit label={mode === 'signin' ? 'Sign in' : 'Create account'} />
      </form>

      <p className="mt-5 text-center text-[13px] text-ink-3">
        {mode === 'signin' ? 'New to Afterword? ' : 'Already have an account? '}
        <button type="button" onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')} className="font-medium text-accent hover:text-accent-ink">
          {mode === 'signin' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </div>
  );
}

function Field({ label, error, ...input }: { label: string; error?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      <input
        {...input}
        aria-invalid={!!error}
        className={cx(
          'mt-1.5 h-12 w-full rounded-xl border bg-card px-3.5 text-[15px] text-ink outline-none transition-[border,box-shadow] placeholder:text-ink-3/70',
          error ? 'border-danger focus:ring-4 focus:ring-danger/15' : 'border-rule-2 focus:border-accent focus:ring-4 focus:ring-accent/12',
        )}
      />
      {error && <span className="mt-1.5 block text-[12.5px] text-danger">{error}</span>}
    </label>
  );
}

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent text-[15px] font-medium text-paper shadow-[0_10px_28px_-12px_var(--accent)] transition-[transform,background] hover:-translate-y-px hover:bg-accent-ink active:translate-y-0 disabled:opacity-70"
    >
      {pending && <Loader2 size={16} className="animate-spin" />}
      {label}
    </button>
  );
}

function GoogleButton({ enabled }: { enabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending || !enabled}
      className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-rule-2 bg-card text-[14.5px] text-ink transition-colors hover:border-ink-3 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-rule-2"
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.5 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z" />
        </svg>
      )}
      Continue with Google
    </button>
  );
}
