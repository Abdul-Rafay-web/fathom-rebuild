import type { Metadata } from 'next';
import { Recorder } from '@/components/Recorder';

export const metadata: Metadata = { title: 'Record' };
// The shared layout reads live data (palette, inbox count); never prerender it.
export const dynamic = 'force-dynamic';

export default function RecordPage() {
  return <Recorder />;
}
