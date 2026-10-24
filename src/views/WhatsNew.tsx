import { useEffect, useState } from 'preact/hooks';
import { changes, label, docName, type Change } from '../data';
import { annotations, wide } from '../store';
import { kv } from '../db';
import { fmtDate } from './Home';
import { Icon } from '../icons';

function Ops({ ops }: { ops: [number, string][] }) {
  return (
    <p class="diff-text">
      {ops.map(([t, v]) => (t === 1 ? <ins>{v}</ins> : t === -1 ? <del>{v}</del> : <span>{v}</span>))}
    </p>
  );
}

export function WhatsNew() {
  const [list, setList] = useState<Change[] | null>(null);
  const [seen, setSeen] = useState('');
  useEffect(() => {
    (async () => {
      const s = (await kv.get<string>('seenChanges')) || '';
      setSeen(s);
      const c = await changes();
      setList(c);
      if (c.length) await kv.set('seenChanges', c[0].date);
    })();
  }, []);
  const marked = new Set(annotations.value.map((a) => a.sid));
  if (!list) return <p class="muted pad">Loading…</p>;

  const sorted = [...list].sort((a, b) => (b.date.localeCompare(a.date)) || (Number(marked.has(b.id)) - Number(marked.has(a.id))));
  const byDate = new Map<string, Change[]>();
  for (const c of sorted) { if (!byDate.has(c.date)) byDate.set(c.date, []); byDate.get(c.date)!.push(c); }

  return (
    <div class="whatsnew">
      <header class="pane-head">
        {!wide.value && <a class="back" href="#/" aria-label="Back to Home"><Icon name="back" /></a>}
        <h1>What's new</h1>
      </header>
      {!list.length && <p class="pad">No changes recorded yet. When the FAA or eCFR updates a section, it shows up here with the exact words that changed.</p>}
      {[...byDate].map(([date, items]) => (
        <section>
          <h2 class="date-h">Found {fmtDate(date)}{date > seen ? <span class="new-dot">New</span> : null}</h2>
          <ul class="list changes">
            {items.map((c) => (
              <li class={marked.has(c.id) ? 'mine' : ''}>
                <a href={c.kind === 'removed' ? `#/diff/${c.id}` : `#/diff/${c.id}`}>
                  <span class="r-top"><span class={'doc-tag ' + c.doc}>{docName(c.doc)}</span><span class="num">{label(c)}</span>{marked.has(c.id) && <span class="tag-mine">You marked this</span>}</span>
                  <span class="ttl">{c.title}</span>
                  <span class="kind">{c.kind === 'added' ? 'New section' : c.kind === 'removed' ? 'Removed' : 'Text changed'}{c.amended ? `, amended ${fmtDate(c.amended)}` : ''}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function DiffView({ id }: { id: string }) {
  const [list, setList] = useState<Change[] | null>(null);
  useEffect(() => { changes().then((c) => setList(c.filter((x) => x.id === id))); }, [id]);
  if (!list) return <div class="reader"><p class="muted pad">Loading…</p></div>;
  const first = list[0];
  return (
    <div class="reader">
      <div class="reader-bar">
        <button class="icon-btn" aria-label="Back" onClick={() => history.back()}><Icon name="back" /></button>
        <span class="bar-label">What changed</span>
      </div>
      <div class="reader-scroll">
        <article class="sheet">
          {!first && <p>No recorded changes for this section.</p>}
          {first && (
            <header class="sec-head">
              <p class="sec-num">{label(first)}</p>
              <h1 class="sec-title">{first.title}</h1>
              <p class="sec-meta"><a href={`#/s/${id}`}>Read the current text</a></p>
            </header>
          )}
          <p class="legend"><ins>Added words</ins> <del>Removed words</del></p>
          {list.map((c) => (
            <section class="diff-block">
              <h2 class="date-h">Found {fmtDate(c.date)}{c.amended ? `, amended ${fmtDate(c.amended)}` : ''}</h2>
              <Ops ops={c.ops} />
            </section>
          ))}
        </article>
      </div>
    </div>
  );
}
