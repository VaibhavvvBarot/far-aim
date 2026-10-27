import { paraAt, paragraphs } from '../paras';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { getSection, neighbors, label, docName, stem, type Section } from '../data';
import { annotations, saveAnnotation, deleteAnnotation, recordVisit, saveLastRead, lastRead, route, go, showToast, settings, wide } from '../store';
import { uid, type Color, type Highlight, type Bookmark, type SectionNote } from '../db';
import { describeSelection, fullText, locate, wrapRange, unwrapAll, markAll } from '../highlight';
import { markDefinitions, getDef, type Def } from '../defs';
import { speaking, play, pause, resume, stop, jump, restartAtRate, collectBlocks, speechPrefs, supported as canSpeak, speechError } from '../speech';
import { Sheet } from '../sheet';
import { fmtDate } from './Home';
import { Icon } from '../icons';

export const COLORS: { id: Color; name: string }[] = [
  { id: 'yellow', name: 'Yellow' }, { id: 'blue', name: 'Blue' }, { id: 'magenta', name: 'Magenta' }, { id: 'green', name: 'Green' }, { id: 'orange', name: 'Orange' },
];
const RATES = [0.8, 1, 1.2, 1.4, 1.7];

// Reading position per section for this session
function readPos(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem('readpos') || '{}'); } catch { return {}; }
}

export function officialUrl(s: Section) {
  if (s.doc === 'far') return /^\d/.test(s.num) ? `https://www.ecfr.gov/current/title-14/section-${s.num}` : `https://www.ecfr.gov/current/title-14/part-${s.part}`;
  if (s.doc === 't49') return `https://www.ecfr.gov/current/title-49/section-${s.num}`;
  if (s.doc === 'aim') {
    const m = s.id.match(/^aim-(\d+)-(\d+)-(\d+)$/);
    return m ? `https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap${m[1]}_section_${m[2]}.html#${m[1]}-${m[2]}-${m[3]}` : 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/';
  }
  return `https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-${s.title[0].toLowerCase()}.html`;
}

interface OutlineItem { label: string; el: HTMLElement }
// Top-level paragraphs: (a), (b)... in the FARs, a., b.... in the AIM
function buildOutline(root: HTMLElement, doc: string): OutlineItem[] {
  const out: OutlineItem[] = [];
  if (doc === 'aim') {
    root.querySelectorAll<HTMLElement>(':scope > ol.level-one > li').forEach((li, i) => {
      const strong = li.querySelector(':scope > strong, :scope > p > strong');
      const t = (strong?.textContent || li.textContent || '').trim().replace(/\s+/g, ' ');
      out.push({ label: `${String.fromCharCode(97 + (i % 26))}. ${t.slice(0, 70)}`, el: li });
    });
  } else {
    root.querySelectorAll<HTMLElement>(':scope > p.l1').forEach((p) => {
      const t = (p.textContent || '').trim().replace(/\s+/g, ' ');
      const m = t.match(/^(\([a-z]+\))\s*(.*)$/);
      if (!m) return;
      const em = p.querySelector('em');
      const head = em && t.indexOf(em.textContent || '') < 8 ? (em.textContent || '').replace(/[.—]+$/, '') : m[2].slice(0, 60) + (m[2].length > 60 ? '…' : '');
      out.push({ label: `${m[1]} ${head}`, el: p });
    });
  }
  return out;
}

export function Reader({ id }: { id: string }) {
  const [sec, setSec] = useState<Section | null | undefined>(undefined);
  const [nb, setNb] = useState<{ prev?: Section; next?: Section }>({});
  const body = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [pending, setPending] = useState<null | { exact: string; prefix: string; suffix: string }>(null);
  const [editing, setEditing] = useState<Highlight | null>(null);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [findQ, setFindQ] = useState('');
  const [findIdx, setFindIdx] = useState(0);
  const [findCount, setFindCount] = useState(0);
  const [showText, setShowText] = useState(false);
  const [orphans, setOrphans] = useState<Highlight[]>([]);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [showOutline, setShowOutline] = useState(false);
  const [peek, setPeek] = useState<string | null>(null);
  const [def, setDef] = useState<Def | null>(null);
  const findTerm = route.value.query.get('find') || '';

  useEffect(() => {
    let alive = true;
    getSection(id).then((s) => {
      if (!alive) return;
      setSec(s || null);
      if (s) {
        recordVisit({ id: s.id, num: s.num, title: s.title, doc: s.doc });
        neighbors(s.id).then((n) => alive && setNb(n));
        document.title = `${label(s)} ${s.title}`;
      }
    });
    return () => { alive = false; };
  }, [id]);

  // Stop reading aloud when leaving this section (unless it's carrying on into the next one)
  useEffect(() => () => { if (speaking.peek().sid === id) stop(); }, [id]);

  const mine = annotations.value.filter((a) => a.sid === id);
  const hls = mine.filter((a): a is Highlight => a.type === 'hl');
  const bm = mine.find((a): a is Bookmark => a.type === 'bm' && !a.para);
  const paraBms = mine.filter((a): a is Bookmark => a.type === 'bm' && !!a.para);
  const note = mine.find((a): a is SectionNote => a.type === 'note');

  // Put the section text in place, paint highlights, underline defined terms, build the outline
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !sec) return;
    el.innerHTML = sec.html;
    const text = fullText(el);
    const placed: [number, number, Highlight][] = [];
    const lost: Highlight[] = [];
    for (const h of hls) {
      const at = locate(text, h);
      if (at) placed.push([at[0], at[1], h]); else lost.push(h);
    }
    for (const [a, b, h] of placed) {
      wrapRange(el, a, b, () => {
        const m = document.createElement('mark');
        m.className = `hl c-${h.color}${h.note ? ' has-note' : ''}`;
        m.dataset.hid = h.id;
        return m;
      });
    }
    setOrphans(lost);
    setOutline(buildOutline(el, sec.doc));
    markDefinitions(el, sec.id, sec.doc === 'far' ? sec.part : undefined);
  }, [sec, JSON.stringify(hls)]);

  // A small mark beside paragraphs you've made into flashcards
  useEffect(() => {
    const el = body.current;
    if (!el || !sec) return;
    el.querySelectorAll('.carded').forEach((n) => n.classList.remove('carded'));
    if (!paraBms.length) return;
    const want = new Set(paraBms.map((b) => sec.num + b.para));
    for (const p of paragraphs(el, sec.num)) if (want.has(p.cite)) p.el.classList.add('carded');
  }, [sec, JSON.stringify(hls), paraBms.map((b) => b.para).join()]);

  // Where to start: search term, where you were this session, last time, or the top
  useEffect(() => {
    if (!sec || !body.current) return;
    const seen = readPos()[id];
    if (findTerm) {
      setFindQ(findTerm);
      setFindOpen(true);
    } else if (seen != null && scroller.current) {
      scroller.current.scrollTop = seen;
    } else if (lastRead.value?.id === id && scroller.current) {
      scroller.current.scrollTop = lastRead.value.y;
    } else if (scroller.current) scroller.current.scrollTop = 0;
    // carrying on reading aloud from the previous section
    if (sessionStorage.getItem('autoplay') === id) {
      sessionStorage.removeItem('autoplay');
      setTimeout(startSpeaking, 300);
    }
  }, [sec]);

  useEffect(() => {
    const el = body.current;
    if (!el || !sec) return;
    if (!findOpen) { unwrapAll(el, 'mark.find'); setFindCount(0); return; }
    const words = findQ.match(/"[^"]+"|\S+/g)?.map((w) => w.replace(/"/g, '')) || [];
    const terms = words.flatMap((w) => [w, stem(w.toLowerCase())]).filter((w) => w.length > 2 || /\d/.test(w));
    const marks = markAll(el, terms);
    setFindCount(marks.length);
    setFindIdx(0);
    marks[0]?.classList.add('cur');
    marks[0]?.scrollIntoView({ block: 'center' });
  }, [findQ, findOpen, sec, JSON.stringify(hls)]);

  const stepFind = (d: number) => {
    const marks = [...(body.current?.querySelectorAll('mark.find') || [])] as HTMLElement[];
    if (!marks.length) return;
    marks.forEach((m) => m.classList.remove('cur'));
    const i = (findIdx + d + marks.length) % marks.length;
    setFindIdx(i);
    marks[i].classList.add('cur');
    marks[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  // Remember the reading position
  useEffect(() => {
    const sc = scroller.current;
    if (!sc) return;
    let t: number | undefined;
    const on = () => {
      clearTimeout(t);
      t = window.setTimeout(() => {
        saveLastRead(id, sc.scrollTop);
        const pos = readPos(); pos[id] = sc.scrollTop;
        try { sessionStorage.setItem('readpos', JSON.stringify(pos)); } catch { /* ignore */ }
      }, 250);
    };
    sc.addEventListener('scroll', on, { passive: true });
    return () => sc.removeEventListener('scroll', on);
  }, [id, sec]);

  // Text selection -> highlight bar
  useEffect(() => {
    const on = () => {
      const sel = document.getSelection();
      const el = body.current;
      if (!sel || sel.isCollapsed || !el || !sel.rangeCount) { return; }
      const r = sel.getRangeAt(0);
      if (!el.contains(r.commonAncestorContainer)) return;
      const d = describeSelection(el, r);
      if (d && d.exact.trim()) setPending(d);
    };
    document.addEventListener('selectionchange', on);
    return () => document.removeEventListener('selectionchange', on);
  }, []);

  function startSpeaking() {
    const el = body.current;
    if (!el || !sec) return;
    const blocks = collectBlocks(el);
    if (!blocks.length) return;
    play(id, blocks, 0, () => {
      if (speechPrefs().next && nb.next) { sessionStorage.setItem('autoplay', nb.next.id); go(`s/${nb.next.id}`); }
    });
  }
  const sp = speaking.value;
  useEffect(() => { if (speechError.value) { showToast('Read aloud stopped: ' + speechError.value); speechError.value = null; } }, [speechError.value]);
  const speakingHere = sp.sid === id && sp.state !== 'idle';

  // Keyboard shortcuts (sent from the app shell)
  useEffect(() => {
    const on = (e: Event) => {
      const a = (e as CustomEvent).detail as string;
      if (a === 'find') { setFindOpen(true); setTimeout(() => (document.querySelector('.find-bar input') as HTMLInputElement | null)?.focus(), 30); }
      if (a === 'next' && nb.next) go(`s/${nb.next.id}`);
      if (a === 'prev' && nb.prev) go(`s/${nb.prev.id}`);
      if (a === 'speak') speakingHere ? (sp.state === 'playing' ? pause() : resume()) : startSpeaking();
      if (a === 'escape') { if (findOpen) { setFindOpen(false); setFindQ(''); } setShowOutline(false); setShowText(false); setPending(null); }
      if (a === 'bookmark') toggleBookmark();
    };
    window.addEventListener('far:key', on);
    return () => window.removeEventListener('far:key', on);
  });

  const clearSel = () => { document.getSelection()?.removeAllRanges(); setPending(null); };

  const addHl = async (color: Color, withNote = false) => {
    if (!pending) return;
    const h: Highlight = { id: uid(), type: 'hl', sid: id, ...pending, color, created: Date.now() };
    await saveAnnotation(h);
    clearSel();
    if (withNote) setEditing(h);
  };

  const onBodyClick = async (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const collapsed = document.getSelection()?.isCollapsed !== false;
    if (collapsed) setPending(null);
    // Cross-references open as a preview instead of leaving the page
    const a = t.closest('a.xref') as HTMLAnchorElement | null;
    if (a && !(e.metaKey || e.ctrlKey)) {
      const href = a.getAttribute('href') || '';
      if (href.startsWith('#/s/')) { e.preventDefault(); setPeek(decodeURIComponent(href.slice(4))); return; }
      return;
    }
    const d = t.closest('span.def') as HTMLElement | null;
    if (d && collapsed) { const x = await getDef(+d.dataset.def!); if (x) setDef(x); return; }
    const m = t.closest('mark.hl') as HTMLElement | null;
    if (m && collapsed) {
      const h = hls.find((x) => x.id === m.dataset.hid);
      if (h) { setEditing(h); return; }
    }
    // While reading aloud, tapping a paragraph continues from there
    if (speakingHere && collapsed && body.current) {
      const blocks = collectBlocks(body.current);
      const i = blocks.findIndex((b) => b.el.contains(t));
      if (i >= 0) jump(i - sp.index);
    }
  };

  // Bookmark the paragraph the selection is in, as a reg-number flashcard (e.g. 91.211(b))
  const addParaCard = async () => {
    const r = document.getSelection()?.rangeCount ? document.getSelection()!.getRangeAt(0) : null;
    const el = body.current;
    if (!r || !el || !sec) return;
    const p = paraAt(el, sec.num, r.startContainer);
    const para = p ? p.cite.slice(sec.num.length) : '';
    clearSel();
    if (!para) { if (!bm) await saveAnnotation({ id: uid(), type: 'bm', sid: id, created: Date.now() }); showToast(`Flashcard added: ${label(sec)}`); return; }
    if (paraBms.some((b) => b.para === para)) { showToast(`${label(sec)}${para} is already a flashcard`); return; }
    await saveAnnotation({ id: uid(), type: 'bm', sid: id, para, created: Date.now() });
    showToast(`Flashcard added: ${label(sec)}${para}`);
  };

  const toggleBookmark = async () => {
    if (!sec) return;
    if (bm) { await deleteAnnotation(bm.id); showToast('Bookmark removed'); }
    else { await saveAnnotation({ id: uid(), type: 'bm', sid: id, created: Date.now() }); showToast('Bookmarked'); }
  };

  const saveNote = async () => {
    const v = (noteDraft || '').trim();
    if (note && !v) await deleteAnnotation(note.id);
    else if (v) await saveAnnotation({ id: note?.id || uid(), type: 'note', sid: id, note: v, created: note?.created || Date.now() });
    setNoteDraft(null);
  };

  const share = async () => {
    if (!sec) return;
    const url = officialUrl(sec);
    const text = `${label(sec)} ${sec.title}`;
    try {
      if (navigator.share) await navigator.share({ title: text, url });
      else { await navigator.clipboard.writeText(`${text}\n${url}`); showToast('Link to the official text copied'); }
    } catch { /* cancelled */ }
  };

  if (sec === undefined) return <div class="reader"><p class="muted pad">Loading…</p></div>;
  if (sec === null) return (
    <div class="reader"><div class="pad">
      <p class="empty-title">Section {id} isn't in this app</p>
      <p>It may have been removed or renumbered, or its Part isn't included yet.</p>
      <button class="btn" onClick={() => go(`search?q=${encodeURIComponent(id)}`)}>Search for it</button>
    </div></div>
  );

  const s = settings.value;
  const rate = speechPrefs().rate;
  return (
    <div class="reader" data-doc={sec.doc}>
      <div class="reader-bar">
        {!wide.value && <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : go('browse'))}><Icon name="back" /></button>}
        <span class="bar-label">{docName(sec.doc)}{sec.part && sec.doc !== 'pcg' && sec.doc !== 'aim' ? ` Part ${sec.part}` : ''}</span>
        <span class="spacer" />
        {outline.length >= 3 && <button class="icon-btn" aria-label="Outline of this section" aria-pressed={showOutline} onClick={() => { setShowOutline(!showOutline); setShowText(false); }}><Icon name="outline" /></button>}
        {canSpeak && <button class={'icon-btn' + (speakingHere ? ' active' : '')} aria-label={speakingHere ? 'Stop reading aloud' : 'Read aloud'} aria-pressed={speakingHere} onClick={() => (speakingHere ? stop() : startSpeaking())}><Icon name="speaker" /></button>}
        <button class="icon-btn" aria-label="Find in this section" aria-pressed={findOpen} onClick={() => { setFindOpen(!findOpen); if (findOpen) setFindQ(''); }}><Icon name="find" /></button>
        <button class="icon-btn" aria-label="Text size" aria-pressed={showText} onClick={() => { setShowText(!showText); setShowOutline(false); }}><Icon name="text" /></button>
        <button class="icon-btn" aria-label={note ? 'Edit note' : 'Add a note'} onClick={() => setNoteDraft(note?.note || '')}><Icon name="note" /></button>
        <button class={'icon-btn' + (bm ? ' active' : '')} aria-label={bm ? 'Remove bookmark' : 'Bookmark'} aria-pressed={!!bm} onClick={toggleBookmark}><Icon name={bm ? 'bookmarkFill' : 'bookmark'} /></button>
        <button class="icon-btn" aria-label="Share or open the official text" onClick={share}><Icon name="share" /></button>
        {wide.value && <button class="icon-btn" aria-label="Print" onClick={() => window.print()}><Icon name="print" /></button>}
      </div>

      {showText && (
        <div class="text-pop pop" role="dialog" aria-label="Text settings">
          <label>Size <input type="range" min="14" max="28" step="1" value={s.size} onInput={(e) => (settings.value = { ...s, size: +(e.target as HTMLInputElement).value })} /> <span>{s.size}</span></label>
          <div class="filters">
            {(['light', 'sepia', 'dark', 'night'] as const).map((t) => <button class={'seg' + (s.theme === t ? ' on' : '')} onClick={() => (settings.value = { ...s, theme: t })}>{t === 'night' ? 'Night red' : t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          <div class="filters">
            <button class={'seg' + (s.font === 'serif' ? ' on' : '')} onClick={() => (settings.value = { ...s, font: 'serif' })}>Serif</button>
            <button class={'seg' + (s.font === 'hyper' ? ' on' : '')} onClick={() => (settings.value = { ...s, font: 'hyper' })}>Hyperlegible</button>
          </div>
          {!wide.value && <button class="btn ghost" onClick={() => { setShowText(false); window.print(); }}><Icon name="print" size={18} /> Print this section</button>}
        </div>
      )}

      {showOutline && (
        <div class="outline-pop pop" role="dialog" aria-label="Outline">
          <p class="pop-h">Jump to</p>
          <ul>
            {outline.map((o) => (
              <li><button onClick={() => { setShowOutline(false); o.el.scrollIntoView({ block: 'start', behavior: 'smooth' }); o.el.classList.add('flash'); setTimeout(() => o.el.classList.remove('flash'), 1200); }}>{o.label}</button></li>
            ))}
          </ul>
        </div>
      )}

      {findOpen && (
        <div class="find-bar">
          <input type="search" value={findQ} placeholder="Find in this section" autofocus={!findTerm} onInput={(e) => setFindQ((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') { setFindOpen(false); setFindQ(''); } }} aria-label="Find in this section" />
          <span class="find-count">{findCount ? `${findIdx + 1} of ${findCount}` : findQ ? 'None' : ''}</span>
          <button class="icon-btn" aria-label="Previous match" onClick={() => stepFind(-1)}><Icon name="up" /></button>
          <button class="icon-btn" aria-label="Next match" onClick={() => stepFind(1)}><Icon name="down" /></button>
          <button class="icon-btn" aria-label="Close find" onClick={() => { setFindOpen(false); setFindQ(''); if (findTerm) history.replaceState(null, '', `#/s/${id}`); }}><Icon name="close" /></button>
        </div>
      )}

      <div class="reader-scroll" ref={scroller} onClick={() => { if (showOutline) setShowOutline(false); if (showText) setShowText(false); }}>
        <article class="sheet">
          <header class="sec-head">
            <p class="sec-num">{label(sec)}</p>
            <h1 class="sec-title">{sec.title}</h1>
            <p class="sec-meta">
              {sec.amended && <span>Amended {fmtDate(sec.amended)}</span>}
              {sec.changed && <a class="changed" href={`#/diff/${sec.id}`}>Changed {fmtDate(sec.changed)}: see what changed</a>}
            </p>
          </header>

          {orphans.length > 0 && (
            <div class="orphans" role="note">
              <p><b>{orphans.length === 1 ? 'One highlight' : `${orphans.length} highlights`} no longer match this text</b>, probably because the regulation was updated.</p>
              {orphans.map((o) => (
                <p class="orphan"><mark class={`hl c-${o.color}`}>{o.exact}</mark> <button class="linkish small" onClick={() => deleteAnnotation(o.id)}>Remove</button></p>
              ))}
            </div>
          )}

          <div class="doc-body" ref={body} onClick={onBodyClick as any} />

          {(note || hls.some((h) => h.note)) && (
            <section class="notes">
              <h2>Your notes</h2>
              {note && <p class="note-card section-note" onClick={() => setNoteDraft(note.note)}>{note.note}</p>}
              {hls.filter((h) => h.note).map((h) => (
                <div class="note-card" onClick={() => setEditing(h)}>
                  <p class={`quote c-${h.color}`}>{h.exact}</p>
                  <p>{h.note}</p>
                </div>
              ))}
            </section>
          )}

          <nav class="prevnext" aria-label="Neighbouring sections">
            {nb.prev ? <a href={`#/s/${nb.prev.id}`} class="pn prev"><span class="pn-k">Previous</span><span class="num">{label(nb.prev)}</span><span class="ttl">{nb.prev.title}</span></a> : <span />}
            {nb.next ? <a href={`#/s/${nb.next.id}`} class="pn next"><span class="pn-k">Next</span><span class="num">{label(nb.next)}</span><span class="ttl">{nb.next.title}</span></a> : <span />}
          </nav>
          <p class="official">Unofficial copy. <a href={officialUrl(sec)} target="_blank" rel="noopener">Open the official text</a></p>
        </article>
      </div>

      {speakingHere && (
        <div class="speech-bar" role="toolbar" aria-label="Reading aloud">
          <button class="icon-btn" aria-label="Previous paragraph" onClick={() => jump(-1)}><Icon name="rewind" /></button>
          <button class="icon-btn play" aria-label={sp.state === 'playing' ? 'Pause' : 'Resume'} onClick={() => (sp.state === 'playing' ? pause() : resume())}><Icon name={sp.state === 'playing' ? 'pause' : 'play'} /></button>
          <button class="icon-btn" aria-label="Next paragraph" onClick={() => jump(1)}><Icon name="forward" /></button>
          <span class="speech-pos">{`${sp.index + 1} of ${sp.total}`}</span>
          <button class="bar-btn" aria-label="Reading speed" onClick={() => restartAtRate(RATES[(RATES.indexOf(rate) + 1) % RATES.length] || 1)}>{rate}×</button>
          <button class="icon-btn" aria-label="Stop reading" onClick={() => stop()}><Icon name="close" /></button>
        </div>
      )}

      {pending && (
        <div class="sel-bar" role="toolbar" aria-label="Highlight selection" onPointerDown={(e) => e.preventDefault()}>
          {COLORS.map((c) => <button class={`swatch c-${c.id}`} aria-label={`Highlight ${c.name.toLowerCase()}`} onClick={() => addHl(c.id)} />)}
          <span class="sep" />
          <button class="bar-btn" onClick={() => addHl('yellow', true)}>Note</button>
          {(sec.doc === 'far' || sec.doc === 't49') && <button class="bar-btn" onClick={addParaCard}>Flashcard</button>}
          <button class="bar-btn" onClick={async () => { await navigator.clipboard?.writeText(pending.exact); showToast('Copied'); clearSel(); }}>Copy</button>
          <button class="icon-btn" aria-label="Cancel" onClick={clearSel}><Icon name="close" /></button>
        </div>
      )}

      {editing && <HighlightSheet h={editing} onClose={() => setEditing(null)} />}
      {peek && <PeekSheet start={peek} onClose={() => setPeek(null)} />}
      {def && <DefSheet d={def} onClose={() => setDef(null)} />}

      {noteDraft !== null && (
        <Sheet label={`Note on ${label(sec)}`} onClose={() => setNoteDraft(null)}>
          {(close: () => void) => (
            <>
              <h2>Note on {label(sec)}</h2>
              <textarea value={noteDraft} autofocus rows={6} placeholder="Write a note" onInput={(e) => setNoteDraft((e.target as HTMLTextAreaElement).value)} />
              <div class="sheet-actions">
                {note && <button class="btn ghost danger" onClick={async () => { await deleteAnnotation(note.id); close(); }}>Delete note</button>}
                <span class="spacer" />
                <button class="btn ghost" onClick={close}>Cancel</button>
                <button class="btn" onClick={async () => { await saveNote(); }}>Save note</button>
              </div>
            </>
          )}
        </Sheet>
      )}
    </div>
  );
}

export function HighlightSheet({ h, onClose }: { h: Highlight; onClose: () => void }) {
  const [note, setNote] = useState(h.note || '');
  const [color, setColor] = useState<Color>(h.color);
  const deleted = useRef(false);
  const save = () => { if (!deleted.current) saveAnnotation({ ...h, color, note: note.trim() || undefined }); };
  return (
    <Sheet label="Edit highlight" onClose={() => { save(); onClose(); }}>
      {(close: () => void) => (
        <>
          <p class={`quote c-${color}`}>{h.exact}</p>
          <div class="swatches">
            {COLORS.map((c) => <button class={`swatch c-${c.id}${color === c.id ? ' on' : ''}`} aria-label={c.name} aria-pressed={color === c.id} onClick={() => setColor(c.id)} />)}
          </div>
          <textarea value={note} rows={4} placeholder="Add a note to this highlight" onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
          <div class="sheet-actions">
            <button class="btn ghost danger" onClick={async () => { deleted.current = true; await deleteAnnotation(h.id); close(); }}><Icon name="trash" size={18} /> Delete highlight</button>
            <span class="spacer" />
            <button class="btn" onClick={close}>Done</button>
          </div>
        </>
      )}
    </Sheet>
  );
}

// Preview of a cross-referenced section without leaving the one you're reading
export function PeekSheet({ start, onClose }: { start: string; onClose: () => void }) {
  const [stack, setStack] = useState<string[]>([start]);
  const [sec, setSec] = useState<Section | null | undefined>(undefined);
  const body = useRef<HTMLDivElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const cur = stack.at(-1)!;
  useEffect(() => { setSec(undefined); getSection(cur).then((s) => setSec(s || null)); }, [cur]);
  useLayoutEffect(() => {
    if (body.current && sec) { body.current.innerHTML = sec.html; if (scroll.current) scroll.current.scrollTop = 0; }
  }, [sec]);
  const onClick = (e: MouseEvent) => {
    const a = (e.target as HTMLElement).closest('a.xref') as HTMLAnchorElement | null;
    const href = a?.getAttribute('href') || '';
    if (a && href.startsWith('#/s/')) { e.preventDefault(); setStack([...stack, decodeURIComponent(href.slice(4))]); }
  };
  return (
    <Sheet label="Preview" onClose={onClose} wide tall>
      {(close: () => void) => (
        <>
          <div class="peek-head">
            {stack.length > 1 ? <button class="icon-btn" aria-label="Back" onClick={() => setStack(stack.slice(0, -1))}><Icon name="back" /></button> : <span class="peek-spacer" />}
            <div class="peek-title" data-doc={sec?.doc}>
              {sec && <><span class="num">{label(sec)}</span> <span>{sec.title}</span></>}
              {sec === null && <span>This section isn't in the app.</span>}
            </div>
            {sec && <button class="btn small-btn" onClick={() => { close(); setTimeout(() => go(`s/${cur}`), 210); }}>Open</button>}
          </div>
          <div class="sheet-scroll" ref={scroll}>
            <div class="doc-body peek-body" data-doc={sec?.doc} ref={body} onClick={onClick as any} />
          </div>
        </>
      )}
    </Sheet>
  );
}

function DefSheet({ d, onClose }: { d: Def; onClose: () => void }) {
  return (
    <Sheet label={`Definition of ${d.term}`} onClose={onClose}>
      {(close: () => void) => (
        <>
          <p class="def-k">Defined in 14 CFR {d.src || '1.1'}</p>
          <div class="doc-body def-body" dangerouslySetInnerHTML={{ __html: d.html }} />
          <div class="sheet-actions">
            <a class="btn ghost" href={`#/s/${d.src || '1.1'}?find=${encodeURIComponent(d.match)}`} onClick={() => close()}>Open § {d.src || '1.1'}</a>
            <span class="spacer" />
            <button class="btn" onClick={close}>Done</button>
          </div>
        </>
      )}
    </Sheet>
  );
}
