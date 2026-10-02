import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMeeting } from '@/lib/queries';
import { signedReadUrl } from '@/lib/storage';
import { Workspace } from '@/components/meeting/Workspace';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/m/[id]'>): Promise<Metadata> {
  const { id } = await params;
  const d = await getMeeting(id);
  return { title: d?.meeting.title ?? 'Meeting' };
}

export default async function MeetingPage({ params, searchParams }: PageProps<'/m/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  const data = await getMeeting(id);
  if (!data) notFound();
  const mediaUrl = data.meeting.media_path && data.meeting.status !== 'recording' ? await signedReadUrl(data.meeting.media_path) : null;
  const t = Number(Array.isArray(sp.t) ? sp.t[0] : sp.t);
  return <Workspace data={data} mediaUrl={mediaUrl} initialT={Number.isFinite(t) && t >= 0 ? t : null} />;
}
