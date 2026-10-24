import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { getSection, neighbors, label, docName, stem, type Section } from '../data';
import { annotations, saveAnnotation, deleteAnnotation, recordVisit, saveLastRead, lastRead, route, go, showToast, settings, wide } from '../store';
import { uid, type Color, type Highlight, type Bookmark, type SectionNote } from '../db';
import { describeSelection, fullText, locate, wrapRange, unwrapAll, markAll } from '../highlight';
import { fmtDate } from './Home';
import { Icon } from '../icons';

export const COLORS: { id: Color; name: string }[] = [
  { id: 'yellow', name: 'Yellow' }, { id: 'blue', name: 'Blue' }, { id: 'magenta', name: 'Magenta' }, { id: 'green', name: 'Green' }, { id: 'orange', name: 'Orange' },
];

// Reading position per section for this session
function readPos(): Record<string, number> {
  try { return JSON.parse(sessionStorage.getItem('readpos') || '{}'); } catch { return {}; }
}

function officialUrl(s: Section) {
  if (s.doc === 'far') return /^\d/.test(s.num) ? `https://www.ecfr.gov/current/title-14/section-${s.num}` : `https://www.ecfr.gov/current/title-14/part-${s.part}`;
  if (s.doc === 't49') return `https://www.ecfr.gov/current/title-49/section-${s.num}`;
  if (s.doc === 'aim') {
    const m = s.id.match(/^aim-(\d+)-(\d+)-(\d+)$/);
    return m ? `https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap${m[1]}_section_${m[2]}.html#${m[1]}-${m[2]}-${m[3]}` : 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/';
  }
  return `https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/glossary-${s.title[0].toLowerCase()}.html`;
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

  const mine = annotations.value.filter((a) => a.sid === id);
  const hls = mine.filter((a): a is Highlight => a.type === 'hl');
  const bm = mine.find((a): a is Bookmark => a.type === 'bm');
  const note = mine.find((a): a is SectionNote => a.type === 'note');

  // Put the section text in place and paint highlights
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
  }, [sec, JSON.stringify(hls)]);

  // Search terms carried over from Search: highlight and scroll to the first one
  useEffect(() => {
    if (!sec || !body.current) return;
    const seen = readPos()[id];
    if (findTerm) {
      setFindQ(findTerm);
      setFindOpen(true);
    } else if (seen != null && scroller.current) {
      // Coming back to a section you already had open: same spot as before
      scroller.current.scrollTop = seen;
    } else if (lastRead.value?.id === id && scroller.current) {
      scroller.current.scrollTop = lastRead.value.y;
    } else if (scroller.current) scroller.current.scrollTop = 0;
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

  const clearSel = () => { document.getSelection()?.removeAllRanges(); setPending(null); };

  const addHl = async (color: Color, withNote = false) => {
    if (!pending) return;
    const h: Highlight = { id: uid(), type: 'hl', sid: id, ...pending, color, created: Date.now() };
    await saveAnnotation(h);
    clearSel();
    if (withNote) setEditing(h);
  };

  const onBodyClick = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    const m = t.closest('mark.hl') as HTMLElement | null;
    if (document.getSelection()?.isCollapsed) setPending(null);
    if (m && document.getSelection()?.isCollapsed) {
      const h = hls.find((x) => x.id === m.dataset.hid);
      if (h) setEditing(h);
    }
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
  return (
    <div class="reader" data-doc={sec.doc}>
      <div class="reader-bar">
        {!wide.value && <button class="icon-btn" aria-label="Back" onClick={() => (history.length > 1 ? history.back() : go('browse'))}><Icon name="back" /></button>}
        <span class="bar-label">{docName(sec.doc)}{sec.part && sec.doc !== 'pcg' && sec.doc !== 'aim' ? ` Part ${sec.part}` : ''}</span>
        <span class="spacer" />
        <button class="icon-btn" aria-label="Find in this section" aria-pressed={findOpen} onClick={() => { setFindOpen(!findOpen); if (findOpen) setFindQ(''); }}><Icon name="find" /></button>
        <button class="icon-btn" aria-label="Text size" aria-pressed={showText} onClick={() => setShowText(!showText)}><Icon name="text" /></button>
        <button class="icon-btn" aria-label={note ? 'Edit note' : 'Add a note'} onClick={() => setNoteDraft(note?.note || '')}><Icon name="note" /></button>
        <button class={'icon-btn' + (bm ? ' active' : '')} aria-label={bm ? 'Remove bookmark' : 'Bookmark'} aria-pressed={!!bm} onClick={toggleBookmark}><Icon name={bm ? 'bookmarkFill' : 'bookmark'} /></button>
        <button class="icon-btn" aria-label="Share or open the official text" onClick={share}><Icon name="share" /></button>
        <button class="icon-btn" aria-label="Print" onClick={() => window.print()}><Icon name="print" /></button>
      </div>

      {showText && (
        <div class="text-pop" role="dialog" aria-label="Text settings">
          <label>Size <input type="range" min="14" max="28" step="1" value={s.size} onInput={(e) => (settings.value = { ...s, size: +(e.target as HTMLInputElement).value })} /> <span>{s.size}</span></label>
          <div class="filters">
            {(['light', 'sepia', 'dark', 'night'] as const).map((t) => <button class={'seg' + (s.theme === t ? ' on' : '')} onClick={() => (settings.value = { ...s, theme: t })}>{t === 'night' ? 'Night red' : t[0].toUpperCase() + t.slice(1)}</button>)}
          </div>
          <div class="filters">
            <button class={'seg' + (s.font === 'serif' ? ' on' : '')} onClick={() => (settings.value = { ...s, font: 'serif' })}>Serif</button>
            <button class={'seg' + (s.font === 'hyper' ? ' on' : '')} onClick={() => (settings.value = { ...s, font: 'hyper' })}>Hyperlegible</button>
          </div>
        </div>
      )}

      {findOpen && (
        <div class="find-bar">
          <input type="search" value={findQ} placeholder="Find in this section" autofocus={!findTerm} onInput={(e) => setFindQ((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); stepFind(e.shiftKey ? -1 : 1); } }} aria-label="Find in this section" />
          <span class="find-count">{findCount ? `${findIdx + 1} of ${findCount}` : findQ ? 'None' : ''}</span>
          <button class="icon-btn" aria-label="Previous match" onClick={() => stepFind(-1)}><Icon name="up" /></button>
          <button class="icon-btn" aria-label="Next match" onClick={() => stepFind(1)}><Icon name="down" /></button>
          <button class="icon-btn" aria-label="Close find" onClick={() => { setFindOpen(false); setFindQ(''); if (findTerm) history.replaceState(null, '', `#/s/${id}`); }}><Icon name="close" /></button>
        </div>
      )}

      <div class="reader-scroll" ref={scroller}>
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

      {pending && (
        <div class="sel-bar" role="toolbar" aria-label="Highlight selection" onPointerDown={(e) => e.preventDefault()}>
          {COLORS.map((c) => <button class={`swatch c-${c.id}`} aria-label={`Highlight ${c.name.toLowerCase()}`} onClick={() => addHl(c.id)} />)}
          <span class="sep" />
          <button class="bar-btn" onClick={() => addHl('yellow', true)}>Note</button>
          <button class="bar-btn" onClick={async () => { await navigator.clipboard?.writeText(pending.exact); showToast('Copied'); clearSel(); }}>Copy</button>
          <button class="icon-btn" aria-label="Cancel" onClick={clearSel}><Icon name="close" /></button>
        </div>
      )}

      {editing && <HighlightSheet h={editing} onClose={() => setEditing(null)} />}

      {noteDraft !== null && (
        <div class="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) saveNote(); }}>
          <div class="sheet-panel" role="dialog" aria-label="Note on this section">
            <h2>Note on {label(sec)}</h2>
            <textarea value={noteDraft} autofocus rows={6} placeholder="Write a note" onInput={(e) => setNoteDraft((e.target as HTMLTextAreaElement).value)} />
            <div class="sheet-actions">
              {note && <button class="btn ghost danger" onClick={async () => { await deleteAnnotation(note.id); setNoteDraft(null); }}>Delete note</button>}
              <span class="spacer" />
              <button class="btn ghost" onClick={() => setNoteDraft(null)}>Cancel</button>
              <button class="btn" onClick={saveNote}>Save note</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function HighlightSheet({ h, onClose }: { h: Highlight; onClose: () => void }) {
  const [note, setNote] = useState(h.note || '');
  const [color, setColor] = useState<Color>(h.color);
  const save = async () => { await saveAnnotation({ ...h, color, note: note.trim() || undefined }); onClose(); };
  return (
    <div class="sheet-backdrop" onClick={(e) => { if (e.target === e.currentTarget) save(); }}>
      <div class="sheet-panel" role="dialog" aria-label="Edit highlight">
        <p class={`quote c-${color}`}>{h.exact}</p>
        <div class="swatches">
          {COLORS.map((c) => <button class={`swatch c-${c.id}${color === c.id ? ' on' : ''}`} aria-label={c.name} aria-pressed={color === c.id} onClick={() => setColor(c.id)} />)}
        </div>
        <textarea value={note} rows={4} placeholder="Add a note to this highlight" onInput={(e) => setNote((e.target as HTMLTextAreaElement).value)} />
        <div class="sheet-actions">
          <button class="btn ghost danger" onClick={async () => { await deleteAnnotation(h.id); onClose(); }}><Icon name="trash" size={18} /> Delete highlight</button>
          <span class="spacer" />
          <button class="btn" onClick={save}>Done</button>
        </div>
      </div>
    </div>
  );
}
