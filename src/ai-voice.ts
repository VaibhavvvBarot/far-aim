// Natural AI voice (Kokoro, runs on the iPad, works offline once downloaded).
// Same controls as the system voice: play from a block, pause, resume, jump, stop.
import { signal } from '@preact/signals';
import type { Block } from './speech';

export const AI_VOICES = [
  { id: 'af_heart', name: 'Heart', desc: 'American, warm' },
  { id: 'af_bella', name: 'Bella', desc: 'American, bright' },
  { id: 'am_michael', name: 'Michael', desc: 'American, male' },
  { id: 'am_fenrir', name: 'Fenrir', desc: 'American, deep male' },
  { id: 'bf_emma', name: 'Emma', desc: 'British' },
  { id: 'bm_george', name: 'George', desc: 'British, male' },
];
export type AiMode = 'cpu' | 'gpu';

interface AiPrefs { voice: string; mode: AiMode; installed: boolean }
const KEY = 'aivoice';
export function aiPrefs(): AiPrefs {
  try { return { voice: 'af_heart', mode: 'cpu', installed: false, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { voice: 'af_heart', mode: 'cpu', installed: false }; }
}
export function setAiPrefs(p: Partial<AiPrefs>) {
  try { localStorage.setItem(KEY, JSON.stringify({ ...aiPrefs(), ...p })); } catch { /* ignore */ }
}
export const gpuAvailable = typeof navigator !== 'undefined' && 'gpu' in navigator;
export const DOWNLOAD_MB: Record<AiMode, number> = { cpu: 92, gpu: 330 };

// ---------- model loading ----------
export const aiStatus = signal<{ state: 'idle' | 'loading' | 'ready' | 'error'; pct: number; error?: string; rtf?: number }>({ state: 'idle', pct: 0 });
let worker: Worker | null = null;
let loadP: Promise<void> | null = null;
let nextId = 1;
const waiting = new Map<number, { resolve: (b: Blob) => void; reject: (e: Error) => void; started: number }>();
const files = new Map<string, { loaded: number; total: number }>();

function makeWorker() {
  const w = new Worker(new URL('./tts-worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      files.set(m.file, { loaded: m.loaded, total: m.total || m.loaded });
      let l = 0, t = 0;
      files.forEach((f) => { l += f.loaded; t += f.total; });
      aiStatus.value = { ...aiStatus.value, state: 'loading', pct: t ? Math.min(99, Math.round((l / t) * 100)) : 0 };
    } else if (m.type === 'audio') {
      const p = waiting.get(m.id);
      waiting.delete(m.id);
      if (p) {
        const rtf = m.ms / 1000 / Math.max(0.5, m.dur);
        aiStatus.value = { ...aiStatus.value, rtf: aiStatus.value.rtf ? aiStatus.value.rtf * 0.7 + rtf * 0.3 : rtf };
        p.resolve(new Blob([m.wav], { type: 'audio/wav' }));
      }
    } else if (m.type === 'genError') {
      const p = waiting.get(m.id);
      waiting.delete(m.id);
      p?.reject(new Error(m.error));
    }
  };
  return w;
}

export function loadAi(mode: AiMode = aiPrefs().mode): Promise<void> {
  if (loadP) return loadP;
  aiStatus.value = { state: 'loading', pct: 0 };
  files.clear();
  worker = makeWorker();
  const w = worker;
  loadP = new Promise<void>((resolve, reject) => {
    const on = (e: MessageEvent) => {
      if (e.data.type === 'ready') {
        w.removeEventListener('message', on);
        setAiPrefs({ installed: true, mode });
        aiStatus.value = { state: 'ready', pct: 100 };
        resolve();
        // keep every voice available offline (about 0.5 MB each)
        caches.open('kokoro-voices').then((c) => Promise.all(AI_VOICES.map(async (v) => {
          const url = `https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/resolve/main/voices/${v.id}.bin`;
          if (!(await c.match(url))) await c.add(url).catch(() => {});
        }))).catch(() => {});
      } else if (e.data.type === 'error') {
        w.removeEventListener('message', on);
        // The GPU path can fail on some devices: fall back to the CPU version once
        if (mode === 'gpu') { w.terminate(); worker = null; loadP = null; loadAi('cpu').then(resolve, reject); return; }
        aiStatus.value = { state: 'error', pct: 0, error: e.data.error };
        loadP = null;
        reject(new Error(e.data.error));
      }
    };
    w.addEventListener('message', on);
  });
  w.postMessage({
    type: 'load',
    device: mode === 'gpu' ? 'webgpu' : 'wasm',
    dtype: mode === 'gpu' ? 'fp32' : 'q8',
    wasmPaths: new URL(import.meta.env.BASE_URL + 'ort/', location.href).href,
    voice: aiPrefs().voice,
  });
  return loadP;
}
export function unloadAi() { worker?.terminate(); worker = null; loadP = null; aiStatus.value = { state: 'idle', pct: 0 }; }

export async function removeAiVoice() {
  unloadAi();
  try { await caches.delete('transformers-cache'); await caches.delete('ort'); await caches.delete('kokoro-voices'); } catch { /* ignore */ }
  setAiPrefs({ installed: false });
}

function synth(text: string): Promise<Blob> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject, started: Date.now() });
    worker!.postMessage({ type: 'gen', id, text, voice: aiPrefs().voice });
  });
}

// ---------- text chunking ----------
// Short chunks start sooner; split paragraphs at sentence ends, and very long sentences at ; or ,
export interface Chunk { block: number; text: string }
export function chunk(blocks: { text: string }[], from = 0): Chunk[] {
  const out: Chunk[] = [];
  blocks.forEach((b, i) => {
    if (i < from) return;
    const sentences = b.text.replace(/\s+/g, ' ').trim().match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)\s*/g) || [b.text];
    let buf = '';
    for (const s of sentences) {
      const pieces = s.length > 260 ? s.split(/(?<=[;:,])\s+/) : [s];
      for (const p of pieces) {
        const limit = out.length === 0 ? 120 : 240; // keep the very first chunk short so audio starts fast
        if (buf && (buf + ' ' + p).length > limit) { out.push({ block: i, text: buf.trim() }); buf = ''; }
        buf += (buf ? ' ' : '') + p;
      }
    }
    if (buf.trim()) out.push({ block: i, text: buf.trim() });
  });
  return out;
}

// ---------- playback ----------
// One audio element for the whole session: once it has played after a tap, iPadOS lets it keep playing
const audio: HTMLAudioElement = typeof Audio !== 'undefined' ? new Audio() : ({} as HTMLAudioElement);
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';
export function unlockAudio() { try { audio.src = SILENT; audio.play().catch(() => {}); } catch { /* ignore */ } }

let session = 0;
export interface AiCallbacks { onBlock: (i: number) => void; onBuffering: (b: boolean) => void; onEnd: () => void; onError: (e: string) => void }

export async function aiPlay(blocks: Block[], from: number, rate: number, cb: AiCallbacks) {
  const my = ++session;
  audio.pause();
  cancelPending();
  await loadAi();
  if (my !== session) return;
  const chunks = chunk(blocks, from);
  const ahead = 3;
  const pending: Promise<Blob>[] = [];
  const request = (k: number) => { if (k < chunks.length && !pending[k]) { pending[k] = synth(speakableAi(chunks[k].text)); pending[k].catch(() => {}); } };
  for (let k = 0; k < ahead; k++) request(k);
  for (let k = 0; k < chunks.length; k++) {
    if (my !== session) return;
    cb.onBuffering(true);
    let blob: Blob;
    try { blob = await pending[k]; } catch (e) { if (my === session) cb.onError(String(e)); return; }
    if (my !== session) return;
    cb.onBuffering(false);
    request(k + ahead);
    if (k === 0 || chunks[k].block !== chunks[k - 1].block) cb.onBlock(chunks[k].block);
    const url = URL.createObjectURL(blob);
    audio.src = url;
    audio.playbackRate = rate;
    (audio as any).preservesPitch = true;
    try { await audio.play(); } catch (e) { URL.revokeObjectURL(url); if (my === session) cb.onError('Playback was blocked. Tap play again.'); return; }
    await new Promise<void>((res) => {
      const done = () => { audio.removeEventListener('ended', done); audio.removeEventListener('emptied', stopped); res(); };
      const stopped = () => { if (my !== session) done(); };
      audio.addEventListener('ended', done);
      audio.addEventListener('emptied', stopped);
      const poll = setInterval(() => { if (my !== session) { clearInterval(poll); done(); } }, 200);
      audio.addEventListener('ended', () => clearInterval(poll), { once: true });
    });
    URL.revokeObjectURL(url);
  }
  if (my === session) cb.onEnd();
}
export function aiPause() { audio.pause(); }
export function aiResume() { audio.play().catch(() => {}); }
export function aiStop() { session++; audio.pause(); cancelPending(); }
function cancelPending() {
  if (worker) worker.postMessage({ type: 'cancel', below: nextId });
  waiting.forEach((p) => p.reject(new Error('cancelled')));
  waiting.clear();
}
export function aiSetRate(r: number) { audio.playbackRate = r; }

// Kokoro reads numbers and symbols well; expand the regulatory shorthand it doesn't know
function speakableAi(t: string) {
  return t
    .replace(/§§/g, 'sections ').replace(/§/g, 'section ')
    .replace(/\bCFR\b/g, 'C.F.R.').replace(/\bMSL\b/g, 'M.S.L.').replace(/\bAGL\b/g, 'A.G.L.')
    .replace(/\be\.g\.,?/g, 'for example,').replace(/\bi\.e\.,?/g, 'that is,')
    .replace(/\((\w{1,4})\)(?=\s)/g, '$1,') // "(a) General" -> "a, General"
    .replace(/—/g, ', ')
    .replace(/\bft\b/g, 'feet').replace(/\bnm\b/g, 'nautical miles').replace(/\bkts?\b/g, 'knots');
}
