import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { VNode } from 'preact';
import { route, wide, toast, updateReady, go, type Tab, type Route } from './store';
import { Home } from './views/Home';
import { Browse, PartToc } from './views/Browse';
import { GuideView } from './views/Guides';
import { SearchView } from './views/Search';
import { Reader } from './views/Reader';
import { WhatsNew, DiffView } from './views/WhatsNew';
import { Mine } from './views/Mine';
import { SettingsView } from './views/Settings';
import { Review } from './views/Review';
import { Icon } from './icons';

const TABS: { id: Tab; label: string; icon: string; to: string }[] = [
  { id: 'home', label: 'Home', icon: 'home', to: '#/' },
  { id: 'browse', label: 'Browse', icon: 'book', to: '#/browse' },
  { id: 'search', label: 'Search', icon: 'search', to: '#/search' },
  { id: 'mine', label: 'My stuff', icon: 'bookmark', to: '#/mine' },
  { id: 'settings', label: 'Settings', icon: 'gear', to: '#/settings' },
];
const LIST_ROUTES = new Set(['home', 'browse', 'p', 'g', 'search', 'mine', 'settings', 'new']);
// 'review' opens like a reader page (over the list on narrow screens, on the right on wide ones)
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
  const isDoc = r.name === 's' || r.name === 'diff' || r.name === 'review';
  const [, rerender] = useState(0);
  const docRef = useRef<HTMLDivElement>(null);

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

  const docView = r.name === 's' ? <Reader id={r.arg} key={r.arg} /> : r.name === 'diff' ? <DiffView id={r.arg} key={r.arg} /> : r.name === 'review' ? <Review key="review" /> : null;

  // Page transitions on the narrow layout: the reader slides in over the list and slides
  // back out when you go back. The outgoing page stays mounted for the slide-out.
  const mem = useRef({ lastDoc: null as VNode | null, wasDoc: isDoc, leaveUntil: 0, skip: false, first: true });
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isDoc) mem.current.lastDoc = docView;
  if (!isDoc && mem.current.wasDoc && !wide.value) {
    mem.current.leaveUntil = mem.current.skip || reduce ? 0 : Date.now() + 260;
    mem.current.skip = false;
  }
  mem.current.wasDoc = isDoc;
  const leaving = !isDoc && Date.now() < mem.current.leaveUntil ? mem.current.lastDoc : null;
  useEffect(() => {
    if (leaving) { const t = setTimeout(() => rerender((n) => n + 1), 270); return () => clearTimeout(t); }
  }, [leaving]);
  const animate = !mem.current.first && !reduce;
  useEffect(() => { mem.current.first = false; }, []);

  const back = () => {
    if (history.length > 1) history.back();
    else { const l = lastList.get(curTab); location.hash = l ? '#/' + l.name + (l.arg ? '/' + l.arg : '') : '#/'; }
  };

  // Swipe from the left edge to go back (home-screen apps don't get Safari's gesture)
  const swipe = useRef<{ x: number; y: number; t: number; dx: number; on: boolean } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    const x = e.touches[0].clientX - (docRef.current?.getBoundingClientRect().left || 0);
    swipe.current = x <= 28 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), dx: 0, on: false } : null;
  };
  const onTouchMove = (e: TouchEvent) => {
    const s = swipe.current;
    const el = docRef.current;
    if (!s || !el) return;
    const dx = e.touches[0].clientX - s.x, dy = e.touches[0].clientY - s.y;
    if (!s.on) {
      if (Math.abs(dy) > Math.abs(dx) || dx < 6) { if (Math.abs(dy) > 10) swipe.current = null; return; }
      s.on = true;
    }
    s.dx = Math.max(0, dx);
    if (e.cancelable) e.preventDefault();
    el.style.transition = 'none';
    el.style.transform = `translateX(${s.dx}px)`;
    const list = listRef.current;
    if (list && !wide.value) {
      list.style.visibility = 'visible';
      list.style.animation = 'none';
      list.style.transform = `translateX(${-24 + (s.dx / el.clientWidth) * 24}%)`;
    }
  };
  const onTouchEnd = () => {
    const s = swipe.current;
    const el = docRef.current;
    swipe.current = null;
    if (!s || !s.on || !el) return;
    const list = listRef.current;
    const w = el.clientWidth;
    const fast = s.dx / Math.max(1, Date.now() - s.t) > 0.5;
    const goBack = s.dx > w * 0.33 || (fast && s.dx > 40);
    el.style.transition = 'transform .2s ease-out';
    el.style.transform = goBack ? `translateX(${w}px)` : '';
    if (list && !wide.value) { list.style.transition = 'transform .2s ease-out'; list.style.transform = goBack ? 'translateX(0)' : ''; }
    setTimeout(() => {
      if (goBack) { mem.current.skip = true; back(); }
      el.style.transition = ''; el.style.transform = '';
      if (list) { list.style.transition = ''; list.style.transform = ''; list.style.visibility = ''; list.style.animation = ''; }
    }, goBack ? 200 : 210);
  };
  // Keyboard shortcuts for when the iPad has a keyboard attached
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      const send = (a: string) => window.dispatchEvent(new CustomEvent('far:key', { detail: a }));
      const reading = route.value.name === 's';
      if ((mod && e.key.toLowerCase() === 'k') || (!typing && e.key === '/')) {
        e.preventDefault();
        go('search');
        setTimeout(() => { const i = document.querySelector('.search .omni input') as HTMLInputElement | null; i?.focus(); i?.select(); }, 60);
      } else if (mod && e.key.toLowerCase() === 'f' && reading) { e.preventDefault(); send('find'); }
      else if ((mod && e.key === '[') || (e.altKey && e.key === 'ArrowLeft')) { e.preventDefault(); back(); }
      else if (e.key === 'Escape') send('escape');
      else if (!typing && !mod && !e.altKey && reading) {
        if (e.key === 'ArrowRight') { e.preventDefault(); send('next'); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); send('prev'); }
        else if (e.key.toLowerCase() === 'r') send('speak');
        else if (e.key.toLowerCase() === 'b') send('bookmark');
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  });

  const swipeProps = { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd } as any;

  const body = wide.value ? (
    <div class="split">
      <aside class="pane" aria-label="Navigation" ref={listRef as any}>{pane(listR)}</aside>
      <main class="doc" ref={docRef as any} {...(docView ? swipeProps : {})}>{docView || <EmptyReader />}</main>
    </div>
  ) : (
    <main class="single">
      {/* The list stays mounted under the reader, so going back returns to the same spot */}
      <div class={'layer list-layer' + (isDoc ? (animate ? ' under anim' : ' under') : '') + (leaving ? ' returning' : '')} ref={listRef as any} aria-hidden={isDoc}>{pane(listR)}</div>
      {(isDoc || leaving) && (
        <div ref={docRef} class={'layer doc-layer' + (leaving ? ' leaving' : animate ? ' entering' : '')} {...swipeProps}>
          {isDoc ? docView : leaving}
        </div>
      )}
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
