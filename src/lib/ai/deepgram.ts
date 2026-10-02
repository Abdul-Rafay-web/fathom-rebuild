// Deepgram REST: pre-recorded transcription with diarization, and short-lived
// browser tokens for live streaming.
import { fetchRetry, HttpError } from '../http';

const API = 'https://api.deepgram.com/v1';

function auth() {
  const k = process.env.DEEPGRAM_API_KEY;
  if (!k) throw new Error('DEEPGRAM_API_KEY is not set');
  return { Authorization: `Token ${k}` };
}

export type DGUtterance = { start_ms: number; end_ms: number; speaker: number; text: string; confidence: number };
export type DGResult = { duration_ms: number; utterances: DGUtterance[]; model: string };

/**
 * Deepgram fetches the media itself from a signed URL, so the audio never
 * transits our serverless function (no body-size limits, no double egress).
 */
export async function transcribeUrl(url: string): Promise<DGResult> {
  const params = new URLSearchParams({
    model: 'nova-3',
    diarize: 'true',
    punctuate: 'true',
    smart_format: 'true',
    utterances: 'true',
    utt_split: '1.1', // split utterances on pauses >1.1s: readable lines, fewer mid-sentence breaks
  });
  const res = await fetchRetry(
    `${API}/listen?${params}`,
    {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      timeoutMs: 280_000,
    },
    { retries: 2 },
  );
  const json = await res.json();
  const utterances: DGUtterance[] = (json.results?.utterances ?? [])
    .map((u: { start: number; end: number; speaker?: number; transcript: string; confidence: number }) => ({
      start_ms: Math.round(u.start * 1000),
      end_ms: Math.round(u.end * 1000),
      speaker: u.speaker ?? 0,
      text: u.transcript.trim(),
      confidence: u.confidence,
    }))
    .filter((u: DGUtterance) => u.text.length > 0);
  return {
    duration_ms: Math.round((json.metadata?.duration ?? 0) * 1000),
    utterances,
    model: json.metadata?.model_info ? Object.values(json.metadata.model_info as Record<string, { name: string }>)[0]?.name : 'nova-3',
  };
}

/** A 30-second token so the browser can open the streaming WebSocket without our key. */
export async function grantLiveToken(): Promise<{ token: string; expiresIn: number } | null> {
  try {
    const res = await fetchRetry(`${API}/auth/grant`, {
      method: 'POST',
      headers: { ...auth(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl_seconds: 30 }),
    }, { retries: 1 });
    const j = await res.json();
    return { token: j.access_token, expiresIn: j.expires_in };
  } catch (e) {
    if (e instanceof HttpError && e.status === 403) return null; // key lacks the scope; caller degrades
    throw e;
  }
}
