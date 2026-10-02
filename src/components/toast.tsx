'use client';
import { useEffect, useState } from 'react';

type Toast = { id: number; text: string; tone: 'info' | 'error' };
let push: ((t: Omit<Toast, 'id'>) => void) | null = null;
let seq = 0;

/** Fire-and-forget notifications callable from anywhere on the client. */
export function toast(text: string, tone: Toast['tone'] = 'info') {
  push?.({ text, tone });
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    push = (t) => {
      const id = ++seq;
      setItems((xs) => [...xs.slice(-2), { ...t, id }]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 3200);
    };
    return () => {
      push = null;
    };
  }, []);
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={`rounded-full px-4 py-2 text-[13px] shadow-lift ${t.tone === 'error' ? 'bg-danger text-paper' : 'bg-ink text-paper'}`}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}
