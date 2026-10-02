'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, CheckSquare, Mic, RotateCcw, Square } from 'lucide-react';
import fixWebmDuration from 'fix-webm-duration';
import { clock } from '@/lib/format';
import { uploadRecording } from '@/lib/upload-client';
import { appendChunk, clearSession, loadSession, pendingSessions, saveMeta, type SessionMeta } from '@/lib/recorder-store';
import { Button, cx, Kbd } from './ui';
import { toast } from './toast';

type Phase = 'idle' | 'starting' | 'recording' | 'saving' | 'error';
// A paragraph of finalized caption text, plus the live (interim) tail being spoken now.
type Para = { text: string; at: number; speaker?: number; last: number };
type LiveItem = { text: string; owner: string; due: string; at: number };

const MAX_BUFFERED = 256 * 1024; // backpressure threshold on the socket
const INSIGHT_EVERY_MS = 45_000;

/**
 * Live recording. One MediaRecorder (Opus/WebM, 250 ms slices) feeds two sinks:
 *  - Deepgram's streaming socket for live captions (short-lived token; the API
 *    key never reaches the browser), with backpressure: if the socket's send
 *    buffer grows past a threshold, slices queue, then drop oldest-first,
 *    rather than freezing the tab;
 *  - IndexedDB, chunk by chunk, so nothing is lost if the tab dies.
 * Elapsed time uses performance.now() (monotonic): wall-clock jumps from NTP
 * or sleep can't skew highlight timestamps.
 */
export function Recorder() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('idle');
  const [title, setTitle] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [paras, setParas] = useState<Para[]>([]);
  const [interim, setInterim] = useState('');
  const [captions, setCaptions] = useState<'connecting' | 'live' | 'off'>('connecting');
  const [items, setItems] = useState<LiveItem[]>([]);
  const [marks, setMarks] = useState<{ start_ms: number; end_ms: number }[]>([]);
  const [progress, setProgress] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<SessionMeta[]>([]);
  const [level, setLevel] = useState<number[]>(() => Array(48).fill(0));

  const rec = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const queue = useRef<Blob[]>([]);
  const t0 = useRef(0);
  const session = useRef<SessionMeta | null>(null);
  const chunks = useRef<Blob[]>([]);
  const raf = useRef(0);
  const finals = useRef<{ text: string; at: number }[]>([]);
  const lastInsight = useRef(0);
  const known = useRef<string[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => { pendingSessions().then(setPending); }, []);
  useEffect(() => { scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' }); }, [paras, interim]);

  const now = () => performance.now() - t0.current;

  const headerSent = useRef(false);
  const flush = () => {
    const s = ws.current;
    if (s && s.readyState === WebSocket.OPEN) {
      while (queue.current.length && s.bufferedAmount < MAX_BUFFERED) { s.send(queue.current.shift()!); headerSent.current = true; }
    }
    // Under sustained backpressure drop the oldest slices, but never the very
    // first one: it carries the WebM header the decoder needs.
    if (queue.current.length > 40) queue.current.splice(headerSent.current ? 0 : 1, queue.current.length - 40);
  };

  const connectCaptions = async (mime: string) => {
    try {
      const r = await fetch('/api/live/token', { method: 'POST' });
      const j = await r.json();
      if (!r.ok || j.unavailable || !j.token) { setCaptions('off'); return; }
      const params = new URLSearchParams({ model: 'nova-3', smart_format: 'true', interim_results: 'true', diarize: 'true', utterance_end_ms: '1200' });
      if (!mime.includes('webm') && !mime.includes('ogg')) { setCaptions('off'); return; }
      const sock = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, ['bearer', j.token]);
      sock.onopen = () => { setCaptions('live'); flush(); };
      sock.onclose = () => setCaptions((c) => (c === 'live' ? 'off' : c));
      sock.onerror = () => setCaptions('off');
      sock.onmessage = (ev) => {
        const m = JSON.parse(ev.data);
        if (m.type !== 'Results') return;
        const alt = m.channel?.alternatives?.[0];
        const text: string = alt?.transcript ?? '';
        if (!text) return;
        const speaker: number | undefined = alt.words?.[0]?.speaker;
        if (!m.is_final) { setInterim(text); return; }
        // Final text joins the current paragraph unless the speaker changed or
        // there was a real pause (>2 s): captions read as prose, not fragments.
        const t = now();
        setInterim('');
        setParas((ps) => {
          const last = ps[ps.length - 1];
          if (last && last.speaker === speaker && t - last.last < 2_000) {
            return [...ps.slice(0, -1), { ...last, text: `${last.text} ${text}`, last: t }];
          }
          return [...ps, { text, at: t, speaker, last: t }];
        });
        finals.current.push({ text, at: t });
        maybeInsights();
      };
      ws.current = sock;
    } catch {
      setCaptions('off');
    }
  };

  const maybeInsights = async () => {
    const t = now();
    if (t - lastInsight.current < INSIGHT_EVERY_MS) return;
    lastInsight.current = t;
    const window = finals.current.filter((f) => f.at > t - 90_000).map((f) => f.text).join(' ');
    if (window.length < 120) return;
    try {
      const r = await fetch('/api/live/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ window, known: known.current }) });
      const j = await r.json();
      for (const it of j.items ?? []) {
        known.current.push(it.text);
        setItems((xs) => [...xs, { ...it, at: t }]);
      }
    } catch { /* best-effort */ }
  };

  const meter = (analyser: AnalyserNode) => {
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += ((v - 128) / 128) ** 2;
      const rms = Math.min(1, Math.sqrt(sum / buf.length) * 4);
      setLevel((l) => [...l.slice(1), rms]);
      setElapsed(now());
      raf.current = requestAnimationFrame(tick);
    };
    tick();
  };

  const audioCtx = useRef<AudioContext | null>(null);
  const start = async () => {
    setErr(null);
    setPhase('starting');
    // Browsers only let an AudioContext run if it's created during the click.
    // Creating it after awaiting mic permission left it suspended: a flat meter.
    const ctx = new AudioContext();
    audioCtx.current = ctx;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const r = new MediaRecorder(s, { mimeType: mime || undefined, audioBitsPerSecond: 32_000 });
      rec.current = r;
      t0.current = performance.now();
      const meta: SessionMeta = { id: crypto.randomUUID(), title, startedAt: Date.now(), durationMs: 0, mime: r.mimeType || 'audio/webm', highlights: [] };
      session.current = meta;
      await saveMeta(meta);
      chunks.current = [];
      headerSent.current = false;
      queue.current = [];
      r.ondataavailable = (e) => {
        if (!e.data.size) return;
        chunks.current.push(e.data);
        appendChunk(meta.id, e.data).catch(() => {});
        queue.current.push(e.data);
        flush();
      };
      r.start(250);
      if (ctx.state !== 'running') await ctx.resume().catch(() => {});
      const an = ctx.createAnalyser();
      an.fftSize = 1024;
      ctx.createMediaStreamSource(s).connect(an);
      meter(an);
      connectCaptions(meta.mime);
      setPhase('recording');
    } catch (e) {
      ctx.close().catch(() => {});
      setPhase('error');
      setErr(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Microphone access was blocked. Allow it in the address bar and try again.' : 'Couldn’t start the microphone.');
    }
  };

  const mark = useCallback(() => {
    if (phase !== 'recording') return;
    const t = Math.round(performance.now() - t0.current);
    const m = { start_ms: Math.max(0, t - 12_000), end_ms: t };
    setMarks((xs) => [...xs, m]);
    if (session.current) { session.current.highlights.push(m); saveMeta(session.current).catch(() => {}); }
    toast(`Highlighted ${clock(m.start_ms)}–${clock(m.end_ms)}`);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key.toLowerCase() === 'h') mark();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mark]);

  const upload = async (blob: Blob, meta: SessionMeta) => {
    setPhase('saving');
    const file = new File([blob], 'recording.webm', { type: meta.mime.split(';')[0] });
    const id = await uploadRecording(file, {
      title: meta.title || undefined, source: 'live', highlights: meta.highlights, duration_ms: Math.round(meta.durationMs), onProgress: setProgress,
    });
    await clearSession(meta.id).catch(() => {});
    router.push(`/m/${id}`);
  };

  const stop = async () => {
    const r = rec.current;
    const meta = session.current;
    if (!r || !meta) return;
    cancelAnimationFrame(raf.current);
    audioCtx.current?.close().catch(() => {});
    const duration = now();
    await new Promise<void>((res) => { r.onstop = () => res(); r.stop(); });
    stream.current?.getTracks().forEach((t) => t.stop());
    try { ws.current?.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
    ws.current?.close();
    meta.durationMs = duration;
    meta.title = title;
    await saveMeta(meta).catch(() => {});
    let blob = new Blob(chunks.current, { type: meta.mime });
    // MediaRecorder WebM has no duration header, which breaks seeking; patch it in.
    if (meta.mime.includes('webm')) blob = await fixWebmDuration(blob, duration, { logger: false });
    try {
      await upload(blob, meta);
    } catch (e) {
      setPhase('error');
      setErr(`${e instanceof Error ? e.message : 'Upload failed'}. Your recording is saved in this browser; you can retry below.`);
      pendingSessions().then(setPending);
    }
  };

  const recover = async (id: string) => {
    const s = await loadSession(id);
    if (!s || !s.blob.size) { await clearSession(id); setPending((p) => p.filter((x) => x.id !== id)); return toast('That recording was empty'); }
    let blob = s.blob;
    if (s.meta.mime.includes('webm') && s.meta.durationMs) blob = await fixWebmDuration(blob, s.meta.durationMs, { logger: false });
    try { await upload(blob, s.meta); } catch (e) { setPhase('error'); setErr(e instanceof Error ? e.message : 'Upload failed'); }
  };

  const recording = phase === 'recording';

  return (
    <div className="mx-auto flex max-w-[980px] flex-col px-5 pt-10 pb-20 sm:px-8 lg:pt-14">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[46px] leading-[1.02] sm:text-[56px]">{recording ? 'Recording' : 'Record a meeting'}</h1>
          <p className="mt-3 max-w-[60ch] text-[13.5px] text-ink-3">
            Records from this browser’s microphone: put the call on speaker, or use it in the room. Let everyone know they’re being recorded.
          </p>
        </div>
        {!recording && phase !== 'saving' && (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            className="h-10 w-full rounded-lg border border-rule bg-card px-3 text-[14px] outline-none focus:border-accent sm:w-[260px]"
          />
        )}
      </div>

      {pending.length > 0 && phase === 'idle' && (
        <div className="mb-6 rounded-xl border border-mark/60 bg-mark-wash/40 px-4 py-3 text-[13.5px]">
          <p className="text-ink">An earlier recording wasn’t uploaded. It’s safe in this browser.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {pending.map((p) => (
              <Button key={p.id} size="sm" variant="outline" onClick={() => recover(p.id)}>
                <RotateCcw size={12} /> Upload {p.title || new Date(p.startedAt).toLocaleString()} ({clock(p.durationMs)})
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <section className="flex min-h-[420px] flex-col overflow-hidden rounded-2xl border border-rule bg-card">
          <div className="flex items-center gap-4 border-b border-rule px-5 py-4">
            {recording ? (
              <button onClick={stop} className="flex h-12 w-12 items-center justify-center rounded-full bg-danger text-paper transition-transform hover:scale-105" aria-label="Stop and process">
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button
                onClick={start}
                disabled={phase === 'starting' || phase === 'saving'}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-paper transition-transform hover:scale-105 disabled:opacity-50"
                aria-label="Start recording"
              >
                <Mic size={18} />
              </button>
            )}
            <div className="font-mono text-[22px] text-ink tnum">{clock(elapsed)}</div>
            <div className="flex h-8 flex-1 items-center gap-[2px]" aria-hidden>
              {level.map((v, i) => (
                <span key={i} className={cx('w-[3px] flex-1 rounded-full', recording ? 'bg-accent' : 'bg-rule-2')} style={{ height: `${Math.max(8, v * 100)}%`, opacity: 0.35 + v * 0.65 }} />
              ))}
            </div>
            {recording && (
              <Button size="sm" variant="outline" onClick={mark}><Bookmark size={13} /> Highlight <Kbd>H</Kbd></Button>
            )}
          </div>

          <div ref={scroller} className="flex-1 overflow-y-auto px-6 py-5">
            {phase === 'idle' && <p className="pt-16 text-center font-serif text-[18px] text-ink-3">Press the button and start talking. Words appear here as you speak.</p>}
            {phase === 'starting' && <p className="pt-16 text-center text-[14px] text-ink-3">Waiting for microphone permission…</p>}
            {recording && captions === 'off' && paras.length === 0 && (
              <p className="pt-16 text-center text-[13.5px] text-ink-3">
                <span className="pulse-dot mr-2 inline-block h-2 w-2 rounded-full bg-danger align-middle" />
                Recording. Live captions are unavailable right now; the full transcript and notes are ready a minute after you stop.
              </p>
            )}
            {recording && captions === 'connecting' && paras.length === 0 && <p className="pt-16 text-center text-[13.5px] text-ink-3">Connecting live captions…</p>}
            <div className="space-y-4">
              {paras.map((p, i) => (
                <p key={i} className="font-serif text-[17px] leading-relaxed text-ink">
                  <span className="mr-2.5 font-mono text-[11px] text-ink-3">{clock(p.at)}</span>
                  {p.text}
                  {i === paras.length - 1 && interim && <span className="text-ink-3"> {interim}</span>}
                </p>
              ))}
              {interim && paras.length === 0 && <p className="font-serif text-[17px] leading-relaxed text-ink-3">{interim}</p>}
            </div>
            {phase === 'saving' && (
              <div className="mx-auto mt-16 max-w-[360px] text-center">
                <p className="font-display text-[20px]">Saving your recording</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-paper-2"><div className="h-full bg-accent transition-[width]" style={{ width: `${progress * 100}%` }} /></div>
                <p className="mt-2 text-[12.5px] text-ink-3">Then it’s straight into transcription.</p>
              </div>
            )}
            {err && <p className="mt-6 text-center text-[13.5px] text-danger">{err}</p>}
          </div>
          {recording && (
            <div className="flex items-center gap-2 border-t border-rule px-5 py-2.5 text-[12px] text-ink-3">
              <span className={cx('h-1.5 w-1.5 rounded-full', captions === 'live' ? 'pulse-dot bg-ok' : 'bg-ink-3')} />
              {captions === 'live' ? 'Live captions on' : captions === 'connecting' ? 'Connecting captions' : 'Captions off: recording continues'}
              <span className="ml-auto">Saved continuously in this browser</span>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <div className="rounded-2xl border border-rule bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] tracking-[0.14em] text-ink-3 uppercase"><CheckSquare size={13} /> Action items, live</h2>
            {items.length === 0 ? (
              <p className="text-[13px] text-ink-3">Commitments show up here as they’re made, checked every ~45 seconds.</p>
            ) : (
              <ul className="space-y-2.5">
                {items.map((it, i) => (
                  <li key={i} className="text-[13.5px] leading-snug">
                    <span className="text-ink">{it.text}</span>
                    <span className="mt-0.5 block text-[12px] text-ink-3">{[it.owner, it.due && `due ${it.due}`, clock(it.at)].filter(Boolean).join(' · ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-2xl border border-rule bg-card p-5">
            <h2 className="mb-3 flex items-center gap-2 text-[11px] tracking-[0.14em] text-ink-3 uppercase"><Bookmark size={13} /> Highlights</h2>
            {marks.length === 0 ? (
              <p className="text-[13px] text-ink-3">Press <Kbd>H</Kbd> to mark the last 12 seconds. Marks land on the timeline afterwards.</p>
            ) : (
              <ul className="space-y-1 font-mono text-[12px] text-ink-2">{marks.map((m, i) => <li key={i}>{clock(m.start_ms)}–{clock(m.end_ms)}</li>)}</ul>
            )}
          </div>
          <p className="px-1 text-[12px] leading-relaxed text-ink-3">
            Why not a bot that joins Zoom? This build records in the browser instead, and the post-call pipeline is identical either way. See the README for the trade-off.
          </p>
        </aside>
      </div>
    </div>
  );
}
