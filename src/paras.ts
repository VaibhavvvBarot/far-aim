// Paragraph citations inside a FAR section: works out that a paragraph is 91.213(d)(2),
// and a short "what it is" from the paragraph headings, for reg-number flashcards.
// FAR numbering: (a) letters, (1) numbers, (i) roman, (A) capitals, (1) italic numbers.

export interface Para { el: HTMLElement; cite: string; path: string[]; heading: string; text: string; outer?: boolean }

const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi', 'xvii', 'xviii', 'xix', 'xx', 'xxi', 'xxii', 'xxiii', 'xxiv', 'xxv'];
const LABEL = /^\s*\(([a-z]{1,5}|[A-Z]{1,2}|\d{1,3})\)/;

// Which level (0 letter, 1 number, 2 roman, 3 capital, 4 italic number) a label belongs to
function levelOf(tok: string, path: string[]): number {
  if (/^\d+$/.test(tok)) return path.length >= 4 && path[3] ? 4 : 1;
  if (/^[A-Z]+$/.test(tok)) return 3;
  const r = ROMAN.indexOf(tok);
  if (r >= 0 && path.length >= 2 && path[1]) {
    // "i" right after "h" is a letter; otherwise roman under a number
    const prevLetter = path[0];
    const isNextLetter = tok.length === 1 && prevLetter && prevLetter.length === 1 && tok.charCodeAt(0) === prevLetter.charCodeAt(0) + 1;
    const cur = path[2];
    const isNextRoman = r === 0 || (cur && ROMAN.indexOf(cur) === r - 1);
    if (isNextRoman && !(isNextLetter && path.length === 2 && r !== 0)) return 2;
  }
  return 0;
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// Read every labelled paragraph of a section body
export function paragraphs(root: HTMLElement, secNum: string): Para[] {
  const out: Para[] = [];
  let path: string[] = [];
  let heads: string[] = [];
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('p[class^="l"]'))) {
    const txt = el.textContent || '';
    const m = txt.match(LABEL);
    if (!m) continue;
    const lv = levelOf(m[1], path);
    path = [...path.slice(0, lv), m[1]];
    while (path.length < lv + 1) path.unshift('');
    heads = heads.slice(0, lv);
    const em = el.querySelector('em');
    const h = em && txt.indexOf(em.textContent || '') <= m[0].length + 1 ? clean(em.textContent || '').replace(/[.:]$/, '') : '';
    heads[lv] = h;
    // "(b) Pressurized cabin aircraft. (1) No person…" carries a second label inline
    let cpath = path.filter(Boolean);
    const rest = txt.slice(m[0].length).replace(h ? em!.textContent || '' : '', '');
    const inner = rest.match(/^\s*[.—–-]*\s*\((\d{1,3})\)/);
    if (inner && lv === 0) {
      // the paragraph is both (b) (its heading) and (b)(1) (its text)
      out.push({ el, cite: `${secNum}(${m[1]})`, path: [m[1]], heading: h, text: clean(rest), outer: true });
      path = [m[1], inner[1]]; cpath = path; heads[1] = '';
    }
    const body = clean(rest.replace(/^\s*[.—–-]*\s*\(\d{1,3}\)/, '').replace(/^\s*[.—–-]+\s*/, ''));
    out.push({ el, cite: `${secNum}${cpath.map((x) => `(${x})`).join('')}`, path: cpath, heading: inner && lv === 0 ? '' : h, text: body });
  }
  return out;
}

export function paragraphsFromHtml(html: string, secNum: string): Para[] {
  const div = document.createElement('div');
  div.innerHTML = html;
  return paragraphs(div, secNum);
}

// The paragraph that contains a node (e.g. the start of a text selection)
export function paraAt(root: HTMLElement, secNum: string, node: Node): Para | null {
  const el = (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest('p') as HTMLElement | null;
  if (!el) return null;
  const all = paragraphs(root, secNum);
  const here = all.filter((p) => p.el === el);
  // in "(b) Pressurized cabin aircraft. (1) No person…", the heading means (b), the rest (b)(1)
  if (here.length > 1) {
    const inHeading = (node.nodeType === 1 ? (node as HTMLElement) : node.parentElement)?.closest('em');
    return here.find((p) => !!p.outer === !!inHeading) || here[0];
  }
  if (here.length) return here[0];
  // a paragraph without its own label belongs to the labelled one above it
  let best: Para | null = null;
  for (const p of all) {
    if (p.el.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) best = p;
  }
  return best;
}

// A short description of a paragraph: its headings, else the start of its text (and of the
// paragraph above it), plus the first words of each item when it introduces a list
export function gist(sectionTitle: string, p: Para | null, all: Para[] = []): string {
  const title = sectionTitle.replace(/\.$/, '');
  if (!p) return title;
  const words = (s: string, n: number) => { const w = s.split(' '); return w.length > n ? w.slice(0, n).join(' ') + '…' : s; };
  const unexcept = (s: string) => s.replace(/^(Except|Unless|Notwithstanding)[^,]{0,160},\s*/i, (m) => '').replace(/^./, (c) => c.toUpperCase());
  const within = (x: Para, y: Para) => x.path.length > y.path.length && x.path.slice(0, y.path.length).join() === y.path.join();
  const ancestors = all.filter((x) => within(p, x));
  const heads = [...ancestors.map((x) => x.heading), p.heading].filter(Boolean);
  const kids = all.filter((x) => x.path.length === p.path.length + 1 && within(x, p));
  let lead = heads.length ? heads.join(' › ') : '';
  if (p.outer || (p.heading && p.path.length === 1)) return `${title}: ${lead}`;
  if (!lead && ancestors.length) lead = words(unexcept(ancestors[ancestors.length - 1].text).replace(/—$/, ''), 20);
  let own = words(unexcept(p.text), 18);
  if (/—$/.test(p.text) && kids.length) own = own.replace(/—$/, ': ') + kids.slice(0, 4).map((k) => words(k.text.replace(/[;,]? (and|or)$/, ''), 9)).join('; ') + (kids.length > 4 ? '; …' : '');
  return `${title}${lead ? `: ${lead}` : ''}${/…$/.test(lead) ? ' ' : '. '}${own}`;
}
