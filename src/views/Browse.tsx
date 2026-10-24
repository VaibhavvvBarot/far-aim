import { useEffect, useMemo, useState } from 'preact/hooks';
import { toc, type Toc, type TocSection } from '../data';
import { route, go } from '../store';
import { Icon } from '../icons';
import { GuideList } from './Guides';

type D = 'guides' | 'far' | 'aim' | 'pcg' | 't49';
const SEGS: { id: D; label: string }[] = [
  { id: 'guides', label: 'Guides' }, { id: 'far', label: 'FAR' }, { id: 'aim', label: 'AIM' }, { id: 'pcg', label: 'Glossary' }, { id: 't49', label: 'NTSB 830' },
];
const ss = {
  get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch { /* ignore */ } },
};

export function Browse({ initial }: { initial?: string | null }) {
  const [t, setT] = useState<Toc | null>(null);
  const [d, setD] = useState<D>((initial as D) || (ss.get('browse') as D) || 'guides');
  const [openCh, setOpenCh] = useState<string | null>(ss.get('aimCh'));
  const [openSec, setOpenSec] = useState<string | null>(ss.get('aimSec'));
  const [filter, setFilter] = useState('');
  useEffect(() => { toc().then(setT); }, []);
  useEffect(() => { if (initial) setD(initial as D); }, [initial]);
  const pick = (v: D) => { setD(v); ss.set('browse', v); };

  const pcgList = useMemo(() => {
    if (!t) return [];
    const f = filter.trim().toLowerCase();
    return f ? t.pcg.filter((x) => x.title.toLowerCase().includes(f)) : t.pcg;
  }, [t, filter]);

  return (
    <div class="browse">
      <header class="pane-head"><h1>Browse</h1></header>
      <div class="filters" role="tablist">
        {SEGS.map((s) => <button role="tab" aria-selected={d === s.id} class={'seg' + (d === s.id ? ' on' : '')} onClick={() => pick(s.id)}>{s.label}</button>)}
      </div>
      {d === 'guides' && <GuideList />}
      {!t && d !== 'guides' && <p class="muted pad">Loading…</p>}
      {t && (d === 'far' || d === 't49') && (
        <ul class="list parts">
          {t[d].map((p) => (
            <li><a href={`#/p/${d === 't49' ? '49-' : ''}${p.part}`}>
              <span class="num">Part {p.part}</span>
              <span class="ttl">{p.title}{p.subparts.length > 0 && <span class="sub-count">{p.subparts.length} subparts</span>}</span>
              <Icon name="chevron" size={18} />
            </a></li>
          ))}
        </ul>
      )}
      {t && d === 'aim' && (
        <ul class="list tree">
          {t.aim.map((c) => (
            <li class={openCh === c.ch ? 'open' : ''}>
              <button class="tree-row" aria-expanded={openCh === c.ch} onClick={() => { const v = openCh === c.ch ? null : c.ch; setOpenCh(v); ss.set('aimCh', v || ''); }}>
                <span class="num">{c.ch === 'app' ? 'App.' : `Ch ${c.ch}`}</span><span class="ttl">{c.title}</span><Icon name={openCh === c.ch ? 'up' : 'down'} size={18} />
              </button>
              {openCh === c.ch && (
                <ul>
                  {c.sections.map((s) => (
                    <li class={openSec === s.id ? 'open' : ''}>
                      {s.paras.length === 1 ? (
                        <a href={`#/s/${s.paras[0].id}`} class="tree-row sub"><span class="num">{s.num}</span><span class="ttl">{s.title}</span></a>
                      ) : (
                        <button class="tree-row sub" aria-expanded={openSec === s.id} onClick={() => { const v = openSec === s.id ? null : s.id; setOpenSec(v); ss.set('aimSec', v || ''); }}>
                          <span class="num">{s.num}</span><span class="ttl">{s.title}</span><Icon name={openSec === s.id ? 'up' : 'down'} size={16} />
                        </button>
                      )}
                      {openSec === s.id && s.paras.length > 1 && (
                        <ul>{s.paras.map((p) => <li><a class="tree-row leaf" href={`#/s/${p.id}`}><span class="num">{p.num.replace('AIM ', '')}</span><span class="ttl">{p.title}</span></a></li>)}</ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {t && d === 'pcg' && (
        <>
          <input class="filter-input" type="search" placeholder="Filter terms" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} aria-label="Filter glossary terms" />
          <ul class="list glossary">
            {pcgList.slice(0, 400).map((g) => <li><a href={`#/s/${g.id}`}><span class="ttl">{g.title}</span></a></li>)}
          </ul>
          {pcgList.length > 400 && <p class="muted pad">Type to narrow the list ({pcgList.length} terms).</p>}
        </>
      )}
    </div>
  );
}

// "Subpart E—Private Pilots" -> ["E", "Private Pilots"]
export function splitSub(title: string, id: string): [string, string] {
  const m = title.match(/^Subpart\s+([A-Z0-9]+)\s*[—–-]\s*(.*)$/);
  return m ? [m[1], m[2]] : [id, title];
}
const shortNum = (s: TocSection) => (/^\d/.test(s.num) ? s.num : s.num.replace(/^Part \d+, /, ''));

interface Block { key: string; letter: string | null; title: string; secs: TocSection[] }

export function PartToc({ part, openSub }: { part: string; openSub?: string | null }) {
  const [t, setT] = useState<Toc | null>(null);
  const [q, setQ] = useState('');
  const is49 = part.startsWith('49-');
  const storeKey = 'open:' + part;
  const [open, setOpen] = useState<Set<string>>(() => new Set((ss.get(storeKey) || '').split(',').filter(Boolean)));
  useEffect(() => { toc().then(setT); }, []);
  const p = t && (is49 ? t.t49 : t.far).find((x) => x.part === part.replace('49-', ''));
  const cur = route.value.name === 's' ? route.value.arg : '';

  const blocks = useMemo<Block[]>(() => {
    if (!p) return [];
    const out: Block[] = [];
    const extra: TocSection[] = [];
    for (const s of p.sections) {
      if ((s as any).app || !s.sub) { extra.push(s); continue; }
      let b = out.find((x) => x.key === s.sub);
      if (!b) {
        const sp = p.subparts.find((x) => x.id === s.sub);
        const [letter, title] = splitSub(sp?.title || `Subpart ${s.sub}`, s.sub!);
        b = { key: s.sub!, letter, title, secs: [] };
        out.push(b);
      }
      b.secs.push(s);
    }
    if (extra.length) out.push({ key: '_extra', letter: null, title: out.length ? 'Appendices and special rules' : 'Sections', secs: extra });
    return out;
  }, [p]);

  // Open the subpart we were sent to, or the one holding the section being read
  useEffect(() => {
    if (!blocks.length) return;
    const want = new Set(open);
    if (openSub) want.add(openSub);
    const holding = cur && blocks.find((b) => b.secs.some((s) => s.id === cur));
    if (holding) want.add(holding.key);
    if (blocks.length === 1) want.add(blocks[0].key);
    if (want.size !== open.size) save(want);
    if (openSub) requestAnimationFrame(() => document.getElementById('sp-' + part + '-' + openSub)?.scrollIntoView({ block: 'start' }));
  }, [blocks, openSub, cur]);

  // Keep the section being read in view
  useEffect(() => {
    if (!cur) return;
    requestAnimationFrame(() => (document.querySelector('.part-toc li.cur') as HTMLElement | null)?.scrollIntoView({ block: 'nearest' }));
  }, [cur, open]);

  function save(s: Set<string>) { setOpen(new Set(s)); ss.set(storeKey, [...s].join(',')); }
  const toggle = (k: string) => { const s = new Set(open); s.has(k) ? s.delete(k) : s.add(k); save(s); };

  if (!t) return <p class="muted pad">Loading…</p>;
  if (!p) return <div class="pad"><p>Part {part} isn't in this app yet.</p><button class="btn" onClick={() => go('browse')}>Back to Browse</button></div>;

  const f = q.trim().toLowerCase();
  const matches = f ? p.sections.filter((s) => (s.num + ' ' + s.title).toLowerCase().includes(f)) : [];
  const allOpen = blocks.every((b) => open.has(b.key));

  const row = (s: TocSection) => (
    <li class={(s.reserved ? 'reserved ' : '') + (cur === s.id ? 'cur' : '')}>
      <a href={`#/s/${s.id}`}><span class="num">{shortNum(s)}</span><span class="ttl">{s.title}</span></a>
    </li>
  );
  const listWithGroups = (secs: TocSection[]) => {
    const out: preact.JSX.Element[] = [];
    let g: string | undefined;
    for (const s of secs) {
      if (s.grp && s.grp !== g) { g = s.grp; out.push(<li class="grp-h" role="presentation">{g}</li>); }
      out.push(row(s));
    }
    return out;
  };

  return (
    <div class="part-toc">
      <header class="pane-head">
        <a class="back" href="#/browse" aria-label="Back to Browse"><Icon name="back" /></a>
        <div class="head-text">
          <h1>{is49 ? '49 CFR ' : ''}Part {p.part}</h1>
          <p class="sub-h">{p.title}</p>
        </div>
      </header>
      <div class="toc-tools">
        <input class="filter-input inline" type="search" value={q} placeholder={`Find in Part ${p.part}`} aria-label={`Find a section in Part ${p.part}`} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
        {!f && blocks.length > 1 && <button class="linkish small" onClick={() => save(allOpen ? new Set() : new Set(blocks.map((b) => b.key)))}>{allOpen ? 'Collapse all' : 'Expand all'}</button>}
      </div>

      {f ? (
        <ul class="list">{matches.length ? matches.map(row) : <li class="pad muted">No section titles in Part {p.part} match “{q}”. Try Search to look inside the text.</li>}</ul>
      ) : (
        blocks.map((b) => {
          const isOpen = open.has(b.key) || blocks.length === 1;
          const live = b.secs.filter((s) => !s.reserved);
          const first = live[0], last = live.at(-1);
          const range = first && last && /^\d/.test(first.num) ? (first === last ? first.num : `${first.num} to ${last.num}`) : `${live.length} items`;
          return (
            <section class={'sp' + (isOpen ? ' open' : '')} id={`sp-${part}-${b.key}`}>
              {blocks.length > 1 && (
                <button class="sp-row" aria-expanded={isOpen} onClick={() => toggle(b.key)}>
                  {b.letter ? <span class="sp-letter" aria-label={`Subpart ${b.letter}`}>{b.letter}</span> : <span class="sp-letter none" aria-hidden="true" />}
                  <span class="sp-text">
                    <span class="sp-title">{b.title}</span>
                    <span class="sp-meta">{range}</span>
                  </span>
                  <Icon name={isOpen ? 'up' : 'down'} size={18} />
                </button>
              )}
              {isOpen && <ul class="list sp-list">{listWithGroups(b.secs)}</ul>}
            </section>
          );
        })
      )}
    </div>
  );
}
