// Sanity checks run after every nightly fetch. If anything looks wrong
// (a Part shrank, text went missing, a known rule disappeared, or an
// implausible number of sections changed overnight) this exits non-zero
// and the workflow keeps yesterday's data instead of publishing it.
//
// Usage: node scripts/validate-data.mjs [previous-manifest.json] [--force]

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DATA = path.join(ROOT, 'public', 'data');
const prevPath = process.argv.slice(2).find((a) => !a.startsWith('--'));
const FORCE = process.argv.includes('--force');
const problems = [];
const fail = (msg) => problems.push(msg);
const read = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const m = read('manifest.json');
const prev = prevPath && fs.existsSync(prevPath) ? JSON.parse(fs.readFileSync(prevPath, 'utf8')) : null;
const packs = Object.fromEntries(m.packs.map((p) => [p.id, read(p.file)]));
const all = Object.values(packs).flatMap((p) => p.sections);
const byId = new Map(all.map((s) => [s.id, s]));
const text = (id) => (byId.get(id)?.html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// 1. Nothing shrank badly compared with the last good build
if (prev) {
  for (const p of prev.packs) {
    const now = m.packs.find((x) => x.id === p.id);
    if (!now) fail(`Pack ${p.id} (${p.title}) disappeared.`);
    else if (now.count < p.count * 0.9) fail(`Pack ${p.id} shrank from ${p.count} to ${now.count} sections.`);
  }
  const before = prev.packs.reduce((a, p) => a + p.count, 0);
  if (all.length < before * 0.95) fail(`Total sections fell from ${before} to ${all.length}.`);
}

// 2. Sections actually have text
const empty = all.filter((s) => !s.reserved && s.doc !== 'pcg' && !/\[Reserved\]/i.test(s.title) && s.html.replace(/<[^>]+>/g, '').trim().length < 20);
if (empty.length > all.length * 0.03) fail(`${empty.length} sections have almost no text (e.g. ${empty.slice(0, 5).map((s) => s.id).join(', ')}).`);

// 3. Rules every pilot relies on are present and look right
const spot = [
  ['91.155', /statute miles?/i],
  ['91.103', /pilot in command/i],
  ['61.57', /takeoffs and.*landings/i],
  ['61.56', /flight review/i],
  ['91.205', /airspeed indicator/i],
  ['1.1', /Night means/i],
  ['aim-3-2-3', /Class B/],
  ['49cfr830.5', /immediately/i],
  ['21.197', /special flight permit/i],
  ['110.2', /Wet lease/i],
  ['119.1', /does not apply/i],
  ['121.1', /domestic, flag, and supplemental/i],
  ['125.1', /seating configuration of 20 or more/i],
  ['135.1', /commuter or on-demand/i],
];
for (const [id, re] of spot) {
  if (!byId.has(id)) fail(`Section ${id} is missing.`);
  else if (!re.test(text(id))) fail(`Section ${id} no longer contains the expected text (${re}).`);
}
const pcg = packs.pcg?.sections.length || 0;
if (pcg < 1000) fail(`Pilot/Controller Glossary has only ${pcg} terms.`);
const defs = read('defs.json');
if (defs.length < 100) fail(`Only ${defs.length} definitions extracted from 1.1.`);

// 4. Implausibly many changes in one night usually means a parsing problem, not a rule change
const changes = read('changes.json').filter((c) => c.date === m.builtAt.slice(0, 10));
if (!FORCE && changes.length > 250) fail(`${changes.length} sections changed in one run; that looks like a parsing problem.`);

if (problems.length) {
  console.error('Data validation failed:\n- ' + problems.join('\n- '));
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '### Data validation failed\n\n- ' + problems.join('\n- ') + '\n');
  fs.writeFileSync(path.join(ROOT, 'validation-problems.txt'), problems.join('\n'));
  process.exit(1);
}
console.log(`Data looks good: ${all.length} sections, ${defs.length} definitions, ${changes.length} changes this run.`);
