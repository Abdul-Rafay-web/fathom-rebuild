import type { Metadata } from 'next';
import { SearchView } from '@/components/SearchView';

export const metadata: Metadata = { title: 'Search & ask' };

export default async function SearchPage({ searchParams }: PageProps<'/search'>) {
  const sp = await searchParams;
  const q = typeof sp.q === 'string' ? sp.q : '';
  const ask = sp.ask === '1';
  return <SearchView initialQ={q} initialAsk={ask} />;
}
