'use client';

// Crash-safe recording buffer. Every MediaRecorder chunk is appended to
// IndexedDB as it arrives (like a write-ahead log), so closing the tab, a
// crash, or a failed upload never loses the meeting: the next visit to
// /record offers to recover and upload it.

const DB = 'afterword-rec';
const STORE = 'chunks';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { autoIncrement: true }).createIndex('session', 'session');
      if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export type SessionMeta = { id: string; title: string; startedAt: number; durationMs: number; mime: string; highlights: { start_ms: number; end_ms: number }[] };

export async function saveMeta(meta: SessionMeta) {
  const db = await open();
  await tx(db, 'sessions', 'readwrite', (s) => s.put(meta));
}

export async function appendChunk(session: string, blob: Blob) {
  const db = await open();
  await tx(db, STORE, 'readwrite', (s) => s.add({ session, blob }));
}

export async function loadSession(id: string): Promise<{ meta: SessionMeta; blob: Blob } | null> {
  const db = await open();
  const meta = await tx<SessionMeta | undefined>(db, 'sessions', 'readonly', (s) => s.get(id));
  if (!meta) return null;
  const rows = await tx<{ session: string; blob: Blob }[]>(db, STORE, 'readonly', (s) => s.index('session').getAll(id));
  return { meta, blob: new Blob(rows.map((r) => r.blob), { type: meta.mime }) };
}

export async function pendingSessions(): Promise<SessionMeta[]> {
  try {
    const db = await open();
    return await tx<SessionMeta[]>(db, 'sessions', 'readonly', (s) => s.getAll());
  } catch {
    return [];
  }
}

export async function clearSession(id: string) {
  const db = await open();
  const keys = await tx<IDBValidKey[]>(db, STORE, 'readonly', (s) => s.index('session').getAllKeys(id));
  await tx(db, STORE, 'readwrite', (s) => { for (const k of keys) s.delete(k); return s.count(); });
  await tx(db, 'sessions', 'readwrite', (s) => s.delete(id));
}

function tx<T>(db: IDBDatabase, store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result as T);
    t.onerror = () => reject(t.error);
  });
}
