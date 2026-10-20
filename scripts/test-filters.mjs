/**
 * Unit tests for the pure logic layers: filtering, sorting, URL state, chips,
 * formatting and specification rows.
 *
 *   npm test          (runs this, then scripts/verify-dist.mjs)
 *   node scripts/test-filters.mjs
 *
 * Runs on plain Node — the TypeScript sources use erasable syntax only, so
 * Node's type stripping imports them directly (no build step needed).
 */

import assert from 'node:assert/strict';
import {
  CLARITY_LADDER,
  FANCY_COLOR_KEY,
  SORT_OPTIONS,
  activeChips,
  applyFilters,
  clearAllFilters,
  emptyFilterState,
  isFilterEmpty,
  matchesFilters,
  parseFilters,
  removeChip,
  serializeFilters,
  sortDiamonds,
} from '../src/lib/filters.ts';
import {
  availabilityLabel,
  diamondTitle,
  formatCarat,
  formatPercent,
  orDash,
} from '../src/lib/format.ts';
import { SHAPE_FAMILIES, familyLabel } from '../src/config/shapes.ts';

let passed = 0;
const failures = [];

function check(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    failures.push({ name, error });
  }
}

/* ------------------------------------------------------------------ fixtures */

const base = {
  id: 'T-1',
  availability: 'YES',
  shape: 'OVAL',
  shapeFamily: 'oval',
  weight: 1.5,
  color: 'D',
  colorType: 'letter',
  clarity: 'VS2',
  cut: null,
  polish: 'EX',
  symmetry: 'VG',
  fluorescence: 'None',
  measurements: '8.00-6.00X4.00',
  depth: 61.5,
  table: 57,
  hasReport: true,
};

const d = (patch = {}) => ({ ...base, ...patch });

const state = (patch = {}) => ({ ...emptyFilterState(), ...patch });

const list = [
  d(),
  d({ id: 'T-2', weight: 0.9, color: 'G', clarity: 'IF', shapeFamily: 'round', shape: 'ROUND' }),
  d({
    id: 'T-3',
    weight: 3.2,
    color: 'Fancy Yellow',
    colorType: 'fancy',
    clarity: 'FL',
    polish: null,
    symmetry: null,
    fluorescence: null,
    depth: null,
    table: null,
    hasReport: false,
    availability: 'NO',
  }),
  d({ id: 'T-4', weight: 2, color: 'D', clarity: 'I2', fluorescence: 'Strong', shapeFamily: 'emerald' }),
];

/* -------------------------------------------------------------- matching */

check('empty state matches every record', () => {
  assert.equal(matchesFilters(list[0], emptyFilterState()), true);
  assert.equal(matchesFilters(list[2], emptyFilterState()), true);
  assert.equal(isFilterEmpty(emptyFilterState()), true);
});

check('state with a real filter is not empty; sort alone is a preference', () => {
  assert.equal(isFilterEmpty(state({ caratMin: 1 })), false);
  assert.equal(isFilterEmpty(state({ q: 'x' })), false);
  assert.equal(isFilterEmpty(state({ sort: 'carat-desc' })), true, 'sort is not a filter');
  assert.equal(isFilterEmpty(state({ report: 'any' })), true);
});

check('Stone ID search is a case-insensitive substring', () => {
  assert.equal(matchesFilters(list[0], state({ q: 't-1' })), true);
  assert.equal(matchesFilters(list[1], state({ q: 'T-' })), true);
  assert.equal(matchesFilters(list[0], state({ q: 'nope' })), false);
});

check('family filter matches the family id, any number of them', () => {
  assert.equal(matchesFilters(list[0], state({ families: ['oval'] })), true);
  assert.equal(matchesFilters(list[0], state({ families: ['oval', 'round'] })), true);
  assert.equal(matchesFilters(list[0], state({ families: ['round'] })), false);
});

check('raw shape filter is an exact match', () => {
  assert.equal(matchesFilters(list[0], state({ shape: 'OVAL' })), true);
  assert.equal(matchesFilters(list[0], state({ shape: 'ROUND' })), false);
});

check('carat range is inclusive at both ends', () => {
  assert.equal(matchesFilters(list[0], state({ caratMin: 1.5 })), true);
  assert.equal(matchesFilters(list[0], state({ caratMin: 1.5001 })), false);
  assert.equal(matchesFilters(list[0], state({ caratMax: 1.5 })), true);
  assert.equal(matchesFilters(list[0], state({ caratMax: 1.4999 })), false);
  assert.equal(matchesFilters(list[0], state({ caratMin: 1, caratMax: 2 })), true);
  assert.equal(matchesFilters(list[2], state({ caratMin: 1, caratMax: 2 })), false);
});

check('depth/table filters never match a missing value', () => {
  assert.equal(matchesFilters(list[2], emptyFilterState()), true);
  assert.equal(matchesFilters(list[2], state({ depthMin: 50 })), false);
  assert.equal(matchesFilters(list[2], state({ tableMax: 70 })), false);
  assert.equal(matchesFilters(list[0], state({ depthMin: 61.5, depthMax: 61.5 })), true);
});

check('letter colour filter matches letters only, fancy key matches fancy only', () => {
  assert.equal(matchesFilters(list[0], state({ colors: ['D'] })), true);
  assert.equal(matchesFilters(list[0], state({ colors: ['d'] })), true);
  assert.equal(matchesFilters(list[2], state({ colors: ['D'] })), false);
  assert.equal(matchesFilters(list[2], state({ colors: [FANCY_COLOR_KEY] })), true);
  assert.equal(matchesFilters(list[0], state({ colors: [FANCY_COLOR_KEY] })), false);
  assert.equal(
    matchesFilters(list[1], state({ colors: ['G', FANCY_COLOR_KEY] })),
    true,
    'letter + fancy selections are ORed inside the colour group',
  );
});

check('multi-value filters accept a match inside the group and AND across groups', () => {
  assert.equal(matchesFilters(list[0], state({ clarities: ['VS2', 'IF'] })), true);
  assert.equal(matchesFilters(list[0], state({ clarities: ['IF'] })), false);
  assert.equal(
    matchesFilters(list[0], state({ clarities: ['VS2'], families: ['round'] })),
    false,
    'both groups must match',
  );
});

check('a filter never matches a value that was not recorded', () => {
  assert.equal(matchesFilters(list[2], state({ polishes: ['EX'] })), false);
  assert.equal(matchesFilters(list[2], state({ symmetries: ['VG'] })), false);
  assert.equal(matchesFilters(list[2], state({ fluorescent: ['None'] })), false);
});

check('availability filter uses the raw recorded value', () => {
  assert.equal(matchesFilters(list[0], state({ availability: ['YES'] })), true);
  assert.equal(matchesFilters(list[2], state({ availability: ['YES'] })), false);
  assert.equal(matchesFilters(list[2], state({ availability: ['NO'] })), true);
});

check('report filter', () => {
  assert.equal(matchesFilters(list[0], state({ report: 'yes' })), true);
  assert.equal(matchesFilters(list[0], state({ report: 'no' })), false);
  assert.equal(matchesFilters(list[2], state({ report: 'no' })), true);
  assert.equal(matchesFilters(list[2], state({ report: 'any' })), true);
});

/* ---------------------------------------------------------------- sorting */

check('sort does not mutate the input list', () => {
  const input = [list[0], list[1], list[2]];
  const orderBefore = input.map((x) => x.id);
  sortDiamonds(input, 'carat-desc');
  assert.deepEqual(input.map((x) => x.id), orderBefore);
});

check('carat sorts ascending and descending', () => {
  assert.deepEqual(
    sortDiamonds(list, 'carat-asc').map((x) => x.weight),
    [0.9, 1.5, 2, 3.2],
  );
  assert.deepEqual(
    sortDiamonds(list, 'carat-desc').map((x) => x.weight),
    [3.2, 2, 1.5, 0.9],
  );
});

check('colour sorts letters first, fancy last', () => {
  const ids = sortDiamonds(list, 'color').map((x) => x.id);
  assert.equal(ids[ids.length - 1], 'T-3', 'fancy colour sorts after letters');
  assert.equal(ids[0], 'T-1', 'D colour sorts first');
});

check('clarity follows the grading ladder, unknown grades last', () => {
  const ids = sortDiamonds(list, 'clarity').map((x) => x.id);
  const clarities = sortDiamonds(list, 'clarity').map((x) => x.clarity);
  assert.deepEqual(clarities.slice(0, 3), [
    CLARITY_LADDER[0], // FL
    'IF',
    'VS2',
  ]);
  assert.equal(ids[ids.length - 1], 'T-4', 'I2 is behind VS2');
});

check('missing depth/table sort last, never as zero', () => {
  const ordered = sortDiamonds(list, 'depth-asc');
  assert.equal(ordered[ordered.length - 1].id, 'T-3', 'null depth goes last');
  assert.ok(ordered[0].depth !== null && ordered[1].depth !== null);
  assert.ok(
    (ordered[0].depth ?? 0) <= (ordered[1].depth ?? 0),
    'recorded depths ascend',
  );
});

check('source order keeps the inventory order', () => {
  assert.deepEqual(
    sortDiamonds(list, 'source').map((x) => x.id),
    ['T-1', 'T-2', 'T-3', 'T-4'],
  );
});

check('applyFilters filters and then sorts', () => {
  const out = applyFilters(list, state({ caratMin: 1, sort: 'carat-desc' }));
  assert.deepEqual(out.map((x) => x.id), ['T-3', 'T-4', 'T-1']);
});

check('every sort option is unique and includes the default', () => {
  const ids = SORT_OPTIONS.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('source'));
  assert.equal(emptyFilterState().sort, 'source');
});

/* ------------------------------------------------------------ URL state */

check('parseFilters reads with or without a leading question mark', () => {
  const a = parseFilters('?family=oval&caratMin=1');
  const b = parseFilters('family=oval&caratMin=1');
  assert.deepEqual(a, b);
  assert.deepEqual(a.families, ['oval']);
  assert.equal(a.caratMin, 1);
});

check('parseFilters rejects malformed numbers and unknown enums', () => {
  const s = parseFilters('caratMin=abc&report=maybe&sort=nope&depthMax=');
  assert.equal(s.caratMin, null);
  assert.equal(s.depthMax, null);
  assert.equal(s.report, 'any');
  assert.equal(s.sort, 'source');
});

check('parseFilters collects repeated keys', () => {
  const s = parseFilters('family=oval&family=round&color=D&color=fancy');
  assert.deepEqual(s.families, ['oval', 'round']);
  assert.deepEqual(s.colors, ['D', 'fancy']);
});

check('serialize → parse round-trips a fully populated state', () => {
  const full = state({
    q: 'HM-21',
    shape: 'OVAL',
    families: ['oval', 'rose'],
    caratMin: 1,
    caratMax: 2.5,
    colors: ['D', FANCY_COLOR_KEY],
    clarities: ['VVS2', 'VS1'],
    polishes: ['EX'],
    symmetries: ['VG'],
    fluorescent: ['None'],
    availability: ['YES'],
    report: 'yes',
    depthMin: 55,
    depthMax: 65,
    tableMin: 50,
    tableMax: 62,
    sort: 'carat-desc',
  });
  const query = serializeFilters(full);
  assert.ok(query.includes('family=oval'));
  assert.ok(query.includes('family=rose'));
  assert.deepEqual(parseFilters(query), full);
});

check('serializeFilters omits defaults so URLs stay short', () => {
  assert.equal(serializeFilters(emptyFilterState()), '');
  const onlySort = serializeFilters(state({ sort: 'clarity' }));
  assert.equal(onlySort, 'sort=clarity');
});

/* ------------------------------------------------------------------ chips */

check('activeChips reports every active filter with readable text', () => {
  const chips = activeChips(
    state({
      q: 'hm',
      families: ['oval'],
      caratMin: 1.5,
      colors: ['D', FANCY_COLOR_KEY],
      clarities: ['VS2'],
      report: 'yes',
      availability: ['YES'],
      sort: 'carat-desc',
    }),
  );
  const texts = chips.map((c) => chipText(c));
  assert.deepEqual(texts, [
    '\u201Chm\u201D',
    'Shape: Oval',
    'Carat 1.50\u2013any',
    'Colour D',
    'Colour: Fancy',
    'Clarity VS2',
    'Availability: available',
    'Report recorded',
  ]);
});

function chipText(chip) {
  if (chip.text) return chip.text;
  if (chip.key === 'family') return `Shape: ${familyLabel(chip.value)}`;
  return `${chip.key}: ${chip.value}`;
}

check('activeChips is empty for the default state', () => {
  assert.deepEqual(activeChips(emptyFilterState()), []);
});

check('removeChip clears the right field and keeps sort', () => {
  const full = state({ q: 'x', families: ['oval'], caratMin: 1, caratMax: 3, sort: 'clarity' });

  assert.equal(removeChip(full, 'q').q, '');
  assert.deepEqual(removeChip(full, 'family', 'oval').families, []);

  const noCarat = removeChip(full, 'carat');
  assert.equal(noCarat.caratMin, null);
  assert.equal(noCarat.caratMax, null);

  assert.equal(removeChip(full, 'report').report, 'any');
  assert.equal(removeChip(full, 'sort', '').sort, 'clarity', 'sort is not a chip');
  assert.equal(removeChip(state({ shape: 'OVAL' }), 'shape').shape, '');
  assert.equal(removeChip(state({ depthMin: 55 }), 'depth').depthMin, null);
  assert.equal(removeChip(state({ tableMax: 62 }), 'table').tableMax, null);
});

check('clearAllFilters resets everything except the chosen sort', () => {
  const full = state({ q: 'x', families: ['oval'], caratMin: 1, sort: 'color' });
  const cleared = clearAllFilters(full);
  assert.equal(isFilterEmpty({ ...cleared, sort: 'source' }), true);
  assert.equal(cleared.sort, 'color');
});

/* -------------------------------------------------------- format + specs */

check('format helpers', () => {
  assert.equal(formatCarat(2), '2.00 ct');
  assert.equal(formatCarat(0.5), '0.50 ct');
  assert.equal(formatCarat(12.3), '12.30 ct');
  assert.equal(formatCarat(null), '\u2014');
  assert.equal(formatPercent(61.5), '61.5%');
  assert.equal(formatPercent(null), '\u2014');
  assert.equal(orDash('  EX  '), 'EX');
  assert.equal(orDash(''), '\u2014');
  assert.equal(orDash(0), '0');
  assert.equal(availabilityLabel('YES'), 'Available');
  assert.equal(availabilityLabel('NO'), 'Unavailable');
  assert.equal(availabilityLabel('SOON'), 'SOON');
  assert.equal(availabilityLabel(null), '\u2014');
});

check('diamondTitle reads like a stable product headline', () => {
  const title = diamondTitle({ id: 'HM-21', shape: 'OLD MINER', weight: 2, color: 'D', clarity: 'VVS2' });
  assert.equal(title, '2.00 ct OLD MINER Lab-Grown Diamond \u2014 D/VVS2 (HM-21)');
});

/* Note: diamondSpecs (src/lib/specs.ts) is covered by scripts/verify-dist.mjs
   against the rendered detail pages, because Node's ESM resolver cannot follow
   its extensionless relative imports and the test runs without a bundler. */

check('shape families are unique, labelled and cover the used ids', () => {
  const ids = SHAPE_FAMILIES.map((f) => f.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const family of SHAPE_FAMILIES) {
    assert.ok(family.label && family.label.trim() !== '', `${family.id} needs a label`);
    assert.ok(family.silhouette, `${family.id} needs a silhouette id`);
  }
  assert.equal(familyLabel('oval'), SHAPE_FAMILIES.find((f) => f.id === 'oval').label);
});

/* ------------------------------------------------------------------ report */

for (const { name, error } of failures) {
  console.log(`  FAIL ${name}`);
  console.log(`       ${error.message.split('\n')[0]}`);
}
console.log(`\n${passed}/${passed + failures.length} unit checks passed`);
process.exit(failures.length === 0 ? 0 : 1);
