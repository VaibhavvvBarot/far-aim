// Tap-to-define: terms defined in 14 CFR 1.1 get a subtle underline (first use per section).
// Terms from § 110.2 apply only inside the Parts listed with them (the air carrier Parts).
export interface Def { term: string; match: string; html: string; src?: string; parts?: string[] }
interface Scope { re: RegExp | null; byKey: Map<string, number> }

function makeScope(list: Def[], use: (d: Def) => boolean): Scope {
  const byKey = new Map<string, number>();
  list.forEach((d, i) => { if (use(d)) byKey.set(d.match.toLowerCase(), i); }); // later entries (110.2) win
  const terms = [...byKey.keys()].sort((a, b) => b.length - a.length).map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'));
  const re = terms.length ? new RegExp(`(?<![\\p{L}\\p{N}-])(${terms.join('|')})(?:s|es)?(?![\\p{L}\\p{N}-])`, 'giu') : null;
  return { re, byKey };
}

let defsP: Promise<{ list: Def[]; general: Scope; scoped: Map<string, Scope> }> | null = null;

export function loadDefs() {
  if (!defsP) {
    defsP = fetch(import.meta.env.BASE_URL + 'data/defs.json')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list: Def[]) => {
        const general = makeScope(list, (d) => !d.parts);
        const scoped = new Map<string, Scope>();
        const special = list.filter((d) => d.parts);
        if (special.length) {
          const sc = makeScope(list, () => true);
          for (const p of special[0].parts!) scoped.set(p, sc);
        }
        return { list, general, scoped };
      });
  }
  return defsP;
}

const SKIP = 'a, .def, .cite, mark.find, h4, th, figcaption';

// Wrap the first occurrence of each defined term in `root`
export async function markDefinitions(root: HTMLElement, sectionId: string, part?: string) {
  if (sectionId === '1.1' || sectionId === '110.2') return;
  const { general, scoped } = await loadDefs();
  const { re, byKey } = (part && scoped.get(part)) || general;
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
