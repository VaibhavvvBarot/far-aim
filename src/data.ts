import MiniSearch, { type SearchResult } from 'minisearch';
import { kv } from './db';

export interface Section {
  id: string;
  doc: 'far' | 't49' | 'aim' | 'pcg';
  num: string;
  title: string;
  html: string;
  part?: string;
  sub?: string | null;
  ch?: string;
  sec?: string;
  amended?: string;
  changed?: string;
  reserved?: boolean;
  appendix?: boolean;
}
export interface PackMeta { id: string; doc: string; part: string; title: string; file: string; hash: string; count: number }
export interface Manifest {
  version: string;
  builtAt: string;
  checkedAt: string;
  sources: { far: { asOf: string; issued: string; amended: string }; t49: { asOf: string }; aim: { effective: string; change: string } };
  lastChange: string | null;
  newChanges: number;
  packs: PackMeta[];
}
export interface TocSection { id: string; num: string; title: string; sub?: string | null; grp?: string; reserved?: boolean; app?: boolean }
export interface TocPart { doc: string; part: string; title: string; subparts: { id: string; title: string; first: string | null }[]; sections: TocSection[] }
export interface TocAim { ch: string; title: string; sections: { id: string; num: string; title: string; paras: { id: string; num: string; title: string }[] }[] }
export interface Toc { far: TocPart[]; t49: TocPart[]; aim: TocAim[]; pcg: { id: string; title: string }[] }
export interface Change { id: string; doc: string; num: string; title: string; date: string; amended?: string | null; kind: 'added' | 'changed' | 'removed'; ops: [number, string][] }

const BASE = import.meta.env.BASE_URL + 'data/';
let manifestP: Promise<Manifest> | null = null;
let tocP: Promise<Toc> | null = null;
const packs = new Map<string, Promise<Section[]>>();
const sectionIndex = new Map<string, Section>();

export function manifest() {
  if (!manifestP) manifestP = fetch(BASE + 'manifest.json', { cache: 'no-cache' }).then((r) => r.json());
  return manifestP;
}
export function toc() {
  if (!tocP) tocP = manifest().then((m) => fetch(BASE + 'toc.json?v=' + m.version).then((r) => r.json()));
  return tocP;
}
export async function changes(): Promise<Change[]> {
  const m = await manifest();
  return fetch(BASE + 'changes.json?v=' + m.version).then((r) => r.json());
}

export function packFor(id: string): string {
  if (id.startsWith('pcg-')) return 'pcg';
  if (id.startsWith('aim-app')) return 'aim-app';
  if (id.startsWith('aim-')) return 'aim-' + id.split('-')[1];
  if (id.startsWith('49cfr')) return '49-' + id.slice(5).split(/[.-]/)[0];
  return '14-' + id.split(/[.-]/)[0];
}

export async function loadPack(packId: string): Promise<Section[]> {
  let p = packs.get(packId);
  if (!p) {
    p = manifest().then(async (m) => {
      const meta = m.packs.find((x) => x.id === packId);
      if (!meta) return [];
      const j = await fetch(BASE + meta.file + '?v=' + meta.hash).then((r) => r.json());
      for (const s of j.sections as Section[]) sectionIndex.set(s.id, s);
      return j.sections as Section[];
    });
    packs.set(packId, p);
  }
  return p;
}

export async function getSection(id: string): Promise<Section | undefined> {
  if (sectionIndex.has(id)) return sectionIndex.get(id);
  await loadPack(packFor(id));
  return sectionIndex.get(id);
}

export async function neighbors(id: string): Promise<{ prev?: Section; next?: Section }> {
  const list = await loadPack(packFor(id));
  const i = list.findIndex((s) => s.id === id);
  if (i < 0) return {};
  const skip = (j: number, d: number) => { while (list[j] && list[j].reserved) j += d; return list[j]; };
  return { prev: skip(i - 1, -1), next: skip(i + 1, 1) };
}

export const docName = (d: string) => (d === 'far' ? 'FAR' : d === 't49' ? '49 CFR' : d === 'aim' ? 'AIM' : 'Glossary');
export const label = (s: { doc: string; num: string }) =>
  s.doc === 'far' ? (/^\d/.test(s.num) ? `§ ${s.num}` : s.num) : s.doc === 't49' ? `49 CFR ${s.num}` : s.doc === 'pcg' ? 'P/CG' : s.num;

// ---------- text helpers ----------
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', sect: '§', mdash: '—', ndash: '–' };
export function htmlToText(html: string) {
  return html
    .replace(/<p class="cite">.*?<\/p>/gs, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e] ?? m;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- search ----------
// Light stemming so "tires" finds "tire" and "landings" finds "landing"
export function stem(w: string) {
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y';
  if (w.length > 4 && w.endsWith('ing')) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith('ed') && !w.endsWith('eed')) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('es') && /(ch|sh|x|ss)es$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);
  return w;
}
const STOP = new Set(['the', 'of', 'and', 'a', 'an', 'to', 'in', 'or', 'for', 'is', 'be', 'that', 'by', 'on', 'with', 'as', 'at', 'this', 'which', 'any', 'may', 'shall', 'must']);
const processTerm = (t: string) => {
  const w = t.toLowerCase();
  if (STOP.has(w)) return null;
  return stem(w);
};
const tokenize = (s: string) => s.split(/[^\p{L}\p{N}.§-]+|(?<!\d)\.|\.(?!\d)|(?<![\d])-|-(?![\d])/u).filter(Boolean);

const searchOpts = {
  fields: ['num', 'title', 'text'],
  storeFields: ['doc', 'num', 'title'],
  processTerm,
  tokenize,
  searchOptions: {
    boost: { num: 8, title: 3 },
    // Partial-word matching only for the word being typed, and only from 3 letters,
    // so "class b speed" doesn't match every word that starts with "b".
    prefix: (t: string, i: number, all: string[]) => i === all.length - 1 && t.length >= 3,
    fuzzy: (t: string) => (t.length > 4 ? 0.2 : false),
    combineWith: 'AND' as const,
    boostDocument: (_id: unknown, _t: string, stored?: Record<string, unknown>) => (stored?.doc === 'pcg' ? 0.75 : 1),
  },
};

// Pilot shorthand -> the words the regulations actually use
const SYN: Record<string, string[]> = {
  currency: ['recent experience', 'currency'],
  current: ['recent experience', 'current'],
  bfr: ['flight review'],
  pic: ['pilot in command'],
  sic: ['second in command'],
  elt: ['emergency locator transmitter'],
  tfr: ['temporary flight restriction'],
  mel: ['minimum equipment list'],
  adsb: ['ADS-B'],
  'ads-b': ['ADS-B', 'automatic dependent surveillance'],
  mins: ['minimums'],
  wx: ['weather'],
  vis: ['visibility'],
  xc: ['cross-country'],
  medical: ['medical certificate', 'medical'],
  sport: ['sport pilot', 'sport'],
  ifr: ['IFR', 'instrument flight rules'],
  vfr: ['VFR', 'visual flight rules'],
  inop: ['inoperative'],
};
function expand(q: string) {
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.some((w) => SYN[w.toLowerCase()])) return q;
  return {
    combineWith: 'AND' as const,
    queries: words.map((w) => {
      const alts = SYN[w.toLowerCase()];
      if (!alts) return w;
      return { combineWith: 'OR' as const, queries: [w, ...alts.map((a) => ({ combineWith: 'AND' as const, queries: [a], prefix: false }))] };
    }),
  };
}

let msP: Promise<MiniSearch> | null = null;
export const texts = new Map<string, string>();
export let indexReady = false;
type Progress = (done: number, total: number) => void;

export function searchIndex(onProgress?: Progress): Promise<MiniSearch> {
  if (msP) return msP;
  msP = (async () => {
    const m = await manifest();
    const all: Section[] = [];
    let done = 0;
    await Promise.all(
      m.packs.map(async (p) => {
        const secs = await loadPack(p.id);
        all.push(...secs);
        onProgress?.(++done, m.packs.length);
      }),
    );
    for (const s of all) texts.set(s.id, htmlToText(s.html));
    const cacheKey = 'idx:' + m.version;
    let ms: MiniSearch | null = null;
    try {
      const cached = await kv.get<string>(cacheKey);
      if (cached) ms = MiniSearch.loadJSON(cached, searchOpts);
    } catch { ms = null; }
    if (!ms) {
      ms = new MiniSearch(searchOpts);
      await ms.addAllAsync(all.map((s) => ({ id: s.id, doc: s.doc, num: s.num, title: s.title, text: texts.get(s.id) })), { chunkSize: 200 });
      try {
        // drop old caches, store the new one
        await kv.set(cacheKey, JSON.stringify(ms));
        const old = await kv.get<string>('idx:key');
        if (old && old !== cacheKey) await kv.del(old);
        await kv.set('idx:key', cacheKey);
      } catch { /* storage full: fine, rebuild next time */ }
    }
    indexReady = true;
    return ms;
  })();
  return msP;
}

export interface Hit { id: string; doc: string; num: string; title: string; score: number; snippet: string }
export type DocFilter = 'all' | 'far' | 'aim' | 'pcg';

// Jump targets: "91.155", "§61.57(c)", "aim 3-2-4", "3-2-4", "part 91", "p91"
export function parseJump(q: string): { kind: 'section' | 'part' | 'aim'; id: string } | null {
  const s = q.trim().toLowerCase().replace(/^§+\s*/, '').replace(/^(far|14\s*cfr)\s*/, '');
  let m = s.match(/^(\d{1,3})\.(\d{1,4}[a-z]?)(\([a-z0-9]+\))*$/i);
  if (m) return { kind: 'section', id: `${m[1]}.${m[2]}` };
  m = s.match(/^(?:aim\s*)?(\d{1,2})-(\d{1,2})-(\d{1,3})$/);
  if (m) return { kind: 'aim', id: `aim-${+m[1]}-${+m[2]}-${+m[3]}` };
  m = s.match(/^(?:part|pt\.?|p)\s*(\d{1,3})$/);
  if (m) return { kind: 'part', id: m[1] };
  m = s.match(/^49\s*cfr\s*(\d{3})\.(\d+)$/);
  if (m) return { kind: 'section', id: `49cfr${m[1]}.${m[2]}` };
  return null;
}

function snippet(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  let at = -1;
  for (const t of terms) {
    const i = lower.indexOf(t.toLowerCase());
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  const start = Math.max(0, at - 70);
  const raw = (start > 0 ? '…' : '') + text.slice(start, start + 220) + (text.length > start + 220 ? '…' : '');
  const escd = raw.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const uniq = [...new Set(terms.filter((t) => t.length > 1))].sort((a, b) => b.length - a.length);
  if (!uniq.length) return escd;
  const re = new RegExp('(' + uniq.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')[\\p{L}]*', 'giu');
  return escd.replace(re, '<mark>$&</mark>');
}

// Query syntax: "exact phrase", OR, -exclude
export async function search(q: string, filter: DocFilter, titlesOnly: boolean): Promise<Hit[]> {
  const ms = await searchIndex();
  const phrases = [...q.matchAll(/"([^"]+)"/g)].map((m) => m[1].toLowerCase());
  const rest = q.replace(/"[^"]+"/g, ' ');
  const excludes = [...rest.matchAll(/(?:^|\s)-(\S+)/g)].map((m) => m[1].toLowerCase());
  const words = rest.replace(/(?:^|\s)-\S+/g, ' ').trim();
  const useOr = /\sOR\s/.test(words);
  const query = [words.replace(/\sOR\s/g, ' '), ...phrases].join(' ').trim();
  if (!query) return [];
  const docOk = (d: string) => filter === 'all' || d === filter || (filter === 'far' && d === 't49');
  let res: SearchResult[] = ms.search(useOr ? query : (expand(query) as any), {
    fields: titlesOnly ? ['num', 'title'] : ['num', 'title', 'text'],
    combineWith: useOr ? 'OR' : 'AND',
    filter: (r) => docOk(r.doc),
  });
  // Fall back to OR when an AND search finds nothing
  if (!res.length && !useOr) res = ms.search(query, { fields: titlesOnly ? ['num', 'title'] : ['num', 'title', 'text'], combineWith: 'OR', filter: (r) => docOk(r.doc) });
  const hits: Hit[] = [];
  for (const r of res) {
    const text = texts.get(r.id) || '';
    const hay = (r.title + ' ' + text).toLowerCase();
    if (phrases.some((p) => !hay.includes(p))) continue;
    if (excludes.some((e) => hay.includes(e))) continue;
    const matched = [...Object.keys(r.match), ...phrases];
    // map stemmed index terms back to words in the text for highlighting
    hits.push({ id: r.id, doc: r.doc, num: r.num, title: r.title, score: r.score, snippet: snippet(text, matched) });
    if (hits.length >= 200) break;
  }
  return hits;
}

export function suggest(q: string): Promise<string[]> {
  return searchIndex().then((ms) => ms.autoSuggest(q, { fuzzy: 0.2, prefix: true }).slice(0, 5).map((s) => s.suggestion));
}
