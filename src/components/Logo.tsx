/** The Afterword mark: transcript lines, one moment highlighted. Same drawing as app/icon.svg. */
export function LogoMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden>
      <rect width="64" height="64" rx="15" fill="#22182A" />
      <rect x="14" y="17" width="30" height="5" rx="2.5" fill="#EFE6DA" opacity="0.55" />
      <rect x="14" y="29.5" width="36" height="5" rx="2.5" fill="#E9A23B" />
      <rect x="14" y="42" width="22" height="5" rx="2.5" fill="#EFE6DA" opacity="0.55" />
      <circle cx="47" cy="44.5" r="4" fill="#E48AB2" />
    </svg>
  );
}

export function Wordmark({ tone = 'ink', size = 22 }: { tone?: 'ink' | 'rail'; size?: number }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={size + 6} className={tone === 'rail' ? 'ring-1 ring-white/10 rounded-[9px]' : ''} />
      <span className={`font-display leading-none ${tone === 'rail' ? 'text-rail-ink' : 'text-ink'}`} style={{ fontSize: size }}>
        Afterword
      </span>
    </span>
  );
}
