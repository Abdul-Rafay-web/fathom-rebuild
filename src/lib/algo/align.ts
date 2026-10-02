// Grounding: tie every AI claim to the transcript moment that supports it.
//
// The model cites a line number and a short verbatim quote. We never trust the
// line number alone: we check the quote against a window around the cited line
// (models are often off by one or two), then fall back to a scan of the whole
// transcript. A claim whose quote can't be found anywhere is dropped instead
// of shown with a made-up timestamp.
//
// Similarity is bigram containment: the share of the quote's word bigrams that
// appear in the candidate window. Bigrams survive the small paraphrases
// models make ("we'll" vs "we will", dropped fillers) better than an exact
// match, but are strict enough that an unrelated line can't score.

export type Line = { start_ms: number; end_ms: number; text: string };

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w && !FILLERS.has(w));

const FILLERS = new Set(['um', 'uh', 'erm', 'like', 'so', 'yeah', 'okay', 'ok', 'oh']);

function bigrams(ws: string[]) {
  const out: string[] = [];
  for (let i = 0; i + 1 < ws.length; i++) out.push(ws[i] + ' ' + ws[i + 1]);
  return out.length ? out : ws; // single-word quote: fall back to unigrams
}

export class Grounder {
  private lineGrams: Set<string>[];
  private lineWords: Set<string>[];

  constructor(private lines: Line[]) {
    this.lineGrams = lines.map((l) => new Set(bigrams(norm(l.text))));
    this.lineWords = lines.map((l) => new Set(norm(l.text)));
  }

  /** Containment score of quote within lines[i..i+span). */
  private score(qg: string[], i: number, span: number) {
    let hit = 0;
    for (const g of qg) {
      for (let k = i; k < Math.min(this.lines.length, i + span); k++) {
        if (this.lineGrams[k].has(g) || this.lineWords[k].has(g)) { hit++; break; }
      }
    }
    return hit / qg.length;
  }

  /**
   * Returns the line index the claim is grounded in, or null.
   * Quotes can straddle two lines, so windows of 1 and 2 lines are scored.
   */
  ground(citedLine: number | null | undefined, quote: string | null | undefined, threshold = 0.6): number | null {
    const qw = norm(quote ?? '');
    if (qw.length >= 2) {
      const qg = bigrams(qw);
      let best = -1, bestScore = 0;
      const tryAt = (i: number) => {
        if (i < 0 || i >= this.lines.length) return;
        for (const span of [1, 2]) {
          const s = this.score(qg, i, span);
          // Prefer the cited neighbourhood on ties; prefer the first line of a span.
          if (s > bestScore + 1e-9) { bestScore = s; best = i; }
        }
      };
      if (citedLine != null) for (let d = 0; d <= 3; d++) { tryAt(citedLine - d); if (d) tryAt(citedLine + d); }
      if (bestScore >= threshold) return this.refine(best, qg);
      for (let i = 0; i < this.lines.length; i++) tryAt(i);
      if (bestScore >= threshold) return this.refine(best, qg);
      return null;
    }
    // No usable quote: accept the cited line only if it exists.
    return citedLine != null && citedLine >= 0 && citedLine < this.lines.length ? citedLine : null;
  }

  // For a 2-line match, point at whichever line holds most of the quote.
  private refine(i: number, qg: string[]) {
    if (i + 1 < this.lines.length && this.score(qg, i + 1, 1) > this.score(qg, i, 1)) return i + 1;
    return i;
  }
}
