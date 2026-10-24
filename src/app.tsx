import { useEffect } from 'preact/hooks';
import { route, tab, wide, toast, updateReady, go, type Tab } from './store';
import { Home } from './views/Home';
import { Browse, PartToc } from './views/Browse';
import { SearchView } from './views/Search';
import { Reader } from './views/Reader';
import { WhatsNew, DiffView } from './views/WhatsNew';
import { Mine } from './views/Mine';
import { SettingsView } from './views/Settings';
import { Icon } from './icons';

const TABS: { id: Tab; label: string; icon: string; to: string }[] = [
  { id: 'home', label: 'Home', icon: 'home', to: '#/' },
  { id: 'browse', label: 'Browse', icon: 'book', to: '#/browse' },
  { id: 'search', label: 'Search', icon: 'search', to: '#/search' },
  { id: 'mine', label: 'My stuff', icon: 'bookmark', to: '#/mine' },
  { id: 'settings', label: 'Settings', icon: 'gear', to: '#/settings' },
];

function paneFor(t: Tab) {
  switch (t) {
    case 'browse': {
      const r = route.value;
      if (r.name === 'p') return <PartToc part={r.arg} />;
      // While reading a regulation, keep its Part's contents beside it
      if (r.name === 's' && wide.value && /^\d/.test(r.arg)) return <PartToc part={r.arg.split(/[.-]/)[0]} />;
      if (r.name === 's' && wide.value && r.arg.startsWith('49cfr')) return <PartToc part={'49-' + r.arg.slice(5).split(/[.-]/)[0]} />;
      return <Browse />;
    }
    case 'search': return <SearchView />;
    case 'mine': return <Mine />;
    case 'settings': return <SettingsView />;
    case 'new': return <WhatsNew />;
    default: return <Home />;
  }
}

export function App() {
  const r = route.value;

  // Keep the left pane in sync with where the user navigated
  useEffect(() => {
    const n = r.name;
    if (n === 'home' || n === 'browse' || n === 'search' || n === 'mine' || n === 'settings' || n === 'new') tab.value = n as Tab;
    else if (n === 'p') tab.value = 'browse';
  }, [r.name, r.arg]);

  const isDoc = r.name === 's' || r.name === 'diff';
  const docView = r.name === 's' ? <Reader id={r.arg} key={r.arg} /> : r.name === 'diff' ? <DiffView id={r.arg} key={r.arg} /> : null;

  let body;
  if (wide.value) {
    body = (
      <div class="split">
        <aside class="pane" aria-label="Navigation">{paneFor(tab.value)}</aside>
        <main class="doc">{docView || <EmptyReader />}</main>
      </div>
    );
  } else {
    body = <main class="single">{isDoc ? docView : paneFor(tab.value)}</main>;
  }

  return (
    <div class={'app' + (wide.value ? ' is-wide' : '')}>
      {body}
      <nav class="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <a href={t.to} class={tab.value === t.id && !(isDoc && !wide.value) ? 'on' : ''} aria-current={tab.value === t.id ? 'page' : undefined}
             onClick={(e) => { if (tab.value === t.id && wide.value && !isDoc) { e.preventDefault(); } }}>
            <Icon name={t.icon} />
            <span>{t.label}</span>
          </a>
        ))}
      </nav>
      {toast.value && (
        <div class="toast" role="status">
          <span>{toast.value.text}</span>
          {toast.value.action && <button onClick={() => { toast.value!.action!.run(); toast.value = null; }}>{toast.value.action.label}</button>}
        </div>
      )}
      {updateReady.value && (
        <div class="toast update" role="status">
          <span>A new version of the regulations is ready.</span>
          <button onClick={() => updateReady.value!()}>Reload</button>
        </div>
      )}
    </div>
  );
}

function EmptyReader() {
  return (
    <div class="empty-reader">
      <p class="empty-title">Pick a section to read</p>
      <p>Type a number like <button class="linkish" onClick={() => go('s/91.155')}>91.155</button>, <button class="linkish" onClick={() => go('s/aim-3-2-4')}>3-2-4</button> or a few words into search.</p>
    </div>
  );
}
