'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckSquare, Library, LogOut, Menu, Mic, Moon, Search, Sun, Upload, X } from 'lucide-react';
import { signOut } from '@/app/login/actions';
import { cx } from '../ui';
import { Toaster, toast } from '../toast';
import { Wordmark } from '../Logo';
import { CommandPalette } from './CommandPalette';
import { UploadDialog } from './UploadDialog';
import { OPEN_UPLOAD } from '../library/Bits';

export type PaletteMeeting = { id: string; title: string; started_at: string };
export type ShellViewer = {
  user: { id: string; email: string; name: string; avatar: string | null } | null;
  workspace: { name: string; isDemo: boolean };
  personalName: string | null;
  canEdit: boolean;
};

const ViewerCtx = createContext<ShellViewer | null>(null);
/** Who's looking and whether they may change things. Demo = read-only. */
export function useViewer() {
  return useContext(ViewerCtx)!;
}

/** Tell demo visitors once per session that changes there aren't saved. */
let demoNoticeShown = false;
export function demoNotice(signedIn: boolean) {
  if (demoNoticeShown) return;
  demoNoticeShown = true;
  toast(signedIn ? 'The demo is read-only. Changes stay in this tab.' : 'Demo changes stay in this tab. Create an account to keep your own.');
}

const NAV = [
  { href: '/', label: 'Meetings', icon: Library, match: (p: string) => p === '/' || p.startsWith('/m/') },
  { href: '/actions', label: 'Action items', icon: CheckSquare, match: (p: string) => p.startsWith('/actions') },
  { href: '/search', label: 'Search & ask', icon: Search, match: (p: string) => p.startsWith('/search') },
];

export function AppShell({ children, meetings, openActions, viewer }: { children: ReactNode; meetings: PaletteMeeting[]; openActions: number; viewer: ShellViewer }) {
  const path = usePathname();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [upload, setUpload] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const signedIn = !!viewer.user;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    const open = () => (signedIn ? setUpload(true) : router.push('/login?next=/&intent=upload'));
    window.addEventListener(OPEN_UPLOAD, open);
    return () => window.removeEventListener(OPEN_UPLOAD, open);
  }, [signedIn, router]);

  const startUpload = () => (signedIn ? setUpload(true) : router.push('/login?next=/&intent=upload'));

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={href}
            href={href}
            onClick={() => setMobileNav(false)}
            className={cx('relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] transition-colors', active ? 'text-rail-ink' : 'text-rail-ink-2 hover:text-rail-ink')}
          >
            {active && <motion.span layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-rail-2 ring-1 ring-white/5" />}
            <Icon size={16} strokeWidth={1.7} className={cx('relative', active ? 'text-mark' : '')} />
            <span className="relative flex-1">{label}</span>
            {href === '/actions' && openActions > 0 && (
              <span className="relative rounded-full bg-white/8 px-2 py-px text-[11px] text-rail-ink-2 tnum">{openActions}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const actions = (
    <div className="flex flex-col gap-2">
      <Link
        href={signedIn ? '/record' : '/login?next=/record'}
        onClick={() => setMobileNav(false)}
        className="group flex h-11 items-center justify-center gap-2 rounded-xl bg-accent text-[14px] font-medium text-paper shadow-[0_8px_24px_-10px_var(--accent)] transition-[transform,background] hover:-translate-y-px hover:bg-accent-ink active:translate-y-0"
      >
        <Mic size={15} strokeWidth={1.9} /> Record a meeting
      </Link>
      <button
        onClick={() => { setMobileNav(false); startUpload(); }}
        className="flex h-11 items-center justify-center gap-2 rounded-xl border border-white/12 text-[14px] text-rail-ink transition-colors hover:bg-white/5"
      >
        <Upload size={15} strokeWidth={1.9} /> Upload recording
      </button>
    </div>
  );

  return (
    <ViewerCtx.Provider value={viewer}>
      <div className="flex min-h-full">
        {/* Desktop rail */}
        <aside className="sticky top-0 hidden h-screen w-[256px] shrink-0 flex-col bg-rail px-4 py-6 text-rail-ink lg:flex">
          <Link href="/" className="px-1.5" aria-label="Afterword home"><Wordmark tone="rail" /></Link>
          {signedIn && <WorkspaceSwitch viewer={viewer} />}
          <button
            onClick={() => setPalette(true)}
            className="mt-5 mb-3 flex h-10 items-center gap-2.5 rounded-xl bg-white/5 px-3 text-[13px] text-rail-ink-2 ring-1 ring-white/8 transition-colors hover:bg-white/8 hover:text-rail-ink"
          >
            <Search size={14} strokeWidth={1.8} />
            <span className="flex-1 text-left">Jump to…</span>
            <span className="font-mono text-[10.5px] opacity-70">Ctrl K</span>
          </button>
          {nav}
          <div className="mt-auto flex flex-col gap-5">
            {actions}
            <Account viewer={viewer} />
          </div>
        </aside>

        {/* Mobile top bar */}
        <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between bg-rail px-4 text-rail-ink lg:hidden">
          <Link href="/" aria-label="Afterword home"><Wordmark tone="rail" size={19} /></Link>
          <div className="flex items-center gap-1">
            <button aria-label="Search" onClick={() => router.push('/search')} className="flex h-10 w-10 items-center justify-center rounded-lg text-rail-ink-2"><Search size={18} /></button>
            <button aria-label="Menu" onClick={() => setMobileNav((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-lg text-rail-ink-2">
              {mobileNav ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
        <AnimatePresence>
          {mobileNav && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8, transition: { duration: 0.12 } }}
              className="fixed inset-x-0 top-14 z-40 flex flex-col gap-5 bg-rail p-4 text-rail-ink shadow-lift lg:hidden"
            >
              {signedIn && <WorkspaceSwitch viewer={viewer} />}
              {nav}
              {actions}
              <Account viewer={viewer} />
            </motion.div>
          )}
        </AnimatePresence>

        <main className="min-w-0 flex-1 pt-14 lg:pt-0">
          {viewer.workspace.isDemo && <DemoBanner signedIn={signedIn} />}
          {children}
        </main>

        <AnimatePresence>
          {palette && <CommandPalette key="palette" onClose={() => setPalette(false)} meetings={meetings} onUpload={() => { setPalette(false); startUpload(); }} />}
          {upload && <UploadDialog key="upload" onClose={() => setUpload(false)} />}
        </AnimatePresence>
        <Toaster />
      </div>
    </ViewerCtx.Provider>
  );
}

function WorkspaceSwitch({ viewer }: { viewer: ShellViewer }) {
  const mine = !viewer.workspace.isDemo;
  return (
    <form action="/workspace" method="post" className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-white/5 p-1 ring-1 ring-white/8">
      {(['mine', 'demo'] as const).map((k) => {
        const active = (k === 'mine') === mine;
        return (
          <button
            key={k}
            name="to"
            value={k}
            disabled={active}
            className={cx('relative h-8 rounded-lg text-[12.5px] transition-colors', active ? 'text-rail-ink' : 'text-rail-ink-2 hover:text-rail-ink')}
          >
            {active && <motion.span layoutId="ws-pill" className="absolute inset-0 rounded-lg bg-rail-2 ring-1 ring-white/8" />}
            <span className="relative">{k === 'mine' ? 'My meetings' : 'Demo'}</span>
          </button>
        );
      })}
    </form>
  );
}

function Account({ viewer }: { viewer: ShellViewer }) {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => null);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem('aw-theme', next); } catch {}
    themeListeners.forEach((fn) => fn());
  };
  const themeBtn = (
    <button onClick={flip} aria-label="Toggle night mode" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-rail-ink-2 hover:bg-white/5 hover:text-rail-ink">
      {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
    </button>
  );
  if (!viewer.user) {
    return (
      <div className="border-t border-white/8 pt-4">
        <div className="flex items-center gap-2">
          <Link href="/login" className="flex h-9 flex-1 items-center justify-center rounded-lg bg-white/8 text-[13px] text-rail-ink hover:bg-white/12">Sign in</Link>
          {themeBtn}
        </div>
        <p className="mt-2.5 px-1 text-[11.5px] leading-snug text-rail-ink-2">Browsing the public demo. Accounts are free.</p>
      </div>
    );
  }
  const u = viewer.user;
  return (
    <div className="flex items-center gap-2.5 border-t border-white/8 pt-4">
      {u.avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={u.avatar} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-white/15" referrerPolicy="no-referrer" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-mark text-[13px] font-medium text-rail">{u.name.slice(0, 1).toUpperCase()}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] text-rail-ink">{u.name}</div>
        <div className="truncate text-[11.5px] text-rail-ink-2">{u.email}</div>
      </div>
      {themeBtn}
      <form action={signOut}>
        <button aria-label="Sign out" title="Sign out" className="flex h-9 w-9 items-center justify-center rounded-lg text-rail-ink-2 hover:bg-white/5 hover:text-rail-ink">
          <LogOut size={15} />
        </button>
      </form>
    </div>
  );
}

function DemoBanner({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="border-b border-rule bg-mark-wash/55">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[13px] sm:px-8">
        <span className="h-1.5 w-1.5 rounded-full bg-mark" />
        <span className="text-ink-2">
          {signedIn ? 'You’re viewing the Tidewater demo workspace. It’s read-only.' : 'You’re exploring the Tidewater demo: six real meetings, processed end to end.'}
        </span>
        {signedIn ? (
          <form action="/workspace" method="post" className="ml-auto">
            <button name="to" value="mine" className="inline-flex items-center gap-1 font-medium text-accent hover:text-accent-ink">Back to my meetings <ArrowRight size={13} /></button>
          </form>
        ) : (
          <Link href="/login?mode=signup" className="ml-auto inline-flex items-center gap-1 font-medium text-accent hover:text-accent-ink">
            Create a free account to record your own <ArrowRight size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

// Theme as an external store: <html data-theme> set before paint by the root layout.
const themeListeners = new Set<() => void>();
function subscribeTheme(fn: () => void) {
  themeListeners.add(fn);
  return () => { themeListeners.delete(fn); };
}
function currentTheme(): 'light' | 'dark' {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

