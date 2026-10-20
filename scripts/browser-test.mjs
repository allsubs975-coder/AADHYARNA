/**
 * Interaction tests in a real browser (playwright-core + system Edge).
 *
 *   npm run build          # produces dist/
 *   npm run preview        # terminal 1 (or let this script start one)
 *   npm run test:browser   # terminal 2
 *
 * Set BASE_URL to reuse an already-running server; otherwise a preview
 * server is spawned and shut down at the end.
 */

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/microsoft-chromium',
  '/usr/bin/google-chrome',
];
const executablePath = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No Chromium/Edge executable found.');
  process.exit(2);
}

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const started = [];
let failures = 0;
let checks = 0;

function ok(condition, label, detail = '') {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function waitForServer(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status < 500) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

if (!process.env.BASE_URL) {
  const server = spawn('npm.cmd', ['run', 'preview'], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: false,
  });
  started.push(server);
  if (!(await waitForServer(BASE))) {
    console.error(`preview server did not start at ${BASE}`);
    process.exit(2);
  }
}

const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
});
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

const readCount = async () =>
  (await page.locator('[data-result-count]').textContent())?.trim() ?? '';
const visibleCards = () => page.locator('[data-diamond-card]:not([hidden])').count();

console.log('\n/catalogue filtering');
await page.goto(`${BASE}/diamonds`, { waitUntil: 'networkidle' });

ok((await readCount()) === 'Showing 145 of 145 diamonds', 'starts with all 145 diamonds', await readCount());
ok((await visibleCards()) === 145, 'renders 145 visible cards', String(await visibleCards()));

// shape family
await page.locator('#side-fam-oval').check();
await page.waitForTimeout(150);
ok((await readCount()) === 'Showing 8 of 145 diamonds', 'family filter → 8 ovals', await readCount());
ok(page.url().includes('family=oval'), 'URL reflects family', page.url());
ok((await page.locator('#drawer-fam-oval').isChecked()) === true, 'drawer copy stays in sync');

// chip + removal
const chipText = (await page.locator('[data-chips] .chip__label').first().textContent())?.trim();
ok(chipText === 'Shape: Oval', 'chip label reads Shape: Oval', String(chipText));
await page.locator('[data-chips] .chip__remove').first().click();
await page.waitForTimeout(150);
ok((await readCount()) === 'Showing 145 of 145 diamonds', 'removing chip restores all', await readCount());

// carat range
await page.locator('#side-caratMin').fill('3');
await page.waitForTimeout(400);
const afterCarat = await readCount();
const caratCards = await visibleCards();
const caratOk = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('[data-diamond-card]:not([hidden])')];
  return cards.every((c) => Number(c.dataset.weight) >= 3);
});
ok(caratOk && caratCards > 0, `carat ≥ 3 keeps only matching cards (${caratCards})`, afterCarat);
ok(page.url().includes('caratMin=3'), 'URL reflects carat range', page.url());

// search (carat range cleared first so the known Stone ID is in scope)
await page.locator('#side-caratMin').fill('');
await page.waitForTimeout(400);
ok((await readCount()) === 'Showing 145 of 145 diamonds', 'emptying carat restores all', await readCount());
await page.locator('#cat-q').fill('HM-21');
await page.waitForTimeout(450);
ok((await readCount()) === 'Showing 1 of 145 diamonds', 'Stone ID search finds HM-21', await readCount());
ok(page.url().includes('q=HM-21'), 'URL reflects search', page.url());

// clear all
await page.locator('[data-chips] [data-clear]').click();
await page.waitForTimeout(150);
ok((await readCount()) === 'Showing 145 of 145 diamonds', 'clear all resets', await readCount());
ok(!page.url().includes('?'), 'URL cleaned after clear', page.url());

// sorting (CSS order drives the visual order — DOM order stays put)
await page.locator('#cat-sort').selectOption('carat-desc');
await page.waitForTimeout(250);
const ranked = await page.evaluate(() =>
  [...document.querySelectorAll('[data-diamond-card]:not([hidden])')]
    .map((el) => ({ weight: Number(el.dataset.weight), order: Number(el.style.order || 0) }))
    .sort((a, b) => a.order - b.order),
);
ok(
  ranked.length > 1 && ranked[0].weight >= ranked[1].weight,
  `sort carat-desc orders ${ranked[0]?.weight} ≥ ${ranked[1]?.weight}`,
);
ok(
  ranked.length > 2 && ranked[1].weight >= ranked[2].weight,
  `sort carat-desc third card ${ranked[1]?.weight} ≥ ${ranked[2]?.weight}`,
);

// deep link
await page.goto(`${BASE}/diamonds?family=rose&caratMin=1`, { waitUntil: 'networkidle' });
await page.waitForTimeout(200);
const deepCount = await readCount();
ok((await visibleCards()) > 0 && (await visibleCards()) < 145, 'deep-linked filters apply on load', deepCount);
ok((await page.locator('#side-fam-rose').isChecked()) === true, 'deep-linked checkbox state restored');

console.log('\n/family landing page');
await page.goto(`${BASE}/diamonds/family/oval/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(150);
ok((await readCount()) === 'Showing 8 of 145 diamonds', 'family page pre-filtered', await readCount());
await page.locator('#side-fam-oval').uncheck();
await page.waitForURL(`${BASE}/diamonds`, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(250);
ok(page.url().replace(/[?#].*$/, '') === `${BASE}/diamonds`, 'unchecking family leaves the family path', page.url());
ok((await readCount()) === 'Showing 145 of 145 diamonds', 'all diamonds shown after unchecking', await readCount());

console.log('\n/mobile filter drawer');
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const mpage = await mobile.newPage();
mpage.on('pageerror', (e) => consoleErrors.push(`mobile pageerror: ${e.message}`));
await mpage.goto(`${BASE}/diamonds`, { waitUntil: 'networkidle' });
await mpage.locator('[data-filters-open]').click();
await mpage.waitForTimeout(200);
ok(await mpage.locator('[data-filters-dialog]').evaluate((d) => d.open), 'drawer opens');
await mpage.locator('#drawer-fam-rose').check();
await mpage.waitForTimeout(200);
await mpage.locator('[data-filters-dialog] button[type="submit"]').click();
await mpage.waitForTimeout(300);
ok(!(await mpage.locator('[data-filters-dialog]').evaluate((d) => d.open)), 'Apply closes the drawer');
const mcount = (await mpage.locator('[data-result-count]').textContent())?.trim();
ok(mcount === 'Showing 7 of 145 diamonds', 'drawer filter applies', String(mcount));
await mobile.close();

console.log('\n/wishlist + compare');
await page.goto(`${BASE}/diamonds`, { waitUntil: 'networkidle' });
const firstId = await page.locator('[data-diamond-card]').first().getAttribute('data-id');
await page.locator(`[data-wishlist-toggle="${firstId}"]`).click();
await page.waitForTimeout(120);
const pressed = await page.locator(`[data-wishlist-toggle="${firstId}"]`).getAttribute('aria-pressed');
ok(pressed === 'true', `wishlist toggle pressed for ${firstId}`, String(pressed));
const wishCount = await page.locator('[data-wishlist-count]').first().textContent();
ok(wishCount?.trim() === '1', 'header wishlist count updates', String(wishCount));

for (let i = 0; i < 5; i += 1) {
  const id = await page.locator('[data-diamond-card]').nth(i).getAttribute('data-id');
  await page.locator(`[data-compare-toggle="${id}"]`).click();
  await page.waitForTimeout(60);
}
const compared = await page.locator('[data-compare-toggle][aria-pressed="true"]').count();
ok(compared === 4, `compare list caps at 4 (got ${compared})`);
const toast = await page.locator('[data-toast]').textContent();
ok((toast ?? '').includes('compare up to 4'), 'cap feedback shown', String(toast));

console.log('\n/wishlist page');
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/diamonds`, { waitUntil: 'networkidle' });
for (const i of [0, 1]) {
  const id = await page.locator('[data-diamond-card]').nth(i).getAttribute('data-id');
  await page.locator(`[data-wishlist-toggle="${id}"]`).click();
  await page.waitForTimeout(80);
}
await page.goto(`${BASE}/wishlist`, { waitUntil: 'networkidle' });
await page.waitForTimeout(250);
ok((await readCount()) === 'Showing 2 of 2 diamonds', 'wishlist lists the saved diamonds', await readCount());
ok((await visibleCards()) === 2, 'two saved cards visible', String(await visibleCards()));

const savedFirst = await page
  .locator('[data-diamond-card]:not([hidden])')
  .first()
  .getAttribute('data-id');
await page.locator(`[data-wishlist-toggle="${savedFirst}"]`).click();
await page.waitForTimeout(250);
ok((await readCount()) === 'Showing 1 of 1 diamonds', 'unsaving updates the list live', await readCount());

const savedLast = await page
  .locator('[data-diamond-card]:not([hidden])')
  .first()
  .getAttribute('data-id');
await page.locator(`[data-wishlist-toggle="${savedLast}"]`).click();
await page.waitForTimeout(250);
ok(await page.locator('[data-empty-state]').isVisible(), 'empty state appears when nothing is saved');
const emptyTitle = (await page.locator('[data-empty-title]').textContent())?.trim();
ok(emptyTitle === 'Nothing saved yet', 'saved-specific empty copy', String(emptyTitle));

console.log('\n/compare page');
await page.evaluate(() => localStorage.clear());
await page.goto(`${BASE}/diamonds`, { waitUntil: 'networkidle' });
for (const i of [0, 1]) {
  const id = await page.locator('[data-diamond-card]').nth(i).getAttribute('data-id');
  await page.locator(`[data-compare-toggle="${id}"]`).click();
  await page.waitForTimeout(80);
}
await page.goto(`${BASE}/compare/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(250);
const compareCount = (await page.locator('[data-compare-status]').textContent())?.trim();
ok(compareCount === 'Comparing 2 of 4 diamonds', 'compare count reads correctly', String(compareCount));
ok(await page.locator('[data-compare-table]').isVisible(), 'comparison table visible');
ok(
  (await page.locator('th[data-col]:not([hidden])').count()) === 2,
  'exactly two columns shown',
  String(await page.locator('th[data-col]:not([hidden])').count()),
);

const removeId = await page.locator('th[data-col]:not([hidden])').first().getAttribute('data-col');
await page.locator(`[data-compare-remove="${removeId}"]`).click();
await page.waitForTimeout(250);
const afterRemove = (await page.locator('[data-compare-status]').textContent())?.trim();
ok(afterRemove === 'Comparing 1 of 4 diamonds', 'removing a column updates the count', String(afterRemove));
ok(
  (await page.locator('th[data-col]:not([hidden])').count()) === 1,
  'one column left after removal',
);

console.log('\n/console');
ok(consoleErrors.length === 0, 'no console errors during interaction', consoleErrors.slice(0, 3).join(' | '));

await browser.close();
for (const s of started) {
  try {
    process.kill(s.pid);
  } catch {
    /* already gone */
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
