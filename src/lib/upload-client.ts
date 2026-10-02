'use client';

export type UploadOpts = {
  title?: string;
  source?: 'upload' | 'live';
  highlights?: { start_ms: number; end_ms: number }[];
  duration_ms?: number;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

/**
 * Three-step upload:
 *  1. ask our API for a meeting + one-time signed storage URL (idempotent key)
 *  2. PUT the bytes straight to storage (XHR, for progress events)
 *  3. tell our API it's done → pipeline starts
 */
export async function uploadRecording(file: Blob & { name?: string }, opts: UploadOpts = {}) {
  const idempotencyKey = crypto.randomUUID();
  const init = await fetch('/api/uploads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filename: file.name ?? 'recording.webm',
      mime: file.type || 'audio/webm',
      size: file.size,
      title: opts.title,
      source: opts.source ?? 'upload',
      idempotencyKey,
    }),
  });
  const meta = await init.json();
  if (!init.ok) throw new Error(meta.error ?? 'Could not start upload');

  if (!meta.alreadyUploaded) {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', meta.signedUrl);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
      xhr.setRequestHeader('x-upsert', 'true');
      xhr.upload.onprogress = (e) => e.lengthComputable && opts.onProgress?.(e.loaded / e.total);
      xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(`Storage rejected the upload (${xhr.status})`)));
      xhr.onerror = () => reject(new Error('Network error during upload'));
      opts.signal?.addEventListener('abort', () => xhr.abort());
      xhr.send(file);
    });
  }

  const done = await fetch(`/api/uploads/${meta.meetingId}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ highlights: opts.highlights ?? [], duration_ms: opts.duration_ms }),
  });
  if (!done.ok) throw new Error((await done.json()).error ?? 'Upload could not be finalized');
  return meta.meetingId as string;
}
