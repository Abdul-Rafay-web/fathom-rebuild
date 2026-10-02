import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getMeeting } from '@/lib/queries';
import { meetingAccess } from '@/lib/auth';
import { signedReadUrl } from '@/lib/storage';
import { Workspace } from '@/components/meeting/Workspace';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps<'/m/[id]'>): Promise<Metadata> {
  const { id } = await params;
  if ((await meetingAccess(id).catch(() => ({ access: 'none' }))).access === 'none') return { title: 'Meeting' };
  const d = await getMeeting(id);
  return { title: d?.meeting.title ?? 'Meeting' };
}

export default async function MeetingPage({ params, searchParams }: PageProps<'/m/[id]'>) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  // Someone else's private meeting is indistinguishable from a missing one.
  const { access } = await meetingAccess(id);
  if (access === 'none') notFound();
  const data = await getMeeting(id);
  if (!data) notFound();
  const mediaUrl = data.meeting.media_path && data.meeting.status !== 'recording' ? await signedReadUrl(data.meeting.media_path) : null;
  const t = Number(Array.isArray(sp.t) ? sp.t[0] : sp.t);
  return <Workspace data={data} mediaUrl={mediaUrl} canEdit={access === 'write'} initialT={Number.isFinite(t) && t >= 0 ? t : null} />;
}
