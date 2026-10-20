/**
 * Public product data types.
 *
 * These fields are the ONLY product information that may reach the browser.
 * Private fields (grading report numbers, third-party media URLs, raw source
 * values, review flags) live in `private/inventory.private.json`, are never
 * imported by site code, and are asserted against at build time by
 * `src/lib/inventory.ts`.
 *
 * PRICING (future): when real prices are approved for public display, add
 *   `price?: number | null;`  and `currency?: string;`
 * to this interface, populate them in `scripts/import-inventory.mjs`, and set
 * `features.price = true`. No other change is required — cards, detail and
 * comparison already read `price` through the shared `Price` component.
 */
export interface Diamond {
  /** Stone ID — unique product identifier and URL segment. */
  id: string;
  /** Raw availability value from the inventory (e.g. "YES"). */
  availability: string;
  /** Raw shape string from the inventory (e.g. "OLD MINER"). */
  shape: string;
  /** Shape family id — see src/config/shapes.ts. */
  shapeFamily: string;
  /** Carat weight. */
  weight: number;
  /** Colour, whitespace-normalised (letter grade or fancy colour name). */
  color: string;
  colorType: 'letter' | 'fancy';
  clarity: string;
  /** Cut grade, or null when not recorded / not a recognised grade. */
  cut: string | null;
  polish: string | null;
  symmetry: string | null;
  fluorescence: string | null;
  /** Measurements exactly as recorded in the source inventory. */
  measurements: string;
  /** Depth percentage, or null when the source value is 0 / implausible. */
  depth: number | null;
  /** Table percentage, or null when the source value is 0 / implausible. */
  table: number | null;
  /** Whether a grading report number is recorded (the number itself is private). */
  hasReport: boolean;
  /** Reserved for future approved price data — absent while `features.price` is off. */
  price?: number | null;
  currency?: string;
}

export interface InventoryMeta {
  /** ISO timestamp of the last successful import. */
  generatedAt: string;
  /** Source workbook file name only — never an absolute path. */
  sourceFile: string;
  recordCount: number;
  /** Public field names, for transparency about what is published. */
  publicFields: readonly string[];
}

export interface PublicInventory {
  meta: InventoryMeta;
  diamonds: Diamond[];
}
