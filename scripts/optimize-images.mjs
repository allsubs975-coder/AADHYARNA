#!/usr/bin/env node
/**
 * AADHYARNA image optimisation
 * ============================================================================
 * Regenerates every raster asset the site ships, using headless Chromium's
 * canvas (no extra npm dependencies, no quality-visible rework of artwork):
 *
 *   - responsive WebP sets for both monogram variants, at exactly the widths
 *     declared in `src/config/brand.ts#logoAssets` (single source of truth)
 *   - a 64px WebP favicon (modern browsers) alongside the PNG fallback
 *   - a correctly-sized 1200x630 JPEG for Open Graph (ivory letterbox)
 *   - lossless in-place PNG re-encoding of the two icons, written ONLY when
 *     at least 10% smaller (otherwise the original stays untouched)
 *
 * The artwork masters are never modified or deleted:
 *   monogram.jpeg (project root), public/brand/monogram-original.jpeg,
 *   public/brand/monogram.webp, public/brand/monogram-on-ink.webp
 *
 * Generated files are skipped when they already exist, so the script is
 * idempotent — run it again only after changing widths/quality in brand.ts,
 * or pass --force to regenerate everything from the masters.
 *
 * USAGE
 *   npm run images:optimize
 *   npm run images:optimize -- --force
 *
 * REPORTS
 *   - files that were generated / skipped / kept as-is (with sizes)
 *   - raster files in public/ that are not covered by a job (future images)
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { logoAssets } from '../src/config/brand.ts';
import { site } from '../src/config/site.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const FORCE = process.argv.includes('--force');

/** WebP quality — visually lossless for flat logo art, small on disk. */
const WEBP_QUALITY = 0.82;
/** JPEG quality for the Open Graph card image. */
const JPEG_QUALITY = 0.78;
/** An in-place PNG rewrite must save at least this much to be accepted. */
const PNG_MIN_GAIN = 0.9;

const EDGE_CANDIDATES = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/microsoft-edge',
  '/usr/bin/microsoft-chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
];

const MIME = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

const toDataUrl = (file) => {
  const ext = path.extname(file).toLowerCase();
  return `data:${MIME[ext]};base64,${fs.readFileSync(file).toString('base64')}`;
};

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** Every output this script owns (relative to public/). */
const GENERATED = [
  ...logoAssets.light.widths.map((w) => `${logoAssets.light.base}-${w}.webp`.replace(/^\//, '')),
  ...logoAssets.onInk.widths.map((w) => `${logoAssets.onInk.base}-${w}.webp`.replace(/^\//, '')),
  'favicon.webp',
  'brand/og-image.jpg',
];

/** Sources (public/ paths) — never overwritten. */
const MASTERS_PUBLIC = [
  'brand/monogram.webp',
  'brand/monogram-on-ink.webp',
  'brand/monogram-original.jpeg',
  'favicon.png',
  'apple-touch-icon.png',
];

const log = [];
const warn = [];

function disk(urlPath) {
  return path.join(PUBLIC, urlPath.replace(/^\//, ''));
}

function planJobs() {
  /** ops grouped by source file → one decode per source. */
  const bySource = new Map();
  const add = (sourceFile, ...ops) => {
    if (!bySource.has(sourceFile)) bySource.set(sourceFile, []);
    bySource.get(sourceFile).push(...ops);
  };

  const setOps = (asset, quality) =>
    asset.widths.map((w) => ({
      out: `${asset.base}-${w}.webp`.replace(/^\//, ''),
      width: w,
      mime: 'image/webp',
      quality,
    }));

  add(path.join(PUBLIC, 'brand', 'monogram.webp'), ...setOps(logoAssets.light, WEBP_QUALITY));
  add(path.join(PUBLIC, 'brand', 'monogram-on-ink.webp'), ...setOps(logoAssets.onInk, WEBP_QUALITY));

  add(
    path.join(PUBLIC, 'favicon.png'),
    { out: 'favicon.webp', width: 64, mime: 'image/webp', quality: WEBP_QUALITY },
    { out: 'favicon.png', width: null, mime: 'image/png', inPlace: true },
  );
  add(
    path.join(PUBLIC, 'apple-touch-icon.png'),
    { out: 'apple-touch-icon.png', width: null, mime: 'image/png', inPlace: true },
  );

  add(path.join(ROOT, 'monogram.jpeg'), {
    out: 'brand/og-image.jpg',
    width: 1200,
    height: 630,
    fit: 'contain',
    bg: site.themeColor,
    mime: 'image/jpeg',
    quality: JPEG_QUALITY,
  });

  return bySource;
}

async function main() {
  const executablePath = EDGE_CANDIDATES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.error('No Chromium/Edge executable found for playwright-core.');
    process.exit(2);
  }

  const pending = planJobs();
  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage();

  try {
    for (const [sourceFile, ops] of pending) {
      if (!fs.existsSync(sourceFile)) {
        warn.push(`source missing, skipped: ${path.relative(ROOT, sourceFile)}`);
        continue;
      }

      const wanted = ops.filter((op) => {
        const outFile = disk(op.out);
        return FORCE || op.inPlace || !fs.existsSync(outFile);
      });
      for (const op of ops) {
        if (!wanted.includes(op)) log.push(`kept     ${op.out} (already generated)`);
      }
      if (wanted.length === 0) continue;

      const { natural, out } = await page.evaluate(
        async ({ src, ops: evalOps }) => {
          const img = new Image();
          img.src = src;
          await img.decode();

          const results = [];
          for (const op of evalOps) {
            const canvas = document.createElement('canvas');
            let width;
            let height;

            if (op.fit === 'contain') {
              width = op.width;
              height = op.height;
            } else if (op.width === null) {
              width = img.naturalWidth;
              height = img.naturalHeight;
            } else {
              width = Math.min(op.width, img.naturalWidth);
              height = Math.round((img.naturalHeight * width) / img.naturalWidth);
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.imageSmoothingQuality = 'high';

            if (op.bg) {
              ctx.fillStyle = op.bg;
              ctx.fillRect(0, 0, width, height);
            }
            if (op.fit === 'contain') {
              const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
              const dw = img.naturalWidth * scale;
              const dh = img.naturalHeight * scale;
              ctx.drawImage(img, (width - dw) / 2, (height - dh) / 2, dw, dh);
            } else {
              ctx.drawImage(img, 0, 0, width, height);
            }

            results.push(canvas.toDataURL(op.mime, op.quality));
          }

          return { natural: [img.naturalWidth, img.naturalHeight], out: results };
        },
        { src: toDataUrl(sourceFile), ops: wanted },
      );

      wanted.forEach((op, i) => {
        const outFile = disk(op.out);
        const base64 = out[i].split(',')[1];
        const bytes = Buffer.from(base64, 'base64');
        if (bytes.length === 0) {
          warn.push(`encoder produced nothing for ${op.out}`);
          return;
        }

        if (op.inPlace) {
          const before = fs.statSync(outFile).size;
          if (bytes.length < before * PNG_MIN_GAIN) {
            fs.writeFileSync(outFile, bytes);
            log.push(`optimised ${op.out}  ${kb(before)} → ${kb(bytes.length)}`);
          } else {
            log.push(`kept     ${op.out}  ${kb(before)} (lossless rewrite gains <10%)`);
          }
          return;
        }

        if (fs.existsSync(outFile) && !FORCE) {
          log.push(`kept     ${op.out} (already generated)`);
          return;
        }
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, bytes);
        const note = op.fit === 'contain' ? `${op.width}x${op.height}` : `w=${op.width}`;
        log.push(`wrote    ${op.out}  ${kb(bytes.length)}  (${note})`);
      });
    }
  } finally {
    await browser.close();
  }

  /* Every declared output must now exist — the site references them. */
  const missing = GENERATED.filter((rel) => !fs.existsSync(disk(rel)));
  if (missing.length) {
    console.error(`Missing generated output(s): ${missing.join(', ')}`);
    process.exit(1);
  }

  /* Future images: anything raster in public/ outside the known set. */
  const known = new Set([...GENERATED, ...MASTERS_PUBLIC]);
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(full) : [full];
    });
  const unlisted = walk(PUBLIC)
    .filter((f) => MIME[path.extname(f).toLowerCase()])
    .map((f) => path.relative(PUBLIC, f).split(path.sep).join('/'))
    .filter((rel) => !known.has(rel));

  console.log('\nImage optimisation report');
  console.log('————————————————————————————————————————————————————');
  for (const line of log) console.log(`  ${line}`);
  if (warn.length) {
    console.log('');
    for (const line of warn) console.log(`  WARN  ${line}`);
  }
  if (unlisted.length) {
    console.log('');
    console.log('  Not covered by an optimisation job (add one, then re-run):');
    for (const rel of unlisted) console.log(`    public/${rel}`);
  }
  console.log(
    `\n  Masters untouched: monogram.jpeg, ${MASTERS_PUBLIC.slice(0, 3).join(', ')}`,
  );
  console.log(`  ${log.length + warn.length} job result(s).\n`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
