import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Recorder } from '@/components/Recorder';
import { getViewer } from '@/lib/auth';

export const metadata: Metadata = { title: 'Record' };
// The shared layout reads live data (palette, inbox count); never prerender it.
export const dynamic = 'force-dynamic';

export default async function RecordPage() {
  // Recordings go into your private workspace: the demo account can't record.
  const v = await getViewer();
  if (!v.personal) redirect(v.user ? '/login?mode=signup&intent=record' : '/login?next=/record');
  return <Recorder />;
}
