/**
 * Diamond silhouette artwork.
 *
 * No product photography exists yet, so every diamond is drawn as a
 * fine-line silhouette built from real geometry (see ShapeSilhouette.astro
 * and SilhouetteSprite.astro). The artwork is generated — not traced — so it
 * stays crisp at any size and costs a few hundred bytes per page.
 *
 * When actual product photography arrives, MediaViewer.astro switches to the
 * image path and these silhouettes remain as the loading/fallback state.
 */

import type { SilhouetteId } from '../config/shapes';

export type { SilhouetteId };

type Pt = [number, number];

const CX = 50;
const CY = 50;

function path(points: readonly Pt[]): string {
  return `M${points.map(([x, y]) => `${round(x)} ${round(y)}`).join('L')}Z`;
}

function round(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function regular(count: number, rx: number, ry = rx, rotation = -90): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < count; i += 1) {
    const angle = ((rotation + (360 / count) * i) * Math.PI) / 180;
    pts.push([CX + rx * Math.cos(angle), CY + ry * Math.sin(angle)]);
  }
  return pts;
}

/**
 * Shifts a polygon so the centre of its bounding box sits on (50, 50).
 * Used for odd-sided shapes (a point-up pentagon/triangle is taller above its
 * centre than below it) so every icon looks optically centred in its box.
 */
function centreToBBox(points: readonly Pt[]): Pt[] {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const dx = CX - (Math.min(...xs) + Math.max(...xs)) / 2;
  const dy = CY - (Math.min(...ys) + Math.max(...ys)) / 2;
  return points.map(([x, y]) => [x + dx, y + dy]);
}

function linesBetween(outer: readonly Pt[], inner: readonly Pt[]): string[] {
  const out: string[] = [];
  const n = Math.min(outer.length, inner.length);
  for (let i = 0; i < n; i += 1) {
    const [x1, y1] = outer[i];
    const [x2, y2] = inner[i];
    out.push(`M${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}`);
  }
  return out;
}

function ellipse(rx: number, ry: number, steps = 48): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < steps; i += 1) {
    const a = ((-90 + (360 / steps) * i) * Math.PI) / 180;
    pts.push([CX + rx * Math.cos(a), CY + ry * Math.sin(a)]);
  }
  return pts;
}

function ellipsePath(rx: number, ry: number): string {
  return `M${round(CX - rx)} ${CY}A${rx} ${ry} 0 1 1 ${round(CX + rx)} ${CY}A${rx} ${ry} 0 1 1 ${round(CX - rx)} ${CY}Z`;
}

export interface SilhouetteGeometry {
  /** Main outline of the stone. */
  outline: string;
  /** Optional inner outlines (table, step facets). */
  inner: string[];
  /** Optional connecting facet lines. */
  facets: string[];
}

const GEOMETRY: Record<SilhouetteId, () => SilhouetteGeometry> = {
  round() {
    // Alternating table / mid / girdle vertices give the classic brilliant pattern.
    const table = regular(8, 17, 17, -90);
    const mid = regular(8, 31, 31, -67.5);
    const outer = regular(8, 43, 43, -67.5);
    return {
      outline: ellipsePath(43, 43),
      inner: [path(table)],
      facets: [...linesBetween(table, mid), ...linesBetween(mid, outer)],
    };
  },

  oval() {
    const outer = ellipse(40, 34, 8);
    const table = regular(8, 16, 13, -90);
    return {
      outline: ellipsePath(40, 34),
      inner: [path(table)],
      facets: linesBetween(outer, table),
    };
  },

  cushion() {
    const outer = regular(4, 37, 37, -45);
    const table = regular(4, 17, 17, -45);
    return {
      outline: roundedSquare(14, 14, 72, 72, 20),
      inner: [path(table)],
      facets: linesBetween(outer, table),
    };
  },

  pear() {
    const outline =
      'M50 6C62 22 84 42 84 60A34 34 0 0 1 16 60C16 42 38 22 50 6Z';
    const table = path([
      [50, 34],
      [64, 56],
      [50, 74],
      [36, 56],
    ]);
    return {
      outline,
      inner: [table],
      facets: [
        'M50 6L50 34',
        'M16 60L36 56',
        'M84 60L64 56',
        'M31 86L50 74',
        'M69 86L50 74',
      ],
    };
  },

  marquise() {
    const outline =
      'M50 6C66 22 82 40 82 50S66 78 50 94C34 78 18 60 18 50S34 22 50 6Z';
    const table = path([
      [50, 34],
      [63, 50],
      [50, 66],
      [37, 50],
    ]);
    return {
      outline,
      inner: [table],
      facets: ['M50 6L50 34', 'M50 94L50 66', 'M18 50L37 50', 'M82 50L63 50'],
    };
  },

  step() {
    const outline = path([
      [32, 8],
      [68, 8],
      [92, 32],
      [92, 68],
      [68, 92],
      [32, 92],
      [8, 68],
      [8, 32],
    ]);
    const step1 = path([
      [35, 20],
      [65, 20],
      [80, 35],
      [80, 65],
      [65, 80],
      [35, 80],
      [20, 65],
      [20, 35],
    ]);
    const step2 = path([
      [40, 32],
      [60, 32],
      [68, 40],
      [68, 60],
      [60, 68],
      [40, 68],
      [32, 60],
      [32, 40],
    ]);
    return { outline, inner: [step1, step2], facets: [] };
  },

  hexagon() {
    const outline = regular(6, 40, 44);
    const mid = regular(6, 28, 31);
    const table = regular(6, 16, 18);
    return {
      outline: path(outline),
      inner: [path(mid), path(table)],
      facets: [...linesBetween(outline, mid), ...linesBetween(mid, table)],
    };
  },

  lozenge() {
    const outline: Pt[] = [
      [50, 4],
      [78, 50],
      [50, 96],
      [22, 50],
    ];
    const inner: Pt[] = [
      [50, 24],
      [66, 50],
      [50, 76],
      [34, 50],
    ];
    return {
      outline: path(outline),
      inner: [path(inner)],
      facets: linesBetween(outline, inner),
    };
  },

  trilliant() {
    // Homothetic triangles about the centroid, so the inner cuts read centred.
    const outline: Pt[] = [
      [50, 8],
      [92, 90],
      [8, 90],
    ];
    const mid: Pt[] = [
      [50, 30],
      [75, 79],
      [25, 79],
    ];
    const table: Pt[] = [
      [50, 46],
      [63, 71],
      [37, 71],
    ];
    return {
      outline: path(outline),
      inner: [path(mid), path(table)],
      facets: [...linesBetween(outline, mid), ...linesBetween(mid, table)],
    };
  },

  baguette() {
    return {
      outline: roundedSquare(26, 8, 48, 84, 6),
      inner: [roundedSquare(33, 18, 34, 64, 4)],
      facets: ['M50 18L50 82', 'M33 50L67 50'],
    };
  },

  portrait() {
    return {
      outline: roundedSquare(20, 6, 60, 88, 16),
      inner: [roundedSquare(28, 16, 44, 68, 10)],
      facets: ['M50 16L50 84'],
    };
  },

  rose() {
    const outer = regular(6, 42, 42, -90);
    const mid = regular(6, 27, 27, -60);
    const table = regular(3, 17, 17, -90);
    return {
      outline: ellipsePath(42, 42),
      inner: [path(mid), path(table)],
      facets: [...linesBetween(table, mid), ...linesBetween(mid, outer)],
    };
  },

  criss() {
    return {
      outline: path([
        [50, 4],
        [66, 34],
        [96, 50],
        [66, 66],
        [50, 96],
        [34, 66],
        [4, 50],
        [34, 34],
      ]),
      inner: [path([
        [50, 26],
        [58, 42],
        [74, 50],
        [58, 58],
        [50, 74],
        [42, 58],
        [26, 50],
        [42, 42],
      ])],
      facets: [],
    };
  },

  pentagon() {
    const outline = centreToBBox(regular(5, 42, 44));
    const mid = centreToBBox(regular(5, 28, 30));
    const table = centreToBBox(regular(5, 15, 16));
    return {
      outline: path(outline),
      inner: [path(mid), path(table)],
      facets: [...linesBetween(outline, mid), ...linesBetween(mid, table)],
    };
  },

  novelty() {
    // Sparkle outline: used for letter, animal and other novelty cuts.
    const outline =
      'M50 4C55 30 70 45 96 50C70 55 55 70 50 96C45 70 30 55 4 50C30 45 45 30 50 4Z';
    const inner =
      'M50 26C53 41 59 47 74 50C59 53 53 59 50 74C47 59 41 53 26 50C41 47 47 41 50 26Z';
    return { outline, inner: [inner], facets: [] };
  },
};

function roundedSquare(x: number, y: number, w: number, h: number, r: number): string {
  return [
    `M${round(x + r)} ${round(y)}`,
    `H${round(x + w - r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(x + w)} ${round(y + r)}`,
    `V${round(y + h - r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(x + w - r)} ${round(y + h)}`,
    `H${round(x + r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(x)} ${round(y + h - r)}`,
    `V${round(y + r)}`,
    `A${round(r)} ${round(r)} 0 0 1 ${round(x + r)} ${round(y)}`,
    'Z',
  ].join('');
}

const cache = new Map<SilhouetteId, SilhouetteGeometry>();

export function silhouette(id: SilhouetteId): SilhouetteGeometry {
  const cached = cache.get(id);
  if (cached) return cached;
  const build = GEOMETRY[id] ?? GEOMETRY.novelty;
  const geometry = build();
  cache.set(id, geometry);
  return geometry;
}

/**
 * Inner markup for a <symbol> in the sprite.
 *
 * Presentation attributes are written inline on purpose: document CSS cannot
 * reach inside the shadow tree created by `<use>`, but `currentColor` still
 * inherits from the referencing element — so the artwork takes the text colour
 * of whatever contains it.
 */
export function silhouetteSymbolContent(id: SilhouetteId): string {
  const g = silhouette(id);
  const inner = g.inner
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-opacity=".5" stroke-linejoin="round"/>`,
    )
    .join('');
  const facets = g.facets
    .map(
      (d) =>
        `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1" stroke-opacity=".38" stroke-linejoin="round"/>`,
    )
    .join('');
  return (
    `<path d="${g.outline}" fill="currentColor" fill-opacity=".07" stroke="none"/>` +
    `<path d="${g.outline}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>` +
    inner +
    facets
  );
}

export const ALL_SILHOUETTE_IDS: readonly SilhouetteId[] = [
  'round',
  'cushion',
  'oval',
  'pear',
  'marquise',
  'step',
  'hexagon',
  'lozenge',
  'trilliant',
  'baguette',
  'portrait',
  'rose',
  'criss',
  'pentagon',
  'novelty',
];
