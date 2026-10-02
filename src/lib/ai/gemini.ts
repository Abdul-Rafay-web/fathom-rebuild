// Thin Gemini REST client: schema-constrained JSON generation and batched embeddings.
// - The Zod schema is the single source of truth: it's converted to JSON Schema for
//   constrained decoding, then used again to validate what comes back.
// - A model chain gives graceful degradation when one model is overloaded (503).
// - On a validation failure the model gets one retry with the error fed back.
import { z } from 'zod';
import { fetchRetry, HttpError } from '../http';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export const MODELS = {
  // Full-context analysis of up to ~1h transcripts.
  analysis: ['gemini-3.8-flash', 'gemini-3.5-flash'],
  // Hot path: speaker naming, live action items, Ask.
  fast: ['gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.8-flash'],
  embedding: 'gemini-embedding-001',
} as const;

export const EMBED_DIM = 768;

function key() {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error('GEMINI_API_KEY is not set');
  return k;
}

function toGeminiSchema(schema: z.ZodType) {
  const js = z.toJSONSchema(schema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

export type GenOpts<T> = {
  models: readonly string[];
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  temperature?: number;
  timeoutMs?: number;
};

export type GenResult<T> = { data: T; model: string; tokens: number };

export async function generateJSON<T>(opts: GenOpts<T>): Promise<GenResult<T>> {
  const responseJsonSchema = toGeminiSchema(opts.schema);
  let lastErr: unknown;
  for (const model of opts.models) {
    let feedback = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchRetry(
          `${BASE}/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'x-goog-api-key': key(), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: opts.system }] },
              contents: [{ role: 'user', parts: [{ text: opts.prompt + feedback }] }],
              generationConfig: {
                temperature: opts.temperature ?? 0.2,
                responseMimeType: 'application/json',
                responseJsonSchema,
              },
            }),
            timeoutMs: opts.timeoutMs ?? 180_000,
          },
          { retries: 2 },
        );
        const json = await res.json();
        const text: string =
          json.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
        if (!text) throw new Error(`empty response (finishReason=${json.candidates?.[0]?.finishReason})`);
        const parsed = opts.schema.safeParse(JSON.parse(text));
        if (parsed.success) {
          return { data: parsed.data, model, tokens: json.usageMetadata?.totalTokenCount ?? 0 };
        }
        // Feed the validation error back once; the second failure moves to the next model.
        feedback = `\n\nYour previous output failed validation: ${parsed.error.message.slice(0, 800)}\nReturn corrected JSON only.`;
        lastErr = parsed.error;
      } catch (e) {
        lastErr = e;
        // Overloaded / unavailable model: try the next one in the chain.
        if (e instanceof HttpError && [404, 429, 500, 503].includes(e.status)) break;
        if (e instanceof SyntaxError) continue;
        if (!(e instanceof HttpError)) break;
        throw e;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export type TaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY';

/** Embeds texts in batches of 100 (the API maximum per request). */
export async function embed(texts: string[], taskType: TaskType): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 100) {
    const batch = texts.slice(i, i + 100);
    const res = await fetchRetry(`${BASE}/${MODELS.embedding}:batchEmbedContents`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: batch.map((t) => ({
          model: `models/${MODELS.embedding}`,
          content: { parts: [{ text: t }] },
          taskType,
          outputDimensionality: EMBED_DIM,
        })),
      }),
    });
    const json = await res.json();
    for (const e of json.embeddings) out.push(normalize(e.values));
  }
  return out;
}

// Truncated (768-d) Matryoshka embeddings aren't unit length; normalize so cosine
// distance in pgvector behaves as intended.
function normalize(v: number[]) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export const toPgVector = (v: number[]) => `[${v.map((x) => x.toFixed(6)).join(',')}]`;
