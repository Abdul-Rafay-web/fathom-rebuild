import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-[12px] text-ink-3">404</p>
      <h1 className="mt-2 font-serif text-[34px]">Nothing was said here.</h1>
      <p className="mt-2 max-w-[44ch] text-[14px] text-ink-3">The meeting or clip may have been deleted, or the link was copied incompletely.</p>
      <Link href="/" className="mt-6 rounded-lg bg-accent px-4 py-2 text-[13.5px] text-paper">Back to meetings</Link>
    </main>
  );
}
