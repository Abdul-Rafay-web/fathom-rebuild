import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Recorder } from '@/components/Recorder';
import { getViewer } from '@/lib/auth';

export const metadata: Metadata = { title: 'Record' };
// The shared layout reads live data (palette, inbox count); never prerender it.
export const dynamic = 'force-dynamic';

export default async function RecordPage() {
  // Recordings go into your private workspace, so recording needs an account.
  if (!(await getViewer()).user) redirect('/login?next=/record');
  return <Recorder />;
}
