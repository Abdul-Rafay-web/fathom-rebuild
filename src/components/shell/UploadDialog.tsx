'use client';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { FileAudio, UploadCloud, X } from 'lucide-react';
import { uploadRecording } from '@/lib/upload-client';
import { Button, cx } from '../ui';
import { toast } from '../toast';

const MAX = 50 * 1024 * 1024;

export function UploadDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [progress, setProgress] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);

  const pick = (f: File | undefined | null) => {
    if (!f) return;
    if (!/^(audio|video)\//.test(f.type)) return setErr('That isn’t an audio or video file.');
    if (f.size > MAX) return setErr(`That file is ${(f.size / 1e6).toFixed(0)} MB. The limit is 50 MB (about an hour of compressed audio).`);
    setErr(null);
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const start = async () => {
    if (!file) return;
    abort.current = new AbortController();
    setProgress(0);
    try {
      const id = await uploadRecording(file, { title, onProgress: setProgress, signal: abort.current.signal });
      toast('Uploaded. Transcribing now.');
      onClose();
      router.push(`/m/${id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed');
      setProgress(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.12 } }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-rail/40 px-4 backdrop-blur-[3px]"
      onMouseDown={() => progress === null && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.12 } }}
        role="dialog"
        aria-label="Upload a recording"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[500px] rounded-2xl border border-rule bg-card p-7 shadow-lift"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 className="text-[26px] leading-tight">Upload a recording</h2>
            <p className="mt-1 text-[13px] text-ink-3">Audio or video up to 50 MB. We’ll transcribe it, work out who said what, and write grounded notes.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-ink-3 hover:text-ink"><X size={18} /></button>
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files[0]); }}
          onClick={() => inputRef.current?.click()}
          className={cx(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition-colors',
            drag ? 'border-accent bg-accent-wash' : 'border-rule-2 hover:border-ink-3 hover:bg-paper',
          )}
        >
          {file ? (
            <>
              <FileAudio size={22} className="text-accent" />
              <p className="text-[14px] text-ink">{file.name}</p>
              <p className="text-[12px] text-ink-3">{(file.size / 1e6).toFixed(1)} MB · click to change</p>
            </>
          ) : (
            <>
              <UploadCloud size={22} className="text-ink-3" />
              <p className="text-[14px] text-ink-2">Drop a file here, or click to choose</p>
              <p className="text-[12px] text-ink-3">mp3, m4a, wav, webm, mp4…</p>
            </>
          )}
          <input ref={inputRef} type="file" accept="audio/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </div>

        <label className="mt-4 block">
          <span className="text-[12px] text-ink-3">Title <span className="text-ink-3/70">(optional, otherwise AI names it)</span></span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly product sync"
            className="mt-1 h-10 w-full rounded-lg border border-rule-2 bg-paper px-3 text-[14px] outline-none focus:border-accent"
          />
        </label>

        {err && <p className="mt-3 text-[13px] text-danger">{err}</p>}

        {progress !== null ? (
          <div className="mt-5">
            <div className="h-1.5 overflow-hidden rounded-full bg-paper-2">
              <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-ink-3">
              <span>{progress < 1 ? 'Uploading…' : 'Starting the pipeline…'}</span>
              <span className="tnum">{Math.round(progress * 100)}%</span>
            </div>
          </div>
        ) : (
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" disabled={!file} onClick={start}>Upload & process</Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
