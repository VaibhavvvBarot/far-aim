import { useEffect, useRef, useState } from 'preact/hooks';
import { search, searchIndex, parseJump, indexReady, label, docName, type Hit, type DocFilter } from '../data';
import { route, go } from '../store';
import { kv } from '../db';
import { Icon } from '../icons';

export function Omnibox({ onSubmit, initial = '', autofocus, onInput }: { onSubmit: (q: string) => void; initial?: string; autofocus?: boolean; onInput?: (q: string) => void }) {
  const [q, setQ] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { setQ(initial); }, [initial]);
  useEffect(() => { if (autofocus) ref.current?.focus(); }, []);
  const jump = parseJump(q);
  return (
    <form class="omni" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { onSubmit(q.trim()); ref.current?.blur(); } }}>
      <Icon name="search" size={20} />
      <input ref={ref} type="search" value={q} enterkeyhint="search" autocapitalize="off" autocorrect="off" spellcheck={false}
        placeholder="91.155, 3-2-4, or words" aria-label="Search or jump to a section"
        onInput={(e) => { const v = (e.target as HTMLInputElement).value; setQ(v); onInput?.(v); }} />
      {jump && <button type="submit" class="jump">Open {jump.kind === 'part' ? `Part ${jump.id}` : jump.id.replace(/^aim-/, 'AIM ')}</button>}
    </form>
  );
}

const FILTERS: { id: DocFilter; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'far', label: 'FAR' }, { id: 'aim', label: 'AIM' }, { id: 'pcg', label: 'Glossary' },
];

export function SearchView() {
  const urlQ = route.value.name === 'search' ? route.value.query.get('q') || '' : '';
  const [q, setQ] = useState(urlQ);
  const [filter, setFilter] = useState<DocFilter>('all');
  const [titles, setTitles] = useState(false);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(!indexReady);
  const [progress, setProgress] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [help, setHelp] = useState(false);
  const timer = useRef<number>();

  useEffect(() => { kv.get<string[]>('searches').then((r) => setRecent(r || [])); }, []);
  useEffect(() => { if (urlQ !== q) setQ(urlQ); }, [urlQ]);
  useEffect(() => {
    if (!indexReady) searchIndex((d, t) => setProgress(`${d} of ${t}`)).then(() => setLoading(false));
  }, []);

  // search as you type
  useEffect(() => {
    clearTimeout(timer.current);
    if (!q.trim()) { setHits(null); return; }
    timer.current = window.setTimeout(async () => {
      const res = await search(q, filter, titles);
      setHits(res);
    }, 120);
  }, [q, filter, titles, loading]);

  const remember = async (term: string) => {
    const list = [term, ...recent.filter((r) => r !== term)].slice(0, 20);
    setRecent(list);
    await kv.set('searches', list);
  };

  const jump = parseJump(q);
  const open = (id: string) => { remember(q.trim()); go(`s/${id}?find=${encodeURIComponent(q.replace(/"|(?:^|\s)-\S+|\sOR\s/g, ' ').trim())}`); };

  return (
    <div class="search">
      <header class="pane-head">
        <h1>Search</h1>
        <button class="linkish small" onClick={() => setHelp(!help)} aria-expanded={help}>{help ? 'Hide tips' : 'Search tips'}</button>
      </header>
      <Omnibox initial={q} autofocus onInput={setQ} onSubmit={(v) => {
        const j = parseJump(v);
        if (j) { remember(v); go(j.kind === 'part' ? `p/${j.id}` : `s/${j.id}`); }
        else { remember(v); history.replaceState(null, '', `#/search?q=${encodeURIComponent(v)}`); }
      }} />
      {help && (
        <div class="tips">
          <p><b>Jump:</b> type a number like 91.155, 61.57(c), 3-2-4 or part 135.</p>
          <p><b>Exact phrase:</b> "flight visibility"</p>
          <p><b>Either word:</b> fuel OR reserve</p>
          <p><b>Leave out:</b> currency -glider</p>
          <p>Partial words and small typos still match.</p>
        </div>
      )}
      <div class="filters" role="group" aria-label="Search in">
        {FILTERS.map((f) => <button class={'seg' + (filter === f.id ? ' on' : '')} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>)}
        <label class="toggle"><input type="checkbox" checked={titles} onChange={(e) => setTitles((e.target as HTMLInputElement).checked)} /> Titles only</label>
      </div>

      {loading && <p class="muted pad">Preparing search… {progress}</p>}

      {jump && (
        <a class="jump-card" href={jump.kind === 'part' ? `#/p/${jump.id}` : `#/s/${jump.id}`} onClick={() => remember(q.trim())}>
          Go to {jump.kind === 'part' ? `Part ${jump.id}` : jump.kind === 'aim' ? jump.id.replace('aim-', 'AIM ') : `§ ${jump.id}`}
        </a>
      )}

      {!q.trim() && recent.length > 0 && (
        <section class="block">
          <div class="block-head"><h2>Recent searches</h2><button class="linkish small" onClick={async () => { setRecent([]); await kv.set('searches', []); }}>Clear</button></div>
          <ul class="list plain">{recent.map((r) => <li><button class="row-btn" onClick={() => setQ(r)}>{r}</button></li>)}</ul>
        </section>
      )}

      {hits && !loading && (
        <>
          <p class="count">{hits.length ? `${hits.length === 200 ? '200+' : hits.length} results` : `No results for “${q}”. Try fewer words or check the spelling.`}</p>
          <ul class="results">
            {hits.map((h) => (
              <li>
                <button class="result" onClick={() => open(h.id)}>
                  <span class="r-top"><span class={'doc-tag ' + h.doc}>{docName(h.doc)}</span><span class="num">{label(h)}</span></span>
                  <span class="ttl">{h.title}</span>
                  <span class="snip" dangerouslySetInnerHTML={{ __html: h.snippet }} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
