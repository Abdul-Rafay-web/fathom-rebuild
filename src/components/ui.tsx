'use client';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clock, initials } from '@/lib/format';

export function cx(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ');
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'quiet'; size?: 'sm' | 'md' };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'outline', size = 'md', className, ...p },
  ref,
) {
  return (
    <button
      ref={ref}
      {...p}
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background,color,border,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-45',
        size === 'sm' ? 'h-7 px-2.5 text-[12.5px]' : 'h-9 px-3.5 text-[13.5px]',
        variant === 'primary' && 'bg-accent text-paper hover:bg-accent-ink shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]',
        variant === 'outline' && 'border border-rule-2 bg-card text-ink hover:border-ink-3',
        variant === 'ghost' && 'text-ink-2 hover:bg-paper-2 hover:text-ink',
        variant === 'quiet' && 'text-ink-3 hover:text-ink',
        className,
      )}
    />
  );
});

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border border-rule-2 bg-card px-1 font-mono text-[10.5px] text-ink-3">
      {children}
    </kbd>
  );
}

export function Avatar({ name, color, size = 22, ring }: { name: string; color: string; size?: number; ring?: boolean }) {
  return (
    <span
      title={name}
      className={cx('inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white', ring && 'ring-2 ring-paper')}
      style={{ width: size, height: size, background: color, fontSize: size * 0.4, letterSpacing: '0.02em' }}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ people, max = 5, size = 22 }: { people: { name: string; color: string }[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((p, i) => (
        <span key={p.name + i} style={{ marginLeft: i ? -size * 0.3 : 0 }}>
          <Avatar name={p.name} color={p.color} size={size} ring />
        </span>
      ))}
      {people.length > max && <span className="ml-1.5 text-[12px] text-ink-3 tnum">+{people.length - max}</span>}
    </span>
  );
}

/** The footnote-style timestamp that ties a claim to its moment. Hover reveals the evidence. */
export function Cite({ ms, quote, onPlay }: { ms: number; quote?: string | null; onPlay: (ms: number) => void }) {
  return (
    <span className="group/cite relative inline-block align-baseline">
      <button
        onClick={() => onPlay(ms)}
        className="ml-1 rounded px-1 font-mono text-[11px] text-accent tnum underline decoration-accent/35 decoration-dotted underline-offset-[3px] transition-colors hover:bg-accent-wash hover:decoration-solid"
        aria-label={`Play from ${clock(ms)}`}
      >
        {clock(ms)}
      </button>
      {quote && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-72 -translate-x-1/2 translate-y-1 rounded-lg border border-rule bg-card p-3 font-serif text-[14px] leading-snug text-ink-2 italic opacity-0 shadow-lift transition-all duration-150 group-hover/cite:translate-y-0 group-hover/cite:opacity-100">
          “{quote}”
          <span className="mt-1.5 block font-sans text-[11px] not-italic text-ink-3">Source at {clock(ms)}. Click to play</span>
        </span>
      )}
    </span>
  );
}

export function Segmented<T extends string>({
  value, options, onChange, size = 'md',
}: { value: T; options: { value: T; label: string; hint?: string }[]; onChange: (v: T) => void; size?: 'sm' | 'md' }) {
  return (
    <div role="tablist" className="inline-flex rounded-lg border border-rule bg-paper-2 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-2.5 transition-all duration-150',
            size === 'sm' ? 'h-6 text-[12px]' : 'h-7 text-[12.5px]',
            o.value === value ? 'bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.08)]' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h3 className="text-[11px] font-medium tracking-[0.14em] text-ink-3 uppercase">{children}</h3>
      {right}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-rule-2 px-5 py-8 text-center">
      <p className="font-serif text-[17px] text-ink-2">{title}</p>
      {children && <div className="mt-1.5 text-[13px] text-ink-3">{children}</div>}
    </div>
  );
}
