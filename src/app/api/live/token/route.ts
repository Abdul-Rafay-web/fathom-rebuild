import { error, json } from '@/lib/api';
import { rateLimit } from '@/lib/ratelimit';
import { grantLiveToken } from '@/lib/ai/deepgram';

/** A 30-second Deepgram token for the browser's streaming socket. The real key never leaves the server. */
export async function POST() {
  if (!(await rateLimit('live-token', 30, 600))) return error('Too many live sessions', 429);
  const t = await grantLiveToken();
  return t ? json(t) : json({ unavailable: true, reason: 'Live captions need a Deepgram key with token-grant permission.' });
}
