#!/usr/bin/env node
/**
 * AADHYARNA inventory import
 * ============================================================================
 * Reads the owner's Excel stock list and generates:
 *
 *   src/data/inventory.json            PUBLIC  — the only product data shipped
 *                                          to the browser (whitelisted fields).
 *   private/inventory.private.json     PRIVATE — full normalised records plus
 *                                          grading report numbers, third-party
 *                                          media URLs, raw source values and
 *                                          review flags. Never imported by
 *                                          site code (see .gitignore).
 *   reports/inventory-audit.md         Human-readable validation + review list.
 *
 * The source workbook is opened READ-ONLY and is never written to.
 *
 * USAGE
 *   npm run inventory:import                  validate + write all three files
 *   npm run inventory:import -- --dry-run     validate and write the audit
 *                                             report only (no inventory JSON)
 *   npm run inventory:import -- --check-urls  also perform a live HTTP check of
 *                                             every media URL (slower)
 *   npm run inventory:import -- <file.xlsx>   import a different workbook
 *
 * BLOCKING ERRORS (exit 1, no inventory data is written)
 *   - workbook or header row not found
 *   - required column missing (Stone ID, Shape, Weight)
 *   - row with data but no Stone ID
 *   - duplicate Stone ID (exact or case-insensitive)
 *   - missing or non-positive carat weight
 *   - no valid records
 *   - media URL with a protocol other than http/https
 * ============================================================================
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as XLSXNS from 'xlsx';
import { SHAPE_FAMILIES, FALLBACK_FAMILY_ID, familyForShape } from '../src/config/shapes.ts';

const XLSX = XLSXNS.default ?? XLSXNS;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_SOURCE = path.join(ROOT, 'Ahuja diamonds POLISH STOCK-18.xlsx');
const OUT_PUBLIC = path.join(ROOT, 'src', 'data', 'inventory.json');
const OUT_PRIVATE = path.join(ROOT, 'private', 'inventory.private.json');
const OUT_AUDIT = path.join(ROOT, 'reports', 'inventory-audit.md');

/** Fields allowed to reach the browser. Anything else stays private. */
const PUBLIC_FIELDS = [
  'id',
  'availability',
  'shape',
  'shapeFamily',
  'weight',
  'color',
  'colorType',
  'clarity',
  'cut',
  'polish',
  'symmetry',
  'fluorescence',
  'measurements',
  'depth',
  'table',
  'hasReport',
];

const FIELD_SPECS = [
  { key: 'stoneId', required: true, label: 'Stone ID', patterns: [/^stone\s*id$/i, /^id$/i] },
  { key: 'availability', required: false, label: 'Availability', patterns: [/^avail/i] },
  { key: 'shape', required: true, label: 'Shape', patterns: [/^shape$/i] },
  { key: 'weight', required: true, label: 'Weight', patterns: [/^weight$/i, /^carat/i] },
  { key: 'color', required: true, label: 'Color', patterns: [/^colou?r$/i] },
  { key: 'clarity', required: true, label: 'Clarity', patterns: [/^clarity$/i] },
  { key: 'cut', required: false, label: 'Cut', patterns: [/^cut$/i] },
  { key: 'pol', required: false, label: 'Pol', patterns: [/^pol(ish)?$/i] },
  { key: 'sym', required: false, label: 'Sym', patterns: [/^sym(metry)?$/i] },
  { key: 'fl', required: false, label: 'FL', patterns: [/^fl$/i, /^fluo/i] },
  { key: 'measurements', required: false, label: 'Measurements', patterns: [/^measure/i] },
  { key: 'depth', required: false, label: 'Depth', patterns: [/^depth$/i] },
  { key: 'table', required: false, label: 'Table', patterns: [/^table$/i] },
  { key: 'report', required: false, label: 'Report', patterns: [/^report/i] },
  { key: 'video', required: false, label: 'Diamond Video', patterns: [/diamond\s*video/i, /video/i] },
];

const STANDARD_CUT = new Set(['EX', 'VG', 'G', 'F', 'FAIR', 'POOR', 'AG', 'IDEAL']);
const STANDARD_POLISH = new Set(['EX', 'VG', 'G', 'F', 'FAIR', 'POOR']);
const STANDARD_SYM = new Set(['EX', 'VG', 'G', 'F', 'FAIR', 'POOR']);
const STANDARD_FL = new Set([
  'NONE',
  'FIENT',
  'FAINT',
  'VERY SLIGHT',
  'SLIGHT',
  'MEDIUM',
  'STRONG',
  'VERY STRONG',
]);
const REPORT_PATTERN = /^LG\d{9}$/;
const MEASUREMENT_PATTERN = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)[xX](\d+(?:\.\d+)?)$/;
const MIN_PLAUSIBLE_PCT = 5;
const MAX_PLAUSIBLE_PCT = 100;
const DEPTH_CROSSCHECK_TOLERANCE = 5; // percentage points

/* ----------------------------------------------------------------- helpers */

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const CHECK_URLS = argv.includes('--check-urls');
const SOURCE_FILE = argv.find((a) => !a.startsWith('--')) ?? DEFAULT_SOURCE;

/** blocking errors stop the import; review items are reported, never hidden */
const blocking = [];
const review = []; // { flag, stoneId, detail }
const warnings = [];

const pushReview = (flag, stoneId, detail) => review.push({ flag, stoneId, detail });

function collapse(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function isBlank(value) {
  return collapse(value) === '';
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = collapse(value).replace(/,/g, '');
  if (text === '') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function titleCase(text) {
  return text
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bOf\b/g, 'of');
}

/**
 * Normalises fancy colour strings for display without altering meaning:
 *   'FANCYVIVID BLUE' -> 'Fancy Vivid Blue'
 *   'FancyIntense PINK' -> 'Fancy Intense Pink'
 *   'FANCY  YELLOW'    -> 'Fancy Yellow'
 *   'LIGHT BROWN'      -> 'Light Brown'   (kept as recorded)
 * Letter grades become a single upper-case letter.
 */
function normalizeColor(raw) {
  const text = collapse(raw);
  if (text === '') return { value: '', type: 'letter' };
  if (/^[a-z]$/i.test(text)) return { value: text.toUpperCase(), type: 'letter' };

  const upper = text.toUpperCase();
  if (upper.startsWith('FANCY')) {
    let rest = upper.slice(5).trim();
    const modifier = /^(VIVID|INTENSE|DEEP|LIGHT|DARK|BRIGHT)\b/.exec(rest);
    const parts = ['Fancy'];
    if (modifier) {
      parts.push(titleCase(modifier[1]));
      rest = rest.slice(modifier[0].length).trim();
    }
    if (rest) parts.push(titleCase(rest));
    return { value: parts.join(' '), type: 'fancy' };
  }
  return { value: titleCase(upper), type: 'fancy' };
}

function normalizeListValue(raw) {
  const text = collapse(raw);
  return text === '' ? '' : text.toUpperCase();
}

function normalizeFluorescence(raw) {
  const text = collapse(raw);
  if (text === '') return '';
  if (/^none$/i.test(text)) return 'None';
  return titleCase(text.toUpperCase());
}

function safeUrl(raw) {
  const text = collapse(raw);
  if (text === '') return { url: '', ok: false, reason: 'missing' };
  try {
    const parsed = new URL(text);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      return { url: parsed.toString(), ok: true, reason: '' };
    }
    return { url: text, ok: false, reason: `unsupported protocol "${parsed.protocol}"` };
  } catch {
    return { url: text, ok: false, reason: 'not a parseable URL' };
  }
}

function parseMeasurements(raw) {
  const text = collapse(raw);
  if (text === '') return { raw: '', parsed: null };
  const match = MEASUREMENT_PATTERN.exec(text);
  if (!match) return { raw: text, parsed: null };
  return {
    raw: text,
    parsed: { a: Number(match[1]), b: Number(match[2]), depthMm: Number(match[3]) },
  };
}

function mdTable(headers, rows) {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  return [head, sep, body].join('\n');
}

/* ----------------------------------------------------------- workbook read */

function locateHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 40); i += 1) {
    const row = rows[i] ?? [];
    if (row.some((cell) => /^stone\s*id$/i.test(collapse(cell)))) return i;
  }
  return -1;
}

function mapColumns(headerRow) {
  const mapping = {};
  const ignored = [];
  headerRow.forEach((cell, index) => {
    const header = collapse(cell);
    if (!header) return;
    const spec = FIELD_SPECS.find((f) => f.patterns.some((p) => p.test(header)));
    if (spec) {
      if (mapping[spec.key] === undefined) mapping[spec.key] = { index, header };
      else ignored.push(`${header} (duplicate of ${mapping[spec.key].header})`);
    } else {
      ignored.push(header);
    }
  });
  return { mapping, ignored };
}

/* ------------------------------------------------------------ url checking */

async function checkUrls(items) {
  const results = new Map();
  const queue = [...items];
  const workers = Array.from({ length: 8 }, async () => {
    while (queue.length > 0) {
      const entry = queue.shift();
      if (!entry) break;
      const { stoneId, url } = entry;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: { Range: 'bytes=0-2048', 'User-Agent': 'AADHYARNA-inventory-check/1.0' },
        });
        results.set(stoneId, {
          status: response.status,
          ok: response.ok || response.status === 206,
          contentType: response.headers.get('content-type') ?? '',
        });
        await response.body?.cancel().catch(() => {});
      } catch (error) {
        results.set(stoneId, { status: 0, ok: false, contentType: '', error: String(error) });
      } finally {
        clearTimeout(timer);
      }
    }
  });
  await Promise.all(workers);
  return results;
}

/* -------------------------------------------------------------------- main */

async function main() {
  if (!fs.existsSync(SOURCE_FILE)) {
    blocking.push(`Source workbook not found: ${path.basename(SOURCE_FILE)}`);
    return finish(null, null, {});
  }

  const buffer = fs.readFileSync(SOURCE_FILE);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null });

  const headerIndex = locateHeaderRow(rows);
  if (headerIndex === -1) {
    blocking.push('Header row containing "Stone ID" could not be located.');
    return finish(null, null, {});
  }

  const { mapping, ignored } = mapColumns(rows[headerIndex]);
  for (const spec of FIELD_SPECS) {
    if (spec.required && mapping[spec.key] === undefined) {
      blocking.push(`Required column "${spec.label}" not found in the header row.`);
    }
  }
  if (blocking.length > 0) return finish(null, null, { mapping, ignored, sheetName });

  const dataRows = rows.slice(headerIndex + 1);
  const records = [];
  const seenIds = new Map(); // normalized -> original

  dataRows.forEach((row, offset) => {
    const sourceRow = headerIndex + 2 + offset; // 1-based spreadsheet row
    const cell = (key) => {
      const spec = mapping[key];
      if (!spec) return null;
      return row[spec.index] ?? null;
    };

    const anyContent = row.some((value) => !isBlank(value));
    if (!anyContent) return;

    const stoneId = collapse(cell('stoneId'));
    if (stoneId === '') {
      blocking.push(`Row ${sourceRow}: content present but no Stone ID — record cannot be published.`);
      return;
    }

    const idKey = stoneId.toLowerCase();
    if (seenIds.has(idKey)) {
      blocking.push(
        `Duplicate Stone ID "${stoneId}" in rows ${seenIds.get(idKey)} and ${sourceRow} — resolve before importing.`,
      );
      return;
    }
    seenIds.set(idKey, sourceRow);

    const weightRaw = cell('weight');
    const weight = toNumber(weightRaw);
    if (weight === null || weight <= 0) {
      blocking.push(`Row ${sourceRow} (${stoneId}): carat weight is missing or not a positive number.`);
      return;
    }

    records.push({ stoneId, sourceRow, weight, cells: row });
  });

  if (blocking.length > 0) return finish(null, null, { mapping, ignored, sheetName });
  if (records.length === 0) {
    blocking.push('No valid records found below the header row.');
    return finish(null, null, { mapping, ignored, sheetName });
  }

  /* --------------------------------------------------------- normalisation */

  const publicDiamonds = [];
  const privateRecords = [];
  const stats = {
    rowsRead: dataRows.length,
    records: records.length,
    depthZero: 0,
    tableZero: 0,
    depthImplausible: 0,
    tableImplausible: 0,
    depthMismatch: 0,
    cutMissing: 0,
    cutNonStandard: 0,
    reportMissing: 0,
    reportFormat: 0,
    mediaMissing: 0,
    mediaByType: { viewerPage: 0, video: 0, image: 0, other: 0 },
    mediaHosts: new Map(),
    unmappedShapes: new Map(),
    missingByField: new Map(),
  };

  for (const record of records) {
    const { stoneId, sourceRow } = record;
    const read = (key) => collapse(record.cells[mapping[key]?.index ?? -1]);
    const flags = [];

    const shape = read('shape');
    if (shape === '') {
      blocking.push(`Row ${sourceRow} (${stoneId}): Shape is required but empty.`);
      continue;
    }

    const colorRaw = read('color');
    const color = normalizeColor(colorRaw);
    if (color.value === '') {
      flags.push({ flag: 'color-missing', detail: 'No colour recorded' });
      pushReview('color-missing', stoneId, 'No colour value in source');
    }

    const clarity = normalizeListValue(read('clarity'));
    if (clarity === '') {
      flags.push({ flag: 'clarity-missing', detail: 'No clarity recorded' });
      pushReview('clarity-missing', stoneId, 'No clarity value in source');
    }

    const availability = normalizeListValue(read('availability'));

    const cutRaw = read('cut');
    let cut = null;
    if (cutRaw === '' || cutRaw === '0' || cutRaw === '0.0') {
      stats.cutMissing += 1;
      flags.push({ flag: 'cut-missing', detail: 'Cut not recorded' });
    } else {
      const cutValue = cutRaw.toUpperCase();
      if (STANDARD_CUT.has(cutValue)) {
        cut = cutValue;
      } else {
        // Unrecognised grade: withheld from public display, raw value kept private.
        stats.cutNonStandard += 1;
        flags.push({ flag: 'cut-nonstandard', detail: `Non-standard Cut value "${cutRaw}" — not published` });
        pushReview('cut-nonstandard', stoneId, `Cut value "${cutRaw}" is not a recognised grade — published as unavailable (raw value kept in the private inventory)`);
      }
    }

    let polish = normalizeListValue(read('pol')) || null;
    if (polish && !STANDARD_POLISH.has(polish)) {
      flags.push({ flag: 'polish-nonstandard', detail: `Non-standard Polish value "${polish}" — not published` });
      pushReview('polish-nonstandard', stoneId, `Polish value "${polish}" is not a recognised grade — published as unavailable (raw value kept in the private inventory)`);
      polish = null;
    }

    let symmetry = normalizeListValue(read('sym')) || null;
    if (symmetry && !STANDARD_SYM.has(symmetry)) {
      flags.push({ flag: 'symmetry-nonstandard', detail: `Non-standard Symmetry value "${symmetry}" — not published` });
      pushReview('symmetry-nonstandard', stoneId, `Symmetry value "${symmetry}" is not a recognised grade — published as unavailable (raw value kept in the private inventory)`);
      symmetry = null;
    }

    const fluorescence = normalizeFluorescence(read('fl')) || null;
    if (fluorescence && !STANDARD_FL.has(fluorescence.toUpperCase())) {
      flags.push({ flag: 'fluorescence-nonstandard', detail: `Unusual fluorescence "${fluorescence}"` });
      pushReview('fluorescence-nonstandard', stoneId, `Fluorescence value "${fluorescence}" is not a recognised grade`);
    }

    /* measurements ---------------------------------------------------- */
    const measurement = parseMeasurements(read('measurements'));
    if (measurement.raw === '') {
      flags.push({ flag: 'measurements-missing', detail: 'No measurements recorded' });
      pushReview('measurements-missing', stoneId, 'Measurements column empty');
    } else if (measurement.parsed === null) {
      flags.push({ flag: 'measurements-malformed', detail: `"${measurement.raw}" does not match L-LxD` });
      pushReview('measurements-malformed', stoneId, `Measurements "${measurement.raw}" do not match the expected L-LxD format — left exactly as recorded`);
    }

    /* depth / table --------------------------------------------------- */
    const depthRaw = toNumber(read('depth'));
    const tableRaw = toNumber(read('table'));
    let depth = null;
    let table = null;

    if (depthRaw === null || depthRaw === 0) {
      stats.depthZero += 1;
      flags.push({ flag: 'depth-zero', detail: 'Depth recorded as 0 / empty' });
    } else if (depthRaw < MIN_PLAUSIBLE_PCT || depthRaw > MAX_PLAUSIBLE_PCT) {
      stats.depthImplausible += 1;
      flags.push({ flag: 'depth-implausible', detail: `Depth ${depthRaw} is outside ${MIN_PLAUSIBLE_PCT}-${MAX_PLAUSIBLE_PCT}%` });
      pushReview('depth-implausible', stoneId, `Depth ${depthRaw} is not a usable percentage — published as unavailable`);
    } else {
      depth = depthRaw;
      if (measurement.parsed) {
        const denominator = Math.min(measurement.parsed.a, measurement.parsed.b);
        if (denominator > 0) {
          const computed = (measurement.parsed.depthMm / denominator) * 100;
          if (Math.abs(computed - depthRaw) > DEPTH_CROSSCHECK_TOLERANCE) {
            stats.depthMismatch += 1;
            flags.push({ flag: 'depth-mismatch', detail: `Recorded ${depthRaw}% vs ${computed.toFixed(1)}% from measurements` });
            pushReview('depth-mismatch', stoneId, `Recorded depth ${depthRaw}% differs from ${computed.toFixed(1)}% implied by the recorded measurement — value published as recorded`);
          }
        }
      }
    }

    if (tableRaw === null || tableRaw === 0) {
      stats.tableZero += 1;
      flags.push({ flag: 'table-zero', detail: 'Table recorded as 0 / empty' });
    } else if (tableRaw < MIN_PLAUSIBLE_PCT || tableRaw > MAX_PLAUSIBLE_PCT) {
      stats.tableImplausible += 1;
      flags.push({ flag: 'table-implausible', detail: `Table ${tableRaw} is outside ${MIN_PLAUSIBLE_PCT}-${MAX_PLAUSIBLE_PCT}%` });
      pushReview('table-implausible', stoneId, `Table ${tableRaw} is not a usable percentage — published as unavailable`);
    } else {
      table = tableRaw;
    }

    /* report (private) ------------------------------------------------ */
    const reportRaw = read('report');
    let reportValid = false;
    if (reportRaw === '') {
      stats.reportMissing += 1;
      flags.push({ flag: 'report-missing', detail: 'No grading report number' });
    } else {
      reportValid = REPORT_PATTERN.test(reportRaw);
      if (!reportValid) {
        stats.reportFormat += 1;
        flags.push({ flag: 'report-format', detail: `Report "${reportRaw}" does not match LG#########` });
        pushReview('report-format', stoneId, `Report number "${reportRaw}" does not match the expected LG + 9 digits format`);
      }
    }

    /* media (private) -------------------------------------------------- */
    const media = safeUrl(read('video'));
    if (!media.ok) {
      if (media.reason === 'missing') {
        stats.mediaMissing += 1;
        flags.push({ flag: 'media-missing', detail: 'No media URL recorded' });
        pushReview('media-missing', stoneId, 'No media URL recorded');
      } else {
        blocking.push(`Row ${sourceRow} (${stoneId}): media URL rejected — ${media.reason}.`);
      }
    } else {
      const parsedUrl = new URL(media.url);
      stats.mediaHosts.set(parsedUrl.host, (stats.mediaHosts.get(parsedUrl.host) ?? 0) + 1);
      const p = parsedUrl.pathname.toLowerCase();
      if (p.endsWith('.mp4')) stats.mediaByType.video += 1;
      else if (/\.(html?|jpeg|jpg|png|webp)$/.test(p)) {
        if (/\.(jpeg|jpg|png|webp)$/.test(p)) stats.mediaByType.image += 1;
        else stats.mediaByType.viewerPage += 1;
      } else stats.mediaByType.other += 1;
    }

    /* shape family ----------------------------------------------------- */
    const shapeFamily = familyForShape(shape);
    if (shapeFamily === FALLBACK_FAMILY_ID && !SHAPE_FAMILIES.some((f) => f.shapes.includes(shape))) {
      stats.unmappedShapes.set(shape, (stats.unmappedShapes.get(shape) ?? 0) + 1);
      flags.push({ flag: 'shape-unmapped', detail: `No shape-family mapping for "${shape}"` });
      pushReview('shape-unmapped', stoneId, `Shape "${shape}" is not mapped in src/config/shapes.ts — grouped under "Other Cuts"`);
    }

    for (const [field, value] of [
      ['polish', polish],
      ['symmetry', symmetry],
      ['fluorescence', fluorescence],
      ['clarity', clarity],
      ['availability', availability],
      ['color', color.value],
    ]) {
      if (value === null || value === '') {
        stats.missingByField.set(field, (stats.missingByField.get(field) ?? 0) + 1);
      }
    }

    const weight = record.weight;

    publicDiamonds.push({
      id: stoneId,
      availability,
      shape,
      shapeFamily,
      weight,
      color: color.value,
      colorType: color.type,
      clarity,
      cut,
      polish,
      symmetry,
      fluorescence,
      measurements: measurement.raw,
      depth,
      table,
      hasReport: reportRaw !== '',
    });

    privateRecords.push({
      id: stoneId,
      sourceRow,
      availabilityRaw: read('availability'),
      shapeRaw: shape,
      weightRaw: weightRawValue(record, mapping),
      colorRaw: read('color'),
      clarityRaw: read('clarity'),
      cutRaw: read('cut'),
      polRaw: read('pol'),
      symRaw: read('sym'),
      flRaw: read('fl'),
      measurementsRaw: measurement.raw,
      depthRaw,
      tableRaw,
      report: reportRaw,
      reportValid,
      mediaUrl: media.url,
      mediaOk: media.ok,
      flags,
      shapeFamily,
    });
  }

  if (blocking.length > 0) return finish(null, null, { mapping, ignored, sheetName, stats });

  /* ---------------------------------------------------------- url checking */
  let urlChecks = new Map();
  if (CHECK_URLS) {
    const targets = privateRecords
      .filter((r) => r.mediaOk)
      .map((r) => ({ stoneId: r.id, url: r.mediaUrl }));
    process.stdout.write(`Checking ${targets.length} media URLs… `);
    urlChecks = await checkUrls(targets);
    const failed = [...urlChecks.entries()].filter(([, v]) => !v.ok);
    console.log(`${targets.length - failed.length} OK, ${failed.length} failed`);
    for (const [stoneId, result] of failed) {
      pushReview('media-unreachable', stoneId, `Media URL did not respond (status ${result.status})`);
      const record = privateRecords.find((r) => r.id === stoneId);
      record?.flags.push({ flag: 'media-unreachable', detail: `HTTP ${result.status}` });
    }
  }

  /* ------------------------------------------------------ diff vs previous */
  const diff = compareWithPrevious(privateRecords);

  return finish(
    { meta: buildMeta(), diamonds: publicDiamonds },
    {
      meta: buildMeta(),
      sourceFile: path.basename(SOURCE_FILE),
      records: privateRecords,
      urlChecks: [...urlChecks.entries()],
    },
    { mapping, ignored, sheetName, stats, diff, recordCount: publicDiamonds.length },
  );

  function weightRawValue(rec, map) {
    const spec = map.weight;
    return spec ? rec.cells[spec.index] : rec.weight;
  }
}

function buildMeta() {
  const known = new Set(PUBLIC_FIELDS);
  return {
    generatedAt: new Date().toISOString(),
    sourceFile: path.basename(SOURCE_FILE),
    recordCount: 0, // patched by finish()
    publicFields: PUBLIC_FIELDS.filter((f) => known.has(f)),
  };
}

function compareWithPrevious(current) {
  const diff = { previousExists: false, added: [], removed: [], updated: [], unchanged: 0 };
  if (!fs.existsSync(OUT_PRIVATE)) return diff;

  try {
    const previous = JSON.parse(fs.readFileSync(OUT_PRIVATE, 'utf8'));
    diff.previousExists = true;
    const prevById = new Map((previous.records ?? []).map((r) => [r.id, r]));
    const currById = new Map(current.map((r) => [r.id, r]));

    for (const [id, record] of currById) {
      const before = prevById.get(id);
      if (!before) {
        diff.added.push(id);
        continue;
      }
      const changed = COMPARE_KEYS.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(record[key]));
      if (changed.length > 0) diff.updated.push({ id, fields: changed });
      else diff.unchanged += 1;
    }
    for (const id of prevById.keys()) {
      if (!currById.has(id)) diff.removed.push(id);
    }
  } catch (error) {
    warnings.push(`Could not read the previous private inventory for comparison: ${error.message}`);
  }
  return diff;
}

const COMPARE_KEYS = [
  'availabilityRaw',
  'shapeRaw',
  'weightRaw',
  'colorRaw',
  'clarityRaw',
  'cutRaw',
  'polRaw',
  'symRaw',
  'flRaw',
  'measurementsRaw',
  'depthRaw',
  'tableRaw',
  'report',
  'mediaUrl',
];

/* --------------------------------------------------------------- reporting */

function finish(publicInventory, privateInventory, extra) {
  const info = { ...(extra ?? {}) };
  const stats = info.stats;

  if (publicInventory && privateInventory) {
    publicInventory.meta.recordCount = publicInventory.diamonds.length;
    privateInventory.meta.recordCount = privateInventory.records.length;
  }

  const written = [];
  if (blocking.length === 0 && publicInventory && privateInventory && !DRY_RUN) {
    fs.mkdirSync(path.dirname(OUT_PUBLIC), { recursive: true });
    fs.mkdirSync(path.dirname(OUT_PRIVATE), { recursive: true });
    fs.mkdirSync(path.dirname(OUT_AUDIT), { recursive: true });
    fs.writeFileSync(OUT_PUBLIC, `${JSON.stringify(publicInventory, null, 2)}\n`, 'utf8');
    fs.writeFileSync(OUT_PRIVATE, `${JSON.stringify(privateInventory, null, 2)}\n`, 'utf8');
    written.push(path.relative(ROOT, OUT_PUBLIC), path.relative(ROOT, OUT_PRIVATE));
  }

  /* The audit report is always written (including dry runs and failed runs)
     so the owner can review findings before publishing inventory data. */
  const audit = renderAudit({ info, stats, diff: info.diff, recordCount: info.recordCount });
  fs.mkdirSync(path.dirname(OUT_AUDIT), { recursive: true });
  fs.writeFileSync(OUT_AUDIT, audit, 'utf8');
  written.push(path.relative(ROOT, OUT_AUDIT));

  /* console summary ---------------------------------------------------- */
  const line = (label, value) => console.log(`  ${label.padEnd(30)} ${value}`);
  console.log('\nAADHYARNA inventory import');
  console.log('─'.repeat(60));
  line('Source', path.basename(SOURCE_FILE));
  line('Sheet', info.sheetName ?? '—');
  if (stats) {
    line('Records read', String(stats.records));
    line('Published (public)', String(info.recordCount ?? 0));
    line('Private records', String(privateInventory?.records.length ?? 0));
  }
  line('Mode', DRY_RUN ? 'dry run (audit report only)' : 'write inventory + audit');

  if (stats) {
    console.log('\nData quality');
    line('Depth recorded as 0', String(stats.depthZero));
    line('Table recorded as 0', String(stats.tableZero));
    line('Depth implausible', String(stats.depthImplausible));
    line('Table implausible', String(stats.tableImplausible));
    line('Depth vs measurements mismatch', String(stats.depthMismatch));
    line('Cut missing', `${stats.cutMissing} of ${stats.records}`);
    line('Cut non-standard', String(stats.cutNonStandard));
    line('Report missing', String(stats.reportMissing));
    line('Report format invalid', String(stats.reportFormat));
    line('Media missing', String(stats.mediaMissing));
    if (stats.unmappedShapes.size > 0) {
      line('Unmapped shapes', [...stats.unmappedShapes.keys()].join(', '));
    }
  }

  if (info.diff && info.diff.previousExists) {
    console.log('\nChanges vs previous import');
    line('Added', String(info.diff.added.length));
    line('Updated', String(info.diff.updated.length));
    line('Removed', String(info.diff.removed.length));
    line('Unchanged', String(info.diff.unchanged));
    if (info.diff.removed.length > 0) {
      console.log(`  ! Removed products: ${info.diff.removed.join(', ')}`);
    }
  } else if (info.diff) {
    console.log('\nChanges vs previous import');
    line('Snapshot', 'first import — no previous snapshot');
  }

  if (warnings.length > 0) {
    console.log('\nWarnings');
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (review.length > 0) {
    console.log(`\nReview required: ${review.length} item(s) — see reports/inventory-audit.md`);
  }

  if (blocking.length > 0) {
    console.error(`\nBLOCKED — ${blocking.length} error(s), no inventory data written:`);
    for (const b of blocking) console.error(`  ✗ ${b}`);
    console.error('\nCorrect the source workbook (a copy) and run the import again.');
    process.exit(1);
  }

  if (written.length > 0) {
    console.log('\nWritten');
    for (const w of written) console.log(`  • ${w}`);
  }
  console.log('');
}

function renderAudit({ info, stats, diff, recordCount }) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const lines = [];
  lines.push('# AADHYARNA inventory audit');
  lines.push('');
  lines.push(`Generated: ${now} UTC  ·  Mode: ${DRY_RUN ? 'dry run' : 'import'}`);
  lines.push('');
  lines.push('This file is generated. Do not edit it by hand — run `npm run inventory:import`.');
  lines.push('');

  lines.push('## 1. Summary');
  lines.push('');
  lines.push(
    mdTable(
      ['Item', 'Value'],
      [
        ['Source workbook', `\`${path.basename(SOURCE_FILE)}\` (unmodified)`],
        ['Sheet', `\`${info.sheetName ?? '—'}\``],
        ['Rows read below header', String(stats?.records ?? 0)],
        ['Records published (public)', String(recordCount ?? 0)],
        ['Records stored (private)', String(recordCount ?? 0)],
        ['Blocking errors', String(blocking.length)],
        ['Items requiring review', String(review.length)],
      ],
    ),
  );
  lines.push('');

  lines.push('## 2. Public / private field split');
  lines.push('');
  lines.push('Published to the browser (`src/data/inventory.json`):');
  lines.push('');
  lines.push(PUBLIC_FIELDS.map((f) => `\`${f}\``).join(', '));
  lines.push('');
  lines.push('**Never published** — kept only in `private/inventory.private.json`:');
  lines.push('');
  lines.push(
    '`report` (grading report numbers), `mediaUrl` (third-party video / 360 viewer URLs), all `*Raw` source values, `sourceRow`, `flags`, `reportValid`, `mediaOk`.',
  );
  lines.push('');

  lines.push('## 3. Schema mapping');
  lines.push('');
  const mappedRows = FIELD_SPECS.filter((s) => info.mapping?.[s.key]).map((s) => [
    s.label,
    `\`${info.mapping[s.key].header}\``,
    s.required ? 'required' : 'optional',
  ]);
  lines.push(mdTable(['Logical field', 'Spreadsheet header', 'Requirement'], mappedRows));
  lines.push('');
  if (info.ignored && info.ignored.length > 0) {
    lines.push(`Headers ignored: ${info.ignored.map((h) => `\`${h}\``).join(', ')}`);
    lines.push('');
  }

  lines.push('## 4. Blocking errors');
  lines.push('');
  if (blocking.length === 0) {
    lines.push('None.');
    lines.push('');
  } else {
    for (const b of blocking) lines.push(`- ${b}`);
    lines.push('');
  }

  lines.push('## 5. Data quality');
  lines.push('');
  if (stats) {
    lines.push(
      mdTable(
        ['Check', 'Result'],
        [
          ['Duplicate Stone IDs', 'none (import would stop if any existed)'],
          ['Depth recorded as 0 / empty → published as unavailable', String(stats.depthZero)],
          ['Table recorded as 0 / empty → published as unavailable', String(stats.tableZero)],
          [`Depth outside ${MIN_PLAUSIBLE_PCT}–${MAX_PLAUSIBLE_PCT}% → unavailable`, String(stats.depthImplausible)],
          [`Table outside ${MIN_PLAUSIBLE_PCT}–${MAX_PLAUSIBLE_PCT}% → unavailable`, String(stats.tableImplausible)],
          ['Depth inconsistent with measurements (kept, flagged)', String(stats.depthMismatch)],
          ['Cut not recorded', `${stats.cutMissing} of ${stats.records}`],
          ['Cut value not a recognised grade', String(stats.cutNonStandard)],
          ['Grading report missing', String(stats.reportMissing)],
          ['Grading report format invalid', String(stats.reportFormat)],
          ['Media URL missing', String(stats.mediaMissing)],
        ],
      ),
    );
    lines.push('');
    lines.push(
      `Media URL types: ${stats.mediaByType.viewerPage} interactive viewer page(s), ${stats.mediaByType.video} direct video(s), ${stats.mediaByType.image} still image(s), ${stats.mediaByType.other} other. Hosts: ${[...stats.mediaHosts.entries()].map(([h, n]) => `${h} (${n})`).join(', ')}.`,
    );
    lines.push('');
  }

  lines.push('## 6. Records requiring manual review');
  lines.push('');
  if (review.length === 0) {
    lines.push('None.');
    lines.push('');
  } else {
    const byFlag = new Map();
    for (const item of review) {
      if (!byFlag.has(item.flag)) byFlag.set(item.flag, []);
      byFlag.get(item.flag).push(item);
    }
    lines.push(`${review.length} item(s) across ${byFlag.size} category(ies). No source value has been altered or corrected.`);
    lines.push('');
    for (const [flag, items] of byFlag) {
      lines.push(`### ${flag} (${items.length})`);
      lines.push('');
      for (const item of items) lines.push(`- **${item.stoneId}** — ${item.detail}`);
      lines.push('');
    }
  }

  if (diff && diff.previousExists) {
    lines.push('## 7. Changes vs previous import');
    lines.push('');
    lines.push(
      mdTable(
        ['Change', 'Count', 'Stone IDs'],
        [
          ['Added', String(diff.added.length), diff.added.join(', ') || '—'],
          [
            'Updated',
            String(diff.updated.length),
            diff.updated.map((u) => `${u.id} (${u.fields.join(', ')})`).join('; ') || '—',
          ],
          ['Removed', String(diff.removed.length), diff.removed.join(', ') || '—'],
          ['Unchanged', String(diff.unchanged), '—'],
        ],
      ),
    );
    lines.push('');
    if (diff.removed.length > 0) {
      lines.push(
        '> Removed products are no longer in the source workbook. Their pages are dropped at the next build; saved wishlist/compare entries for them are pruned automatically.',
      );
      lines.push('');
    }
  } else if (diff) {
    lines.push('## 7. Changes vs previous import');
    lines.push('');
    lines.push('First import — no previous snapshot found.');
    lines.push('');
  }

  lines.push('## 8. Updating the inventory');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run inventory:import -- --dry-run   # validate and review first');
  lines.push('npm run inventory:import                # write inventory + audit');
  lines.push('npm run build                           # rebuild the site');
  lines.push('```');
  lines.push('');
  lines.push('The source workbook is opened read-only and is never modified.');
  lines.push('');

  return lines.join('\n');
}

main().catch((error) => {
  console.error('\nInventory import failed unexpectedly:');
  console.error(error);
  process.exit(1);
});
