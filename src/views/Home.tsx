import { useEffect, useState } from 'preact/hooks';
import { manifest, changes, type Manifest, type Change, parseJump, label } from '../data';
import { history, lastRead, go } from '../store';
import { kv } from '../db';
import { Omnibox } from './Search';
import { Icon } from '../icons';
import { dueCount } from './Review';
import { annotations } from '../store';

const CHIPS: { label: string; to: string }[] = [
  { label: 'Part 91', to: 'p/91' },
  { label: 'Part 61', to: 'p/61' },
  { label: 'AIM airspace', to: 's/aim-3-1-1' },
  { label: 'AIM ATC', to: 's/aim-4-1-1' },
  { label: 'VFR weather minimums', to: 's/91.155' },
  { label: 'Part 107', to: 'p/107' },
  { label: 'Glossary', to: 'browse?d=pcg' },
];

export function fmtDate(d?: string | null) {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const u = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (u) return new Date(+u[3], +u[1] - 1, +u[2]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return d;
}

export function Home() {
  const [m, setM] = useState<Manifest | null>(null);
  const [unseen, setUnseen] = useState<Change[]>([]);
  useEffect(() => {
    manifest().then(setM);
    (async () => {
      const seen = (await kv.get<string>('seenChanges')) || '';
      const list = await changes();
      setUnseen(list.filter((c) => c.date > seen));
    })();
  }, []);
  const [due, setDue] = useState<number | null>(null);
  const hlCount = annotations.value.filter((a) => a.type === 'hl').length;
  useEffect(() => { dueCount().then(setDue); }, [hlCount]);
  const recent = history.value.slice(0, 6);
  const lr = lastRead.value && history.value.find((h) => h.id === lastRead.value!.id);

  return (
    <div class="home">
      <header class="home-head">
        <h1 class="wordmark"><Icon name="plane" size={26} /> FAR/AIM</h1>
        <Omnibox autofocus={false} onSubmit={(q) => {
          const j = parseJump(q);
          if (j) go(j.kind === 'part' ? `p/${j.id}` : `s/${j.id}`);
          else go(`search?q=${encodeURIComponent(q)}`);
        }} />
      </header>

      <div class="chips" role="list">
        {CHIPS.map((c) => <a role="listitem" class="chip" href={'#/' + c.to}>{c.label}</a>)}
      </div>

      {lr && (
        <a class="continue" href={`#/s/${lr.id}`}>
          <span class="continue-k">Continue reading</span>
          <span class="continue-num">{label(lr)}</span>
          <span class="continue-title">{lr.title}</span>
        </a>
      )}

      {hlCount > 0 && (
        <a class="review-card" href="#/review">
          <Icon name="cards" size={26} />
          <span class="rc-text">
            <span class="rc-title">{due ? `${due} ${due === 1 ? 'card' : 'cards'} to review` : 'Review your highlights'}</span>
            <span class="rc-sub">{due ? 'Flashcards from your highlights' : 'All caught up. Practise any time.'}</span>
          </span>
          <Icon name="chevron" size={18} />
        </a>
      )}

      <section class="block">
        <div class="block-head"><h2>Study by certificate</h2><a href="#/browse?d=guides">All guides</a></div>
        <div class="guide-chips">
          {[['student', 'Student'], ['private', 'Private'], ['instrument', 'Instrument'], ['commercial', 'Commercial'], ['cfi', 'CFI'], ['remote', 'Drone']].map(([id, l]) => (
            <a class="chip strong" href={`#/g/${id}`}>{l}</a>
          ))}
        </div>
      </section>

      <section class="block">
        <div class="block-head">
          <h2>What's new</h2>
          <a href="#/new">See all</a>
        </div>
        {unseen.length ? (
          <a class="new-strip" href="#/new"><b>{unseen.length}</b> {unseen.length === 1 ? 'section changed' : 'sections changed'} since you last looked</a>
        ) : (
          <p class="muted">No changes since you last looked.</p>
        )}
      </section>

      {recent.length > 0 && (
        <section class="block">
          <div class="block-head"><h2>Recently read</h2></div>
          <ul class="list">
            {recent.map((h) => (
              <li><a href={`#/s/${h.id}`}><span class="num">{label(h)}</span><span class="ttl">{h.title}</span></a></li>
            ))}
          </ul>
        </section>
      )}

      {m && (
        <footer class="sources">
          <p>Regulations current as of <b>{fmtDate(m.sources.far.asOf)}</b> (eCFR). AIM and Glossary effective <b>{fmtDate(m.sources.aim.effective)}</b> ({m.sources.aim.change}).</p>
          <p>Last checked {new Date(m.checkedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.</p>
        </footer>
      )}
    </div>
  );
}
