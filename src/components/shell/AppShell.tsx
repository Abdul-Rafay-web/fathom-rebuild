'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { CheckSquare, Library, Menu, Mic, Moon, Search, Sun, Upload, X } from 'lucide-react';
import { cx, Kbd } from '../ui';
import { Toaster } from '../toast';
import { CommandPalette } from './CommandPalette';
import { UploadDialog } from './UploadDialog';

const NAV = [
  { href: '/', label: 'Meetings', icon: Library, match: (p: string) => p === '/' || p.startsWith('/m/') },
  { href: '/actions', label: 'Action items', icon: CheckSquare, match: (p: string) => p.startsWith('/actions') },
  { href: '/search', label: 'Search & ask', icon: Search, match: (p: string) => p.startsWith('/search') },
];

export type PaletteMeeting = { id: string; title: string; started_at: string };

export function AppShell({ children, meetings, openActions }: { children: ReactNode; meetings: PaletteMeeting[]; openActions: number }) {
  const path = usePathname();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [upload, setUpload] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);

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

  useEffect(() => setMobileNav(false), [path]);

  const nav = (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ href, label, icon: Icon, match }) => {
        const active = match(path);
        return (
          <Link
            key={href}
            href={href}
            className={cx(
              'group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px] transition-colors',
              active ? 'bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.05)]' : 'text-ink-2 hover:bg-paper-2 hover:text-ink',
            )}
          >
            <Icon size={16} strokeWidth={1.6} className={active ? 'text-accent' : 'text-ink-3 group-hover:text-ink-2'} />
            <span className="flex-1">{label}</span>
            {href === '/actions' && openActions > 0 && (
              <span className="rounded-full bg-paper-2 px-1.5 text-[11px] text-ink-3 tnum">{openActions}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  const actions = (
    <div className="flex flex-col gap-2">
      <Link
        href="/record"
        className="flex h-9 items-center justify-center gap-2 rounded-lg bg-accent text-[13.5px] font-medium text-paper transition-colors hover:bg-accent-ink"
      >
        <Mic size={15} strokeWidth={1.8} /> Record a meeting
      </Link>
      <button
        onClick={() => setUpload(true)}
        className="flex h-9 items-center justify-center gap-2 rounded-lg border border-rule-2 bg-card text-[13.5px] text-ink transition-colors hover:border-ink-3"
      >
        <Upload size={15} strokeWidth={1.8} /> Upload recording
      </button>
    </div>
  );

  return (
    <div className="flex min-h-full">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-rule px-3 py-5 lg:flex">
        <Wordmark />
        <button
          onClick={() => setPalette(true)}
          className="mt-6 mb-4 flex h-9 items-center gap-2 rounded-lg border border-rule bg-card/60 px-2.5 text-[13px] text-ink-3 transition-colors hover:border-rule-2 hover:text-ink-2"
        >
          <Search size={14} strokeWidth={1.7} />
          <span className="flex-1 text-left">Jump to…</span>
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </button>
        {nav}
        <div className="mt-auto flex flex-col gap-4">
          {actions}
          <Footer />
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-rule bg-paper/90 px-4 backdrop-blur lg:hidden">
        <Wordmark />
        <div className="flex items-center gap-1">
          <button aria-label="Search" onClick={() => router.push('/search')} className="rounded-lg p-2 text-ink-2"><Search size={18} /></button>
          <button aria-label="Menu" onClick={() => setMobileNav((v) => !v)} className="rounded-lg p-2 text-ink-2">
            {mobileNav ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>
      {mobileNav && (
        <div className="fixed inset-x-0 top-14 z-40 flex flex-col gap-4 border-b border-rule bg-paper p-4 shadow-lift lg:hidden">
          {nav}
          {actions}
        </div>
      )}

      <main className="min-w-0 flex-1 pt-14 lg:pt-0">{children}</main>

      <CommandPalette open={palette} onClose={() => setPalette(false)} meetings={meetings} onUpload={() => { setPalette(false); setUpload(true); }} />
      <UploadDialog open={upload} onClose={() => setUpload(false)} />
      <Toaster />
    </div>
  );
}

function Wordmark() {
  return (
    <Link href="/" className="flex items-baseline gap-0 px-1.5 font-serif text-[23px] leading-none tracking-[-0.01em] text-ink" aria-label="Afterword home">
      Afterword<span className="text-mark">.</span>
    </Link>
  );
}

function Footer() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null);
  useEffect(() => {
    const t = document.documentElement.dataset.theme as 'light' | 'dark' | undefined;
    setTheme(t ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }, []);
  const flip = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('aw-theme', next); } catch {}
    setTheme(next);
  };
  return (
    <div className="flex items-center justify-between border-t border-rule px-1.5 pt-3 text-[12px] text-ink-3">
      <span>
        <span className="text-ink-2">Tidewater</span> · demo workspace
      </span>
      <button onClick={flip} aria-label="Toggle theme" className="rounded-md p-1.5 hover:bg-paper-2 hover:text-ink">
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </div>
  );
}
