import { useLayoutEffect, useRef } from 'preact/hooks';
import { route, wide, toast, updateReady, go, type Tab, type Route } from './store';
import { Home } from './views/Home';
import { Browse, PartToc } from './views/Browse';
import { GuideView } from './views/Guides';
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
const LIST_ROUTES = new Set(['home', 'browse', 'p', 'g', 'search', 'mine', 'settings', 'new']);
const tabOf = (n: string): Tab => (n === 'p' || n === 'g' ? 'browse' : (n as Tab));

// The last list screen per tab, so a tab comes back exactly as you left it
const lastList = new Map<Tab, Route>();
let currentTab: Tab = 'home';

// Scroll positions of list screens, kept for the session
const scrollMemo: Record<string, number> = (() => { try { return JSON.parse(sessionStorage.getItem('scroll') || '{}'); } catch { return {}; } })();
let saveTimer: number | undefined;
const remember = (k: string, y: number) => {
  scrollMemo[k] = y;
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => { try { sessionStorage.setItem('scroll', JSON.stringify(scrollMemo)); } catch { /* ignore */ } }, 300);
};

function keyOf(r: Route) {
  if (r.name === 'browse') return 'browse';
  if (r.name === 'search') return 'search?' + (r.query.get('q') || '');
  return r.name + '/' + r.arg;
}

// Puts a list's scroll position back after it re-renders (waits for content to load)
function useScrollKeeper(ref: { current: HTMLElement | null }, key: string) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = scrollMemo[key] || 0;
    let tries = 0;
    let raf = 0;
    const put = () => {
      el.scrollTop = target;
      if (Math.abs(el.scrollTop - target) > 2 && tries++ < 40) raf = requestAnimationFrame(put);
    };
    put();
    const on = () => remember(key, el.scrollTop);
    el.addEventListener('scroll', on, { passive: true });
    return () => { cancelAnimationFrame(raf); el.removeEventListener('scroll', on); };
  }, [key]);
}

function pane(r: Route) {
  switch (r.name) {
    case 'p': return <PartToc part={r.arg} openSub={r.query.get('sub')} key={'p' + r.arg} />;
    case 'g': return <GuideView id={r.arg} key={'g' + r.arg} />;
    case 'browse': return <Browse initial={r.query.get('d')} />;
    case 'search': return <SearchView urlQ={r.query.get('q') || ''} />;
    case 'mine': return <Mine />;
    case 'settings': return <SettingsView />;
    case 'new': return <WhatsNew />;
    default: return <Home />;
  }
}

export function App() {
  const r = route.value;
  const isDoc = r.name === 's' || r.name === 'diff';

  if (LIST_ROUTES.has(r.name)) {
    currentTab = tabOf(r.name);
    lastList.set(currentTab, r);
  }
  const curTab = currentTab;
  // Which list sits beside (or underneath) the reader
  let listR: Route = lastList.get(curTab) || { name: curTab, arg: '', query: new URLSearchParams() };
  // On the iPad in landscape, reading a regulation from Browse keeps its Part's contents alongside
  if (isDoc && wide.value && curTab === 'browse' && r.name === 's' && listR.name === 'browse') {
    if (/^\d/.test(r.arg)) listR = { name: 'p', arg: r.arg.split(/[.-]/)[0], query: new URLSearchParams() };
    else if (r.arg.startsWith('49cfr')) listR = { name: 'p', arg: '49-' + r.arg.slice(5).split(/[.-]/)[0], query: new URLSearchParams() };
  }

  const listRef = useRef<HTMLElement>(null);
  useScrollKeeper(listRef, keyOf(listR));

  const docView = r.name === 's' ? <Reader id={r.arg} key={r.arg} /> : r.name === 'diff' ? <DiffView id={r.arg} key={r.arg} /> : null;

  const body = wide.value ? (
    <div class="split">
      <aside class="pane" aria-label="Navigation" ref={listRef as any}>{pane(listR)}</aside>
      <main class="doc">{docView || <EmptyReader />}</main>
    </div>
  ) : (
    <main class="single">
      {/* The list stays mounted under the reader, so going back returns to the same spot */}
      <div class={'layer list-layer' + (isDoc ? ' under' : '')} ref={listRef as any} aria-hidden={isDoc}>{pane(listR)}</div>
      {isDoc && <div class="layer doc-layer">{docView}</div>}
    </main>
  );

  return (
    <div class={'app' + (wide.value ? ' is-wide' : '')}>
      {body}
      <nav class="tabbar" aria-label="Sections">
        {TABS.map((t) => {
          const last = lastList.get(t.id);
          const on = curTab === t.id && (wide.value || !isDoc);
          return (
            <a href={t.to} class={on ? 'on' : ''} aria-current={on ? 'page' : undefined}
               onClick={(e) => {
                 e.preventDefault();
                 // Tapping the tab you're on goes to its start; tapping another returns to where you were in it
                 if (curTab === t.id && !isDoc) go(t.to);
                 else if (last) location.hash = '#/' + last.name + (last.arg ? '/' + last.arg : '') + (last.query.toString() ? '?' + last.query.toString() : '');
                 else go(t.to);
               }}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </a>
          );
        })}
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
      <p>Type a number like <button class="linkish" onClick={() => go('s/91.155')}>91.155</button>, <button class="linkish" onClick={() => go('s/aim-3-2-4')}>3-2-4</button> or a few words into search, or start from a certificate guide in Browse.</p>
    </div>
  );
}
