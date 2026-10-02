import { speakerColor } from '@/lib/format';

/** The conversation's shape: who held the floor across the meeting, in 96 slices. */
export function Fingerprint({ data, className = '' }: { data: number[] | null; className?: string }) {
  if (!data?.length) return <div className={`h-[5px] rounded-full bg-paper-2 ${className}`} />;
  return (
    <div className={`flex h-[5px] gap-px overflow-hidden rounded-full ${className}`} aria-hidden>
      {data.map((label, i) => (
        <span
          key={i}
          className="h-full flex-1"
          style={{ background: label < 0 ? 'var(--rule)' : speakerColor(label), opacity: label < 0 ? 0.6 : 0.9 }}
        />
      ))}
    </div>
  );
}
