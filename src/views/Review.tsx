import { useEffect, useRef, useState } from 'preact/hooks';
import { annotations, wide, go } from '../store';
import { getSection, htmlToText, label } from '../data';
import { locate } from '../highlight';
import { paragraphsFromHtml, gist } from '../paras';
import { loadSrs, saveSrs, schedule, preview, fresh, isDue, type CardState, type Grade } from '../srs';
import { saveAnnotation } from '../store';
import type { Highlight, Bookmark, Color } from '../db';
import { COLORS } from './Reader';
import { Icon } from '../icons';

// Two decks:
//  "Reg numbers": every bookmark (a section or one paragraph) gives two cards,
//     number -> what it is, and what it is -> number.
//  "Wording": highlights with the highlighted words blanked out.
type Deck = 'regs' | 'words';
type Dir = 'n' | 'm'; // n: shown the number; m: shown the meaning
interface Item { key: string; kind: 'reg' | 'hl'; a: Bookmark | Highlight; dir?: Dir }

interface RegCard { kind: 'reg'; key: string; bm: Bookmark; dir: Dir; num: string; auto: string; meaning: string; text: string; doc: string; secTitle: string }
interface WordCard { kind: 'hl'; key: string; h: Highlight; secLabel: string; secTitle: string; doc: string; before: string; after: string }
type Card = RegCard | WordCard;

export const bookmarks = () => annotations.value.filter((a): a is Bookmark => a.type === 'bm');
const highlights = () => annotations.value.filter((a): a is Highlight => a.type === 'hl');

function items(deck: Deck, color: Color | 'all'): Item[] {
  if (deck === 'regs') return bookmarks().flatMap((b) => (['n', 'm'] as Dir[]).map((dir) => ({ key: `${b.id}:${dir}`, kind: 'reg' as const, a: b, dir })));
  return highlights().filter((h) => color === 'all' || h.color === color).map((h) => ({ key: h.id, kind: 'hl' as const, a: h }));
}

async function buildReg(it: Item): Promise<RegCard> {
  const bm = it.a as Bookmark;
  const s = await getSection(bm.sid);
  const base = { kind: 'reg' as const, key: it.key, bm, dir: it.dir!, doc: s?.doc || 'far', secTitle: s?.title || '' };
  if (!s) return { ...base, num: bm.sid + (bm.para || ''), auto: '', meaning: bm.name || bm.sid, text: '' };
  const num = label(s) + (bm.para || '');
  if (!bm.para) {
    const auto = s.title.replace(/\.$/, '');
    return { ...base, num, auto, meaning: bm.name || auto, text: htmlToText(s.html).slice(0, 420) };
  }
  const all = paragraphsFromHtml(s.html, s.num);
  const p = all.find((x) => x.cite === s.num + bm.para) || null;
  const auto = gist(s.title, p, all);
  const text = p ? `${bm.para} ${p.heading && p.path.length === 1 ? p.heading + '. ' : ''}${p.text}` : '';
  return { ...base, num, auto, meaning: bm.name || auto, text: text.slice(0, 600) };
}

// Context around the highlighted words, cut at sentence edges where possible
async function buildWords(it: Item): Promise<WordCard> {
  const h = it.a as Highlight;
  const s = await getSection(h.sid);
  const base = { kind: 'hl' as const, key: it.key, h, secLabel: s ? label(s) : h.sid, secTitle: s?.title || '', doc: s?.doc || 'far' };
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
  return [...items('regs', 'all'), ...items('words', 'all')].filter((i) => isDue(srs[i.key], now)).length;
}

// "§ 91.213(d)(2)", "91.213 d 2", "91213d2" all count as the same answer
const normNum = (s: string) => s.toLowerCase().replace(/14\s*cfr|49\s*cfr|§|aim|part|\s|[()]/g, '');

export function Review() {
  const [srs, setSrs] = useState<Record<string, CardState> | null>(null);
  const [deck, setDeck] = useState<Deck>(() => (bookmarks().length || !highlights().length ? 'regs' : 'words'));
  const [color, setColor] = useState<Color | 'all'>('all');
  const [practice, setPractice] = useState(false);
  const [queue, setQueue] = useState<Item[] | null>(null);
  const [card, setCard] = useState<Card | null>(null);
  const [shown, setShown] = useState(false);
  const [typed, setTyped] = useState('');
  const [editing, setEditing] = useState(false);
  const [done, setDone] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { loadSrs().then(setSrs); }, []);

  const pool = items(deck, color);
  const now = Date.now();
  const due = srs ? pool.filter((i) => isDue(srs[i.key], now)) : [];

  const begin = (all: boolean) => {
    // shuffle, then due order; keep the two directions of one reg apart
    const list = (all ? pool : due).slice().sort(() => Math.random() - 0.5).sort((a, b) => (srs![a.key]?.due || 0) - (srs![b.key]?.due || 0));
    for (let i = 1; i < list.length; i++) {
      if (list[i].a.id === list[i - 1].a.id) { const j = list.findIndex((x, k) => k > i && x.a.id !== list[i].a.id); if (j > 0) [list[i], list[j]] = [list[j], list[i]]; }
    }
    setPractice(all);
    setQueue(list);
    setDone(0);
    next(list);
  };
  async function next(list: Item[]) {
    setShown(false); setTyped(''); setEditing(false);
    if (!list.length) { setCard(null); return; }
    setCard(list[0].kind === 'reg' ? await buildReg(list[0]) : await buildWords(list[0]));
    setTimeout(() => input.current?.focus(), 50);
  }
  const grade = async (g: Grade) => {
    if (!card || !queue || !srs) return;
    const updated = { ...srs, [card.key]: schedule(srs[card.key] || fresh(), g) };
    setSrs(updated);
    await saveSrs(updated);
    let rest = queue.slice(1);
    if (g === 'again') rest = [...rest, queue[0]]; // see it again this session
    setQueue(rest);
    setDone(done + 1);
    next(rest);
  };
  const saveMeaning = async (v: string) => {
    if (!card || card.kind !== 'reg') return;
    const name = v.trim() && v.trim() !== card.auto ? v.trim() : undefined;
    const bm = { ...card.bm, name };
    await saveAnnotation(bm);
    setCard({ ...card, bm, meaning: name || card.auto });
    setEditing(false);
  };

  // keyboard: space to flip, 1-4 to grade (not while typing)
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!card || editing) return;
      const inField = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA';
      if (e.key === ' ' && !inField) { e.preventDefault(); setShown(true); }
      if (shown && !inField && ['1', '2', '3', '4'].includes(e.key)) grade((['again', 'hard', 'good', 'easy'] as Grade[])[+e.key - 1]);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const bar = (
    <div class="reader-bar">
      {!wide.value && <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : go('mine'))}><Icon name="back" /></button>}
      <span class="bar-label">Flashcards</span>
      <span class="spacer" />
      {queue && card && <span class="muted small">{queue.length} left</span>}
      {queue && <button class="bar-btn" onClick={() => { setQueue(null); setCard(null); }}>End</button>}
    </div>
  );

  if (!srs) return <div class="reader">{bar}<p class="pad muted">Loading…</p></div>;

  // Start screen / finished screen
  if (!queue || !card) {
    const regCount = bookmarks().length;
    return (
      <div class="reader">{bar}
        <div class="reader-scroll"><div class="review-start">
          {queue && <p class="review-done">Session done: {done} {done === 1 ? 'card' : 'cards'} reviewed.</p>}
          <div class="filters center" role="tablist">
            <button role="tab" aria-selected={deck === 'regs'} class={'seg' + (deck === 'regs' ? ' on' : '')} onClick={() => setDeck('regs')}>Reg numbers</button>
            <button role="tab" aria-selected={deck === 'words'} class={'seg' + (deck === 'words' ? ' on' : '')} onClick={() => setDeck('words')}>Wording</button>
          </div>
          {deck === 'regs' && !regCount ? (
            <div class="review-empty">
              <p class="empty-title">No reg cards yet</p>
              <p>Bookmark a section with the bookmark button, or select a few words in one paragraph (like 91.211(b)) and tap <b>Flashcard</b>. You'll be asked the number and what it covers, not the wording.</p>
            </div>
          ) : deck === 'words' && !highlights().length ? (
            <div class="review-empty">
              <p class="empty-title">No highlights yet</p>
              <p>Select text in any section and pick a color. The highlighted words are blanked out for you to fill in.</p>
            </div>
          ) : (
            <>
              <p class="big-count"><b>{due.length}</b> {due.length === 1 ? 'card' : 'cards'} due</p>
              <p class="muted">{deck === 'regs'
                ? `${regCount} bookmarked ${regCount === 1 ? 'reg' : 'regs'}, asked both ways: the number, and what it covers.`
                : `${pool.length} highlights${color !== 'all' ? ` in ${color}` : ''}.`} Cards you know well come back less often.</p>
              {deck === 'words' && (
                <div class="swatches" role="group" aria-label="Which highlights">
                  <button class={'seg' + (color === 'all' ? ' on' : '')} onClick={() => setColor('all')}>All colors</button>
                  {COLORS.map((c) => <button class={`swatch c-${c.id}${color === c.id ? ' on' : ''}`} aria-label={`Only ${c.name.toLowerCase()} highlights`} aria-pressed={color === c.id} onClick={() => setColor(c.id)} />)}
                </div>
              )}
              <div class="row-actions">
                <button class="btn" disabled={!due.length} onClick={() => begin(false)}>Review {due.length} due</button>
                <button class="btn ghost" disabled={!pool.length} onClick={() => begin(true)}>Practise all {pool.length}</button>
              </div>
            </>
          )}
        </div></div>
      </div>
    );
  }

  const st = srs[card.key] || fresh();
  const sid = card.kind === 'reg' ? card.bm.sid : card.h.sid;
  const right = card.kind === 'reg' && typed.trim() ? normNum(typed) === normNum(card.num) : null;

  return (
    <div class="reader">{bar}
      <div class="reader-scroll">
        <div class="flashcard-wrap">
          {card.kind === 'reg' ? (
            <div class={'flashcard reg' + (shown ? ' flipped' : '')} data-doc={card.doc} onClick={() => !shown && card.dir === 'n' && setShown(true)}>
              <p class="fc-src">{card.dir === 'n' ? 'What is this reg?' : 'Which reg is this?'}</p>
              {card.dir === 'n'
                ? <p class="fc-num">{card.num}</p>
                : <p class="fc-meaning">{card.meaning}</p>}
              {card.dir === 'm' && !shown && (
                <form class="fc-answer" onSubmit={(e) => { e.preventDefault(); setShown(true); }}>
                  <input ref={input} value={typed} onInput={(e) => setTyped((e.target as HTMLInputElement).value)} placeholder="Type the number, e.g. 91.211(b)" inputMode="text" autocapitalize="off" autocomplete="off" spellcheck={false} aria-label="Your answer" />
                </form>
              )}
              {shown && (
                <div class="fc-back">
                  {card.dir === 'n'
                    ? <p class="fc-meaning">{card.meaning}</p>
                    : <p class="fc-num">{card.num}{right !== null && <span class={'fc-check ' + (right ? 'ok' : 'no')}>{right ? 'Right' : `You said ${typed.trim()}`}</span>}</p>}
                  {editing ? (
                    <form class="fc-edit" onSubmit={(e) => { e.preventDefault(); saveMeaning(((e.currentTarget as HTMLFormElement).elements.namedItem('m') as HTMLTextAreaElement).value); }}>
                      <textarea name="m" rows={3} autofocus defaultValue={card.meaning} aria-label="What this reg covers, in your words" />
                      <div class="sheet-actions"><span class="spacer" /><button type="button" class="btn ghost" onClick={() => setEditing(false)}>Cancel</button><button class="btn">Save</button></div>
                    </form>
                  ) : (
                    <button class="linkish small" onClick={(e) => { e.stopPropagation(); setEditing(true); }}>Write this in your own words</button>
                  )}
                  {card.text && <details class="fc-rule"><summary>Rule text</summary><p>{card.text}{card.text.length >= 420 ? '…' : ''}</p></details>}
                </div>
              )}
              {!shown && card.dir === 'n' && <p class="fc-hint">Say what it covers, then tap</p>}
            </div>
          ) : (
            <div class={'flashcard' + (shown ? ' flipped' : '')} data-doc={card.doc} onClick={() => setShown(true)}>
              <p class="fc-src"><span class="num">{card.secLabel}</span> {card.secTitle}</p>
              <p class="fc-text">
                {card.before}
                {shown ? <mark class={`hl c-${card.h.color}`}>{card.h.exact}</mark> : <span class="cloze" aria-label="hidden words">{' '.repeat(Math.min(40, Math.max(8, Math.round(card.h.exact.length / 2))))}</span>}
                {card.after}
              </p>
              {shown && card.h.note && <p class="fc-note">{card.h.note}</p>}
              {!shown && <p class="fc-hint">Tap to show the answer</p>}
            </div>
          )}
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
          <a class="linkish small fc-open" href={`#/s/${sid}`}>Open {card.kind === 'reg' ? card.num : card.secLabel}</a>
          {practice && <p class="muted small center">Practice mode: grades still count.</p>}
        </div>
      </div>
    </div>
  );
}
