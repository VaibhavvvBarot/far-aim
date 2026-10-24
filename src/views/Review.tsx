import { useEffect, useState } from 'preact/hooks';
import { annotations, wide, go } from '../store';
import { getSection, htmlToText, label } from '../data';
import { locate } from '../highlight';
import { loadSrs, saveSrs, schedule, preview, fresh, isDue, type CardState, type Grade } from '../srs';
import type { Highlight, Color } from '../db';
import { COLORS } from './Reader';
import { Icon } from '../icons';

interface Card { h: Highlight; secLabel: string; secTitle: string; doc: string; before: string; after: string }

// Context around the highlighted words, cut at sentence edges where possible
async function buildCard(h: Highlight): Promise<Card> {
  const s = await getSection(h.sid);
  const base = { h, secLabel: s ? label(s) : h.sid, secTitle: s?.title || '', doc: s?.doc || 'far' };
  if (!s) return { ...base, before: h.prefix, after: h.suffix };
  const text = htmlToText(s.html);
  const at = locate(text, h);
  if (!at) return { ...base, before: h.prefix, after: h.suffix };
  let a = Math.max(0, at[0] - 220);
  const cut = text.slice(a, at[0]).search(/[.;:]\s+(?=\(?[A-Z(])[^.;:]*$/);
  if (cut >= 0) a += cut + 2;
  let b = Math.min(text.length, at[1] + 160);
  const end = text.slice(at[1], b).search(/[.;]\s/);
  if (end >= 0) b = at[1] + end + 1;
  return { ...base, before: (a > 0 && cut < 0 ? '…' : '') + text.slice(a, at[0]).trimStart(), after: text.slice(at[1], b) + (b < text.length && end < 0 ? '…' : '') };
}

export async function dueCount() {
  const srs = await loadSrs();
  const now = Date.now();
  return annotations.value.filter((a) => a.type === 'hl' && isDue(srs[a.id], now)).length;
}

export function Review() {
  const [srs, setSrs] = useState<Record<string, CardState> | null>(null);
  const [color, setColor] = useState<Color | 'all'>('all');
  const [practice, setPractice] = useState(false);
  const [queue, setQueue] = useState<Highlight[] | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);

  const hls = annotations.value.filter((a): a is Highlight => a.type === 'hl');
  useEffect(() => { loadSrs().then(setSrs); }, []);

  const pool = hls.filter((h) => color === 'all' || h.color === color);
  const now = Date.now();
  const due = srs ? pool.filter((h) => isDue(srs[h.id], now)) : [];

  const begin = (all: boolean) => {
    const list = (all ? pool : due).slice().sort((a, b) => (srs![a.id]?.due || 0) - (srs![b.id]?.due || 0) || Math.random() - 0.5);
    setPractice(all);
    setQueue(list);
    setDone(0);
    next(list);
  };
  async function next(list: Highlight[]) {
    setShown(false);
    if (!list.length) { setCard(null); return; }
    setCard(await buildCard(list[0]));
  }
  const grade = async (g: Grade) => {
    if (!card || !queue || !srs) return;
    const updated = { ...srs, [card.h.id]: schedule(srs[card.h.id] || fresh(), g) };
    setSrs(updated);
    await saveSrs(updated);
    let rest = queue.slice(1);
    if (g === 'again') rest = [...rest, card.h]; // see it again this session
    setQueue(rest);
    setDone(done + 1);
    next(rest);
  };

  // keyboard: space to flip, 1-4 to grade
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!card) return;
      if (e.key === ' ') { e.preventDefault(); setShown(true); }
      if (shown && ['1', '2', '3', '4'].includes(e.key)) grade((['again', 'hard', 'good', 'easy'] as Grade[])[+e.key - 1]);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const bar = (
    <div class="reader-bar">
      {!wide.value && <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : go('mine'))}><Icon name="back" /></button>}
      <span class="bar-label">Review highlights</span>
      <span class="spacer" />
      {queue && card && <span class="muted small">{queue.length} left</span>}
      {queue && <button class="bar-btn" onClick={() => { setQueue(null); setCard(null); }}>End</button>}
    </div>
  );

  if (!srs) return <div class="reader">{bar}<p class="pad muted">Loading…</p></div>;

  if (!hls.length) return (
    <div class="reader">{bar}
      <div class="review-empty">
        <p class="empty-title">No cards yet</p>
        <p>Flashcards are made from your highlights. Select text in any section and pick a color, then come back here to practise it.</p>
      </div>
    </div>
  );

  // Start screen / finished screen
  if (!queue || !card) {
    return (
      <div class="reader">{bar}
        <div class="reader-scroll"><div class="review-start">
          {queue && <p class="review-done">Session done: {done} {done === 1 ? 'card' : 'cards'} reviewed.</p>}
          <p class="big-count"><b>{due.length}</b> {due.length === 1 ? 'card' : 'cards'} due</p>
          <p class="muted">{pool.length} highlights{color !== 'all' ? ` in ${color}` : ''}. Cards you know well come back less often.</p>
          <div class="swatches" role="group" aria-label="Which highlights">
            <button class={'seg' + (color === 'all' ? ' on' : '')} onClick={() => setColor('all')}>All colors</button>
            {COLORS.map((c) => <button class={`swatch c-${c.id}${color === c.id ? ' on' : ''}`} aria-label={`Only ${c.name.toLowerCase()} highlights`} aria-pressed={color === c.id} onClick={() => setColor(c.id)} />)}
          </div>
          <div class="row-actions">
            <button class="btn" disabled={!due.length} onClick={() => begin(false)}>Review {due.length} due</button>
            <button class="btn ghost" disabled={!pool.length} onClick={() => begin(true)}>Practise all {pool.length}</button>
          </div>
        </div></div>
      </div>
    );
  }

  const st = srs[card.h.id] || fresh();
  return (
    <div class="reader">{bar}
      <div class="reader-scroll">
        <div class="flashcard-wrap">
          <div class={'flashcard' + (shown ? ' flipped' : '')} data-doc={card.doc} onClick={() => setShown(true)}>
            <p class="fc-src"><span class="num">{card.secLabel}</span> {card.secTitle}</p>
            <p class="fc-text">
              {card.before}
              {shown ? <mark class={`hl c-${card.h.color}`}>{card.h.exact}</mark> : <span class="cloze" aria-label="hidden words">{' '.repeat(Math.min(40, Math.max(8, Math.round(card.h.exact.length / 2))))}</span>}
              {card.after}
            </p>
            {shown && card.h.note && <p class="fc-note">{card.h.note}</p>}
            {!shown && <p class="fc-hint">Tap to show the answer</p>}
          </div>
          {shown ? (
            <div class="grades" role="group" aria-label="How well did you know it?">
              {(['again', 'hard', 'good', 'easy'] as Grade[]).map((g, i) => (
                <button class={'grade g-' + g} onClick={() => grade(g)}>
                  <span class="g-name">{g[0].toUpperCase() + g.slice(1)}</span>
                  <span class="g-when">{preview(st, g)}</span>
                  {wide.value && <span class="g-key">{i + 1}</span>}
                </button>
              ))}
            </div>
          ) : (
            <button class="btn show-btn" onClick={() => setShown(true)}>Show answer</button>
          )}
          <a class="linkish small fc-open" href={`#/s/${card.h.sid}`}>Open {card.secLabel}</a>
          {practice && <p class="muted small center">Practice mode: grades still count.</p>}
        </div>
      </div>
    </div>
  );
}
