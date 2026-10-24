// Fetches the FARs (eCFR), the AIM and the Pilot/Controller Glossary (FAA),
// turns them into small per-Part JSON "packs" for the app, and records
// word-level diffs for every section whose text changed since the last run.
//
// Usage: node scripts/build-data.mjs [--force]
//   --force  rebuild even if the eCFR / AIM dates have not moved

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as cheerio from 'cheerio';
import { diffWordsWithSpace } from 'diff';
import { FAR_PARTS, T49_PARTS } from './parts.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'data');
const IMG_OUT = path.join(ROOT, 'public', 'aim-img');
const ECFR = 'https://www.ecfr.gov/api/versioner/v1';
const AIM_BASE = 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/';
const PCG_BASE = 'https://www.faa.gov/air_traffic/publications/atpubs/pcg_html/';
const UA = 'far-aim-personal-reader/1.0 (+https://github.com/VaibhavvvBarot/far-aim)';
const FORCE = process.argv.includes('--force');
const MAX_CHANGES = 600;

// ---------- small helpers ----------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, { type = 'text', tries = 4 } = {}) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (type === 'json') return await res.json();
      if (type === 'buf') return Buffer.from(await res.arrayBuffer());
      return await res.text();
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1500 * i);
    }
  }
}
const readJSON = async (p, fallback) => {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
};
const writeJSON = (p, v) => fs.writeFile(p, JSON.stringify(v));
const hash = (s) => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);
const clean = (s) => s.replace(/\s+/g, ' ').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ---------- FAR (eCFR XML -> HTML) ----------
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii|xiii|xiv|xv|xvi|xvii|xviii|xix|xx|xxi|xxii|xxiii|xxiv|xxv)$/;

// Decide the outline level of a paragraph from its leading marker: (a)=1, (1)=2, (i)=3, (A)=4, (<i>1</i>)=5
function makeLeveler() {
  let lastLetter = null; // last level-1 letter seen
  let lastLevel = 0;
  return (marker, italicDigit) => {
    if (italicDigit) return (lastLevel = 5);
    if (/^\d+$/.test(marker)) return (lastLevel = 2);
    if (/^[A-Z]+$/.test(marker)) return (lastLevel = 4);
    if (/^[a-z]+$/.test(marker)) {
      const expected = lastLetter ? String.fromCharCode(lastLetter.charCodeAt(0) + 1) : 'a';
      if (ROMAN.test(marker)) {
        // ii, iii, iv ... are always roman. A lone i / v / x is roman when we are
        // already inside a numbered sub-paragraph, unless it is simply the next letter.
        if (marker.length > 1) return (lastLevel = 3);
        if (lastLevel === 3) return 3;
        if (lastLevel === 2 && marker !== expected) return (lastLevel = 3);
        if (lastLevel === 2 && marker === 'i') return (lastLevel = 3);
      }
      if (marker.length === 1) lastLetter = marker;
      return (lastLevel = 1);
    }
    return lastLevel || 0;
  };
}

function inlineXml($, el) {
  // Convert eCFR inline markup into HTML
  let out = '';
  $(el).contents().each((_, n) => {
    if (n.type === 'text') { out += esc(n.data); return; }
    if (n.type !== 'tag') return;
    const t = n.name.toUpperCase();
    const inner = inlineXml($, n);
    if (t === 'I') out += `<em>${inner}</em>`;
    else if (t === 'B') out += `<strong>${inner}</strong>`;
    else if (t === 'E') {
      const k = $(n).attr('T');
      if (k === '03' || k === '7462') out += `<em>${inner}</em>`;
      else if (k === '04') out += `<strong><em>${inner}</em></strong>`;
      else if (k === '01' || k === '02') out += `<strong>${inner}</strong>`;
      else if (k === '51' || k === '52') out += `<sub>${inner}</sub>`;
      else if (k === '53' || k === '54') out += `<sup>${inner}</sup>`;
      else out += inner;
    } else if (t === 'SU') out += `<sup>${inner}</sup>`;
    else if (t === 'FR') out += inner;
    else if (t === 'BR') out += '<br>';
    else if (t === 'IMG' || t === 'GID') {
      const src = $(n).attr('src') || $(n).text();
      if (src) out += `<a class="ext" href="https://www.ecfr.gov${src.startsWith('/') ? src : '/graphics/' + src}" target="_blank" rel="noopener">[figure]</a>`;
    } else out += inner;
  });
  return out;
}

function blockXml($, el, lev) {
  // Convert eCFR block children of a section/appendix into HTML
  let html = '';
  $(el).children().each((_, n) => {
    const t = n.name.toUpperCase();
    if (t === 'HEAD') return;
    if (t === 'P' || t === 'FP') {
      const inner = inlineXml($, n).trim();
      if (!inner) return;
      const m = inner.match(/^\((<em>)?([0-9]+|[a-z]+|[A-Z]+)(<\/em>)?\)/);
      const level = m ? lev(m[2], !!m[1] && /^\d+$/.test(m[2])) : 0;
      html += `<p class="l${level}">${inner}</p>`;
    } else if (t === 'HD1' || t === 'HD2' || t === 'HD3' || t === 'HED') {
      html += `<h4>${inlineXml($, n)}</h4>`;
    } else if (t === 'DIV' || t === 'NOTE' || t === 'EXTRACT') {
      const isTableWrap = $(n).find('TABLE').length && t === 'DIV';
      if (isTableWrap) {
        $(n).find('TABLE').each((__, tbl) => { html += tableXml($, tbl); });
      } else {
        html += `<blockquote>${blockXml($, n, lev)}</blockquote>`;
      }
    } else if (t === 'TABLE') {
      html += tableXml($, n);
    } else if (t === 'GPOTABLE') {
      html += tableXml($, n);
    } else if (t === 'CITA' || t === 'SOURCE' || t === 'AUTH' || t === 'SECAUTH' || t === 'EDNOTE' || t === 'EFFDNOT' || t === 'APPRO') {
      const txt = clean($(n).text());
      if (txt) html += `<p class="cite">${esc(txt)}</p>`;
    } else if (t === 'GPH' || t === 'IMG') {
      html += `<p>${inlineXml($, n) || ''}</p>`;
    } else {
      const inner = inlineXml($, n).trim();
      if (inner) html += `<p>${inner}</p>`;
    }
  });
  return html;
}

function tableXml($, tbl) {
  let h = '<div class="tbl"><table>';
  $(tbl).find('TR').each((_, tr) => {
    h += '<tr>';
    $(tr).children().each((__, c) => {
      const tag = c.name.toUpperCase() === 'TH' ? 'th' : 'td';
      const cls = ($(c).attr('class') || '').includes('indent') ? ' class="ind"' : '';
      h += `<${tag}${cls}>${inlineXml($, c).trim()}</${tag}>`;
    });
    h += '</tr>';
  });
  return h + '</table></div>';
}

// "GENERAL OPERATING AND FLIGHT RULES" -> "General Operating and Flight Rules"
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'without']);
const KEEP = new Set(['U.S.', 'FAA', 'ATC', 'IFR', 'VFR', 'NTSB', 'TSA', 'SFAR', 'II', 'III', 'A,', 'B,', 'C,', 'D,', 'E', 'D,']);
function titleCase(s) {
  if (s !== s.toUpperCase()) return s;
  const parts = s.toLowerCase().split(/(\s+)/);
  return parts.map((w, i) => {
    if (/^\s+$/.test(w)) return w;
    const up = w.toUpperCase();
    const prev = parts[i - 2] || '', prev2 = parts[i - 4] || '';
    // airspace class letters: "Class A, B, C, D, and E"
    const isClassLetter = /^[a-e][,;]?$/.test(w) && (/[,;]$/.test(w) || /[,;]$/.test(prev) || prev === 'class' || /[,;]$/.test(prev2));
    if (KEEP.has(up) && up.length > 2) return up;
    if (isClassLetter) return up;
    if (i > 0 && SMALL.has(w.replace(/[^a-z]/g, ''))) return w;
    return w.replace(/^([("']?)(\p{L})/u, (m, p, c) => p + c.toUpperCase()).replace(/-(\p{L})/gu, (m, c) => '-' + c.toUpperCase());
  }).join('');
}

// Plain text for diffs: keep paragraph breaks, space out table cells
function textOf(html) {
  const spaced = html
    .replace(/<\/(p|tr|li|h\d|blockquote|figcaption)>/gi, '$&\n')
    .replace(/<\/(td|th)>/gi, ' ¦$&') // marker kept inside the cell (text between cells would be moved by the HTML parser)
    .replace(/<br\s*\/?>/gi, '\n');
  return cheerio.load(spaced).text()
    .split('\n').map((l) => l.replace(/\s*¦\s*/g, ' | ').replace(/[ \t]+/g, ' ').replace(/(\s*\|\s*)+$/, '').replace(/(\|\s*)+\|/g, '|').trim()).filter(Boolean).join('\n');
}

async function fetchFarPart(title, part, date) {
  const xml = await get(`${ECFR}/full/${date}/title-${title}.xml?part=${part}`);
  const $ = cheerio.load(xml, { xmlMode: true });
  const partHead = titleCase(clean($('DIV5').first().children('HEAD').text()).replace(/^PART\s+\S+\s*[—-]\s*/i, ''));
  const sections = [];
  const subparts = [];
  const visit = (node, subpart, grp) => {
    $(node).children().each((_, n) => {
      const t = n.name.toUpperCase();
      if (t === 'DIV6') {
        const head = clean($(n).children('HEAD').text());
        const sp = { id: $(n).attr('N'), title: titleCase(head) };
        subparts.push({ id: sp.id, title: sp.title, first: null });
        visit(n, sp, null);
      } else if (t === 'DIV7') {
        // undesignated center heading inside a subpart, e.g. "Visual Flight Rules" in Part 91 Subpart B
        visit(n, subpart, titleCase(clean($(n).children('HEAD').text())));
      } else if (t === 'DIV8') {
        const num = $(n).attr('N');
        const head = clean($(n).children('HEAD').text()).replace(/^§+\s*[\d.a-zA-Z-]+\s*/, '');
        const lev = makeLeveler();
        const html = blockXml($, n, lev);
        const reserved = /\[Reserved\]/i.test(head) && !html.replace(/<p class="cite">.*?<\/p>/g, '').trim();
        const sec = {
          id: `${title === 14 ? '' : title + 'cfr'}${num}`,
          doc: title === 14 ? 'far' : 't49',
          num, title: head, part: String(part), sub: subpart ? subpart.id : null,
          grp: grp || undefined,
          html, reserved,
        };
        sections.push(sec);
        const sp = subparts.at(-1);
        if (sp && !sp.first) sp.first = sec.id;
      } else if (t === 'DIV9') {
        const head = clean($(n).children('HEAD').text());
        const n9 = $(n).attr('N') || head;
        const lev = makeLeveler();
        const slug = /^Special Federal Aviation Regulation No\.?\s*([\d-]+)/i.test(n9)
          ? 'SFAR' + n9.match(/No\.?\s*([\d-]+)/i)[1]
          : n9.replace(/^Appendix\s+/i, 'App').replace(/\s+to Part.*$/i, '').replace(/[^A-Za-z0-9]+/g, '');
        let id = `${title === 14 ? '' : title + 'cfr'}${part}-${slug}`;
        while (sections.some((s) => s.id === id)) id += 'x';
        sections.push({
          id,
          doc: title === 14 ? 'far' : 't49',
          num: slug.startsWith('SFAR') ? `SFAR ${slug.slice(4)}` : `Part ${part}, ${n9.replace(/ to Part \d+.*/i, '')}`,
          title: head.replace(/^Special Federal Aviation Regulation No\.?\s*[\d-]+\s*[—-]\s*/i, '').replace(/^Appendix(es)? [A-Z0-9-]+( - [A-Z0-9-]+)? to Part \d+\s*[—-]?\s*/i, '') || head,
          part: String(part), sub: subpart ? subpart.id : null,
          html: blockXml($, n, lev), appendix: true,
        });
      } else if (t === 'DIV5') visit(n, subpart, grp);
    });
  };
  visit($.root(), null, null);
  return { partTitle: partHead, sections, subparts };
}

async function fetchAmendDates(title, part) {
  // Latest substantive amendment date per section (eCFR history starts in 2017)
  try {
    const j = await get(`${ECFR}/versions/title-${title}.json?part=${part}`, { type: 'json' });
    const m = {};
    for (const v of j.content_versions || []) {
      if (!v.substantive) continue;
      const d = v.amendment_date;
      if (!m[v.identifier] || m[v.identifier] < d) m[v.identifier] = d;
    }
    return m;
  } catch (e) {
    console.warn(`  versions for part ${part} failed: ${e.message}`);
    return {};
  }
}

// ---------- AIM (FAA HTML) ----------
async function fetchAim(prevImgs) {
  const idx = await get(AIM_BASE);
  const $i = cheerio.load(idx);
  const eff = clean($i('p:contains("Effective:")').first().text()).replace(/Effective:\s*/, '');
  const change = clean($i('p:contains("Change:")').first().text()).replace(/Change:\s*/, '');
  const pages = [];
  $i('a[href]').each((_, a) => {
    const h = $i(a).attr('href').replace(/^\.\//, '');
    if (/^(chap\d+_section_\d+|appendix_\d+)\.html$/.test(h) && !pages.includes(h)) pages.push(h);
  });
  const chapters = {}; // chapter number -> {title, sections:[...]}
  const paras = [];
  const imgs = new Set();
  const xrefMap = {}; // "chap3_section_2.html#3-2-1" -> "aim-3-2-1"
  for (const page of pages) {
    const html = await get(AIM_BASE + page);
    const $ = cheerio.load(html);
    const art = $('main article').first();
    const chapTitle = clean(art.find('h1.chapter-title').first().text()).replace(/^Chapter\s+\d+\.\s*/, '');
    const secTitle = clean(art.find('h2.section-title').first().text());
    const isApp = page.startsWith('appendix');
    const chNum = isApp ? 'app' : page.match(/chap(\d+)/)[1];
    if (!chapters[chNum]) chapters[chNum] = { title: isApp ? 'Appendices' : chapTitle, sections: [] };
    const secNum = isApp ? page.match(/appendix_(\d+)/)[1] : page.match(/section_(\d+)/)[1];
    const secLabel = isApp ? clean(art.find('h1,h2').first().text()) : secTitle.replace(/^Section\s+\d+\.\s*/, '');
    const secId = isApp ? `aim-app${secNum}` : `aim-${chNum}-${secNum}`;
    chapters[chNum].sections.push({ id: secId, num: isApp ? `Appendix ${secNum}` : `${chNum}-${secNum}`, title: secLabel, paras: [] });

    // images: rewrite to our copy
    art.find('img').each((_, im) => {
      const src = $(im).attr('src') || '';
      const file = src.split('/').pop();
      if (!file) return;
      imgs.add(file);
      $(im).attr('src', `aim-img/${file}`).attr('loading', 'lazy');
      $(im).removeAttr('width').removeAttr('height').removeAttr('style');
    });
    art.find('script,style,.toolbar,nav').remove();

    const titles = art.find('h4.paragraph-title');
    if (titles.length === 0) {
      // Whole page is one unit (e.g. appendix)
      const body = art.find('.body').first().length ? art.find('.body').first() : art;
      const pid = secId;
      paras.push({ id: pid, doc: 'aim', num: isApp ? `AIM Appendix ${secNum}` : `AIM ${chNum}-${secNum}`, title: secLabel, ch: chNum, sec: secId, html: $.html(body.children()) });
      chapters[chNum].sections.at(-1).paras.push(pid);
      xrefMap[page] = pid;
      continue;
    }
    titles.each((_, h4) => {
      const num = $(h4).attr('id') || clean($(h4).text()).split(/\.\s/)[0];
      const title = clean($(h4).text()).replace(/^[\d-]+\.\s*/, '');
      // collect siblings until next h4 (siblings may be at the same level within .body)
      let bodyHtml = '';
      let n = $(h4).next();
      while (n.length && !n.is('h4.paragraph-title')) {
        bodyHtml += $.html(n);
        n = n.next();
      }
      const pid = `aim-${num}`;
      paras.push({ id: pid, doc: 'aim', num: `AIM ${num}`, title, ch: chNum, sec: secId, html: bodyHtml });
      chapters[chNum].sections.at(-1).paras.push(pid);
      xrefMap[`${page}#${num}`] = pid;
      if (!xrefMap[page]) xrefMap[page] = pid;
    });
    await sleep(150);
  }
  // Rewrite internal AIM links to app links
  for (const p of paras) {
    const $ = cheerio.load(p.html, null, false);
    $('a[href]').each((_, a) => {
      const href = $(a).attr('href');
      const local = href.replace(/^\.\//, '').replace(/^https?:\/\/www\.faa\.gov\/air_traffic\/publications\/atpubs\/aim_html\//, '');
      let target = xrefMap[local] || xrefMap[local.split('#')[0]];
      if (!target && /#(\d+-\d+-\d+)/.test(local)) target = `aim-${local.match(/#(\d+-\d+-\d+)/)[1]}`;
      if (target) $(a).attr('href', `#/s/${target}`).attr('class', 'xref');
      else if (/^https?:/.test(href)) $(a).attr('target', '_blank').attr('rel', 'noopener');
      else $(a).replaceWith($(a).html() || '');
    });
    $('[id]').removeAttr('id');
    p.html = $.html();
  }
  // Download figures we do not already have, shrink them to iPad-friendly WebP
  await fs.mkdir(IMG_OUT, { recursive: true });
  const sharp = (await import('sharp')).default;
  let fetched = 0;
  const outNames = new Map();
  for (const f of imgs) {
    const outName = f.replace(/\.[a-z]+$/i, '') + '.webp';
    outNames.set(f, outName);
    const dest = path.join(IMG_OUT, outName);
    if (prevImgs.has(outName)) { try { await fs.access(dest); continue; } catch { /* missing */ } }
    try {
      const buf = await get(AIM_BASE + 'images/' + f, { type: 'buf' });
      const out = await sharp(buf, { density: 150, limitInputPixels: false })
        .resize({ width: 1600, withoutEnlargement: true }).flatten({ background: '#ffffff' })
        .webp({ quality: 78 }).toBuffer();
      await fs.writeFile(dest, out);
      fetched++;
    } catch (e) { console.warn(`  image ${f}: ${e.message}`); }
  }
  for (const p of paras) {
    p.html = p.html.replace(/aim-img\/([^"']+)/g, (m, f) => `aim-img/${outNames.get(f) || f}`);
  }
  // remove figures no longer used
  const keep = new Set(outNames.values());
  for (const f of await fs.readdir(IMG_OUT)) if (!keep.has(f)) await fs.unlink(path.join(IMG_OUT, f));
  console.log(`  AIM: ${paras.length} paragraphs, ${imgs.size} figures (${fetched} converted)`);
  return { effective: eff, change, chapters, paras, imgs: [...keep] };
}

// ---------- Pilot/Controller Glossary ----------
async function fetchPcg() {
  const letters = 'abcdefghijklmnopqrstuvw'.split('');
  const terms = [];
  for (const L of letters) {
    let html;
    try { html = await get(`${PCG_BASE}glossary-${L}.html`); } catch { continue; }
    const $ = cheerio.load(html);
    let cur = null;
    $('article.pcg-content > p').each((_, p) => {
      const el = $(p);
      if (el.hasClass('glossary-term-entry')) {
        const name = clean(el.find('dfn').first().text()).replace(/[-–‐]\s*$/, '').trim();
        el.find('dfn').remove();
        const def = el.html().replace(/^\s*[-–‐]\s*/, '').trim();
        cur = { name, html: def ? `<p>${def}</p>` : '' };
        terms.push(cur);
      } else if (cur && (el.hasClass('glossary-cross-reference') || el.hasClass('CLASS_14') || el.hasClass('CLASS_13') || el.text().trim())) {
        if (el.find('font[size="+4"]').length) return;
        el.find('a').each((__, a) => {
          const dt = $(a).attr('data-term');
          if (dt) $(a).attr('href', `#/s/pcg-${dt}`).attr('class', 'xref').removeAttr('data-definition');
          else $(a).attr('target', '_blank').attr('rel', 'noopener');
        });
        el.find('.sr-only').remove();
        cur.html += `<p class="${el.hasClass('glossary-cross-reference') ? 'see' : ''}">${el.html().trim()}</p>`;
      }
    });
    await sleep(100);
  }
  const out = terms.filter((t) => t.name).map((t) => ({
    id: `pcg-${t.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    doc: 'pcg', num: 'P/CG', title: t.name, html: t.html,
  }));
  // de-duplicate ids
  const seen = new Map();
  for (const t of out) {
    const n = seen.get(t.id) || 0;
    seen.set(t.id, n + 1);
    if (n) t.id += `_${n + 1}`;
  }
  console.log(`  P/CG: ${out.length} terms`);
  return out;
}

// ---------- cross-reference linking for FAR text ----------
function linkFar(html, known) {
  // § 91.155, §§ 91.155 and 91.157, 91.155(b), "part 61", "14 CFR 91.3"
  const link = (num, label) => (known.has(num) ? `<a class="xref" href="#/s/${num}">${label}</a>` : label);
  html = html.replace(/(§§?\s*)((?:\d{1,3}\.\d+[a-z]?(?:\([a-zA-Z0-9]+\))*(?:,\s*|\s+(?:and|or|through)\s+)?)+)/g, (m, sig, list) =>
    sig + list.replace(/(\d{1,3}\.\d+[a-z]?)((?:\([a-zA-Z0-9]+\))*)/g, (mm, n, p) => link(n, n + p)));
  html = html.replace(/(14 CFR (?:section |§\s*)?)(\d{1,3}\.\d+[a-z]?)/gi, (m, pre, n) => pre + link(n, n));
  html = html.replace(/\b([Pp]arts?\s+)(\d{1,3})\b(?![.\d])/g, (m, pre, n) => (known.has(`part-${n}`) ? `${pre}<a class="xref" href="#/p/${n}">${n}</a>` : m));
  return html;
}
function linkAim(html, known) {
  // Section numbers count as regulation references only when "CFR", "§" or "section" appears
  // shortly before them (so radio frequencies like 135.25 are left alone).
  html = html.replace(/(\d{1,3})\.(\d{1,4}[a-z]?)\b/g, (m, a, b, off, str) => {
    const n = `${a}.${b}`;
    if (!known.has(n)) return m;
    const before = str.slice(Math.max(0, off - 90), off);
    if (!/(CFR|§|[Ss]ections?|FAR)\b(?:(?!\.\s)[\s\S])*$/.test(before)) return m;
    return `<a class="xref" href="#/s/${n}">${m}</a>`;
  });
  html = html.replace(/(14 CFR [Pp]art\s+)(\d{1,3})\b/g, (m, pre, n) => (known.has(`part-${n}`) ? `${pre}<a class="xref" href="#/p/${n}">${n}</a>` : m));
  return html;
}
// Only link inside text nodes, never inside existing tags/anchors
function linkOutsideTags(html, fn) {
  return html.split(/(<a\b[^>]*>.*?<\/a>|<[^>]+>)/s).map((chunk) => (chunk.startsWith('<') ? chunk : fn(chunk))).join('');
}

// ---------- diffs ----------
function compactDiff(a, b) {
  const parts = diffWordsWithSpace(a, b);
  const ops = [];
  for (const p of parts) {
    const t = p.added ? 1 : p.removed ? -1 : 0;
    let v = p.value;
    if (t === 0 && v.length > 360) {
      // keep context around changes only
      const words = v.split(/(?<=\s)/);
      if (words.length > 50) v = words.slice(0, 22).join('') + ' …\n… ' + words.slice(-22).join('');
    }
    ops.push([t, v]);
  }
  if (ops.length && ops[0][0] === 0) { const w = ops[0][1].split(/(?<=\s)/); if (w.length > 25) ops[0][1] = '… ' + w.slice(-22).join(''); }
  const last = ops.at(-1);
  if (last && last[0] === 0) { const w = last[1].split(/(?<=\s)/); if (w.length > 25) last[1] = w.slice(0, 22).join('') + ' …'; }
  return ops;
}

// ---------- main ----------
async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const prevManifest = await readJSON(path.join(OUT, 'manifest.json'), null);
  const prevChanges = await readJSON(path.join(OUT, 'changes.json'), []);

  const titles = await get(`${ECFR}/titles.json`, { type: 'json' });
  const t14 = titles.titles.find((t) => t.number === 14);
  const t49 = titles.titles.find((t) => t.number === 49);
  const ecfrAsOf = t14.up_to_date_as_of;
  const ecfrDate14 = t14.latest_issue_date > t14.up_to_date_as_of ? t14.up_to_date_as_of : t14.latest_issue_date;
  const ecfrDate49 = t49.latest_issue_date > t49.up_to_date_as_of ? t49.up_to_date_as_of : t49.latest_issue_date;

  const aimIdx = await get(AIM_BASE);
  const aimEff = clean(cheerio.load(aimIdx)('p:contains("Effective:")').first().text()).replace(/Effective:\s*/, '');

  const regsChanged = !prevManifest || prevManifest.sources.far.issued !== t14.latest_issue_date || prevManifest.sources.t49.issued !== t49.latest_issue_date;
  const aimChanged = !prevManifest || prevManifest.sources.aim.effective !== aimEff;
  const wantedParts = JSON.stringify([FAR_PARTS, T49_PARTS]);
  const partsChanged = !prevManifest || prevManifest.partsKey !== wantedParts;
  console.log(`eCFR Title 14 issued ${t14.latest_issue_date} (as of ${ecfrAsOf}); AIM effective ${aimEff}`);

  if (!FORCE && !regsChanged && !aimChanged && !partsChanged) {
    // Only the "checked" date moves
    prevManifest.checkedAt = new Date().toISOString();
    prevManifest.sources.far.asOf = ecfrAsOf;
    prevManifest.sources.t49.asOf = t49.up_to_date_as_of;
    await writeJSON(path.join(OUT, 'manifest.json'), prevManifest);
    console.log('No content changes. Updated check time only.');
    return;
  }

  // Load previous packs for diffing
  const prevText = new Map();
  const prevImgs = new Set();
  if (prevManifest) {
    for (const p of prevManifest.packs) {
      const pack = await readJSON(path.join(OUT, p.file), null);
      if (pack) for (const s of pack.sections) prevText.set(s.id, { text: textOf(s.html), title: s.title });
    }
    for (const f of prevManifest.aimImages || []) prevImgs.add(f);
  }

  const packs = [];
  const all = [];

  // FAR + Title 49
  const farToc = [];
  for (const [title, parts, date] of [[14, FAR_PARTS, ecfrDate14], [49, T49_PARTS, ecfrDate49]]) {
    for (const part of parts) {
      process.stdout.write(`Fetching ${title} CFR Part ${part}... `);
      const { partTitle, sections, subparts } = await fetchFarPart(title, part, date);
      const amended = await fetchAmendDates(title, part);
      for (const s of sections) {
        if (amended[s.num]) s.amended = amended[s.num];
      }
      console.log(`${sections.length} sections`);
      const file = `${title === 14 ? 'far' : 't49'}-${part}.json`;
      packs.push({ id: `${title}-${part}`, doc: title === 14 ? 'far' : 't49', part: String(part), title: partTitle, file, sections });
      farToc.push({ doc: title === 14 ? 'far' : 't49', part: String(part), title: partTitle, subparts,
        sections: sections.map((s) => ({ id: s.id, num: s.num, title: s.title, sub: s.sub, grp: s.grp, reserved: s.reserved || undefined, app: s.appendix || undefined })) });
      all.push(...sections);
      await sleep(250);
    }
  }

  // AIM
  console.log('Fetching AIM...');
  const aim = await fetchAim(prevImgs);
  const aimToc = [];
  for (const [ch, c] of Object.entries(aim.chapters)) {
    const secs = aim.paras.filter((p) => p.ch === ch);
    packs.push({ id: `aim-${ch}`, doc: 'aim', part: ch, title: c.title, file: `aim-${ch}.json`, sections: secs });
    aimToc.push({ ch, title: c.title, sections: c.sections.map((s) => ({ ...s, paras: s.paras.map((pid) => { const p = aim.paras.find((x) => x.id === pid); return { id: pid, num: p.num, title: p.title }; }) })) });
    all.push(...secs);
  }

  // P/CG
  console.log('Fetching Pilot/Controller Glossary...');
  const pcg = await fetchPcg();
  packs.push({ id: 'pcg', doc: 'pcg', part: 'pcg', title: 'Pilot/Controller Glossary', file: 'pcg.json', sections: pcg });
  all.push(...pcg);

  // Cross-links
  const known = new Set(all.map((s) => s.id));
  for (const p of FAR_PARTS) known.add(`part-${p}`);
  for (const s of all) {
    if (s.doc === 'far') s.html = linkOutsideTags(s.html, (t) => linkFar(t, known));
    else if (s.doc === 'aim') s.html = linkOutsideTags(s.html, (t) => linkAim(t, known));
  }

  // Diffs against the previous build
  const now = new Date().toISOString().slice(0, 10);
  const newChanges = [];
  if (prevManifest) {
    for (const s of all) {
      const before = prevText.get(s.id);
      const afterText = textOf(s.html);
      if (!before) {
        if (s.doc !== 'pcg' || prevText.size) newChanges.push({ id: s.id, doc: s.doc, num: s.num, title: s.title, date: now, amended: s.amended || null, kind: 'added', ops: [[1, afterText.slice(0, 600)]] });
        continue;
      }
      if (before.text !== afterText) {
        newChanges.push({ id: s.id, doc: s.doc, num: s.num, title: s.title, date: now, amended: s.amended || null, kind: 'changed', ops: compactDiff(before.text, afterText) });
      }
    }
    for (const [id, b] of prevText) {
      if (!known.has(id)) newChanges.push({ id, doc: id.startsWith('aim') ? 'aim' : id.startsWith('pcg') ? 'pcg' : 'far', num: id, title: b.title, date: now, kind: 'removed', ops: [[-1, b.text.slice(0, 600)]] });
    }
  }
  // Ignore pure-whitespace or formatting noise from a reparse with identical text is already excluded.
  const changes = [...newChanges, ...prevChanges].slice(0, MAX_CHANGES);
  for (const c of newChanges) {
    const s = all.find((x) => x.id === c.id);
    if (s) s.changed = now;
  }
  // carry "changed" stamps forward from previous changes (last 60 days)
  const cutoff = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  const recent = new Map();
  for (const c of prevChanges) if (c.date >= cutoff && !recent.has(c.id)) recent.set(c.id, c.date);
  for (const s of all) if (!s.changed && recent.has(s.id)) s.changed = recent.get(s.id);

  // Write packs
  for (const f of await fs.readdir(OUT)) if (/^(far|t49|aim)-.*\.json$|^pcg\.json$/.test(f)) await fs.unlink(path.join(OUT, f));
  const manifestPacks = [];
  for (const p of packs) {
    const body = JSON.stringify({ id: p.id, doc: p.doc, part: p.part, title: p.title, sections: p.sections });
    await fs.writeFile(path.join(OUT, p.file), body);
    manifestPacks.push({ id: p.id, doc: p.doc, part: p.part, title: p.title, file: p.file, hash: hash(body), count: p.sections.length, bytes: body.length });
  }
  await writeJSON(path.join(OUT, 'toc.json'), { far: farToc.filter((t) => t.doc === 'far'), t49: farToc.filter((t) => t.doc === 't49'), aim: aimToc, pcg: pcg.map((t) => ({ id: t.id, title: t.title })) });
  await writeJSON(path.join(OUT, 'changes.json'), changes);
  const manifest = {
    version: hash(manifestPacks.map((p) => p.hash).join('')),
    builtAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    partsKey: wantedParts,
    sources: {
      far: { asOf: ecfrAsOf, issued: t14.latest_issue_date, amended: t14.latest_amended_on },
      t49: { asOf: t49.up_to_date_as_of, issued: t49.latest_issue_date },
      aim: { effective: aim.effective, change: aim.change },
    },
    lastChange: newChanges.length ? now : prevManifest?.lastChange || null,
    newChanges: newChanges.length,
    packs: manifestPacks,
    aimImages: aim.imgs,
  };
  await writeJSON(path.join(OUT, 'manifest.json'), manifest);
  const total = manifestPacks.reduce((a, p) => a + p.bytes, 0);
  console.log(`Wrote ${manifestPacks.length} packs, ${all.length} sections, ${(total / 1e6).toFixed(1)} MB; ${newChanges.length} changes.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
