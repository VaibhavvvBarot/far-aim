// Spaced repetition for flashcards made from your highlights (a light SM-2).
import { kv } from './db';

export interface CardState { ease: number; interval: number; reps: number; due: number; seen: number }
export type Grade = 'again' | 'hard' | 'good' | 'easy';
const DAY = 864e5;

export async function loadSrs(): Promise<Record<string, CardState>> {
  return (await kv.get<Record<string, CardState>>('srs')) || {};
}
export async function saveSrs(s: Record<string, CardState>) { await kv.set('srs', s); }

export function fresh(): CardState { return { ease: 2.5, interval: 0, reps: 0, due: 0, seen: 0 }; }

export function schedule(c: CardState, g: Grade, now = Date.now()): CardState {
  let { ease, interval, reps } = c;
  if (g === 'again') { reps = 0; interval = 0; ease = Math.max(1.3, ease - 0.2); return { ease, interval, reps, due: now + 10 * 60e3, seen: now }; }
  if (g === 'hard') { interval = reps === 0 ? 1 : Math.max(1, interval * 1.2); ease = Math.max(1.3, ease - 0.15); }
  if (g === 'good') { interval = reps === 0 ? 1 : reps === 1 ? 3 : interval * ease; }
  if (g === 'easy') { interval = reps === 0 ? 4 : interval * ease * 1.3; ease += 0.15; }
  reps += 1;
  interval = Math.round(interval * 10) / 10;
  return { ease, interval, reps, due: now + interval * DAY, seen: now };
}

export function preview(c: CardState, g: Grade) {
  const n = schedule(c, g, 0);
  if (g === 'again') return '10 min';
  const d = n.interval;
  return d < 1.5 ? '1 day' : d < 30 ? `${Math.round(d)} days` : d < 365 ? `${Math.round(d / 30)} mo` : `${(d / 365).toFixed(1)} yr`;
}

export const isDue = (c: CardState | undefined, now = Date.now()) => !c || c.due <= now;
