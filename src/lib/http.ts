// fetch with retries: exponential backoff + full jitter on network errors,
// 408/429/5xx. Honors Retry-After. Everything else fails fast.

export class HttpError extends Error {
  constructor(public status: number, public body: string, url: string) {
    super(`HTTP ${status} from ${new URL(url).host}: ${body.slice(0, 300)}`);
  }
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
  { retries = 4, baseMs = 600, maxMs = 15_000 } = {},
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), init.timeoutMs ?? 120_000);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      if (res.ok) return res;
      const body = await res.text();
      lastErr = new HttpError(res.status, body, url);
      if (!RETRYABLE.has(res.status) || attempt === retries) throw lastErr;
      const ra = Number(res.headers.get('retry-after'));
      await sleep(ra > 0 ? Math.min(ra * 1000, maxMs) : backoff(attempt, baseMs, maxMs));
    } catch (e) {
      if (e instanceof HttpError && !RETRYABLE.has(e.status)) throw e;
      lastErr = e;
      if (attempt === retries) break;
      await sleep(backoff(attempt, baseMs, maxMs));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function backoff(attempt: number, base: number, max: number) {
  return Math.random() * Math.min(max, base * 2 ** attempt); // "full jitter"
}
