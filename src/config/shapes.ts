/**
 * Central shape configuration.
 *
 * The source inventory stores 49 distinct raw shape strings, mostly antique
 * and fancy cuts. `SHAPE_FAMILIES` groups those raw strings into a smaller
 * set of presentable families used by the homepage, filters and silhouettes.
 *
 * ADDING A NEW SHAPE (future inventory):
 *   1. Add the raw string to the matching family's `shapes` array, or
 *   2. Add a new family object (id, label, silhouette, shapes).
 *   Unmapped shapes fall back to `other` and are reported by
 *   `npm run inventory:import` so nothing is ever silently lost.
 *
 * `silhouette` must be one of the ids implemented in `src/lib/silhouettes.ts`
 * (checked at build time — an unknown id fails the build).
 */

export type SilhouetteId =
  | 'round'
  | 'cushion'
  | 'oval'
  | 'pear'
  | 'marquise'
  | 'step'
  | 'hexagon'
  | 'lozenge'
  | 'trilliant'
  | 'baguette'
  | 'portrait'
  | 'rose'
  | 'criss'
  | 'pentagon'
  | 'novelty';

export interface ShapeFamily {
  id: string;
  label: string;
  silhouette: SilhouetteId;
  /** Raw `Shape` values from the spreadsheet that belong to this family. */
  shapes: readonly string[];
}

export const SHAPE_FAMILIES: readonly ShapeFamily[] = [
  {
    id: 'european-cut',
    label: 'European Cut',
    silhouette: 'round',
    shapes: ['European Cut', 'Old European Cut'],
  },
  {
    id: 'old-miner',
    label: 'Old Miner',
    silhouette: 'cushion',
    shapes: ['OLD MINER', 'OLD MINER PEAR', 'OLD MINER HEART', 'OLMINER OCTAGONAL'],
  },
  {
    id: 'portrait',
    label: 'Portrait Cut',
    silhouette: 'portrait',
    shapes: [
      'PORTRAIT CUSHION',
      'PORTRAIT OCTAGONAL',
      'PORTRAIT OVAL',
      'PORTRAIT EMRELD',
      'PORTRAIT PEAR',
      'ROUND PORTRAIT',
    ],
  },
  {
    id: 'oval',
    label: 'Oval',
    silhouette: 'oval',
    shapes: ['MOVAL', 'KRISHNA', 'Oval Brilliant', 'OVAL STEP', 'OVAL STEP CUT', 'STEP CUT-Oval'],
  },
  {
    id: 'rose',
    label: 'Rose Cut',
    silhouette: 'rose',
    shapes: ['ROSE', 'CUSHION ROSE', 'ROSE CUSHION'],
  },
  {
    id: 'ashoka',
    label: 'Ashoka',
    silhouette: 'step',
    shapes: ['ASHOKA', 'EM-ASHOKA', 'ASHOK STAMBH'],
  },
  {
    id: 'hexagonal-octagonal',
    label: 'Hexagonal & Octagonal',
    silhouette: 'hexagon',
    shapes: ['Hexagonal', 'Octagonal'],
  },
  {
    id: 'pear',
    label: 'Pear',
    silhouette: 'pear',
    shapes: ['PEAR', 'STEP CUT-PEAR'],
  },
  {
    id: 'lozenge',
    label: 'Lozenge',
    silhouette: 'lozenge',
    shapes: ['Lozenge'],
  },
  {
    id: 'novelty',
    label: 'Novelty & Letter Cuts',
    silhouette: 'novelty',
    shapes: ['BUTTERFLY', 'HORSE', 'J-LETTER', 'LILY'],
  },
  {
    id: 'briolette',
    label: 'Briolette',
    silhouette: 'pear',
    shapes: ['Briolette'],
  },
  {
    id: 'criss-cut',
    label: 'Criss Cut',
    silhouette: 'criss',
    shapes: ['CRISS CUT'],
  },
  {
    id: 'lotus',
    label: 'Lotus Cut',
    silhouette: 'criss',
    shapes: ['LOTUS'],
  },
  {
    id: 'trilliant',
    label: 'Trilliant',
    silhouette: 'trilliant',
    shapes: ['TRILLIANT'],
  },
  {
    id: 'bgt-fancy',
    label: 'BGT Fancy',
    silhouette: 'trilliant',
    shapes: ['BGT FANCY'],
  },
  {
    id: 'round',
    label: 'Round',
    silhouette: 'round',
    shapes: ['ROUND', 'Round'],
  },
  {
    id: 'portuguese',
    label: 'Portuguese Cut',
    silhouette: 'round',
    shapes: ['PORTUGUESE'],
  },
  {
    id: 'marquise',
    label: 'Marquise',
    silhouette: 'marquise',
    shapes: ['MARQUISE STEP CUT', 'Marquise Brilliant'],
  },
  {
    id: 'emerald',
    label: 'Emerald',
    silhouette: 'step',
    shapes: ['Emerald', 'Emerald Cut'],
  },
  {
    id: 'baguette',
    label: 'Baguette',
    silhouette: 'baguette',
    shapes: ['Baguette', 'Tapered Baguette'],
  },
  {
    id: 'pentagonal',
    label: 'Pentagonal',
    silhouette: 'pentagon',
    shapes: ['PENTAGONAL'],
  },
  {
    id: 'other',
    label: 'Other Cuts',
    silhouette: 'novelty',
    shapes: ['OTHER'],
  },
] as const;

/** Fallback family for shapes that are not mapped yet (reported at import). */
export const FALLBACK_FAMILY_ID = 'other';

/** Raw shape value -> family id. Built once at module load. */
export const SHAPE_FAMILY_BY_SHAPE: Readonly<Record<string, string>> = Object.freeze(
  SHAPE_FAMILIES.reduce<Record<string, string>>((acc, family) => {
    for (const shape of family.shapes) acc[shape] = family.id;
    return acc;
  }, {}),
);

export function familyForShape(rawShape: string): string {
  return SHAPE_FAMILY_BY_SHAPE[rawShape.trim()] ?? FALLBACK_FAMILY_ID;
}

const FAMILY_BY_ID = new Map(SHAPE_FAMILIES.map((f) => [f.id, f]));

export function familyById(id: string): ShapeFamily {
  return FAMILY_BY_ID.get(id) ?? FAMILY_BY_ID.get(FALLBACK_FAMILY_ID)!;
}

export function familyLabel(id: string): string {
  return familyById(id).label;
}

/**
 * Shape families promoted on the homepage "Explore by shape" grid.
 * Ordered by record count (documented, deterministic selection rule).
 * Every card links to the catalogue with that family pre-selected.
 */
export const FEATURED_SHAPE_FAMILIES: readonly string[] = [
  'european-cut',
  'old-miner',
  'portrait',
  'oval',
  'rose',
  'ashoka',
  'hexagonal-octagonal',
  'pear',
  'lozenge',
  'novelty',
] as const;

/**
 * Families not shown as cards on the homepage; rendered as a text list so
 * the homepage stays tidy while the full catalogue remains discoverable.
 */
export const SECONDARY_SHAPE_FAMILIES: readonly string[] = [
  'briolette',
  'criss-cut',
  'lotus',
  'trilliant',
  'bgt-fancy',
  'round',
  'portuguese',
  'marquise',
  'emerald',
  'baguette',
  'pentagonal',
  'other',
] as const;
