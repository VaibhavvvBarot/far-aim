import { signal, effect } from '@preact/signals';
import { kv, ann, type Annotation } from './db';

// ---------- routing (hash based, works offline and on GitHub Pages) ----------
export interface Route { name: string; arg: string; query: URLSearchParams }
function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const [name = '', ...rest] = path.split('/');
  return { name: name || 'home', arg: decodeURIComponent(rest.join('/')), query: new URLSearchParams(qs || '') };
}
export const route = signal<Route>(parse());
window.addEventListener('hashchange', () => { route.value = parse(); });
export const go = (to: string) => { location.hash = to.startsWith('#') ? to : '#/' + to.replace(/^\//, ''); };

// Which list the left pane shows on wide screens
export type Tab = 'home' | 'browse' | 'search' | 'mine' | 'settings' | 'new';
export const tab = signal<Tab>('home');

// ---------- settings ----------
export type Theme = 'auto' | 'light' | 'sepia' | 'dark' | 'night';
export type Font = 'serif' | 'hyper';
export interface Settings { theme: Theme; size: number; font: Font; lineHeight: number }
const DEFAULTS: Settings = { theme: 'auto', size: 18, font: 'serif', lineHeight: 1.6 };
function loadLocal<T>(k: string, d: T): T {
  try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; }
}
export const settings = signal<Settings>(loadLocal('settings', DEFAULTS));
effect(() => {
  const s = settings.value;
  try { localStorage.setItem('settings', JSON.stringify(s)); } catch { /* ignore */ }
  const root = document.documentElement;
  const dark = s.theme === 'auto' ? matchMedia('(prefers-color-scheme: dark)').matches : false;
  root.dataset.theme = s.theme === 'auto' ? (dark ? 'dark' : 'light') : s.theme;
  root.style.setProperty('--read-size', s.size + 'px');
  root.style.setProperty('--read-lh', String(s.lineHeight));
  root.dataset.font = s.font;
  const meta = document.querySelector('meta[name="theme-color"]');
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim();
  if (meta && bg) meta.setAttribute('content', bg);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { settings.value = { ...settings.value }; });

// ---------- annotations ----------
export const annotations = signal<Annotation[]>([]);
export async function refreshAnnotations() { annotations.value = await ann.all(); }
export async function saveAnnotation(a: Annotation) { await ann.put(a); await refreshAnnotations(); }
export async function deleteAnnotation(id: string) { await ann.del(id); await refreshAnnotations(); }

// ---------- reading history ----------
export interface Visit { id: string; num: string; title: string; doc: string; at: number }
export const history = signal<Visit[]>([]);
export const lastRead = signal<{ id: string; y: number } | null>(null);
export async function loadState() {
  history.value = (await kv.get<Visit[]>('history')) || [];
  lastRead.value = (await kv.get<{ id: string; y: number }>('lastRead')) || null;
  await refreshAnnotations();
}
export async function recordVisit(v: Omit<Visit, 'at'>) {
  const list = [{ ...v, at: Date.now() }, ...history.value.filter((h) => h.id !== v.id)].slice(0, 300);
  history.value = list;
  await kv.set('history', list);
}
export async function saveLastRead(id: string, y: number) {
  lastRead.value = { id, y };
  await kv.set('lastRead', { id, y });
}

// ---------- toast ----------
export const toast = signal<{ text: string; action?: { label: string; run: () => void } } | null>(null);
let toastTimer: number | undefined;
export function showToast(text: string, action?: { label: string; run: () => void }, ms = 3500) {
  toast.value = { text, action };
  clearTimeout(toastTimer);
  if (ms) toastTimer = window.setTimeout(() => { toast.value = null; }, ms);
}

// ---------- layout ----------
export const wide = signal(matchMedia('(min-width: 900px)').matches);
matchMedia('(min-width: 900px)').addEventListener('change', (e) => { wide.value = e.matches; });
export const updateReady = signal<null | (() => void)>(null);
