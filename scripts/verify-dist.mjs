/**
 * Static verification of the built site — run after `npm run build`.
 *
 *   npm test          (runs scripts/test-filters.mjs, then this)
 *   node scripts/verify-dist.mjs
 *
 * Checks, without opening a browser:
 *   1. structure      — every route that must exist does
 *   2. privacy        — no grading report numbers or media URLs in dist
 *   3. SEO gating     — canonical / og:url / JSON-LD only once site.url is set
 *   4. hygiene        — no localhost, no absolute filesystem paths
 *   5. per-page       — one <h1>, a title and a meta description everywhere
 *   6. link integrity — every internal href/src resolves to a real file
 *   7. content        — catalogue size, detail-page spot checks, sitemap/robots
 */

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIST = path.join(ROOT, 'dist');
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.txt', '.xml', '.json', '.svg', '.webmanifest']);

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`  FAIL ${name}`);
    console.log(`       ${error.message.split('\n')[0]}`);
  }
}

function section(title) {
  console.log(`\n/${title}`);
}

function fail(message) {
  throw new Error(message);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

if (!fs.existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(2);
}

const allFiles = walk(DIST);
const textFiles = allFiles.filter((f) => TEXT_EXT.has(path.extname(f).toLowerCase()));
const htmlFiles = allFiles.filter((f) => f.endsWith('.html'));

const rel = (f) => path.relative(DIST, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(f, 'utf8');

/* One haystack for the private-data needles. */
const haystack = textFiles.map(read).join('\n');

/* Configuration used by several checks. */
const siteSource = fs.readFileSync(path.join(ROOT, 'src', 'config', 'site.ts'), 'utf8');
const siteUrlMatch = siteSource.match(/url:\s*'([^']*)'/);
const siteUrl = siteUrlMatch ? siteUrlMatch[1] : '';

const privateInventory = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'private', 'inventory.private.json'), 'utf8'),
);
const publicInventory = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'src', 'data', 'inventory.json'), 'utf8'),
);
const diamonds = publicInventory.diamonds ?? publicInventory;

/* ------------------------------------------------------------- 1. structure */

section('structure');
check('dist has the homepage, 404 and robots.txt', () => {
  for (const required of ['index.html', '404.html', 'robots.txt']) {
    if (!fs.existsSync(path.join(DIST, required))) fail(`missing dist/${required}`);
  }
});

const missingDiamondPages = diamonds
  .map((d) => d.id)
  .filter((id) => !fs.existsSync(path.join(DIST, 'diamonds', id, 'index.html')));
check(`all ${diamonds.length} diamond detail pages exist`, () => {
  if (missingDiamondPages.length)
    fail(`${missingDiamondPages.length} missing — first: ${missingDiamondPages[0]}`);
});

const familyIds = [...new Set(diamonds.map((d) => d.shapeFamily))];
const missingFamilyPages = familyIds.filter(
  (id) => !fs.existsSync(path.join(DIST, 'diamonds', 'family', id, 'index.html')),
);
check(`all ${familyIds.length} shape-family pages exist`, () => {
  if (missingFamilyPages.length)
    fail(`${missingFamilyPages.length} missing — first: ${missingFamilyPages[0]}`);
});

for (const page of ['diamonds', 'compare', 'wishlist', 'education', 'about', 'contact', 'privacy', 'terms']) {
  check(`page /${page}/ exists`, () => {
    if (!fs.existsSync(path.join(DIST, page, 'index.html'))) fail(`missing dist/${page}/index.html`);
  });
}

/* ---------------------------------------------------------------- 2. privacy */

section('privacy');

const reportNumbers = privateInventory.records
  .map((r) => (typeof r.report === 'string' ? r.report.trim() : ''))
  .filter((r) => r.length >= 6);
const leakedReports = reportNumbers.filter((r) => haystack.includes(r));
check(`no grading report numbers appear in dist (${reportNumbers.length} scanned)`, () => {
  if (leakedReports.length)
    fail(`${leakedReports.length} leaked — first: ${leakedReports[0]}`);
});

const mediaHosts = [
  ...new Set(
    privateInventory.records
      .map((r) => {
        try {
          return new URL(r.mediaUrl).host;
        } catch {
          return '';
        }
      })
      .filter(Boolean),
  ),
];
const leakedHosts = mediaHosts.filter((host) => haystack.includes(host));
check(`no media host appears in dist (${mediaHosts.join(', ') || 'none recorded'})`, () => {
  if (leakedHosts.length) fail(`leaked host(s): ${leakedHosts.join(', ')}`);
});

const leakedMediaUrls = privateInventory.records
  .map((r) => r.mediaUrl)
  .filter((u) => typeof u === 'string' && u && haystack.includes(u));
check('no full media URL appears in dist', () => {
  if (leakedMediaUrls.length) fail(`${leakedMediaUrls.length} leaked URL(s)`);
});

check('public inventory exposes exactly the published fields', () => {
  const allowed = new Set(publicInventory.meta.publicFields);
  const extra = new Set();
  for (const d of diamonds) {
    for (const key of Object.keys(d)) if (!allowed.has(key)) extra.add(key);
  }
  if (extra.size) fail(`unexpected public fields: ${[...extra].join(', ')}`);
  if (publicInventory.meta.recordCount !== diamonds.length)
    fail('meta.recordCount does not match the record list');
});

check('meta carries no private key names', () => {
  const metaKeys = Object.keys(publicInventory.meta).join(' ').toLowerCase();
  for (const banned of ['report', 'media', 'video', 'url']) {
    if (metaKeys.includes(banned)) fail(`meta contains "${banned}"`);
  }
});

/* -------------------------------------------------------------- 3. SEO gating */

section('seo gating');

const joinedHtml = htmlFiles.map(read).join('\n');

check(siteUrl ? 'canonical URLs are emitted (site.url set)' : 'no canonical URLs while site.url is empty', () => {
  const hasCanonical = /rel="canonical"/.test(joinedHtml);
  if (siteUrl && !hasCanonical) fail('site.url is set but no canonical tag was found');
  if (!siteUrl && hasCanonical) fail('canonical tag present while site.url is empty');
});

check(siteUrl ? 'og:url is emitted (site.url set)' : 'no og:url while site.url is empty', () => {
  const hasOgUrl = /property="og:url"/.test(joinedHtml);
  if (siteUrl && !hasOgUrl) fail('site.url is set but og:url is missing');
  if (!siteUrl && hasOgUrl) fail('og:url present while site.url is empty');
});

check(siteUrl ? 'JSON-LD is emitted (site.url set)' : 'no JSON-LD while site.url is empty', () => {
  const hasJsonLd = joinedHtml.includes('application/ld+json');
  if (siteUrl && !hasJsonLd) fail('site.url is set but no JSON-LD was found');
  if (!siteUrl && hasJsonLd) fail('JSON-LD present while site.url is empty');
});

check('every page carries a title and meta description', () => {
  const bad = [];
  for (const file of htmlFiles) {
    const html = read(file);
    const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? '';
    const desc = html.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1]?.trim() ?? '';
    if (!title || !desc) bad.push(`${rel(file)} (title: ${!!title}, description: ${!!desc})`);
  }
  if (bad.length) fail(`${bad.length} page(s) — first: ${bad[0]}`);
});

check('private pages are marked noindex', () => {
  for (const page of ['compare', 'wishlist']) {
    const html = read(path.join(DIST, page, 'index.html'));
    if (!html.includes('noindex')) fail(`/${page}/ is not noindex`);
  }
});

/* --------------------------------------------------------------- 4. hygiene */

section('hygiene');

check('no localhost or loopback references', () => {
  for (const needle of ['localhost', '127.0.0.1']) {
    if (haystack.includes(needle)) fail(`found "${needle}" in dist output`);
  }
});

check('no absolute filesystem paths in the output', () => {
  for (const needle of ['file:///', 'F:\\AADHYARNA', 'F:/AADHYARNA']) {
    if (haystack.includes(needle)) fail(`found "${needle}" in dist output`);
  }
});

check('no source-map comments shipped', () => {
  if (/(\/\/# sourceMappingURL=|<\/?sourceMappingURL)/.test(haystack))
    fail('sourceMappingURL found in dist');
});

/* ------------------------------------------------------------- 5. per-page */

section('per-page');

check('every page has exactly one <h1>', () => {
  const bad = [];
  for (const file of htmlFiles) {
    const count = (read(file).match(/<h1[\s>]/g) ?? []).length;
    if (count !== 1) bad.push(`${rel(file)}: ${count}`);
  }
  if (bad.length) fail(`${bad.length} page(s) — first: ${bad[0]}`);
});

check('no empty link hrefs', () => {
  const bad = [];
  for (const file of htmlFiles) {
    if (read(file).includes('href=""')) bad.push(rel(file));
  }
  if (bad.length) fail(`${bad.length} page(s) — first: ${bad[0]}`);
});

/* --------------------------------------------------------- 6. link integrity */

section('link integrity');

check('every internal href/src resolves to a generated file', () => {
  const targets = new Set();
  for (const file of htmlFiles) {
    const html = read(file);
    for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)) {
      targets.add(match[1]);
    }
    for (const match of html.matchAll(/srcset="([^"]+)"/g)) {
      for (const part of match[1].split(',')) {
        const url = part.trim().split(/\s+/)[0];
        if (url.startsWith('/')) targets.add(url);
      }
    }
  }

  const broken = [];
  for (const target of targets) {
    const clean = target.split('?')[0];
    const onDisk = path.join(DIST, clean.replace(/^\//, ''));

    let exists;
    if (clean.endsWith('/')) {
      exists = fs.existsSync(path.join(onDisk, 'index.html'));
    } else if (fs.existsSync(onDisk) && fs.statSync(onDisk).isDirectory()) {
      exists = fs.existsSync(path.join(onDisk, 'index.html'));
    } else {
      exists =
        fs.existsSync(onDisk) ||
        fs.existsSync(path.join(onDisk, 'index.html')) ||
        fs.existsSync(`${onDisk}.html`) ||
        fs.existsSync(`${onDisk}.txt`) ||
        fs.existsSync(`${onDisk}.xml`);
    }
    if (!exists) broken.push(target);
  }
  if (broken.length) fail(`${broken.length} broken link(s) — first: ${broken[0]} (${targets.size} checked)`);
});

check('all brand and font assets referenced by the CSS exist', () => {
  const css = allFiles
    .filter((f) => f.endsWith('.css'))
    .map(read)
    .join('\n');
  const refs = new Set();
  for (const match of css.matchAll(/url\(\s*['"]?(\/[^'")]+)['"]?\s*\)/g)) refs.add(match[1]);
  const broken = [...refs].filter((ref) => {
    const clean = ref.split('?')[0].replace(/^\//, '');
    return !fs.existsSync(path.join(DIST, clean));
  });
  if (broken.length) fail(`${broken.length} missing asset(s) — first: ${broken[0]}`);
  if (refs.size === 0) fail('no absolute url() references found in CSS (fonts expected)');
});

/* --------------------------------------------------------------- 7. content */

section('content');

check('catalogue renders every diamond as a card', () => {
  const html = read(path.join(DIST, 'diamonds', 'index.html'));
  const cards = (html.match(/data-diamond-card/g) ?? []).length;
  if (cards !== diamonds.length) fail(`${cards} cards, expected ${diamonds.length}`);
});

check('detail page shows the recorded specifications (spot check)', () => {
  const html = read(path.join(DIST, 'diamonds', 'HM-21', 'index.html'));
  for (const expected of [
    '2.00 ct',
    'OLD MINER',
    'VVS2',
    'Not recorded', // cut is not recorded for this stone
    'On file \u2014 number shared on request',
    'Stone ID',
  ]) {
    if (!html.includes(expected)) fail(`missing "${expected}" on /diamonds/HM-21/`);
  }
});

check('family page counts match the inventory', () => {
  const html = read(path.join(DIST, 'diamonds', 'family', 'oval', 'index.html'));
  const cards = (html.match(/data-diamond-card/g) ?? []).length;
  const expected = diamonds.filter((d) => d.shapeFamily === 'oval').length;
  if (cards !== expected) fail(`${cards} oval cards, expected ${expected}`);
});

check('robots.txt allows crawling', () => {
  const robots = read(path.join(DIST, 'robots.txt'));
  if (!robots.includes('User-agent: *')) fail('missing User-agent line');
  if (!robots.includes('Allow: /')) fail('missing Allow line');
  const sitemapReferenced = robots.includes('Sitemap:');
  if (siteUrl && !sitemapReferenced) fail('site.url is set but robots.txt has no Sitemap line');
  if (!siteUrl && sitemapReferenced) fail('robots.txt references a sitemap while site.url is empty');
});

check('sitemap.xml is either gated off or a complete urlset', () => {
  const sitemapPath = path.join(DIST, 'sitemap.xml');
  if (!fs.existsSync(sitemapPath)) fail('missing dist/sitemap.xml');
  const sitemap = read(sitemapPath);
  if (!siteUrl) {
    if (sitemap.includes('<loc></loc>') || sitemap.includes('<loc>/'))
      fail('sitemap publishes unusable locations while site.url is empty');
    return;
  }
  if (!sitemap.includes('<urlset')) fail('site.url is set but sitemap.xml is not a urlset');
  const locs = [...sitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1]);
  const expected = 7 + familyIds.length + diamonds.length; // static + families + detail
  if (locs.length < expected) fail(`${locs.length} <loc> entries, expected at least ${expected}`);
  if (locs.some((loc) => !loc.startsWith(siteUrl))) fail('a <loc> does not start with site.url');
});

check('wishlist and compare pages announce their browser-only storage', () => {
  const wishlist = read(path.join(DIST, 'wishlist', 'index.html'));
  if (!wishlist.includes('browser')) fail('wishlist page does not explain browser storage');
  const compare = read(path.join(DIST, 'compare', 'index.html'));
  if (!compare.includes('JavaScript')) fail('compare page does not mention JavaScript');
});

check('images are responsive with lazy loading below the fold', () => {
  const home = read(path.join(DIST, 'index.html'));
  const srcsets = (home.match(/srcset="/g) ?? []).length;
  if (srcsets < 2) fail(`homepage has ${srcsets} srcset attribute(s), expected logo + brand image`);
  if (!home.includes('sizes="')) fail('homepage images are missing sizes attributes');
  if (!/loading="lazy"/.test(home)) fail('homepage has no lazy-loaded image');
  if (!/rel="icon" type="image\/webp"/.test(home)) fail('WebP favicon is not linked first');
});

/* ------------------------------------------------------------------ report */

const totalBytes = allFiles.reduce((sum, f) => sum + fs.statSync(f).size, 0);
const largest = allFiles
  .map((f) => ({ f: rel(f), size: fs.statSync(f).size }))
  .sort((a, b) => b.size - a.size)
  .slice(0, 3);

console.log(
  `\ndist: ${allFiles.length} files, ${(totalBytes / 1024 / 1024).toFixed(1)} MB — largest: ` +
    largest.map((l) => `${l.f} ${(l.size / 1024).toFixed(0)} KB`).join(', '),
);

if (failures.length === 0) {
  console.log(`\n${passed} dist checks passed`);
  process.exit(0);
}
console.log(`\n${failures.length} dist check(s) failed (${passed} passed)`);
process.exit(1);
