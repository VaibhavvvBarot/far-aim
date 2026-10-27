// Read aloud with the iPad's built-in voices (works offline with downloaded voices).
import { signal } from '@preact/signals';

export interface Block { el: HTMLElement; text: string }
export const speaking = signal<{ state: 'idle' | 'playing' | 'paused'; index: number; total: number; sid: string; buffering?: boolean }>({ state: 'idle', index: 0, total: 0, sid: '' });
export const speechError = signal<string | null>(null);

const RATE_KEY = 'speech';
interface Prefs { rate: number; voice: string; next: boolean }
export function speechPrefs(): Prefs {
  try { return { rate: 1, voice: '', next: false, ...JSON.parse(localStorage.getItem(RATE_KEY) || '{}') }; } catch { return { rate: 1, voice: '', next: false }; }
}
export function setSpeechPrefs(p: Partial<Prefs>) {
  try { localStorage.setItem(RATE_KEY, JSON.stringify({ ...speechPrefs(), ...p })); } catch { /* ignore */ }
}
export const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Joke voices and the old Eloquence voices that ship with iPadOS sound robotic; never pick them
const ROBOTIC = /^(Albert|Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Fred|Junior|Kathy|Ralph|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
// Natural-sounding voices that are on most iPads (best first)
const GOOD = ['Ava', 'Zoe', 'Evan', 'Nathan', 'Joelle', 'Noelle', 'Allison', 'Susan', 'Tom', 'Samantha', 'Nicky', 'Aaron', 'Daniel', 'Karen', 'Moira', 'Serena', 'Tessa', 'Arthur', 'Martha', 'Catherine', 'Gordon', 'Lee'];

// iPadOS often gives several voices the same name ("Samantha" twice); the quality is in voiceURI,
// e.g. com.apple.voice.enhanced.en-US.Samantha
export function voiceQuality(v: SpeechSynthesisVoice): 'Premium' | 'Enhanced' | '' {
  const k = `${v.name} ${v.voiceURI}`;
  return /premium/i.test(k) ? 'Premium' : /enhanced/i.test(k) ? 'Enhanced' : '';
}
export function voiceLabel(v: SpeechSynthesisVoice) {
  const q = voiceQuality(v);
  const name = v.name.replace(/\s*\((Premium|Enhanced)\)\s*/i, '');
  return `${name}${q ? ` ${q}` : ''} (${v.lang})`;
}

export function voiceScore(v: SpeechSynthesisVoice) {
  if (ROBOTIC.test(v.name)) return -100;
  let s = 0;
  const q = voiceQuality(v);
  if (q === 'Premium') s += 40;
  else if (q === 'Enhanced') s += 25;
  if (/siri/i.test(v.name)) s += 30;
  const g = GOOD.findIndex((n) => v.name.startsWith(n));
  if (g >= 0) s += 20 - g * 0.5;
  if (v.lang === 'en-US') s += 3;
  return s;
}
export const isRobotic = (v: SpeechSynthesisVoice) => voiceScore(v) < 0;

// English voices, best first
export function voices(): SpeechSynthesisVoice[] {
  if (!supported) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en')).sort((a, b) => voiceScore(b) - voiceScore(a));
}
export function bestVoice() { return voices().find((v) => !isRobotic(v)); }
function pickVoice(): SpeechSynthesisVoice | undefined {
  const all = voices();
  const want = speechPrefs().voice;
  return all.find((v) => v.voiceURI === want) || bestVoice() || all[0];
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

function markBlock(i: number) {
  clearMarks();
  const b = blocks[i];
  if (!b) return;
  b.el.classList.add('speaking');
  b.el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  speaking.value = { ...speaking.value, index: i };
}
function finish() {
  clearMarks();
  speaking.value = { state: 'idle', index: 0, total: 0, sid: '' };
  const f = onFinish; onFinish = null; f?.();
}

export function play(sid: string, list: Block[], start = 0, finished?: () => void) {
  if (!list.length) return;
  if (!supported) return;
  stop(false);
  blocks = list;
  onFinish = finished || null;
  const gen = ++generation;
  const voice = pickVoice();
  const { rate } = speechPrefs();
  speaking.value = { state: 'playing', index: start, total: list.length, sid };
  // iPadOS forgets the chosen voice if speech starts again straight after a cancel,
  // so give it a moment before queueing the new utterances.
  setTimeout(() => {
    if (gen !== generation) return;
    for (let i = start; i < list.length; i++) {
      const u = new SpeechSynthesisUtterance(speakable(list[i].text));
      if (voice) { u.voice = voice; u.lang = voice.lang; }
      u.rate = rate;
      u.onstart = () => { if (gen === generation) { markBlock(i); speaking.value = { ...speaking.value, state: 'playing' }; } };
      u.onend = () => { if (gen === generation && i === list.length - 1) finish(); };
      speechSynthesis.speak(u);
    }
  }, 180);
}
export function pause() {
  if (supported) speechSynthesis.pause();
  speaking.value = { ...speaking.value, state: 'paused' };
}
export function resume() {
  if (supported) speechSynthesis.resume();
  speaking.value = { ...speaking.value, state: 'playing' };
}
export function stop(reset = true) {
  generation++;
  if (supported) speechSynthesis.cancel();
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
  if (s.state === 'idle') return;
  play(s.sid, blocks, s.index, onFinish || undefined);
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
