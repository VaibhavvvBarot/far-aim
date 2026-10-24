// Text anchoring for highlights. A highlight stores the exact text it covers
// plus a little text on each side, so it can be found again after the
// regulation text is updated (instead of drifting by character offset).

const CTX = 40;

function textNodes(root: Node): Text[] {
  const out: Text[] = [];
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest('.cite')) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  while (w.nextNode()) out.push(w.currentNode as Text);
  return out;
}

export function fullText(root: Node) {
  return textNodes(root).map((t) => t.data).join('');
}

// Character offset of (node, offset) inside root's text
function offsetOf(root: Node, node: Node, offset: number): number {
  let total = 0;
  for (const t of textNodes(root)) {
    if (t === node) return total + offset;
    total += t.data.length;
  }
  // node is an element: count text before it
  const r = document.createRange();
  r.setStart(root, 0);
  r.setEnd(node, offset);
  return r.toString().length;
}

export function describeSelection(root: HTMLElement, range: Range) {
  const text = fullText(root);
  const start = offsetOf(root, range.startContainer, range.startOffset);
  const end = offsetOf(root, range.endContainer, range.endOffset);
  if (end <= start) return null;
  return {
    exact: text.slice(start, end),
    prefix: text.slice(Math.max(0, start - CTX), start),
    suffix: text.slice(end, end + CTX),
  };
}

// Find the best match for an anchor in the current text
export function locate(text: string, a: { exact: string; prefix: string; suffix: string }): [number, number] | null {
  if (!a.exact) return null;
  const cands: number[] = [];
  let i = text.indexOf(a.exact);
  while (i >= 0 && cands.length < 50) { cands.push(i); i = text.indexOf(a.exact, i + 1); }
  if (!cands.length) {
    // whitespace-tolerant retry
    const norm = (s: string) => s.replace(/\s+/g, ' ');
    const nt = norm(text);
    if (nt.length === text.length) {
      const j = nt.indexOf(norm(a.exact));
      if (j >= 0) return [j, j + a.exact.length];
    }
    return null;
  }
  if (cands.length === 1) return [cands[0], cands[0] + a.exact.length];
  // Score by agreement of surrounding context
  const score = (p: number) => {
    let s = 0;
    const pre = text.slice(Math.max(0, p - a.prefix.length), p);
    const suf = text.slice(p + a.exact.length, p + a.exact.length + a.suffix.length);
    for (let k = 1; k <= Math.min(pre.length, a.prefix.length); k++) { if (pre[pre.length - k] === a.prefix[a.prefix.length - k]) s++; else break; }
    for (let k = 0; k < Math.min(suf.length, a.suffix.length); k++) { if (suf[k] === a.suffix[k]) s++; else break; }
    return s;
  };
  const best = cands.reduce((b, c) => (score(c) > score(b) ? c : b), cands[0]);
  return [best, best + a.exact.length];
}

// Wrap [start, end) of root's text in elements produced by make()
export function wrapRange(root: HTMLElement, start: number, end: number, make: () => HTMLElement): HTMLElement[] {
  const made: HTMLElement[] = [];
  let pos = 0;
  for (const t of textNodes(root)) {
    const len = t.data.length;
    const a = Math.max(start, pos);
    const b = Math.min(end, pos + len);
    if (a < b) {
      let node = t;
      if (a > pos) node = node.splitText(a - pos);
      if (b < pos + len) node.splitText(b - a);
      if (node.data.trim() || node.data.length) {
        const el = make();
        node.parentNode!.insertBefore(el, node);
        el.appendChild(node);
        made.push(el);
      }
    }
    pos += len;
    if (pos >= end) break;
  }
  return made;
}

export function unwrapAll(root: HTMLElement, selector: string) {
  root.querySelectorAll(selector).forEach((el) => {
    const parent = el.parentNode!;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
    parent.normalize();
  });
}

// Mark every occurrence of a term (for find-in-section); returns the marks in order
export function markAll(root: HTMLElement, terms: string | string[]): HTMLElement[] {
  unwrapAll(root, 'mark.find');
  const list = (Array.isArray(terms) ? terms : [terms]).map((t) => t.trim().toLowerCase()).filter((t) => t.length > 1);
  if (!list.length) return [];
  const text = fullText(root).toLowerCase();
  let spans: [number, number][] = [];
  for (const t of list) {
    let i = text.indexOf(t);
    while (i >= 0 && spans.length < 800) { spans.push([i, i + t.length]); i = text.indexOf(t, i + t.length); }
  }
  spans.sort((a, b) => a[0] - b[0]);
  // merge overlaps
  spans = spans.reduce<[number, number][]>((acc, s) => {
    const last = acc.at(-1);
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else acc.push([s[0], s[1]]);
    return acc;
  }, []);
  const out: HTMLElement[] = [];
  // wrap from the end so earlier offsets stay valid
  for (let k = spans.length - 1; k >= 0; k--) {
    const els = wrapRange(root, spans[k][0], spans[k][1], () => { const m = document.createElement('mark'); m.className = 'find'; return m; });
    out.unshift(...els.slice(0, 1));
  }
  return out;
}
