/**
 * Presentation helpers shared by server components and client scripts.
 * Formatting only — these functions never invent or repair data.
 */

const CARAT = (value: number): string => value.toFixed(2);

/** "2" -> "2.00 ct" */
export function formatCarat(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${CARAT(value)} ct`;
}

/** Raw number for compact displays (grids, filters). */
export function formatCaratShort(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : CARAT(value);
}

/** Depth / table are percentages in the source inventory. */
export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}%`;
}

/** Availability stored as YES/NO-style raw values. */
export function availabilityLabel(raw: string | null | undefined): string {
  if (!raw) return '—';
  const v = raw.trim().toUpperCase();
  if (v === 'YES' || v === 'AVAILABLE') return 'Available';
  if (v === 'NO' || v === 'UNAVAILABLE') return 'Unavailable';
  return raw.trim();
}

export const EM_DASH = '—';

/** Any public field may be null/empty — render an em dash, never a fabricated value. */
export function orDash(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return EM_DASH;
  const s = typeof value === 'number' ? String(value) : value.trim();
  return s === '' ? EM_DASH : s;
}

/** Stable, human-friendly headline for a diamond detail page. */
export function diamondTitle(d: {
  id: string;
  shape: string;
  weight: number;
  color: string;
  clarity: string;
}): string {
  return `${d.weight.toFixed(2)} ct ${d.shape} Lab-Grown Diamond — ${d.color}/${d.clarity} (${d.id})`;
}
