// Tap-to-define: terms defined in 14 CFR 1.1 get a subtle underline (first use per section).
export interface Def { term: string; match: string; html: string }

let defsP: Promise<{ list: Def[]; re: RegExp | null; byKey: Map<string, number> }> | null = null;

export function loadDefs() {
  if (!defsP) {
    defsP = fetch(import.meta.env.BASE_URL + 'data/defs.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list: Def[]) => {
        const byKey = new Map<string, number>();
        list.forEach((d, i) => byKey.set(d.match.toLowerCase(), i));
        const terms = [...byKey.keys()].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
        const re = terms.length ? new RegExp(`(?<![\\p{L}\\p{N}-])(${terms.join('|')})(?:s|es)?(?![\\p{L}\\p{N}-])`, 'giu') : null;
        return { list, re, byKey };
      });
  }
  return defsP;
}

const SKIP = 'a, .def, .cite, mark.find, h4, th, figcaption';

// Wrap the first occurrence of each defined term in `root`
export async function markDefinitions(root: HTMLElement, sectionId: string) {
  if (sectionId === '1.1') return;
  const { re, byKey } = await loadDefs();
  if (!re || !root.isConnected) return;
  const used = new Set<string>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    let cur = node;
    let offset = 0;
    const text = node.data;
    while ((m = re.exec(text))) {
      const key = m[1].toLowerCase().replace(/\s+/g, ' ');
      if (used.has(key) || !byKey.has(key)) continue;
      used.add(key);
      const start = m.index - offset;
      const after = cur.splitText(start);
      const rest = after.splitText(m[0].length);
      const span = document.createElement('span');
      span.className = 'def';
      span.dataset.def = String(byKey.get(key));
      span.setAttribute('role', 'button');
      span.setAttribute('tabindex', '0');
      after.parentNode!.insertBefore(span, after);
      span.appendChild(after);
      cur = rest;
      offset = m.index + m[0].length;
    }
  }
}

export async function getDef(i: number) {
  const { list } = await loadDefs();
  return list[i];
}
