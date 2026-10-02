import { sql } from '@/lib/db';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [{ count }] = await sql<{ count: number }[]>`select count(*)::int as count from meetings`;
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col justify-center gap-3 px-4 py-24">
      <h1 className="text-3xl font-semibold tracking-tight">Afterword</h1>
      <p className="text-zinc-500">Meeting notes you can trust the day after. Building in public.</p>
      <p className="font-mono text-sm text-zinc-400">db: connected · meetings: {count}</p>
    </main>
  );
}
