// Read aloud with the iPad's built-in voices (works offline with downloaded voices).
import { signal } from '@preact/signals';

export interface Block { el: HTMLElement; text: string }
export const speaking = signal<{ state: 'idle' | 'playing' | 'paused'; index: number; total: number; sid: string }>({ state: 'idle', index: 0, total: 0, sid: '' });

const RATE_KEY = 'speech';
interface Prefs { rate: number; voice: string; next: boolean }
export function speechPrefs(): Prefs {
  try { return { rate: 1, voice: '', next: false, ...JSON.parse(localStorage.getItem(RATE_KEY) || '{}') }; } catch { return { rate: 1, voice: '', next: false }; }
}
export function setSpeechPrefs(p: Partial<Prefs>) {
  try { localStorage.setItem(RATE_KEY, JSON.stringify({ ...speechPrefs(), ...p })); } catch { /* ignore */ }
}
export const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

export function voices(): SpeechSynthesisVoice[] {
  if (!supported) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en'));
}
function pickVoice(): SpeechSynthesisVoice | undefined {
  const all = voices();
  const want = speechPrefs().voice;
  return all.find((v) => v.voiceURI === want)
    || all.find((v) => /premium|enhanced/i.test(v.name) && v.lang === 'en-US')
    || all.find((v) => v.lang === 'en-US' && v.localService)
    || all[0];
}

// Make regulation text sound right
const SAY: [RegExp, string][] = [
  [/§§/g, 'sections '], [/§/g, 'section '], [/\bCFR\b/g, 'C F R'], [/\bMSL\b/g, 'M S L'], [/\bAGL\b/g, 'A G L'],
  [/\be\.g\.,?/g, 'for example,'], [/\bi\.e\.,?/g, 'that is,'], [/\betc\./g, 'etcetera'], [/—/g, ', '], [/\bft\b/g, 'feet'],
  [/\bnm\b/g, 'nautical miles'], [/\bkts?\b/g, 'knots'], [/\bPIC\b/g, 'pilot in command'],
];
export function speakable(t: string) {
  let s = t.replace(/\s+/g, ' ').trim();
  for (const [re, r] of SAY) s = s.replace(re, r);
  return s;
}

let blocks: Block[] = [];
let onFinish: (() => void) | null = null;
let generation = 0;

function clearMarks() { blocks.forEach((b) => b.el.classList.remove('speaking')); }

export function play(sid: string, list: Block[], start = 0, finished?: () => void) {
  if (!supported || !list.length) return;
  stop(false);
  blocks = list;
  onFinish = finished || null;
  const gen = ++generation;
  const voice = pickVoice();
  const { rate } = speechPrefs();
  speaking.value = { state: 'playing', index: start, total: list.length, sid };
  for (let i = start; i < list.length; i++) {
    const u = new SpeechSynthesisUtterance(speakable(list[i].text));
    if (voice) u.voice = voice;
    u.rate = rate;
    u.onstart = () => {
      if (gen !== generation) return;
      clearMarks();
      list[i].el.classList.add('speaking');
      list[i].el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      speaking.value = { ...speaking.value, index: i, state: 'playing' };
    };
    u.onend = () => {
      if (gen !== generation) return;
      if (i === list.length - 1) {
        clearMarks();
        speaking.value = { state: 'idle', index: 0, total: 0, sid: '' };
        const f = onFinish; onFinish = null; f?.();
      }
    };
    speechSynthesis.speak(u);
  }
}
export function pause() { if (supported) { speechSynthesis.pause(); speaking.value = { ...speaking.value, state: 'paused' }; } }
export function resume() { if (supported) { speechSynthesis.resume(); speaking.value = { ...speaking.value, state: 'playing' }; } }
export function stop(reset = true) {
  if (!supported) return;
  generation++;
  speechSynthesis.cancel();
  clearMarks();
  if (reset) { onFinish = null; speaking.value = { state: 'idle', index: 0, total: 0, sid: '' }; }
}
export function jump(delta: number) {
  const s = speaking.value;
  if (s.state === 'idle') return;
  const i = Math.min(Math.max(0, s.index + delta), blocks.length - 1);
  play(s.sid, blocks, i, onFinish || undefined);
}
export function restartAtRate(rate: number) {
  setSpeechPrefs({ rate });
  const s = speaking.value;
  if (s.state !== 'idle') play(s.sid, blocks, s.index, onFinish || undefined);
}

// Split rendered section text into readable chunks: paragraphs, list items (without their sub-lists), table rows
export function collectBlocks(root: HTMLElement): Block[] {
  const out: Block[] = [];
  const els = root.querySelectorAll<HTMLElement>('p:not(.cite), li, h4, tr, figcaption');
  els.forEach((el) => {
    let text: string;
    if (el.tagName === 'LI') {
      const c = el.cloneNode(true) as HTMLElement;
      c.querySelectorAll('ol, ul, figure, .tbl').forEach((x) => x.remove());
      text = c.textContent || '';
    } else if (el.tagName === 'TR') {
      text = [...el.children].map((c) => c.textContent?.trim()).filter(Boolean).join(', ');
    } else if (el.closest('li') && el.tagName === 'P') {
      return; // already read as part of its list item
    } else text = el.textContent || '';
    if (text.trim().length > 1) out.push({ el, text });
  });
  return out;
}
