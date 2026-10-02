// Shared, isomorphic formatting helpers.

/** 83_000 → "1:23", 3_723_000 → "1:02:03" */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

/** 3_723_000 → "1h 2m", 540_000 → "9 min" */
export function duration(ms: number) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
}

export function pct(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

// Eight muted, distinguishable speaker hues (ordered for max contrast between
// neighbours). Chosen to read on both the paper and ink themes.
export const SPEAKER_COLORS = [
  '#B5653B', // terracotta
  '#3F7A6E', // verdigris
  '#5A6B9A', // slate
  '#A68A2E', // ochre
  '#8A4F7D', // plum
  '#6E7F3A', // olive
  '#3C8399', // lagoon
  '#A2575F', // rosewood
];
export const speakerColor = (label: number) => SPEAKER_COLORS[label % SPEAKER_COLORS.length];

export function initials(name: string) {
  const parts = name.replace(/^Speaker\s+/i, 'S ').trim().split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
}
