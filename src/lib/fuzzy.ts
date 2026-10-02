/**
 * Subsequence fuzzy match with scoring (the fzf / VS Code quick-open family).
 * Every query char must appear in order. Matches score higher when they are
 * consecutive, start a word, or come early. O(n·m) worst case with a greedy
 * pass, which is plenty for a palette of a few hundred items.
 * Returns null for no match, else { score, indices } for highlighting.
 */
export function fuzzy(query: string, target: string): { score: number; indices: number[] } | null {
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return { score: 0, indices: [] };
  const t = target.toLowerCase();
  const indices: number[] = [];
  let score = 0;
  let ti = 0;
  let prev = -2;
  for (const ch of q) {
    // Prefer an occurrence at a word start if one exists ahead.
    let found = -1;
    for (let i = ti; i < t.length; i++) {
      if (t[i] !== ch) continue;
      if (found === -1) found = i;
      if (i === 0 || /[\s\-_/:.]/.test(t[i - 1])) { found = i; break; }
      if (i === prev + 1) { found = i; break; }
    }
    if (found === -1) return null;
    const wordStart = found === 0 || /[\s\-_/:.]/.test(t[found - 1]);
    score += 1 + (found === prev + 1 ? 4 : 0) + (wordStart ? 3 : 0) - Math.min(found - ti, 6) * 0.15;
    indices.push(found);
    prev = found;
    ti = found + 1;
  }
  score -= t.length * 0.01; // shorter targets win ties
  return { score, indices };
}
