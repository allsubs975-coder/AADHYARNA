/**
 * Catalogue filtering, sorting and URL state.
 *
 * Pure functions with no DOM, framework or runtime data dependencies, so the
 * same logic is used by the catalogue page, the tests, and any future admin
 * tooling. Never treats a missing value as zero and never coerces strings to
 * numbers implicitly.
 *
 * Filter semantics: every active condition must be satisfied (AND).
 * Records with a missing numeric value (null) never satisfy a range filter.
 */

import type { Diamond } from './types';

export type SortId =
  | 'source'
  | 'carat-asc'
  | 'carat-desc'
  | 'color'
  | 'clarity'
  | 'depth-asc'
  | 'table-asc';

export interface FilterState {
  /** Stone ID search (case-insensitive substring). */
  q: string;
  /** Shape family ids. */
  families: string[];
  /** Specific raw shape value; '' = any. */
  shape: string;
  caratMin: number | null;
  caratMax: number | null;
  /** Letter grades (D…Z) and/or the literal 'fancy'. */
  colors: string[];
  clarities: string[];
  polishes: string[];
  symmetries: string[];
  fluorescent: string[];
  /** Raw availability values, e.g. 'YES'. */
  availability: string[];
  report: 'any' | 'yes' | 'no';
  depthMin: number | null;
  depthMax: number | null;
  tableMin: number | null;
  tableMax: number | null;
  sort: SortId;
}

export const SORT_OPTIONS: readonly { id: SortId; label: string }[] = [
  { id: 'source', label: 'Inventory order' },
  { id: 'carat-asc', label: 'Carat: low to high' },
  { id: 'carat-desc', label: 'Carat: high to low' },
  { id: 'color', label: 'Colour' },
  { id: 'clarity', label: 'Clarity' },
  { id: 'depth-asc', label: 'Depth: shallow to deep' },
  { id: 'table-asc', label: 'Table: small to large' },
] as const;

export const CLARITY_LADDER = [
  'FL',
  'IF',
  'VVS1',
  'VVS2',
  'VS1',
  'VS2',
  'SI1',
  'SI2',
  'I1',
  'I2',
  'I3',
] as const;

const COLOR_ORDER = 'DEFGHIJKLMNOPQRSTUVWXYZ';
export const FANCY_COLOR_KEY = 'fancy';

export function emptyFilterState(): FilterState {
  return {
    q: '',
    families: [],
    shape: '',
    caratMin: null,
    caratMax: null,
    colors: [],
    clarities: [],
    polishes: [],
    symmetries: [],
    fluorescent: [],
    availability: [],
    report: 'any',
    depthMin: null,
    depthMax: null,
    tableMin: null,
    tableMax: null,
    sort: 'source',
  };
}

function parseNumber(value: string | null): number | null {
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Reads filter state from a location search string (works with or without '?'). */
export function parseFilters(search: string): FilterState {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const s = emptyFilterState();

  s.q = (params.get('q') ?? '').trim();
  s.shape = (params.get('shape') ?? '').trim();

  s.families = params.getAll('family').filter(Boolean);
  s.colors = params.getAll('color').filter(Boolean);
  s.clarities = params.getAll('clarity').filter(Boolean);
  s.polishes = params.getAll('polish').filter(Boolean);
  s.symmetries = params.getAll('sym').filter(Boolean);
  s.fluorescent = params.getAll('fl').filter(Boolean);
  s.availability = params.getAll('availability').filter(Boolean);

  s.caratMin = parseNumber(params.get('caratMin'));
  s.caratMax = parseNumber(params.get('caratMax'));
  s.depthMin = parseNumber(params.get('depthMin'));
  s.depthMax = parseNumber(params.get('depthMax'));
  s.tableMin = parseNumber(params.get('tableMin'));
  s.tableMax = parseNumber(params.get('tableMax'));

  const report = params.get('report');
  s.report = report === 'yes' || report === 'no' ? report : 'any';

  const sort = params.get('sort');
  s.sort = SORT_OPTIONS.some((o) => o.id === sort) ? (sort as SortId) : 'source';

  return s;
}

/** Serialises only non-default values so URLs stay short and shareable. */
export function serializeFilters(state: FilterState): string {
  const params = new URLSearchParams();
  const push = (key: string, values: readonly string[]) => {
    for (const v of values) if (v) params.append(key, v);
  };

  if (state.q) params.set('q', state.q);
  if (state.shape) params.set('shape', state.shape);
  push('family', state.families);
  push('color', state.colors);
  push('clarity', state.clarities);
  push('polish', state.polishes);
  push('sym', state.symmetries);
  push('fl', state.fluorescent);
  push('availability', state.availability);

  if (state.caratMin !== null) params.set('caratMin', String(state.caratMin));
  if (state.caratMax !== null) params.set('caratMax', String(state.caratMax));
  if (state.depthMin !== null) params.set('depthMin', String(state.depthMin));
  if (state.depthMax !== null) params.set('depthMax', String(state.depthMax));
  if (state.tableMin !== null) params.set('tableMin', String(state.tableMin));
  if (state.tableMax !== null) params.set('tableMax', String(state.tableMax));
  if (state.report !== 'any') params.set('report', state.report);
  if (state.sort !== 'source') params.set('sort', state.sort);

  return params.toString();
}

/* ------------------------------------------------------------------ matching */

function inRange(value: number | null, min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true; // filter not used
  if (value === null) return false; // missing data never satisfies a range
  if (min !== null && value < min) return false;
  if (max !== null && value > max) return false;
  return true;
}

function oneOf(value: string | null, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  if (value === null) return false;
  return allowed.includes(value);
}

export function matchesFilters(d: Diamond, f: FilterState): boolean {
  if (f.q) {
    const needle = f.q.toLowerCase();
    if (!d.id.toLowerCase().includes(needle)) return false;
  }
  if (f.families.length > 0 && !f.families.includes(d.shapeFamily)) return false;
  if (f.shape && d.shape !== f.shape) return false;

  if (!inRange(d.weight, f.caratMin, f.caratMax)) return false;
  if (!inRange(d.depth, f.depthMin, f.depthMax)) return false;
  if (!inRange(d.table, f.tableMin, f.tableMax)) return false;

  if (f.colors.length > 0) {
    const hit = f.colors.some((c) =>
      c.toUpperCase() === FANCY_COLOR_KEY.toUpperCase()
        ? d.colorType === 'fancy'
        : d.colorType === 'letter' && d.color.toUpperCase() === c.toUpperCase(),
    );
    if (!hit) return false;
  }

  if (!oneOf(d.clarity, f.clarities)) return false;
  if (!oneOf(d.polish, f.polishes)) return false;
  if (!oneOf(d.symmetry, f.symmetries)) return false;
  if (!oneOf(d.fluorescence, f.fluorescent)) return false;
  if (!oneOf(d.availability, f.availability)) return false;

  if (f.report === 'yes' && !d.hasReport) return false;
  if (f.report === 'no' && d.hasReport) return false;

  return true;
}

/* -------------------------------------------------------------------- sorting */

function colorRank(d: Diamond): number {
  if (d.colorType !== 'letter') return 1000;
  const idx = COLOR_ORDER.indexOf(d.color.toUpperCase());
  return idx === -1 ? 999 : idx;
}

function clarityRank(d: Diamond): number {
  const idx = CLARITY_LADDER.indexOf(d.clarity.toUpperCase() as (typeof CLARITY_LADDER)[number]);
  return idx === -1 ? 999 : idx;
}

/** Missing numeric values are always sorted last, never treated as zero. */
function numericWithMissingLast(value: number | null): number {
  return value === null ? Number.POSITIVE_INFINITY : value;
}

export function sortDiamonds(list: readonly Diamond[], sort: SortId): Diamond[] {
  const out = [...list];
  switch (sort) {
    case 'carat-asc':
      out.sort((a, b) => a.weight - b.weight);
      break;
    case 'carat-desc':
      out.sort((a, b) => b.weight - a.weight);
      break;
    case 'color':
      out.sort((a, b) => colorRank(a) - colorRank(b) || a.color.localeCompare(b.color));
      break;
    case 'clarity':
      out.sort((a, b) => clarityRank(a) - clarityRank(b));
      break;
    case 'depth-asc':
      out.sort(
        (a, b) => numericWithMissingLast(a.depth) - numericWithMissingLast(b.depth),
      );
      break;
    case 'table-asc':
      out.sort((a, b) => numericWithMissingLast(a.table) - numericWithMissingLast(b.table));
      break;
    case 'source':
    default:
      break; // inventory order is already the array order
  }
  return out;
}

export function applyFilters(
  list: readonly Diamond[],
  f: FilterState,
): Diamond[] {
  return sortDiamonds(
    list.filter((d) => matchesFilters(d, f)),
    f.sort,
  );
}

export function isFilterEmpty(f: FilterState): boolean {
  return (
    f.q === '' &&
    f.shape === '' &&
    f.families.length === 0 &&
    f.colors.length === 0 &&
    f.clarities.length === 0 &&
    f.polishes.length === 0 &&
    f.symmetries.length === 0 &&
    f.fluorescent.length === 0 &&
    f.availability.length === 0 &&
    f.report === 'any' &&
    f.caratMin === null &&
    f.caratMax === null &&
    f.depthMin === null &&
    f.depthMax === null &&
    f.tableMin === null &&
    f.tableMax === null
  );
}

/* --------------------------------------------------------------------- chips */

export type ChipKey =
  | 'q'
  | 'family'
  | 'shape'
  | 'carat'
  | 'color'
  | 'clarity'
  | 'polish'
  | 'sym'
  | 'fl'
  | 'availability'
  | 'report'
  | 'depth'
  | 'table';

export interface ActiveChip {
  /** Stable DOM key. */
  id: string;
  key: ChipKey;
  /** Value for single-value chips; empty for range/search chips. */
  value: string;
  /** Pre-formatted text for chips that are not option-based. */
  text?: string;
}

export function activeChips(f: FilterState): ActiveChip[] {
  const chips: ActiveChip[] = [];
  const add = (key: ChipKey, value = '', text?: string) =>
    chips.push({ id: text ? `${key}:` : `${key}:${value}`, key, value, text });

  if (f.q) add('q', '', `“${f.q}”`);
  if (f.shape) add('shape', f.shape, `Shape: ${f.shape}`);
  for (const fam of f.families) add('family', fam);
  if (f.caratMin !== null || f.caratMax !== null) {
    const lo = f.caratMin !== null ? f.caratMin.toFixed(2) : 'any';
    const hi = f.caratMax !== null ? f.caratMax.toFixed(2) : 'any';
    add('carat', '', `Carat ${lo}–${hi}`);
  }
  for (const c of f.colors) add('color', c, c === FANCY_COLOR_KEY ? 'Colour: Fancy' : `Colour ${c}`);
  for (const c of f.clarities) add('clarity', c, `Clarity ${c}`);
  for (const p of f.polishes) add('polish', p, `Polish ${p}`);
  for (const s of f.symmetries) add('sym', s, `Symmetry ${s}`);
  for (const fl of f.fluorescent) add('fl', fl, `Fluorescence ${fl}`);
  for (const a of f.availability) add('availability', a, 'Availability: available');
  if (f.report !== 'any') {
    add('report', '', f.report === 'yes' ? 'Report recorded' : 'No report recorded');
  }
  if (f.depthMin !== null || f.depthMax !== null) {
    const lo = f.depthMin !== null ? `${f.depthMin}%` : 'any';
    const hi = f.depthMax !== null ? `${f.depthMax}%` : 'any';
    add('depth', '', `Depth ${lo}–${hi}`);
  }
  if (f.tableMin !== null || f.tableMax !== null) {
    const lo = f.tableMin !== null ? `${f.tableMin}%` : 'any';
    const hi = f.tableMax !== null ? `${f.tableMax}%` : 'any';
    add('table', '', `Table ${lo}–${hi}`);
  }
  return chips;
}

/** Returns a new state with one chip removed. Sort preference is preserved. */
export function removeChip(f: FilterState, key: ChipKey, value = ''): FilterState {
  const next: FilterState = { ...f, families: [...f.families], colors: [...f.colors] };
  switch (key) {
    case 'q':
      next.q = '';
      break;
    case 'shape':
      next.shape = '';
      break;
    case 'family':
      next.families = f.families.filter((v) => v !== value);
      break;
    case 'color':
      next.colors = f.colors.filter((v) => v !== value);
      break;
    case 'clarity':
      next.clarities = f.clarities.filter((v) => v !== value);
      break;
    case 'polish':
      next.polishes = f.polishes.filter((v) => v !== value);
      break;
    case 'sym':
      next.symmetries = f.symmetries.filter((v) => v !== value);
      break;
    case 'fl':
      next.fluorescent = f.fluorescent.filter((v) => v !== value);
      break;
    case 'availability':
      next.availability = f.availability.filter((v) => v !== value);
      break;
    case 'carat':
      next.caratMin = null;
      next.caratMax = null;
      break;
    case 'depth':
      next.depthMin = null;
      next.depthMax = null;
      break;
    case 'table':
      next.tableMin = null;
      next.tableMax = null;
      break;
    case 'report':
      next.report = 'any';
      break;
  }
  return next;
}

/** Clears every filter but keeps the chosen sort order. */
export function clearAllFilters(f: FilterState): FilterState {
  return { ...emptyFilterState(), sort: f.sort };
}

/* ------------------------------------------------------------ option counting */

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

export function countByKey(
  list: readonly Diamond[],
  key: 'shapeFamily' | 'shape' | 'color' | 'clarity' | 'polish' | 'symmetry' | 'fluorescence' | 'availability',
): Map<string, number> {
  const map = new Map<string, number>();
  for (const d of list) {
    const value = d[key];
    if (value !== null && value !== undefined && value !== '') bump(map, value);
  }
  return map;
}

export function countFancyColors(list: readonly Diamond[]): number {
  return list.reduce((n, d) => (d.colorType === 'fancy' ? n + 1 : n), 0);
}
