// Opens the built app in a headless browser at iPad Mini size and checks the
// things that matter most. The nightly workflow refuses to publish if this fails.
// Usage: node tests/smoke.mjs http://localhost:4173/far-aim/
import { chromium } from 'playwright';

const BASE = process.argv[2] || 'http://localhost:4173/far-aim/';
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); else console.log('ok  ', msg); };

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1133, height: 744 }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check(await page.isVisible('.wordmark'), 'Home screen renders');

  await page.goto(BASE + '#/s/91.155');
  await page.waitForSelector('.doc-body table', { timeout: 10000 });
  check((await page.textContent('.sec-title')).includes('VFR weather minimums'), '91.155 opens with its title');
  check((await page.$$('.doc-body table tr')).length > 10, '91.155 weather minimums table has rows');

  await page.goto(BASE + '#/s/aim-3-2-3');
  await page.waitForSelector('.doc-body li', { timeout: 10000 });
  check((await page.textContent('.sec-title')).includes('Class B'), 'AIM 3-2-3 opens');

  await page.goto(BASE + '#/p/61');
  await page.waitForSelector('.sp-row', { timeout: 10000 });
  check((await page.$$('.sp-row')).length >= 8, 'Part 61 shows its subparts');

  await page.goto(BASE + '#/search?q=flight%20review');
  await page.waitForSelector('.result', { timeout: 30000 });
  const top = await page.$$eval('.result .num', (e) => e.slice(0, 5).map((x) => x.textContent));
  check(top.some((t) => t.includes('61.56')), `Search "flight review" finds 61.56 (got ${top.join(', ')})`);

  check(errors.length === 0, `No script errors (${errors.slice(0, 3).join(' | ')})`);
} catch (e) {
  failures.push('Smoke test crashed: ' + e.message);
}
await browser.close();

if (failures.length) {
  console.error('\nSmoke test FAILED:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('\nSmoke test passed.');
