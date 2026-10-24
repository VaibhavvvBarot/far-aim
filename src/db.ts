// Tiny IndexedDB wrapper: one store for annotations, one key/value store.
export type Color = 'yellow' | 'blue' | 'magenta' | 'green' | 'orange';

export interface Highlight {
  id: string;
  type: 'hl';
  sid: string; // section id
  exact: string;
  prefix: string;
  suffix: string;
  color: Color;
  note?: string;
  tags?: string[];
  created: number;
}
export interface Bookmark {
  id: string;
  type: 'bm';
  sid: string;
  name?: string;
  tags?: string[];
  created: number;
}
export interface SectionNote {
  id: string;
  type: 'note';
  sid: string;
  note: string;
  created: number;
}
export type Annotation = Highlight | Bookmark | SectionNote;

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open('far-aim', 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        const ann = d.createObjectStore('ann', { keyPath: 'id' });
        ann.createIndex('sid', 'sid');
        d.createObjectStore('kv');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbp;
}
function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(store, mode);
        const s = t.objectStore(store);
        const r = fn(s);
        t.oncomplete = () => resolve(r ? (r as IDBRequest<T>).result : (undefined as T));
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error);
      }),
  );
}

export const kv = {
  get: <T>(k: string) => tx<T>('kv', 'readonly', (s) => s.get(k)),
  set: (k: string, v: unknown) => tx('kv', 'readwrite', (s) => s.put(v, k)),
  del: (k: string) => tx('kv', 'readwrite', (s) => s.delete(k)),
};

export const ann = {
  all: () => tx<Annotation[]>('ann', 'readonly', (s) => s.getAll()),
  forSection: (sid: string) => tx<Annotation[]>('ann', 'readonly', (s) => s.index('sid').getAll(sid)),
  put: (a: Annotation) => tx('ann', 'readwrite', (s) => s.put(a)),
  del: (id: string) => tx('ann', 'readwrite', (s) => s.delete(id)),
  clear: () => tx('ann', 'readwrite', (s) => s.clear()),
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Ask the browser to keep our data even when storage is tight
export async function persist() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}
