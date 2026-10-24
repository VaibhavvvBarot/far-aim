import { useEffect, useMemo, useState } from 'preact/hooks';
import { toc, label } from '../data';
import { annotations, saveAnnotation, deleteAnnotation } from '../store';
import type { Highlight, Bookmark, SectionNote, Color } from '../db';
import { COLORS, HighlightSheet } from './Reader';
import { Icon } from '../icons';

type Kind = 'hl' | 'bm' | 'note';
interface Info { num: string; title: string; doc: string }

export function useTitles() {
  const [map, setMap] = useState<Map<string, Info>>(new Map());
  useEffect(() => {
    toc().then((t) => {
      const m = new Map<string, Info>();
      for (const p of [...t.far, ...t.t49]) for (const s of p.sections) m.set(s.id, { num: s.num, title: s.title, doc: p.doc });
      for (const c of t.aim) for (const s of c.sections) for (const p of s.paras) m.set(p.id, { num: p.num, title: p.title, doc: 'aim' });
      for (const g of t.pcg) m.set(g.id, { num: 'P/CG', title: g.title, doc: 'pcg' });
      setMap(m);
    });
  }, []);
  return map;
}

export function Mine() {
  const [kind, setKind] = useState<Kind>('hl');
  const [color, setColor] = useState<Color | 'all'>('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Highlight | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const titles = useTitles();
  const all = annotations.value;
  const counts = { hl: all.filter((a) => a.type === 'hl').length, bm: all.filter((a) => a.type === 'bm').length, note: all.filter((a) => a.type === 'note' || (a.type === 'hl' && a.note)).length };

  const items = useMemo(() => {
    const f = q.trim().toLowerCase();
    let list = all.filter((a) => (kind === 'note' ? a.type === 'note' || (a.type === 'hl' && !!a.note) : a.type === kind));
    if (kind === 'hl' && color !== 'all') list = list.filter((a) => (a as Highlight).color === color);
    if (f) list = list.filter((a) => {
      const info = titles.get(a.sid);
      const hay = [info?.num, info?.title, (a as Highlight).exact, (a as Highlight).note, (a as SectionNote).note, (a as Bookmark).name].join(' ').toLowerCase();
      return hay.includes(f);
    });
    return list.sort((a, b) => b.created - a.created);
  }, [all, kind, color, q, titles]);

  const info = (sid: string) => titles.get(sid) || { num: sid, title: '', doc: sid.startsWith('aim') ? 'aim' : sid.startsWith('pcg') ? 'pcg' : 'far' };

  return (
    <div class="mine">
      <header class="pane-head"><h1>My stuff</h1>{counts.hl > 0 && <a class="btn small-btn review-btn" href="#/review"><Icon name="cards" size={18} /> Review</a>}</header>
      <div class="filters" role="tablist">
        <button role="tab" aria-selected={kind === 'hl'} class={'seg' + (kind === 'hl' ? ' on' : '')} onClick={() => setKind('hl')}>Highlights {counts.hl || ''}</button>
        <button role="tab" aria-selected={kind === 'bm'} class={'seg' + (kind === 'bm' ? ' on' : '')} onClick={() => setKind('bm')}>Bookmarks {counts.bm || ''}</button>
        <button role="tab" aria-selected={kind === 'note'} class={'seg' + (kind === 'note' ? ' on' : '')} onClick={() => setKind('note')}>Notes {counts.note || ''}</button>
      </div>
      {kind === 'hl' && counts.hl > 0 && (
        <div class="swatches small" role="group" aria-label="Filter by color">
          <button class={'seg' + (color === 'all' ? ' on' : '')} onClick={() => setColor('all')}>All</button>
          {COLORS.map((c) => <button class={`swatch c-${c.id}${color === c.id ? ' on' : ''}`} aria-label={`Only ${c.name.toLowerCase()}`} aria-pressed={color === c.id} onClick={() => setColor(c.id)} />)}
        </div>
      )}
      {all.length > 0 && <input class="filter-input" type="search" placeholder="Filter" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Filter my stuff" />}

      {!items.length && (
        <div class="pad empty">
          {kind === 'hl' && <p>Select any text while reading to highlight it. Your highlights collect here.</p>}
          {kind === 'bm' && <p>Tap the bookmark icon at the top of a section to keep it here.</p>}
          {kind === 'note' && <p>Add a note to a section with the note icon, or to a highlight by tapping it.</p>}
        </div>
      )}

      <ul class="list ann">
        {items.map((a) => {
          const i = info(a.sid);
          const head = (
            <span class="r-top"><span class="num">{label(i)}</span><span class="ttl-inline">{i.title}</span></span>
          );
          if (a.type === 'bm') return (
            <li>
              <div class="ann-row">
                <a href={`#/s/${a.sid}`} class="ann-main">
                  {a.name ? <><span class="ttl">{a.name}</span>{head}</> : <>{head}</>}
                </a>
                <button class="icon-btn" aria-label="Rename bookmark" onClick={() => setRenaming(a.id)}><Icon name="note" size={18} /></button>
                <button class="icon-btn" aria-label="Remove bookmark" onClick={() => deleteAnnotation(a.id)}><Icon name="trash" size={18} /></button>
              </div>
              {renaming === a.id && (
                <form class="rename" onSubmit={async (e) => {
                  e.preventDefault();
                  const v = ((e.currentTarget as HTMLFormElement).elements.namedItem('n') as HTMLInputElement).value.trim();
                  await saveAnnotation({ ...a, name: v || undefined }); setRenaming(null);
                }}>
                  <input name="n" defaultValue={a.name || ''} placeholder={`Name, e.g. "Night currency"`} autofocus />
                  <button class="btn">Save</button>
                </form>
              )}
            </li>
          );
          if (a.type === 'note') return (
            <li><a href={`#/s/${a.sid}`} class="ann-main">{head}<span class="note-text">{a.note}</span></a></li>
          );
          return (
            <li>
              <div class="ann-row">
                <a href={`#/s/${a.sid}`} class="ann-main">
                  {head}
                  <span class={`quote c-${a.color}`}>{a.exact}</span>
                  {a.note && <span class="note-text">{a.note}</span>}
                </a>
                <button class="icon-btn" aria-label="Edit highlight" onClick={() => setEditing(a)}><Icon name="note" size={18} /></button>
              </div>
            </li>
          );
        })}
      </ul>
      {editing && <HighlightSheet h={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
