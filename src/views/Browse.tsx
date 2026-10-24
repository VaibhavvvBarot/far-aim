import { useEffect, useMemo, useState } from 'preact/hooks';
import { toc, type Toc } from '../data';
import { route, go } from '../store';
import { Icon } from '../icons';

type D = 'far' | 'aim' | 'pcg' | 't49';
const SEGS: { id: D; label: string }[] = [
  { id: 'far', label: 'FAR' }, { id: 'aim', label: 'AIM' }, { id: 'pcg', label: 'Glossary' }, { id: 't49', label: 'NTSB 830' },
];

export function Browse() {
  const [t, setT] = useState<Toc | null>(null);
  const qd = route.value.query.get('d') as D | null;
  const [d, setD] = useState<D>(qd || (sessionStorage.getItem('browse') as D) || 'far');
  const [openCh, setOpenCh] = useState<string | null>(sessionStorage.getItem('aimCh'));
  const [openSec, setOpenSec] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  useEffect(() => { toc().then(setT); }, []);
  useEffect(() => { if (qd) setD(qd); }, [qd]);
  useEffect(() => { sessionStorage.setItem('browse', d); }, [d]);

  const pcgList = useMemo(() => {
    if (!t) return [];
    const f = filter.trim().toLowerCase();
    return f ? t.pcg.filter((x) => x.title.toLowerCase().includes(f)) : t.pcg;
  }, [t, filter]);

  return (
    <div class="browse">
      <header class="pane-head"><h1>Browse</h1></header>
      <div class="filters" role="tablist">
        {SEGS.map((s) => <button role="tab" aria-selected={d === s.id} class={'seg' + (d === s.id ? ' on' : '')} onClick={() => setD(s.id)}>{s.label}</button>)}
      </div>
      {!t && <p class="muted pad">Loading…</p>}
      {t && (d === 'far' || d === 't49') && (
        <ul class="list parts">
          {t[d].map((p) => (
            <li><a href={`#/p/${d === 't49' ? '49-' : ''}${p.part}`}>
              <span class="num">Part {p.part}</span>
              <span class="ttl">{p.title}</span>
              <span class="range">{p.sections.filter((s) => !s.reserved).length} sections</span>
            </a></li>
          ))}
        </ul>
      )}
      {t && d === 'aim' && (
        <ul class="list tree">
          {t.aim.map((c) => (
            <li class={openCh === c.ch ? 'open' : ''}>
              <button class="tree-row" aria-expanded={openCh === c.ch} onClick={() => { const v = openCh === c.ch ? null : c.ch; setOpenCh(v); sessionStorage.setItem('aimCh', v || ''); }}>
                <span class="num">{c.ch === 'app' ? 'App.' : `Ch ${c.ch}`}</span><span class="ttl">{c.title}</span><Icon name={openCh === c.ch ? 'up' : 'down'} size={18} />
              </button>
              {openCh === c.ch && (
                <ul>
                  {c.sections.map((s) => (
                    <li class={openSec === s.id ? 'open' : ''}>
                      {s.paras.length === 1 ? (
                        <a href={`#/s/${s.paras[0].id}`} class="tree-row sub"><span class="num">{s.num}</span><span class="ttl">{s.title}</span></a>
                      ) : (
                        <button class="tree-row sub" aria-expanded={openSec === s.id} onClick={() => setOpenSec(openSec === s.id ? null : s.id)}>
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

export function PartToc({ part }: { part: string }) {
  const [t, setT] = useState<Toc | null>(null);
  useEffect(() => { toc().then(setT); }, []);
  const is49 = part.startsWith('49-');
  const p = t && (is49 ? t.t49 : t.far).find((x) => x.part === part.replace('49-', ''));
  const cur = route.value.name === 's' ? route.value.arg : '';
  // Keep the section being read in view in the contents list
  useEffect(() => {
    if (!t || !cur) return;
    const el = document.querySelector('.part-toc li.cur');
    if (el) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
  }, [t, cur]);
  if (!t) return <p class="muted pad">Loading…</p>;
  if (!p) return <div class="pad"><p>Part {part} isn't in this app yet.</p><button class="btn" onClick={() => go('browse')}>Back to Browse</button></div>;
  const groups: { title: string | null; secs: typeof p.sections }[] = [];
  for (const s of p.sections) {
    const g = groups.at(-1);
    if (!g || g.title !== (s.sub || null)) groups.push({ title: s.sub || null, secs: [s] });
    else g.secs.push(s);
  }
  const subTitle = (id: string | null) => (id ? p.subparts.find((x) => x.id === id)?.title || `Subpart ${id}` : null);
  return (
    <div class="part-toc">
      <header class="pane-head">
        <a class="back" href="#/browse" aria-label="Back to Browse"><Icon name="back" /></a>
        <div>
          <h1>{is49 ? '49 CFR ' : ''}Part {p.part}</h1>
          <p class="sub-h">{p.title}</p>
        </div>
      </header>
      {groups.map((g) => (
        <section>
          {g.title && <h2 class="subpart">{subTitle(g.title)}</h2>}
          <ul class="list">
            {g.secs.map((s) => (
              <li class={(s.reserved ? 'reserved ' : '') + (cur === s.id ? 'cur' : '')}>
                <a href={`#/s/${s.id}`}><span class="num">{/^\d/.test(s.num) ? s.num : s.num.replace(/^Part \d+, /, '')}</span><span class="ttl">{s.title}</span></a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
