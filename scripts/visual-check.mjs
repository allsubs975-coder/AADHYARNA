/**
 * Browser verification pass — run against a live preview server.
 *
 *   npm run build && npm run preview          (terminal 1)
 *   npm run check:visual                      (terminal 2)
 *
 * Checks, for every route at a phone and a desktop viewport:
 *   - HTTP status
 *   - browser console errors / uncaught exceptions
 *   - horizontal overflow (page wider than the viewport)
 *   - broken images
 *   - heading and landmark basics (exactly one h1, no duplicate ids)
 *   - accessible names on links, buttons and form controls
 *   - axe-core accessibility scan (serious/critical violations fail)
 *   - full-page screenshots into .visual/
 */

import { chromium } from 'playwright-core';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const AXE_PATH = require.resolve('axe-core/axe.min.js');

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
];
const executablePath = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error('No Chromium/Edge executable found for playwright-core.');
  process.exit(2);
}

const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const OUT = path.resolve('.visual');

const ROUTES = JSON.parse(process.env.ROUTES ?? 'null') ?? [
  '/',
  '/diamonds',
  '/diamonds/family/oval',
  '/diamonds/HM-21',
  '/compare',
  '/wishlist',
  '/education',
  '/about',
  '/contact',
  '/privacy',
  '/terms',
  /* a genuinely unknown path: must answer 404 and render the 404 page */
  '/this-page-does-not-exist',
];

const VIEWPORTS = [
  { id: 'mobile', width: 390, height: 844 },
  { id: 'desktop', width: 1440, height: 900 },
];

const failures = [];

function fail(route, viewport, message) {
  failures.push({ route, viewport, message });
}

async function auditPage(page, route, viewport) {
  // 1. structural checks written directly against the DOM
  const dom = await page.evaluate(() => {
    const out = {};

    out.scrollWidth = document.documentElement.scrollWidth;
    out.innerWidth = window.innerWidth;

    out.brokenImages = [...document.images]
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute('src'));

    out.h1Count = document.querySelectorAll('h1').length;

    const ids = [...document.querySelectorAll('[id]')].map((el) => el.id);
    out.duplicateIds = ids.filter((id, i) => ids.indexOf(id) !== i);

    const accessibleName = (el) => {
      const aria = el.getAttribute('aria-label');
      if (aria && aria.trim()) return true;
      if (el.getAttribute('title')?.trim()) return true;
      if (el.textContent && el.textContent.trim()) return true;
      const img = el.querySelector('img[alt]');
      if (img && img.getAttribute('alt').trim()) return true;
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        return labelledBy
          .split(/\s+/)
          .some((id) => document.getElementById(id)?.textContent?.trim());
      }
      return false;
    };

    out.namelessLinks = [...document.querySelectorAll('a[href]')]
      .filter((a) => !accessibleName(a))
      .map((a) => a.getAttribute('href'));

    out.namelessButtons = [...document.querySelectorAll('button, [role="button"]')]
      .filter((b) => !accessibleName(b))
      .map((b) => b.outerHTML.slice(0, 120));

    out.unlabelledFields = [...document.querySelectorAll('input, select, textarea')]
      .filter((f) => {
        if (f.type === 'hidden') return false;
        if (f.getAttribute('aria-label')?.trim()) return false;
        if (f.getAttribute('aria-labelledby')) return false;
        const id = f.getAttribute('id');
        if (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) return false;
        if (f.closest('label')) return false;
        return true;
      })
      .map((f) => f.outerHTML.slice(0, 120));

    out.title = document.title;
    out.description = document
      .querySelector('meta[name="description"]')
      ?.getAttribute('content');

    return out;
  });

  if (dom.scrollWidth > dom.innerWidth + 1) {
    fail(route, viewport, `horizontal overflow: scrollWidth ${dom.scrollWidth} > innerWidth ${dom.innerWidth}`);
  }
  if (dom.brokenImages.length) fail(route, viewport, `broken images: ${dom.brokenImages.join(', ')}`);
  if (dom.h1Count !== 1) fail(route, viewport, `expected exactly one <h1>, found ${dom.h1Count}`);
  if (dom.duplicateIds.length) fail(route, viewport, `duplicate ids: ${[...new Set(dom.duplicateIds)].join(', ')}`);
  if (dom.namelessLinks.length) fail(route, viewport, `links without accessible name: ${dom.namelessLinks.join(', ')}`);
  if (dom.namelessButtons.length) fail(route, viewport, `buttons without accessible name: ${dom.namelessButtons.length} — ${dom.namelessButtons[0]}`);
  if (dom.unlabelledFields.length) fail(route, viewport, `form fields without label: ${dom.unlabelledFields[0]}`);
  if (!dom.title) fail(route, viewport, 'missing <title>');
  if (!dom.description) fail(route, viewport, 'missing meta description');

  // 2. axe-core
  await page.addScriptTag({ path: AXE_PATH });
  const axe = await page.evaluate(async () => {
    const result = await window.axe.run(document, {
      resultTypes: ['violations'],
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.length,
      target: v.nodes[0]?.target?.join(' '),
    }));
  });

  for (const v of axe) {
    if (v.impact === 'serious' || v.impact === 'critical') {
      fail(route, viewport, `axe ${v.impact}: ${v.id} (${v.nodes} node(s)) at ${v.target}`);
    }
  }

  return axe;
}

const browser = await chromium.launch({ executablePath, headless: true });

fs.mkdirSync(OUT, { recursive: true });

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    isMobile: vp.id === 'mobile',
    hasTouch: vp.id === 'mobile',
  });

  for (const route of ROUTES) {
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));

    const response = await page.goto(BASE + route, { waitUntil: 'networkidle' });
    const status = response?.status() ?? 0;
    const expected = route === '/this-page-does-not-exist' ? 404 : 200;
    if (status !== expected) fail(route, vp.id, `status ${status}, expected ${expected}`);

    // Walk the page so lazily-loaded images and off-screen content settle.
    await page.evaluate(async () => {
      const step = Math.max(400, Math.floor(window.innerHeight * 0.8));
      for (let y = 0; y < document.body.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page
      .waitForFunction(() => [...document.images].every((img) => img.complete), null, {
        timeout: 8000,
      })
      .catch(() => {});
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(150);

    await auditPage(page, route, vp.id);

    /* On the unknown-path route the 404 response itself logs a failed
       resource — that is the expected outcome, not a defect. */
    const realErrors =
      expected === 404
        ? consoleErrors.filter((text) => !text.includes('status of 404'))
        : consoleErrors;
    if (realErrors.length) {
      fail(route, vp.id, `console errors: ${realErrors.slice(0, 3).join(' | ')}`);
    }

    const file = path.join(OUT, `${route === '/' ? 'index' : route.replace(/^\//, '').replace(/\//g, '-')}-${vp.id}.png`);
    await page.screenshot({ path: file, fullPage: true });
    await page.close();
  }

  await context.close();
}

await browser.close();

if (failures.length === 0) {
  console.log(`OK — ${ROUTES.length} routes × ${VIEWPORTS.length} viewports, screenshots in ${OUT}`);
} else {
  console.log(`\n${failures.length} problem(s):`);
  for (const f of failures) console.log(`  [${f.viewport}] ${f.route} — ${f.message}`);
  process.exit(1);
}
