import type { Metadata } from 'next';
import { Recorder } from '@/components/Recorder';

export const metadata: Metadata = { title: 'Record' };

export default function RecordPage() {
  return <Recorder />;
}
