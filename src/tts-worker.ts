/// <reference lib="webworker" />
// Runs the Kokoro neural voice off the main thread. Messages:
//   { type: 'load', device, dtype, wasmPaths }  -> progress..., ready | error
//   { type: 'gen', id, text, voice }            -> audio { id, wav, ms, dur } | genError
import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';

const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts: KokoroTTS | null = null;
let queue: Promise<unknown> = Promise.resolve();
let minId = 0; // requests below this were cancelled (the reader jumped or stopped)
const post = (m: unknown, t?: Transferable[]) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m, t || []);

self.onmessage = (e: MessageEvent) => {
  const m = e.data;
  if (m.type === 'load') {
    queue = queue.then(async () => {
      try {
        if (m.wasmPaths) (env.backends.onnx as any).wasm.wasmPaths = m.wasmPaths;
        env.allowLocalModels = false;
        tts = await KokoroTTS.from_pretrained(MODEL, {
          dtype: m.dtype,
          device: m.device,
          progress_callback: (p: any) => { if (p.status === 'progress') post({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total }); },
        });
        // warm up so the first real sentence starts quickly
        await tts.generate('Ready.', { voice: m.voice || 'af_heart' });
        post({ type: 'ready', device: m.device, dtype: m.dtype });
      } catch (err) {
        post({ type: 'error', error: String((err as Error)?.message || err) });
      }
    });
  } else if (m.type === 'cancel') {
    minId = Math.max(minId, m.below);
  } else if (m.type === 'gen') {
    queue = queue.then(async () => {
      if (m.id < minId) { post({ type: 'genError', id: m.id, error: 'cancelled' }); return; }
      if (!tts) { post({ type: 'genError', id: m.id, error: 'not loaded' }); return; }
      try {
        const t0 = performance.now();
        const audio = await tts.generate(m.text, { voice: m.voice });
        const wav = audio.toWav();
        post({ type: 'audio', id: m.id, wav, ms: performance.now() - t0, dur: audio.audio.length / audio.sampling_rate }, [wav]);
      } catch (err) {
        post({ type: 'genError', id: m.id, error: String((err as Error)?.message || err) });
      }
    });
  }
};
