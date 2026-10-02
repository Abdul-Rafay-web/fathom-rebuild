'use client';
import { useSyncExternalStore, type ReactNode } from 'react';

/** "Good morning" in the reader's own timezone. The server renders a neutral fallback. */
export function Greeting({ name }: { name?: string }) {
  const part = useSyncExternalStore(
    () => () => {},
    () => {
      const h = new Date().getHours();
      return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    },
    () => 'Welcome back',
  );
  return <>{part}{name ? `, ${name}` : ''}</>;
}

export const OPEN_UPLOAD = 'aw:open-upload';

/** Anything can ask the app shell to open the upload dialog. */
export function OpenUpload({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_UPLOAD))}>
      {children}
    </button>
  );
}
