import { useEffect, useState } from 'preact/hooks';
import { toc, type Toc } from '../data';
import { GUIDES, type Guide } from '../guides';
import { route, wide } from '../store';
import { splitSub } from './Browse';
import { Icon } from '../icons';

export interface Resolved { href: string; num: string; title: string; meta?: string; doc: string; id?: string }

// Turn a guide item into a link using the current table of contents
export function resolve(t: Toc, item: string): Resolved | null {
  if (item.startsWith('sub:')) {
    const [, part, sub] = item.split(':');
    const p = t.far.find((x) => x.part === part);
    const sp = p?.subparts.find((x) => x.id === sub);
    if (!p || !sp) return null;
    const secs = p.sections.filter((s) => s.sub === sub && !s.reserved);
    const [, title] = splitSub(sp.title, sub);
    const range = secs.length ? `${secs[0].num} to ${secs.at(-1)!.num}` : '';
    return { href: `#/p/${part}?sub=${sub}`, num: `Part ${part} Subpart ${sub}`, title, meta: range, doc: 'far' };
  }
  if (item.startsWith('part:')) {
    const part = item.slice(5);
    const is49 = part.startsWith('49-');
    const p = (is49 ? t.t49 : t.far).find((x) => x.part === part.replace('49-', ''));
    if (!p) return null;
    return { href: `#/p/${part}`, num: `${is49 ? '49 CFR ' : ''}Part ${p.part}`, title: p.title, meta: `${p.sections.filter((s) => !s.reserved).length} sections`, doc: 'far' };
  }
  if (item.startsWith('aim:')) {
    const [ch, sec] = item.slice(4).split('-');
    const s = t.aim.find((c) => c.ch === ch)?.sections.find((x) => x.id === `aim-${ch}-${sec}`);
    if (!s || !s.paras.length) return null;
    return { href: `#/s/${s.paras[0].id}`, num: `AIM ${s.num}`, title: s.title, meta: `${s.paras.length} paragraphs`, doc: 'aim', id: s.paras[0].id };
  }
  if (item.startsWith('aim-')) {
    for (const c of t.aim) for (const s of c.sections) { const p = s.paras.find((x) => x.id === item); if (p) return { href: `#/s/${p.id}`, num: p.num, title: p.title, doc: 'aim', id: p.id }; }
    return null;
  }
  for (const [doc, list] of [['far', t.far], ['t49', t.t49]] as const) {
    for (const p of list) {
      const s = p.sections.find((x) => x.id === item);
      if (s && !s.reserved) return { href: `#/s/${s.id}`, num: doc === 'far' ? `§ ${s.num}` : `49 CFR ${s.num}`, title: s.title, doc, id: s.id };
    }
  }
  return null;
}

export function GuideList() {
  const certs = GUIDES.filter((g) => g.kind === 'cert');
  const topics = GUIDES.filter((g) => g.kind === 'topic');
  const card = (g: Guide) => (
    <li><a href={`#/g/${g.id}`} class="guide-row">
      <span class="g-title">{g.title}</span>
      <span class="g-blurb">{g.blurb}</span>
    </a></li>
  );
  return (
    <div class="guides">
      <h2 class="list-h">By certificate</h2>
      <ul class="list">{certs.map(card)}</ul>
      <h2 class="list-h">By topic</h2>
      <ul class="list">{topics.map(card)}</ul>
    </div>
  );
}

export function GuideView({ id }: { id: string }) {
  const g = GUIDES.find((x) => x.id === id);
  const [t, setT] = useState<Toc | null>(null);
  useEffect(() => { toc().then(setT); }, []);
  const cur = route.value.name === 's' ? route.value.arg : '';
  if (!g) return <p class="pad">That guide doesn't exist. <a href="#/browse">Back to Browse</a></p>;
  return (
    <div class="guide">
      <header class="pane-head">
        <a class="back" href="#/browse" aria-label="Back to Browse"><Icon name="back" /></a>
        <div class="head-text">
          <h1>{g.title}</h1>
          <p class="sub-h">{g.blurb}</p>
        </div>
      </header>
      {!t && <p class="muted pad">Loading…</p>}
      {t && g.groups.map((grp) => {
        const items = grp.items.map((i) => resolve(t, i)).filter((x): x is Resolved => !!x);
        if (!items.length) return null;
        return (
          <section>
            <h2 class="list-h">{grp.title}</h2>
            <ul class="list">
              {items.map((it) => (
                <li class={(it.id && it.id === cur ? 'cur ' : '') + (it.href.startsWith('#/p/') ? 'is-group' : '')}>
                  <a href={it.href} data-doc={it.doc}>
                    <span class="num">{it.num}</span>
                    <span class="ttl">{it.title}{it.meta && <span class="sub-count">{it.meta}</span>}</span>
                    {it.href.startsWith('#/p/') ? <Icon name="chevron" size={18} /> : <span />}
                  </a>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      {wide.value && <p class="muted pad small">Sections open on the right. Subparts open their full list here.</p>}
    </div>
  );
}
