/**
 * The specification rows shown on a diamond's detail page and in the
 * comparison table — one definition so both views always agree.
 *
 * Values are formatted straight from the published record: nothing is
 * invented, and missing values read "Not recorded".
 */
import { familyById } from '../config/shapes';
import { availabilityLabel, formatCarat, formatPercent } from './format';
import type { Diamond } from './types';

export interface SpecRow {
  label: string;
  value: string;
  tabular?: boolean;
}

const recorded = (value: string | null): string =>
  value && value.trim() !== '' ? value : 'Not recorded';

export function diamondSpecs(d: Diamond): SpecRow[] {
  const family = familyById(d.shapeFamily);

  return [
    { label: 'Stone ID', value: d.id, tabular: true },
    { label: 'Availability', value: availabilityLabel(d.availability) },
    { label: 'Shape', value: recorded(d.shape) },
    { label: 'Shape family', value: family.label },
    { label: 'Carat', value: formatCarat(d.weight), tabular: true },
    { label: 'Colour', value: recorded(d.color) },
    { label: 'Clarity', value: recorded(d.clarity) },
    { label: 'Cut', value: recorded(d.cut) },
    { label: 'Polish', value: recorded(d.polish) },
    { label: 'Symmetry', value: recorded(d.symmetry) },
    { label: 'Fluorescence', value: recorded(d.fluorescence) },
    { label: 'Measurements', value: recorded(d.measurements), tabular: true },
    { label: 'Depth', value: formatPercent(d.depth), tabular: true },
    { label: 'Table', value: formatPercent(d.table), tabular: true },
    {
      label: 'Grading report',
      value: d.hasReport ? 'On file — number shared on request' : 'No report recorded',
    },
  ];
}
