import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { getClip } from '@/lib/queries';
import { signedReadUrl } from '@/lib/storage';
import { clock } from '@/lib/format';
import { ClipView } from '@/components/ClipView';

export const dynamic = 'force-dynamic';

// generateMetadata and the page share one lookup per request (and one view count).
const load = cache(getClip);

export async function generateMetadata({ params }: PageProps<'/c/[token]'>): Promise<Metadata> {
  const { token } = await params;
  const d = await load(token);
  if (!d) return { title: 'Clip not found' };
  const first = d.utterances[0]?.text ?? '';
  return {
    title: d.clip.title,
    description: `${clock(d.clip.end_ms - d.clip.start_ms)} clip from “${d.clip.meeting_title}”. ${first.slice(0, 140)}`,
    openGraph: { title: d.clip.title, description: `From “${d.clip.meeting_title}”`, type: 'video.other' },
    robots: { index: false },
  };
}

/** Public clip page: no sign-in, no app chrome, only the shared range. */
export default async function ClipPage({ params }: PageProps<'/c/[token]'>) {
  const { token } = await params;
  const d = await load(token);
  if (!d) notFound();
  const mediaUrl = await signedReadUrl(d.clip.media_path, 60 * 60 * 2);
  return (
    <ClipView
      clip={{ ...d.clip, started_at: d.clip.started_at.toISOString() }}
      speakers={d.speakers}
      utterances={d.utterances}
      mediaUrl={mediaUrl}
    />
  );
}
